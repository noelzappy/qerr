// "This period" in Draft with AI: the brand's country, the calendar's occasions for a period, the chosen occasions reaching the
// draft, "Look for events this month", and a fact the AI found on the web while drafting: saved unconfirmed, linked to its post,
// and blocking approval until a person confirms it. The real @qerr/ai library runs against a fake fetch; nothing leaves the machine.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateAiOptions } from './ai.js';
import { aiImport } from './engine/root.js';
import { runDraftBatch } from './services/ai-jobs.js';
import { approvalProblems } from './services/approval.js';
import { brandSettingsSchema } from './services/brand-settings.js';
import { createTestApp, type TestApp } from './testing.js';

const fake = vi.hoisted(() => ({ fetch: null as null | ((url: string, init?: RequestInit) => Promise<Response>) }));
const realCreateAI = (await aiImport<{ createAI: (options: unknown) => unknown }>()).createAI;
vi.mock('./ai.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ai.js')>()),
  loadAI: async () => ({ createAI: (options: CreateAiOptions) => realCreateAI({ ...options, fetch: fake.fetch, now: () => new Date('2026-11-20T10:00:00Z'), sleep: async () => {} } as never) as never }),
}));

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(async () => { await t.reset(); fake.fetch = null; });

const KEY = 'sk-ant-PERIODSPEC-1234567';
const SEARCH_KEY = 'BRAVE-PERIODSPEC-7654321';
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const USAGE = { input_tokens: 1000, output_tokens: 500 };
const answer = (input: unknown) => json({ content: [{ type: 'tool_use', id: 'r', name: 'respond', input }], usage: USAGE, stop_reason: 'tool_use' });
const toolUse = (name: string, input: unknown) => json({ content: [{ type: 'tool_use', id: 't1', name, input }], usage: USAGE, stop_reason: 'tool_use' });

async function setup({ search = false } = {}) {
  const admin = t.api(await t.signIn(await t.createUser('admin')));
  expect((await admin.post('/api/settings/ai/providers', { name: 'Claude', kind: 'anthropic', model: 'claude-test-1', apiKey: KEY, tasks: ['draft'], inputPricePerMTok: 3, outputPricePerMTok: 15 })).status).toBe(201);
  expect((await admin.put('/api/settings/ai/budget', { monthlyBudgetUsd: 5 })).status).toBe(200);
  if (search) expect((await admin.put('/api/settings/ai/search', { kind: 'brave', apiKey: SEARCH_KEY })).status).toBe(200);
  const editor = await t.createUser('editor');
  const fact = await t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'Field agents', body: 'Agents record each deposit on their phone.', status: 'confirmed' } });
  return { admin, editor, fact };
}

const BRIEF = { count: 1, periodStart: '2026-12-01', periodEnd: '2026-12-31', series: ['the-numbers'], channels: ['instagram'] as Array<'instagram'> };
const post = (sources: string[], caption: string) => ({
  id: '01-xmas', date: '2026-12-24', title: 'Christmas', caption, occasion: 'Christmas Day',
  design: { template: 'myth-fact', series: 'the-numbers', myth: 'Savings stop at Christmas', factLead: 'Agents record *each deposit*', fact: 'On their phone, every day.' },
  sources,
});

describe('brand country', () => {
  const SETTINGS = brandSettingsSchema.parse({
    name: 'Globex Garden', website: 'globex.example', tagline: 'Grow with us.', timezone: 'Europe/Dublin', colours: { primary: '#2E7D32', accent: '#F9A825', dark: '#1B2A1E', light: '#F3F7F2' },
    headlineWeight: 500, corners: 'round', series: [{ key: 'tips', name: 'Garden tips', ground: 'white', accent: 'colour' }], logo: { wordmarkFrom: 0, markGap: 0 },
  });

  it('is saved with the brand, reaches brand.json and the calendar, and must be a real code', async () => {
    const { admin, editor } = await setup();
    expect(SETTINGS.country).toBeNull();
    expect((await admin.put('/api/settings/brand', { ...SETTINGS, country: 'XX' })).status).toBe(400);
    const saved = await admin.put('/api/settings/brand', { ...SETTINGS, country: 'IE' });
    expect(saved.status).toBe(200);
    expect((await admin.get('/api/settings/brand')).body.settings.country).toBe('IE');
    const api = t.api(await t.signIn(editor));
    const res = await api.get('/api/batches/ai-draft/occasions?from=2026-12-01&to=2026-12-31');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ country: 'IE', covered: true });
    const names = res.body.occasions.map((o: { name: string }) => o.name);
    expect(names).toEqual(expect.arrayContaining(['Christmas Day', "St Stephen's Day", "New Year's Eve"]));
    expect(res.body.occasions.find((o: { name: string }) => o.name === 'Christmas Day')).toMatchObject({ date: '2026-12-25', kind: 'holiday' });
    expect((await api.get('/api/batches/ai-draft/occasions?from=2026-12-31&to=2026-12-01')).status).toBe(422);
    expect((await api.get('/api/batches/ai-draft/occasions?from=x&to=y')).status).toBe(422);
    // without a country only the global occasions come back
    expect((await admin.put('/api/settings/brand', { ...SETTINGS, country: null })).status).toBe(200);
    const plain = await api.get('/api/batches/ai-draft/occasions?from=2026-12-01&to=2026-12-31');
    expect(plain.body).toMatchObject({ country: null, covered: false });
    expect(plain.body.occasions.every((o: { kind: string }) => o.kind !== 'holiday')).toBe(true);
  });
});

describe('draft with the period\'s occasions', () => {
  it('sends the chosen occasions to the AI, lets a post name one with its date, and keeps the seasonal note', async () => {
    const { editor, fact } = await setup();
    const seen: any[] = [];
    fake.fetch = async (_url, init) => { seen.push(JSON.parse(String(init?.body))); return answer({ posts: [post([fact.id], 'Happy Christmas: Christmas Day is 25 December. Agents record each deposit on their phone.\n\n#AcmeSavings')] }); };
    const occasions = [
      { name: 'Christmas Day', date: '2026-12-25', kind: 'holiday' as const, note: 'A public holiday.', origin: 'calendar' as const },
      { name: 'Our winter fair', kind: 'observance' as const, origin: 'own' as const },
    ];
    const result = await runDraftBatch(t.deps, { actorId: editor.id, brief: { ...BRIEF, occasions } });
    const asked = JSON.parse(seen[0].messages[0].content.slice(seen[0].messages[0].content.indexOf('{')));
    expect(asked.occasions).toEqual([{ name: 'Christmas Day', date: '2026-12-25', kind: 'holiday', note: 'A public holiday.' }, { name: 'Our winter fair', kind: 'observance' }]);
    const batch = await t.prisma.batch.findUniqueOrThrow({ where: { id: result.batchId } });
    expect((batch.aiDraft as any).seasonal).toEqual({ occasions: [{ name: 'Christmas Day', date: '2026-12-25', kind: 'holiday' }, { name: 'Our winter fair', kind: 'observance' }], used: [{ postId: '01-xmas', occasion: 'Christmas Day', date: '2026-12-25' }] });
  });

  it('refuses more than five occasions of the person\'s own, and a malformed one', async () => {
    await setup();
    const api = t.api(await t.signIn(await t.createUser('editor')));
    const own = Array.from({ length: 6 }, (_, i) => ({ name: `Ours ${i}`, kind: 'observance', origin: 'own' }));
    expect((await api.post('/api/batches/ai-draft', { ...BRIEF, occasions: own })).status).toBe(400);
    expect((await api.post('/api/batches/ai-draft', { ...BRIEF, occasions: [{ name: 'x'.repeat(81), kind: 'observance' }] })).status).toBe(400);
    expect((await api.post('/api/batches/ai-draft', { ...BRIEF, occasions: [{ name: 'Fine', kind: 'party' }] })).status).toBe(400);
    expect((await api.post('/api/batches/ai-draft', { ...BRIEF, occasions: own.slice(0, 5) })).status).toBe(202);
  });

  it('a fact found on the web while drafting is saved unconfirmed, linked to its post, flagged, and blocks approval', async () => {
    const { editor, fact } = await setup({ search: true });
    const url = 'https://news.example/markets';
    let turn = 0;
    fake.fetch = async (u) => {
      if (u.includes('search.brave.com')) return json({ web: { results: [{ title: 'Markets', url, description: 'The Christmas market runs for 5 weeks this year.' }] } });
      turn += 1;
      if (turn === 1) return toolUse('search_web', { query: 'Christmas markets December 2026' });
      return answer({
        found: [{ id: 'found-market', kind: 'event', title: 'Christmas market', body: 'The Christmas market runs for 5 weeks this year.', sourceUrl: url }],
        posts: [post([fact.id, 'found-market'], 'The Christmas market runs for 5 weeks this year. Agents record each deposit on their phone.\n\n#AcmeSavings')],
      });
    };
    const result = await runDraftBatch(t.deps, { actorId: editor.id, brief: { ...BRIEF, occasions: [{ name: 'Christmas Day', date: '2026-12-25', kind: 'holiday' }] } });
    const found = await t.prisma.vaultItem.findFirstOrThrow({ where: { tags: { has: 'found-while-drafting' } } });
    expect(found).toMatchObject({ kind: 'event', title: 'Christmas market', status: 'unconfirmed', sourceUrl: url, confirmedById: null });
    expect(found.sourceNotes).toMatch(/Found on the web while drafting/);
    const p = await t.prisma.post.findFirstOrThrow({ where: { batchId: result.batchId }, include: { batch: true } });
    expect(p.sources).toEqual([fact.id, found.id]);
    expect(p.warnings).toContain('Uses a fact found on the web: confirm it in Facts first');
    expect((await approvalProblems(t.deps, p)).join(' ')).toMatch(/"Christmas market" has not been confirmed by a person/);
    // the search and the tool call are logged with the AI calls; no key is stored anywhere
    const calls = await t.prisma.aiCall.findMany({ orderBy: { at: 'asc' } });
    expect(calls.map((c) => c.kind).sort()).toEqual(['llm', 'llm', 'search', 'tool']);
    expect(JSON.stringify(await t.prisma.batch.findMany())).not.toContain(SEARCH_KEY);
  });
});

describe('look for events this month', () => {
  it('needs a search provider and a country, then returns proposals with their sources and logs the calls', async () => {
    await setup();
    const api = t.api(await t.signIn(await t.createUser('editor')));
    const body = { periodStart: '2026-12-01', periodEnd: '2026-12-31', known: ['Christmas Day'] };
    expect((await api.get('/api/batches/ai-draft')).body).toMatchObject({ ready: true, search: false });
    expect((await api.post('/api/batches/ai-draft/occasions/web', body)).status).toBe(409);
    const admin = t.api(await t.signIn(await t.createUser('admin')));
    expect((await admin.put('/api/settings/ai/search', { kind: 'brave', apiKey: SEARCH_KEY })).status).toBe(200);
    expect((await api.get('/api/batches/ai-draft')).body.search).toBe(true);
    // the demo brand names no country
    const noCountry = await api.post('/api/batches/ai-draft/occasions/web', body);
    expect(noCountry.status).toBe(409);
    expect(noCountry.body.message ?? noCountry.body.error).toMatch(/country/);
    const settings = (await admin.get('/api/settings/brand')).body.settings;
    expect((await admin.put('/api/settings/brand', { ...settings, country: 'IE' })).status).toBe(200);
    const url = 'https://visit.example/dublin';
    fake.fetch = async (u) => (u.includes('search.brave.com')
      ? json({ web: { results: [{ title: 'Dublin', url, description: 'Winter Lights runs from 4 December.' }] } })
      : answer({ occasions: [{ name: 'Winter Lights', date: '2026-12-04', kind: 'observance', note: 'Lights across the city from 4 December.', sourceUrl: url }] }));
    const res = await api.post('/api/batches/ai-draft/occasions/web', body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ country: 'IE', occasions: [{ name: 'Winter Lights', date: '2026-12-04', kind: 'observance', note: 'Lights across the city from 4 December.', source: url }] });
    expect((await t.prisma.aiCall.findMany()).map((c) => c.kind).sort()).toEqual(['llm', 'search']);
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.find_occasions' } })).toBe(1);
  });
});
