// createAppAndDeps(deps): the whole HTTP surface. Every outside dependency comes in through deps, so tests build an app
// with a fake Buffer (fetchImpl), a memory or local storage, a fake job queue and a fake mailer.
import fs from 'node:fs';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { buildDeps } from './build-deps.js';
import type { AppDeps, AppEnv, Deps } from './deps.js';
import { describeError, logger } from './log.js';
import { HttpError } from './http.js';
import { noStore, originCheck, requestBodyLimit, requestId, requireUser, securityHeaders, trustedClientIp } from './middleware.js';
import { refundAll, reserveAll, type RateLimiter } from './rate-limit.js';
import { activityRoutes } from './routes/activity.js';
import { aiSettingsRoutes } from './routes/ai-settings.js';
import { auditRoutes } from './routes/audit.js';
import { batchesRoutes } from './routes/batches.js';
import { brandRoutes } from './routes/brand.js';
import { overviewRoutes } from './routes/overview.js';
import { bufferAccountsRoutes } from './routes/buffer-accounts.js';
import { inviteRoutes } from './routes/invites.js';
import { designPreviewRoutes } from './routes/design-preview.js';
import { postKindsRoutes } from './routes/post-kinds.js';
import { layoutRoutes } from './routes/layouts.js';
import { lookRoutes, looksBriefRoute } from './routes/looks.js';
import { seriesReadRoutes, seriesSettingsRoutes } from './routes/series.js';
import { layoutBriefs } from './services/layouts.js';
import { localStorageRoutes } from './routes/local-storage.js';
import { reviewRoutes } from './routes/review.js';
import { routingRoutes } from './routes/routing.js';
import { scheduleRoutes } from './routes/schedule.js';
import { setupRoutes } from './routes/setup.js';
import { userRoutes } from './routes/users.js';
import { vaultRoutes } from './routes/vault.js';
import { spaHandler } from './static.js';
import { brandInfo } from './brand.js';
import { brandState, syncBrand } from './services/brand-settings.js';

export function createAppAndDeps(input: AppDeps | Deps, options: { webDir?: string } = {}): { app: Hono<AppEnv>; deps: Deps } {
  const deps = 'auth' in input && 'limits' in input && input.limits ? (input as Deps) : buildDeps(input);
  const app = new Hono<AppEnv>();

  app.use('*', requestId, trustedClientIp(deps), securityHeaders(deps));
  app.use('/api/*', noStore, originCheck(deps), requestBodyLimit);

  // 200 only while the database answers.
  app.get('/healthz', async (c) => {
    try {
      await deps.prisma.$queryRaw`SELECT 1`;
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });

  // What the web app shows before anyone signs in: the app's name and the brand (Settings, Brand, or the brand pack). Public on
  // purpose: the sign-in page needs it, and it holds nothing that is not on the brand's own posts.
  app.get('/api/app', async (c) => {
    const state = await syncBrand(deps);
    const b = brandInfo();
    const logo = b.logoMarkFile && !state.logosMissing ? `/brand/logo-mark.png?v=${encodeURIComponent(path.basename(state.dir))}` : null;
    return c.json({ appName: deps.config.appName, brand: { name: b.name, website: b.website, timezone: b.timezone, series: b.series, logo } });
  });

  // The brand's logo mark for the web app's header. The address changes with the brand (?v=), so it may be cached.
  app.get('/brand/logo-mark.png', (c) => {
    const file = brandInfo().logoMarkFile;
    if (!file || brandState().logosMissing) return c.notFound();
    return c.body(new Uint8Array(fs.readFileSync(file)), 200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' });
  });

  // The brand's own layouts and the fields each takes, for the post editor (any signed-in person); Settings, Layouts edits them.
  app.get('/api/layouts', requireUser(deps), async (c) => {
    await syncBrand(deps);
    return c.json({ layouts: await layoutBriefs() });
  });

  app.get('/api/me', requireUser(deps), (c) => {
    const { id, email, name, role } = c.get('user');
    return c.json({ user: { id, email, name, role } });
  });

  // Rate limits (RATE_LIMIT, on in production). The address is the trusted one from trustedClientIp, never a raw header.
  const tooMany = (c: Context<AppEnv>, wait: number, what: string) =>
    c.json({ error: `Too many ${what}. Try again in a few minutes.` }, 429, { 'retry-after': String(wait) });
  const on = deps.config.rateLimitEnabled;
  const { limits } = deps;

  // Each limit below reserves its attempt in the same synchronous step as the check, before the handler runs, so a burst
  // of parallel requests cannot all pass the check first. A reservation is given back only when the request succeeds;
  // a failure, or a handler that throws, keeps it.
  app.on(['POST'], '/api/auth/sign-in/email', async (c) => {
    if (!on) return deps.auth.handler(c.req.raw);
    const email = await emailFrom(c.req.raw.clone());
    const ip = c.get('clientIp');
    const pair = `${email}|${ip}`;
    const buckets: Array<[RateLimiter, string]> = [[limits.signinPair, pair], [limits.signinIp, ip], [limits.signinEmail, email]];
    // At most two sign-ins in flight per email and per address; the rest are turned away at once.
    if (!limits.signinInflight.tryAcquire(`ip|${ip}`)) return tooMany(c, 1, 'sign-in attempts at once');
    if (!limits.signinInflight.tryAcquire(`email|${email}`)) {
      limits.signinInflight.release(`ip|${ip}`);
      return tooMany(c, 1, 'sign-in attempts at once');
    }
    try {
      const wait = reserveAll(buckets);
      if (wait !== null) return tooMany(c, wait, 'sign-in attempts');
      const res = await deps.auth.handler(c.req.raw);
      if (res.status < 400) {
        limits.signinPair.reset(pair); // a good sign-in clears earlier mistakes for this email and address
        refundAll(buckets.slice(1));
      }
      return res;
    } finally {
      limits.signinInflight.release(`email|${email}`);
      limits.signinInflight.release(`ip|${ip}`);
    }
  });
  app.on(['POST'], '/api/auth/request-password-reset', async (c) => {
    if (!on) return deps.auth.handler(c.req.raw);
    const email = await emailFrom(c.req.raw.clone());
    const ip = c.get('clientIp');
    // every request counts and none is refunded, so the form cannot be used to flood someone's inbox
    const wait = reserveAll([[limits.resetEmail, email], [limits.resetIp, ip]]);
    if (wait !== null) return tooMany(c, wait, 'password reset requests');
    return deps.auth.handler(c.req.raw);
  });
  app.on(['POST'], '/api/auth/reset-password', async (c) => {
    if (!on) return deps.auth.handler(c.req.raw);
    const ip = c.get('clientIp');
    const buckets: Array<[RateLimiter, string]> = [[limits.resetConfirmIp, ip]];
    const wait = reserveAll(buckets);
    if (wait !== null) return tooMany(c, wait, 'attempts to set a password');
    const res = await deps.auth.handler(c.req.raw); // a bad token (guessing) keeps the reservation
    if (res.status < 400) refundAll(buckets);
    return res;
  });
  // Looking up or accepting an invite: an unknown, used or expired token, or a bad body, keeps its reservation.
  app.use('/api/invites/*', async (c, next) => {
    if (!on) return next();
    const ip = c.get('clientIp');
    const buckets: Array<[RateLimiter, string]> = [[limits.inviteIp, ip]];
    const wait = reserveAll(buckets);
    if (wait !== null) return tooMany(c, wait, 'invitation attempts');
    await next();
    if (c.res.status < 400) refundAll(buckets);
  });
  app.on(['GET', 'POST'], '/api/auth/*', (c) => deps.auth.handler(c.req.raw));

  app.route('/api/users', userRoutes(deps));
  app.route('/api/invites', inviteRoutes(deps));
  app.route('/api/audit', auditRoutes(deps));
  app.route('/api/activity', activityRoutes(deps));
  app.route('/api/buffer-accounts', bufferAccountsRoutes(deps));
  app.route('/api/routing', routingRoutes(deps));
  app.route('/api/settings/brand', brandRoutes(deps));
  app.route('/api/settings/layouts', layoutRoutes(deps));
  app.route('/api/settings/looks', lookRoutes(deps));
  app.route('/api/looks', looksBriefRoute(deps));
  app.route('/api/settings/series', seriesSettingsRoutes(deps));
  app.route('/api/series', seriesReadRoutes(deps));
  app.route('/api/overview', overviewRoutes(deps));
  app.route('/api/setup', setupRoutes(deps));
  app.route('/api/settings', aiSettingsRoutes(deps));
  app.route('/api/vault', vaultRoutes(deps));
  app.route('/api/batches', batchesRoutes(deps));
  app.route('/api/posts/preview-design', designPreviewRoutes(deps));
  app.route('/api/posts/post-kinds', postKindsRoutes(deps));
  app.route('/api/posts', reviewRoutes(deps));
  app.route('/api/schedule', scheduleRoutes(deps));
  app.route('/', localStorageRoutes(deps));

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));
  app.use('*', spaHandler(options.webDir));

  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  // Callers get a message and, for validation, the fields. Stack traces and internals stay in the log.
  app.onError((err, c) => {
    const id = c.get('requestId');
    if (err instanceof HttpError) {
      return c.json({ error: err.message, ...(err.details ? { details: err.details } : {}), requestId: id }, err.status);
    }
    if (err instanceof HTTPException) {
      return c.json({ error: err.message || 'The request could not be handled', requestId: id }, err.status);
    }
    logger.error('request.failed', { requestId: id, method: c.req.method, path: new URL(c.req.url).pathname, ...describeError(err, [deps.config.authSecret]) });
    return c.json({ error: 'Something went wrong on our side. Try again, and tell an admin if it keeps happening.', requestId: id }, 500);
  });

  return { app, deps };
}


async function emailFrom(req: Request): Promise<string> {
  try {
    const body = (await req.json()) as { email?: unknown };
    return typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
  } catch {
    return '';
  }
}

