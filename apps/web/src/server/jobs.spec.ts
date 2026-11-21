import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAI, stubAiModule } from './ai.js';
import { handlers, JOB_NAMES, createBossJobs } from './jobs/index.js';
import { createTestApp, testDatabaseUrl, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

describe('fake jobs', () => {
  it('records enqueued jobs and keeps one waiting job per singleton key', async () => {
    await t.jobs.enqueue('render-post', { postId: 'p1' }, { singletonKey: 'p1' });
    expect(await t.jobs.enqueue('render-post', { postId: 'p1' }, { singletonKey: 'p1' })).toBeNull();
    expect(t.jobs.enqueued).toHaveLength(1);
  });

  it('refresh-sweep queues a refresh for every scheduled batch', async () => {
    const owner = await t.createUser('editor');
    const mk = (name: string, status: string) => t.prisma.batch.create({ data: { name, title: name, timezone: 'UTC', defaultTime: '10:00', defaultNetworks: [], status, ownerId: owner.id } });
    const live = await mk('live-one', 'scheduled');
    await mk('draft-one', 'draft');
    await handlers.refreshSweep(t.deps, {});
    expect(t.jobs.enqueued).toEqual([{ name: 'refresh-delivery', payload: { batchId: live.id }, options: { singletonKey: live.id } }]);
  });
});

describe('pg-boss', () => {
  it('creates every queue, runs a job through a handler and schedules the 15-minute sweep', async () => {
    const jobs = createBossJobs({ databaseUrl: testDatabaseUrl(), schema: 'pgboss_foundation_test' });
    const original = handlers.renderPost;
    const seen: unknown[] = [];
    handlers.renderPost = async (_deps, payload) => { seen.push(payload); };
    try {
      await jobs.start(t.deps);
      expect(JOB_NAMES).toContain('send-batch');
      await jobs.enqueue('render-post', { postId: 'abc' }, { singletonKey: 'abc' });
      const until = Date.now() + 15_000;
      while (!seen.length && Date.now() < until) await new Promise((r) => setTimeout(r, 200));
      expect(seen).toEqual([{ postId: 'abc' }]);
    } finally {
      handlers.renderPost = original;
      await jobs.stop();
    }
  });
});

describe('AI seam', () => {
  it('uses a stub that says so until @vesk/ai is installed', async () => {
    const ai = stubAiModule.createAI({ providers: [] });
    await expect(ai.draftBatch({ vault: [], series: {}, period: {}, count: 1, channels: [], brand: {}, timezone: 'UTC' })).rejects.toThrow('AI not installed yet');
    await expect(ai.research({ topics: [], vault: [] })).rejects.toThrow('AI not installed yet');
    await expect(ai.rewrite({ post: {}, instruction: '', vault: [] })).rejects.toThrow('AI not installed yet');
    const loaded = await loadAI();
    expect(typeof loaded.createAI).toBe('function');
  });
});
