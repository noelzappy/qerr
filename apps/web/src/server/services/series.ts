// A brand's named recurring series (Settings, Looks, Series): "Myth vs fact", "Tip of the week". Each is a kind of post drawn by chosen
// designs of the active look, with an optional mark ("Tip #{n}") written into the post's label or tag, at a cadence. Every series is checked
// by the engine's seriesProblems (packages/engine/lib/design/series.mjs) against the active look before it is stored; the AI drafter plans
// the enabled ones into a batch; the post editor assigns a post to one. The series never reaches the render: a post of a series is an
// ordinary post whose label (or tag) holds the mark's words (AGENTS.md rule 11).
//
// TENANCY as in services/looks.ts: every function takes a scope `{ brandId }` from brandScope(c), and every query filters on it.
// NUMBERS are worked out, never stored on the series: the next number is one more than the highest a live post of the series carries, or the
// series' firstNumber when none does.
import type { BrandSeries, Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit, type AuditActor } from '../audit.js';
import type { Deps } from '../deps.js';
import { engineImport } from '../engine/root.js';
import { badRequest, conflict, notFound } from '../http.js';
import { looksFor, type LookBrief, type LookScope } from './looks.js';
import { slugify } from './post-model.js';

export interface EngineSeries {
  seriesProblems(s: unknown, where?: string, opts?: { brief?: LookBrief }): string[];
  seriesMark(mark: string, n: number): string;
  SERIES_CADENCES: string[];
  SERIES_MARK_FIELDS: string[];
  SERIES_LIMITS: { perBrand: number; name: number; variants: number; number: number; mark: number };
}
let engineLoaded: Promise<EngineSeries> | null = null;
export const seriesEngine = (): Promise<EngineSeries> => (engineLoaded ??= engineImport<EngineSeries>('design/series'));

const KINDS = ['statement', 'figure', 'list', 'quote', 'photo', 'event', 'offer'] as const;
// The shape of a request; the engine judges the words, the look and the limits.
export const seriesInput = z.strictObject({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(KINDS),
  variants: z.array(z.number().int().min(0).max(9)).max(3).default([]),
  mark: z.string().max(40).nullable().optional(),
  markField: z.enum(['label', 'tag']).default('label'),
  cadence: z.enum(['weekly', 'fortnightly', 'monthly']),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  firstNumber: z.number().int().min(1).max(9999).default(1),
  enabled: z.boolean().default(true),
});
export const seriesPatch = z.strictObject({
  name: z.string().trim().min(1).max(40).optional(),
  kind: z.enum(KINDS).optional(),
  variants: z.array(z.number().int().min(0).max(9)).max(3).optional(),
  mark: z.string().max(40).nullable().optional(),
  markField: z.enum(['label', 'tag']).optional(),
  cadence: z.enum(['weekly', 'fortnightly', 'monthly']).optional(),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  firstNumber: z.number().int().min(1).max(9999).optional(),
  enabled: z.boolean().optional(),
  position: z.number().int().min(0).max(40).optional(),
});
export type SeriesInput = z.infer<typeof seriesInput>;

// The engine's form of a series (what seriesProblems and the AI drafter read). `variants` only count in the look they were chosen in.
export interface EngineSeriesShape {
  slug: string; name: string; kind: string; variants: number[]; mark?: string; markField: string; cadence: string; weekday?: number; nextNumber: number;
}

export interface SeriesView {
  id: string; slug: string; name: string; kind: string; variants: number[]; lookRef: string | null; mark: string | null; markField: string;
  cadence: string; weekday: number | null; firstNumber: number; enabled: boolean; position: number;
  // worked out: the next number, how many live posts carry the series, what the next mark reads, and whether the chosen designs belong to
  // the look in use (false: they are ignored until designs of this look are chosen)
  nextNumber: number; posts: number; nextMark: string | null; designsInLook: boolean;
  // what is wrong with it under the look in use now (the look may have changed since it was saved); empty when fine
  problems: string[];
  updatedAt: string;
}

const useful = (variants: number[], lookRef: string | null, activeRef: string | null) => (variants.length && lookRef === activeRef ? variants : []);
const toEngine = (r: Pick<BrandSeries, 'slug' | 'name' | 'kind' | 'variants' | 'lookRef' | 'mark' | 'markField' | 'cadence' | 'weekday'>, activeRef: string | null, nextNumber: number): EngineSeriesShape => ({
  slug: r.slug, name: r.name, kind: r.kind, variants: useful(r.variants, r.lookRef, activeRef), ...(r.mark ? { mark: r.mark } : {}), markField: r.markField, cadence: r.cadence,
  ...(r.weekday !== null && r.weekday !== undefined ? { weekday: r.weekday } : {}), nextNumber,
});

export function createSeries(deps: Pick<Deps, 'prisma'>) {
  const { prisma } = deps;
  const looks = looksFor(deps);

  async function active(scope: LookScope): Promise<({ ref: string } & LookBrief) | null> {
    return looks.lookBriefs(scope);
  }

  // The next number of each series: one more than the highest a live (not removed) post carries, else its first number.
  async function numbers(scope: LookScope, rows: BrandSeries[]): Promise<Map<string, { next: number; posts: number }>> {
    const out = new Map<string, { next: number; posts: number }>();
    if (!rows.length) return out;
    const agg = await prisma.post.groupBy({ by: ['seriesId'], where: { seriesId: { in: rows.map((r) => r.id) }, status: { not: 'removed' } }, _max: { seriesNumber: true }, _count: { _all: true } });
    for (const r of rows) {
      const a = agg.find((x) => x.seriesId === r.id);
      out.set(r.id, { next: Math.max(r.firstNumber, (a?._max.seriesNumber ?? 0) + 1), posts: a?._count._all ?? 0 });
    }
    void scope;
    return out;
  }

  async function rowsOf(scope: LookScope) {
    return prisma.brandSeries.findMany({ where: { brandId: scope.brandId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], take: 50 });
  }

  async function views(scope: LookScope, rows: BrandSeries[]): Promise<SeriesView[]> {
    const eng = await seriesEngine();
    const look = await active(scope);
    const n = await numbers(scope, rows);
    return rows.map((r) => {
      const next = n.get(r.id)?.next ?? r.firstNumber;
      const shape = toEngine(r, look?.ref ?? null, next);
      return {
        id: r.id, slug: r.slug, name: r.name, kind: r.kind, variants: r.variants, lookRef: r.lookRef, mark: r.mark, markField: r.markField,
        cadence: r.cadence, weekday: r.weekday, firstNumber: r.firstNumber, enabled: r.enabled, position: r.position,
        nextNumber: next, posts: n.get(r.id)?.posts ?? 0, nextMark: r.mark ? eng.seriesMark(r.mark, next) : null,
        designsInLook: !r.variants.length || r.lookRef === (look?.ref ?? null),
        problems: look ? eng.seriesProblems(shape, r.name, { brief: look }) : ['Series are drawn by a look; choose one in Settings, Looks'],
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }

  async function list(scope: LookScope) {
    const eng = await seriesEngine();
    const look = await active(scope);
    return {
      series: await views(scope, await rowsOf(scope)),
      // what the page offers: the kinds of the look in use and its designs of each (index and name), and which fields each shows
      look: look ? { ref: look.ref, name: look.name ?? look.ref, kinds: Object.fromEntries(Object.entries(look.kinds).map(([k, v]) => [k, v.variants.map((x) => ({ index: x.index, name: x.name, fields: Object.keys(x.fields) }))])) } : null,
      limits: { perBrand: eng.SERIES_LIMITS.perBrand, name: eng.SERIES_LIMITS.name, variants: eng.SERIES_LIMITS.variants },
    };
  }

  async function needRow(scope: LookScope, id: string) {
    const row = /^[0-9a-f-]{36}$/i.test(id) ? await prisma.brandSeries.findFirst({ where: { id, brandId: scope.brandId } }) : null;
    if (!row) throw notFound('Series not found');
    return row;
  }

  // The engine's verdict on a series as it would be stored: refused (400 with every problem) unless a look is in use and draws it.
  async function check(scope: LookScope, s: { name: string; kind: string; variants: number[]; mark?: string | null; markField: string; cadence: string; weekday?: number | null; firstNumber: number }, slug: string) {
    const eng = await seriesEngine();
    const look = await active(scope);
    if (!look) throw badRequest('Series are drawn by a look. Choose a look in Settings, Looks first');
    const mark = typeof s.mark === 'string' && s.mark.trim() ? s.mark.trim() : null;
    const problems = eng.seriesProblems({ slug, name: s.name, kind: s.kind, variants: s.variants, ...(mark ? { mark } : {}), markField: s.markField, cadence: s.cadence, ...(s.weekday !== null && s.weekday !== undefined ? { weekday: s.weekday } : {}), nextNumber: s.firstNumber }, s.name, { brief: look });
    if (problems.length) throw badRequest(problems[0]!, problems);
    return { mark, lookRef: s.variants.length ? look.ref : null };
  }

  async function freeSlug(scope: LookScope, name: string): Promise<string> {
    const base = slugify(name).slice(0, 36) || 'series';
    const taken = new Set((await prisma.brandSeries.findMany({ where: { brandId: scope.brandId, slug: { startsWith: base } }, select: { slug: true } })).map((r) => r.slug));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
    throw conflict('Too many series with this name');
  }

  async function create(scope: LookScope, actor: AuditActor & { id: string }, input: SeriesInput) {
    const eng = await seriesEngine();
    const count = await prisma.brandSeries.count({ where: { brandId: scope.brandId } });
    if (count >= eng.SERIES_LIMITS.perBrand) throw conflict(`A brand has at most ${eng.SERIES_LIMITS.perBrand} series`);
    const slug = await freeSlug(scope, input.name);
    const { mark, lookRef } = await check(scope, input, slug);
    const row = await prisma.brandSeries.create({ data: {
      brandId: scope.brandId, slug, name: input.name, kind: input.kind, variants: input.variants, lookRef, mark, markField: input.markField,
      cadence: input.cadence, weekday: input.weekday ?? null, firstNumber: input.firstNumber, enabled: input.enabled, position: count, createdById: actor.id, updatedById: actor.id,
    } });
    await audit(deps, actor, 'series.create', 'series', row.id, { slug, kind: row.kind, cadence: row.cadence });
    return (await views(scope, [row]))[0]!;
  }

  async function update(scope: LookScope, actor: AuditActor & { id: string }, id: string, patch: z.infer<typeof seriesPatch>) {
    const row = await needRow(scope, id);
    const next = {
      name: patch.name ?? row.name, kind: patch.kind ?? row.kind,
      // a new kind starts with no chosen designs, as the old ones belong to the old kind
      variants: patch.variants ?? (patch.kind && patch.kind !== row.kind ? [] : row.variants),
      mark: patch.mark === undefined ? row.mark : patch.mark, markField: patch.markField ?? row.markField, cadence: patch.cadence ?? row.cadence,
      weekday: patch.weekday === undefined ? row.weekday : patch.weekday, firstNumber: patch.firstNumber ?? row.firstNumber,
    };
    const onlyPlacing = Object.keys(patch).every((k) => k === 'enabled' || k === 'position');
    // designs chosen in another look are not judged against this one (they are ignored until new ones are chosen)
    const activeRef = (await active(scope))?.ref ?? null;
    const judged = patch.variants !== undefined || row.lookRef === activeRef ? next.variants : [];
    const checked = onlyPlacing ? { mark: row.mark, lookRef: row.lookRef } : await check(scope, { ...next, variants: judged }, row.slug);
    const data: Prisma.BrandSeriesUpdateInput = { updatedById: actor.id, ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}), ...(patch.position !== undefined ? { position: patch.position } : {}) };
    if (!onlyPlacing) Object.assign(data, { name: next.name, kind: next.kind, variants: next.variants, mark: checked.mark, lookRef: !next.variants.length ? null : judged.length ? checked.lookRef : row.lookRef, markField: next.markField, cadence: next.cadence, weekday: next.weekday, firstNumber: next.firstNumber });
    const saved = await prisma.brandSeries.update({ where: { id: row.id }, data });
    await audit(deps, actor, 'series.update', 'series', row.id, { slug: row.slug, fields: Object.keys(patch) });
    return (await views(scope, [saved]))[0]!;
  }

  // Its posts stay as they are (their words and pictures); they are no longer linked to a series.
  async function remove(scope: LookScope, actor: AuditActor & { id: string }, id: string) {
    const row = await needRow(scope, id);
    await prisma.brandSeries.delete({ where: { id: row.id } });
    await audit(deps, actor, 'series.delete', 'series', row.id, { slug: row.slug });
  }

  // The enabled series as the AI drafter reads them, each with its next number; the chosen designs only when they belong to the look in use.
  async function forDrafting(scope: LookScope): Promise<EngineSeriesShape[]> {
    const look = await active(scope);
    if (!look) return [];
    const rows = (await rowsOf(scope)).filter((r) => r.enabled);
    const n = await numbers(scope, rows);
    return rows.map((r) => toEngine(r, look.ref, n.get(r.id)?.next ?? r.firstNumber));
  }

  // Slug -> id of the brand's series, for an import that names series by slug.
  async function bySlug(scope: LookScope, slugs: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(slugs)];
    if (!unique.length) return new Map();
    const rows = await prisma.brandSeries.findMany({ where: { brandId: scope.brandId, slug: { in: unique } }, select: { id: true, slug: true } });
    return new Map(rows.map((r) => [r.slug, r.id]));
  }

  // A series a post may be put in: one of the brand's. -> the row (null for none).
  async function forPost(scope: LookScope, id: string | null | undefined) {
    if (!id) return null;
    return needRow(scope, id);
  }

  return { list, create, update, remove, forDrafting, bySlug, forPost, views };
}
export type SeriesService = ReturnType<typeof createSeries>;
export const seriesFor = (deps: Pick<Deps, 'prisma'>): SeriesService => createSeries(deps);
