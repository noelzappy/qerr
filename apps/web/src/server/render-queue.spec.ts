import { describe, expect, it } from 'vitest';
import { createRenderQueue, submit } from './services/render-queue.js';
import { oneAtATime } from './services/render.js';

// A job that runs until the test lets it finish, and notes when it started.
function job(log: string[], name: string) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  return { run: async () => { log.push(name); await gate; return name; }, release };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 5));
// The queue over a plain function instead of the lock, so a test can look at the order alone.
const plain = () => createRenderQueue({ run: (fn) => fn() });

describe('the render queue', () => {
  it('runs posts before previews before gate jobs, first come first served within a class', async () => {
    const q = plain(), log: string[] = [];
    const first = job(log, 'first'), g1 = job(log, 'g1'), p1 = job(log, 'p1'), b1 = job(log, 'b1'), p2 = job(log, 'p2'), b2 = job(log, 'b2');
    const results = [
      q.submit({ brandId: 'b', class: 'preview' }, first.run),
      q.submit({ brandId: 'b', class: 'gate' }, g1.run),
      q.submit({ brandId: 'b', class: 'preview' }, p1.run),
      q.submit({ brandId: 'b', class: 'post' }, b1.run),
      q.submit({ brandId: 'b', class: 'preview' }, p2.run),
      q.submit({ brandId: 'b', class: 'post' }, b2.run),
    ];
    // Everything arrived in one tick, so the order is by class and arrival: the posts first, then previews, then the gate.
    for (const j of [b1, b2, p1, first, p2, g1]) { await tick(); j.release(); }
    expect((await Promise.all(results)).map((r) => r.status)).toEqual(Array(6).fill('done'));
    expect(log).toEqual(['b1', 'b2', 'first', 'p1', 'p2', 'g1']);
  });

  it('puts a post that arrives while a gate job is waiting ahead of it, and never stops one that is running', async () => {
    const q = plain(), log: string[] = [];
    const running = job(log, 'running'), gate = job(log, 'gate'), post = job(log, 'post');
    const r1 = q.submit({ brandId: 'b', class: 'gate' }, running.run);
    await tick();
    const r2 = q.submit({ brandId: 'b', class: 'gate' }, gate.run);
    const r3 = q.submit({ brandId: 'b', class: 'post' }, post.run);
    await tick();
    expect(log).toEqual(['running']);
    running.release(); await tick();
    expect(log).toEqual(['running', 'post']);
    post.release(); await tick(); gate.release();
    expect((await Promise.all([r1, r2, r3])).map((r) => r.status)).toEqual(['done', 'done', 'done']);
    expect(log).toEqual(['running', 'post', 'gate']);
  });

  it('replaces a waiting job with a newer one of the same brand and key: the older is superseded and never runs', async () => {
    const q = plain(), log: string[] = [];
    const busy = job(log, 'busy'), old = job(log, 'old'), fresh = job(log, 'fresh'), otherBrand = job(log, 'other'), noKey = job(log, 'nokey');
    const rb = q.submit({ brandId: 'a', class: 'post' }, busy.run);
    await tick();
    const ro = q.submit({ brandId: 'a', class: 'preview', supersedeKey: 'k' }, old.run);
    const rx = q.submit({ brandId: 'b', class: 'preview', supersedeKey: 'k' }, otherBrand.run);
    const rn = q.submit({ brandId: 'a', class: 'preview' }, noKey.run);
    const rf = q.submit({ brandId: 'a', class: 'preview', supersedeKey: 'k' }, fresh.run);
    expect(await ro).toEqual({ status: 'superseded' });
    expect(q.pending()).toBe(3);
    for (const j of [busy, otherBrand, noKey, fresh]) { await tick(); j.release(); }
    expect((await Promise.all([rb, rx, rn, rf])).map((r) => r.status)).toEqual(['done', 'done', 'done', 'done']);
    expect(log).not.toContain('old');
    expect(log).toEqual(['busy', 'other', 'nokey', 'fresh']);
  });

  it('does not cancel a job that is already running when a newer one with its key arrives', async () => {
    const q = plain(), log: string[] = [];
    const a = job(log, 'a'), b = job(log, 'b');
    const ra = q.submit({ brandId: 'x', class: 'preview', supersedeKey: 'k' }, a.run);
    await tick();
    const rb = q.submit({ brandId: 'x', class: 'preview', supersedeKey: 'k' }, b.run);
    a.release(); await tick(); b.release();
    expect(await ra).toEqual({ status: 'done', value: 'a' });
    expect(await rb).toEqual({ status: 'done', value: 'b' });
  });

  it('drops a job whose deadline has passed when its turn comes, without running it', async () => {
    let clock = 1000;
    const q = createRenderQueue({ run: (fn) => fn(), now: () => clock });
    const log: string[] = [];
    const busy = job(log, 'busy'), stale = job(log, 'stale'), live = job(log, 'live'), none = job(log, 'none');
    const r0 = q.submit({ brandId: 'b', class: 'post' }, busy.run);
    await tick();
    const r1 = q.submit({ brandId: 'b', class: 'preview', deadline: 1500 }, stale.run);
    const r2 = q.submit({ brandId: 'b', class: 'preview', deadline: 5000 }, live.run);
    const r3 = q.submit({ brandId: 'b', class: 'gate' }, none.run);
    clock = 2000;
    busy.release(); await tick(); live.release(); await tick(); none.release();
    expect(await r1).toEqual({ status: 'expired' });
    expect((await Promise.all([r0, r2, r3])).map((r) => r.status)).toEqual(['done', 'done', 'done']);
    expect(log).toEqual(['busy', 'live', 'none']);
  });

  it('rejects a job that throws and goes on with the next', async () => {
    const q = plain();
    const bad = q.submit({ brandId: 'b', class: 'post' }, async () => { throw new Error('boom'); });
    const good = q.submit({ brandId: 'b', class: 'post' }, async () => 7);
    await expect(bad).rejects.toThrow('boom');
    expect(await good).toEqual({ status: 'done', value: 7 });
    expect(q.pending()).toBe(0);
  });

  it('shares the lock of the existing renderer: a queued job never overlaps one that calls oneAtATime directly', async () => {
    let active = 0, peak = 0;
    const work = async () => { active++; peak = Math.max(peak, active); await tick(); active--; };
    await Promise.all([
      oneAtATime(work), submit({ brandId: 'b', class: 'preview' }, work), oneAtATime(work), submit({ brandId: 'b', class: 'post' }, work),
    ]);
    expect(peak).toBe(1);
  });
});
