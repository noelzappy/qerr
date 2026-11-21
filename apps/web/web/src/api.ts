// The one place the web app talks to the server: JSON in and out, the same-origin header, and one error type.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Array<{ path: string; message: string }>,
    public retryAfter?: number,
    // Why an approval was refused (a 409 from POST /api/posts/:id/approve), one plain sentence each.
    public blockers?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Fired when a request that needs a session gets 401, so the session provider can send the person to sign in.
export const UNAUTHORISED_EVENT = 'vesk:unauthorised';
// Requests where a 401 is an ordinary answer (wrong password, no session yet) and not a lost session.
const QUIET_401 = ['/api/me', '/api/auth/'];

async function send<T>(method: string, url: string, body: BodyInit | undefined, headers: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      // The server checks Origin on every write; this header also stops a plain cross-site form post.
      headers: { accept: 'application/json', 'x-requested-with': 'vesk', ...headers },
      body,
    });
  } catch {
    throw new ApiError(0, 'The server could not be reached. Check your connection and try again.');
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; message?: string; details?: unknown; blockers?: unknown };
    const retry = Number(res.headers.get('retry-after'));
    if (res.status === 401 && !QUIET_401.some((p) => url.startsWith(p))) window.dispatchEvent(new Event(UNAUTHORISED_EVENT));
    throw new ApiError(
      res.status,
      e.error ?? e.message ?? `The request failed (${res.status})`,
      Array.isArray(e.details) ? (e.details as ApiError['details']) : undefined,
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
      Array.isArray(e.blockers) ? e.blockers.filter((b): b is string => typeof b === 'string') : undefined,
    );
  }
  return data as T;
}

const json = <T>(method: string, url: string, body?: unknown) =>
  send<T>(method, url, body !== undefined ? JSON.stringify(body) : undefined, body !== undefined ? { 'content-type': 'application/json' } : {});

export const api = {
  get: <T>(url: string) => json<T>('GET', url),
  post: <T>(url: string, body?: unknown) => json<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => json<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => json<T>('PATCH', url, body ?? {}),
  delete: <T>(url: string) => json<T>('DELETE', url),
  // Multipart: the browser sets the content type and boundary itself.
  upload: <T>(url: string, form: FormData) => send<T>('POST', url, form, {}),
};

export interface Me { id: string; email: string; name: string; role: 'admin' | 'editor' }
