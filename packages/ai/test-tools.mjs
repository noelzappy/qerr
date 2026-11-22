// Tool calling through complete() and the runtime: the Anthropic and OpenAI-compatible shapes, the cap on calls, a failing tool,
// a server that takes no tools, the budget checked before every round trip, and every call logged. No real network.
import assert from 'node:assert/strict';
import test from 'node:test';
import { complete, createAI } from './src/index.mjs';
import { createRuntime } from './src/runtime.mjs';

const res = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeFetch(...handlers) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : undefined });
    const h = handlers.length > 1 ? handlers.shift() : handlers[0];
    return typeof h === 'function' ? h(String(url), init) : h.clone();
  };
  f.calls = calls;
  return f;
}
const anthropic = { id: 'a', kind: 'anthropic', model: 'claude-x', apiKey: 'sk-ant-TOOLTEST-123456', tasks: ['draft'] };
const oai = { id: 'o', kind: 'openai-compatible', model: 'gpt-x', baseUrl: 'https://llm.example.com/v1', apiKey: 'oai-TOOLTEST-123456', tasks: ['draft'] };
const SCHEMA = { type: 'object', required: ['answer'], properties: { answer: { type: 'string' } } };
const USAGE = { input_tokens: 100, output_tokens: 10 };
const aToolUse = (...uses) => res(200, { content: uses.map(([id, name, input]) => ({ type: 'tool_use', id, name, input })), usage: USAGE, stop_reason: 'tool_use' });
const aAnswer = (input) => res(200, { content: [{ type: 'tool_use', id: 'r', name: 'respond', input }], usage: USAGE, stop_reason: 'tool_use' });
const oCalls = (...calls) => res(200, { choices: [{ message: { content: null, tool_calls: calls.map(([id, name, args]) => ({ id, type: 'function', function: { name, arguments: args } })) }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 50, completion_tokens: 5 } });
const oAnswer = (content) => res(200, { choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 5 } });
const lookup = (seen) => ({ name: 'lookup', description: 'Look a word up.', schema: { type: 'object', required: ['q'], properties: { q: { type: 'string' } } }, run: async ({ q }) => { seen.push(q); return { found: `${q}!` }; } });

test('tools, anthropic: offered beside the answer tool with tool_choice any, results go back as tool_result, the answer finishes', async () => {
  const seen = [];
  const f = fakeFetch(aToolUse(['t1', 'lookup', { q: 'one' }], ['t2', 'lookup', { q: 'two' }]), aAnswer({ answer: 'done' }));
  const r = await complete({ provider: anthropic, system: 's', messages: [{ role: 'user', content: 'q' }], schema: SCHEMA, tools: [lookup(seen)], fetch: f });
  assert.equal(r.data.answer, 'done');
  assert.deepEqual(seen, ['one', 'two']);
  assert.equal(r.calls, 2);
  assert.equal(r.toolCalls, 2);
  const [first, second] = f.calls.map((c) => c.body);
  assert.deepEqual(first.tool_choice, { type: 'any' });
  assert.deepEqual(first.tools.map((t) => t.name), ['respond', 'lookup']);
  assert.equal(second.messages.length, 3);
  assert.equal(second.messages[1].role, 'assistant');
  assert.deepEqual(second.messages[2].content.map((b) => [b.type, b.tool_use_id, JSON.parse(b.content).found]), [['tool_result', 't1', 'one!'], ['tool_result', 't2', 'two!']]);
  assert.equal(r.usage.inputTokens, 200, 'both round trips are counted');
});

test('tools, openai-compatible: functions with tool_choice auto, role "tool" results, then the JSON answer', async () => {
  const seen = [];
  const f = fakeFetch(oCalls(['c1', 'lookup', '{"q":"x"}']), oAnswer('{"answer":"ok"}'));
  const r = await complete({ provider: oai, system: 's', messages: [{ role: 'user', content: 'q' }], schema: SCHEMA, tools: [lookup(seen)], fetch: f });
  assert.equal(r.data.answer, 'ok');
  assert.deepEqual(seen, ['x']);
  const [first, second] = f.calls.map((c) => c.body);
  assert.deepEqual(first.tools, [{ type: 'function', function: { name: 'lookup', description: 'Look a word up.', parameters: lookup([]).schema } }]);
  assert.equal(first.tool_choice, 'auto');
  assert.deepEqual(first.response_format, { type: 'json_object' });
  assert.equal(second.messages.at(-2).tool_calls[0].id, 'c1');
  assert.deepEqual(second.messages.at(-1), { role: 'tool', tool_call_id: 'c1', content: '{"found":"x!"}' });
});

test('tools: the cap — past it a call is refused, and the next turn allows only the answer', async () => {
  const seen = [];
  const f = fakeFetch(aToolUse(['a', 'lookup', { q: '1' }], ['b', 'lookup', { q: '2' }], ['c', 'lookup', { q: '3' }]), aAnswer({ answer: 'fine' }));
  const r = await complete({ provider: anthropic, system: 's', messages: [{ role: 'user', content: 'q' }], schema: SCHEMA, tools: [lookup(seen)], maxToolCalls: 2, fetch: f });
  assert.deepEqual(seen, ['1', '2']);
  assert.equal(r.toolCalls, 2);
  const results = f.calls[1].body.messages[2].content;
  assert.equal(results[2].is_error, true);
  assert.match(results[2].content, /limit/);
  assert.deepEqual(f.calls[1].body.tool_choice, { type: 'tool', name: 'respond' });
  const o = fakeFetch(oCalls(['a', 'lookup', '{"q":"1"}']), oAnswer('{"answer":"x"}'));
  await complete({ provider: oai, system: 's', messages: [{ role: 'user', content: 'q' }], schema: SCHEMA, tools: [lookup([])], maxToolCalls: 1, fetch: o });
  assert.equal(o.calls[1].body.tool_choice, 'none');
});

test('tools: a tool that throws, or arguments that are not JSON, answer the model with the problem; a budget error stops', async () => {
  const boom = { ...lookup([]), run: async () => { throw new Error('index is down'); } };
  const f = fakeFetch(oCalls(['a', 'lookup', '{"q":"1"}'], ['b', 'lookup', 'not json']), oAnswer('{"answer":"x"}'));
  const told = [];
  await complete({ provider: oai, system: 's', messages: [{ role: 'user', content: 'q' }], schema: SCHEMA, tools: [boom], fetch: f, onTool: (t) => told.push(t) });
  assert.deepEqual(f.calls[1].body.messages.slice(-2).map((m) => m.content), ['The tool failed: index is down', 'The tool failed: the arguments were not a JSON object']);
  assert.deepEqual(told.map((t) => t.ok), [false, false]);
  const { AIError } = await import('./src/errors.mjs');
  const broke = { ...lookup([]), run: async () => { throw new AIError('budget used up', { code: 'budget' }); } };
  await assert.rejects(complete({ provider: oai, system: 's', messages: [{ role: 'user', content: 'q' }], schema: SCHEMA, tools: [broke], fetch: fakeFetch(oCalls(['a', 'lookup', '{"q":"1"}']), oAnswer('{"answer":"x"}')) }), /budget used up/);
});

test('tools: a server that refuses tools is asked again without them', async () => {
  const f = fakeFetch(res(400, { error: { message: 'tools are not supported by this model' } }), oAnswer('{"answer":"plain"}'));
  const r = await complete({ provider: oai, system: 's', messages: [{ role: 'user', content: 'q' }], schema: SCHEMA, tools: [lookup([])], fetch: f });
  assert.equal(r.data.answer, 'plain');
  assert.ok(f.calls[0].body.tools);
  assert.equal(f.calls[1].body.tools, undefined);
});

test('tools: no tools means the single forced answer tool, as before', async () => {
  const f = fakeFetch(aAnswer({ answer: 'x' }));
  await complete({ provider: anthropic, system: 's', messages: [{ role: 'user', content: 'q' }], schema: SCHEMA, fetch: f });
  assert.deepEqual(f.calls[0].body.tool_choice, { type: 'tool', name: 'respond' });
  assert.equal(f.calls[0].body.tools.length, 1);
});

test('tools, runtime: the budget is checked before every round trip, every round trip and tool call is logged and metered', async () => {
  const logs = [];
  const prices = { 'claude-x': { inputPerMTok: 3000, outputPerMTok: 0 } }; // 100 input tokens cost 0.30 USD
  const rt = createRuntime({ providers: [anthropic], budget: { monthlyLimitUsd: 0.5, spentUsd: 0 }, prices, log: (r) => logs.push(r), fetch: fakeFetch(aToolUse(['a', 'lookup', { q: '1' }]), aToolUse(['b', 'lookup', { q: '2' }]), aAnswer({ answer: 'x' })) });
  const meter = rt.newMeter();
  await assert.rejects(rt.llm('draft', { system: 's', messages: [{ role: 'user', content: 'q' }], schema: SCHEMA, maxTokens: 100, tools: [lookup([])], maxToolCalls: 5 }, meter), (e) => e.code === 'budget');
  assert.deepEqual(logs.map((l) => l.kind), ['llm', 'tool', 'llm', 'tool']);
  assert.equal(meter.calls, 2);
  assert.equal(meter.toolCalls, 2);
  assert.equal(rt.summarise(meter).toolCalls, 2);
  assert.ok(Math.abs(rt.spentUsd() - 0.6) < 1e-9);
  // the AI interface itself still works without tools
  assert.ok(createAI({ providers: [anthropic] }).draftBatch);
});
