// Admin only: the brand's own layouts (Settings, Layouts). Mounted at /api/settings/layouts.
//
//   GET    /                  the layouts, the starting points, the built-in layouts (read only, and whether a brand may copy
//                             each), and the engine's catalogue of blocks, options and fields
//   POST   /                  a new layout: { definition } (written by hand or in the editor), { starter, name? } (a copy of a
//                             starting point) or { builtin, name? } (a copy of a built-in layout, switched off until it is
//                             switched on); checked by the engine's layout validator before it is stored
//   POST   /validate          what is wrong with a layout, without storing it: { problems }
//   POST   /preview           a layout drawn with sample words at one size, through the renderer and every check: { image, ... }
//   PUT    /:id               replace a layout's definition (checked again)
//   PATCH  /:id               switch it on or off, or move it
//   POST   /:id/duplicate     a copy under a free id
//   DELETE /:id               remove it (refused while a post's design still names it; switch it off instead)
//
// Every change writes the brand pack again (syncBrand), so posts and the AI see the enabled layouts at once.
import { Hono } from 'hono';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../audit.js';
import type { AppEnv, Deps } from '../deps.js';
import { badRequest, conflict, HttpError, notFound, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { syncBrand } from '../services/brand-settings.js';
import { freeSlug, layoutEngine, layoutProblems, MAX_LAYOUTS, previewLayout } from '../services/layouts.js';
import { oneAtATime } from '../services/render.js';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

const createBody = z.union([
  z.object({ definition: z.record(z.string(), z.unknown()), origin: z.string().regex(/^reference:[0-9a-f-]{36}$/).optional() }).strict(),
  z.object({ starter: z.string().min(1).max(40), name: z.string().trim().min(1).max(40).optional() }).strict(),
  z.object({ builtin: z.string().min(1).max(40), name: z.string().trim().min(1).max(40).optional() }).strict(),
]);
const putBody = z.object({ definition: z.record(z.string(), z.unknown()) }).strict();
const patchBody = z.object({ enabled: z.boolean().optional(), position: z.number().int().min(0).max(1000).optional() }).strict();
const previewBody = z.object({
  definition: z.record(z.string(), z.unknown()),
  size: z.enum(['feed', 'wide', 'story', 'square']).optional(),
  // Words to try instead of the samples: a field of the layout and its value, checked by the engine like a post's design.
  sample: z.record(z.string(), z.unknown()).optional(),
}).strict();

export function layoutRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin'));

  const view = (r: { id: string; slug: string; name: string; definition: Prisma.JsonValue; origin: string; enabled: boolean; position: number; createdAt: Date; updatedAt: Date }) => ({
    id: r.id, slug: r.slug, name: r.name, definition: r.definition, origin: r.origin, enabled: r.enabled, position: r.position, createdAt: r.createdAt, updatedAt: r.updatedAt,
  });
  const row = async (id: string) => {
    const r = await deps.prisma.brandLayout.findUnique({ where: { id } });
    if (!r) throw notFound('Layout not found');
    return r;
  };
  // Refuses a definition the engine does not accept, with its reasons.
  const checked = async (definition: Json) => {
    const problems = await layoutProblems(definition);
    if (problems.length) throw badRequest('The layout is not valid', problems.map((message) => ({ path: 'definition', message })));
    return definition as Json & { id: string; name: string };
  };
  // Posts whose design names this layout.
  const postsUsing = (slug: string) => deps.prisma.post.count({ where: { status: { not: 'removed' }, design: { path: ['layout'], equals: slug } } });

  app.get('/', async (c) => {
    const { layout, starters } = await layoutEngine();
    const rows = await deps.prisma.brandLayout.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    const builtins = starters.builtinLayouts().map((b) => ({ id: b.layout.id, template: b.template, variant: b.variant, copyable: b.copyable, why: b.why, definition: b.layout }));
    return c.json({ layouts: rows.map(view), starters: starters.STARTER_LAYOUTS, builtins, catalogue: layout.layoutCatalogue(), max: MAX_LAYOUTS });
  });

  app.post('/validate', async (c) => {
    const { definition } = await readJson(c, putBody);
    return c.json({ problems: await layoutProblems(definition) });
  });

  app.post('/preview', async (c) => {
    const body = await readJson(c, previewBody);
    const definition = await checked(body.definition);
    const brand = await syncBrand(deps);
    if (brand.logosMissing) throw new HttpError(409, 'Add your logo and its mark in Settings, Brand before a preview can be made');
    return c.json(await previewLayout(deps, definition, { size: body.size, sample: body.sample, lock: oneAtATime }));
  });

  app.post('/', async (c) => {
    const actor = c.get('user');
    const body = await readJson(c, createBody);
    if (await deps.prisma.brandLayout.count() >= MAX_LAYOUTS) throw conflict(`Keep at most ${MAX_LAYOUTS} layouts; remove one first`);
    let definition: Json, origin: string, enabled = true;
    if ('builtin' in body) {
      // A built-in layout, copied as a brand's own: off until it is switched on, as any copy.
      const { starters } = await layoutEngine();
      const entry = starters.builtinLayouts().find((b) => b.layout.id === body.builtin);
      if (!entry) throw notFound('There is no built-in layout with that id');
      if (!entry.copyable) throw badRequest(`This built-in layout cannot be copied: ${entry.why}`);
      const slug = await freeSlug(deps, body.name ?? `${body.builtin}-copy`);
      const copy = starters.builtinCopy(body.builtin, { newId: slug, name: body.name ?? `${String(entry.layout.name).slice(0, 33)} (copy)` });
      if (!copy) throw notFound('There is no built-in layout with that id');
      definition = copy;
      origin = `builtin:${body.builtin}`;
      enabled = false;
    } else if ('starter' in body) {
      const { starters } = await layoutEngine();
      const slug = await freeSlug(deps, body.name ?? body.starter);
      const copy = starters.starterCopy(body.starter, { newId: slug, name: body.name });
      if (!copy) throw notFound('There is no starting point with that name');
      definition = copy;
      origin = `starter:${body.starter}`;
    } else {
      definition = body.definition;
      origin = body.origin ?? 'blank';
    }
    const d = await checked(definition);
    if (await deps.prisma.brandLayout.findUnique({ where: { slug: d.id } })) throw conflict(`A layout with the id "${d.id}" exists already; choose another id`);
    const position = (await deps.prisma.brandLayout.aggregate({ _max: { position: true } }))._max.position ?? -1;
    const r = await deps.prisma.brandLayout.create({
      data: { slug: d.id, name: d.name, definition: d as Prisma.InputJsonValue, origin, enabled, position: position + 1, createdById: actor.id, updatedById: actor.id },
    });
    await audit(deps, actor, 'layout.create', 'layout', r.id, { layout: r.slug, origin });
    await syncBrand(deps);
    return c.json({ layout: view(r) }, 201);
  });

  app.put('/:id', async (c) => {
    const actor = c.get('user');
    const before = await row(c.req.param('id'));
    const { definition } = await readJson(c, putBody);
    const d = await checked(definition);
    if (d.id !== before.slug) {
      if (await deps.prisma.brandLayout.findUnique({ where: { slug: d.id } })) throw conflict(`A layout with the id "${d.id}" exists already; choose another id`);
      const used = await postsUsing(before.slug);
      if (used) throw conflict(`${used} post${used === 1 ? '' : 's'} use the id "${before.slug}"; keep it, or make a copy under the new id`);
    }
    const r = await deps.prisma.brandLayout.update({ where: { id: before.id }, data: { slug: d.id, name: d.name, definition: d as Prisma.InputJsonValue, updatedById: actor.id } });
    await audit(deps, actor, 'layout.update', 'layout', r.id, { layout: r.slug, ...(before.slug !== r.slug ? { was: before.slug } : {}) });
    await syncBrand(deps);
    return c.json({ layout: view(r) });
  });

  app.patch('/:id', async (c) => {
    const actor = c.get('user');
    const before = await row(c.req.param('id'));
    const body = await readJson(c, patchBody);
    const r = await deps.prisma.brandLayout.update({ where: { id: before.id }, data: { ...body, updatedById: actor.id } });
    await audit(deps, actor, 'layout.update', 'layout', r.id, { layout: r.slug, changed: Object.keys(body) });
    await syncBrand(deps);
    return c.json({ layout: view(r) });
  });

  app.post('/:id/duplicate', async (c) => {
    const actor = c.get('user');
    const from = await row(c.req.param('id'));
    if (await deps.prisma.brandLayout.count() >= MAX_LAYOUTS) throw conflict(`Keep at most ${MAX_LAYOUTS} layouts; remove one first`);
    if (!isObj(from.definition)) throw badRequest('This layout cannot be copied');
    const slug = await freeSlug(deps, `${from.slug}-copy`);
    const name = `${from.name.slice(0, 33)} (copy)`;
    const d = await checked({ ...from.definition, id: slug, name });
    const position = (await deps.prisma.brandLayout.aggregate({ _max: { position: true } }))._max.position ?? -1;
    const r = await deps.prisma.brandLayout.create({
      data: { slug, name, definition: d as Prisma.InputJsonValue, origin: `copy:${from.slug}`, enabled: false, position: position + 1, createdById: actor.id, updatedById: actor.id },
    });
    await audit(deps, actor, 'layout.create', 'layout', r.id, { layout: r.slug, origin: r.origin });
    return c.json({ layout: view(r) }, 201);
  });

  app.delete('/:id', async (c) => {
    const actor = c.get('user');
    const r = await row(c.req.param('id'));
    const used = await postsUsing(r.slug);
    if (used) throw conflict(`${used} post${used === 1 ? '' : 's'} use this layout; switch it off instead, or change those posts first`);
    await deps.prisma.brandLayout.delete({ where: { id: r.id } });
    await audit(deps, actor, 'layout.delete', 'layout', r.id, { layout: r.slug });
    await syncBrand(deps);
    return c.json({ ok: true });
  });

  return app;
}
