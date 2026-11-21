// Shared test helpers. Every test file that needs the app, the database or a signed-in user uses these.
//
//   const t = await createTestApp();            // once per file: migrates the test database if needed
//   beforeEach(() => t.reset());                // empties every table (not pg-boss, not the migrations table)
//   afterAll(() => t.close());
//
//   const admin = await t.createUser('admin');  // { id, email, password, role }
//   const cookies = await t.signIn(admin);      // a Cookie header value from a real sign-in
//   const res = await t.api(cookies).post('/api/users/invites', { email: 'a@b.co', role: 'editor' });
//   res.status; res.body;                       // parsed JSON (or text); res.headers; res.res is the raw Response
//
// What is faked: Buffer and every other outbound call (t.fetchCalls and t.setFetch), jobs (t.jobs records, t.jobs.drain
// runs them), mail (t.mailer.sent), storage (in memory, t.storage.objects) and the clock (t.now / t.setNow).
// Use them through t.deps, which is what createAppAndDeps was given and what job handlers take.
//
// The database: TEST_DB_NAME (default vesk_test) on TEST_DATABASE_ADMIN_URL (default the vesk-test-pg
// container on 127.0.0.1:55440). Use your own name when several agents run at once. Run vitest with file parallelism off.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { createAppAndDeps } from './app.js';
import { loadConfig, type AppConfig } from './config.js';
import { createPrisma } from './db.js';
import type { Role } from './deps.js';
import { appRoot } from './engine/root.js';
import { createFakeJobs, type FakeJobs } from './jobs/fake.js';
import { createFakeMailer } from './mail.js';
import { createMemoryStorage } from './storage/memory.js';

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55440/postgres';
const TEST_DB_NAME = process.env.TEST_DB_NAME ?? 'vesk_test';
const TEST_APP_URL = 'http://localhost:3000';
export const TEST_ORIGIN = TEST_APP_URL;
const TEST_PASSWORD = 'correct horse battery';

function urlFor(dbName: string): string {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${dbName}`;
  return u.toString();
}
export const testDatabaseUrl = (): string => urlFor(TEST_DB_NAME);

// Creates the database if it is missing and applies migrations when some are pending.
async function ensureTestDatabase(): Promise<string> {
  if (!/^[a-z0-9_]+$/.test(TEST_DB_NAME)) throw new Error('TEST_DB_NAME may only contain a-z, 0-9 and _');
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB_NAME]);
    if (!found.rowCount) await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  } finally {
    await admin.end();
  }
  const root = appRoot()!;
  const dirs = fs.readdirSync(path.join(root, 'prisma', 'migrations'), { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  const db = new pg.Client({ connectionString: testDatabaseUrl() });
  await db.connect();
  let applied = 0;
  try {
    const r = await db.query('SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL').catch(() => null);
    applied = r?.rows[0]?.n ?? 0;
  } finally {
    await db.end();
  }
  if (applied < dirs) {
    // npm workspaces hoist the Prisma CLI to the repository root; a nested install would keep it here.
    const bin = [path.join(root, 'node_modules', '.bin', 'prisma'), path.join(root, '..', '..', 'node_modules', '.bin', 'prisma')].find((f) => fs.existsSync(f))!;
    execFileSync(bin, ['migrate', 'deploy'], {
      cwd: root, env: { ...process.env, DATABASE_URL: testDatabaseUrl() }, stdio: 'pipe',
    });
  }
  return testDatabaseUrl();
}

async function truncateAll(): Promise<void> {
  const db = new pg.Client({ connectionString: testDatabaseUrl() });
  await db.connect();
  try {
    const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'");
    if (tables.rowCount) {
      await db.query(`TRUNCATE ${tables.rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await db.end();
  }
}

export function testConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    APP_URL: TEST_APP_URL,
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123456',
    // 32 bytes of 0x01..: a fixed key so values encrypted in one test file read back in another
    APP_ENCRYPTION_KEY: Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64'),
    STORAGE_DRIVER: 'local',
    // Off unless a spec asks for it (RATE_LIMIT: 'on'), so specs that sign in a lot are not throttled.
    RATE_LIMIT: 'off',
    ...overrides,
  });
}

export interface ApiResult {
  status: number;
  body: any;
  headers: Headers;
  res: Response;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: Role;
  name: string;
}

export interface FetchCall {
  url: string;
  init?: RequestInit;
}

export async function createTestApp(options: { config?: Record<string, string | undefined>; webDir?: string } = {}) {
  await ensureTestDatabase();
  const config = testConfig(options.config);
  const prisma = createPrisma(config.databaseUrl);
  const mailer = createFakeMailer(true);
  const jobs: FakeJobs = createFakeJobs();
  const storage = createMemoryStorage();
  let fixed: Date | null = null; // real time unless a test calls setNow
  const clock = () => fixed ?? new Date();
  const fetchCalls: FetchCall[] = [];
  let fetchImpl: typeof fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    throw new Error(`Unexpected outbound request in a test: ${String(url)}`);
  };
  const fetchProxy = (async (url: string | URL | Request, init?: RequestInit) => fetchImpl(url as string, init)) as typeof fetch;

  const { app, deps } = createAppAndDeps({ prisma, config, fetchImpl: fetchProxy, storage, jobs, mailer, now: clock }, { webDir: options.webDir });
  let counter = 0;

  function api(cookies?: string, extraHeaders: Record<string, string> = {}) {
    async function call(method: string, url: string, body?: unknown): Promise<ApiResult> {
      const headers: Record<string, string> = { origin: TEST_ORIGIN, ...extraHeaders };
      if (cookies) headers.cookie = cookies;
      let payload: string | FormData | Uint8Array | undefined;
      if (body instanceof FormData || typeof body === 'string' || body instanceof Uint8Array) payload = body as string | FormData | Uint8Array;
      else if (body !== undefined) {
        headers['content-type'] = 'application/json';
        payload = JSON.stringify(body);
      }
      const res = await app.request(url, { method, headers, body: payload });
      const text = await res.text();
      let parsed: any = text;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
      return { status: res.status, body: parsed, headers: res.headers, res };
    }
    return {
      get: (url: string) => call('GET', url),
      post: (url: string, body?: unknown) => call('POST', url, body ?? {}),
      put: (url: string, body?: unknown) => call('PUT', url, body ?? {}),
      patch: (url: string, body?: unknown) => call('PATCH', url, body ?? {}),
      delete: (url: string) => call('DELETE', url),
    };
  }

  async function createUser(role: Role = 'editor', overrides: Partial<Pick<TestUser, 'email' | 'password' | 'name'>> & { disabled?: boolean } = {}): Promise<TestUser> {
    counter += 1;
    const email = (overrides.email ?? `${role}${counter}-${Math.random().toString(36).slice(2, 8)}@example.test`).toLowerCase();
    const password = overrides.password ?? TEST_PASSWORD;
    const name = overrides.name ?? `Test ${role} ${counter}`;
    const ctx = await deps.auth.$context;
    const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: true, role, disabled: overrides.disabled ?? false }, { method: 'email-password' });
    await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: await ctx.password.hash(password) });
    return { id: user.id, email, password, role, name };
  }

  // A real sign-in; returns the Cookie header to send on later requests.
  async function signIn(user: Pick<TestUser, 'email' | 'password'>, ip = '203.0.113.1'): Promise<string> {
    const res = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { origin: TEST_ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    if (res.status !== 200) throw new Error(`Test sign-in failed with status ${res.status}`);
    return cookieHeader(res);
  }

  // Shortcut: a user and their cookies in one go.
  async function signedIn(role: Role = 'editor') {
    const user = await createUser(role);
    return { user, cookies: await signIn(user), api: api(await signIn(user)) };
  }

  return {
    app, deps, prisma, config, mailer, jobs, storage, fetchCalls,
    api, createUser, signIn, signedIn,
    now: clock,
    // Freezes the app's clock at d; setNow(null) goes back to real time.
    setNow: (d: Date | null) => { fixed = d; },
    // Decides what outbound calls answer, e.g. a fake Buffer.
    setFetch: (f: typeof fetch) => { fetchImpl = async (url, init) => { fetchCalls.push({ url: String(url), init }); return f(url, init); }; },
    reset: async () => {
      await truncateAll();
      mailer.sent.length = 0;
      jobs.enqueued.length = 0;
      storage.objects.clear();
      fetchCalls.length = 0;
      fixed = null;
      deps.limits.clear();
    },
    close: async () => { await prisma.$disconnect(); },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

// 'name=value; name2=value2' from a response's Set-Cookie headers.
export function cookieHeader(res: Response): string {
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
