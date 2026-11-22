// Model providers behind one function: complete(). All output is untrusted text until validated.
//
// Anthropic Messages API: https://docs.anthropic.com/en/api/messages (moved to https://platform.claude.com/docs/en/api/messages)
//   POST {base}/v1/messages, headers x-api-key and anthropic-version: 2023-06-01; structured output through one forced
//   tool (tools[].input_schema + tool_choice {type:"tool"}); usage.input_tokens / usage.output_tokens.
// OpenAI-compatible Chat Completions: POST {base}/chat/completions, Bearer key, response_format {type:"json_object"},
//   usage.prompt_tokens / usage.completion_tokens.
// Tools (complete({ tools })): Anthropic gets them beside the answer tool with tool_choice {type:"any"} (a tool call every turn,
//   the answer tool to finish), replies with tool_use blocks and takes tool_result blocks back in the next user turn. An
//   OpenAI-compatible provider gets tools [{ type:"function", function:{ name, description, parameters } }] with tool_choice "auto",
//   replies with message.tool_calls (arguments as a JSON text) and takes { role:"tool", tool_call_id, content } messages back, then
//   answers in JSON. Once the tool calls are used up only the answer is allowed (Anthropic: the answer tool forced; OpenAI: "none").
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

// One HTTP round trip. Returns { rawText, data, usage, stopReason, toolCalls, native }: `toolCalls` are the calls of the caller's
// tools the model asked for ([{ id, name, input }], empty when it answered), `native` its reply as this provider's own message, to
// send back with the tool results. `extra` holds the provider-shaped turns after `messages` (tool calls, tool results, corrections).
async function roundTrip(provider, { system, messages, extra = [], schema, schemaName, maxTokens, temperature, tools = [], finalOnly = false }, opts, state) {
  const secrets = [provider.apiKey];
  const common = { fetch: opts.fetch, timeoutMs: opts.timeoutMs, maxRetries: opts.maxRetries, sleep: opts.sleep, baseDelayMs: opts.baseDelayMs, maxDelayMs: opts.maxDelayMs, secrets };
  for (let tries = 0; tries < 4; tries++) {
    let url, headers, body;
    const own = state.noTools ? [] : tools;
    if (provider.kind === 'anthropic') {
      url = `${trimSlash(provider.baseUrl || 'https://api.anthropic.com').replace(/\/v1$/, '')}/v1/messages`;
      headers = { 'content-type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': ANTHROPIC_VERSION };
      body = { model: provider.model, max_tokens: maxTokens, system, messages: [...shaped('anthropic', messages), ...extra] };
      if (schema) {
        body.tools = [{ name: schemaName, description: 'Return the result as the arguments of this tool.', input_schema: schema }, ...own.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }))];
        const offered = own.length > 0 && !finalOnly;
        // Some models refuse a forced tool; then the tools are only offered and the system prompt says to finish with the answer tool.
        if (state.noForcedTool) { body.tool_choice = { type: 'auto' }; body.system = `${system}\n\nReturn your answer by calling the \`${schemaName}\` tool exactly once${offered ? ', after any other tools you need' : ''}.`; }
        else body.tool_choice = offered ? { type: 'any' } : { type: 'tool', name: schemaName };
      }
      if (temperature !== undefined && !state.noTemperature) body.temperature = temperature;
    } else {
      url = `${trimSlash(provider.baseUrl)}/chat/completions`;
      headers = { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` };
      body = { model: provider.model, max_tokens: maxTokens, messages: [{ role: 'system', content: system + (schema ? schemaHint(schema) : '') }, ...shaped('openai-compatible', messages), ...extra] };
      if (schema && !state.noResponseFormat) body.response_format = { type: 'json_object' };
      if (own.length) { body.tools = own.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } })); body.tool_choice = finalOnly ? 'none' : 'auto'; }
      if (temperature !== undefined && !state.noTemperature) body.temperature = temperature;
    }
    const res = await request(url, { ...common, method: 'POST', headers, body: JSON.stringify(body) });
    if (res.ok) {
      const j = res.json ?? {};
      if (provider.kind === 'anthropic') {
        const blocks = Array.isArray(j.content) ? j.content : [];
        const answer = blocks.find((b) => b.type === 'tool_use' && b.name === schemaName) ?? (own.length ? undefined : blocks.find((b) => b.type === 'tool_use'));
        const calls = answer ? [] : blocks.filter((b) => b.type === 'tool_use' && own.some((t) => t.name === b.name)).map((b) => ({ id: String(b.id ?? ''), name: b.name, input: b.input }));
        const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        let data = answer?.input;
        if (typeof data === 'string') data = extractJson(data);
        if (data === undefined && schema && !calls.length) data = extractJson(text);
        const u = j.usage ?? {};
        const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        return { rawText: data !== undefined ? JSON.stringify(data) : text, data, usage: { inputTokens: u.input_tokens === undefined ? null : inputTokens, outputTokens: u.output_tokens ?? null }, stopReason: j.stop_reason, toolCalls: calls, native: { role: 'assistant', content: blocks } };
      }
      const choice = j.choices?.[0];
      const msg = choice?.message ?? {};
      const text = msg.content;
      const rawText = typeof text === 'string' ? text : Array.isArray(text) ? text.map((p) => p.text ?? '').join('') : '';
      const u = j.usage ?? {};
      const calls = own.length && Array.isArray(msg.tool_calls) ? msg.tool_calls.filter((c) => own.some((t) => t.name === c?.function?.name)).map((c) => {
        let input;
        try { input = JSON.parse(c.function.arguments || '{}'); } catch { input = undefined; }
        return { id: String(c.id ?? ''), name: c.function.name, input };
      }) : [];
      const native = { role: 'assistant', content: typeof text === 'string' ? text : null, ...(Array.isArray(msg.tool_calls) ? { tool_calls: msg.tool_calls } : {}) };
      return { rawText, data: !schema ? rawText : calls.length ? undefined : extractJson(rawText), usage: { inputTokens: u.prompt_tokens ?? null, outputTokens: u.completion_tokens ?? null }, stopReason: choice?.finish_reason, toolCalls: calls, native };
    }
    const detail = describeError(res, secrets);
    // Some models or servers refuse an optional setting; drop it once and ask again.
    if (res.status === 400 && body.temperature !== undefined && /temperature/i.test(detail)) { state.noTemperature = true; continue; }
    if (res.status === 400 && ['tool', 'any'].includes(body.tool_choice?.type) && /tool_choice/i.test(detail)) { state.noForcedTool = true; continue; }
    if (res.status === 400 && body.response_format && /response_format|json_object|json mode/i.test(detail)) { state.noResponseFormat = true; continue; }
    // A server that takes no tools at all: the answer is asked for without them (the tools help; they are never required).
    if (res.status === 400 && own.length && !extra.length && /\btools?\b|function/i.test(detail)) { state.noTools = true; continue; }
    throw new AIError(`${provider.kind} answered ${res.status}: ${detail}`, { code: 'http', status: res.status });
  }
  throw new AIError(`${provider.kind} kept refusing the request settings`, { code: 'http' });
}

// The results of the tool calls a model asked for, in the provider's own shape.
function toolResults(kind, results) {
  if (kind === 'anthropic') return [{ role: 'user', content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, ...(r.error ? { is_error: true } : {}) })) }];
  return results.map((r) => ({ role: 'tool', tool_call_id: r.id, content: r.content }));
}
const MAX_RESULT_CHARS = 20000;
const resultText = (v) => { const t = typeof v === 'string' ? v : JSON.stringify(v ?? null); return t.length > MAX_RESULT_CHARS ? `${t.slice(0, MAX_RESULT_CHARS)}…` : t; };

// complete({ provider, system, messages, schema, maxTokens, temperature, validate, task, onCall, prices, tools, maxToolCalls, beforeCall, onTool, ... })
//   -> { data, usage: { inputTokens, outputTokens, costUsd | null }, model, calls, toolCalls }
// Output is checked against `schema`, then by the optional `validate(data) -> string[]`. Invalid output is sent back
// once with the problems listed; a second failure throws AIError('invalid_output').
// tools: [{ name, description, schema, run(input) -> result }]. The model may call them up to `maxToolCalls` times in all; every
// round trip is a paid call reported through onCall. A tool that throws answers the model with the error's message (a budget error
// stops the task). `beforeCall` runs before every round trip (the budget check), `onTool({ name, input, ok, error? })` after each call.
export async function complete({ provider, system, messages, schema, schemaName = 'respond', maxTokens = 4096, temperature, validate: semantic, task = 'task', onCall, prices, fetch, timeoutMs = 120000, maxRetries = 3, sleep, baseDelayMs, maxDelayMs, tools = [], maxToolCalls = 8, beforeCall, onTool } = {}) {
  const bad = configProblems(provider);
  if (bad.length) throw new AIError(`Provider is not usable: ${bad.join('; ')}`, { code: 'config' });
  if (!Array.isArray(messages) || !messages.length) throw new AIError('messages must be a non-empty list', { code: 'config' });
  if (tools.length && !schema) throw new AIError('tools need a schema for the final answer', { code: 'config' });
  const opts = { fetch, timeoutMs, maxRetries, sleep, baseDelayMs, maxDelayMs };
  const secrets = [provider.apiKey];
  const state = {};
  const total = { inputTokens: 0, outputTokens: 0, known: true, costUsd: 0, priced: true };
  const summary = () => ({ inputTokens: total.known ? total.inputTokens : null, outputTokens: total.known ? total.outputTokens : null, costUsd: total.priced ? total.costUsd : null });
  const extra = [];
  let calls = 0, used = 0, rounds = 0;
  let problems = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    let r;
    for (;;) {
      beforeCall?.();
      const t0 = Date.now();
      const finalOnly = used >= maxToolCalls || rounds > maxToolCalls + 1;
      try {
        r = await roundTrip(provider, { system, messages, extra, schema, schemaName, maxTokens, temperature, tools, finalOnly }, opts, state);
      } catch (e) {
        onCall?.({ provider: provider.id ?? provider.kind, providerKind: provider.kind, model: provider.model, task, tokensIn: null, tokensOut: null, costUsd: null, ms: Date.now() - t0, ok: false, error: redact(e.message, secrets) });
        throw e;
      }
      calls++; rounds++;
      const usage = { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens };
      const cost = estimateCost(usage, provider.model, prices ?? provider.prices);
      if (usage.inputTokens === null || usage.outputTokens === null) total.known = false; else { total.inputTokens += usage.inputTokens; total.outputTokens += usage.outputTokens; }
      if (cost === null) total.priced = false; else total.costUsd += cost;
      onCall?.({ provider: provider.id ?? provider.kind, providerKind: provider.kind, model: provider.model, task, tokensIn: usage.inputTokens, tokensOut: usage.outputTokens, costUsd: cost, ms: Date.now() - t0, ok: true, attempt });
      if (!r.toolCalls?.length || finalOnly) break;
      const results = [];
      for (const c of r.toolCalls) {
        if (used >= maxToolCalls) { results.push({ id: c.id, content: 'The tool call limit for this answer is reached. Answer now with what you have.', error: true }); continue; }
        used++;
        try {
          if (!c.input || typeof c.input !== 'object' || Array.isArray(c.input)) throw new Error('the arguments were not a JSON object');
          results.push({ id: c.id, content: resultText(await tools.find((t) => t.name === c.name).run(c.input)) });
          onTool?.({ name: c.name, input: c.input, ok: true });
        } catch (e) {
          if (e instanceof AIError && e.code === 'budget') throw e;
          const msg = redact(String(e?.message ?? e), secrets).slice(0, 300);
          results.push({ id: c.id, content: `The tool failed: ${msg}`, error: true });
          onTool?.({ name: c.name, input: c.input, ok: false, error: msg });
        }
      }
      extra.push(r.native, ...toolResults(provider.kind, results));
    }
    if (!schema) return { data: r.data, usage: summary(), model: provider.model, calls, toolCalls: used };
    if (r.stopReason === 'max_tokens' || r.stopReason === 'length') {
      throw new AIError(`The model's answer was cut off at ${maxTokens} tokens; ask for fewer posts or raise the limit`, { code: 'truncated' });
    }
    problems = r.data === undefined ? ['the reply was not valid JSON'] : validate(schema, r.data);
    if (!problems.length && semantic) problems = semantic(r.data) ?? [];
    if (!problems.length) return { data: r.data, usage: summary(), model: provider.model, calls, toolCalls: used };
    if (attempt === 2) break;
    extra.push(
      { role: 'assistant', content: r.rawText || '{}' },
      { role: 'user', content: `That JSON was not accepted:\n- ${problems.slice(0, 20).join('\n- ')}\nReturn the complete corrected JSON only.` });
  }
  throw new AIError(`The model's output was invalid after one retry: ${problems.slice(0, 8).join('; ')}`, { code: 'invalid_output', details: problems });
}
