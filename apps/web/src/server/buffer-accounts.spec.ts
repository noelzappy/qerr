import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAccountsConfig } from './services/buffer-accounts.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

const KEY = 'buf_live_SECRETKEY1234567890';
const ID = '00000000-0000-0000-0000-000000000000';
const DAY = 24 * 60 * 60 * 1000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// A fake Buffer: answers the two queries the check uses.
function fakeBuffer(options: { orgs?: Array<{ id: string; name: string }>; channels?: Record<string, unknown[]> } = {}) {
  const orgs = options.orgs ?? [{ id: 'org1', name: 'Acme Savings' }];
  return (async (_url: string, init?: RequestInit) => {
    const { query } = JSON.parse(String(init?.body));
    if (query.includes('organizations')) return json({ data: { account: { organizations: orgs } } });
    const org = /organizationId: "([^"]+)"/.exec(query)![1]!;
    return json({ data: { channels: options.channels?.[org] ?? [
      { id: `${org}-ig`, name: 'savingspaa', displayName: 'Acme Savings', service: 'instagram', isQueuePaused: false },
      { id: `${org}-x`, name: 'savingspaa_gh', displayName: null, service: 'twitter', isQueuePaused: false },
    ] } });
  }) as unknown as typeof fetch;
}

async function admin() {
  const user = await t.createUser('admin');
  return { user, api: t.api(await t.signIn(user)) };
}
async function newAccount(api: ReturnType<typeof t.api>, extra: Record<string, unknown> = {}) {
  const res = await api.post('/api/buffer-accounts', { name: 'main', apiKey: KEY, ...extra });
  expect(res.status).toBe(201);
  return res.body.account as { id: string };
}

const ROUTES: Array<[string, string, unknown?]> = [
  ['GET', '/api/buffer-accounts'],
  ['POST', '/api/buffer-accounts', { name: 'x', apiKey: KEY }],
  ['PATCH', `/api/buffer-accounts/${ID}`, { name: 'y' }],
  ['DELETE', `/api/buffer-accounts/${ID}`],
  ['POST', `/api/buffer-accounts/${ID}/check`],
];

describe('buffer accounts: access', () => {
  it.each(ROUTES)('%s %s: anonymous 401, editor 403', async (method, url, body) => {
    const call = (cookies?: string) => {
      const a = t.api(cookies);
      return method === 'GET' ? a.get(url) : method === 'DELETE' ? a.delete(url) : method === 'PATCH' ? a.patch(url, body) : a.post(url, body);
    };
    expect((await call()).status).toBe(401);
    expect((await call(await t.signIn(await t.createUser('editor')))).status).toBe(403);
    expect(await t.prisma.bufferAccount.count()).toBe(0);
  });
});

describe('buffer accounts: the key never leaves', () => {
  it('is encrypted at rest, shows only the last four, and is in no response or audit row', async () => {
    const { api } = await admin();
    const created = await api.post('/api/buffer-accounts', { name: 'main', apiKey: KEY, keyExpiresAt: new Date(Date.now() + 30 * DAY).toISOString(), captionLimits: { x: 250 } });
    expect(created.status).toBe(201);
    expect(created.body.account.keyLast4).toBe('7890');
    const id = created.body.account.id;
    const seen = [JSON.stringify(created.body)];
    seen.push(JSON.stringify((await api.get('/api/buffer-accounts')).body));
    seen.push(JSON.stringify((await api.patch(`/api/buffer-accounts/${id}`, { name: 'main', organizationId: 'org1' })).body));
    seen.push(JSON.stringify((await api.patch(`/api/buffer-accounts/${id}`, { apiKey: `${KEY}-rotated`, keyExpiresAt: null })).body));
    t.setFetch(async () => json({}, 401));
    seen.push(JSON.stringify((await api.post(`/api/buffer-accounts/${id}/check`)).body));

    const row = await t.prisma.bufferAccount.findUniqueOrThrow({ where: { id } });
    expect(row.keyCipher).not.toContain('SECRETKEY');
    expect(row.keyCipher.startsWith('v1.')).toBe(true);
    const audits = JSON.stringify(await t.prisma.auditLog.findMany());
    for (const text of [...seen, audits]) {
      expect(text).not.toContain('SECRETKEY');
      expect(text).not.toContain(row.keyCipher);
    }
    expect(audits).toContain('"keyChanged":true');
    const actions = (await t.prisma.auditLog.findMany({ orderBy: { at: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['buffer_account.create', 'buffer_account.update', 'buffer_account.update', 'buffer_account.check']);
  });

  it('loadAccountsConfig returns the engine shape with the decrypted key', async () => {
    const { api } = await admin();
    const a = await newAccount(api, { organizationId: 'org1', captionLimits: { x: 250 } });
    await t.prisma.channelRoute.create({ data: { network: 'x', accountId: a.id, channelId: 'ch-x' } });
    const cfg = await loadAccountsConfig(t.deps);
    expect(cfg).toEqual({
      accounts: [{ name: 'main', apiKey: KEY, organizationId: 'org1', captionLimits: { x: 250 } }],
      routing: { x: { account: 'main', channelId: 'ch-x' } },
    });
  });
});

describe('buffer accounts: validation', () => {
  it('rejects bad names, unknown networks, bad limits and short keys; blank key on update keeps the old one', async () => {
    const { api } = await admin();
    expect((await api.post('/api/buffer-accounts', { name: 'has space', apiKey: KEY })).status).toBe(400);
    expect((await api.post('/api/buffer-accounts', { name: 'ok', apiKey: 'short' })).status).toBe(400);
    expect((await api.post('/api/buffer-accounts', { name: 'ok', apiKey: KEY, captionLimits: { myspace: 100 } })).status).toBe(400);
    expect((await api.post('/api/buffer-accounts', { name: 'ok', apiKey: KEY, captionLimits: { x: 0 } })).status).toBe(400);
    expect((await api.post('/api/buffer-accounts', { name: 'ok', apiKey: KEY, captionLimits: { x: 2.5 } })).status).toBe(400);
    const a = await newAccount(api);
    expect((await api.post('/api/buffer-accounts', { name: 'main', apiKey: KEY })).status).toBe(409);
    const before = await t.prisma.bufferAccount.findUniqueOrThrow({ where: { id: a.id } });
    const res = await api.patch(`/api/buffer-accounts/${a.id}`, { apiKey: '', captionLimits: { instagram: 2000 } });
    expect(res.status).toBe(200);
    const after = await t.prisma.bufferAccount.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.keyCipher).toBe(before.keyCipher);
    expect(after.captionLimits).toEqual({ instagram: 2000 });
  });

  it('shows days left and warns at 7 days, or when expired', async () => {
    const { api } = await admin();
    const now = new Date('2026-11-20T10:00:00Z');
    t.setNow(now);
    const at = (days: number) => new Date(now.getTime() + days * DAY).toISOString();
    for (const [name, days] of [['far', 30], ['week', 7], ['soon', 3], ['gone', -2]] as const) {
      await api.post('/api/buffer-accounts', { name, apiKey: KEY, keyExpiresAt: at(days) });
    }
    await api.post('/api/buffer-accounts', { name: 'noexp', apiKey: KEY });
    const list = (await api.get('/api/buffer-accounts')).body.accounts as Array<{ name: string; daysLeft: number | null; expiryWarning: boolean; expired: boolean }>;
    const by = Object.fromEntries(list.map((a) => [a.name, a]));
    expect(by.far).toMatchObject({ daysLeft: 30, expiryWarning: false, expired: false });
    expect(by.week).toMatchObject({ daysLeft: 7, expiryWarning: true, expired: false });
    expect(by.soon).toMatchObject({ daysLeft: 3, expiryWarning: true });
    expect(by.gone).toMatchObject({ expiryWarning: true, expired: true });
    expect(by.noexp).toMatchObject({ daysLeft: null, expiryWarning: false });
  });
});

describe('buffer accounts: delete and rename', () => {
  it('refuses to delete an account that routing or deliveries use, and says which', async () => {
    const { api, user } = await admin();
    const a = await newAccount(api);
    await t.prisma.channelRoute.create({ data: { network: 'instagram', accountId: a.id, channelId: 'c1' } });
    const routed = await api.delete(`/api/buffer-accounts/${a.id}`);
    expect(routed.status).toBe(409);
    expect(routed.body.error).toContain('instagram');
    await t.prisma.channelRoute.deleteMany();

    const batch = await t.prisma.batch.create({ data: { name: 'b', title: 'b', timezone: 'UTC', defaultTime: '10:00', defaultNetworks: [], ownerId: user.id } });
    const post = await t.prisma.post.create({ data: { batchId: batch.id, postKey: 'p1', position: 1, title: 't', date: '2026-12-01', time: '10:00', caption: 'c' } });
    await t.prisma.delivery.create({ data: { postId: post.id, network: 'x', account: 'main', channelId: 'c', mode: 'draft', status: 'created', hash: 'h', dueAt: new Date() } });
    const delivered = await api.delete(`/api/buffer-accounts/${a.id}`);
    expect(delivered.status).toBe(409);
    expect(delivered.body.error).toContain('1 delivery');
    expect((await api.patch(`/api/buffer-accounts/${a.id}`, { name: 'renamed' })).status).toBe(409);
    expect(await t.prisma.bufferAccount.count()).toBe(1);

    await t.prisma.delivery.deleteMany();
    expect((await api.delete(`/api/buffer-accounts/${a.id}`)).status).toBe(200);
    expect(await t.prisma.bufferAccount.count()).toBe(0);
    expect((await t.prisma.auditLog.findMany()).map((r) => r.action)).toContain('buffer_account.delete');
  });
});

describe('buffer accounts: check against a fake Buffer', () => {
  it('lists organisations and channels with their network, using the decrypted key', async () => {
    const { api } = await admin();
    const a = await newAccount(api);
    t.setFetch(fakeBuffer());
    const res = await api.post(`/api/buffer-accounts/${a.id}/check`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.organizations).toEqual([{ id: 'org1', name: 'Acme Savings' }]);
    expect(res.body.channels.map((c: any) => [c.id, c.network])).toEqual([['org1-ig', 'instagram'], ['org1-x', 'x']]);
    expect(t.fetchCalls.every((c) => (c.init?.headers as Record<string, string>).Authorization === `Bearer ${KEY}`)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('SECRETKEY');
  });

  it('reports a 401 from Buffer as a failed check with a masked message', async () => {
    const { api } = await admin();
    const a = await newAccount(api);
    t.setFetch((async () => new Response(`bad token ${KEY}`, { status: 401 })) as unknown as typeof fetch);
    const res = await api.post(`/api/buffer-accounts/${a.id}/check`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, status: 401, channels: [] });
    expect(res.body.error).toContain('rejected the API key');
    expect(JSON.stringify(res.body)).not.toContain('SECRETKEY');
  });

  it('reports a network failure without the key', async () => {
    const { api } = await admin();
    const a = await newAccount(api);
    t.setFetch((async () => { throw new Error(`connect ECONNREFUSED while sending ${KEY}`); }) as unknown as typeof fetch);
    const res = await api.post(`/api/buffer-accounts/${a.id}/check`);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('Network error');
    expect(JSON.stringify(res.body)).not.toContain('SECRETKEY');
    expect(JSON.stringify(await t.prisma.auditLog.findMany())).not.toContain('SECRETKEY');
  });

  it('lists only the chosen organisation when one is set', async () => {
    const { api } = await admin();
    const a = await newAccount(api, { organizationId: 'org2' });
    t.setFetch(fakeBuffer({ orgs: [{ id: 'org1', name: 'One' }, { id: 'org2', name: 'Two' }] }));
    const res = await api.post(`/api/buffer-accounts/${a.id}/check`);
    expect(res.body.channels.map((c: any) => c.organizationId)).toEqual(['org2', 'org2']);
  });
});
