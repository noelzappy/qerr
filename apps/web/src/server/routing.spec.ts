import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

const KEY = 'buf_live_SECRETKEY1234567890';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Two fake accounts: "main" answers, "broken" is rejected.
function fakeBuffer() {
  return (async (_url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string>).Authorization;
    if (auth.includes('BROKEN')) return new Response('nope', { status: 401 });
    const { query } = JSON.parse(String(init?.body));
    if (query.includes('organizations')) return json({ data: { account: { organizations: [{ id: 'org1', name: 'Acme Savings' }] } } });
    return json({ data: { channels: [{ id: 'ig1', name: 'savingspaa', displayName: null, service: 'instagram', isQueuePaused: false }, { id: 'li1', name: 'Acme Savings', displayName: null, service: 'linkedin', isQueuePaused: false }] } });
  }) as unknown as typeof fetch;
}

async function setup() {
  const adminUser = await t.createUser('admin');
  const admin = t.api(await t.signIn(adminUser));
  const editor = t.api(await t.signIn(await t.createUser('editor')));
  const main = (await admin.post('/api/buffer-accounts', { name: 'main', apiKey: KEY })).body.account;
  const broken = (await admin.post('/api/buffer-accounts', { name: 'broken', apiKey: 'BROKEN-key-1234567890' })).body.account;
  return { admin, editor, main, broken };
}

describe('routing: access', () => {
  it('needs a session; editors read but cannot write; channels are admin only', async () => {
    const { admin, editor, main } = await setup();
    const anon = t.api();
    expect((await anon.get('/api/routing')).status).toBe(401);
    expect((await anon.get('/api/routing/channels')).status).toBe(401);
    expect((await anon.put('/api/routing', { network: 'x', accountId: main.id, channelId: 'c' })).status).toBe(401);
    expect((await anon.delete('/api/routing/x')).status).toBe(401);

    expect((await editor.get('/api/routing')).status).toBe(200);
    expect((await editor.get('/api/routing/channels')).status).toBe(403);
    expect((await editor.put('/api/routing', { network: 'x', accountId: main.id, channelId: 'c' })).status).toBe(403);
    expect((await editor.delete('/api/routing/x')).status).toBe(403);
    expect(await t.prisma.channelRoute.count()).toBe(0);
    expect((await admin.get('/api/routing')).status).toBe(200);
  });
});

describe('routing: round trip', () => {
  it('sets, lists, replaces and clears a route, with audit and no key anywhere', async () => {
    const { admin, editor, main, broken } = await setup();
    const empty = (await editor.get('/api/routing')).body.routing;
    expect(empty.map((r: any) => r.network)).toEqual(['instagram', 'linkedin', 'facebook', 'x']);
    expect(empty.every((r: any) => r.route === null)).toBe(true);

    const set = await admin.put('/api/routing', { network: 'instagram', accountId: main.id, channelId: 'ig1', channelName: 'savingspaa' });
    expect(set.status).toBe(200);
    expect(set.body.route).toMatchObject({ network: 'instagram', accountName: 'main', channelId: 'ig1', verified: null });

    const list = (await editor.get('/api/routing')).body.routing;
    expect(list[0].route).toMatchObject({ accountId: main.id, accountName: 'main', channelId: 'ig1', channelName: 'savingspaa' });
    expect(list[0].route.stale).toMatchObject({ keyExpired: false, expiryWarning: false, channelMissing: null });

    await admin.put('/api/routing', { network: 'instagram', accountId: broken.id, channelId: 'ig9' });
    expect((await editor.get('/api/routing')).body.routing[0].route.accountName).toBe('broken');
    expect(await t.prisma.channelRoute.count()).toBe(1);

    expect((await admin.delete('/api/routing/instagram')).status).toBe(200);
    expect((await admin.delete('/api/routing/instagram')).status).toBe(404);
    expect((await t.prisma.auditLog.findMany({ orderBy: { at: 'asc' } })).map((a) => a.action)).toEqual(['buffer_account.create', 'buffer_account.create', 'routing.set', 'routing.set', 'routing.clear']);
  });

  it('rejects unknown networks and accounts', async () => {
    const { admin, main } = await setup();
    expect((await admin.put('/api/routing', { network: 'myspace', accountId: main.id, channelId: 'c' })).status).toBe(400);
    expect((await admin.put('/api/routing', { network: 'x', accountId: '00000000-0000-0000-0000-000000000000', channelId: 'c' })).status).toBe(404);
    expect((await admin.put('/api/routing', { network: 'x', accountId: main.id, channelId: '' })).status).toBe(400);
    expect((await admin.delete('/api/routing/myspace')).status).toBe(400);
  });

  it('flags a routed account whose key has expired', async () => {
    const { admin, editor, main } = await setup();
    await admin.put('/api/routing', { network: 'x', accountId: main.id, channelId: 'x1' });
    await admin.patch(`/api/buffer-accounts/${main.id}`, { keyExpiresAt: new Date(Date.now() - 86_400_000).toISOString() });
    const x = (await editor.get('/api/routing')).body.routing.find((r: any) => r.network === 'x');
    expect(x.route.stale).toMatchObject({ keyExpired: true, expiryWarning: true });
  });
});

describe('routing: channel list', () => {
  it('aggregates every account, reports one failing account without failing the rest, and caches for 60 seconds', async () => {
    const { admin, main } = await setup();
    t.setFetch(fakeBuffer());
    t.setNow(new Date('2026-11-20T10:00:00Z'));
    const res = await admin.get('/api/routing/channels');
    expect(res.status).toBe(200);
    const by = Object.fromEntries(res.body.accounts.map((a: any) => [a.accountName, a]));
    expect(by.main.ok).toBe(true);
    expect(by.main.channels.map((c: any) => c.id)).toEqual(['ig1', 'li1']);
    expect(by.broken.ok).toBe(false);
    expect(by.broken.error).toContain('rejected the API key');
    expect(JSON.stringify(res.body)).not.toContain('SECRETKEY');

    const calls = t.fetchCalls.length;
    t.setNow(new Date('2026-11-20T10:00:59Z'));
    await admin.get('/api/routing/channels');
    expect(t.fetchCalls.length).toBe(calls);
    t.setNow(new Date('2026-11-20T10:01:01Z'));
    await admin.get('/api/routing/channels');
    expect(t.fetchCalls.length).toBeGreaterThan(calls);
    const again = t.fetchCalls.length;
    await admin.get('/api/routing/channels?refresh=1');
    expect(t.fetchCalls.length).toBeGreaterThan(again);

    // With a fresh list, a route is verified or flagged as missing.
    const ok = await admin.put('/api/routing', { network: 'instagram', accountId: main.id, channelId: 'ig1' });
    expect(ok.body.route.verified).toBe(true);
    expect(ok.body.route.channelName).toBe('savingspaa');
    const gone = await admin.put('/api/routing', { network: 'x', accountId: main.id, channelId: 'nope' });
    expect(gone.status).toBe(200);
    expect(gone.body.route.verified).toBe(false);
    const x = (await admin.get('/api/routing')).body.routing.find((r: any) => r.network === 'x');
    expect(x.route.stale.channelMissing).toBe(true);
  });
});
