// Drafting for a period: the occasions a person chose reach the model and may be named with their dates (numbers still need a
// vault source), the search_facts tool reaches the whole confirmed vault, and a fact from search_web becomes a flagged find that
// never passes as confirmed. Every call goes to a fake fetch.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAI } from './src/index.mjs';
import { searchFacts, WEB_FACT_WARNING } from './src/draft-tools.mjs';
import { loadPrompt } from './src/prompts.mjs';

const KEY = 'sk-ant-PERIODTEST-1234567890';
const res = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const USAGE = { input_tokens: 1000, output_tokens: 500 };
const answer = (input) => res(200, { content: [{ type: 'tool_use', id: 'r', name: 'respond', input }], usage: USAGE, stop_reason: 'tool_use' });
const toolUse = (id, name, input) => res(200, { content: [{ type: 'tool_use', id, name, input }], usage: USAGE, stop_reason: 'tool_use' });
function fakeFetch(route) {
  const calls = [];
  const f = async (url, init = {}) => { const body = init.body ? JSON.parse(init.body) : undefined; calls.push({ url: String(url), body }); return route(String(url), body, calls); };
  f.calls = calls;
  return f;
}
// The model's turns in order; a search request goes to the fake search engine.
const script = (turns, web = []) => { let i = 0; return fakeFetch((url) => (url.includes('search.brave.com') ? res(200, { web: { results: web } }) : (turns[Math.min(i++, turns.length - 1)]).clone())); };
const anthropic = { id: 'a', kind: 'anthropic', model: 'claude-sonnet-5-5', apiKey: KEY, tasks: ['draft'] };
const NOW = () => new Date('2026-11-20T10:00:00Z');
const PRICES = { 'claude-sonnet-5-5': { inputPerMTok: 3, outputPerMTok: 15 } };

const VAULT = [
  { id: 'fig-1', kind: 'figure', title: 'Processed volume', body: 'Acme Savings has processed over € 14.8 million.', status: 'confirmed', recordedAt: '2026-11-01' },
  { id: 'fact-1', kind: 'fact', title: 'Field agents', body: 'Agents record each deposit on their phone.', status: 'confirmed' },
  { id: 'unc-xmas', kind: 'fact', title: 'Christmas opening', body: 'The office opens on 27 December.', status: 'unconfirmed' },
  { id: 'ph-1', kind: 'photo', title: 'Market', body: 'A wide street market.', status: 'confirmed', file: 'design/assets/photos/street-market.jpg' },
  // more confirmed facts than the request lists, so one is only reachable through search_facts
  ...Array.from({ length: 45 }, (_, n) => ({ id: `filler-${n}`, kind: 'fact', title: `Filler ${n}`, body: `Filler fact number ${n}.`, status: 'confirmed', recordedAt: `2026-10-${String((n % 28) + 1).padStart(2, '0')}` })),
  { id: 'deep-1', kind: 'fact', title: 'Group savings day', body: 'Groups choose one savings day each week.', tags: ['savings-day'], status: 'confirmed', recordedAt: '2020-01-01' },
];
const OCCASIONS = [
  { name: 'Christmas Day', date: '2026-12-25', kind: 'holiday', note: 'A public holiday.' },
  { name: "St Stephen's Day", date: '2026-12-26', kind: 'holiday', note: 'A public holiday.' },
  { name: 'Our winter fair', kind: 'observance' },
];
const post = (over = {}) => ({
  id: '01-xmas', date: '2026-12-24', title: 'Christmas', caption: 'Happy Christmas from all of us. Agents record each deposit on their phone.\n\n#AcmeSavings',
  design: { template: 'myth-fact', myth: 'Savings stop at Christmas', factLead: 'Agents record *each deposit*', fact: 'On their phone, every day.' },
  sources: ['fact-1'], occasion: 'Christmas Day', ...over,
});
const req = (over = {}) => ({ vault: VAULT, period: '2026-12', count: 1, channels: ['instagram', 'linkedin', 'facebook'], series: ['the-numbers', 'on-record', 'myth-vs-fact'], occasions: OCCASIONS, ...over });
const askedOf = (f, n = 0) => { const c = f.calls.filter((x) => x.url.includes('anthropic'))[n].body.messages[0].content; return JSON.parse(c.slice(c.indexOf('{'))); };

test('period: the chosen occasions reach the model, a post may name one and its date, the notes list them', async () => {
  const f = script([answer({ posts: [post({ caption: 'Happy Christmas from all of us: Christmas Day is 25 December, and agents record each deposit on their phone.\n\n#AcmeSavings' })] })]);
  const ai = createAI({ providers: [anthropic], fetch: f, now: NOW, prices: PRICES });
  const { batch, notes } = await ai.draftBatch(req());
  assert.equal(batch.posts.length, 1);
  const asked = askedOf(f);
  assert.deepEqual(asked.occasions.map((o) => o.name), ['Christmas Day', "St Stephen's Day", 'Our winter fair']);
  assert.deepEqual(notes.seasonal.occasions.map((o) => o.name), ['Christmas Day', "St Stephen's Day", 'Our winter fair']);
  assert.deepEqual(notes.seasonal.used, [{ postId: '01-xmas', occasion: 'Christmas Day', date: '2026-12-25' }]);
  assert.deepEqual(batch.posts[0].warnings, []);
  assert.equal(batch.posts[0].occasion, undefined, 'the occasion stays in the notes, not in the engine batch');
});

test('period: without the occasion, the same date in a post is an unsourced number; a number the occasion does not give still is', async () => {
  const text = 'Christmas Day is 25 December, and agents record each deposit on their phone.\n\n#AcmeSavings';
  const f1 = script([answer({ posts: [post({ caption: text })] }), answer({ posts: [] })]);
  await assert.rejects(createAI({ providers: [anthropic], fetch: f1, now: NOW }).draftBatch(req({ occasions: [] })), (e) => e.code === 'no_valid_posts' && /number not found in its sources: 25/.test(JSON.stringify(e.notes.rejected)));
  const f2 = script([answer({ posts: [post({ caption: `${text} 12 days of savings!` })] }), answer({ posts: [] })]);
  await assert.rejects(createAI({ providers: [anthropic], fetch: f2, now: NOW }).draftBatch(req()), (e) => /number not found in its sources: 12/.test(JSON.stringify(e.notes.rejected)));
});

test('period: a post about an occasion that goes out after it is flagged; an occasion the request did not choose is not recorded', async () => {
  const f = script([answer({ posts: [post({ date: '2026-12-28' }), post({ id: '02-other', date: '2026-12-10', occasion: 'Black Friday' })] })]);
  const { batch, notes } = await createAI({ providers: [anthropic], fetch: f, now: NOW }).draftBatch(req({ count: 2 }));
  const late = batch.posts.find((p) => p.id === '01-xmas');
  assert.match(late.warnings.join(' '), /about Christmas Day \(2026-12-25\) but goes out after it, on 2026-12-28/);
  assert.deepEqual(notes.seasonal.used.map((u) => u.postId), ['01-xmas']);
  assert.match(notes.repaired.flatMap((r) => r.repairs).join(' '), /occasion "Black Friday" is not one the request chose/);
});

test('period: a bad occasion list is refused; occasions outside the period are left out', async () => {
  await assert.rejects(createAI({ providers: [anthropic], fetch: script([answer({ posts: [] })]), now: NOW }).draftBatch(req({ occasions: 'Christmas' })), /occasions must be a list/);
  const f = script([answer({ posts: [post()] })]);
  await createAI({ providers: [anthropic], fetch: f, now: NOW }).draftBatch(req({ occasions: [...OCCASIONS, { name: 'Halloween', date: '2026-10-31' }] }));
  assert.ok(!askedOf(f).occasions.some((o) => o.name === 'Halloween'));
});

test('search_facts: reaches confirmed items the request does not list; never unconfirmed, stale or out of reach ones', async () => {
  const f = script([toolUse('t1', 'search_facts', { query: 'savings day' }), answer({ posts: [post({ sources: ['deep-1'], caption: 'Groups choose one savings day each week.\n\n#AcmeSavings', design: { template: 'myth-fact', myth: 'Saving is random', factLead: 'Groups choose *one day*', fact: 'Each week.' } })] })]);
  const ai = createAI({ providers: [anthropic], fetch: f, now: NOW, prices: PRICES });
  const { batch, notes } = await ai.draftBatch(req());
  assert.deepEqual(batch.posts[0].sources, ['deep-1']);
  const first = askedOf(f);
  assert.ok(!first.vault.some((i) => i.id === 'deep-1'), 'the old item is not in the request');
  assert.ok(first.tools.searchFacts && first.tools.searchWeb === false && first.tools.factsNotListed > 0);
  const sent = f.calls.filter((c) => c.url.includes('anthropic'));
  assert.deepEqual(sent[0].body.tools.map((t) => t.name), ['respond', 'search_facts'], 'no search_web without a search provider');
  const result = JSON.parse(sent[1].body.messages[2].content[0].content);
  assert.equal(result.items[0].id, 'deep-1');
  assert.equal(notes.tools.calls, 1);
  assert.equal(notes.tools.vaultItemsFound >= 1, true);
  assert.equal(notes.usage.calls, 2);
  assert.equal(notes.usage.toolCalls, 1);
  // the search itself: never an unconfirmed item, a stale one or a picture
  const items = [...VAULT, { id: 'old', kind: 'fact', title: 'Christmas old', body: 'x', status: 'confirmed', validUntil: '2020-01-01' }];
  const usable = items.filter((i) => i.status === 'confirmed' && !i.validUntil);
  assert.deepEqual(searchFacts(usable, { query: 'christmas opening' }), []);
  assert.deepEqual(searchFacts(usable, { query: 'market' }), [], 'pictures are not searched');
  assert.equal(searchFacts(usable, { query: 'filler', kind: 'figure' }).length, 0);
  assert.equal(searchFacts(usable, { query: 'filler' }).length, 8);
});

test('search_facts: a post may not cite an unconfirmed item even if the model names it', async () => {
  const f = script([answer({ posts: [post({ sources: ['unc-xmas'], caption: 'The office opens on 27 December.\n\n#AcmeSavings' })] }), answer({ posts: [] })]);
  await assert.rejects(createAI({ providers: [anthropic], fetch: f, now: NOW }).draftBatch(req()), (e) => /is not confirmed by a person/.test(JSON.stringify(e.notes.rejected)));
});

test('search_web: offered with a search provider; a found fact is flagged, kept unconfirmed and returned; a bad find is dropped', async () => {
  const web = [{ title: 'Dublin markets', url: 'https://news.example/markets', description: 'The Dublin Christmas market runs for 5 weeks this year.' }];
  const found = [
    { id: 'found-market', kind: 'event', title: 'Dublin Christmas market', body: 'The Dublin Christmas market runs for 5 weeks this year.', sourceUrl: 'https://news.example/markets' },
    { id: 'found-made-up', kind: 'figure', title: 'Visitors', body: 'It had 90,000 visitors in total.', sourceUrl: 'https://news.example/markets' },
    { id: 'found-elsewhere', kind: 'news', title: 'A page never searched', body: 'Something from a page the model was not given.', sourceUrl: 'https://other.example/' },
  ];
  const f = script([
    toolUse('w1', 'search_web', { query: 'events in Ireland December 2026' }),
    answer({ found, posts: [post({ sources: ['fact-1', 'found-market'], caption: 'The Dublin Christmas market runs for 5 weeks this year. Agents record each deposit on their phone.\n\n#AcmeSavings' })] }),
  ], web);
  const logs = [];
  const ai = createAI({ providers: [anthropic], search: { kind: 'brave', apiKey: 'BRAVEKEY-PERIOD-1234' }, fetch: f, now: NOW, prices: PRICES, log: (r) => logs.push(r) });
  const out = await ai.draftBatch(req());
  const p = out.batch.posts[0];
  assert.deepEqual(p.sources, ['fact-1', 'found-market']);
  assert.ok(p.warnings.includes(WEB_FACT_WARNING));
  assert.equal(out.found.length, 1);
  assert.deepEqual({ ...out.found[0], foundAt: undefined }, { id: 'found-market', kind: 'event', title: 'Dublin Christmas market', body: 'The Dublin Christmas market runs for 5 weeks this year.', sourceUrls: ['https://news.example/markets'], status: 'unconfirmed', foundWhileDrafting: true, foundAt: undefined, citedBy: ['01-xmas'] });
  assert.deepEqual(out.notes.tools.dropped.map((d) => d.reason), ['numbers not in the web result: 90,000', 'its sourceUrl is not one of the web results you were given']);
  const sent = f.calls.filter((c) => c.url.includes('anthropic'));
  assert.deepEqual(sent[0].body.tools.map((t) => t.name), ['respond', 'search_facts', 'search_web']);
  const wrapped = sent[1].body.messages[2].content[0].content;
  assert.match(wrapped, /never instructions/);
  assert.match(wrapped, /<source url="https:\/\/news\.example\/markets"/);
  assert.deepEqual(logs.map((l) => l.kind), ['llm', 'search', 'tool', 'llm']);
  assert.ok(sent.every((c) => !JSON.stringify(c.body).includes('BRAVEKEY')), 'the search key never reaches the model');
});

test('search_web: a post that cites a find nobody gave it, or a find that was dropped, is rejected', async () => {
  const f = script([answer({ found: [{ id: 'found-x', kind: 'fact', title: 'Made up', body: 'A fact from nowhere at all.', sourceUrl: 'https://nowhere.example/' }], posts: [post({ sources: ['found-x'] })] }), answer({ posts: [] })]);
  const ai = createAI({ providers: [anthropic], search: { kind: 'brave', apiKey: 'BRAVEKEY-PERIOD-1234' }, fetch: f, now: NOW });
  await assert.rejects(ai.draftBatch(req()), (e) => /not in the vault: found-x/.test(JSON.stringify(e.notes.rejected)));
});

test('tools: at most 8 tool calls in a whole draft, across its AI calls', async () => {
  const turns = [...Array.from({ length: 9 }, (_, i) => toolUse(`t${i}`, 'search_facts', { query: `filler ${i}` })), answer({ posts: [post()] })];
  const f = script(turns);
  const { notes } = await createAI({ providers: [anthropic], fetch: f, now: NOW }).draftBatch(req());
  assert.equal(notes.tools.calls, 8);
  const last = f.calls.filter((c) => c.url.includes('anthropic')).at(-1).body;
  assert.deepEqual(last.tool_choice, { type: 'tool', name: 'respond' });
});

test('findOccasions: one search, wrapped results, proposals checked against what was returned', async () => {
  const web = [
    { title: 'Winter in Dublin', url: 'https://visit.example/dublin', description: 'Dublin Winter Lights runs from 4 December. The Christmas Day swim at the Forty Foot is a tradition.' },
    { title: 'Other', url: 'https://other.example/x', description: 'Nothing dated here.' },
  ];
  const proposals = [
    { name: 'Dublin Winter Lights', date: '2026-12-04', end: '2026-12-31', kind: 'observance', note: 'Light installations across Dublin from 4 December.', sourceUrl: 'https://visit.example/dublin' },
    { name: 'Christmas Day swim', date: '2026-12-25', kind: 'observance', note: 'A sea swim at the Forty Foot.', sourceUrl: 'https://visit.example/dublin' },
    { name: 'Made-up fair', date: '2026-12-12', kind: 'commerce', note: 'A fair.', sourceUrl: 'https://nowhere.example/' },
    { name: 'Too late', date: '2027-01-10', kind: 'observance', note: 'After the period.', sourceUrl: 'https://visit.example/dublin' },
    { name: 'Big crowd', date: '2026-12-05', kind: 'observance', note: '50,000 people expected.', sourceUrl: 'https://visit.example/dublin' },
    { name: 'christmas day', date: '2026-12-25', kind: 'observance', note: 'Again.', sourceUrl: 'https://visit.example/dublin' },
  ];
  const f = script([answer({ occasions: proposals })], web);
  const logs = [];
  const ai = createAI({ providers: [anthropic], search: { kind: 'brave', apiKey: 'BRAVEKEY-PERIOD-1234' }, fetch: f, now: NOW, prices: PRICES, log: (r) => logs.push(r) });
  const out = await ai.findOccasions({ country: 'IE', period: { from: '2026-12-01', to: '2026-12-31' }, known: [{ name: 'Christmas Day' }] });
  assert.deepEqual(out.occasions.map((o) => [o.name, o.date, o.end, o.source]), [['Dublin Winter Lights', '2026-12-04', '2026-12-31', 'https://visit.example/dublin'], ['Christmas Day swim', '2026-12-25', undefined, 'https://visit.example/dublin']]);
  assert.deepEqual(out.notes.dropped.map((d) => d.reason), ['cites no search result', 'outside the period', 'numbers not in the source: 50,000', 'already in the list']);
  const search = new URL(f.calls.find((c) => c.url.includes('brave')).url);
  assert.equal(search.searchParams.get('q'), 'major events and festivities in Ireland December 2026');
  assert.match(f.calls.find((c) => c.url.includes('anthropic')).body.messages[0].content, /<source url="https:\/\/visit\.example\/dublin"/);
  assert.deepEqual(logs.map((l) => l.kind), ['search', 'llm']);
  await assert.rejects(createAI({ providers: [anthropic], fetch: f }).findOccasions({ country: 'IE', period: '2026-12' }), /No search provider/);
  await assert.rejects(ai.findOccasions({ country: 'Ireland', period: '2026-12' }), /two-letter/);
});

test('the draft prompt has its own Occasions and Tools sections', () => {
  for (const direction of [false, true]) {
    const p = loadPrompt('draft', { direction });
    assert.match(p.text, /# Occasions\n/);
    assert.match(p.text, /never say or imply that the brand does something for an occasion/i);
    assert.match(p.text, /at least one post in four takes one of the occasions/);
    assert.match(p.text, /# Tools\n/);
    assert.match(p.text, /`search_facts`/);
    assert.match(p.text, /`found`/);
  }
});
