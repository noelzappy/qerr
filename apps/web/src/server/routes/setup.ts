// Admin only: the guided first setup (web: /setup/<step>). Mounted at /api/setup.
//
//   GET  /           where each step stands, read from what is saved (the brand, the logos, the look in use, the Buffer accounts
//                    and routes, the AI provider and budget, the batches), plus the setup's own record: the steps a person
//                    finished or put off for later, whether they left the setup for later, and whether they finished it
//   PUT  /progress   { step, state } marks one step done or skipped for later; { left: true } or { finished: true } closes the setup
//
// Nothing here saves a setting: each step saves through the route that already owns it (Settings, Brand; Looks; Buffer accounts;
// AI). This only keeps the record the pages cannot derive, such as "the look was chosen" (every saved brand starts on a look).
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Deps } from '../deps.js';
import { readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { aiReadiness, getSetting, setSetting } from '../services/ai-config.js';

export const SETUP_STEPS = ['brand', 'logo', 'look', 'channels', 'ai', 'batch'] as const;
export type SetupStepKey = (typeof SETUP_STEPS)[number];
export const SETTING_SETUP = 'setupProgress';

export interface SetupProgress { done: SetupStepKey[]; skipped: SetupStepKey[]; left: boolean; finished: boolean }
const EMPTY: SetupProgress = { done: [], skipped: [], left: false, finished: false };

const stepKey = z.enum(SETUP_STEPS);
const progressBody = z.union([
  z.object({ step: stepKey, state: z.enum(['done', 'skipped']) }).strict(),
  z.object({ left: z.literal(true) }).strict(),
  z.object({ finished: z.literal(true) }).strict(),
]);

// The stored record, read defensively: an unknown step or a wrong type is dropped, never trusted.
export function readProgress(v: unknown): SetupProgress {
  if (!v || typeof v !== 'object') return { ...EMPTY };
  const o = v as Record<string, unknown>;
  const steps = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((s): s is SetupStepKey => (SETUP_STEPS as readonly string[]).includes(s as string)))] : []);
  return { done: steps(o.done), skipped: steps(o.skipped), left: o.left === true, finished: o.finished === true };
}

// One step marked: done takes it off the skipped list and the other way round.
export function markStep(p: SetupProgress, step: SetupStepKey, state: 'done' | 'skipped'): SetupProgress {
  const without = (list: SetupStepKey[]) => list.filter((s) => s !== step);
  return state === 'done'
    ? { ...p, done: [...without(p.done), step], skipped: without(p.skipped) }
    : { ...p, skipped: [...without(p.skipped), step], done: without(p.done) };
}

export function setupRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin'));

  async function status() {
    const [brand, accounts, routes, providers, ai, batches, stored] = await Promise.all([
      deps.prisma.brandProfile.findUnique({ where: { id: 'brand' }, select: { logoFullKey: true, logoMarkKey: true, activeLookRef: true } }),
      deps.prisma.bufferAccount.count(),
      deps.prisma.channelRoute.count(),
      deps.prisma.aiProvider.count({ where: { enabled: true } }),
      aiReadiness(deps, 'draft'),
      deps.prisma.batch.count(),
      getSetting<unknown>(deps, SETTING_SETUP, null),
    ]);
    const progress = readProgress(stored);
    return {
      brandSaved: !!brand,
      steps: {
        brand: { done: !!brand },
        logo: { done: !!brand?.logoFullKey && !!brand.logoMarkKey },
        // Every saved brand starts on a look, so the step counts once a person chose (or kept) one here.
        look: { done: progress.done.includes('look'), activeRef: brand?.activeLookRef ?? null },
        channels: { done: accounts > 0 && routes > 0, accounts, routes },
        ai: { done: ai.ready, missing: ai.missing, providers },
        batch: { done: batches > 0 },
      },
      progress,
    };
  }

  app.get('/', async (c) => c.json(await status()));

  app.put('/progress', async (c) => {
    const body = await readJson(c, progressBody);
    let p = readProgress(await getSetting<unknown>(deps, SETTING_SETUP, null));
    if ('step' in body) p = markStep(p, body.step, body.state);
    else if ('left' in body) p = { ...p, left: true };
    else p = { ...p, finished: true };
    await setSetting(deps, SETTING_SETUP, p);
    return c.json(await status());
  });

  return app;
}
