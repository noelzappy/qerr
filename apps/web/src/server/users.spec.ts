import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, TEST_ORIGIN, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

const ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ROUTES: Array<[string, string, unknown?]> = [
  ['GET', '/api/users'],
  ['PATCH', `/api/users/${ID}/role`, { role: 'editor' }],
  ['POST', `/api/users/${ID}/disable`],
  ['POST', `/api/users/${ID}/enable`],
  ['POST', `/api/users/${ID}/reset-link`],
  ['GET', '/api/users/invites'],
  ['POST', '/api/users/invites', { email: 'x@example.test', role: 'editor' }],
  ['DELETE', `/api/users/invites/${ID}`],
  ['GET', '/api/audit'],
];

async function call(cookies: string | undefined, method: string, url: string, body?: unknown) {
  const a = t.api(cookies);
  return method === 'GET' ? a.get(url) : method === 'DELETE' ? a.delete(url) : method === 'PATCH' ? a.patch(url, body) : a.post(url, body);
}

describe('roles on every admin route', () => {
  it.each(ADMIN_ROUTES)('%s %s: anonymous 401, editor 403', async (method, url, body) => {
    expect((await call(undefined, method, url, body)).status).toBe(401);
    const editor = await t.createUser('editor');
    const res = await call(await t.signIn(editor), method, url, body);
    expect(res.status).toBe(403);
    expect(await t.prisma.invite.count()).toBe(0);
  });

  it('lets an admin list users without exposing secrets', async () => {
    const admin = await t.createUser('admin');
    await t.createUser('editor');
    const res = await t.api(await t.signIn(admin)).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    expect(Object.keys(res.body.users[0]).sort()).toEqual(['createdAt', 'disabled', 'email', 'id', 'name', 'role']);
  });
});

describe('disabled users', () => {
  it('cannot sign in, and an existing session stops working at once', async () => {
    const admin = await t.createUser('admin');
    const editor = await t.createUser('editor');
    const adminApi = t.api(await t.signIn(admin));
    const editorCookies = await t.signIn(editor, '203.0.113.9');
    expect((await t.api(editorCookies).get('/api/me')).status).toBe(200);

    expect((await adminApi.post(`/api/users/${editor.id}/disable`)).body.user.disabled).toBe(true);
    expect((await t.api(editorCookies).get('/api/me')).status).toBe(401);
    expect(await t.prisma.session.count({ where: { userId: editor.id } })).toBe(0);

    const attempt = await t.app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { origin: TEST_ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify({ email: editor.email, password: editor.password }),
    });
    expect(attempt.status).toBe(403);
    expect(attempt.headers.getSetCookie().join(';')).not.toContain('session_token');

    await adminApi.post(`/api/users/${editor.id}/enable`);
    expect((await t.api(await t.signIn(editor, '203.0.113.9')).get('/api/me')).status).toBe(200);
  });

  it('rejects an existing session even when the row was changed behind the app', async () => {
    const editor = await t.createUser('editor');
    const cookies = await t.signIn(editor);
    await t.prisma.user.update({ where: { id: editor.id }, data: { disabled: true } });
    expect(await t.prisma.session.count({ where: { userId: editor.id } })).toBe(1);
    expect((await t.api(cookies).get('/api/me')).status).toBe(401);
  });
});

describe('last admin', () => {
  it('cannot be demoted or disabled', async () => {
    const admin = await t.createUser('admin');
    const a = t.api(await t.signIn(admin));
    expect((await a.patch(`/api/users/${admin.id}/role`, { role: 'editor' })).status).toBe(409);
    expect((await a.post(`/api/users/${admin.id}/disable`)).status).toBe(409);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe('admin');
  });

  it('can be demoted when another enabled admin exists', async () => {
    const first = await t.createUser('admin');
    const second = await t.createUser('admin');
    const a = t.api(await t.signIn(first));
    expect((await a.patch(`/api/users/${second.id}/role`, { role: 'editor' })).status).toBe(200);
    // now `first` is alone again
    expect((await a.patch(`/api/users/${first.id}/role`, { role: 'editor' })).status).toBe(409);
  });

  it('does not count a disabled admin as an admin', async () => {
    const first = await t.createUser('admin');
    await t.createUser('admin', { disabled: true });
    const a = t.api(await t.signIn(first));
    expect((await a.patch(`/api/users/${first.id}/role`, { role: 'editor' })).status).toBe(409);
  });

  it('returns 404 for a user that does not exist and 400 for a bad role', async () => {
    const admin = await t.createUser('admin');
    const a = t.api(await t.signIn(admin));
    expect((await a.patch(`/api/users/${ID}/role`, { role: 'editor' })).status).toBe(404);
    expect((await a.patch(`/api/users/${admin.id}/role`, { role: 'owner' })).status).toBe(400);
  });
});

describe('password reset', () => {
  async function resetThroughLink(token: string, newPassword: string) {
    return t.api().post('/api/auth/reset-password', { token, newPassword });
  }

  it('lets an admin make a link that sets a new password once', async () => {
    const admin = await t.createUser('admin');
    const editor = await t.createUser('editor');
    const oldCookies = await t.signIn(editor, '203.0.113.7');
    const res = await t.api(await t.signIn(admin)).post(`/api/users/${editor.id}/reset-link`, {});
    expect(res.status).toBe(200);
    expect(res.body.link).toContain('/reset-password?token=');
    const token = new URL(res.body.link).searchParams.get('token')!;

    expect((await resetThroughLink(token, 'short')).status).toBe(400);
    expect((await resetThroughLink(token, 'a brand new password')).status).toBe(200);
    expect((await resetThroughLink(token, 'another new password')).status).toBeGreaterThanOrEqual(400);

    // sessions from before the reset are gone, the old password no longer works, the new one does
    expect((await t.api(oldCookies).get('/api/me')).status).toBe(401);
    const old = await t.app.request('/api/auth/sign-in/email', {
      method: 'POST', headers: { origin: TEST_ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.8' },
      body: JSON.stringify({ email: editor.email, password: editor.password }),
    });
    expect(old.status).toBe(401);
    const cookies = await t.signIn({ email: editor.email, password: 'a brand new password' }, '203.0.113.8');
    expect((await t.api(cookies).get('/api/me')).status).toBe(200);
  });

  it('mails the link to the person when asked and mail is set up', async () => {
    const admin = await t.createUser('admin');
    const editor = await t.createUser('editor');
    const res = await t.api(await t.signIn(admin)).post(`/api/users/${editor.id}/reset-link`, { send: true });
    expect(res.body.emailed).toBe(true);
    expect(t.mailer.sent.at(-1)!.to).toBe(editor.email);
  });

  it('sends a reset email on request and answers the same for unknown addresses', async () => {
    const editor = await t.createUser('editor');
    const known = await t.api().post('/api/auth/request-password-reset', { email: editor.email });
    const unknown = await t.api().post('/api/auth/request-password-reset', { email: 'nobody@example.test' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    await new Promise((r) => setTimeout(r, 100));
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.sent[0]!.to).toBe(editor.email);
    const token = new URL(/https?:\/\/\S+/.exec(t.mailer.sent[0]!.text)![0]).searchParams.get('token')!;
    expect((await resetThroughLink(token, 'a brand new password')).status).toBe(200);
  });

  it('never returns a reset link to an anonymous caller', async () => {
    const editor = await t.createUser('editor');
    const res = await t.api().post('/api/auth/request-password-reset', { email: editor.email });
    expect(JSON.stringify(res.body)).not.toMatch(/token|reset-password\//);
  });
});
