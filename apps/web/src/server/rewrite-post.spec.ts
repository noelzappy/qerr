import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateAiOptions } from './ai.js';
import { handlers } from './jobs/handlers.js';
import { createTestApp, type TestApp } from './testing.js';

// "Rewrite with AI" on a post: the route checks first and queues the job, the job asks the AI (a fake here, so nothing leaves
// the machine) and saves the answer as an edit.
const fake = vi.hoisted(() => ({ calls: [] as Array<{ input: any }>, rewrite: null as any }));
vi.mock('./ai.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ai.js')>()),
  loadAI: async () => ({
    createAI: (_options: CreateAiOptions) => ({
      rewrite: async (input: unknown) => { fake.calls.push({ input }); if (fake.rewrite instanceof Error) throw fake.rewrite; return fake.rewrite; },
    }),
  }),
}));

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(async () => {
  await t.reset();
  fake.calls.length = 0;
  fake.rewrite = null;
});

const KEY = 'sk-ant-SECRETAIKEY-9876';

async function setup(opts: { tasks?: string[]; budget?: number | null; approved?: boolean; withFact?: boolean } = {}) {
  const admin = t.api(await t.signIn(await t.createUser('admin')));
  const added = await admin.post('/api/settings/ai/providers', { name: 'Claude', kind: 'anthropic', model: 'm', apiKey: KEY, tasks: opts.tasks ?? ['rewrite'] });
  expect(added.status).toBe(201);
  if (opts.budget !== null) await admin.put('/api/settings/ai/budget', { monthlyBudgetUsd: opts.budget ?? 5 });
  const editorUser = await t.createUser('editor');
  const editor = t.api(await t.signIn(editorUser));
  const batch = await t.prisma.batch.create({ data: { name: 'dec', title: 'December', timezone: 'UTC', defaultTime: '10:00', defaultNetworks: ['x', 'instagram'], periodStart: '2026-12-01', periodEnd: '2026-12-31', ownerId: editorUser.id } });
  const fact = await t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'Fact', body: 'b', status: 'confirmed' } });
  const post = await t.prisma.post.create({
    data: {
      batchId: batch.id, postKey: 'p1', position: 1, title: 'Plans', date: '2026-12-02', time: '10:00', caption: 'Old words about plans.',
      sources: opts.withFact === false ? [] : [fact.id],
      ...(opts.approved ? { status: 'approved', approvedById: editorUser.id, approvedAt: new Date() } : {}),
    },
  });
  return { admin, editor, editorUser, batch, fact, post };
}

describe('POST /api/posts/:id/rewrite', () => {
  it('queues the rewrite, and the job saves the new words and takes approval off', async () => {
    const { editor, editorUser, post, fact } = await setup({ approved: true });
    const res = await editor.post(`/api/posts/${post.id}/rewrite`, { instruction: '  Shorter, and lead with the free plan  ' });
    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(true);
    const queued = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: res.body.activityId } });
    expect(queued).toMatchObject({ kind: 'rewrite-post', status: 'queued', actorId: editorUser.id, postId: post.id, title: 'Rewrite: Plans' });
    const job = t.jobs.enqueued.find((j) => j.name === 'rewrite-post')!;
    expect(job.payload).toMatchObject({ postId: post.id, instruction: 'Shorter, and lead with the free plan', apply: true, actorId: editorUser.id, activityId: queued.id });

    fake.rewrite = { id: 'p1', date: '2026-12-02', time: '10:00', title: 'Plans', caption: 'Start free.', sources: [fact.id], warnings: [] };
    await handlers.rewritePost(t.deps, job.payload as never);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.input.post).toMatchObject({ id: 'p1', caption: 'Old words about plans.' });
    const after = await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(after).toMatchObject({ caption: 'Start free.', status: 'draft', approvedById: null, approvedAt: null });
    const run = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: queued.id } });
    expect(run.status).toBe('done');
    expect(run.result).toMatchObject({ applied: true, changed: ['caption'], before: { caption: 'Old words about plans.' }, after: { caption: 'Start free.' }, approvalWithdrawn: true });
    expect((await t.prisma.auditLog.findMany({ where: { entityId: post.id } })).map((a) => a.action)).toEqual(expect.arrayContaining(['ai.rewrite_requested', 'ai.rewrite_post', 'post.update', 'post.unapprove']));
    expect(t.fetchCalls).toHaveLength(0);
  });

  it('reports and writes only what really changed: empty or foreign network entries are not a change', async () => {
    const { editor, post, fact } = await setup();
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } })).networks).toEqual({});
    const res = await editor.post(`/api/posts/${post.id}/rewrite`, { instruction: 'Shorter' });
    // The AI sends back an empty entry for X, an entry for LinkedIn (the batch does not go there) and an empty caption.
    fake.rewrite = { id: 'p1', date: '2026-12-02', time: '10:00', title: 'Plans', caption: 'Start free.', sources: [fact.id], networks: { x: {}, linkedin: { caption: 'Words for LinkedIn' }, instagram: { caption: '  ' } }, warnings: [] };
    await handlers.rewritePost(t.deps, t.jobs.enqueued.find((j) => j.name === 'rewrite-post')!.payload as never);
    const run = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: res.body.activityId } });
    expect(run.result).toMatchObject({ changed: ['caption'] });
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } })).networks).toEqual({});
  });

  it('reports networks when the words for one network really changed, and keeps that network\'s other settings', async () => {
    const { editor, post, fact } = await setup();
    await t.prisma.post.update({ where: { id: post.id }, data: { networks: { x: { caption: 'Old X words', firstComment: 'Keep me' } } } });
    const res = await editor.post(`/api/posts/${post.id}/rewrite`, { instruction: 'Shorter' });
    fake.rewrite = { id: 'p1', date: '2026-12-02', time: '10:00', title: 'Plans', caption: 'Old words about plans.', sources: [fact.id], networks: { x: { caption: 'New X words' } }, warnings: [] };
    await handlers.rewritePost(t.deps, t.jobs.enqueued.find((j) => j.name === 'rewrite-post')!.payload as never);
    const run = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: res.body.activityId } });
    expect(run.result).toMatchObject({ changed: ['networks'] });
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } })).networks).toEqual({ x: { caption: 'New X words', firstComment: 'Keep me' } });
  });

  it('fails the run with the reason and leaves the post alone when the new version is not a valid edit', async () => {
    const { editor, post, fact } = await setup({ approved: true });
    const res = await editor.post(`/api/posts/${post.id}/rewrite`, { instruction: 'Longer' });
    fake.rewrite = { id: 'p1', title: 'Plans', caption: 'x'.repeat(10_001), sources: [fact.id] };
    await expect(handlers.rewritePost(t.deps, t.jobs.enqueued.find((j) => j.name === 'rewrite-post')!.payload as never)).rejects.toThrow();
    const run = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: res.body.activityId } });
    expect(run.status).toBe('failed');
    expect(run.error).toBeTruthy();
    expect(JSON.stringify(run)).not.toContain('SECRETAIKEY');
    expect(await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } })).toMatchObject({ caption: 'Old words about plans.', status: 'approved' });
  });

  it('needs a signed-in editor or admin, and a valid instruction', async () => {
    const { editor, admin, post } = await setup();
    expect((await t.api().post(`/api/posts/${post.id}/rewrite`, { instruction: 'x' })).status).toBe(401);
    for (const body of [{}, { instruction: '   ' }, { instruction: 'x'.repeat(501) }, { instruction: 'x', extra: 1 }]) {
      expect((await editor.post(`/api/posts/${post.id}/rewrite`, body)).status).toBe(400);
    }
    expect(t.jobs.enqueued.filter((j) => j.name === 'rewrite-post')).toHaveLength(0);
    expect((await admin.post(`/api/posts/${post.id}/rewrite`, { instruction: 'x'.repeat(500) })).status).toBe(202);
  });

  it('refuses, with the reason and without queueing, when it could not run', async () => {
    const refuse = async (api: ReturnType<TestApp['api']>, id: string, status: number, text: RegExp) => {
      const res = await api.post(`/api/posts/${id}/rewrite`, { instruction: 'Shorter' });
      expect(res.status).toBe(status);
      expect(String(res.body.message ?? res.body.error)).toMatch(text);
      expect(t.jobs.enqueued.filter((j) => j.name === 'rewrite-post')).toHaveLength(0);
    };
    const ID = '00000000-0000-4000-8000-000000000000';

    // no provider is ticked for rewriting
    let s = await setup({ tasks: ['draft'] });
    await refuse(s.editor, s.post.id, 409, /No AI provider is set up for rewriting/);
    expect((await s.editor.get(`/api/posts/${s.post.id}`)).body.rewrite).toMatchObject({ available: false });

    // no budget, then a used-up budget
    await t.reset();
    s = await setup({ budget: null });
    await refuse(s.editor, s.post.id, 409, /no monthly AI budget/);
    await t.reset();
    s = await setup({ budget: 0.01 });
    await t.prisma.aiCall.create({ data: { at: t.deps.now(), kind: 'llm', task: 'rewrite', model: 'm', costUsd: 0.02 } });
    await refuse(s.editor, s.post.id, 409, /budget is used up/);

    // nothing to work from
    await t.reset();
    s = await setup({ withFact: false });
    await refuse(s.editor, s.post.id, 409, /no linked facts/);

    // removed, and unknown
    await t.reset();
    s = await setup();
    await t.prisma.post.update({ where: { id: s.post.id }, data: { status: 'removed' } });
    await refuse(s.editor, s.post.id, 409, /removed/);
    await refuse(s.editor, ID, 404, /not found/i);
    expect(fake.calls).toHaveLength(0);
  });

  it('refuses a second rewrite while one is queued or running, and says so in the post detail', async () => {
    const { editor, post } = await setup();
    expect((await editor.get(`/api/posts/${post.id}`)).body.rewrite).toEqual({ available: true, reason: null });
    expect((await editor.post(`/api/posts/${post.id}/rewrite`, { instruction: 'One' })).status).toBe(202);
    const again = await editor.post(`/api/posts/${post.id}/rewrite`, { instruction: 'Two' });
    expect(again.status).toBe(409);
    expect(String(again.body.message ?? again.body.error)).toMatch(/already queued or running/);
    expect(t.jobs.enqueued.filter((j) => j.name === 'rewrite-post')).toHaveLength(1);
    expect((await editor.get(`/api/posts/${post.id}`)).body.rewrite).toMatchObject({ available: false, reason: expect.stringMatching(/already queued/) });
  });
});
