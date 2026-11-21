import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config.js';
import { clientIp } from './middleware.js';
import { RateLimiter } from './rate-limit.js';
import { createTestApp, TEST_ORIGIN, testConfig, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp({ config: { RATE_LIMIT: 'on' } }); });
afterAll(() => t.close());
beforeEach(() => t.reset());

const TRUSTED = '198.51.100.7';
// A caller can write anything before the last entry; only the last one (added by the proxy) counts.
const spoof = (i: number, hop = TRUSTED) => `10.${i % 250}.${Math.floor(i / 250)}.1, ${hop}`;

function post(path: string, body: unknown, xff: string, extra: Record<string, string> = {}) {
  return t.app.request(path, {
    method: 'POST', headers: { origin: TEST_ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': xff, ...extra }, body: JSON.stringify(body),
  });
}
const signIn = (email: string, password: string, xff: string) => post('/api/auth/sign-in/email', { email, password }, xff);

describe('clientIp', () => {
  const h = (xff?: string) => new Headers(xff ? { 'x-forwarded-for': xff } : {});
  it('takes the last entry with one proxy, the second from last with two', () => {
    expect(clientIp(h('1.1.1.1, 2.2.2.2, 3.3.3.3'), 1)).toBe('3.3.3.3');
    expect(clientIp(h('1.1.1.1, 2.2.2.2, 3.3.3.3'), 2)).toBe('2.2.2.2');
  });
  it('uses the first entry when there are fewer than the hops, and the socket when there is no header', () => {
    expect(clientIp(h('9.9.9.9'), 3)).toBe('9.9.9.9');
    expect(clientIp(h(), 1, '192.0.2.5')).toBe('192.0.2.5');
    expect(clientIp(h('1.1.1.1, 2.2.2.2'), 0, '192.0.2.5')).toBe('192.0.2.5');
    expect(clientIp(h(), 1, '::ffff:192.0.2.5')).toBe('192.0.2.5');
    expect(clientIp(h())).toBe('unknown');
  });
});

describe('settings', () => {
  it('is on in production, off elsewhere, and RATE_LIMIT overrides both', () => {
    const base = { DATABASE_URL: 'postgresql://x', APP_URL: 'http://localhost:3000', BETTER_AUTH_SECRET: 'x'.repeat(40), APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') };
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).rateLimitEnabled).toBe(true);
    expect(loadConfig({ ...base, NODE_ENV: 'development' }).rateLimitEnabled).toBe(false);
    expect(loadConfig({ ...base, NODE_ENV: 'development', RATE_LIMIT: 'on' }).rateLimitEnabled).toBe(true);
    expect(loadConfig({ ...base, NODE_ENV: 'production', RATE_LIMIT: 'off' }).rateLimitEnabled).toBe(false);
    expect(loadConfig({ ...base }).trustedProxyHops).toBe(1);
    expect(testConfig().rateLimitEnabled).toBe(false); // the helper's default, so other specs are not throttled
  });
});

describe('sign-in', () => {
  it('blocks the sixth failure for one email and address, with Retry-After, even with the right password', async () => {
    const u = await t.createUser('editor');
    for (let i = 0; i < 5; i++) expect((await signIn(u.email, 'wrong password!!', TRUSTED)).status).toBe(401);
    const res = await signIn(u.email, u.password, TRUSTED);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it('is not reset by a spoofed or rotating X-Forwarded-For', async () => {
    const u = await t.createUser('editor');
    for (let i = 0; i < 5; i++) await signIn(u.email, 'wrong password!!', spoof(i));
    expect((await signIn(u.email, u.password, spoof(99))).status).toBe(429);
    // a header that only the caller could write is ignored too
    expect((await post('/api/auth/sign-in/email', { email: u.email, password: u.password }, spoof(100), { 'x-sd-client-ip': '203.0.113.200' })).status).toBe(429);
  });

  it('limits different emails from one address per address', async () => {
    for (let i = 0; i < 20; i++) expect((await signIn(`nobody${i}@example.test`, 'wrong password!!', spoof(i))).status).toBe(401);
    const fresh = await t.createUser('editor');
    expect((await signIn(fresh.email, fresh.password, spoof(500))).status).toBe(429);
    // another address is not affected
    expect((await signIn(fresh.email, fresh.password, spoof(501, '198.51.100.8'))).status).toBe(200);
  });

  it('limits one email from many addresses per email', async () => {
    const u = await t.createUser('editor');
    for (let i = 0; i < 20; i++) expect((await signIn(u.email, 'wrong password!!', `198.51.101.${i + 1}`)).status).toBe(401);
    expect((await signIn(u.email, u.password, '198.51.102.1')).status).toBe(429);
    const other = await t.createUser('editor');
    expect((await signIn(other.email, other.password, '198.51.102.1')).status).toBe(200);
  });

  it('lets the person back in after 15 minutes and forgets failures after a good sign-in', async () => {
    const u = await t.createUser('editor');
    const start = new Date();
    t.setNow(start);
    for (let i = 0; i < 5; i++) await signIn(u.email, 'wrong password!!', TRUSTED);
    expect((await signIn(u.email, u.password, TRUSTED)).status).toBe(429);
    t.setNow(new Date(start.getTime() + 15 * 60 * 1000 + 1000));
    expect((await signIn(u.email, u.password, TRUSTED)).status).toBe(200);
    for (let i = 0; i < 4; i++) await signIn(u.email, 'wrong password!!', '198.51.100.9');
    expect((await signIn(u.email, u.password, '198.51.100.9')).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await signIn(u.email, 'wrong password!!', '198.51.100.9')).status).toBe(401);
  });
});

describe('password reset', () => {
  const request = (email: string, xff: string) => post('/api/auth/request-password-reset', { email }, xff);

  it('limits requests per email however the address is dressed up', async () => {
    const u = await t.createUser('editor');
    for (let i = 0; i < 5; i++) expect((await request(u.email, spoof(i))).status).toBe(200);
    const res = await request(u.email, spoof(50));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await request(u.email, '198.51.103.1')).status).toBe(429); // another address, same email
    await new Promise((r) => setTimeout(r, 100));
    expect(t.mailer.sent.length).toBeLessThanOrEqual(5);
  });

  it('limits requests per address across emails', async () => {
    for (let i = 0; i < 20; i++) expect((await request(`who${i}@example.test`, spoof(i))).status).toBe(200);
    expect((await request('another@example.test', spoof(77))).status).toBe(429);
    expect((await request('another@example.test', spoof(78, '198.51.100.99'))).status).toBe(200);
  });

  it('limits guessing a reset token', async () => {
    for (let i = 0; i < 10; i++) expect((await post('/api/auth/reset-password', { token: `guess${i}`, newPassword: 'a long enough password' }, spoof(i))).status).toBe(400);
    const res = await post('/api/auth/reset-password', { token: 'guess-more', newPassword: 'a long enough password' }, spoof(200));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});

describe('invites', () => {
  it('limits token guessing on lookup and on accept, together, per address', async () => {
    for (let i = 0; i < 10; i++) expect((await t.app.request(`/api/invites/guess-${i}-xxxxxxxxxxxxxxxxxxxxxxx`, { headers: { 'x-forwarded-for': spoof(i) } })).status).toBe(404);
    for (let i = 0; i < 10; i++) expect((await post('/api/invites/accept', { token: `guess-${i}-yyyyyyyyyyyyyyyyyyyyyyy`, name: 'A', password: 'a long enough password' }, spoof(i + 20))).status).toBe(404);
    const lookup = await t.app.request('/api/invites/guess-again-zzzzzzzzzzzzzzzzzzzz', { headers: { 'x-forwarded-for': spoof(300) } });
    expect(lookup.status).toBe(429);
    expect(Number(lookup.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await post('/api/invites/accept', { token: 'guess-last-qqqqqqqqqqqqqqqqqqqqqq', name: 'A', password: 'a long enough password' }, spoof(301))).status).toBe(429);
    // a different real address still works
    expect((await t.app.request('/api/invites/guess-other-zzzzzzzzzzzzzzzzzzzz', { headers: { 'x-forwarded-for': '198.51.100.44' } })).status).toBe(404);
  });

  it('does not count successful lookups', async () => {
    const admin = await t.createUser('admin');
    const inv = await t.api(await t.signIn(admin)).post('/api/users/invites', { email: 'x@example.test', role: 'editor' });
    const token = new URL(inv.body.link).searchParams.get('token')!;
    for (let i = 0; i < 25; i++) expect((await t.app.request(`/api/invites/${token}`, { headers: { 'x-forwarded-for': TRUSTED } })).status).toBe(200);
  });
});

describe("Better Auth sees the trusted address", () => {
  it('records the trusted hop on the session, not a spoofed header', async () => {
    const u = await t.createUser('editor');
    const res = await post('/api/auth/sign-in/email', { email: u.email, password: u.password }, `1.2.3.4, ${TRUSTED}`, { 'x-sd-client-ip': '9.9.9.9' });
    expect(res.status).toBe(200);
    const session = await t.prisma.session.findFirstOrThrow({ where: { userId: u.id } });
    expect(session.ipAddress).toBe(TRUSTED);
  });

  it("applies its own limiter to the trusted address, so rotating the first entry does not help", async () => {
    let firstBlocked = -1;
    for (let i = 0; i < 130; i++) {
      const res = await t.app.request('/api/auth/get-session', { headers: { 'x-forwarded-for': spoof(i, '198.51.100.60') } });
      if (res.status === 429) { firstBlocked = i; break; }
    }
    expect(firstBlocked).toBeGreaterThanOrEqual(100);
    const other = await t.app.request('/api/auth/get-session', { headers: { 'x-forwarded-for': spoof(1, '198.51.100.61') } });
    expect(other.status).toBe(200);
  });
});

// ---- parallel requests: the attempt is reserved before the handler runs ----

describe('reservations', () => {
  afterEach(() => vi.restoreAllMocks());

  // Counts how many requests reach Better Auth's handler, holding each for a moment so requests overlap.
  function watchHandler(options: { fail?: boolean } = {}) {
    const real = t.deps.auth.handler.bind(t.deps.auth);
    return vi.spyOn(t.deps.auth, 'handler').mockImplementation(async (req: Request) => {
      await new Promise((r) => setTimeout(r, 60));
      if (options.fail) throw new Error('handler blew up');
      return real(req);
    });
  }
  const all429WithRetryAfter = (rs: Response[]) => rs.filter((r) => r.status === 429).every((r) => Number(r.headers.get('retry-after')) > 0);

  it('reserves in one step: a burst of synchronous reservations never exceeds the limit', () => {
    const limiter = new RateLimiter(5, 60_000);
    const results = Array.from({ length: 20 }, () => limiter.reserve('k'));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    limiter.refund('k');
    expect(limiter.reserve('k').allowed).toBe(true);
    expect(limiter.reserve('k').allowed).toBe(false);
  });

  it('lets no more than two parallel sign-ins for one email and address reach the handler', async () => {
    const u = await t.createUser('editor');
    const spy = watchHandler();
    const rs = await Promise.all(Array.from({ length: 20 }, () => signIn(u.email, 'wrong password!!', TRUSTED)));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(rs.filter((r) => r.status === 401)).toHaveLength(2);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(18);
    expect(all429WithRetryAfter(rs)).toBe(true);
    // the two that ran stay counted: three more failures fill the five, the next is refused
    spy.mockRestore();
    for (let i = 0; i < 3; i++) expect((await signIn(u.email, 'wrong password!!', TRUSTED)).status).toBe(401);
    expect((await signIn(u.email, u.password, TRUSTED)).status).toBe(429);
  });

  it('caps parallel sign-ins per email across addresses, and per address across emails', async () => {
    const u = await t.createUser('editor');
    let spy = watchHandler();
    const byEmail = await Promise.all(Array.from({ length: 20 }, (_, i) => signIn(u.email, 'wrong password!!', `198.51.110.${i + 1}`)));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(all429WithRetryAfter(byEmail)).toBe(true);
    spy.mockRestore();
    t.deps.limits.clear();
    spy = watchHandler();
    const byIp = await Promise.all(Array.from({ length: 20 }, (_, i) => signIn(`user${i}@example.test`, 'wrong password!!', '198.51.111.1')));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(all429WithRetryAfter(byIp)).toBe(true);
  });

  it('releases the in-flight slots afterwards', async () => {
    const u = await t.createUser('editor');
    watchHandler();
    await Promise.all(Array.from({ length: 6 }, () => signIn(u.email, u.password, TRUSTED)));
    expect((await signIn(u.email, u.password, TRUSTED)).status).toBe(200);
  });

  it('lets exactly five parallel password-reset requests for one email through', async () => {
    const u = await t.createUser('editor');
    const spy = watchHandler();
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => post('/api/auth/request-password-reset', { email: u.email }, spoof(i))));
    expect(spy).toHaveBeenCalledTimes(5);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(5);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(15);
    expect(all429WithRetryAfter(rs)).toBe(true);
  });

  it('lets exactly twenty parallel invite guesses from one address be answered', async () => {
    const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => t.app.request(`/api/invites/guess-${i}-xxxxxxxxxxxxxxxxxxxxxxx`, { headers: { 'x-forwarded-for': spoof(i) } })));
    expect(rs.filter((r) => r.status === 404)).toHaveLength(20);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(10);
    expect(all429WithRetryAfter(rs)).toBe(true);
  });

  it('lets exactly ten parallel reset-token guesses be answered', async () => {
    const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => post('/api/auth/reset-password', { token: `guess${i}`, newPassword: 'a long enough password' }, spoof(i))));
    expect(rs.filter((r) => r.status === 400)).toHaveLength(10);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(15);
  });

  it('gives the reservation back after a successful sign-in, but not after a failure', async () => {
    // an address no earlier test used: Better Auth's own per-address counter lives for 60 seconds across tests
    const FRESH_IP = '198.51.120.1';
    const good = await t.createUser('editor');
    // 19 failures from one address, then a success, then one more failure: the success must not have used a place
    for (let i = 0; i < 19; i++) expect((await signIn(`nobody${i}@example.test`, 'wrong password!!', FRESH_IP)).status).toBe(401);
    expect((await signIn(good.email, good.password, FRESH_IP)).status).toBe(200);
    expect((await signIn('last@example.test', 'wrong password!!', FRESH_IP)).status).toBe(401);
    expect((await signIn(good.email, good.password, FRESH_IP)).status).toBe(429);
  });

  it('keeps the reservation when the handler throws', async () => {
    const u = await t.createUser('editor');
    const spy = watchHandler({ fail: true });
    const quiet = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    for (let i = 0; i < 5; i++) expect((await signIn(u.email, u.password, TRUSTED)).status).toBe(500);
    quiet.mockRestore();
    spy.mockRestore();
    expect((await signIn(u.email, u.password, TRUSTED)).status).toBe(429);
  });
});
