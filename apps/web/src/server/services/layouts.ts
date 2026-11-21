// A brand's own layouts (Settings, Layouts): compositions stored as data and checked by the engine's own layout validator
// (packages/engine/lib/design/layout.mjs) before they are stored, again when the brand pack is written (validateBrand), and once
// more when a page is drawn. People and the AI never write markup or CSS here: a layout is numbers in bounds and names from the
// engine's fixed lists.
//
// The enabled layouts reach the engine through the brand pack: syncBrand (brand-settings.ts) writes them into brand.json
// "layouts" (layoutsForBrand). A preview renders one layout with sample words through the same renderer and checks as a post.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrandLayout } from '@prisma/client';
import type { Deps } from '../deps.js';
import { engineImport } from '../engine/root.js';
import { pipelineEngine } from '../engine/pipeline.js';
import { describeError, logger } from '../log.js';

type Json = Record<string, unknown>;

// The engine's layoutCatalogue(): every page kind a brand's layout may use, its block types, options, fields, conditions and
// grounds, as plain data. The server passes it to Settings, Layouts as it is (web/src/pages/settings/layout-types.ts types it);
// nothing here reads it.
export type LayoutCatalogue = Record<string, unknown> & { pages: Record<string, unknown> };

interface EngineLayout {
  LAYOUT_ID: RegExp;
  FIELDS: Record<string, { kind: string; cap?: number; max?: number; chars?: number; word: string }>;
  loadLayouts(opts?: { root?: string }): unknown[];
  layoutSizes(l: unknown): string[];
  MAX_LAYOUTS: number;
  validateLayout(l: unknown, where?: string): string[];
  validateLayouts(list: unknown, where?: string): string[];
  layoutDesignProblems(d: unknown, where: string, opts: { layouts: unknown[]; series?: string[] }): string[];
  sampleDesign(l: unknown, opts?: { size?: string; artefact?: string }): Json;
  layoutCatalogue(): LayoutCatalogue;
}
// A built-in layout as Settings, Layouts lists it (the engine's lib/design/layout-starters.mjs builtinLayouts): read only; a brand
// copies it into a layout of its own (builtinCopy) when `copyable`, else `why` says why not.
export interface BuiltinLayoutEntry { template: string; variant: string | null; copyable: boolean; why: string | null; layout: Json }
interface EngineStarters {
  STARTER_LAYOUTS: Json[];
  starterCopy(id: string, opts?: { newId?: string; name?: string }): Json | null;
  builtinLayouts(): BuiltinLayoutEntry[];
  builtinCopy(id: string, opts?: { newId?: string; name?: string }): Json | null;
}

let loaded: Promise<{ layout: EngineLayout; starters: EngineStarters }> | null = null;
export function layoutEngine() {
  loaded ??= (async () => ({
    layout: await engineImport<EngineLayout>('design/layout'),
    starters: await engineImport<EngineStarters>('design/layout-starters'),
  }))();
  return loaded;
}

export const MAX_LAYOUTS = 40;

// What is wrong with a layout, in the engine's words ("layout" is the prefix of every message).
export async function layoutProblems(definition: unknown): Promise<string[]> {
  return (await layoutEngine()).layout.validateLayout(definition, 'layout');
}

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

// The enabled layouts, in order, as brand.json "layouts" takes them. A stored layout that no longer passes the engine's
// validator (an engine upgrade tightened a rule) is left out and logged, so it can never stop the brand from being written.
export async function layoutsForBrand(deps: Pick<Deps, 'prisma'>, rows?: BrandLayout[]): Promise<Json[]> {
  const list = rows ?? await deps.prisma.brandLayout.findMany({ where: { enabled: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], take: MAX_LAYOUTS });
  const { layout } = await layoutEngine();
  const out: Json[] = [];
  for (const r of list.filter((x) => x.enabled).slice(0, MAX_LAYOUTS)) {
    const problems = layout.validateLayout(r.definition, 'layout');
    if (problems.length || !isObj(r.definition)) { logger.warn('layout.skipped', { slug: r.slug, problems: problems.slice(0, 5) }); continue; }
    out.push(r.definition);
  }
  return out;
}

// The layouts a brand file would end with: the stored ones first, then those the pack (or its Advanced fragment) already had,
// unless one of the stored ones has the same id; at most MAX_LAYOUTS.
export function mergeLayouts(stored: Json[], existing: unknown): Json[] {
  const own = new Set(stored.map((l) => l.id));
  const rest = Array.isArray(existing) ? existing.filter((l): l is Json => isObj(l) && !own.has(l.id)) : [];
  return [...stored, ...rest].slice(0, MAX_LAYOUTS);
}

export interface PreviewResult { ok: boolean; image?: string; size: string; error?: string; warnings: string[]; notes: string[] }

// One layout drawn with sample words (or the words given) at one size, through the engine's renderer and every one of its
// checks, as a JPEG data URL. Runs under the render lock (one Chrome at a time); nothing is stored.
// empty: fields of the layout left out of the sample (as a post that leaves them empty); artefact: the sample artefact's type.
export async function previewLayout(deps: Deps, definition: Json, opts: { size?: string; sample?: Json; empty?: string[]; artefact?: string; lock: <T>(fn: () => Promise<T>) => Promise<T> }): Promise<PreviewResult> {
  const engine = await pipelineEngine();
  const { layout } = await layoutEngine();
  const sizes = isObj(definition.canvas) ? Object.keys(definition.canvas) : [];
  const size = opts.size && sizes.includes(opts.size) ? opts.size : (sizes.includes('feed') ? 'feed' : sizes[0] ?? 'feed');
  const design: Json = { ...layout.sampleDesign(definition, { size, artefact: opts.artefact }), ...(opts.sample ?? {}), template: 'layout', layout: definition.id, sizes: [size] };
  const fields = isObj(definition.fields) ? Object.keys(definition.fields) : [];
  for (const f of opts.empty ?? []) if (fields.includes(f)) delete design[f];
  const dir = path.join(engine.root, 'out', 'layout-preview', randomUUID());
  return opts.lock(async () => {
    try {
      const r = await engine.renderDesignBlock({ root: engine.root, design, layouts: [definition], postId: 'preview', stem: 'preview', outDir: path.relative(engine.root, dir) });
      if (!r.ok) return { ok: false, size, error: r.error ?? 'The preview could not be made', warnings: r.warnings, notes: r.notes };
      const body = await fs.readFile(r.files[0].abs);
      return { ok: true, size, image: `data:image/jpeg;base64,${body.toString('base64')}`, warnings: r.warnings, notes: r.notes };
    } catch (err) {
      logger.error('layout.preview_failed', describeError(err));
      return { ok: false, size, error: 'The preview could not be made because of an unexpected error', warnings: [], notes: [] };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
}

// A free slug like the one asked for: "name", "name-2", "name-3" ...
export async function freeSlug(deps: Pick<Deps, 'prisma'>, wanted: string): Promise<string> {
  const base = (wanted.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34) || 'layout').replace(/^-/, '');
  const taken = new Set((await deps.prisma.brandLayout.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${randomUUID().slice(0, 4)}`;
}

export interface LayoutBrief {
  id: string; name: string; description: string | null; sizes: string[];
  fields: Array<{ name: string; kind: string; required: boolean; max: number | null; min: number | null; word: string }>;
}

// The layouts the brand in force has (brand.json "layouts" of the pack the engine reads), for the post editor: what a person
// fills in for each. Only layouts the engine's validator accepts are listed.
export async function layoutBriefs(): Promise<LayoutBrief[]> {
  const { layout } = await layoutEngine();
  const engine = await pipelineEngine();
  return (layout.loadLayouts({ root: engine.root }) as Json[]).filter((l) => !layout.validateLayout(l).length).map((l) => {
    const fields = (isObj(l.fields) ? l.fields : {}) as Record<string, { required?: boolean; max?: number; min?: number }>;
    return {
      id: String(l.id), name: String(l.name), description: typeof l.description === 'string' ? l.description : null, sizes: layout.layoutSizes(l),
      fields: Object.entries(fields).map(([name, f]) => {
        const F = layout.FIELDS[name];
        const list = F.kind === 'stats' || F.kind === 'items';
        return { name, kind: F.kind, required: f.required === true || (list && (f.min ?? 0) > 0), max: f.max ?? F.max ?? null, min: list ? f.min ?? null : null, word: F.word };
      }),
    };
  });
}
