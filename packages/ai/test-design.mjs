// Tests of the AI designer (src/design.mjs). No real provider: the provider is a fake fetch. The brand is the fictional Kettleworks pack, whose
// look (roast) is in use, so the engine's own validator judges what the fake model returns.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ROOT } from '@qerr/engine/core';
import { createAI, designCatalogue } from './src/index.mjs';
import { wordsProblems } from './src/design.mjs';
import { loadPrompt } from './src/prompts.mjs';

const KEY = 'sk-ant-TESTKEY-DESIGN-1234567890';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const answer = (input) => json(200, { content: [{ type: 'tool_use', name: 'respond', input }], usage: { input_tokens: 9000, output_tokens: 1200 }, stop_reason: 'tool_use' });
const PRICES = { 'claude-sonnet-5-5': { inputPerMTok: 3, outputPerMTok: 15 } };
const provider = { id: 'a', kind: 'anthropic', model: 'claude-sonnet-5-5', apiKey: KEY, tasks: ['draft'] };
function fake(...handlers) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    const h = handlers.length > 1 ? handlers.shift() : handlers[0];
    return typeof h === 'function' ? h() : h.clone();
  };
  f.calls = calls;
  return f;
}
const PACK = 'brands/kettleworks';
const LOOK = JSON.parse(fs.readFileSync(path.join(ROOT, PACK, 'brand.json'), 'utf8')).looks[0];
const statement = () => {
  const c = JSON.parse(JSON.stringify(LOOK.compositions.find((x) => x.kind === 'statement')));
  c.name = 'AI cup';
  c.elements.unshift({ type: 'art', place: { inset: 'page' }, z: 0, shapes: [{ shape: 'circle', cx: 150, cy: 150, r: 300, colour: 'light-tint' }] });
  return c;
};
const POST = { template: 'post', kind: 'statement', headline: 'Slow coffee, *quick smiles*', sub: 'Our filter of the week, poured by hand.' };
const PICTURE = { w: 1200, h: 800, thumb: { mediaType: 'image/jpeg', data: Buffer.from('not really a jpeg').toString('base64') }, edge: { rgb: [240, 170, 110], plain: true, picture: true } };
let saved;
test.before(() => { saved = process.env.BRAND_DIR; process.env.BRAND_DIR = PACK; });
test.after(() => { if (saved === undefined) delete process.env.BRAND_DIR; else process.env.BRAND_DIR = saved; });
const make = (ai, { logs = [], budget } = {}) => createAI({ providers: [provider], fetch: ai, prices: PRICES, log: (r) => logs.push(r), budget, sleep: async () => {}, root: ROOT });
const userText = (call, i = 0) => { const c = call.body.messages[i].content; return Array.isArray(c) ? c.filter((p) => p.type === 'text').map((p) => p.text).join('\n') : c; };

test('the design prompt is versioned and the catalogue names the art layer and every offered element', () => {
  assert.match(loadPrompt('design', { root: ROOT }).version, /^design-\d+$/);
  const cat = designCatalogue();
  for (const t of ['box', 'text', 'photo', 'art', 'overlay', 'fitted-stack', 'backdrop']) assert.match(cat, new RegExp(`^- ${t}: `, 'm'), t);
  for (const t of ['graphic', 'device', 'meta-row']) assert.doesNotMatch(cat, new RegExp(`^- ${t}: `, 'm'), t);
  assert.match(cat, /at most 24 shapes and 400 path points/);
  assert.match(cat, /- path: d: \[\["M",x,y\]/);
});

test('one call per post: the model sees the picture, the catalogue, the look, the palette and the words; a valid design comes back as it is', async () => {
  const logs = [];
  const ai = fake(answer({ why: 'A big cup behind the words.', composition: statement() }));
  const out = await make(ai, { logs }).designBatch({ posts: [{ id: 'p1', design: POST, picture: PICTURE }] });
  assert.equal(ai.calls.length, 1);
  assert.equal(out.results[0].composition.name, 'AI cup');
  assert.equal(out.results[0].tries, 1);
  assert.equal(out.notes.promptVersion, loadPrompt('design', { root: ROOT }).version);
  assert.equal(out.notes.designed, 1);
  assert.ok(out.notes.usage.costUsd > 0, 'the call is priced');
  const content = ai.calls[0].body.messages[0].content;
  assert.equal(content[0].type, 'image', 'the thumbnail goes first');
  const text = userText(ai.calls[0]);
  assert.match(text, /CATALOGUE/);
  assert.match(text, /"edgeColour":"rgb\(240, 170, 110\)"/);
  assert.match(text, /"pageCanTakeItsColour":true/);
  assert.match(text, /"palette":\{[^}]*"paper":"#/);
  assert.match(text, /"headline":"Slow coffee, \*quick smiles\*"/);
  assert.match(text, /"thisLook":\[\{"kind":"statement"/);
  assert.ok(logs.some((l) => l.kind === 'llm' && l.task === 'design' && l.ok), 'logged as a design call');
  assert.ok(!JSON.stringify(logs).includes(KEY) && !JSON.stringify(out).includes(KEY));
});

test('a design the engine refuses gets one repair round with the reasons; a repaired one is kept', async () => {
  const bad = statement(); bad.elements[0].shapes[0].colour = '#ff0000';
  const ai = fake(answer({ why: 'x', composition: bad }), answer({ why: 'fixed', composition: statement() }));
  const out = await make(ai).designBatch({ posts: [{ id: 'p1', design: POST }] });
  assert.equal(ai.calls.length, 2);
  assert.equal(out.results[0].tries, 2);
  assert.equal(out.results[0].composition.name, 'AI cup');
  const repair = userText(ai.calls[1], 2);
  assert.match(repair, /The engine refused this design/);
  assert.match(repair, /never a hex colour/);
  assert.equal(ai.calls[1].body.messages[1].role, 'assistant');
});

test('the words stand alone: a design that shows only the emphasised phrase, or drops the sub, is sent back with the reason', async () => {
  const phraseOnly = statement();
  const walk = (list) => { for (const e of list) { if (e.type === 'text' && e.field === 'headline') e.part = 'phrase'; walk(e.children ?? []); } };
  walk(phraseOnly.elements);
  assert.match(wordsProblems(phraseOnly, POST).join(' '), /headline must be shown whole .*only a part/);
  const noSub = statement(); noSub.elements = noSub.elements.filter((e) => !JSON.stringify(e).includes('"field":"sub"'));
  assert.match(wordsProblems(noSub, POST).join(' '), /sub must be shown whole .*not shown at all/);
  assert.deepEqual(wordsProblems(statement(), POST), []);
  const ai = fake(answer({ why: 'x', composition: phraseOnly }), answer({ why: 'fixed', composition: statement() }));
  const out = await make(ai).designBatch({ posts: [{ id: 'p1', design: POST }] });
  assert.equal(out.results[0].tries, 2);
  assert.match(userText(ai.calls[1], 2), /headline must be shown whole/);
});

test('a design that still fails after the repair is dropped: the post keeps the look\'s design, and the reasons say why', async () => {
  const bad = statement(); bad.ground = 'tint';
  const ai = fake(answer({ why: 'x', composition: bad }));
  const out = await make(ai).designBatch({ posts: [{ id: 'p1', design: POST }] });
  assert.equal(ai.calls.length, 2, 'exactly one repair round');
  assert.equal(out.results[0].composition, null);
  assert.match(out.results[0].reasons.join(' '), /^validation: .*page colour \(tint\).*after the repair, validation/);
  assert.equal(out.notes.designed, 0);
});

test('the trial check: a design the finished page refuses gets the same one repair round; then it is kept or dropped', async () => {
  const checked = [];
  let n = 0;
  const check = async (id, c) => { checked.push([id, c.name]); return n++ === 0 ? ['the page does not meet the design rules: a decorative shape of the art lies over the words "Slow"'] : []; };
  const ai = fake(answer({ why: 'x', composition: statement() }));
  const ok = await make(ai).designBatch({ posts: [{ id: 'p1', design: POST }], check });
  assert.equal(ok.results[0].composition.name, 'AI cup');
  assert.deepEqual(checked, [['p1', 'AI cup'], ['p1', 'AI cup']]);
  assert.match(userText(ai.calls[1], 2), /a check of the finished page refused it:\n- .*lies over the words/);
  const always = async () => ['too much empty space'];
  const ai2 = fake(answer({ why: 'x', composition: statement() }));
  const no = await make(ai2).designBatch({ posts: [{ id: 'p1', design: POST }], check: always });
  assert.equal(ai2.calls.length, 2);
  assert.equal(no.results[0].composition, null);
  assert.match(no.results[0].reasons.join(' '), /check: too much empty space/);
});

test('the batch so far is given to each later post, so the designs vary; posts the designer does not take are skipped without a call', async () => {
  const ai = fake(answer({ why: 'x', composition: statement() }));
  const posts = [{ id: 'a', design: POST }, { id: 'b', design: { template: 'carousel', pages: [] } }, { id: 'c', design: { ...POST, headline: 'Another *one*' } }];
  const out = await make(ai).designBatch({ posts });
  assert.equal(ai.calls.length, 2);
  assert.equal(out.results[1].composition, null);
  assert.match(out.results[1].reasons[0], /only a single post/);
  assert.match(userText(ai.calls[0]), /"batchSoFar":\[\]/);
  assert.match(userText(ai.calls[1]), /"batchSoFar":\[\{"kind":"statement","name":"AI cup","ground":"paper"/);
});

test('the budget stops the designer: the rest keep the look\'s design', async () => {
  const ai = fake(answer({ why: 'x', composition: statement() }));
  const out = await make(ai, { budget: { monthlyLimitUsd: 0.01, spentUsd: 0.01 } }).designBatch({ posts: [{ id: 'a', design: POST }, { id: 'b', design: POST }] });
  assert.equal(ai.calls.length, 0);
  assert.deepEqual(out.results.map((r) => r.composition), [null, null]);
  assert.match(out.results[0].reasons[0], /budget/);
});

test('a brand without a look in use is refused before any call', async () => {
  const before = process.env.BRAND_DIR;
  process.env.BRAND_DIR = 'brands/demo';
  try {
    const ai = fake(answer({ why: 'x', composition: statement() }));
    await assert.rejects(make(ai).designBatch({ posts: [{ id: 'a', design: POST }] }), (e) => e.code === 'config' && /no look in use/.test(e.message));
    assert.equal(ai.calls.length, 0);
  } finally { process.env.BRAND_DIR = before; }
});
