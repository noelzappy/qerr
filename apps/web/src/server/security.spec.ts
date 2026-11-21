import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppAndDeps } from './app.js';
import { createTestApp, TEST_ORIGIN, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

const signInRaw = (email: string, password: string, ip = '198.51.100.1') =>
  t.app.request('/api/auth/sign-in/email', {
    method: 'POST', headers: { origin: TEST_ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password }),
  });

describe('healthz', () => {
  it('answers 200 {"ok":true} while the database answers', async () => {
    const res = await t.app.request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('answers 503 when the database does not', async () => {
    const broken = new Proxy(t.prisma, { get: (target, prop) => (prop === '$queryRaw' ? () => Promise.reject(new Error('connection refused')) : Reflect.get(target, prop)) });
    const { app } = createAppAndDeps({ ...t.deps, prisma: broken });
    const res = await app.request('/healthz');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});

describe('security headers', () => {
  it.each(['/healthz', '/api/me', '/api/nothing', '/some/page'])('are set on %s', async (url) => {
    const res = await t.app.request(url);
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp.split(';').find((d) => d.trim().startsWith('script-src'))).not.toContain('unsafe');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get('strict-transport-security')).toBeNull(); // test environment is not production
  });

  it('marks API answers as not cacheable', async () => {
    expect((await t.app.request('/api/me')).headers.get('cache-control')).toBe('no-store');
  });

  it('adds HSTS and secure session cookies in production', async () => {
    const prod = await createTestApp({ config: { NODE_ENV: 'production' } });
    try {
      const user = await prod.createUser('editor');
      expect((await prod.app.request('/healthz')).headers.get('strict-transport-security')).toContain('max-age=');
      const res = await prod.app.request('/api/auth/sign-in/email', {
        method: 'POST', headers: { origin: TEST_ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.50' },
        body: JSON.stringify({ email: user.email, password: user.password }),
      });
      expect(res.status).toBe(200);
      const cookie = res.headers.getSetCookie().find((c) => c.includes('session_token'))!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Secure/i);
    } finally {
      await prod.close();
    }
  });

  it('sets an httpOnly, sameSite lax session cookie', async () => {
    const user = await t.createUser('editor');
    const res = await signInRaw(user.email, user.password);
    const cookie = res.headers.getSetCookie().find((c) => c.includes('session_token'))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
});

describe('origin check', () => {
  it('refuses a state-changing request with no Origin or a foreign one', async () => {
    const admin = await t.createUser('admin');
    const cookies = await t.signIn(admin);
    const body = JSON.stringify({ email: 'a@example.test', role: 'editor' });
    const headers = { cookie: cookies, 'content-type': 'application/json' };
    const none = await t.app.request('/api/users/invites', { method: 'POST', headers, body });
    const evil = await t.app.request('/api/users/invites', { method: 'POST', headers: { ...headers, origin: 'https://evil.example' }, body });
    expect(none.status).toBe(403);
    expect(evil.status).toBe(403);
    expect(await t.prisma.invite.count()).toBe(0);
  });

  it('also guards the sign-in and reset endpoints', async () => {
    const user = await t.createUser('editor');
    const res = await t.app.request('/api/auth/sign-in/email', {
      method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    expect(res.status).toBe(403);
  });

  it('lets reads through without an Origin and accepts an extra trusted origin', async () => {
    expect((await t.app.request('/api/me')).status).toBe(401);
    const dev = await createTestApp({ config: { TRUSTED_ORIGINS: 'http://localhost:5173' } });
    try {
      const res = await dev.app.request('/api/invites/accept', {
        method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    } finally {
      await dev.close();
    }
  });
});

describe('request handling', () => {
  it('refuses a JSON body over 1 MB', async () => {
    const big = JSON.stringify({ token: 'x'.repeat(1_200_000) });
    const res = await t.app.request('/api/invites/accept', { method: 'POST', headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' }, body: big });
    expect(res.status).toBe(413);
  });

  it('answers a bad body with 400 and names the field, not the value', async () => {
    const res = await t.api().post('/api/invites/accept', { token: 'short', name: '', password: 'p' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual(['name', 'password', 'token']);
    const text = await t.app.request('/api/invites/accept', { method: 'POST', headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' }, body: '{nope' });
    expect(text.status).toBe(400);
  });

  it('answers unknown API paths with JSON 404', async () => {
    const res = await t.api().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('hides internals when something breaks', async () => {
    const admin = await t.createUser('admin');
    const cookies = await t.signIn(admin);
    const spy = vi.spyOn(t.prisma.user, 'findMany').mockRejectedValue(new Error('boom postgresql://user:hunter2@db:5432/x'));
    const quiet = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const res = await t.api(cookies).get('/api/users');
      expect(res.status).toBe(500);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('hunter2');
      expect(text).not.toContain('boom');
      expect(text).not.toMatch(/at \S+ \(/);
      expect(res.body.requestId).toBe(res.headers.get('x-request-id'));
    } finally {
      spy.mockRestore();
      quiet.mockRestore();
    }
  });
});

describe('the web app', () => {
  it('serves the built files, falls back to index.html for pages and never serves outside the folder', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-web-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>desk</title>');
    fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)');
    const web = await createTestApp({ webDir: dir });
    try {
      const page = await web.app.request('/batches/abc');
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<title>desk</title>');
      expect(page.headers.get('content-security-policy')).toContain("script-src 'self'");
      const js = await web.app.request('/assets/app.js');
      expect(js.headers.get('content-type')).toContain('javascript');
      expect(js.headers.get('cache-control')).toContain('immutable');
      expect((await web.app.request('/assets/missing.js')).status).toBe(404);
      expect((await web.app.request('/api/unknown')).headers.get('content-type')).toContain('application/json');
      // a climbing path never reads outside the folder: it gets the app shell or a 404, not the file
      for (const evil of ['/..%2f..%2f..%2fetc%2fpasswd', '/%2e%2e/%2e%2e/package.json', '/assets/..%2f..%2fpackage.json']) {
        const text = await (await web.app.request(evil)).text();
        expect(text).not.toContain('vesk-app');
        expect(text).not.toContain('root:');
      }
    } finally {
      await web.close();
    }
  });
});
