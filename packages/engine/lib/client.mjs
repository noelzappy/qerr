// Buffer GraphQL client and media URL probe. fetch and sleep are injectable so tests never touch a network.
import { maskSecrets, sleep as realSleep } from './core.mjs';

export const ENDPOINT = 'https://api.buffer.com';

export class BufferError extends Error {
  // kind: network | http | parse | graphql | rate. ambiguous = the request may have been processed.
  constructor(message, { kind, status, ambiguous = false } = {}) {
    super(message);
    this.name = 'BufferError';
    this.kind = kind;
    this.status = status;
    this.ambiguous = ambiguous;
  }
}

export function parseRetryAfter(value, now = Date.now()) {
  if (value == null || value === '') return 60;
  if (/^\d+(\.\d+)?$/.test(String(value).trim())) return Number(value);
  const t = Date.parse(value);
  return Number.isNaN(t) ? 60 : Math.max(0, Math.ceil((t - now) / 1000));
}

export function createClient({
  apiKey, fetchImpl = globalThis.fetch, sleep = realSleep, now = Date.now, endpoint = ENDPOINT,
  timeoutMs = 30000, maxRetries429 = 3, budget = { max: 140, windowMs: 15 * 60 * 1000 },
}) {
  const stamps = [];
  const mask = (s) => maskSecrets(s, [apiKey]);
  let requests = 0;

  // Stay under the free plan's 150 requests / 15 minutes.
  async function throttle() {
    for (;;) {
      const t = now();
      while (stamps.length && t - stamps[0] >= budget.windowMs) stamps.shift();
      if (stamps.length < budget.max) break;
      await sleep(stamps[0] + budget.windowMs - t);
    }
    stamps.push(now());
  }

  async function gql(query, variables) {
    for (let attempt = 0; ; attempt++) {
      await throttle();
      requests++;
      let res;
      try {
        res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(variables === undefined ? { query } : { query, variables }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        throw new BufferError(mask(`Network error or timeout talking to Buffer: ${e.message}`), { kind: 'network', ambiguous: true });
      }
      if (res.status === 429) {
        // A rate-limited request was rejected, so repeating it cannot duplicate anything.
        if (attempt >= maxRetries429) throw new BufferError('Buffer kept answering 429 (rate limit); stopped.', { kind: 'rate', status: 429 });
        await sleep(parseRetryAfter(res.headers.get('retry-after'), now()) * 1000);
        continue;
      }
      let text;
      try {
        text = await res.text();
      } catch (e) {
        throw new BufferError(mask(`Lost the connection while reading Buffer's answer: ${e.message}`), { kind: 'network', ambiguous: true });
      }
      if (res.status >= 500) throw new BufferError(mask(`Buffer answered HTTP ${res.status}: ${text.slice(0, 300)}`), { kind: 'http', status: res.status, ambiguous: true });
      if (!res.ok) {
        const hint = res.status === 401 || res.status === 403 ? ' (Buffer rejected the API key)' : '';
        throw new BufferError(mask(`Buffer answered HTTP ${res.status}${hint}: ${text.slice(0, 300)}`), { kind: 'http', status: res.status });
      }
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new BufferError(mask(`Buffer answered 200 with a body that is not JSON: ${text.slice(0, 200)}`), { kind: 'parse', status: 200, ambiguous: true });
      }
      if (json.errors?.length) throw new BufferError(mask(`GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`), { kind: 'graphql', status: 200 });
      return json.data;
    }
  }

  return { gql, get requestCount() { return requests; } };
}

// HEAD-check that a media URL is public and really an image or a video.
export async function probeMedia(url, fetchImpl = globalThis.fetch, timeoutMs = 20000, attempts = 3) {
  // A HEAD is read-only, so a network error is retried a few times before the file counts as unreachable.
  for (let i = 1; ; i++) {
    const r = await probeOnce(url, fetchImpl, timeoutMs);
    if (r.ok || r.status !== 0 || i >= attempts) return r;
    await new Promise((res) => setTimeout(res, 400 * i));
  }
}

async function probeOnce(url, fetchImpl, timeoutMs) {
  try {
    const res = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    const type = res.headers.get('content-type') || '';
    if (res.status !== 200) return { ok: false, status: res.status, type, reason: `HTTP ${res.status}` };
    if (!/^(image|video)\//i.test(type)) return { ok: false, status: 200, type, reason: `content-type is "${type || 'missing'}", not image/* or video/*` };
    return { ok: true, status: 200, type };
  } catch (e) {
    return { ok: false, status: 0, type: '', reason: `unreachable (${e.message})` };
  }
}
