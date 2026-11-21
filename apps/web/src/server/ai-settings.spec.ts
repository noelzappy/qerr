import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getAiConfig } from './services/ai-config.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

const AI_KEY = 'sk-ant-SECRETAIKEY-9876';
const SEARCH_KEY = 'brave-SECRETSEARCH-4321';
const ID = '00000000-0000-0000-0000-000000000000';

const provider = (extra: Record<string, unknown> = {}) => ({ name: 'Claude', kind: 'anthropic', model: 'claude-x', apiKey: AI_KEY, tasks: ['draft', 'rewrite'], ...extra });

async function admin() {
  return t.api(await t.signIn(await t.createUser('admin')));
}

const ROUTES: Array<[string, string, unknown?]> = [
  ['GET', '/api/settings/ai'],
  ['POST', '/api/settings/ai/providers', provider()],
  ['PATCH', `/api/settings/ai/providers/${ID}`, { model: 'm' }],
  ['DELETE', `/api/settings/ai/providers/${ID}`],
  ['PUT', '/api/settings/ai/search', { kind: 'brave', apiKey: SEARCH_KEY }],
  ['PUT', '/api/settings/ai/budget', { monthlyBudgetUsd: 10 }],
  ['PUT', '/api/settings/research/topics', { topics: ['mobile money'] }],
  ['POST', '/api/settings/research/run'],
];

describe('ai settings: access', () => {
  it.each(ROUTES)('%s %s: anonymous 401, editor 403', async (method, url, body) => {
    const call = (cookies?: string) => {
      const a = t.api(cookies);
      const m = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
      return m === 'get' || m === 'delete' ? a[m](url) : a[m](url, body);
    };
    expect((await call()).status).toBe(401);
    expect((await call(await t.signIn(await t.createUser('editor')))).status).toBe(403);
    expect(await t.prisma.aiProvider.count()).toBe(0);
    expect(t.jobs.enqueued).toHaveLength(0);
  });
});

describe('ai settings', () => {
  it('stores providers, search, budget and topics; no key is ever returned or audited; getAiConfig decrypts', async () => {
    const api = await admin();
    const created = await api.post('/api/settings/ai/providers', provider());
    expect(created.status).toBe(201);
    expect(created.body.provider).toMatchObject({ kind: 'anthropic', baseUrl: 'https://api.anthropic.com', keyLast4: '9876', tasks: ['draft', 'rewrite'], enabled: true });
    const id = created.body.provider.id;
    const compat = await api.post('/api/settings/ai/providers', provider({ name: 'Local', kind: 'openai-compatible', baseUrl: 'http://localhost:11434/v1/', model: 'llama', tasks: ['research'] }));
    expect(compat.status).toBe(201);
    expect(compat.body.provider.baseUrl).toBe('http://localhost:11434/v1');

    await api.put('/api/settings/ai/search', { kind: 'brave', apiKey: SEARCH_KEY });
    await api.put('/api/settings/ai/budget', { monthlyBudgetUsd: 25.5 });
    await api.put('/api/settings/research/topics', { topics: ['mobile money', 'savings', 'mobile money'] });
    const patched = await api.patch(`/api/settings/ai/providers/${id}`, { apiKey: '', model: 'claude-y', enabled: true });
    expect(patched.body.provider).toMatchObject({ model: 'claude-y', keyLast4: '9876' });

    const view = await api.get('/api/settings/ai');
    expect(view.body.providers).toHaveLength(2);
    expect(view.body.search).toMatchObject({ kind: 'brave', keyLast4: '4321' });
    expect(view.body.budget).toMatchObject({ monthlyBudgetUsd: 25.5, spentUsd: 0 });
    expect(view.body.topics).toEqual(['mobile money', 'savings']);

    const everything = JSON.stringify([created.body, view.body, patched.body, await t.prisma.auditLog.findMany()]);
    expect(everything).not.toContain('SECRETAIKEY');
    expect(everything).not.toContain('SECRETSEARCH');
    for (const row of await t.prisma.aiProvider.findMany()) expect(row.keyCipher).not.toContain('SECRET');

    const config = await getAiConfig(t.deps);
    expect(config.providers.find((p) => p.id === id)).toEqual({ id, kind: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-y', apiKey: AI_KEY, tasks: ['draft', 'rewrite'] });
    expect(config.search).toEqual({ kind: 'brave', apiKey: SEARCH_KEY });
    expect(config.budget).toEqual({ monthlyLimitUsd: 25.5, spentUsd: 0 });

    await api.patch(`/api/settings/ai/providers/${id}`, { enabled: false });
    expect((await getAiConfig(t.deps)).providers.map((p) => p.id)).not.toContain(id);
    expect((await api.delete(`/api/settings/ai/providers/${id}`)).status).toBe(200);
    expect(await t.prisma.aiProvider.count()).toBe(1);
  });

  it('rejects a base URL that is not https (except localhost), bad tasks, bad budgets and bad search bodies', async () => {
    const api = await admin();
    const bad = async (extra: Record<string, unknown>) => (await api.post('/api/settings/ai/providers', provider({ kind: 'openai-compatible', baseUrl: 'https://api.example.com/v1', ...extra }))).status;
    expect(await bad({ baseUrl: 'http://api.example.com/v1' })).toBe(400);
    expect(await bad({ baseUrl: 'ftp://api.example.com' })).toBe(400);
    expect(await bad({ baseUrl: 'not a url' })).toBe(400);
    expect(await bad({ baseUrl: 'https://user:pass@api.example.com' })).toBe(400);
    expect(await bad({ baseUrl: undefined })).toBe(400);
    expect(await bad({ tasks: ['draft', 'sing'] })).toBe(400);
    expect(await bad({ tasks: [] })).toBe(400);
    expect(await bad({ kind: 'gemini' })).toBe(400);
    expect(await bad({ apiKey: 'short' })).toBe(400);
    expect(await bad({})).toBe(201);
    expect((await api.put('/api/settings/ai/budget', { monthlyBudgetUsd: -1 })).status).toBe(400);
    expect((await api.put('/api/settings/ai/search', { kind: 'bing', apiKey: SEARCH_KEY })).status).toBe(400);
    expect((await api.put('/api/settings/ai/search', { kind: 'exa' })).status).toBe(400);
    expect((await api.put('/api/settings/research/topics', { topics: 'one' })).status).toBe(400);
    const id = (await t.prisma.aiProvider.findFirstOrThrow()).id;
    expect((await api.patch(`/api/settings/ai/providers/${id}`, { baseUrl: 'http://evil.example.com' })).status).toBe(400);
  });

  it('keeps the search key when only the kind changes, and queues a research run once', async () => {
    const api = await admin();
    await api.put('/api/settings/ai/search', { kind: 'brave', apiKey: SEARCH_KEY });
    await api.put('/api/settings/ai/search', { kind: 'tavily' });
    expect((await getAiConfig(t.deps)).search).toEqual({ kind: 'tavily', apiKey: SEARCH_KEY });

    const first = await api.post('/api/settings/research/run');
    expect(first.status).toBe(202);
    expect(first.body.queued).toBe(true);
    expect(t.jobs.enqueued.map((j) => j.name)).toEqual(['research-run']);
    expect(JSON.stringify(t.jobs.enqueued)).not.toContain('SECRET');
    expect((await api.post('/api/settings/research/run')).body).toMatchObject({ queued: false, alreadyQueued: true });
  });

  it('with no budget saved the AI limit is 0, and logged costs add to the month', async () => {
    expect((await getAiConfig(t.deps)).budget).toEqual({ monthlyLimitUsd: 0, spentUsd: 0 });
    const config = await getAiConfig(t.deps);
    config.log!({ costUsd: 0.25 });
    config.log!({ costUsd: 0.5 });
    config.log!({ note: 'no cost' });
    await config.flush();
    expect((await getAiConfig(t.deps)).budget.spentUsd).toBeCloseTo(0.75);
    const api = await admin();
    expect((await api.get('/api/settings/ai')).body.budget.spentUsd).toBeCloseTo(0.75);
  });

  it('keeps per-million-token prices on a provider (both or neither), hands them to the AI library and logs one row per call', async () => {
    const api = await admin();
    expect((await api.post('/api/settings/ai/providers', provider({ inputPricePerMTok: 3 }))).status).toBe(400);
    expect((await api.post('/api/settings/ai/providers', provider({ inputPricePerMTok: -1, outputPricePerMTok: 1 }))).status).toBe(400);
    const created = await api.post('/api/settings/ai/providers', provider({ inputPricePerMTok: 3, outputPricePerMTok: 15 }));
    expect(created.status).toBe(201);
    expect(created.body.provider).toMatchObject({ inputPricePerMTok: 3, outputPricePerMTok: 15 });
    expect((await getAiConfig(t.deps)).providers[0]!.prices).toEqual({ 'claude-x': { inputPerMTok: 3, outputPerMTok: 15 } });
    const id = created.body.provider.id;
    expect((await api.patch(`/api/settings/ai/providers/${id}`, { outputPricePerMTok: null })).status).toBe(400);
    expect((await api.patch(`/api/settings/ai/providers/${id}`, { inputPricePerMTok: null, outputPricePerMTok: null })).body.provider).toMatchObject({ inputPricePerMTok: null, outputPricePerMTok: null });
    expect((await getAiConfig(t.deps)).providers[0]!.prices).toBeUndefined();

    const config = await getAiConfig(t.deps, { runId: 'run-1', actorId: 'u1' });
    config.log!({ at: '2026-11-18T09:00:00.000Z', kind: 'llm', provider: 'p', model: 'claude-x', task: 'draft', tokensIn: 10, tokensOut: 5, cost: 'unknown', ms: 120, ok: true });
    config.log!({ kind: 'llm', task: 'draft', tokensIn: null, tokensOut: null, cost: 0.4, ms: 5, ok: false, error: 'x'.repeat(900) });
    await config.flush();
    const rows = await t.prisma.aiCall.findMany({ orderBy: { at: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ runId: 'run-1', actorId: 'u1', costUsd: null, tokensIn: 10, durationMs: 120, ok: true });
    expect(rows[1]).toMatchObject({ ok: false, costUsd: 0.4 });
    expect(rows[1]!.error).toHaveLength(500);
  });
});
