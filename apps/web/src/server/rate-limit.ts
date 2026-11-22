// A sliding-window failure counter kept in memory. One container runs the app, so memory is enough;
// a restart clears it, which only ever lets a blocked caller try again sooner.
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private max: number, private windowMs: number, private now: () => Date = () => new Date()) {}

  private recent(key: string): number[] {
    const cutoff = this.now().getTime() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  // Is another attempt allowed right now? Does not count anything.
  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const list = this.recent(key);
    if (list.length < this.max) return { allowed: true, retryAfterSeconds: 0 };
    const oldest = list[0]!;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - this.now().getTime()) / 1000)) };
  }

  fail(key: string): void {
    const list = this.recent(key);
    list.push(this.now().getTime());
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.sweep();
  }

  // Check and count in one synchronous step, so parallel requests cannot all pass the check before any is counted.
  reserve(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const gate = this.check(key);
    if (gate.allowed) this.hits.set(key, [...this.recent(key), this.now().getTime()]);
    return gate;
  }

  // Gives back one reserved attempt (the request succeeded, so it does not count against the caller).
  refund(key: string): void {
    const list = this.recent(key);
    list.pop();
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  clear(): void {
    this.hits.clear();
  }

  private sweep(): void {
    for (const key of [...this.hits.keys()]) this.recent(key);
  }
}

// At most `max` requests in flight per key. tryAcquire is synchronous; release belongs in a `finally`.
export class InFlight {
  private counts = new Map<string, number>();
  constructor(private max: number) {}

  tryAcquire(key: string): boolean {
    const n = this.counts.get(key) ?? 0;
    if (n >= this.max) return false;
    this.counts.set(key, n + 1);
    return true;
  }

  release(key: string): void {
    const n = (this.counts.get(key) ?? 0) - 1;
    if (n > 0) this.counts.set(key, n);
    else this.counts.delete(key);
  }

  clear(): void {
    this.counts.clear();
  }
}

const WINDOW_MS = 15 * 60 * 1000;

// Every bucket counts failures (or, for password-reset requests, every request) inside a 15-minute window.
// Per-email buckets mean someone who knows an address can lock that person out for 15 minutes; that is the price of
// stopping a guesser who rotates addresses, and an admin can always make a reset link.
export interface Limits {
  signinPair: RateLimiter; // email + address
  signinIp: RateLimiter;
  signinEmail: RateLimiter;
  resetEmail: RateLimiter;
  resetIp: RateLimiter;
  resetConfirmIp: RateLimiter;
  inviteIp: RateLimiter;
  // AI suggestions (brand from a website, picture descriptions): every request per person, since each one costs money.
  suggestUser: RateLimiter;
  // Concurrent AI suggestion requests per person (3).
  suggestInflight: InFlight;
  // Concurrent sign-in requests per email and per address (2 each).
  signinInflight: InFlight;
  clear(): void;
}

export function createLimits(now: () => Date = () => new Date()): Limits {
  const l = {
    signinPair: new RateLimiter(5, WINDOW_MS, now),
    signinIp: new RateLimiter(20, WINDOW_MS, now),
    signinEmail: new RateLimiter(20, WINDOW_MS, now),
    resetEmail: new RateLimiter(5, WINDOW_MS, now),
    resetIp: new RateLimiter(20, WINDOW_MS, now),
    resetConfirmIp: new RateLimiter(10, WINDOW_MS, now),
    inviteIp: new RateLimiter(20, WINDOW_MS, now),
    suggestUser: new RateLimiter(60, WINDOW_MS, now),
    suggestInflight: new InFlight(3),
    signinInflight: new InFlight(2),
  };
  return { ...l, clear: () => Object.values(l).forEach((r) => r.clear()) };
}

// The longest wait among the buckets that are full, or null when none is.
function blockedFor(checks: Array<[RateLimiter, string]>): number | null {
  let wait: number | null = null;
  for (const [limiter, key] of checks) {
    const gate = limiter.check(key);
    if (!gate.allowed) wait = Math.max(wait ?? 0, gate.retryAfterSeconds);
  }
  return wait;
}

// Reserves one attempt in every bucket, or in none: returns null when all were reserved, else the wait in seconds.
export function reserveAll(buckets: Array<[RateLimiter, string]>): number | null {
  const wait = blockedFor(buckets);
  if (wait !== null) return wait;
  for (const [limiter, key] of buckets) limiter.reserve(key);
  return null;
}

export function refundAll(buckets: Array<[RateLimiter, string]>): void {
  for (const [limiter, key] of buckets) limiter.refund(key);
}
