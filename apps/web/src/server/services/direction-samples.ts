// Sample posts that show a design direction in the brand as it would be saved: Settings, Brand, choosing a direction.
//
// The brand's own name and tagline fill a statement; a figure and a list carry neutral example text (direction-sample-content.ts).
// A photo post is shown when the brand has a picture it may use (a Facts photo with a stored file, no rights problem and no
// people in it), or the demo picture when the brand is a pack; otherwise a second statement shows another layout of the direction.
//
// The engine draws with the brand in BRAND_DIR, so the unsaved settings are written out as a pack folder (draftBrandDir) and
// BRAND_DIR points at it while the samples are drawn, inside the render lock. Runs under the lock (one Chrome at a time). Nothing
// is stored: the temporary folder is removed afterwards. A finished set is kept in memory for five minutes.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { VaultItem } from '@prisma/client';
import type { Deps } from '../deps.js';
import { pipelineEngine, type RenderResult } from '../engine/pipeline.js';
import { describeError, logger } from '../log.js';
import { assertInside, safeFileName } from './post-model.js';
import { brandState, draftBrandDir, type BrandSettings } from './brand-settings.js';
import { photosOfDesign, withoutVaultIds } from './design-images.js';
import { SAMPLE_FIGURE, SAMPLE_LIST, sampleHeadline, sampleLabel } from './direction-sample-content.js';
import { rightsProblems } from './vault-rules.js';

type Json = Record<string, unknown>;
const IMAGE_EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
// The engine's synthetic picture (no photograph, person or place), used when the brand is a pack and has no picture of its own.
const DEMO_PICTURE = 'design/assets/demo/scene-market.jpg';

export const SAMPLE_IDS = ['statement', 'figure', 'photo', 'statement-2', 'list'] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];

export interface DirectionSample {
  id: SampleId;
  kind: string;
  variant: number;
  name: string;
  ok: boolean;
  image?: string;
  error?: string;
  warnings: string[];
}
export interface DirectionSamplesResult {
  direction: string;
  logosMissing: boolean;
  cached: boolean;
  samples: DirectionSample[];
}

// ---- the cache: five minutes, twelve entries ----

const CACHE_MS = 5 * 60_000;
const CACHE_MAX = 12;
const cache = new Map<string, { at: number; result: Omit<DirectionSamplesResult, 'cached'> }>();
// For tests: forget every kept set.
export const clearDirectionSamplesCache = (): void => cache.clear();

function cacheGet(key: string): Omit<DirectionSamplesResult, 'cached'> | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) { cache.delete(key); return null; }
  return hit.result;
}
function cacheSet(key: string, result: Omit<DirectionSamplesResult, 'cached'>): void {
  cache.delete(key);
  cache.set(key, { at: Date.now(), result });
  for (const k of [...cache.keys()]) { if (cache.size <= CACHE_MAX) break; cache.delete(k); }
}

// ---- the picture ----

type Picture = { kind: 'vault'; item: VaultItem } | { kind: 'demo' } | null;

// The first photo of Facts the brand may post: stored, not deleted, rights in order, nobody pictured. Else the demo picture for a
// pack, else none.
async function pictureFor(deps: Deps): Promise<Picture> {
  const items = await deps.prisma.vaultItem.findMany({ where: { kind: 'photo', deletedAt: null, fileKey: { not: null } }, orderBy: { createdAt: 'asc' }, take: 25 });
  const item = items.find((i) => !i.peoplePresent && rightsProblems(i).length === 0);
  if (item) return { kind: 'vault', item };
  return brandState().source === 'pack' ? { kind: 'demo' } : null;
}

// ---- the samples ----

interface Plan { id: SampleId; kind: string; variant: number; name: string; design: Json }

function plan(settings: BrandSettings, picture: Picture): Plan[] {
  const label = sampleLabel(settings.name);
  const headline = sampleHeadline(settings.tagline);
  const post = (kind: string, variant: number, fields: Json): Json => ({ template: 'post', kind, variant, label, ...fields });
  const third: Plan = picture
    ? {
        id: 'photo', kind: 'photo', variant: 0, name: 'Photo',
        design: post('photo', 0, { headline, image: picture.kind === 'demo' ? DEMO_PICTURE : `design/assets/photos/vault-${picture.item.id}.jpg`, ...(picture.kind === 'vault' ? { vaultItemId: picture.item.id } : {}) }),
      }
    : { id: 'statement-2', kind: 'statement', variant: 1, name: 'Statement, second layout', design: post('statement', 1, { headline }) };
  return [
    { id: 'statement', kind: 'statement', variant: 0, name: 'Statement', design: post('statement', 0, { headline }) },
    { id: 'figure', kind: 'figure', variant: 0, name: 'Figure', design: post('figure', 0, { ...SAMPLE_FIGURE }) },
    third,
    { id: 'list', kind: 'list', variant: 0, name: 'List', design: post('list', 0, { headline: SAMPLE_LIST.headline, items: [...SAMPLE_LIST.items] }) },
  ];
}

const cacheKey = (settings: BrandSettings, direction: string, p: { updatedAt: Date; logoFullKey: string | null; logoMarkKey: string | null } | null, picture: Picture) =>
  createHash('sha256').update(JSON.stringify([settings, direction, p?.updatedAt.toISOString() ?? null, p?.logoFullKey ?? null, p?.logoMarkKey ?? null,
    picture?.kind === 'vault' ? [picture.item.id, picture.item.updatedAt.toISOString()] : picture?.kind ?? null])).digest('hex');

export async function directionSamples(
  deps: Deps,
  input: { settings: BrandSettings; direction: string },
  // `render` replaces the engine's renderer (tests only; the route never passes it).
  opts: { lock: <T>(fn: () => Promise<T>) => Promise<T>; render?: (options: Record<string, unknown>) => Promise<RenderResult> },
): Promise<DirectionSamplesResult> {
  const { direction } = input;
  // The brand as it would be saved with this direction.
  const settings: BrandSettings = { ...input.settings, style: { ...input.settings.style, direction } };
  const profile = await deps.prisma.brandProfile.findUnique({ where: { id: 'brand' } });
  const none = (): DirectionSamplesResult => ({ direction, logosMissing: true, cached: false, samples: [] });
  // A saved brand without its logos cannot be drawn: say so before anything is written or drawn.
  if (profile && (!profile.logoFullKey || !profile.logoMarkKey)) return none();

  const picture = await pictureFor(deps);
  const key = cacheKey(settings, direction, profile, picture);
  const kept = cacheGet(key);
  if (kept) return { ...kept, cached: true };

  const draft = await draftBrandDir(deps, settings);
  if (draft.logosMissing) return none();

  const engine = await pipelineEngine();
  const runDir = path.join(engine.root, 'out', 'direction-samples', randomUUID());
  const result = await opts.lock(async (): Promise<DirectionSamplesResult> => {
    // The engine reads the brand from BRAND_DIR. Renders are serialised by the lock, so it is pointed at this draft only while the
    // samples are drawn and put back after; a request that validates a design in the meantime may read this brand for a moment.
    const before = process.env.BRAND_DIR;
    process.env.BRAND_DIR = draft.dir;
    try {
      const render = opts.render ?? ((o: Record<string, unknown>) => engine.renderDesignBlock(o));
      const samples: DirectionSample[] = [];
      for (const p of plan(settings, picture)) samples.push(await drawSample(deps, engine, render, runDir, p));
      return { direction, logosMissing: false, cached: false, samples };
    } finally {
      if (before === undefined) delete process.env.BRAND_DIR; else process.env.BRAND_DIR = before;
      await fs.rm(runDir, { recursive: true, force: true });
    }
  });
  if (result.samples.every((s) => s.ok)) cacheSet(key, { direction: result.direction, logosMissing: false, samples: result.samples });
  return result;
}

async function drawSample(
  deps: Deps,
  engine: Awaited<ReturnType<typeof pipelineEngine>>,
  render: (options: Record<string, unknown>) => Promise<RenderResult>,
  runDir: string,
  p: Plan,
): Promise<DirectionSample> {
  const base = { id: p.id, kind: p.kind, variant: p.variant, name: p.name };
  const fail = (error: string, warnings: string[] = []): DirectionSample => ({ ...base, ok: false, error, warnings });
  try {
    const spec = structuredClone(p.design) as Json;
    let n = 0;
    for (const photo of await photosOfDesign(deps, spec)) {
      if (!photo.vaultItemId) continue; // the demo picture is a repository file
      if (!photo.item || photo.item.deletedAt || !photo.item.fileKey) return fail('The picture is no longer in Facts');
      const body = await deps.storage.getObject(photo.item.fileKey);
      const own = path.extname(photo.item.fileName ?? '').toLowerCase();
      const ext = own in engine.imageTypes ? own : (IMAGE_EXT_BY_TYPE[photo.item.contentType ?? ''] ?? '.jpg');
      await fs.mkdir(path.join(runDir, 'in'), { recursive: true });
      const file = assertInside(runDir, path.join(runDir, 'in', `${++n}-${safeFileName(path.basename(photo.item.fileName ?? 'photo', ext))}${ext}`));
      await fs.writeFile(file, body);
      photo.node.image = path.relative(engine.root, file).split(path.sep).join('/');
    }
    const outDir = path.join(runDir, 'out', p.id);
    const r = await render({
      root: engine.root,
      design: withoutVaultIds(spec),
      postId: 'direction-sample',
      stem: `sample-${p.id}`,
      only: ['feed'],
      outDir: path.relative(engine.root, outDir),
    });
    const warnings = [...new Set(r.warnings ?? [])];
    if (!r.ok) return fail(r.error ?? 'The sample could not be made', warnings);
    const file = r.files[0];
    if (!file) return fail('The sample could not be made', warnings);
    const image = `data:image/jpeg;base64,${(await fs.readFile(assertInside(runDir, file.abs))).toString('base64')}`;
    return { ...base, ok: true, image, warnings };
  } catch (err) {
    logger.error('design.direction_sample_failed', describeError(err));
    return fail('The sample could not be made because of an unexpected error');
  }
}
