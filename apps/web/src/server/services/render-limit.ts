// How many images this server draws at once, and how many previews may wait for a turn (README, "Configuration").
//
//   RENDER_CONCURRENCY (1 to 16, default 1): renders running at the same time, each in its own Chrome. Every render takes a slot here:
//   the render-post job, the post editor's and the layout editor's previews and the Looks pages' pictures (through the render queue). The
//   engine's machine-wide lock files have the same number of slots, so other processes on the machine are held to it too.
//   RENDER_QUEUE_MAX (0 to 10000, default 50): previews that may wait for a slot. A preview that would be one more is refused at once with
//   a "busy, try again" answer (HTTP 503), so a burst of traffic cannot pile up requests and Chromes on the server. The render-post job is
//   never refused: its jobs wait in the database queue, and the job runner takes only RENDER_CONCURRENCY of them at a time.
//
// The limits are set once at start-up (setRenderLimits, from the config); until then, and in tests, one render at a time and 50 waiting.
import { HttpError } from '../http.js';

export const DEFAULT_RENDER_QUEUE_MAX = 50;
export const BUSY_MESSAGE = 'The server is busy drawing other pictures. Try again in a moment';

export class RenderBusyError extends HttpError {
  constructor() { super(503, BUSY_MESSAGE); }
}

export interface RenderLimiter {
  // Runs fn when a slot is free (at most `concurrency` at once, first come first served), whether or not the one before failed.
  // refuseWhenBusy: throw RenderBusyError instead of waiting when `queueMax` callers already wait.
  run<T>(fn: () => Promise<T>, opts?: { refuseWhenBusy?: boolean }): Promise<T>;
  running(): number;
  waiting(): number;
}

export function createRenderLimiter(limits: { concurrency: () => number; queueMax: () => number }): RenderLimiter {
  let active = 0;
  const queue: Array<() => void> = [];
  const pump = () => {
    while (active < Math.max(1, limits.concurrency()) && queue.length) {
      active++;
      queue.shift()!();
    }
  };
  return {
    run<T>(fn: () => Promise<T>, opts: { refuseWhenBusy?: boolean } = {}): Promise<T> {
      if (opts.refuseWhenBusy && active >= Math.max(1, limits.concurrency()) && queue.length >= limits.queueMax()) {
        return Promise.reject(new RenderBusyError());
      }
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          let p: Promise<T>;
          try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
          // The slot is given back before the caller hears the result, so a render right after it finds the slot free.
          const done = () => { active--; pump(); };
          p.then((v) => { done(); resolve(v); }, (e) => { done(); reject(e); });
        });
        pump();
      });
    },
    running: () => active,
    waiting: () => queue.length,
  };
}

let concurrency = 1;
let queueMax = DEFAULT_RENDER_QUEUE_MAX;

export function setRenderLimits(next: { concurrency: number; queueMax: number }): void {
  concurrency = next.concurrency;
  queueMax = next.queueMax;
}
export const renderConcurrency = (): number => concurrency;
export const renderQueueMax = (): number => queueMax;

const limiter = createRenderLimiter({ concurrency: renderConcurrency, queueMax: renderQueueMax });

// Every render in this process goes through here.
export function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  return limiter.run(fn);
}
// A preview someone is waiting on: refused at once with RenderBusyError (503) when RENDER_QUEUE_MAX previews already wait.
export function withPreviewSlot<T>(fn: () => Promise<T>): Promise<T> {
  return limiter.run(fn, { refuseWhenBusy: true });
}
export const rendersRunning = (): number => limiter.running();
export const rendersWaiting = (): number => limiter.waiting();
