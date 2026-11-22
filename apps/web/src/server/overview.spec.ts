import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { todayIn } from './routes/overview.js';
import { seedBatch } from './testing-batches.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(async () => {
  await t.reset();
  t.setNow(new Date('2027-06-01T08:00:00Z'));
});

async function seed() {
  const editor = await t.createUser('editor');
  const { batch } = await seedBatch(t, editor, {
    defaultNetworks: ['instagram', 'linkedin'],
    posts: [
      { key: 'past', date: '2027-05-30' },
      { key: 'today', date: '2027-06-01', time: '10:00' },
      { key: 'no-ig', date: '2027-06-03', networks: { skip: ['instagram'] } },
      { key: 'gone', date: '2027-06-02', status: 'removed' },
      { key: 'later', date: '2027-07-20', status: 'approved' },
    ],
  });
  return { editor, batch };
}

describe('overview', () => {
  it('the calendar lists the posts of a date range across batches, by network, without removed ones', async () => {
    const { editor } = await seed();
    const api = t.api(await t.signIn(editor));
    const all = await api.get('/api/overview/calendar?from=2027-05-29&to=2027-06-30');
    expect(all.status).toBe(200);
    expect(all.body.posts.map((p: { postKey: string }) => p.postKey)).toEqual(['past', 'today', 'no-ig']);
    expect(all.body.posts[1]).toMatchObject({ batch: { title: 'Test batch' }, networks: ['instagram', 'linkedin'], thumbnailUrl: expect.any(String) });
    const ig = await api.get('/api/overview/calendar?from=2027-05-29&to=2027-06-30&network=instagram');
    expect(ig.body.posts.map((p: { postKey: string }) => p.postKey)).toEqual(['past', 'today']);
    expect((await api.get('/api/overview/calendar?from=2027-06-30&to=2027-05-29')).status).toBe(400);
    expect((await api.get('/api/overview/calendar?from=2027-01-01&to=2027-12-31')).status).toBe(400);
    expect((await api.get('/api/overview/calendar?from=x&to=y')).status).toBe(400);
    expect((await t.api().get('/api/overview/calendar?from=2027-05-29&to=2027-06-30')).status).toBe(401);
  });

  it('home counts what is coming and what waits for approval; only admins see the setup steps', async () => {
    const { editor } = await seed();
    const asEditor = await t.api(await t.signIn(editor)).get('/api/overview/home');
    expect(asEditor.body.today).toBe('2027-06-01');
    expect(asEditor.body.counts).toMatchObject({ thisWeek: 2, upcoming: 3, awaitingApproval: 3 });
    expect(asEditor.body.upNext.map((p: { postKey: string }) => p.postKey)).toEqual(['today', 'no-ig', 'later']);
    expect(asEditor.body.setup).toEqual([]);
    expect(asEditor.body.spend).toBeNull();

    const admin = t.api(await t.signIn(await t.createUser('admin')));
    const home = await admin.get('/api/overview/home');
    const steps = Object.fromEntries(home.body.setup.map((s: { key: string; done: boolean }) => [s.key, s.done]));
    expect(steps).toEqual({ brand: false, logo: false, channels: false, ai: false, vault: false, team: true, batch: true });
    expect(home.body.spend).toEqual({ spentUsd: 0, monthlyBudgetUsd: null });
  });

  it('the AI step says which part is missing: the provider, then the monthly budget', async () => {
    await seed();
    const admin = t.api(await t.signIn(await t.createUser('admin')));
    const aiStep = async () => (await admin.get('/api/overview/home')).body.setup.find((s: { key: string }) => s.key === 'ai');
    expect(await aiStep()).toMatchObject({ done: false, missing: 'provider' });

    await t.prisma.aiProvider.create({ data: { name: 'Test', kind: 'anthropic', baseUrl: 'https://example.invalid', model: 'm', keyCipher: 'x', keyVersion: 1, keyLast4: '0000', tasks: ['draft'], enabled: true } });
    expect(await aiStep()).toMatchObject({ done: false, missing: 'budget' });

    await t.prisma.appSetting.upsert({ where: { key: 'monthlyBudgetUsd' }, update: { value: 25 }, create: { key: 'monthlyBudgetUsd', value: 25 } });
    expect(await aiStep()).toMatchObject({ done: true, missing: null });
  });

  it('the channels step is one step that says which half is missing: the Buffer account, then the routes', async () => {
    await seed();
    const admin = t.api(await t.signIn(await t.createUser('admin')));
    const home = async () => (await admin.get('/api/overview/home')).body.setup as Array<{ key: string; title: string; detail: string; to: string; done: boolean; missing?: string | null }>;
    const step = async () => (await home()).find((s) => s.key === 'channels')!;
    expect((await home()).length).toBe(7);
    expect((await home()).some((s) => s.key === 'buffer')).toBe(false);

    expect(await step()).toMatchObject({ title: 'Connect your channels', done: false, missing: 'account', to: '/settings/channels#accounts' });
    expect((await step()).detail).toMatch(/^Connect Buffer/);

    const account = await t.prisma.bufferAccount.create({ data: { name: 'main', keyCipher: 'x', keyVersion: 1, keyLast4: '0000' } });
    expect(await step()).toMatchObject({ done: false, missing: 'routes', to: '/settings/channels' });
    expect((await step()).detail).toMatch(/now choose a channel/);

    await t.prisma.channelRoute.create({ data: { network: 'linkedin', accountId: account.id, channelId: 'chan-1', channelName: 'LinkedIn page' } });
    expect(await step()).toMatchObject({ done: true, missing: null });
  });

  it('the channel list says which networks are routed and how many posts are coming for each', async () => {
    const { editor } = await seed();
    const res = await t.api(await t.signIn(editor)).get('/api/overview/channels');
    expect(res.body.upcoming).toBe(3);
    expect(res.body.next).toBe('2027-06-01');
    expect(res.body.channels).toEqual([
      { network: 'instagram', connected: false, channelName: null, upcoming: 2 },
      { network: 'linkedin', connected: false, channelName: null, upcoming: 3 },
      { network: 'facebook', connected: false, channelName: null, upcoming: 0 },
      { network: 'x', connected: false, channelName: null, upcoming: 0 },
    ]);
  });

  it('today is the brand\'s date, not the server\'s', () => {
    expect(todayIn('Pacific/Kiritimati', new Date('2027-06-01T12:00:00Z'))).toBe('2027-06-02');
    expect(todayIn('America/Los_Angeles', new Date('2027-06-01T03:00:00Z'))).toBe('2027-05-31');
  });
});
