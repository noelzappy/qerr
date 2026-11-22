// Request id, security headers, origin check, body limit, authentication and roles.
import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv, Deps, Role, SessionUser } from './deps.js';
import { HttpError } from './http.js';

export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = randomUUID();
  c.set('requestId', id);
  await next();
  c.res.headers.set('x-request-id', id);
};

// No inline script anywhere: the SPA is one script file. Inline style attributes are allowed because React sets some.
// Images may come from any https host because private renders are read through signed bucket URLs.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const securityHeaders = (deps: Pick<Deps, 'config'>): MiddlewareHandler<AppEnv> => async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set('content-security-policy', CSP);
  h.set('x-content-type-options', 'nosniff');
  h.set('x-frame-options', 'DENY');
  // Invite and reset links carry a token in the address, so no referrer is sent anywhere.
  h.set('referrer-policy', 'no-referrer');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  h.set('cross-origin-opener-policy', 'same-origin');
  if (deps.config.isProduction) h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
};

// API answers hold private data and must never be cached by a browser or proxy.
export const noStore: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  if (!c.res.headers.has('cache-control')) c.res.headers.set('cache-control', 'no-store');
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// A state-changing request must name an origin we trust. Browsers always send Origin on these; a missing one is refused.
export const originCheck = (deps: Pick<Deps, 'config'>): MiddlewareHandler<AppEnv> => async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header('origin');
    if (!origin || !deps.config.trustedOrigins.includes(origin)) throw new HttpError(403, 'This request came from an origin that is not allowed');
  }
  await next();
};

const JSON_LIMIT = 1024 * 1024;
const UPLOAD_LIMIT = 25 * 1024 * 1024;

export const requestBodyLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const type = c.req.header('content-type') ?? '';
  const upload = type.startsWith('multipart/form-data') || type.startsWith('application/octet-stream') || type.startsWith('image/');
  return bodyLimit({
    maxSize: upload ? UPLOAD_LIMIT : JSON_LIMIT,
    onError: (ctx) => ctx.json({ error: 'The request is too large' }, 413),
  })(c, next);
};

async function currentUser(deps: Pick<Deps, 'auth'>, headers: Headers): Promise<SessionUser | null> {
  const session = await deps.auth.api.getSession({ headers });
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: string; disabled?: boolean };
  // A disabled user's session is dead even if it has not been removed yet.
  if (u.disabled) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role === 'admin' ? 'admin' : 'editor' };
}

export const requireUser = (deps: Pick<Deps, 'auth'>): MiddlewareHandler<AppEnv> => async (c, next) => {
  const user = await currentUser(deps, c.req.raw.headers);
  if (!user) throw new HttpError(401, 'Sign in to continue');
  c.set('user', user);
  await next();
};

// Always put requireUser first; this checks the role on the server for every request.
export const requireRole = (...roles: Role[]): MiddlewareHandler<AppEnv> => async (c, next) => {
  const user = c.get('user');
  if (!user) throw new HttpError(401, 'Sign in to continue');
  if (!roles.includes(user.role)) throw new HttpError(403, 'You do not have permission to do this');
  await next();
};

// The one header Better Auth reads the client address from. Set here and nowhere else; any copy a caller sends is dropped.
export const CLIENT_IP_HEADER = 'x-qerr-client-ip';

// THE client address. With `hops` proxies in front, each appending the address it saw to X-Forwarded-For, the
// hops-th entry from the end is the real client; entries before it were written by the client and mean nothing.
// With no header (or hops = 0) it is the socket address.
export function clientIp(headers: Headers, hops = 1, socketAddress = 'unknown'): string {
  const xff = headers.get('x-forwarded-for');
  if (xff && hops > 0) {
    const parts = xff.split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length) return normaliseIp(parts[Math.max(0, parts.length - hops)]!);
  }
  return normaliseIp(socketAddress);
}

const normaliseIp = (ip: string): string => ip.replace(/^::ffff:/i, '').slice(0, 64) || 'unknown';

interface NodeBindings { incoming?: { socket?: { remoteAddress?: string } } }

// Runs first. Works out the address once, drops any caller-supplied copy of the internal header, sets it from the
// trusted value, and keeps the address on the context for the rate limiters.
export const trustedClientIp = (deps: Pick<Deps, 'config'>): MiddlewareHandler<AppEnv> => async (c, next) => {
  const socket = (c.env as NodeBindings | undefined)?.incoming?.socket?.remoteAddress;
  const ip = clientIp(c.req.raw.headers, deps.config.trustedProxyHops, socket);
  const headers = new Headers(c.req.raw.headers);
  headers.delete(CLIENT_IP_HEADER);
  if (ip !== 'unknown') headers.set(CLIENT_IP_HEADER, ip);
  c.req.raw = new Request(c.req.raw, { headers });
  c.set('clientIp', ip);
  await next();
};
