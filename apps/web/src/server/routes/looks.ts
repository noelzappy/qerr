// Admin only: the brand's looks (Settings, Looks). Mounted at /api/settings/looks. A look is a whole way of composing a post, as
// data (packages/engine/lib/design/look.mjs); services/looks.ts says what each call does. A look is named by a reference,
// `shipped:<id>` (the engine's own, read only) or `own:<slug>`; the brand is never taken from a request (brandScope).
//
//   GET    /                                 the looks (shipped, own), the active reference, the engine catalogue and the limits
//   GET    /:ref                             one look in full (an own look with its drafts and gate records)
//   POST   /duplicate                        { source, name?, slug? } a copy of a shipped or own look, as a draft of the brand's own
//   POST   /validate                         { definition } what is wrong with a whole look, nothing stored: { problems }
//   POST   /preview                          501 until the interpreter exists
//   PUT    /active                           { ref | null } the brand's look (a shipped look or a ready own one), null = classic layouts
//   PUT    /:slug/settings                   { definition } the look without compositions
//   POST   /:slug/compositions               { source, kind, index } copy one composition from any shipped look or an own look
//   PUT    /:slug/compositions/:id/draft     { definition } unpublished edits of a composition
//   DELETE /:slug/compositions/:id/draft     discard them
//   POST   /:slug/compositions/:id/publish   the draft becomes the composition (when the gate passes)
//   PATCH  /:slug/compositions/:id           { enabled?, position? }
//   DELETE /:slug/compositions/:id           remove it (never the last of its kind)
//   POST   /:slug/publish                    the look is ready
//   POST   /:slug/gate                       501 until the interpreter exists
//   DELETE /:slug                            remove a look (refused while active)
//
// And for the post editor and the AI, any signed-in person: GET /api/looks/brief (lookBriefsRoute below).
// Every change to what the brand draws writes the brand pack again (syncBrand).
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Deps } from '../deps.js';
import { badRequest, HttpError, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { syncBrand } from '../services/brand-settings.js';
import { brandScope, looksFor, lookCatalogue, lookLimits, lookRenderer, PREVIEW_UNAVAILABLE, SLUG } from '../services/looks.js';

const REF = /^(shipped|own):[a-z0-9][a-z0-9-]{0,39}$/;
const ref = z.string().regex(REF, 'Use shipped:<id> or own:<slug>');
const definition = z.record(z.string(), z.unknown());

const duplicateBody = z.object({ source: ref, name: z.string().trim().min(1).max(40).optional(), slug: z.string().regex(SLUG, 'Lowercase letters, digits and - only').optional() }).strict();
const definitionBody = z.object({ definition }).strict();
const addBody = z.object({ source: ref, kind: z.string().min(1).max(20), index: z.number().int().min(0).max(40) }).strict();
const patchBody = z.object({ enabled: z.boolean().optional(), position: z.number().int().min(0).max(40).optional() }).strict();
const activeBody = z.object({ ref: ref.nullable() }).strict();

export function looksBriefRoute(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps));
  // The active look's kinds, variants, fields and budgets (lookBrief), or { look: null } when the brand uses classic layouts.
  app.get('/brief', async (c) => {
    await syncBrand(deps);
    return c.json({ look: await looksFor(deps).lookBriefs(brandScope(c)) });
  });
  return app;
}

export function lookRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin'));
  const looks = looksFor(deps);
  const slugOf = (c: { req: { param(n: string): string } }) => c.req.param('slug');

  app.get('/', async (c) => {
    const list = await looks.listLooks(brandScope(c));
    return c.json({ ...list, catalogue: await lookCatalogue(), limits: await lookLimits() });
  });

  app.post('/duplicate', async (c) => {
    const body = await readJson(c, duplicateBody);
    return c.json({ look: await looks.duplicateLook(brandScope(c), c.get('user'), body.source, { name: body.name, slug: body.slug }) }, 201);
  });

  app.post('/validate', async (c) => {
    const { definition: d } = await readJson(c, definitionBody);
    return c.json({ problems: await looks.problems(d) });
  });

  // Drawing a look needs the interpreter, which does not exist yet.
  const guardRenderer = (c: { json(o: unknown, s: 501): Response }): Response => {
    if (!lookRenderer()) return c.json({ error: PREVIEW_UNAVAILABLE }, 501);
    throw new HttpError(500, 'The look renderer is not connected to this route yet');
  };
  app.post('/preview', (c) => guardRenderer(c));

  app.put('/active', async (c) => {
    const body = await readJson(c, activeBody);
    const r = await looks.setActiveLook(brandScope(c), c.get('user'), body.ref);
    await syncBrand(deps);
    return c.json(r);
  });

  app.put('/:slug/settings', async (c) => {
    const { definition: d } = await readJson(c, definitionBody);
    return c.json({ look: await looks.updateLookSettings(brandScope(c), c.get('user'), slugOf(c), d) });
  });

  app.post('/:slug/compositions', async (c) => {
    const body = await readJson(c, addBody);
    return c.json({ look: await looks.addCompositionFrom(brandScope(c), c.get('user'), slugOf(c), { sourceRef: body.source, kind: body.kind, index: body.index }) }, 201);
  });

  app.put('/:slug/compositions/:id/draft', async (c) => {
    const { definition: d } = await readJson(c, definitionBody);
    return c.json({ look: await looks.saveCompositionDraft(brandScope(c), c.get('user'), slugOf(c), c.req.param('id'), d) });
  });

  app.delete('/:slug/compositions/:id/draft', async (c) => c.json({ look: await looks.discardCompositionDraft(brandScope(c), c.get('user'), slugOf(c), c.req.param('id')) }));

  app.post('/:slug/compositions/:id/publish', async (c) => c.json({ look: await looks.publishComposition(brandScope(c), c.get('user'), slugOf(c), c.req.param('id')) }));

  app.patch('/:slug/compositions/:id', async (c) => {
    const body = await readJson(c, patchBody);
    if (body.enabled === undefined && body.position === undefined) throw badRequest('Say what to change: enabled or position');
    const scope = brandScope(c), actor = c.get('user'), id = c.req.param('id');
    let look: unknown = null;
    if (body.enabled !== undefined) look = await looks.setCompositionEnabled(scope, actor, slugOf(c), id, body.enabled);
    if (body.position !== undefined) look = await looks.moveComposition(scope, actor, slugOf(c), id, body.position);
    return c.json({ look });
  });

  app.delete('/:slug/compositions/:id', async (c) => c.json({ look: await looks.removeComposition(brandScope(c), c.get('user'), slugOf(c), c.req.param('id')) }));

  app.post('/:slug/publish', async (c) => c.json({ look: await looks.publishLook(brandScope(c), c.get('user'), slugOf(c)) }));

  app.post('/:slug/gate', (c) => guardRenderer(c));

  app.delete('/:slug', async (c) => {
    await looks.deleteLook(brandScope(c), c.get('user'), slugOf(c));
    return c.json({ ok: true });
  });

  // Last, so that /validate, /preview, /duplicate and /active are never taken for a reference.
  app.get('/:ref', async (c) => c.json({ look: await looks.getLook(brandScope(c), c.req.param('ref')) }));

  return app;
}
