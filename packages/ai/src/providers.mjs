// Model providers behind one function: complete(). All output is untrusted text until validated.
//
// Anthropic Messages API: https://docs.anthropic.com/en/api/messages (moved to https://platform.claude.com/docs/en/api/messages)
//   POST {base}/v1/messages, headers x-api-key and anthropic-version: 2023-06-01; structured output through one forced
//   tool (tools[].input_schema + tool_choice {type:"tool"}); usage.input_tokens / usage.output_tokens.
// OpenAI-compatible Chat Completions: POST {base}/chat/completions, Bearer key, response_format {type:"json_object"},
//   usage.prompt_tokens / usage.completion_tokens.
import { AIError, redact } from './errors.mjs';
import { describeError, request } from './http.mjs';
import { validate } from './schema.mjs';

export const ANTHROPIC_VERSION = '2023-06-01';
export const PROVIDER_KINDS = ['anthropic', 'openai-compatible'];

const trimSlash = (s) => String(s).replace(/\/+$/, '');

// prices: { "<model>": { inputPerMTok, outputPerMTok } } in USD, supplied by the caller. Unknown model -> null.
export function estimateCost({ inputTokens, outputTokens }, model, prices = {}) {
  const p = prices?.[model];
  if (!p || !Number.isFinite(p.inputPerMTok) || !Number.isFinite(p.outputPerMTok)) return null;
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  return (inputTokens * p.inputPerMTok + outputTokens * p.outputPerMTok) / 1e6;
}

// Pulls a JSON object out of model text: plain JSON, a fenced block, or the first balanced {...}.
export function extractJson(text) {
  const t = String(text ?? '').trim();
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = tryParse(t);
  if (v !== undefined) return v;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && (v = tryParse(fence[1].trim())) !== undefined) return v;
  const start = t.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return tryParse(t.slice(start, i + 1));
  }
  return undefined;
}

function configProblems(provider) {
  const p = [];
  if (!provider || typeof provider !== 'object') return ['provider is missing'];
  if (!PROVIDER_KINDS.includes(provider.kind)) p.push(`provider kind must be one of ${PROVIDER_KINDS.join(', ')}`);
  if (!provider.model) p.push('provider model is missing');
  if (!provider.apiKey) p.push('provider apiKey is missing');
  if (provider.kind === 'openai-compatible' && !provider.baseUrl) p.push('an openai-compatible provider needs a baseUrl');
  if (provider.baseUrl && !/^https?:\/\//i.test(provider.baseUrl)) p.push('baseUrl must start with http:// or https://');
  return p;
}

// A message's content is a text, or a list of parts: { type: 'text', text } and { type: 'image', mediaType, data } (data is
// base64). Each provider gets the parts in its own shape; a plain text is passed as it is.
export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
function partsFor(kind, content) {
  if (!Array.isArray(content)) return content;
  return content.map((p) => {
    if (p?.type === 'text') return { type: 'text', text: String(p.text ?? '') };
    if (p?.type === 'image' && IMAGE_MEDIA_TYPES.includes(p.mediaType) && typeof p.data === 'string') {
      return kind === 'anthropic'
        ? { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } }
        : { type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.data}` } };
    }
    throw new AIError('a message part must be { type: "text", text } or { type: "image", mediaType, data }', { code: 'config' });
  });
}
const shaped = (kind, messages) => messages.map((m) => ({ ...m, content: partsFor(kind, m.content) }));

const schemaHint = (schema) => `\n\nReply with one JSON object only, no prose and no code fence, that matches this JSON schema:\n${JSON.stringify(schema)}`;

// One HTTP round trip. Returns { rawText, data, usage, stopReason }.
async function roundTrip(provider, { system, messages, schema, schemaName, maxTokens, temperature }, opts, state) {
  const secrets = [provider.apiKey];
  const common = { fetch: opts.fetch, timeoutMs: opts.timeoutMs, maxRetries: opts.maxRetries, sleep: opts.sleep, baseDelayMs: opts.baseDelayMs, maxDelayMs: opts.maxDelayMs, secrets };
  for (let tries = 0; tries < 3; tries++) {
    let url, headers, body;
    if (provider.kind === 'anthropic') {
      url = `${trimSlash(provider.baseUrl || 'https://api.anthropic.com').replace(/\/v1$/, '')}/v1/messages`;
      headers = { 'content-type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': ANTHROPIC_VERSION };
      body = { model: provider.model, max_tokens: maxTokens, system, messages: shaped('anthropic', messages) };
      if (schema) {
        body.tools = [{ name: schemaName, description: 'Return the result as the arguments of this tool.', input_schema: schema }];
        // Some models refuse a forced tool; then the tool is only offered and the system prompt says to call it.
        if (state.noForcedTool) { body.tool_choice = { type: 'auto' }; body.system = `${system}\n\nReturn your answer by calling the \`${schemaName}\` tool exactly once.`; }
        else body.tool_choice = { type: 'tool', name: schemaName };
      }
      if (temperature !== undefined && !state.noTemperature) body.temperature = temperature;
    } else {
      url = `${trimSlash(provider.baseUrl)}/chat/completions`;
      headers = { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` };
      body = { model: provider.model, max_tokens: maxTokens, messages: [{ role: 'system', content: system + (schema ? schemaHint(schema) : '') }, ...shaped('openai-compatible', messages)] };
      if (schema && !state.noResponseFormat) body.response_format = { type: 'json_object' };
      if (temperature !== undefined && !state.noTemperature) body.temperature = temperature;
    }
    const res = await request(url, { ...common, method: 'POST', headers, body: JSON.stringify(body) });
    if (res.ok) {
      const j = res.json ?? {};
      if (provider.kind === 'anthropic') {
        const blocks = Array.isArray(j.content) ? j.content : [];
        const tool = blocks.find((b) => b.type === 'tool_use');
        const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        let data = tool?.input;
        if (typeof data === 'string') data = extractJson(data);
        if (data === undefined && schema) data = extractJson(text);
        const u = j.usage ?? {};
        const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        return { rawText: data !== undefined ? JSON.stringify(data) : text, data, usage: { inputTokens: u.input_tokens === undefined ? null : inputTokens, outputTokens: u.output_tokens ?? null }, stopReason: j.stop_reason };
      }
      const choice = j.choices?.[0];
      const text = choice?.message?.content;
      const rawText = typeof text === 'string' ? text : Array.isArray(text) ? text.map((p) => p.text ?? '').join('') : '';
      const u = j.usage ?? {};
      return { rawText, data: schema ? extractJson(rawText) : rawText, usage: { inputTokens: u.prompt_tokens ?? null, outputTokens: u.completion_tokens ?? null }, stopReason: choice?.finish_reason };
    }
    const detail = describeError(res, secrets);
    // Some models or servers refuse an optional setting; drop it once and ask again.
    if (res.status === 400 && body.temperature !== undefined && /temperature/i.test(detail)) { state.noTemperature = true; continue; }
    if (res.status === 400 && body.tool_choice?.type === 'tool' && /tool_choice/i.test(detail)) { state.noForcedTool = true; continue; }
    if (res.status === 400 && body.response_format && /response_format|json_object|json mode/i.test(detail)) { state.noResponseFormat = true; continue; }
    throw new AIError(`${provider.kind} answered ${res.status}: ${detail}`, { code: 'http', status: res.status });
  }
  throw new AIError(`${provider.kind} kept refusing the request settings`, { code: 'http' });
}

// complete({ provider, system, messages, schema, maxTokens, temperature, validate, task, onCall, prices, ... })
//   -> { data, usage: { inputTokens, outputTokens, costUsd | null }, model, calls }
// Output is checked against `schema`, then by the optional `validate(data) -> string[]`. Invalid output is sent back
// once with the problems listed; a second failure throws AIError('invalid_output').
export async function complete({ provider, system, messages, schema, schemaName = 'respond', maxTokens = 4096, temperature, validate: semantic, task = 'task', onCall, prices, fetch, timeoutMs = 120000, maxRetries = 3, sleep, baseDelayMs, maxDelayMs } = {}) {
  const bad = configProblems(provider);
  if (bad.length) throw new AIError(`Provider is not usable: ${bad.join('; ')}`, { code: 'config' });
  if (!Array.isArray(messages) || !messages.length) throw new AIError('messages must be a non-empty list', { code: 'config' });
  const opts = { fetch, timeoutMs, maxRetries, sleep, baseDelayMs, maxDelayMs };
  const secrets = [provider.apiKey];
  const state = {};
  const total = { inputTokens: 0, outputTokens: 0, known: true, costUsd: 0, priced: true };
  let convo = [...messages];
  let calls = 0;
  let problems = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0 = Date.now();
    let r;
    try {
      r = await roundTrip(provider, { system, messages: convo, schema, schemaName, maxTokens, temperature }, opts, state);
    } catch (e) {
      onCall?.({ provider: provider.id ?? provider.kind, providerKind: provider.kind, model: provider.model, task, tokensIn: null, tokensOut: null, costUsd: null, ms: Date.now() - t0, ok: false, error: redact(e.message, secrets) });
      throw e;
    }
    calls++;
    const usage = { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens };
    const cost = estimateCost(usage, provider.model, prices ?? provider.prices);
    if (usage.inputTokens === null || usage.outputTokens === null) total.known = false; else { total.inputTokens += usage.inputTokens; total.outputTokens += usage.outputTokens; }
    if (cost === null) total.priced = false; else total.costUsd += cost;
    onCall?.({ provider: provider.id ?? provider.kind, providerKind: provider.kind, model: provider.model, task, tokensIn: usage.inputTokens, tokensOut: usage.outputTokens, costUsd: cost, ms: Date.now() - t0, ok: true, attempt });
    const summary = () => ({ inputTokens: total.known ? total.inputTokens : null, outputTokens: total.known ? total.outputTokens : null, costUsd: total.priced ? total.costUsd : null });
    if (!schema) return { data: r.data, usage: summary(), model: provider.model, calls };
    if (r.stopReason === 'max_tokens' || r.stopReason === 'length') {
      throw new AIError(`The model's answer was cut off at ${maxTokens} tokens; ask for fewer posts or raise the limit`, { code: 'truncated' });
    }
    problems = r.data === undefined ? ['the reply was not valid JSON'] : validate(schema, r.data);
    if (!problems.length && semantic) problems = semantic(r.data) ?? [];
    if (!problems.length) return { data: r.data, usage: summary(), model: provider.model, calls };
    if (attempt === 2) break;
    convo = [...convo,
      { role: 'assistant', content: r.rawText || '{}' },
      { role: 'user', content: `That JSON was not accepted:\n- ${problems.slice(0, 20).join('\n- ')}\nReturn the complete corrected JSON only.` }];
  }
  throw new AIError(`The model's output was invalid after one retry: ${problems.slice(0, 8).join('; ')}`, { code: 'invalid_output', details: problems });
}
