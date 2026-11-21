import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cookieHeader, createTestApp, TEST_ORIGIN, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

const tokenOf = (link: string) => new URL(link).searchParams.get('token')!;

async function invite(email = 'new@example.test', role: 'admin' | 'editor' = 'editor') {
  const admin = await t.createUser('admin');
  const cookies = await t.signIn(admin);
  const res = await t.api(cookies).post('/api/users/invites', { email, role });
  return { admin, cookies, res, token: tokenOf(res.body.link) };
}

describe('invite flow', () => {
  it('lets an admin invite, the person accept, and then sign in', async () => {
    const { res, token } = await invite();
    expect(res.status).toBe(201);
    expect(res.body.link).toContain('/accept-invite?token=');
    expect(res.body.emailed).toBe(true);
    expect(t.mailer.sent[0]!.to).toBe('new@example.test');
    expect(t.mailer.sent[0]!.text).toContain(token);

    const info = await t.api().get(`/api/invites/${token}`);
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ email: 'new@example.test', role: 'editor' });

    const accepted = await t.api().post('/api/invites/accept', { token, name: 'Ama Mensah', password: 'a long enough password' });
    expect(accepted.status).toBe(201);

    const cookies = await t.signIn({ email: 'new@example.test', password: 'a long enough password' });
    const me = await t.api(cookies).get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: 'new@example.test', name: 'Ama Mensah', role: 'editor' });
  });

  it('creates an admin when the invite says admin', async () => {
    const { token } = await invite('boss@example.test', 'admin');
    await t.api().post('/api/invites/accept', { token, name: 'Boss', password: 'a long enough password' });
    const cookies = await t.signIn({ email: 'boss@example.test', password: 'a long enough password' });
    expect((await t.api(cookies).get('/api/me')).body.user.role).toBe('admin');
  });

  it('stores only a hash of the token and never returns it in lists', async () => {
    const { cookies, token } = await invite();
    const row = await t.prisma.invite.findFirstOrThrow();
    expect(row.tokenHash).not.toContain(token);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const list = await t.api(cookies).get('/api/users/invites');
    expect(JSON.stringify(list.body)).not.toContain(token);
    expect(JSON.stringify(list.body)).not.toContain(row.tokenHash);
    expect(list.body.invites[0].state).toBe('open');
  });

  it('refuses a token it does not know', async () => {
    expect((await t.api().get('/api/invites/not-a-real-token-at-all-0000')).status).toBe(404);
    const res = await t.api().post('/api/invites/accept', { token: 'x'.repeat(43), name: 'A', password: 'a long enough password' });
    expect(res.status).toBe(404);
  });

  it('refuses a used token', async () => {
    const { token } = await invite();
    await t.api().post('/api/invites/accept', { token, name: 'A', password: 'a long enough password' });
    const again = await t.api().post('/api/invites/accept', { token, name: 'B', password: 'another long password' });
    expect(again.status).toBe(410);
    expect(again.body.error).toMatch(/already been used/);
    expect((await t.api().get(`/api/invites/${token}`)).status).toBe(410);
    expect(await t.prisma.user.count({ where: { email: 'new@example.test' } })).toBe(1);
  });

  it('refuses an expired token', async () => {
    const { token } = await invite();
    await t.prisma.invite.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await t.api().post('/api/invites/accept', { token, name: 'A', password: 'a long enough password' });
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/expired/);
    expect(await t.prisma.user.count({ where: { email: 'new@example.test' } })).toBe(0);
  });

  it('refuses a revoked token', async () => {
    const { cookies, token } = await invite();
    const row = await t.prisma.invite.findFirstOrThrow();
    expect((await t.api(cookies).delete(`/api/users/invites/${row.id}`)).status).toBe(200);
    const res = await t.api().post('/api/invites/accept', { token, name: 'A', password: 'a long enough password' });
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/withdrawn/);
  });

  it('withdraws an older open invite when the same email is invited again', async () => {
    const { cookies, token } = await invite();
    const second = await t.api(cookies).post('/api/users/invites', { email: 'new@example.test', role: 'editor' });
    expect((await t.api().get(`/api/invites/${token}`)).status).toBe(410);
    expect((await t.api().get(`/api/invites/${tokenOf(second.body.link)}`)).status).toBe(200);
  });

  it('enforces the password policy', async () => {
    const { token } = await invite();
    const short = await t.api().post('/api/invites/accept', { token, name: 'A', password: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.details[0].path).toBe('password');
    expect(JSON.stringify(short.body)).not.toContain('short"');
    const nine = await t.api().post('/api/invites/accept', { token, name: 'A', password: '123456789' });
    expect(nine.status).toBe(400);
    // a rejected attempt leaves the invite usable
    const ok = await t.api().post('/api/invites/accept', { token, name: 'A', password: '1234567890' });
    expect(ok.status).toBe(201);
  });

  it('will not invite an email that already has an account', async () => {
    const { cookies } = await invite();
    const existing = await t.createUser('editor', { email: 'taken@example.test' });
    const res = await t.api(cookies).post('/api/users/invites', { email: existing.email, role: 'editor' });
    expect(res.status).toBe(409);
  });

  it('returns the link even when no mail is set up', async () => {
    t.mailer.enabled = false;
    try {
      const { res } = await invite();
      expect(res.body.link).toContain('token=');
      expect(res.body.emailed).toBe(false);
      expect(t.mailer.sent).toHaveLength(0);
    } finally {
      t.mailer.enabled = true;
    }
  });

  it('does not allow public sign-up', async () => {
    const res = await t.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'sneaky@example.test', password: 'a long enough password', name: 'Sneaky' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(cookieHeader(res)).toBe('');
    expect(await t.prisma.user.count({ where: { email: 'sneaky@example.test' } })).toBe(0);
  });
});
