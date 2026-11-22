// The AI designer in the app: "Redesign with AI" on a batch (the redesign-batch job), the design step of "Draft with AI" (Design: AI-designed),
// and switching a post between its two designs.
//
// The AI composes each single post's design in the look's own schema (packages/ai src/design.mjs); the engine validates it, and a trial render of
// the post with it (strictOwn: no fallback) runs every check of the finished page; one repair round, then the post keeps the look's design. A
// design that passes becomes the post's own design (design.composition), saved through the same edit as a person's (patchPost: the usual checks,
// an approved post goes back to draft, the images are made again). The design it replaces, with its images copied under keys of their own, is
// kept on the post (designAlt) so a person can switch back per post, and compare the two side by side. The words never change here.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Prisma, type Post } from '@prisma/client';
import { z } from 'zod';
import type { DesignPostInput } from '../ai.js';
import { audit } from '../audit.js';
import type { Deps } from '../deps.js';
import { pipelineEngine } from '../engine/pipeline.js';
import { HttpError } from '../http.js';
import { logger, describeError } from '../log.js';
import { privateKey } from '../storage/types.js';
import { enqueueTracked, readableError, trackRun, type RunHandle, noHandle } from './activity.js';
import { aiFor } from './ai-jobs.js';
import { problemsOf, renderTitle } from './batches.js';
import { attachGraphics, copyVaultFile, photosOfDesign, withoutVaultIds } from './design-images.js';
import { DEFAULT_BRAND_ID } from './looks.js';
import { brandState, syncBrand } from './brand-settings.js';
import { asMedia, type MediaEntry } from './post-model.js';
import { loadPost, patchPost } from './posts.js';
import { DESIGN_WARNING_PREFIX } from './render.js';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
type Actor = { id: string; email?: string | null };

// The post's other design: the whole design as it was, the render entries of its images (copied under keys of their own), its design
// warnings, and when it was kept.
export interface DesignAlt { design: Json; media: MediaEntry[]; warnings: string[]; savedAt: string }
export const asAlt = (v: unknown): DesignAlt | null => (isObj(v) && isObj(v.design) ? { design: v.design, media: asMedia(v.media), warnings: Array.isArray(v.warnings) ? v.warnings.filter((w): w is string => typeof w === 'string') : [], savedAt: typeof v.savedAt === 'string' ? v.savedAt : '' } : null);
// Whether a design is the post's own (AI-designed or edited from one), and the design without that choice (its words, picture and kind).
export const isOwnDesign = (d: unknown): boolean => isObj(d) && isObj(d.composition);
const wordsOf = (d: Json): Json => { const { composition: _c, variant: _v, ...rest } = d; return rest; };
const canon = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null');

// ---- keeping a design's images ----
// Copies the images a render made under keys of their own (alt-<random>-...), so a later render of the post never overwrites them.
async function keepRenders(deps: Pick<Deps, 'storage'>, post: Pick<Post, 'batchId' | 'postKey' | 'media'>): Promise<MediaEntry[]> {
  const out: MediaEntry[] = [];
  const tag = randomUUID().slice(0, 8);
  for (const m of asMedia(post.media).filter((x) => x.source === 'render')) {
    try {
      const body = await deps.storage.getObject(m.key);
      const key = privateKey('renders', post.batchId, post.postKey, `alt-${tag}-${path.posix.basename(m.key)}`);
      await deps.storage.putObject(key, body, m.contentType);
      out.push({ ...m, key });
    } catch (err) {
      logger.warn('design.keep_render_failed', { postKey: post.postKey, error: describeError(err) });
      return [];
    }
  }
  return out;
}
const dropObjects = (deps: Pick<Deps, 'storage'>, media: MediaEntry[]) => Promise.all(media.map((m) => deps.storage.deleteObject(m.key).catch(() => undefined)));

// Gives a post its own design (a composition the engine validated and a trial render passed), keeping the design it had and its images.
// Saved as an edit by `actor` (patchPost): the batch's checks run, an approval is taken back, the images are made again.
export async function applyOwnDesign(deps: Deps, actor: Actor & { id: string }, postId: string, composition: Json): Promise<Post> {
  const post = await loadPost(deps, postId);
  if (!isObj(post.design) || post.design.template !== 'post') throw new HttpError(409, 'Only a single post drawn by the look can have its own design');
  const current = post.design as Json;
  const before = asAlt(post.designAlt);
  const kept = await keepRenders(deps, post);
  const alt: DesignAlt = { design: current, media: kept, warnings: post.warnings.filter((w) => w.startsWith(DESIGN_WARNING_PREFIX)), savedAt: deps.now().toISOString() };
  await deps.prisma.post.update({ where: { id: post.id }, data: { designAlt: alt as unknown as Prisma.InputJsonValue } });
  try {
    const updated = await patchPost(deps, { id: actor.id, email: actor.email ?? null }, post.id, { design: { ...current, composition } });
    if (before) await dropObjects(deps, before.media);
    return updated;
  } catch (e) {
    await deps.prisma.post.update({ where: { id: post.id }, data: { designAlt: (post.designAlt ?? Prisma.DbNull) as Prisma.InputJsonValue } });
    await dropObjects(deps, kept);
    throw e;
  }
}

// Switches a post to its other design: the look's design back for an AI-designed post, or the AI's again. The words stay as they are now (an
// edit since the switch is kept); the other design's images are used when the words are the same as when they were made, else the post is
// drawn again. The design it leaves becomes the other one. A change of what the post shows takes an approval back, as every edit does.
export async function switchDesign(deps: Deps, actor: Actor & { id: string }, postId: string): Promise<Post> {
  const post = await loadPost(deps, postId);
  if (post.status === 'removed') throw new HttpError(409, 'This post has been removed. Restore it first');
  const alt = asAlt(post.designAlt);
  if (!alt || !isObj(post.design)) throw new HttpError(409, 'This post has no other design to switch to');
  const current = post.design as Json;
  const next: Json = { ...wordsOf(current), ...(alt.design.variant !== undefined ? { variant: alt.design.variant } : {}), ...(isObj(alt.design.composition) ? { composition: alt.design.composition } : {}) };
  const errors = await problemsOf(post.batch, [{ postKey: post.postKey, title: post.title, date: post.date, time: post.time, caption: post.caption, networks: post.networks as Json, design: next, sources: post.sources, warnings: [] }], deps);
  if (errors.length) throw new HttpError(422, 'The other design cannot be used now', [...new Set(errors)]);
  const sameWords = canon(wordsOf(alt.design)) === canon(wordsOf(current)) && alt.media.length > 0;
  const kept = await keepRenders(deps, post);
  const media = asMedia(post.media);
  const leaving = media.filter((m) => m.source === 'render');
  const designWarnings = post.warnings.filter((w) => w.startsWith(DESIGN_WARNING_PREFIX));
  const newAlt: DesignAlt = { design: current, media: kept, warnings: designWarnings, savedAt: deps.now().toISOString() };
  const wasApproved = post.status === 'approved';
  await deps.prisma.post.update({
    where: { id: post.id },
    data: {
      design: next as Prisma.InputJsonValue, designAlt: newAlt as unknown as Prisma.InputJsonValue,
      ...(sameWords
        ? { media: [...alt.media, ...media.filter((m) => m.source !== 'render')] as unknown as Prisma.InputJsonValue, renderStatus: 'ok', renderError: null, warnings: [...post.warnings.filter((w) => !w.startsWith(DESIGN_WARNING_PREFIX)), ...alt.warnings] }
        : { renderStatus: 'queued', renderError: null }),
      ...(wasApproved ? { status: 'draft', approvedById: null, approvedAt: null } : {}),
    },
  });
  // the images of the design it leaves were copied into the other design; the originals are no longer used (a queued render replaces them)
  if (sameWords) await dropObjects(deps, leaving);
  else await dropObjects(deps, alt.media);
  await audit(deps, actor, 'post.update', 'post', post.id, { postKey: post.postKey, fields: ['design'], switched: isOwnDesign(next) ? 'to its own design' : "to the look's design" });
  if (wasApproved) await audit(deps, actor, 'post.unapprove', 'post', post.id, { postKey: post.postKey, auto: true, reason: 'Switched to the other design' });
  if (!sameWords) await enqueueTracked(deps, 'render-post', { postId: post.id }, { singletonKey: post.id }, { title: renderTitle(post.title), actorId: actor.id, batchId: post.batchId, postId: post.id });
  return deps.prisma.post.findUniqueOrThrow({ where: { id: post.id } });
}

// ---- the redesign ----
export const redesignPayload = z.object({ batchId: z.string().uuid(), actorId: z.string().min(1), postIds: z.array(z.string().uuid()).min(1).max(40).optional(), activityId: z.string().optional() });

export function runRedesign(deps: Deps, rawPayload: unknown): Promise<{ designed: number; of: number }> {
  const payload = redesignPayload.parse(rawPayload);
  return trackRun(deps, 'redesign-batch', payload, async () => {
    const batch = await deps.prisma.batch.findUnique({ where: { id: payload.batchId }, select: { title: true } });
    return { title: `Redesign with AI: ${batch?.title ?? 'a batch'}`, actorId: payload.actorId, batchId: batch ? payload.batchId : null };
  }, (handle) => redesignNow(deps, payload, handle));
}

// The single posts of a batch the designer takes: drawn by the look (template post), not removed.
const designable = (p: Post): boolean => p.status !== 'removed' && isObj(p.design) && p.design.template === 'post';

export async function redesignNow(deps: Deps, payload: { batchId: string; actorId: string; postIds?: string[] }, handle: RunHandle = noHandle, runId: string = randomUUID()): Promise<{ designed: number; of: number }> {
  const actor = await deps.prisma.user.findUnique({ where: { id: payload.actorId } });
  if (!actor || actor.disabled) throw new Error('The person who asked for the redesign no longer has access');
  const posts = (await deps.prisma.post.findMany({ where: { batchId: payload.batchId, ...(payload.postIds ? { id: { in: payload.postIds } } : {}) }, orderBy: { position: 'asc' } })).filter(designable).slice(0, 40);
  if (!posts.length) throw new Error('This batch has no single posts the look draws, so there is nothing to design (carousels and classic layouts keep their designs)');
  const { ai, config } = await aiFor(deps, 'draft', { runId, actorId: actor.id }, handle);
  const engine = await pipelineEngine();
  const runDir = path.join(engine.root, 'out', 'app-design', randomUUID());
  const specs = new Map<string, Json>();
  const skipped: Array<{ postKey: string; reasons: string[] }> = [];
  let trials = 0;
  try {
    await fs.mkdir(runDir, { recursive: true });
    handle.progress({ step: 'Reading the pictures', done: 0, total: posts.length });
    const input: DesignPostInput[] = [];
    let n = 0;
    for (const post of posts) {
      const { composition: _own, ...spec } = structuredClone(post.design) as Json;
      // the post's vault photos are copied next to this run, so the picture can be looked at and the trial drawn (as the render job does)
      let missing = '';
      for (const photo of await photosOfDesign(deps, spec)) {
        if (!photo.vaultItemId) continue;
        if (!photo.item || photo.item.deletedAt || !photo.item.fileKey) { missing = 'a vault photo of the post is missing'; break; }
        photo.node.image = await copyVaultFile(deps, photo.item, runDir, ++n);
      }
      if (missing) { skipped.push({ postKey: post.postKey, reasons: [missing] }); continue; }
      specs.set(post.id, spec);
      let picture: DesignPostInput['picture'];
      if (typeof spec.image === 'string') {
        try { picture = await engine.probePicture({ root: engine.root, file: spec.image }); } catch (err) { logger.warn('design.probe_failed', { postKey: post.postKey, error: describeError(err) }); }
      }
      input.push({ id: post.id, design: withoutVaultIds(spec), ...(picture ? { picture } : {}) });
    }
    // the trial: the post drawn with the design, every check of the finished page, no fallback
    const check = async (id: string, composition: Json): Promise<string[]> => {
      const base = specs.get(id);
      if (!base) return ['the post is not part of this redesign'];
      const trial: Json = { ...structuredClone(base), composition };
      const issues = await attachGraphics(deps, trial, { runDir, brandId: DEFAULT_BRAND_ID });
      if (issues.length) return issues;
      handle.progress({ step: 'Checking a design on the page' });
      const r = await engine.renderDesignBlock({ root: engine.root, design: withoutVaultIds(trial), postId: `trial-${++trials}`, outDir: path.relative(engine.root, path.join(runDir, 'trial')), strictOwn: true });
      return r.ok ? [] : [r.error ?? 'the design could not be drawn'];
    };
    let result;
    try {
      result = await ai.designBatch({ posts: input, check, onProgress: (p) => handle.progress(p) });
    } finally {
      await config.flush();
    }
    handle.progress({ step: 'Saving the designs', done: 0, total: result.results.length });
    let designed = 0;
    for (const r of result.results) {
      const post = posts.find((p) => p.id === r.id);
      if (!post) continue;
      if (!r.composition) { skipped.push({ postKey: post.postKey, reasons: r.reasons.slice(0, 3) }); continue; }
      try {
        await applyOwnDesign(deps, { id: actor.id, email: actor.email }, post.id, r.composition);
        designed++;
      } catch (e) {
        skipped.push({ postKey: post.postKey, reasons: [readableError(e).slice(0, 300)] });
      }
    }
    await deps.prisma.aiCall.updateMany({ where: { runId }, data: { batchId: payload.batchId } });
    const notes = (result.notes ?? {}) as Json;
    await audit(deps, { id: actor.id, email: actor.email }, 'ai.redesign_batch', 'batch', payload.batchId, { runId, designed, of: posts.length, promptVersion: notes.promptVersion ?? null });
    handle.result({ batchId: payload.batchId, designed, of: posts.length, skipped: skipped.slice(0, 20), promptVersion: notes.promptVersion ?? null, usage: notes.usage ?? null });
    return { designed, of: posts.length };
  } finally {
    await fs.rm(runDir, { recursive: true, force: true });
  }
}

// ---- editing a post's own design (the design editor, opened from the post) ----
interface EngineOwn { loadLook(o: { root: string }): Json | null }
interface EngineLookMod { validateLook(look: unknown, where?: string): string[]; lookWithOwnDesign(look: unknown, comp: unknown): Json }
interface EngineDraw {
  renderImage(browser: unknown, brand: Json, job: { spec: Json; sizeName: string; outFile: string }, o: { tmpDir: string; quality?: number }): Promise<{ warnings: string[]; els?: Array<{ el: string; x0: number; y0: number; x1: number; y1: number }> }>;
  DesignError: new (...a: never[]) => Error;
}
const engineMods = async () => {
  const { engineImport } = await import('../engine/root.js');
  const [brand, look, render, chrome, spec] = await Promise.all([
    engineImport<EngineOwn & { loadBrand(o: { root: string; file?: string }): Json }>('design/brand'), engineImport<EngineLookMod>('design/look'), engineImport<EngineDraw>('design/render'),
    engineImport<{ Browser: { launch(o: { chromePath?: string | null }): Promise<{ close(): void }> }; findChrome(): string | null }>('design/chrome'), engineImport<{ normaliseDesign(d: Json): Json }>('design/spec'),
  ]);
  return { brand, look, render, chrome, spec };
};
export interface OwnDesignProblem { path: string; message: string }
// What the engine says about a post's own design, as the design editor shows a look's: `look "<id>": compositions[0].<path> <message>`.
export async function ownDesignProblems(deps: Deps, postId: string, composition: unknown): Promise<OwnDesignProblem[]> {
  const post = await loadPost(deps, postId);
  if (!isObj(post.design) || post.design.template !== 'post') throw new HttpError(409, 'Only a single post drawn by the look can have its own design');
  if (!isObj(composition)) throw new HttpError(400, 'A design must be an object');
  if (composition.kind !== post.design.kind) throw new HttpError(400, `A post's design keeps the post's kind (${String(post.design.kind)})`);
  if (JSON.stringify(composition).length > 64 * 1024) throw new HttpError(400, 'The design is too large');
  await syncBrand(deps);
  const engine = await pipelineEngine();
  const { brand, look } = await engineMods();
  const active = brand.loadLook({ root: engine.root });
  if (!active) throw new HttpError(409, 'The brand has no look in use, so a post cannot have its own design');
  const problems = look.validateLook(look.lookWithOwnDesign(active, composition), 'look').filter((p) => p.includes('compositions[0]') || !/compositions\[\d+\]/.test(p));
  return problems.slice(0, 30).map((message) => { const m = /^[^:]*: ([A-Za-z0-9_.[\]]+) /.exec(message); return { path: m ? m[1]! : 'definition', message }; });
}

// The real picture of a post's own design, drawn with the post's own words and picture (and every check), with the rectangle of each element
// for the editor's handles. Nothing is stored. -> { image?, rects, warnings, problems }
export async function previewOwnDesign(deps: Deps, postId: string, composition: unknown) {
  const problems = await ownDesignProblems(deps, postId, composition);
  if (problems.length) return { rects: [], warnings: [], problems };
  const post = await loadPost(deps, postId);
  const engine = await pipelineEngine();
  const mods = await engineMods();
  const runDir = path.join(engine.root, 'out', 'app-design', randomUUID());
  let browser: { close(): void } | null = null;
  try {
    const spec: Json = { ...structuredClone(post.design as Json), composition: composition as Json };
    let n = 0;
    for (const photo of await photosOfDesign(deps, spec)) {
      if (!photo.vaultItemId) continue;
      if (!photo.item || photo.item.deletedAt || !photo.item.fileKey) return { rects: [], warnings: [], problems: [{ path: 'definition', message: 'A vault photo of the post is missing' }] };
      photo.node.image = await copyVaultFile(deps, photo.item, runDir, ++n);
    }
    const issues = await attachGraphics(deps, spec, { runDir, brandId: DEFAULT_BRAND_ID });
    if (issues.length) return { rects: [], warnings: [], problems: issues.map((message) => ({ path: 'definition', message })) };
    const chromePath = mods.chrome.findChrome();
    if (!chromePath) throw new HttpError(503, 'Chrome is not installed on this server, so pictures cannot be drawn');
    const state = brandState();
    const brand = mods.brand.loadBrand({ root: engine.root, file: path.join(engine.root, state.dir, 'brand.json') });
    browser = await mods.chrome.Browser.launch({ chromePath });
    const outFile = path.join(runDir, 'preview.jpg');
    try {
      const r = await mods.render.renderImage(browser, brand, { spec: mods.spec.normaliseDesign(withoutVaultIds(spec) as Json), sizeName: 'feed', outFile }, { tmpDir: path.join(runDir, 'tmp'), quality: 80 });
      const image = `data:image/jpeg;base64,${(await fs.readFile(outFile)).toString('base64')}`;
      const rects = (r.els ?? []).filter((e) => /^[0-9]+(\.[0-9]+)*$/.test(e.el)).slice(0, 200).map((e) => ({ el: e.el, x: Math.round(e.x0 * 10) / 10, y: Math.round(e.y0 * 10) / 10, w: Math.round((e.x1 - e.x0) * 10) / 10, h: Math.round((e.y1 - e.y0) * 10) / 10, rot: 0 }));
      return { image, rects, warnings: r.warnings.slice(0, 30).map((w) => String(w).slice(0, 300)), problems: [] };
    } catch (e) {
      if (e instanceof mods.render.DesignError) return { rects: [], warnings: [], problems: [{ path: 'definition', message: String((e as Error).message).slice(0, 400) }] };
      throw e;
    }
  } finally {
    browser?.close();
    await fs.rm(runDir, { recursive: true, force: true });
  }
}

// What the design editor opens a post's design with: the engine's catalogue, the look's settings (the look in use, without its designs), the
// post's own design, or for a post drawn by a design of the look, that design as the starting point. Any signed-in editor may read it.
export async function ownDesignStart(deps: Deps, postId: string) {
  const post = await loadPost(deps, postId);
  if (!isObj(post.design) || post.design.template !== 'post') throw new HttpError(409, 'Only a single post drawn by the look can have its own design');
  await syncBrand(deps);
  const engine = await pipelineEngine();
  const { brand } = await engineMods();
  const look = brand.loadLook({ root: engine.root });
  if (!look) throw new HttpError(409, 'The brand has no look in use, so a post cannot have its own design');
  const lookMod = await import('../engine/root.js').then((r) => r.engineImport<{ lookCatalogue(): Json; lookBrief(l: unknown): Json; LIMITS: Json }>('design/look'));
  const dirs = await import('../engine/root.js').then((r) => r.engineImport<{ postCompositionGraphics(look: unknown, spec: unknown): { variant: number } | null }>('design/directions/index'));
  const { compositions, ...settings } = look as Json & { compositions?: Json[] };
  let start: Json | null = isObj(post.design.composition) ? (post.design.composition as Json) : null;
  if (!start) {
    const plain = withoutVaultIds(post.design) as Json;
    const chosen = dirs.postCompositionGraphics(look, plain);
    const kind = (post.design as Json).kind;
    const ofKind = (Array.isArray(compositions) ? compositions : []).filter((c) => isObj(c) && c.kind === kind);
    start = chosen ? (ofKind[chosen.variant] ?? null) : (ofKind[0] ?? null);
  }
  return { postId: post.id, title: post.title, kind: String(post.design.kind), own: isOwnDesign(post.design), composition: start, settings, catalogue: lookMod.lookCatalogue(), lookName: typeof look.name === 'string' ? look.name : '' };
}

// Saves a post's own design from the design editor: checked first, then saved through the same edit as any (the images are made again, an
// approval is taken back). A post that had the look's design keeps it as its other design, so a person can switch back.
export async function saveOwnDesign(deps: Deps, actor: Actor & { id: string }, postId: string, composition: unknown): Promise<Post> {
  const problems = await ownDesignProblems(deps, postId, composition);
  if (problems.length) throw new HttpError(422, 'The design is not valid', problems.map((p) => p.message));
  const post = await loadPost(deps, postId);
  if (!isOwnDesign(post.design)) return applyOwnDesign(deps, actor, postId, composition as Json);
  return patchPost(deps, { id: actor.id, email: actor.email ?? null }, postId, { design: { ...(post.design as Json), composition: composition as Json } });
}

// A person asks for a redesign of a batch (or of some of its posts): the job is queued, one at a time per batch.
export async function requestRedesign(deps: Deps, actor: Actor & { id: string }, batchId: string, postIds?: string[]) {
  const batch = await deps.prisma.batch.findUnique({ where: { id: batchId }, include: { posts: true } });
  if (!batch) throw new HttpError(404, 'Batch not found');
  const posts = batch.posts.filter(designable).filter((p) => !postIds || postIds.includes(p.id));
  if (!posts.length) throw new HttpError(409, 'This batch has no single posts the look draws, so there is nothing to design');
  return enqueueTracked(deps, 'redesign-batch', { batchId, actorId: actor.id, ...(postIds ? { postIds } : {}) }, { singletonKey: `redesign-batch:${batchId}` }, { title: `Redesign with AI: ${batch.title}`, actorId: actor.id, batchId });
}
