// The brand's named series (services/series.ts). Admin only, mounted at /api/settings/series:
//
//   GET    /         { series: [...], look: { ref, name, kinds: { kind: [{ index, name, fields }] } } | null, limits }
//   POST   /         { name, kind, variants?, mark?, markField?, cadence, weekday?, firstNumber?, enabled? } a new series (201)
//   PATCH  /:id      any of those, or { enabled } / { position } alone
//   DELETE /:id      remove it; its posts keep their words and lose the link
//
// And for the post editor, admins and editors: GET /api/series -> { series } (the same views, read only).
import { Hono } from 'hono';
import type { AppEnv, Deps } from '../deps.js';
import { readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { brandScope } from '../services/looks.js';
import { seriesFor, seriesInput, seriesPatch } from '../services/series.js';

export function seriesSettingsRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin'));
  const series = seriesFor(deps);

  app.get('/', async (c) => c.json(await series.list(brandScope(c))));
  app.post('/', async (c) => c.json({ series: await series.create(brandScope(c), c.get('user'), await readJson(c, seriesInput)) }, 201));
  app.patch('/:id', async (c) => c.json({ series: await series.update(brandScope(c), c.get('user'), c.req.param('id'), await readJson(c, seriesPatch)) }));
  app.delete('/:id', async (c) => {
    await series.remove(brandScope(c), c.get('user'), c.req.param('id'));
    return c.json({ ok: true });
  });
  return app;
}

export function seriesReadRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin', 'editor'));
  const series = seriesFor(deps);
  app.get('/', async (c) => c.json({ series: (await series.list(brandScope(c))).series }));
  return app;
}
