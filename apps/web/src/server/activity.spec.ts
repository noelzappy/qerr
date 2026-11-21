import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { handlers } from './jobs/index.js';
import { createProgressWriter, enqueueTracked, pruneSystemRuns, readableError, reconcileActivity, RESTART_MESSAGE } from './services/activity.js';
import { seedBatch } from './testing-desk.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());
afterEach(() => { vi.useRealTimers(); });

const BAD_DESIGN = { template: 'no-such-template' };

async function postWithDesign() {
  const owner = await t.signedIn('editor');
  const { batch, posts } = await seedBatch(t, owner.user, { name: 'jan', posts: [{ key: 'p1', design: BAD_DESIGN }] });
  return { owner, batch, post: posts[0]! };
}

describe('render-post runs', () => {
  it('queues a run when a render is asked for, and the same run goes to failed with the reason when the design cannot be drawn', async () => {
    const { owner, batch, post } = await postWithDesign();
    expect((await owner.api.post(`/api/posts/${post.id}/render`)).status).toBe(202);
    const queued = await t.prisma.activityRun.findFirstOrThrow({ where: { kind: 'render-post' } });
    expect(queued).toMatchObject({ status: 'queued', title: 'Render: Post p1', batchId: batch.id, postId: post.id, actorId: owner.user.id, jobId: 'fake-1' });

    // asking again while one is waiting adds no second run
    await owner.api.post(`/api/posts/${post.id}/render`);
    expect(await t.prisma.activityRun.count()).toBe(1);

    await t.jobs.drain(t.deps);
    const run = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: queued.id } });
    expect(run.status).toBe('failed');
    expect(run.error).toContain('The design is not valid');
    expect(run.startedAt).not.toBeNull();
    expect(run.finishedAt).not.toBeNull();
    expect(await t.prisma.activityRun.count()).toBe(1);
  });

  it('makes its own run when the job has none, and a retried job puts a failed run back to running', async () => {
    const { post } = await postWithDesign();
    await t.prisma.post.update({ where: { id: post.id }, data: { design: { template: 'photo', headline: 'x' } } });
    await handlers.renderPost(t.deps, { postId: post.id });
    const own = await t.prisma.activityRun.findFirstOrThrow();
    expect(own).toMatchObject({ kind: 'render-post', actorId: null, postId: post.id });
    expect(own.status).toBe('failed');

    await t.prisma.post.update({ where: { id: post.id }, data: { design: Prisma.DbNull } });
    await handlers.renderPost(t.deps, { postId: post.id, activityId: own.id });
    const again = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: own.id } });
    expect(again).toMatchObject({ status: 'done', error: null });
    expect(await t.prisma.activityRun.count()).toBe(1);
  });

  it('keeps the run when its batch is deleted, with the links cleared', async () => {
    const { owner, batch, post } = await postWithDesign();
    await owner.api.post(`/api/posts/${post.id}/render`);
    expect((await owner.api.delete(`/api/batches/${batch.id}`)).status).toBe(200);
    expect(await t.prisma.activityRun.findFirstOrThrow()).toMatchObject({ batchId: null, postId: null });
  });
});

describe('the status checks', () => {
  it('the sweep and each check make a run of their own, marked as system work, and the sweep tidies old ones', async () => {
    const owner = await t.signedIn('editor');
    const { batch } = await seedBatch(t, owner.user, { name: 'live', status: 'scheduled', posts: [] });
    await handlers.refreshSweep(t.deps, {});
    await t.jobs.drain(t.deps);
    const runs = await t.prisma.activityRun.findMany({ orderBy: { createdAt: 'asc' } });
    expect(runs.map((r) => [r.kind, r.status])).toEqual([['refresh-sweep', 'done'], ['refresh-delivery', 'done']]);
    expect(runs[0]!.result).toEqual({ batches: 1 });
    expect(runs[1]).toMatchObject({ batchId: batch.id, actorId: null });

    const list = await owner.api.get('/api/activity');
    expect(list.body.items.every((i: any) => i.system === true)).toBe(true);
    expect((await owner.api.get('/api/activity?system=hide')).body.total).toBe(0);
    expect((await owner.api.get('/api/activity?system=only')).body.total).toBe(2);

    await t.prisma.activityRun.updateMany({ data: { createdAt: new Date(t.deps.now().getTime() - 30 * 86_400_000) } });
    expect(await pruneSystemRuns(t.deps)).toBe(2);
  });

  it('a check a person asks for belongs to them and is not system work', async () => {
    const owner = await t.signedIn('editor');
    const { batch } = await seedBatch(t, owner.user, { name: 'live', status: 'scheduled', posts: [] });
    expect((await owner.api.post(`/api/schedule/batches/${batch.id}/refresh`)).status).toBe(202);
    const run = await t.prisma.activityRun.findFirstOrThrow();
    expect(run).toMatchObject({ kind: 'refresh-delivery', status: 'queued', actorId: owner.user.id, batchId: batch.id });
    expect((await owner.api.get('/api/activity?system=hide')).body.total).toBe(1);
  });
});

describe('after a restart', () => {
  async function runs() {
    const mk = (data: Record<string, unknown>) => t.prisma.activityRun.create({ data: { kind: 'draft-batch', title: 'x', ...data } as never });
    return {
      running: await mk({ status: 'running', jobId: 'j-running' }),
      waiting: await mk({ status: 'queued', jobId: 'j-waiting' }),
      gone: await mk({ status: 'queued', jobId: 'j-gone' }),
      ended: await mk({ status: 'queued', jobId: 'j-ended' }),
      noJob: await mk({ status: 'queued' }),
      finished: await mk({ status: 'done' }),
    };
  }

  it('ends runs left running, and queued runs whose job is gone or over, as failed; waiting jobs and finished runs stay', async () => {
    const r = await runs();
    t.jobs.states.set('j-waiting', 'created');
    t.jobs.states.set('j-running', 'active');
    t.jobs.states.set('j-ended', 'failed');
    expect(await reconcileActivity(t.deps)).toEqual({ failed: 4 });
    const by = async (id: string) => t.prisma.activityRun.findUniqueOrThrow({ where: { id } });
    for (const id of [r.running.id, r.gone.id, r.ended.id, r.noJob.id]) {
      expect(await by(id)).toMatchObject({ status: 'failed', error: RESTART_MESSAGE });
      expect((await by(id)).finishedAt).not.toBeNull();
    }
    expect((await by(r.waiting.id)).status).toBe('queued');
    expect((await by(r.finished.id)).status).toBe('done');
    expect(await reconcileActivity(t.deps)).toEqual({ failed: 0 });
  });
});

describe('the activity API', () => {
  const make = (over: Record<string, unknown>) => t.prisma.activityRun.create({ data: { kind: 'draft-batch', title: 'AI draft', status: 'done', ...over } as never });

  it('needs a signed-in user for the list and for one run', async () => {
    const run = await make({});
    expect((await t.api().get('/api/activity')).status).toBe(401);
    expect((await t.api().get(`/api/activity/${run.id}`)).status).toBe(401);
  });

  it('lists with filters and paging, newest first, and gives the result only for one run unless asked', async () => {
    const owner = await t.signedIn('editor');
    const { batch } = await seedBatch(t, owner.user, { name: 'b1', posts: [] });
    const t0 = Date.now();
    const a = await make({ status: 'queued', title: 'one', createdAt: new Date(t0 - 4000) });
    const b = await make({ status: 'running', kind: 'research-run', title: 'two', createdAt: new Date(t0 - 3000), progress: { step: 'Searching: x', done: 1, total: 3 } });
    const c = await make({ status: 'done', title: 'three', batchId: batch.id, createdAt: new Date(t0 - 2000), result: { batchId: batch.id, delivered: 2, requested: 3 } });
    const d = await make({ status: 'failed', title: 'four', createdAt: new Date(t0 - 1000), error: 'The AI answer was not usable' });
    const api = owner.api;

    const all = await api.get('/api/activity');
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, pageSize: 50, total: 4 });
    expect(all.body.items.map((i: any) => i.title)).toEqual(['four', 'three', 'two', 'one']);
    expect(Object.keys(all.body.items[0]).sort()).toEqual(['actorId', 'batchId', 'createdAt', 'error', 'finishedAt', 'id', 'kind', 'postId', 'progress', 'startedAt', 'status', 'system', 'title', 'updatedAt']);
    expect(all.body.items.find((i: any) => i.title === 'three')).not.toHaveProperty('result');

    expect((await api.get('/api/activity?status=active')).body.items.map((i: any) => i.id)).toEqual([b.id, a.id]);
    expect((await api.get('/api/activity?status=finished')).body.total).toBe(2);
    expect((await api.get('/api/activity?status=failed')).body.items.map((i: any) => i.id)).toEqual([d.id]);
    expect((await api.get('/api/activity?kind=research-run')).body.items.map((i: any) => i.id)).toEqual([b.id]);
    expect((await api.get(`/api/activity?batchId=${batch.id}`)).body.items.map((i: any) => i.id)).toEqual([c.id]);
    const page2 = await api.get('/api/activity?pageSize=2&page=2');
    expect(page2.body.items.map((i: any) => i.title)).toEqual(['two', 'one']);
    expect(page2.body.total).toBe(4);
    expect((await api.get('/api/activity?withResult=true')).body.items.find((i: any) => i.title === 'three').result).toMatchObject({ delivered: 2 });
    expect((await api.get('/api/activity?status=bogus')).status).toBe(400);
    expect((await api.get('/api/activity?pageSize=1000')).status).toBe(400);

    const one = await api.get(`/api/activity/${c.id}`);
    expect(one.body.run).toMatchObject({ id: c.id, status: 'done', result: { delivered: 2, requested: 3 } });
    expect((await api.get(`/api/activity/${d.id}`)).body.run.error).toBe('The AI answer was not usable');
    expect((await api.get('/api/activity/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});

describe('enqueueTracked', () => {
  it('stores the job id, and a queue that refuses the job leaves no stray run', async () => {
    const first = await enqueueTracked(t.deps, 'research-run', {}, { singletonKey: 'k' }, { title: 'Research run' });
    expect(first.jobId).toBe('fake-1');
    expect(t.jobs.enqueued[0]!.payload).toEqual({ activityId: first.activityId });
    expect((await t.prisma.activityRun.findUniqueOrThrow({ where: { id: first.activityId! } })).jobId).toBe('fake-1');
    const second = await enqueueTracked(t.deps, 'research-run', {}, { singletonKey: 'k' }, { title: 'Research run' });
    expect(second).toEqual({ jobId: null, activityId: first.activityId });
    expect(await t.prisma.activityRun.count()).toBe(1);
  });

  it('ends the run as failed when the queue itself throws', async () => {
    const jobs = { ...t.deps.jobs, enqueue: async () => { throw new Error('queue down'); } };
    await expect(enqueueTracked({ ...t.deps, jobs }, 'research-run', {}, undefined, { title: 'Research run' })).rejects.toThrow('queue down');
    expect(await t.prisma.activityRun.findFirstOrThrow()).toMatchObject({ status: 'failed', error: 'queue down' });
  });
});

describe('progress and errors', () => {
  it('writes the first update at once and at most one more a second, ending on the newest', async () => {
    vi.useFakeTimers();
    const written: number[] = [];
    const writer = createProgressWriter(async (p) => { written.push(p.done ?? -1); });
    for (let i = 0; i <= 50; i++) writer.update({ step: 's', done: i, total: 50 });
    await vi.advanceTimersByTimeAsync(0);
    expect(written).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(written).toEqual([0, 50]);
    writer.update({ step: 's', done: 51 });
    await vi.advanceTimersByTimeAsync(10);
    expect(written).toEqual([0, 50]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(written).toEqual([0, 50, 51]);
    await writer.stop();
  });

  it('keeps keys, tokens and the app secret out of the error text, and spells out validation details', () => {
    const text = readableError(new Error(`Buffer said no for Bearer abc.def-123 with key sk-ant-SECRETKEY-123456 and ${t.deps.config.authSecret} at https://x.example/?api_key=hunter22&a=1`), [t.deps.config.authSecret]);
    expect(text).not.toMatch(/abc\.def-123|SECRETKEY|hunter22/);
    expect(text).not.toContain(t.deps.config.authSecret);
    expect(text).toContain('[hidden]');
    expect(readableError(new Error('x mysecretvalue y'), ['mysecretvalue'])).toBe('x [hidden] y');
    const http = Object.assign(new Error('The batch is not valid'), { name: 'HttpError' });
    expect(readableError(http)).toContain('The batch is not valid');
  });
});
