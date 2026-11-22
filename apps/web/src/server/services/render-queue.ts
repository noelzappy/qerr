// The render queue (LOOKS.md, section 4): who gets the one Chrome next. Three classes, in this order of importance: `post` (a
// post's finished image, someone is waiting on a batch), `preview` (the editor's picture, someone is watching), `gate` (the
// checks before a look or composition is published, slow and can wait). Within a class, first come first served.
//
//   const r = await submit({ brandId, class: 'preview', supersedeKey: `composition:${id}`, deadline: Date.now() + 30_000 }, () => draw());
//   r.status === 'done' ? r.value : r.status   // 'superseded' | 'expired'
//
// - A job still waiting when a newer one with the same (brandId, supersedeKey) arrives is replaced by it: the older one's promise
//   resolves with { status: 'superseded' } and its function never runs. A job already running is never cancelled.
// - A job whose deadline (epoch ms) has passed when its turn comes is dropped: { status: 'expired' }, never run.
// - A job that throws rejects its own promise; the queue goes on with the next.
// - Jobs run through the existing lock (oneAtATime in render.ts), so they never overlap with code that still calls it directly.
//   Only ONE queued job is handed to the lock at a time, so a post that arrives while a gate job waits goes first.
//
// Not wired in yet: renderPost (services/render.ts) is class `post`; the previews in routes/layouts.ts, routes/brand.ts and
// routes/design-preview.ts pass `lock: oneAtATime` and would pass a `preview` submit instead; the look gate is class `gate`.
import { oneAtATime } from './render.js';

export type RenderClass = 'post' | 'preview' | 'gate';
export interface RenderTicket { brandId: string; class: RenderClass; supersedeKey?: string; deadline?: number }
export type RenderResult<T> = { status: 'done'; value: T } | { status: 'superseded' } | { status: 'expired' };

const RANK: Record<RenderClass, number> = { post: 0, preview: 1, gate: 2 };

interface Entry {
  ticket: RenderTicket;
  job: () => Promise<unknown>;
  settle: (r: RenderResult<unknown>) => void;
  fail: (e: unknown) => void;
  seq: number;
}

export function createRenderQueue(opts: { run?: <T>(fn: () => Promise<T>) => Promise<T>; now?: () => number } = {}) {
  const run = opts.run ?? oneAtATime;
  const now = opts.now ?? Date.now;
  const waiting: Entry[] = [];
  let pumping = false;
  let seq = 0;

  const next = (): Entry | undefined => {
    let best = -1;
    for (let i = 0; i < waiting.length; i++) {
      if (best < 0 || RANK[waiting[i]!.ticket.class] < RANK[waiting[best]!.ticket.class] || (RANK[waiting[i]!.ticket.class] === RANK[waiting[best]!.ticket.class] && waiting[i]!.seq < waiting[best]!.seq)) best = i;
    }
    return best < 0 ? undefined : waiting.splice(best, 1)[0];
  };

  async function pump(): Promise<void> {
    if (pumping) return;
    pumping = true;
    try {
      for (let e = next(); e; e = next()) {
        if (e.ticket.deadline !== undefined && now() > e.ticket.deadline) { e.settle({ status: 'expired' }); continue; }
        try { e.settle({ status: 'done', value: await run(e.job) }); } catch (err) { e.fail(err); }
      }
    } finally {
      pumping = false;
    }
  }

  function submit<T>(ticket: RenderTicket, job: () => Promise<T>): Promise<RenderResult<T>> {
    return new Promise<RenderResult<T>>((resolve, reject) => {
      if (ticket.supersedeKey !== undefined) {
        const i = waiting.findIndex((w) => w.ticket.brandId === ticket.brandId && w.ticket.supersedeKey === ticket.supersedeKey);
        if (i >= 0) waiting.splice(i, 1)[0]!.settle({ status: 'superseded' });
      }
      waiting.push({ ticket, job, settle: resolve as (r: RenderResult<unknown>) => void, fail: reject, seq: seq++ });
      // Started on the next tick, so jobs submitted together are ordered by class, not by arrival.
      queueMicrotask(() => { void pump(); });
    });
  }

  return { submit, pending: () => waiting.length };
}

const queue = createRenderQueue();
export const submit = queue.submit;
export const pendingRenders = queue.pending;
