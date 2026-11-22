import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { BUSY_MESSAGE, createRenderLimiter, RenderBusyError } from './services/render-limit.js';

const tick = () => new Promise<void>((r) => setTimeout(r, 5));
// A job that runs until the test lets it finish, and notes when it started.
function job(log: string[], name: string) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  return { run: async () => { log.push(name); await gate; return name; }, release };
}

describe('the render limit (RENDER_CONCURRENCY, RENDER_QUEUE_MAX)', () => {
  it('runs at most `concurrency` renders at once, first come first served, and starts the next when one ends or fails', async () => {
    const l = createRenderLimiter({ concurrency: () => 2, queueMax: () => 50 }), log: string[] = [];
    const a = job(log, 'a'), b = job(log, 'b'), c = job(log, 'c');
    const bad = l.run(async () => { log.push('bad'); throw new Error('boom'); });
    const ra = l.run(a.run), rb = l.run(b.run), rc = l.run(c.run);
    await expect(bad).rejects.toThrow('boom');
    await tick();
    expect(log).toEqual(['bad', 'a', 'b']);
    expect(l.running()).toBe(2);
    expect(l.waiting()).toBe(1);
    a.release();
    await tick();
    expect(log).toEqual(['bad', 'a', 'b', 'c']);
    b.release(); c.release();
    expect(await Promise.all([ra, rb, rc])).toEqual(['a', 'b', 'c']);
    expect([l.running(), l.waiting()]).toEqual([0, 0]);
  });

  it('refuses a preview with 503 at once when RENDER_QUEUE_MAX already wait, and never refuses a render that waits its turn', async () => {
    const l = createRenderLimiter({ concurrency: () => 1, queueMax: () => 1 }), log: string[] = [];
    const a = job(log, 'a'), b = job(log, 'b'), c = job(log, 'c');
    const ra = l.run(a.run, { refuseWhenBusy: true });
    const rb = l.run(b.run, { refuseWhenBusy: true });
    const refused = l.run(async () => { log.push('never'); }, { refuseWhenBusy: true });
    await expect(refused).rejects.toBeInstanceOf(RenderBusyError);
    await expect(refused).rejects.toMatchObject({ status: 503, message: BUSY_MESSAGE });
    const rc = l.run(c.run);
    a.release(); await tick(); b.release(); await tick(); c.release();
    expect(await Promise.all([ra, rb, rc])).toEqual(['a', 'b', 'c']);
    expect(log).not.toContain('never');
  });

  it('with RENDER_QUEUE_MAX at 0, a preview is drawn only when a slot is free', async () => {
    const l = createRenderLimiter({ concurrency: () => 1, queueMax: () => 0 }), log: string[] = [];
    const a = job(log, 'a');
    const ra = l.run(a.run, { refuseWhenBusy: true });
    await expect(l.run(async () => 'x', { refuseWhenBusy: true })).rejects.toBeInstanceOf(RenderBusyError);
    a.release();
    await ra;
    expect(await l.run(async () => 'free', { refuseWhenBusy: true })).toBe('free');
  });
});

describe('RENDER_CONCURRENCY and RENDER_QUEUE_MAX in the environment', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db', APP_URL: 'https://vesk.example.com',
    BETTER_AUTH_SECRET: 'x'.repeat(40), APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  it('default to one render at a time and 50 waiting previews', () => {
    const c = loadConfig(base);
    expect([c.renderConcurrency, c.renderQueueMax]).toEqual([1, 50]);
  });
  it('take whole numbers in range', () => {
    const c = loadConfig({ ...base, RENDER_CONCURRENCY: '4', RENDER_QUEUE_MAX: '0' });
    expect([c.renderConcurrency, c.renderQueueMax]).toEqual([4, 0]);
  });
  it.each([['RENDER_CONCURRENCY', '0'], ['RENDER_CONCURRENCY', '17'], ['RENDER_CONCURRENCY', '1.5'], ['RENDER_CONCURRENCY', 'lots'], ['RENDER_QUEUE_MAX', '-1'], ['RENDER_QUEUE_MAX', '10001']])(
    'stop the server on %s=%s, naming the variable, never the value', (name, value) => {
      let message = '';
      try { loadConfig({ ...base, [name]: value }); } catch (e) { message = (e as Error).message; }
      expect(message).toContain(name);
      expect(message).not.toContain(`=${value}`);
    });
});
