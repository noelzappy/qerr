import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateAiOptions } from './ai.js';
import { brandInfo } from './brand.js';
import { aiImport } from './engine/root.js';
import { handlers } from './jobs/handlers.js';
import { runDraftBatch, runResearch, runRewrite } from './services/ai-jobs.js';
import { monthRange, spentThisMonth } from './services/ai-config.js';
import { createTestApp, type TestApp } from './testing.js';

// The AI library is built elsewhere; this stands in for it. Tests set `ai` to what the fake should answer.
const fake = vi.hoisted(() => ({
  calls: [] as Array<{ task: string; input: any }>,
  options: null as null | CreateAiOptions,
  research: null as any,
  draft: null as any,
  rewrite: null as any,
  // When set, createAI is the real @vesk/ai library talking to this fetch, so the draft tests cover the library's own checks.
  fetch: null as null | ((url: string, init?: RequestInit) => Promise<Response>),
}));
const realCreateAI = (await aiImport<{ createAI: (options: unknown) => unknown }>()).createAI;
vi.mock('./ai.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ai.js')>()),
  loadAI: async () => ({
    createAI: (options: CreateAiOptions) => {
      fake.options = options;
      if (fake.fetch) return realCreateAI({ ...options, fetch: fake.fetch, now: () => new Date('2026-11-20T10:00:00Z'), sleep: async () => {} } as never) as never;
      return {
        research: async (input: unknown) => { fake.calls.push({ task: 'research', input }); options.log?.({ costUsd: 0.1 }); if (fake.research instanceof Error) throw fake.research; return fake.research; },
        draftBatch: async (input: unknown) => { fake.calls.push({ task: 'draft', input }); if (fake.draft instanceof Error) throw fake.draft; return fake.draft; },
        rewrite: async (input: unknown) => { fake.calls.push({ task: 'rewrite', input }); if (fake.rewrite instanceof Error) throw fake.rewrite; return fake.rewrite; },
      };
    },
  }),
}));

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(async () => {
  await t.reset();
  fake.calls.length = 0;
  fake.options = null;
  fake.fetch = null;
});

const KEY = 'sk-ant-SECRETAIKEY-9876';
async function addProvider(tasks: string[]) {
  const admin = t.api(await t.signIn(await t.createUser('admin')));
  const res = await admin.post('/api/settings/ai/providers', { name: 'Claude', kind: 'anthropic', model: 'm', apiKey: KEY, tasks });
  expect(res.status).toBe(201);
  return admin;
}

describe('research-run', () => {
  it('turns results into unconfirmed vault items with their sources, and appends checks as notes only', async () => {
    const admin = await addProvider(['research']);
    await admin.put('/api/settings/research/topics', { topics: ['mobile money rules'] });
    const person = await t.createUser('editor');
    const existing = await t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'Rate is 1%', body: 'x', status: 'confirmed', confirmedById: person.id, confirmedAt: new Date(), sourceNotes: 'from the rate card' } });
    fake.research = {
      items: [
        { kind: 'news', title: 'New e-levy rule', body: 'Details', sourceUrls: ['https://example.com/a', 'https://example.com/b'], foundAt: '2026-11-18T00:00:00Z' },
        { kind: 'photo', title: 'A photo?', body: '', sourceUrls: [], foundAt: '2026-11-18' },
        { title: '', body: 'no title' },
      ],
      checks: [{ vaultItemId: existing.id, verdict: 'outdated', sourceUrls: ['https://example.com/c'], note: 'The rate changed to 1.5%' }, { vaultItemId: 'missing', verdict: 'ok', sourceUrls: [], note: '' }],
    };
    await t.jobs.enqueue('research-run', { actorId: 'someone' });
    await t.jobs.drain(t.deps);

    expect(fake.calls[0]!.input.topics).toEqual(['mobile money rules']);
    expect(fake.calls[0]!.input.vault.map((v: any) => v.title)).toContain('Rate is 1%');
    expect(fake.options!.providers[0]).toMatchObject({ kind: 'anthropic', apiKey: KEY, tasks: ['research'] });
    const items = await t.prisma.vaultItem.findMany({ where: { id: { not: existing.id } }, orderBy: { title: 'asc' } });
    expect(items.map((i) => i.title)).toEqual(['A photo?', 'New e-levy rule']);
    expect(items.every((i) => i.status === 'unconfirmed' && i.confirmedById === null)).toBe(true);
    const news = items.find((i) => i.title === 'New e-levy rule')!;
    expect(news).toMatchObject({ kind: 'news', sourceUrl: 'https://example.com/a', tags: ['ai-research'] });
    expect(news.sourceNotes).toContain('https://example.com/b');
    expect(items.find((i) => i.title === 'A photo?')!.kind).toBe('news');

    const checked = await t.prisma.vaultItem.findUniqueOrThrow({ where: { id: existing.id } });
    expect(checked.status).toBe('confirmed');
    expect(checked.sourceNotes).toContain('from the rate card');
    expect(checked.sourceNotes).toContain('outdated: The rate changed to 1.5%');
    expect(await t.prisma.appSetting.findUnique({ where: { key: 'researchLastRunAt' } })).not.toBeNull();
    expect((await admin.get('/api/settings/ai')).body.budget.spentUsd).toBeCloseTo(0.1);
    expect(JSON.stringify(await t.prisma.auditLog.findMany())).not.toContain('SECRETAIKEY');

    // The next run passes `since`.
    await handlers.researchRun(t.deps, {});
    expect(fake.calls[1]!.input.since).toBeTruthy();
  });

  it('stops with a clear message without topics or a research provider', async () => {
    await expect(runResearch(t.deps, {})).rejects.toThrow('no research topics');
    await expect(runResearch(t.deps, { topics: ['x'] })).rejects.toThrow('No AI provider is set up for research');
    await addProvider(['draft']);
    await expect(runResearch(t.deps, { topics: ['x'] })).rejects.toThrow('No AI provider is set up for research');
    expect(fake.calls).toHaveLength(0);
  });
});

describe('rewrite-post and draft-batch', () => {
  async function batchWithPost() {
    const owner = await t.createUser('editor');
    const batch = await t.prisma.batch.create({ data: { name: 'dec', title: 'December', timezone: 'UTC', defaultTime: '10:00', defaultNetworks: ['x', 'instagram'], periodStart: '2026-12-01', periodEnd: '2026-12-31', ownerId: owner.id } });
    const source = await t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'Fact', body: 'b', status: 'confirmed' } });
    const post = await t.prisma.post.create({ data: { batchId: batch.id, postKey: 'p1', position: 1, title: 'T', date: '2026-12-02', time: '10:00', caption: 'Old words', sources: [source.id] } });
    return { batch, post, source };
  }

  it('rewrite calls the AI with the post and its sources and returns the result without changing the post', async () => {
    await addProvider(['rewrite']);
    const { post, source } = await batchWithPost();
    fake.rewrite = { caption: 'New words' };
    const result = await runRewrite(t.deps, { postId: post.id, instruction: 'Shorter' });
    expect(result).toEqual({ caption: 'New words' });
    expect(fake.calls[0]!.input.post).toMatchObject({ postKey: 'p1', caption: 'Old words' });
    expect(fake.calls[0]!.input.vault.map((v: any) => v.id)).toEqual([source.id]);
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } })).caption).toBe('Old words');
    expect((await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'ai.rewrite_post' } })).entityId).toBe(post.id);
    await expect(runRewrite(t.deps, { postId: 'nope', instruction: 'x' })).rejects.toThrow('not found');
    await expect(runRewrite(t.deps, { postId: post.id, instruction: '' })).rejects.toThrow();
  });
});

// ---- draft-batch, with the real AI library over a fake fetch ----

const anthropicReply = (input: unknown, usage = { input_tokens: 1000, output_tokens: 500 }) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'respond', input }], usage, stop_reason: 'tool_use' }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('draft-batch', () => {
  const MODEL = 'claude-test-1';
  const BRIEF = { count: 1, periodStart: '2026-12-01', periodEnd: '2026-12-31', series: ['the-numbers'], channels: ['instagram', 'x'] as Array<'instagram' | 'x'> };

  async function setup(options: { budget?: number; priced?: boolean } = {}) {
    const admin = t.api(await t.signIn(await t.createUser('admin')));
    const res = await admin.post('/api/settings/ai/providers', {
      name: 'Claude', kind: 'anthropic', model: MODEL, apiKey: KEY, tasks: ['draft'],
      ...(options.priced === false ? {} : { inputPricePerMTok: 3, outputPricePerMTok: 15 }),
    });
    expect(res.status).toBe(201);
    expect((await admin.put('/api/settings/ai/budget', { monthlyBudgetUsd: options.budget ?? 5 })).status).toBe(200);
    const editor = await t.createUser('editor');
    const figure = await t.prisma.vaultItem.create({ data: { kind: 'figure', title: 'Processed volume', body: 'Acme Savings has processed over € 14.8 million.', status: 'confirmed', recordedAt: new Date('2026-11-01') } });
    const photo = await t.prisma.vaultItem.create({ data: { kind: 'photo', title: 'Market', body: 'A street market.', status: 'confirmed', licence: 'own', fileKey: 'vault/market.jpg', fileName: 'market.jpg', contentType: 'image/jpeg', size: 10 } });
    const unconfirmed = await t.prisma.vaultItem.create({ data: { kind: 'news', title: 'A notice', body: 'A regulator notice mentions 12 new rules.', status: 'unconfirmed' } });
    return { admin, editor, figure, photo, unconfirmed };
  }

  const goodPost = (figureId: string, photoId: string) => ({
    id: '01-numbers', date: '2026-12-02', title: 'The numbers',
    caption: 'Trusted with real money, every day.\n\nOver € 14.8 million processed through Acme Savings.\n\n#AcmeSavings #Savings #the region',
    design: { template: 'photo', series: 'the-numbers', image: `vault:${photoId}`, headline: 'Trusted with *real money*' },
    sources: [figureId], imageReason: 'Hands counting notes, matching the message about real money moving daily.', imageSuggestion: 'Hands counting notes, no faces',
  });

  it('turns the answer into a draft batch with sources, warnings and notes, queues the render and logs every call', async () => {
    const { editor, figure, photo, unconfirmed } = await setup();
    const seen: any[] = [];
    fake.fetch = async (_url, init) => { seen.push(JSON.parse(String(init?.body))); return anthropicReply({ plan: 'Numbers first.', posts: [goodPost(figure.id, photo.id)] }); };

    const result = await runDraftBatch(t.deps, { actorId: editor.id, brief: BRIEF });

    const batch = await t.prisma.batch.findUniqueOrThrow({ where: { id: result.batchId }, include: { posts: true } });
    expect(batch).toMatchObject({ status: 'draft', ownerId: editor.id, periodStart: '2026-12-01', periodEnd: '2026-12-31', timezone: brandInfo().timezone, defaultNetworks: ['instagram', 'x'] });
    expect(batch.title).toBe('AI draft for December 2026');
    expect(batch.aiDraft).toMatchObject({ promptVersion: expect.any(String), model: MODEL, delivered: 1, requested: 1, requestedById: editor.id });
    expect((batch.aiDraft as any).imageSuggestions).toEqual([{ postId: '01-numbers', suggestion: 'Hands counting notes, no faces' }]);
    expect((batch.aiDraft as any).imageReasons).toEqual([{ postId: '01-numbers', reason: expect.stringContaining('Hands counting notes') }]);
    expect(batch.posts).toHaveLength(1);
    const post = batch.posts[0]!;
    expect(post.postKey).toBe('01-numbers');
    expect(post.sources).toEqual(expect.arrayContaining([figure.id]));
    expect(post.sources).not.toContain(unconfirmed.id);
    // The design points at the vault photo, and nothing about it needs a warning: it is confirmed and cleared.
    expect(post.warnings).toEqual([]);
    expect((post.design as any).vaultItemId).toBe(photo.id);
    expect(post.renderStatus).toBe('queued');
    expect(t.jobs.enqueued.filter((j) => j.name === 'render-post').map((j) => (j.payload as any).postId)).toEqual([post.id]);

    // The model saw confirmed items only, and photos by id with the made-up path, never the bucket key.
    const sent = JSON.stringify(seen[0]);
    expect(sent).toContain(figure.id);
    expect(sent).not.toContain(unconfirmed.id);
    expect(sent).not.toContain('vault/market.jpg');

    // One row per call, tied to the batch, with a cost; month-to-date spend is their sum and shows on the settings page.
    const calls = await t.prisma.aiCall.findMany();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: 'llm', task: 'draft', model: MODEL, tokensIn: 1000, tokensOut: 500, ok: true, batchId: batch.id, actorId: editor.id });
    expect(calls[0]!.costUsd).toBeCloseTo((1000 * 3 + 500 * 15) / 1_000_000);
    expect(await spentThisMonth(t.deps)).toBeCloseTo(0.0105);
    const admin = t.api(await t.signIn(await t.createUser('admin')));
    expect((await admin.get('/api/settings/ai')).body.budget).toMatchObject({ monthlyBudgetUsd: 5, unpricedCalls: 0 });
    expect((await admin.get('/api/settings/ai')).body.budget.spentUsd).toBeCloseTo(0.0105);
    expect((await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'ai.draft_batch' } })).entityId).toBe(batch.id);

    // The list marks it, and the batch answer carries the notes.
    const list = await t.api(await t.signIn(editor)).get('/api/batches');
    expect(list.body.batches[0]).toMatchObject({ id: batch.id, aiDrafted: true });
    const one = await t.api(await t.signIn(editor)).get(`/api/batches/${batch.id}`);
    expect(one.body.batch.aiDraft.model).toBe(MODEL);
    expect(await handlers.draftBatch(t.deps, { actorId: editor.id, brief: BRIEF }).then(() => 'ok')).toBe('ok');
    expect(await t.prisma.batch.count()).toBe(2);
  });

  it('offers only usable items to the model (no unconfirmed or rights-unsettled picture, no unconfirmed fact), and refuses a post that uses one', async () => {
    const { editor, figure, photo, unconfirmed } = await setup();
    const make = (data: Record<string, unknown>) => t.prisma.vaultItem.create({ data: { kind: 'photo', body: 'x', fileKey: 'vault/c.jpg', fileName: 'c.jpg', contentType: 'image/jpeg', size: 10, ...data } as never });
    const draft = await make({ title: 'Calculator', status: 'unconfirmed', licence: 'licensed', licenceNotes: 'Pexels License' });
    const open = await make({ title: 'Rights open', status: 'confirmed', licence: 'rights_to_confirm' });
    const noLicence = await make({ title: 'No licence', status: 'confirmed' });
    const noFile = await make({ title: 'Missing', status: 'unconfirmed', fileKey: null });
    const seen: any[] = [];
    fake.fetch = async (_url, init) => { seen.push(JSON.parse(String(init?.body))); return anthropicReply({ plan: 'One post.', posts: [goodPost(figure.id, draft.id)] }); };

    await expect(runDraftBatch(t.deps, { actorId: editor.id, brief: BRIEF })).rejects.toThrow();

    const sent = JSON.stringify(seen[0]);
    expect(sent).toContain(photo.id);
    for (const hidden of [draft, open, noLicence, noFile, unconfirmed]) expect(sent).not.toContain(hidden.id);
    expect(await t.prisma.batch.count()).toBe(0);
  });

  it('is requested through the API for editors, and refused when no provider can draft', async () => {
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    const none = await editor.post('/api/batches/ai-draft', BRIEF);
    expect(none.status).toBe(409);
    expect(none.body.message ?? none.body.error).toContain('No AI provider is set up for drafting');
    await setup();
    const ok = await editor.post('/api/batches/ai-draft', BRIEF);
    expect(ok.status).toBe(202);
    expect(t.jobs.enqueued.find((j) => j.name === 'draft-batch')?.payload).toMatchObject({ brief: { count: 1 } });
    expect((await editor.post('/api/batches/ai-draft', { count: 99 })).status).toBe(400);
  });

  it('stops with a clear error and makes nothing when the monthly budget is used up', async () => {
    const { editor, figure, photo } = await setup({ budget: 0.01 });
    // Spend already logged this month reaches the limit.
    await t.prisma.aiCall.create({ data: { at: monthRange(t.deps.now()).start, kind: 'llm', task: 'draft', model: MODEL, costUsd: 0.02 } });
    let called = 0;
    fake.fetch = async () => { called += 1; return anthropicReply({ posts: [goodPost(figure.id, photo.id)] }); };
    await expect(runDraftBatch(t.deps, { actorId: editor.id, brief: BRIEF })).rejects.toThrow(/monthly AI budget is used up/);
    expect(called).toBe(0);
    expect(await t.prisma.batch.count()).toBe(0);
    const failed = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'ai.draft_batch.failed' } });
    expect(failed.actorId).toBe(editor.id);
    expect((failed.detail as any)).toMatchObject({ code: 'budget' });
    expect(JSON.stringify(failed.detail)).not.toContain('SECRETAIKEY');
  });

  it('fails visibly and makes nothing when the AI answer is not valid', async () => {
    const { editor, figure, photo } = await setup();
    // Not the shape asked for (twice: the library asks once more before it gives up).
    fake.fetch = async () => anthropicReply({ notes: 'no posts here' });
    await expect(runDraftBatch(t.deps, { actorId: editor.id, brief: BRIEF })).rejects.toThrow();
    expect(await t.prisma.batch.count()).toBe(0);
    expect(await t.prisma.post.count()).toBe(0);
    const failed = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'ai.draft_batch.failed' } });
    expect((failed.detail as any).code).toBe('invalid_output');
    // The calls that were made are still on record, with no batch.
    expect((await t.prisma.aiCall.findMany()).every((c) => c.batchId === null)).toBe(true);
    expect(t.jobs.enqueued.filter((j) => j.name === 'render-post')).toHaveLength(0);

    // A post whose figure is not in its cited source is thrown away by the library's checks: no valid posts, nothing made.
    fake.fetch = async () => anthropicReply({ posts: [{ ...goodPost(figure.id, photo.id), caption: 'Over € 99 million processed. #AcmeSavings #Savings #the region' }] });
    await expect(runDraftBatch(t.deps, { actorId: editor.id, brief: BRIEF })).rejects.toThrow(/None of the drafted posts passed/);
    expect(await t.prisma.batch.count()).toBe(0);
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.draft_batch.failed' } })).toBe(2);
  });

  it('counts calls without a price separately, so the settings page can say the budget cannot see them', async () => {
    const { editor, figure, photo } = await setup({ priced: false });
    fake.fetch = async () => anthropicReply({ posts: [goodPost(figure.id, photo.id)] });
    await runDraftBatch(t.deps, { actorId: editor.id, brief: BRIEF });
    expect((await t.prisma.aiCall.findFirstOrThrow()).costUsd).toBeNull();
    const admin = t.api(await t.signIn(await t.createUser('admin')));
    expect((await admin.get('/api/settings/ai')).body.budget).toMatchObject({ spentUsd: 0, unpricedCalls: 1 });
  });
});

// ---- what people see: the activity run of each job ----

describe('activity of the AI jobs', () => {
  const NOTES = {
    windowStart: '2025-11-20', model: 'm',
    topics: [{ topic: 'savings groups', results: 4, pagesRead: 1, skipped: ['https://old.example/a: published 2017-03-01, before 2025-11-20', 'https://x.example/b: almost no text'] }],
    dropped: [{ title: 'A claim', reason: 'cites no page that was read' }],
  };

  it('research: a person starts it, it is queued with its job, then done with the notes: topics, skipped pages and dropped items', async () => {
    const admin = await addProvider(['research']);
    await admin.put('/api/settings/research/topics', { topics: ['savings groups'] });
    fake.research = { items: [{ kind: 'news', title: 'Notice', body: 'Details', sourceUrls: ['https://example.com/a'], foundAt: '2026-11-18' }], checks: [], notes: NOTES };
    const res = await admin.post('/api/settings/research/run');
    expect(res.status).toBe(202);
    const queued = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: res.body.activityId } });
    expect(queued).toMatchObject({ kind: 'research-run', status: 'queued', title: 'Research run', jobId: 'fake-1' });

    await t.jobs.drain(t.deps);
    const run = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: queued.id } });
    expect(run.status).toBe('done');
    const result = run.result as any;
    expect(result).toMatchObject({ created: 1, checked: 0, windowStart: '2025-11-20' });
    expect(result.topics[0].skipped[0]).toMatch(/published 2017-03-01, before 2025-11-20/);
    expect(result.dropped).toEqual([{ title: 'A claim', reason: 'cites no page that was read' }]);
    expect(await t.prisma.activityRun.count()).toBe(1);
  });

  it('research: a second request while one is waiting points at the run that is waiting, and makes no new one', async () => {
    const admin = await addProvider(['research']);
    const first = await admin.post('/api/settings/research/run');
    const second = await admin.post('/api/settings/research/run');
    expect(second.body).toMatchObject({ queued: false, alreadyQueued: true, activityId: first.body.activityId });
    expect(await t.prisma.activityRun.count()).toBe(1);
  });

  it('research: a failure ends the run as failed with a readable reason that holds no key', async () => {
    const admin = await addProvider(['draft']);
    await admin.put('/api/settings/research/topics', { topics: ['x'] });
    const res = await admin.post('/api/settings/research/run');
    await expect(t.jobs.drain(t.deps)).rejects.toThrow('No AI provider is set up for research');
    const run = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: res.body.activityId } });
    expect(run).toMatchObject({ status: 'failed', error: 'No AI provider is set up for research. Add one in Settings, AI.' });
    expect(run.finishedAt).not.toBeNull();
    expect(JSON.stringify(run)).not.toContain('SECRETAIKEY');
  });

  it('research: a run called without a queued run (the settings page, a test) makes its own', async () => {
    const admin = await addProvider(['research']);
    await admin.put('/api/settings/research/topics', { topics: ['t'] });
    fake.research = { items: [], checks: [] };
    await handlers.researchRun(t.deps, {});
    const run = await t.prisma.activityRun.findFirstOrThrow();
    expect(run).toMatchObject({ kind: 'research-run', status: 'done', actorId: null });
    expect(run.startedAt).not.toBeNull();
  });

  it('draft: the request answers with the run, which reports its steps and ends with the batch, delivered and requested', async () => {
    const admin = t.api(await t.signIn(await t.createUser('admin')));
    await admin.post('/api/settings/ai/providers', { name: 'Claude', kind: 'anthropic', model: 'claude-test-1', apiKey: KEY, tasks: ['draft'], inputPricePerMTok: 3, outputPricePerMTok: 15 });
    await admin.put('/api/settings/ai/budget', { monthlyBudgetUsd: 5 });
    const figure = await t.prisma.vaultItem.create({ data: { kind: 'figure', title: 'Processed volume', body: 'Acme Savings has processed over € 14.8 million.', status: 'confirmed', recordedAt: new Date('2026-11-01') } });
    const photo = await t.prisma.vaultItem.create({ data: { kind: 'photo', title: 'Market', body: 'A street market.', status: 'confirmed', licence: 'own', fileKey: 'vault/market.jpg', fileName: 'market.jpg', contentType: 'image/jpeg', size: 10 } });
    fake.fetch = async () => anthropicReply({
      plan: 'p',
      posts: [{ id: '01-numbers', date: '2026-12-02', title: 'The numbers', caption: 'Trusted with real money, every day.\n\nOver € 14.8 million processed through Acme Savings.\n\n#AcmeSavings #Savings #the region', design: { template: 'photo', series: 'the-numbers', image: `vault:${photo.id}`, headline: 'Trusted with *real money*' }, imageReason: 'A photo of real money, matching the message.', sources: [figure.id] }],
    });
    const editor = await t.createUser('editor');
    const api = t.api(await t.signIn(editor));
    const res = await api.post('/api/batches/ai-draft', { count: 1, periodStart: '2026-12-01', periodEnd: '2026-12-31', series: ['the-numbers'], channels: ['instagram', 'x'] });
    expect(res.status).toBe(202);
    const queued = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: res.body.activityId } });
    expect(queued).toMatchObject({ kind: 'draft-batch', status: 'queued', actorId: editor.id, title: 'AI draft for December 2026' });

    // Not drain: that would also start Chrome for the render the import queues.
    const job = t.jobs.enqueued.find((j) => j.name === 'draft-batch')!;
    await handlers.draftBatch(t.deps, job.payload as never);

    const run = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: queued.id } });
    const batch = await t.prisma.batch.findFirstOrThrow();
    expect(run.status).toBe('done');
    expect(run.result).toMatchObject({ batchId: batch.id, delivered: 1, requested: 1 });
    expect((run.progress as any).step).toBe('Images queued for rendering');
    // The render the import queued has its own run, tied to the batch and the post, started by the same person.
    const render = await t.prisma.activityRun.findFirstOrThrow({ where: { kind: 'render-post' } });
    expect(render).toMatchObject({ status: 'queued', batchId: batch.id, actorId: editor.id, title: 'Render: The numbers' });
    expect(await t.prisma.activityRun.count({ where: { kind: 'draft-batch' } })).toBe(1);
  });

  it('draft: when the AI fails the run is failed with the reason and no batch exists', async () => {
    const admin = t.api(await t.signIn(await t.createUser('admin')));
    await admin.post('/api/settings/ai/providers', { name: 'Claude', kind: 'anthropic', model: 'm', apiKey: KEY, tasks: ['draft'] });
    await admin.put('/api/settings/ai/budget', { monthlyBudgetUsd: 0.01 });
    await t.prisma.aiCall.create({ data: { at: monthRange(t.deps.now()).start, kind: 'llm', task: 'draft', model: 'm', costUsd: 0.02 } });
    await t.prisma.vaultItem.create({ data: { kind: 'figure', title: 'F', body: 'x', status: 'confirmed' } });
    fake.fetch = async () => anthropicReply({ posts: [] });
    const editor = await t.createUser('editor');
    const res = await t.api(await t.signIn(editor)).post('/api/batches/ai-draft', { count: 1 });
    await expect(t.jobs.drain(t.deps)).rejects.toThrow(/monthly AI budget/);
    const run = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: res.body.activityId } });
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/monthly AI budget/);
    expect(JSON.stringify(run)).not.toContain('SECRETAIKEY');
    expect(await t.prisma.batch.count()).toBe(0);
  });

  it('keeps the provider and search keys out of a stored error and result, even when a provider error quotes them', async () => {
    const admin = await addProvider(['research', 'draft', 'rewrite']);
    await admin.put('/api/settings/research/topics', { topics: ['t'] });
    const searchKey = 'srch-SEARCHKEY-55555';
    await admin.put('/api/settings/ai/search', { kind: 'brave', apiKey: searchKey });

    fake.research = new Error(`401 from provider: invalid x-api-key ${KEY} (search key ${searchKey})`);
    await expect(handlers.researchRun(t.deps, {})).rejects.toThrow('401');
    let run = await t.prisma.activityRun.findFirstOrThrow({ where: { kind: 'research-run' } });
    expect(run.status).toBe('failed');
    expect(JSON.stringify(run)).not.toContain(KEY);
    expect(JSON.stringify(run)).not.toContain(searchKey);
    expect(run.error).toContain('[hidden]');

    // a key quoted in the notes of a good run is taken out of the stored result
    await t.prisma.activityRun.deleteMany();
    fake.research = { items: [], checks: [], notes: { topics: [{ topic: 't', results: 1, pagesRead: 0, skipped: [`https://x.example/?k=${KEY}: failed`] }], dropped: [] } };
    await handlers.researchRun(t.deps, {});
    run = await t.prisma.activityRun.findFirstOrThrow();
    expect(run.status).toBe('done');
    expect(JSON.stringify(run.result)).not.toContain(KEY);
    expect(JSON.stringify(run.result)).toContain('[hidden]');

    // the draft and rewrite jobs hide them too
    await t.prisma.activityRun.deleteMany();
    const editor = await t.createUser('editor');
    await t.prisma.vaultItem.create({ data: { kind: 'figure', title: 'F', body: 'x', status: 'confirmed' } });
    fake.draft = new Error(`provider said ${KEY}`);
    await expect(handlers.draftBatch(t.deps, { actorId: editor.id })).rejects.toThrow();
    const batch = await t.prisma.batch.create({ data: { name: 'b', title: 'b', timezone: 'UTC', defaultTime: '09:00', defaultNetworks: [], ownerId: editor.id } });
    const post = await t.prisma.post.create({ data: { batchId: batch.id, postKey: 'p', position: 0, title: 'P', date: '2027-01-01', time: '09:00', caption: 'c' } });
    fake.rewrite = new Error(`provider said ${KEY}`);
    await expect(handlers.rewritePost(t.deps, { postId: post.id, instruction: 'Shorter' })).rejects.toThrow();
    const all = await t.prisma.activityRun.findMany();
    expect(all.map((r) => r.status)).toEqual(['failed', 'failed']);
    expect(JSON.stringify(all)).not.toContain(KEY);
  });
});
