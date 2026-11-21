// fetch with a timeout and a capped back-off on 429 / 5xx / network errors. Shared by providers and search.
import { AIError, redact } from './errors.mjs';

export const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns { status, ok, text, json, headers } for any final HTTP answer, including a non-2xx one after the
// retries ran out. Throws AIError('timeout' | 'network') when no answer ever came.
export async function request(url, { method = 'GET', headers = {}, body, fetch = globalThis.fetch, timeoutMs = 60000, maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 20000, sleep = realSleep, secrets = [] } = {}) {
  if (typeof fetch !== 'function') throw new AIError('No fetch function is available (Node 20 or newer is required)', { code: 'config' });
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs);
    try {
      const res = await fetch(url, { method, headers, body, signal: ctl.signal });
      const text = await res.text();
      clearTimeout(timer);
      let json;
      try { json = JSON.parse(text); } catch { json = undefined; }
      const out = { status: res.status, ok: res.status >= 200 && res.status < 300, text, json, headers: res.headers };
      if (!out.ok && RETRY_STATUS.has(res.status) && attempt < maxRetries) {
        const ra = Number(res.headers?.get?.('retry-after'));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : baseDelayMs * 2 ** attempt;
        await sleep(Math.min(maxDelayMs, wait));
        continue;
      }
      return out;
    } catch (e) {
      clearTimeout(timer);
      lastError = timedOut
        ? new AIError(`The request timed out after ${timeoutMs} ms`, { code: 'timeout' })
        : new AIError(`Network error: ${redact(e?.message, secrets)}`, { code: 'network' });
      if (attempt < maxRetries) { await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)); continue; }
    }
  }
  throw lastError;
}

// A short, safe description of an error response (never the request, so never a key).
export function describeError(res, secrets = []) {
  const msg = res.json?.error?.message ?? res.json?.error ?? res.json?.message ?? res.json?.detail ?? res.text;
  return redact(typeof msg === 'string' ? msg : JSON.stringify(msg ?? ''), secrets).slice(0, 300);
}
