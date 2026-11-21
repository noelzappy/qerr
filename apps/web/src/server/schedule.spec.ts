import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handlers } from './jobs/index.js';
import { CHANNELS, createFakeBuffer, KEYS, seedBatch, seedBufferAccounts } from './testing-desk.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
const buffer = (() => {
  // The fake needs the app's storage, which exists once the test app does.
  let fake: ReturnType<typeof createFakeBuffer> | null = null;
  return { get: () => (fake ??= createFakeBuffer(t)) };
})();
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(async () => {
  await t.reset();
  buffer.get().reset();
  t.setFetch(buffer.get().fetch);
});

const ID = '00000000-0000-4000-8000-000000000000';
type Api = ReturnType<TestApp['api']>;

async function world(options: { posts?: Parameters<typeof seedBatch>[2] extends infer O ? (O extends { posts?: infer P } ? P : never) : never } = {}) {
  const owner = await t.signedIn('editor');
  const accounts = await seedBufferAccounts(t);
  const seeded = await seedBatch(t, owner.user, {
    name: 'june',
    posts: options.posts ?? [{ key: 'p1', status: 'approved', date: '2027-06-01' }, { key: 'p2', status: 'approved', date: '2027-06-02' }, { key: 'p3', date: '2027-06-03' }],
  });
  return { owner, accounts, ...seeded };
}

const planOf = async (api: Api, batchId: string, mode: 'draft' | 'live') => (await api.get(`/api/schedule/batches/${batchId}/plan?mode=${mode}`)).body.plan;

async function send(api: Api, batchId: string, mode: 'draft' | 'live', tweak: (confirm: { postsXChannels: number; token: string }) => void = () => {}) {
  const plan = await planOf(api, batchId, mode);
  const confirm = { postsXChannels: plan.count as number, token: plan.token as string };
  tweak(confirm);
  return { res: await api.post(`/api/schedule/batches/${batchId}/send`, { mode, confirm }), plan };
}

const sendAndRun = async (api: Api, batchId: string, mode: 'draft' | 'live') => {
  const out = await send(api, batchId, mode);
  expect(out.res.status, JSON.stringify(out.res.body)).toBe(202);
  await t.jobs.drain(t.deps);
  return out;
};

describe('authentication on every schedule route', () => {
  const routes: Array<[string, string, unknown?]> = [
    ['GET', `/api/schedule/batches/${ID}/plan`], ['POST', `/api/schedule/batches/${ID}/send`, { mode: 'draft', confirm: { postsXChannels: 1, token: 'x' } }],
    ['GET', `/api/schedule/batches/${ID}/deliveries`], ['POST', `/api/schedule/batches/${ID}/refresh`],
    ['POST', `/api/schedule/deliveries/${ID}/resolve`, { action: 'mark-sent' }], ['POST', `/api/schedule/deliveries/${ID}/delete-from-buffer`, { confirm: true }],
  ];
  it.each(routes)('%s %s needs a signed-in user', async (method, url, body) => {
    const api = t.api();
    const res = method === 'GET' ? await api.get(url) : await api.post(url, body);
    expect(res.status).toBe(401);
    expect(t.jobs.enqueued).toHaveLength(0);
  });
});

describe('the plan', () => {
  it('lists every approved post on every channel with its account, channel and times', async () => {
    const { owner, batch } = await world();
    const plan = await planOf(owner.api, batch.id, 'draft');
    expect(plan.count).toBe(8);
    expect(plan.willSend).toBe(8);
    expect(plan.approvedPosts).toBe(2);
    expect(plan.notApproved).toBe(1);
    expect(plan.token).toMatch(/^[0-9a-f]{32}$/);
    const byKey = Object.fromEntries(plan.rows.map((r: any) => [`${r.postKey}/${r.network}`, r]));
    expect(byKey['p1/instagram']).toMatchObject({ account: 'account-B', channelId: CHANNELS.instagram, dueAtLocal: '2027-06-01 09:00', dueAtUtc: '2027-06-01T09:00:00.000Z', action: 'create', promote: false, willSend: true, media: 1 });
    expect(byKey['p1/linkedin']).toMatchObject({ account: 'account-A', channelId: CHANNELS.linkedin });
    expect(byKey['p2/x']).toMatchObject({ account: 'account-A', channelId: CHANNELS.x, dueAtLocal: '2027-06-02 09:00' });
    expect(plan.rows.some((r: any) => r.postKey === 'p3')).toBe(false);
    expect(JSON.stringify(plan)).not.toContain(KEYS.A);
    expect(buffer.get().requests).toHaveLength(0);
  });

  it('shows the time in UTC for a batch in another time zone', async () => {
    const owner = await t.signedIn('editor');
    await seedBufferAccounts(t);
    const { batch } = await seedBatch(t, owner.user, { timezone: 'America/New_York', posts: [{ key: 'a', status: 'approved', date: '2027-01-15' }] });
    const plan = await planOf(owner.api, batch.id, 'draft');
    expect(plan.rows[0]).toMatchObject({ dueAtLocal: '2027-01-15 09:00', dueAtUtc: '2027-01-15T14:00:00.000Z' });
  });

  it('explains a row that has no route, and keeps sending the others', async () => {
    const { owner, batch } = await world();
    await t.prisma.channelRoute.delete({ where: { network: 'x' } });
    const plan = await planOf(owner.api, batch.id, 'draft');
    const x = plan.rows.find((r: any) => r.network === 'x');
    expect(x).toMatchObject({ account: null, willSend: false });
    expect(x.problems[0]).toContain('No Buffer account is set for x');
    expect(plan.willSend).toBe(6);
    await sendAndRun(owner.api, batch.id, 'draft');
    expect(buffer.get().creates()).toHaveLength(6);
    expect(await t.prisma.delivery.count()).toBe(6);
  });

  it('is empty, and refuses to send, when nothing is approved', async () => {
    const { owner, batch } = await world({ posts: [{ key: 'a' }] });
    const plan = await planOf(owner.api, batch.id, 'draft');
    expect(plan).toMatchObject({ count: 0, approvedPosts: 0 });
    const res = await owner.api.post(`/api/schedule/batches/${batch.id}/send`, { mode: 'draft', confirm: { postsXChannels: 0, token: plan.token || 'x' } });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('no approved posts');
    expect(t.jobs.enqueued).toHaveLength(0);
  });

  it('answers 404 for a batch that does not exist', async () => {
    const { owner } = await world();
    expect((await owner.api.get(`/api/schedule/batches/${ID}/plan`)).status).toBe(404);
    expect((await owner.api.get('/api/schedule/batches/nope/plan')).status).toBe(404);
  });
});

describe('sending drafts', () => {
  it('sends each channel through its own account with its own key and channel, and uploads only what is sent', async () => {
    const { owner, batch, posts } = await world();
    const { res } = await send(owner.api, batch.id, 'draft');
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ queued: true, count: 8, willSend: 8 });
    // Nothing happens until the job runs, and the payload carries no secret.
    expect(buffer.get().requests).toHaveLength(0);
    expect(t.jobs.enqueued).toHaveLength(1);
    expect(t.jobs.enqueued[0]).toMatchObject({ name: 'send-batch', payload: { batchId: batch.id, mode: 'draft', actorId: owner.user.id } });
    expect(JSON.stringify(t.jobs.enqueued)).not.toContain('bufkey');

    await t.jobs.drain(t.deps);
    const creates = buffer.get().creates();
    expect(creates).toHaveLength(8);
    for (const c of creates) {
      const net = Object.entries(CHANNELS).find(([, ch]) => ch === c.input!.channelId)![0];
      const expected = net === 'instagram' || net === 'facebook' ? 'B' : 'A';
      expect(c.account, net).toBe(expected);
      expect(c.authorization).toBe(`Bearer ${KEYS[expected]}`);
      expect(c.input!.saveToDraft).toBe(true);
      expect(c.input!.mode).toBe('customScheduled');
      expect(c.input!.assets[0].image.url).toMatch(/^https:\/\/storage\.test\/bucket\/public\/june\/[0-9a-f]{16}-image-1\.jpg$/);
    }
    expect(creates.map((c) => c.input!.dueAt).sort()).toEqual([...Array(4).fill('2027-06-01T09:00:00.000Z'), ...Array(4).fill('2027-06-02T09:00:00.000Z')]);

    const deliveries = await t.prisma.delivery.findMany({ include: { post: true } });
    expect(deliveries).toHaveLength(8);
    expect(deliveries.every((d) => d.status === 'created' && d.mode === 'draft' && d.bufferStatus === 'draft' && d.bufferId)).toBe(true);
    expect(deliveries.find((d) => d.network === 'x' && d.post.postKey === 'p1')).toMatchObject({ account: 'account-A', channelId: CHANNELS.x });
    expect(deliveries.find((d) => d.network === 'facebook' && d.post.postKey === 'p2')).toMatchObject({ account: 'account-B', channelId: CHANNELS.facebook });
    expect((await t.prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).status).toBe('in_review');

    // The public prefix holds exactly the approved posts' pictures, once each: the draft post's picture stays private.
    const publicKeys = [...t.storage.objects.keys()].filter((k) => k.startsWith(t.storage.publicConfig.prefix));
    expect(publicKeys).toHaveLength(2);
    expect(publicKeys.every((k) => k.startsWith('public/june/'))).toBe(true);
    expect(publicKeys.some((k) => k.includes(posts[2]!.postKey))).toBe(false);
    for (const key of publicKeys) expect(t.storage.objects.get(key)!.contentType).toBe('image/jpeg');
    expect([...t.storage.objects.keys()].filter((k) => !k.startsWith('public/')).every((k) => k.startsWith('renders/'))).toBe(true);

    const log = await t.prisma.auditLog.findMany({ where: { action: { startsWith: 'schedule.' } }, orderBy: { at: 'asc' } });
    expect(log.map((l) => l.action)).toEqual(['schedule.send_draft', 'schedule.send_draft.done']);
    expect(log[0]!.actorId).toBe(owner.user.id);
  });

  it('never puts a key in a response, a delivery, a run record or the audit log', async () => {
    const { owner, batch } = await world();
    await sendAndRun(owner.api, batch.id, 'draft');
    const deliveries = await owner.api.get(`/api/schedule/batches/${batch.id}/deliveries`);
    const everything = JSON.stringify([deliveries.body, await t.prisma.auditLog.findMany(), await t.prisma.delivery.findMany(), await t.prisma.appSetting.findMany()]);
    expect(everything).not.toContain('bufkey');
    expect(everything).not.toContain(KEYS.A);
    expect(deliveries.body.lastRun.state).toBe('done');
    expect(deliveries.body.lastRun.summary).toMatchObject({ created: 8, skipped: 0, refused: 0, failed: 0, unknown: 0, stopped: null });
    expect(deliveries.body.counts).toEqual({ draft: 8 });
  });

  it('refuses when the confirmation does not match the plan the server computes now', async () => {
    const { owner, batch, posts } = await world();
    for (const tweak of [(c: any) => { c.postsXChannels = 7; }, (c: any) => { c.token = 'f'.repeat(32); }]) {
      const { res } = await send(owner.api, batch.id, 'draft', tweak);
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('plan changed');
      expect(res.body.details.count).toBe(8);
    }
    // A stale dialog: the plan was read, then a post was taken out of approval.
    const stale = await planOf(owner.api, batch.id, 'draft');
    await t.prisma.post.update({ where: { id: posts[1]!.id }, data: { status: 'draft' } });
    const res = await owner.api.post(`/api/schedule/batches/${batch.id}/send`, { mode: 'draft', confirm: { postsXChannels: stale.count, token: stale.token } });
    expect(res.status).toBe(409);
    expect(t.jobs.enqueued).toHaveLength(0);
    expect(buffer.get().requests).toHaveLength(0);
    expect((await owner.api.post(`/api/schedule/batches/${batch.id}/send`, { mode: 'draft' })).status).toBe(400);
    expect((await owner.api.post(`/api/schedule/batches/${batch.id}/send`, { mode: 'later', confirm: stale })).status).toBe(400);
  });

  it('sends nothing if the plan changes between the click and the job', async () => {
    const { owner, batch, posts } = await world();
    expect((await send(owner.api, batch.id, 'draft')).res.status).toBe(202);
    await t.prisma.post.update({ where: { id: posts[0]!.id }, data: { status: 'draft' } });
    await t.jobs.drain(t.deps);
    expect(buffer.get().creates()).toHaveLength(0);
    const run = (await owner.api.get(`/api/schedule/batches/${batch.id}/deliveries`)).body.lastRun;
    expect(run).toMatchObject({ state: 'refused' });
    expect(run.message).toContain('plan changed');
  });

  it('lets any editor send drafts', async () => {
    const { batch } = await world();
    const other = await t.signedIn('editor');
    expect((await send(other.api, batch.id, 'draft')).res.status).toBe(202);
  });
});

describe('going live', () => {
  it('promotes each draft to a live post, keeps the draft ids as history and marks the batch scheduled', async () => {
    const { owner, batch } = await world();
    await sendAndRun(owner.api, batch.id, 'draft');
    const draftIds = (await t.prisma.delivery.findMany()).map((d) => d.bufferId!).sort();
    buffer.get().requests.length = 0;

    const plan = await planOf(owner.api, batch.id, 'live');
    expect(plan.rows.every((r: any) => r.action === 'create' && r.promote && r.willSend)).toBe(true);
    expect(plan.rows[0].explanation).toContain('stays in Buffer');
    await sendAndRun(owner.api, batch.id, 'live');

    const creates = buffer.get().creates();
    expect(creates).toHaveLength(8);
    expect(creates.every((c) => c.input!.saveToDraft === undefined && c.authorization === `Bearer ${KEYS[c.account!]}`)).toBe(true);
    const deliveries = await t.prisma.delivery.findMany();
    expect(deliveries.every((d) => d.mode === 'live' && d.bufferStatus === 'scheduled' && d.status === 'created')).toBe(true);
    expect(deliveries.flatMap((d) => (d.previous as Array<{ bufferId: string }>).map((p) => p.bufferId)).sort()).toEqual(draftIds);
    expect((await t.prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).status).toBe('scheduled');
    expect(await t.prisma.auditLog.count({ where: { action: 'schedule.send_live' } })).toBe(1);
  });

  it('refuses live for a post with no draft, unless the setting allows going straight to live', async () => {
    const { owner, batch } = await world();
    const plan = await planOf(owner.api, batch.id, 'live');
    expect(plan.rows[0].needsDraftFirst).toBe(true);
    expect(plan.rows[0].problems[0]).toContain('draft first');
    const { res } = await send(owner.api, batch.id, 'live');
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('as a draft before it goes live');

    await t.prisma.appSetting.create({ data: { key: 'allowDirectLive', value: true } });
    await sendAndRun(owner.api, batch.id, 'live');
    expect(buffer.get().creates()).toHaveLength(8);
    expect((await t.prisma.delivery.findMany()).every((d) => d.mode === 'live')).toBe(true);
  });

  it('allows only an admin or the batch owner to send live', async () => {
    const { owner, batch } = await world();
    await sendAndRun(owner.api, batch.id, 'draft');
    const other = await t.signedIn('editor');
    const admin = await t.signedIn('admin');
    const denied = await send(other.api, batch.id, 'live');
    expect(denied.res.status).toBe(403);
    expect(t.jobs.enqueued).toHaveLength(0);
    const ok = await send(admin.api, batch.id, 'live');
    expect(ok.res.status).toBe(202);
    await t.jobs.drain(t.deps);
    expect((await t.prisma.delivery.findMany()).every((d) => d.mode === 'live')).toBe(true);
    const owned = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'schedule.send_live' } });
    expect(owned.actorId).toBe(admin.user.id);
  });

  it('refuses a live row whose due time has passed', async () => {
    const { owner, batch } = await world();
    await sendAndRun(owner.api, batch.id, 'draft');
    t.setNow(new Date('2028-01-01T00:00:00Z'));
    const plan = await planOf(owner.api, batch.id, 'live');
    expect(plan.willSend).toBe(0);
    expect(plan.rows[0].problems.join(' ')).toContain('has passed');
    const { res } = await send(owner.api, batch.id, 'live');
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Nothing in this plan can be sent');
  });
});

describe('duplicate protection', () => {
  it('does not send the same content twice, as a draft or live', async () => {
    const { owner, batch } = await world();
    await sendAndRun(owner.api, batch.id, 'draft');
    const again = await planOf(owner.api, batch.id, 'draft');
    expect(again.rows.every((r: any) => r.action === 'skip' && r.explanation.includes('already a draft'))).toBe(true);
    const refused = await send(owner.api, batch.id, 'draft');
    expect(refused.res.status).toBe(409);
    // Even a job queued by hand, or twice, creates nothing new.
    await handlers.sendBatch(t.deps, { batchId: batch.id, mode: 'draft', actorId: owner.user.id });
    expect(buffer.get().creates()).toHaveLength(8);

    await sendAndRun(owner.api, batch.id, 'live');
    await handlers.sendBatch(t.deps, { batchId: batch.id, mode: 'live', actorId: owner.user.id });
    await handlers.sendBatch(t.deps, { batchId: batch.id, mode: 'draft', actorId: owner.user.id });
    expect(buffer.get().creates()).toHaveLength(16);
    const live = await planOf(owner.api, batch.id, 'live');
    expect(live.rows.every((r: any) => r.action === 'skip' && r.explanation.includes('already scheduled'))).toBe(true);
  });

  it('refuses changed content instead of sending a second copy', async () => {
    const { owner, batch, posts } = await world();
    await sendAndRun(owner.api, batch.id, 'draft');
    await t.prisma.post.update({ where: { id: posts[0]!.id }, data: { caption: 'Changed after the draft #AcmeSavings' } });
    const plan = await planOf(owner.api, batch.id, 'draft');
    const changed = plan.rows.filter((r: any) => r.postKey === 'p1');
    expect(changed.every((r: any) => r.action === 'refuse' && r.explanation.includes('content changed'))).toBe(true);
    expect(plan.rows.filter((r: any) => r.postKey === 'p2').every((r: any) => r.action === 'skip')).toBe(true);
  });
});

describe('an unclear answer from Buffer', () => {
  it('stores the delivery as unknown, never retries, and reports what was not attempted', async () => {
    const { owner, batch } = await world();
    let n = 0;
    buffer.get().state.failCreate = () => (++n === 3 ? 'network' : null);
    await sendAndRun(owner.api, batch.id, 'draft');
    const creates = buffer.get().creates();
    expect(creates).toHaveLength(3);

    const deliveries = await t.prisma.delivery.findMany({ include: { post: true }, orderBy: { createdAt: 'asc' } });
    expect(deliveries).toHaveLength(3);
    const unknown = deliveries.find((d) => d.status === 'unknown')!;
    expect(unknown).toMatchObject({ bufferStatus: 'unknown', bufferId: null, network: 'facebook' });
    expect(unknown.error).toMatch(/^unknown, check Buffer/);
    expect(unknown.statusNote).toContain('may or may not exist');

    const view = (await owner.api.get(`/api/schedule/batches/${batch.id}/deliveries`)).body;
    expect(view.lastRun.summary).toMatchObject({ created: 2, unknown: 1 });
    expect(view.lastRun.summary.stopped).toContain('NOT retried');
    expect(view.lastRun.summary.notAttempted).toHaveLength(5);
    expect(view.lastRun.summary.byAccount['account-A']).toMatchObject({ notAttempted: 3 });
    expect(view.lastRun.log.join('\n')).toContain('NOT SENT');
    expect(view.counts).toMatchObject({ unknown: 1, draft: 2 });

    // Sending again does not retry the unclear one, and (it is stopped at nothing) only sends the rest.
    const plan = await planOf(owner.api, batch.id, 'draft');
    const row = plan.rows.find((r: any) => r.postKey === 'p1' && r.network === 'facebook');
    expect(row).toMatchObject({ action: 'refuse', willSend: false });
    expect(row.explanation).toContain('unknown, check Buffer');
    buffer.get().state.failCreate = () => null;
    await sendAndRun(owner.api, batch.id, 'draft');
    expect(buffer.get().creates().filter((c) => c.input!.channelId === CHANNELS.facebook && c.input!.dueAt.startsWith('2027-06-01'))).toHaveLength(1);
    expect((await t.prisma.delivery.findFirstOrThrow({ where: { id: unknown.id } })).status).toBe('unknown');
    expect(await t.prisma.delivery.count()).toBe(8);
  });

  it('treats an HTTP 500 the same way', async () => {
    const { owner, batch } = await world({ posts: [{ key: 'only', status: 'approved' }] });
    buffer.get().state.failCreate = (req) => (req.input!.channelId === CHANNELS.linkedin ? 'http500' : null);
    await sendAndRun(owner.api, batch.id, 'draft');
    const unknown = await t.prisma.delivery.findFirstOrThrow({ where: { network: 'linkedin' } });
    expect(unknown.status).toBe('unknown');
    expect(unknown.error).toContain('HTTP 500');
    expect(buffer.get().creates()).toHaveLength(2);
  });

  it('finds the post in Buffer on a status refresh when it was in fact created, and stays unknown when it was not', async () => {
    const { owner, batch } = await world({ posts: [{ key: 'only', status: 'approved' }] });
    buffer.get().state.createsPostOnFailure = true;
    buffer.get().state.failCreate = (req) => (req.input!.channelId === CHANNELS.linkedin ? 'network' : null);
    await sendAndRun(owner.api, batch.id, 'draft');
    expect((await t.prisma.delivery.findFirstOrThrow({ where: { network: 'linkedin' } })).status).toBe('unknown');

    expect((await owner.api.post(`/api/schedule/batches/${batch.id}/refresh`)).status).toBe(202);
    await t.jobs.drain(t.deps);
    const found = await t.prisma.delivery.findFirstOrThrow({ where: { network: 'linkedin' } });
    expect(found).toMatchObject({ status: 'created', bufferStatus: 'draft', error: null });
    expect(found.bufferId).toBeTruthy();
    expect(buffer.get().creates()).toHaveLength(2);

    // Now one that Buffer never created.
    await t.prisma.delivery.update({ where: { id: found.id }, data: { status: 'unknown', bufferId: null, bufferStatus: 'unknown', error: 'unknown, check Buffer' } });
    buffer.get().posts.clear();
    await t.jobs.enqueue('refresh-delivery', { batchId: batch.id }, { singletonKey: batch.id });
    await t.jobs.drain(t.deps);
    const still = await t.prisma.delivery.findUniqueOrThrow({ where: { id: found.id } });
    expect(still).toMatchObject({ status: 'unknown', bufferStatus: 'unknown' });
    expect(still.statusNote).toContain('Look in Buffer by hand');
  });

  it('is resolved by an admin only: marked sent with a checked id, or marked absent so it can go again', async () => {
    const { owner, batch } = await world({ posts: [{ key: 'only', status: 'approved' }] });
    buffer.get().state.failCreate = (req) => (req.input!.channelId === CHANNELS.linkedin || req.input!.channelId === CHANNELS.x ? 'network' : null);
    await sendAndRun(owner.api, batch.id, 'draft');
    const unknown = await t.prisma.delivery.findMany({ where: { status: 'unknown' } });
    expect(unknown).toHaveLength(1);
    const d = unknown[0]!;
    // A real Buffer post on this channel, and one on another channel.
    const mine = { id: 'buf_mine', text: 't', dueAt: d.dueAt.toISOString(), status: 'draft' as const, account: 'A' as const, channelId: d.channelId };
    buffer.get().posts.set(mine.id, mine);
    buffer.get().posts.set('buf_other_channel', { ...mine, id: 'buf_other_channel', channelId: CHANNELS.x === d.channelId ? CHANNELS.linkedin : CHANNELS.x });

    // Even the batch owner, an editor, cannot resolve it.
    expect((await owner.api.post(`/api/schedule/deliveries/${d.id}/resolve`, { action: 'mark-sent', bufferId: 'buf_mine' })).status).toBe(403);
    const admin = await t.signedIn('admin');
    expect((await admin.api.post(`/api/schedule/deliveries/${d.id}/resolve`, { action: 'nonsense' })).status).toBe(400);
    expect((await admin.api.post(`/api/schedule/deliveries/${d.id}/resolve`, { action: 'mark-sent' })).status).toBe(422);
    expect((await admin.api.post(`/api/schedule/deliveries/${d.id}/resolve`, { action: 'mark-sent', bufferId: 'buf_other_channel' })).status).toBe(409);
    expect((await admin.api.post(`/api/schedule/deliveries/${d.id}/resolve`, { action: 'mark-sent', bufferId: 'buf_nowhere' })).status).toBe(422);
    // An id another delivery already holds cannot be attached.
    const held = await t.prisma.delivery.findFirstOrThrow({ where: { status: 'created' } });
    buffer.get().posts.set(held.bufferId!, { ...mine, id: held.bufferId!, channelId: d.channelId });
    expect((await admin.api.post(`/api/schedule/deliveries/${d.id}/resolve`, { action: 'mark-sent', bufferId: held.bufferId })).status).toBe(409);
    expect((await t.prisma.delivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe('unknown');

    const sent = await admin.api.post(`/api/schedule/deliveries/${d.id}/resolve`, { action: 'mark-sent', bufferId: 'buf_mine' });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.delivery).toMatchObject({ status: 'created', bufferStatus: 'draft', bufferId: 'buf_mine', error: null });
    expect((await admin.api.post(`/api/schedule/deliveries/${d.id}/resolve`, { action: 'mark-sent', bufferId: 'buf_mine' })).status).toBe(409);

    await t.prisma.delivery.update({ where: { id: d.id }, data: { status: 'unknown', bufferStatus: 'unknown', bufferId: null } });
    const absent = await admin.api.post(`/api/schedule/deliveries/${d.id}/resolve`, { action: 'mark-absent' });
    expect(absent.body.delivery).toMatchObject({ status: 'failed', bufferStatus: null });
    const plan = await planOf(owner.api, batch.id, 'draft');
    expect(plan.rows.find((r: any) => r.network === d.network)).toMatchObject({ action: 'create', willSend: true });
    expect((await t.prisma.auditLog.findMany({ where: { action: 'schedule.resolve' } })).map((a) => (a.detail as any).action)).toEqual(['mark-sent', 'mark-absent']);
  });
});

describe('status refresh', () => {
  it('reads each account with its own key and sets draft or scheduled from what Buffer lists', async () => {
    const { owner, batch } = await world();
    await sendAndRun(owner.api, batch.id, 'draft');
    buffer.get().requests.length = 0;
    expect((await owner.api.post(`/api/schedule/batches/${batch.id}/refresh`)).status).toBe(202);
    expect(t.jobs.enqueued).toHaveLength(1);
    await t.jobs.drain(t.deps);
    const lists = buffer.get().requests.filter((r) => r.kind === 'list');
    expect(lists.length).toBe(4); // scheduled and draft, for two accounts
    expect(lists.every((r) => r.authorization === `Bearer ${KEYS[r.account!]}`)).toBe(true);
    const deliveries = await t.prisma.delivery.findMany();
    expect(deliveries.every((d) => d.bufferStatus === 'draft' && d.lastCheckedAt && d.statusNote === null)).toBe(true);

    // Promote a draft in the fake to scheduled, as if it had been made live in Buffer itself.
    const first = deliveries[0]!;
    buffer.get().posts.get(first.bufferId!)!.status = 'scheduled';
    await t.jobs.enqueue('refresh-delivery', { batchId: batch.id }, { singletonKey: batch.id });
    await t.jobs.drain(t.deps);
    expect((await t.prisma.delivery.findUniqueOrThrow({ where: { id: first.id } })).bufferStatus).toBe('scheduled');
  });

  it('says plainly when a post is no longer listed, without claiming it was sent', async () => {
    const { owner, batch } = await world({ posts: [{ key: 'only', status: 'approved' }] });
    await sendAndRun(owner.api, batch.id, 'draft');
    const gone = (await t.prisma.delivery.findFirstOrThrow({ where: { network: 'x' } })).bufferId!;
    buffer.get().state.hidden.add(gone);
    await t.jobs.enqueue('refresh-delivery', { batchId: batch.id }, { singletonKey: batch.id });
    await t.jobs.drain(t.deps);
    const d = await t.prisma.delivery.findFirstOrThrow({ where: { network: 'x' } });
    expect(d.bufferStatus).toBe('unknown');
    expect(d.status).toBe('created');
    expect(d.statusNote).toContain('published, deleted, or be on a later page');
    expect(d.statusNote?.toLowerCase()).not.toContain('sent');
    expect((await t.prisma.delivery.findMany({ where: { bufferStatus: 'draft' } })).length).toBe(3);

    // A person who has checked can say what happened.
    const admin = await t.signedIn('admin');
    const sent = await admin.api.post(`/api/schedule/deliveries/${d.id}/resolve`, { action: 'mark-sent' });
    expect(sent.body.delivery.bufferStatus).toBe('sent');
    await t.jobs.enqueue('refresh-delivery', { batchId: batch.id }, { singletonKey: batch.id });
    await t.jobs.drain(t.deps);
    expect((await t.prisma.delivery.findUniqueOrThrow({ where: { id: d.id } })).bufferStatus).toBe('sent');
  });

  it('answers 404 for a batch that does not exist', async () => {
    const { owner } = await world();
    expect((await owner.api.post(`/api/schedule/batches/${ID}/refresh`)).status).toBe(404);
  });
});

describe('deleting from Buffer', () => {
  const draftOne = async () => {
    const w = await world({ posts: [{ key: 'only', status: 'approved' }] });
    await sendAndRun(w.owner.api, w.batch.id, 'draft');
    const delivery = await t.prisma.delivery.findFirstOrThrow({ where: { network: 'linkedin' } });
    buffer.get().requests.length = 0;
    return { ...w, delivery };
  };

  it('deletes a draft with the right account, marks it deleted and lets it be sent again', async () => {
    const { owner, batch, delivery } = await draftOne();
    const res = await owner.api.post(`/api/schedule/deliveries/${delivery.id}/delete-from-buffer`, { confirm: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.delivery).toMatchObject({ status: 'deleted', bufferStatus: null });
    const req = buffer.get().requests.find((r) => r.kind === 'delete')!;
    expect(req).toMatchObject({ account: 'A', authorization: `Bearer ${KEYS.A}`, input: { id: delivery.bufferId } });
    expect(buffer.get().posts.has(delivery.bufferId!)).toBe(false);
    expect(buffer.get().requests.filter((r) => r.kind === 'delete')).toHaveLength(1);
    // The other channels' posts are untouched.
    expect(buffer.get().posts.size).toBe(3);
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'schedule.delete_from_buffer' } });
    expect(audit.detail).toMatchObject({ outcome: 'deleted', bufferId: delivery.bufferId });
    const plan = await planOf(owner.api, batch.id, 'draft');
    expect(plan.rows.find((r: any) => r.network === 'linkedin')).toMatchObject({ action: 'create', willSend: true });
    expect(plan.rows.filter((r: any) => r.action === 'skip')).toHaveLength(3);
  });

  it('keeps the delivery when Buffer says it cannot delete the post', async () => {
    const { owner, delivery } = await draftOne();
    buffer.get().state.deleteMode = 'void';
    const res = await owner.api.post(`/api/schedule/deliveries/${delivery.id}/delete-from-buffer`, { confirm: true });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('Post not found');
    expect(await t.prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } })).toMatchObject({ status: 'created', bufferStatus: 'draft' });
    expect((await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'schedule.delete_from_buffer' } })).detail).toMatchObject({ outcome: 'refused' });
  });

  it('never deletes when another delivery claims the id, the channel differs, or Buffer cannot find the post', async () => {
    const { owner, delivery } = await draftOne();
    const del = () => owner.api.post(`/api/schedule/deliveries/${delivery.id}/delete-from-buffer`, { confirm: true });
    const other = await t.prisma.delivery.findFirstOrThrow({ where: { network: 'x' } });
    await t.prisma.delivery.update({ where: { id: other.id }, data: { bufferId: delivery.bufferId } });
    expect((await del()).status).toBe(409);
    await t.prisma.delivery.update({ where: { id: other.id }, data: { bufferId: other.bufferId } });

    await t.prisma.delivery.update({ where: { id: delivery.id }, data: { channelId: CHANNELS.x } });
    const mismatch = await del();
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error).toContain('different channel');
    await t.prisma.delivery.update({ where: { id: delivery.id }, data: { channelId: delivery.channelId } });

    buffer.get().posts.delete(delivery.bufferId!);
    expect((await del()).status).toBe(422);
    expect(buffer.get().requests.filter((r) => r.kind === 'delete')).toHaveLength(0);
    expect((await t.prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe('created');
    // The lookup went through the delivery's own account.
    expect(buffer.get().requests.filter((r) => r.kind === 'lookup').every((r) => r.authorization === `Bearer ${KEYS.A}`)).toBe(true);
  });

  it.each(['http500', 'weird'] as const)('marks the delivery unknown, not deleted, on an unclear answer (%s)', async (mode) => {
    const { owner, delivery } = await draftOne();
    buffer.get().state.deleteMode = mode;
    const res = await owner.api.post(`/api/schedule/deliveries/${delivery.id}/delete-from-buffer`, { confirm: true });
    expect(res.status).toBe(502);
    expect(res.body.error).toContain('not clear');
    const row = await t.prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(row).toMatchObject({ status: 'created', bufferStatus: 'unknown' });
    expect(row.statusNote).toContain('Check Buffer');
    // An unclear delivery cannot be deleted from here again until it has been looked at.
    expect((await owner.api.post(`/api/schedule/deliveries/${delivery.id}/delete-from-buffer`, { confirm: true })).status).toBe(409);
    expect((await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'schedule.delete_from_buffer' } })).detail).toMatchObject({ outcome: 'unknown' });
  });

  it('refuses anything that is not a draft or scheduled post, and anyone but an admin or the owner', async () => {
    const { owner, delivery } = await draftOne();
    const other = await t.signedIn('editor');
    expect((await other.api.post(`/api/schedule/deliveries/${delivery.id}/delete-from-buffer`, { confirm: true })).status).toBe(403);
    expect((await owner.api.post(`/api/schedule/deliveries/${delivery.id}/delete-from-buffer`, {})).status).toBe(400);
    expect((await owner.api.post(`/api/schedule/deliveries/${delivery.id}/delete-from-buffer`, { confirm: false })).status).toBe(400);
    for (const data of [{ bufferStatus: 'sent' }, { status: 'unknown', bufferId: null }, { status: 'deleted' }]) {
      await t.prisma.delivery.update({ where: { id: delivery.id }, data });
      expect((await owner.api.post(`/api/schedule/deliveries/${delivery.id}/delete-from-buffer`, { confirm: true })).status).toBe(409);
    }
    expect(buffer.get().requests.filter((r) => r.kind === 'delete')).toHaveLength(0);
    const admin = await t.signedIn('admin');
    await t.prisma.delivery.update({ where: { id: delivery.id }, data: { status: 'created', bufferStatus: 'draft', bufferId: delivery.bufferId } });
    expect((await admin.api.post(`/api/schedule/deliveries/${delivery.id}/delete-from-buffer`, { confirm: true })).status).toBe(200);
  });
});

describe('the run log never holds a key', () => {
  it('masks every account key on the success path and on the failure path', async () => {
    const { owner, batch } = await world({ posts: [{ key: 'only', status: 'approved' }] });
    // A media check that fails with a message that happens to contain account B's key.
    buffer.get().state.headError = `connection reset near ${KEYS.B}`;
    await sendAndRun(owner.api, batch.id, 'draft');
    let run = (await owner.api.get(`/api/schedule/batches/${batch.id}/deliveries`)).body.lastRun;
    expect(run.log.join('\n')).toContain('connection reset');
    expect(JSON.stringify(run)).not.toContain('bufkey');

    // The failure path: something breaks after lines were collected.
    await t.reset();
    buffer.get().reset();
    t.setFetch(buffer.get().fetch);
    const w = await world({ posts: [{ key: 'only', status: 'approved' }] });
    buffer.get().state.headError = `connection reset near ${KEYS.B}`;
    const spy = vi.spyOn(t.prisma.batch, 'update').mockRejectedValue(new Error(`database said ${KEYS.A}`));
    try {
      await send(w.owner.api, w.batch.id, 'draft');
      await t.jobs.drain(t.deps);
    } finally {
      spy.mockRestore();
    }
    run = (await w.owner.api.get(`/api/schedule/batches/${w.batch.id}/deliveries`)).body.lastRun;
    expect(run.state).toBe('refused');
    expect(run.log.join('\n')).toContain('connection reset');
    expect(JSON.stringify(run)).not.toContain('bufkey');
    expect(JSON.stringify(await t.prisma.auditLog.findMany())).not.toContain('bufkey');
  });

  it('masks lines with the engine masker', async () => {
    const { maskLines } = await import('./services/schedule.js');
    const engine = await (await import('./engine/pipeline.js')).pipelineEngine();
    expect(maskLines(engine.maskSecrets, ['x secret-key-1 y', 'Bearer abc.def'], ['secret-key-1'])).toEqual(['x *** y', 'Bearer ***']);
  });
});

describe('approval going stale', () => {
  const sourced = async (patch: (id: string) => Promise<unknown>) => {
    const w = await world({ posts: [{ key: 'a', status: 'approved' }, { key: 'b', status: 'approved' }] });
    const item = await t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'A fact', body: 'b', status: 'confirmed', createdById: w.owner.user.id } });
    await t.prisma.post.update({ where: { id: w.posts[0]!.id }, data: { sources: [item.id] } });
    await patch(item.id);
    return { ...w, item };
  };

  it('blocks a post whose source went stale after approval, in the plan and in the job, and the token changes', async () => {
    const w = await world({ posts: [{ key: 'a', status: 'approved' }, { key: 'b', status: 'approved' }] });
    const item = await t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'A fact', body: 'b', status: 'confirmed', createdById: w.owner.user.id } });
    await t.prisma.post.update({ where: { id: w.posts[0]!.id }, data: { sources: [item.id] } });
    const before = await planOf(w.owner.api, w.batch.id, 'draft');
    expect(before.willSend).toBe(8);

    // Changed behind the app's back (no route ran), so only the plan-time check can catch it.
    await t.prisma.vaultItem.update({ where: { id: item.id }, data: { status: 'unconfirmed' } });
    const after = await planOf(w.owner.api, w.batch.id, 'draft');
    expect(after.token).not.toBe(before.token);
    expect(after.willSend).toBe(4);
    const row = after.rows.find((r: any) => r.postKey === 'a');
    expect(row.willSend).toBe(false);
    expect(row.problems[0]).toContain('Approval no longer holds');
    expect(row.problems.join(' ')).toContain('has not been confirmed');

    // A stale dialog quoting the old plan is refused; the current plan sends only the clean post.
    const stale = await w.owner.api.post(`/api/schedule/batches/${w.batch.id}/send`, { mode: 'draft', confirm: { postsXChannels: before.count, token: before.token } });
    expect(stale.status).toBe(409);
    expect((await send(w.owner.api, w.batch.id, 'draft')).res.status).toBe(202);
    await t.jobs.drain(t.deps);
    expect(buffer.get().creates()).toHaveLength(4);
    expect((await t.prisma.delivery.findMany({ include: { post: true } })).every((d) => d.post.postKey === 'b')).toBe(true);

    // The job checks again by itself, even without a token.
    await handlers.sendBatch(t.deps, { batchId: w.batch.id, mode: 'draft', actorId: w.owner.user.id });
    expect(buffer.get().creates()).toHaveLength(4);
  });

  it('puts the cited posts back to draft when the vault item is edited, unconfirmed or deleted, and audits it', async () => {
    for (const [name, change] of [
      ['edit', (api: Api, id: string) => api.patch(`/api/vault/${id}`, { body: 'New wording' })],
      ['unconfirm', (api: Api, id: string) => api.post(`/api/vault/${id}/unconfirm`)],
      ['delete', (api: Api, id: string) => api.delete(`/api/vault/${id}`)],
    ] as const) {
      await t.reset();
      const w = await sourced(async () => {});
      const res = await change(w.owner.api, w.item.id);
      expect(res.status, name).toBe(200);
      const statuses = Object.fromEntries((await t.prisma.post.findMany()).map((p) => [p.postKey, p.status]));
      expect(statuses, name).toEqual({ a: 'draft', b: 'approved' });
      const log = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'post.approval_revoked' } });
      expect(log.detail, name).toMatchObject({ vaultItemId: w.item.id, postKey: 'a' });
    }
  });

  it('also revokes posts that use the item as a design photo', async () => {
    const w = await world({ posts: [{ key: 'a', status: 'approved', design: { template: 'photo', headline: 'Hello *x*', image: 'design/assets/photos/p.jpg', vaultItemId: 'x' } }, { key: 'b', status: 'approved' }] });
    const photo = await t.prisma.vaultItem.create({ data: { kind: 'photo', title: 'P', body: '', status: 'confirmed', fileKey: 'vault/p.jpg', fileName: 'p.jpg', licence: 'own', createdById: w.owner.user.id } });
    await t.prisma.post.update({ where: { id: w.posts[0]!.id }, data: { design: { template: 'photo', headline: 'Hello *x*', image: 'design/assets/photos/p.jpg', vaultItemId: photo.id } } });
    expect((await w.owner.api.patch(`/api/vault/${photo.id}`, { licence: 'rights_to_confirm' })).status).toBe(200);
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: w.posts[0]!.id } })).status).toBe('draft');
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: w.posts[1]!.id } })).status).toBe('approved');
  });
});

describe('activity of a send', () => {
  it('shows the send as a run from queued to done, with what was sent and the progress', async () => {
    const { owner, batch } = await world();
    const { res } = await send(owner.api, batch.id, 'draft');
    expect(res.status).toBe(202);
    const queued = await t.prisma.activityRun.findFirstOrThrow({ where: { kind: 'send-batch' } });
    expect(queued).toMatchObject({ status: 'queued', batchId: batch.id, actorId: owner.user.id, jobId: res.body.jobId });
    expect(queued.title).toContain(batch.title);
    expect(t.jobs.enqueued[0]!.payload).toMatchObject({ activityId: queued.id });

    await t.jobs.drain(t.deps);
    const run = await t.prisma.activityRun.findUniqueOrThrow({ where: { id: queued.id } });
    expect(run.status).toBe('done');
    expect(run.startedAt).not.toBeNull();
    expect(run.finishedAt).not.toBeNull();
    expect((run.progress as any)).toMatchObject({ step: 'Sending to Buffer', done: 8, total: 8 });
    const result = run.result as any;
    expect(result.created).toBe(8);
    expect(result.sent).toHaveLength(8);
    expect(result.sent[0]).toEqual({ title: expect.any(String), network: expect.any(String) });
    expect(result.failedPosts).toEqual([]);
    expect(await t.prisma.activityRun.count({ where: { kind: 'send-batch' } })).toBe(1);
  });

  it('ends the run as failed with a readable reason when the plan has changed, and never keeps an account key', async () => {
    const { owner, batch } = await world();
    await handlers.sendBatch(t.deps, { batchId: batch.id, mode: 'draft', actorId: owner.user.id, planToken: 'stale' });
    const run = await t.prisma.activityRun.findFirstOrThrow({ where: { kind: 'send-batch' } });
    expect(run).toMatchObject({ status: 'failed', batchId: batch.id });
    expect(run.error).toContain('The plan changed');
    expect(JSON.stringify(run)).not.toContain(KEYS.A);
    expect(JSON.stringify(run)).not.toContain(KEYS.B);
  });
});
