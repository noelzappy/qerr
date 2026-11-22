// Admin only: the brand's looks (Settings, Looks). Mounted at /api/settings/looks. A look is a whole way of composing a post, as
// data (packages/engine/lib/design/look.mjs); services/looks.ts says what each call does. A look is named by a reference,
// `shipped:<id>` (the engine's own, read only) or `own:<slug>`; the brand is never taken from a request (brandScope).
//
//   GET    /                                 the looks (shipped, own), the active reference, the engine catalogue and the limits
//   GET    /:ref                             one look in full (an own look with its drafts and gate records)
//   POST   /duplicate                        { source, name?, slug? } a copy of a shipped or own look, as a draft of the brand's own
//   POST   /validate                         { definition } what is wrong with a whole look, nothing stored: { problems }
//   POST   /preview                          { ref | look, kinds? } one picture per kind with warnings and the look's hash; 501 without a renderer
//   POST   /preview-design                   { ref | look, kind, index, draft?, scenario?, withRects? } one design drawn on its own with the
//                                            rectangle of each element: { hash, image, rects, warnings, problems }; 501 without a renderer
//   PUT    /active                           { ref | null } the brand's look (a shipped look or a ready own one), null = classic layouts
//   PUT    /:slug/settings                   { definition } the look without compositions
//   POST   /:slug/compositions               { source, kind, index } copy one composition from any shipped look or an own look
//   POST   /:slug/compositions/:id/validate  { definition } what is wrong with a draft of the composition, nothing stored: { problems }
//   PUT    /:slug/compositions/:id/draft     { definition } unpublished edits of a composition
//   DELETE /:slug/compositions/:id/draft     discard them
//   POST   /:slug/compositions/:id/publish   the draft becomes the composition (when the gate passes)
//   PATCH  /:slug/compositions/:id           { enabled?, position? }
//   DELETE /:slug/compositions/:id           remove it (never the last of its kind)
//   POST   /:slug/publish                    the look is ready
//   POST   /:slug/gate                       the render checks of every enabled design, stored on each: { look }
//   GET    /fonts/:family/:file              a shipped font file (allow-listed by the engine's font library), for the typeface cards
//   DELETE /:slug                            remove a look (refused while active)
//
// And for the post editor and the AI, any signed-in person: GET /api/looks/brief (lookBriefsRoute below).
// Every change to what the brand draws writes the brand pack again (syncBrand).
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Deps } from '../deps.js';
import { engineImport } from '../engine/root.js';
import { badRequest, notFound, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { syncBrand } from '../services/brand-settings.js';
import { brandScope, fontFamilies, lookEngine, looksFor, lookCatalogue, lookLimits, lookRenderer, PREVIEW_UNAVAILABLE, SLUG, type CompositionRect } from '../services/looks.js';

// The engine's shipped font files, by the library's own list (design/fonts/library.json): `${family}/${file}` -> the file on disk. A request's
// words are only ever looked up here; no part of a request becomes a path.
let fontFiles: Promise<Map<string, string>> | null = null;
const allowedFonts = (): Promise<Map<string, string>> => (fontFiles ??= (async () => {
  const [lib, core] = await Promise.all([
    engineImport<{ fontLibrary(): Array<{ family: string; dir: string; files: Array<{ file: string }> }> }>('design/font-library'),
    engineImport<{ ENGINE_DIR: string }>('core'),
  ]);
  const map = new Map<string, string>();
  for (const f of lib.fontLibrary()) for (const x of f.files) map.set(`${f.family}/${x.file}`, path.join(core.ENGINE_DIR, 'design', 'fonts', f.dir, x.file));
  return map;
})());

const REF = /^(shipped|own):[a-z0-9][a-z0-9-]{0,39}$/;
const ref = z.string().regex(REF, 'Use shipped:<id> or own:<slug>');
const definition = z.record(z.string(), z.unknown());

const duplicateBody = z.object({ source: ref, name: z.string().trim().min(1).max(40).optional(), slug: z.string().regex(SLUG, 'Lowercase letters, digits and - only').optional() }).strict();
const definitionBody = z.object({ definition }).strict();
const addBody = z.object({ source: ref, kind: z.string().min(1).max(20), index: z.number().int().min(0).max(40) }).strict();
const patchBody = z.object({ enabled: z.boolean().optional(), position: z.number().int().min(0).max(40).optional() }).strict();
// One picture per kind: { ref } or { look } (a whole look, as the panel holds it), and optionally the kinds wanted.
const previewBody = z.object({ ref: ref.optional(), look: definition.optional(), kinds: z.array(z.string().min(1).max(20)).max(7).optional() }).strict();
// One design on its own: which composition (the `index`th of `kind` among all the look's), an unsaved draft of it, the copy to draw it with.
const designPreviewBody = z.object({
  ref: ref.optional(), look: definition.optional(), kind: z.string().min(1).max(20), index: z.number().int().min(0).max(40), draft: definition.optional(),
  scenario: z.enum(['sample', 'stress', 'minimal']).default('sample'), withRects: z.boolean().default(true),
}).strict();
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
    return c.json({ ...list, catalogue: await lookCatalogue(), limits: await lookLimits(), fonts: await fontFamilies() });
  });

  app.post('/duplicate', async (c) => {
    const body = await readJson(c, duplicateBody);
    return c.json({ look: await looks.duplicateLook(brandScope(c), c.get('user'), body.source, { name: body.name, slug: body.slug }) }, 201);
  });

  app.post('/validate', async (c) => {
    const { definition: d } = await readJson(c, definitionBody);
    return c.json({ problems: await looks.problems(d) });
  });

  app.post('/preview', async (c) => {
    const r = lookRenderer();
    if (!r) return c.json({ error: PREVIEW_UNAVAILABLE }, 501);
    const body = await readJson(c, previewBody);
    const target = await looks.previewTarget(brandScope(c), body);
    const eng = await lookEngine();
    const bad = (body.kinds ?? []).find((k) => !eng.KINDS.includes(k));
    if (bad) throw badRequest(`Unknown kind of post: ${bad.slice(0, 20)}`);
    const answer = await r.preview({ scope: brandScope(c), look: target.look, kinds: body.kinds ?? eng.KINDS, userId: c.get('user').id });
    return c.json({ hash: target.hash, samples: answer.samples, ...(answer.superseded ? { superseded: true } : {}) });
  });

  // The renderer's rectangles, kept to what the editor can use: an address of digits and dots, finite numbers, at most 200.
  const cleanRects = (rects: CompositionRect[] | undefined): CompositionRect[] => (Array.isArray(rects) ? rects : [])
    .filter((r) => r && typeof r.el === 'string' && /^[0-9]+(\.[0-9]+)*$/.test(r.el) && [r.x, r.y, r.w, r.h].every((n) => Number.isFinite(n)))
    .slice(0, 200).map((r) => ({ el: r.el, x: r.x, y: r.y, w: r.w, h: r.h, rot: Number.isFinite(r.rot) ? r.rot : 0 }));
  app.post('/preview-design', async (c) => {
    const r = lookRenderer();
    if (!r?.previewComposition) return c.json({ error: PREVIEW_UNAVAILABLE }, 501);
    const body = await readJson(c, designPreviewBody);
    const target = await looks.compositionPreviewTarget(brandScope(c), body);
    // an unfinished draft is not drawn: the editor shows what is wrong and keeps its sketch
    if (target.problems.length) return c.json({ hash: '', rects: [], warnings: [], problems: target.problems });
    const answer = await r.previewComposition({ scope: brandScope(c), look: target.look, kind: body.kind, index: target.index, scenario: body.scenario, withRects: body.withRects, userId: c.get('user').id });
    // a newer request from the same person for this look replaced this one while it waited: the editor keeps what it has
    if (answer.superseded) return c.json({ hash: target.hash, rects: [], warnings: [], problems: [], superseded: true });
    return c.json({
      hash: target.hash, ...(answer.image ? { image: answer.image } : {}), rects: cleanRects(answer.rects),
      warnings: (answer.warnings ?? []).slice(0, 30).map((w) => String(w).slice(0, 300)), problems: answer.error ? [{ path: 'definition', message: String(answer.error).slice(0, 300) }] : [],
    });
  });

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

  app.post('/:slug/compositions/:id/validate', async (c) => {
    const { definition: d } = await readJson(c, definitionBody);
    return c.json(await looks.draftProblems(brandScope(c), slugOf(c), c.req.param('id'), d));
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

  // The render checks of every enabled design (sample, stress and minimal copy), stored on each design; the look as the panel reads it.
  app.post('/:slug/gate', async (c) => c.json({ look: await looks.gateLook(brandScope(c), c.get('user'), slugOf(c)) }));

  app.delete('/:slug', async (c) => {
    await looks.deleteLook(brandScope(c), c.get('user'), slugOf(c));
    return c.json({ ok: true });
  });

  // A shipped font file for the panel's typeface cards (@font-face): only a family and file the engine's library lists are served.
  app.get('/fonts/:family/:file', async (c) => {
    const file = (await allowedFonts()).get(`${c.req.param('family')}/${c.req.param('file')}`);
    if (!file) throw notFound('Font not found');
    return new Response(new Uint8Array(await fs.promises.readFile(file)), { headers: { 'content-type': 'font/woff2', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
  });

  // Last, so that /validate, /preview, /duplicate and /active are never taken for a reference.
  app.get('/:ref', async (c) => c.json({ look: await looks.getLook(brandScope(c), c.req.param('ref')) }));

  return app;
}
