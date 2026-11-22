// The look renderer: draws a look with the engine (packages/engine: renderImage under the one Chrome) for the Looks pages.
//
//   preview            one picture per kind (the first design of the kind, sample copy), cached by look hash + brand hash
//   previewComposition one design of a look, a draft swapped in, with sample, stress or minimal copy, and the rectangle of every
//                      element that has an address (postMetrics().els); nothing is cached (drafts change at every key)
//   gate               every given design drawn with sample, stress and minimal copy; one check per scenario
//
// Every Chrome run goes through the render queue (render-queue.ts): class `preview` (a newer request from the same person for the same
// look replaces one still waiting) or `gate`, and under the engine's single Chrome lock. The brand is the one in force (the pack
// syncBrand wrote: its colours, fonts and logo), with the look given in place of its active one. A look and its text are data: the
// engine validates the look (resolveLook) and the design (validateDesign) and builds the page; nothing here writes markup.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Deps } from '../deps.js';
import { pipelineEngine } from '../engine/pipeline.js';
import { engineImport } from '../engine/root.js';
import { describeError, logger } from '../log.js';
import { brandState, syncBrand } from './brand-settings.js';
import { ATTEMPTS, copyFor, type CopyScenario } from './look-copy.js';
import {
  lookEngine, setLookRenderer, type CompositionPreview, type CompositionPreviewRequest, type CompositionRect, type GateCheck, type GateRenderRequest,
  type LookBrief, type LookRenderer, type PreviewRequest, type PreviewSample,
} from './looks.js';
import { submit } from './render-queue.js';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

interface EngineBrandMod { loadBrand(o: { root: string; file: string }): Json & { style: Json } }
interface EngineChrome { Browser: { launch(o: { chromePath?: string | null; lockFile: string }): Promise<{ close(): void }> }; findChrome(): string | null; NO_CHROME: string }
interface EngineRenderMod {
  renderImage(browser: unknown, brand: Json, job: { spec: Json; sizeName: string; outFile: string }, o: { tmpDir: string; quality?: number }): Promise<{ warnings: string[]; notes: string[]; post?: { variant: number; fellBackFrom?: string | null }; els?: Array<{ el: string; x0: number; y0: number; x1: number; y1: number }> }>;
  DesignError: new (...a: never[]) => Error;
}
interface EngineSpecMod { normaliseDesign(d: Json): Json; validateDesign(d: Json, where: string, o: { look?: Json }): string[] }
interface EngineLooks { lookHash(look: unknown): string }

const modules = (): Promise<{ brand: EngineBrandMod; chrome: EngineChrome; render: EngineRenderMod; spec: EngineSpecMod }> =>
  Promise.all([engineImport<EngineBrandMod>('design/brand'), engineImport<EngineChrome>('design/chrome'), engineImport<EngineRenderMod>('design/render'), engineImport<EngineSpecMod>('design/spec')])
    .then(([brand, chrome, render, spec]) => ({ brand, chrome, render, spec }));

// ---- limits ----------------------------------------------------------------------------------------------------------------

export const SAMPLE_CACHE_MAX = 64;          // pictures kept (a few hundred KB at most each)
export const PREVIEW_WAIT_MS = 60_000;       // a preview that waits longer than this in the queue is dropped
export const GATE_WAIT_MS = 5 * 60_000;      // a gate that waits longer than this in the queue is dropped
export const GATE_RUN_MS = 150_000;          // once running, a gate stops starting new pictures after this long
const JPEG_QUALITY = 80;

// ---- the brand ---------------------------------------------------------------------------------------------------------------

// A hash of what a brand's look of a page depends on: the brand file without its looks and direction (the folder name in its paths
// is replaced), and the files of the pack (logos, fonts). Memoised by folder: a folder never changes once written.
const brandKeys = new Map<string, string>();
function brandKeyOf(root: string, dir: string): string {
  const hit = brandKeys.get(dir);
  if (hit) return hit;
  const abs = path.join(root, dir);
  const raw = JSON.parse(fs.readFileSync(path.join(abs, 'brand.json'), 'utf8')) as Json;
  delete raw.looks;
  if (isObj(raw.style)) delete raw.style.direction;
  const h = createHash('sha256').update(JSON.stringify(raw).split(path.basename(dir)).join('PACK'));
  const walk = (d: string, depth: number) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = path.join(d, e.name);
      if (e.isDirectory() && depth < 3) walk(f, depth + 1);
      else if (e.isFile() && e.name !== 'brand.json') h.update(path.relative(abs, f)).update(fs.readFileSync(f));
    }
  };
  walk(abs, 0);
  const key = h.digest('hex').slice(0, 20);
  if (brandKeys.size >= 16) brandKeys.clear();
  brandKeys.set(dir, key);
  return key;
}

interface BrandForLook { brand: Json; key: string; placeholderLogo: boolean }
// The brand in force with `look` as its design direction. A shipped look is drawn as a copy of itself, as a brand carries it.
async function brandFor(deps: Deps, look: Json): Promise<BrandForLook> {
  const { brand: eb } = await modules();
  const engine = await pipelineEngine();
  await syncBrand(deps);
  const state = brandState();
  const base = eb.loadBrand({ root: engine.root, file: path.join(engine.root, state.dir, 'brand.json') });
  const own = look.origin === 'shipped' ? { ...look, origin: `copy:shipped:${String(look.id)}` } : look;
  return { brand: { ...base, looks: [own], style: { ...base.style, direction: String(look.id) } }, key: brandKeyOf(engine.root, state.dir), placeholderLogo: state.logosMissing };
}

// ---- drawing -----------------------------------------------------------------------------------------------------------------

// `fill`: the share of each field's stated limit the copy used (the stress copy may have to give some up)
export interface Drawn { ok: boolean; image?: string; warnings: string[]; error?: string; rects: CompositionRect[]; busy?: boolean; fill?: number }
interface DrawJob { kind: string; index: number; scenario: CopyScenario; draft?: undefined }

const BUSY = /another design run is already using chrome/i;

// Draws each job with ONE Chrome. `stop()` (checked before each picture) ends the run early: the rest are `skipped`.
async function drawJobs(deps: Deps, look: Json, jobs: DrawJob[], opts: { withRects: boolean; stop?: () => boolean; brand?: BrandForLook }): Promise<Array<Drawn | null>> {
  const { chrome, render, spec } = await modules();
  const engine = await pipelineEngine();
  const bl = opts.brand ?? await brandFor(deps, look);
  const briefs = (await lookEngine()).lookBrief(look) as LookBrief;
  const runDir = path.join(engine.root, 'out', 'look-render', randomUUID());
  const out: Array<Drawn | null> = jobs.map(() => null);
  let browser: { close(): void } | null = null;
  try {
    const chromePath = chrome.findChrome();
    if (!chromePath) return jobs.map(() => ({ ok: false, warnings: [], rects: [], error: 'Chrome is not installed on this server, so pictures cannot be drawn' }));
    fs.mkdirSync(runDir, { recursive: true });
    renderStats.runs++;
    try { browser = await chrome.Browser.launch({ chromePath, lockFile: path.join(engine.root, 'out', 'design.lock') }); } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      return jobs.map(() => ({ ok: false, busy: BUSY.test(msg), warnings: [], rects: [], error: BUSY.test(msg) ? 'Another picture is being drawn right now. Try again in a moment' : 'Chrome could not be started on this server' }));
    }
    for (const [n, job] of jobs.entries()) {
      if (opts.stop?.()) break;
      out[n] = await drawOne(chrome, render, spec, browser, bl, briefs, look, job, path.join(runDir, `${n}.jpg`), engine.root, opts.withRects);
    }
  } catch (err) {
    logger.error('look.render_failed', describeError(err));
    return jobs.map((_, n) => out[n] ?? { ok: false, warnings: [], rects: [], error: 'The picture could not be drawn because of an unexpected error' });
  } finally {
    browser?.close();
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.rmSync(path.join(engine.root, 'out', 'design-tmp'), { recursive: true, force: true });
  }
  return out;
}

async function drawOne(
  _chrome: EngineChrome, render: EngineRenderMod, spec: EngineSpecMod, browser: { close(): void }, bl: BrandForLook, briefs: LookBrief, look: Json,
  job: DrawJob, file: string, root: string, withRects: boolean,
): Promise<Drawn> {
  const variant = briefs.kinds[job.kind]?.variants.find((v) => v.index === job.index);
  if (!variant) return { ok: false, warnings: [], rects: [], error: `The look has no ${job.kind} design number ${job.index + 1}` };
  const attempts = ATTEMPTS[job.scenario];
  let last: Drawn = { ok: false, warnings: [], rects: [], error: 'Not drawn' };
  for (const a of attempts) {
    const design: Json = { template: 'post', kind: job.kind, variant: job.index, name: `look-${job.scenario}`, ...copyFor(job.kind, variant, job.scenario, a) };
    const problems = spec.validateDesign(design, 'design', { look });
    if (problems.length) { last = { ok: false, warnings: [], rects: [], error: problems.slice(0, 3).join('; ').slice(0, 400) }; continue; }
    try {
      const r = await render.renderImage(browser, bl.brand, { spec: spec.normaliseDesign(design), sizeName: 'feed', outFile: file }, { tmpDir: path.join(root, 'out', 'design-tmp'), quality: JPEG_QUALITY });
      if (r.post && (r.post.fellBackFrom || r.post.variant !== job.index)) {
        last = { ok: false, warnings: [], rects: [], error: `The ${job.scenario} copy was not taken by this design, so another was used instead` };
        continue;
      }
      const image = `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;
      fs.rmSync(file, { force: true });
      const rects: CompositionRect[] = withRects ? (r.els ?? []).map((e) => ({ el: e.el, x: Math.round(e.x0 * 10) / 10, y: Math.round(e.y0 * 10) / 10, w: Math.round((e.x1 - e.x0) * 10) / 10, h: Math.round((e.y1 - e.y0) * 10) / 10 })) : [];
      return { ok: true, fill: a.fill, image, warnings: [...new Set([...r.warnings, ...(bl.placeholderLogo ? ['The brand has no logo yet, so a placeholder logo is shown (Settings, Brand)'] : [])])], rects };
    } catch (e) {
      if (e instanceof render.DesignError) {
        // The engine's refusal of this copy (it does not fit, an empty area, a rule of the design): the next, shorter or fuller, attempt is tried.
        last = { ok: false, warnings: [], rects: [], error: String((e as Error).message).slice(0, 400) };
        continue;
      }
      throw e;
    }
  }
  return last;
}

// ---- the samples cache -------------------------------------------------------------------------------------------------------

// A small in-memory LRU of sample pictures by look hash + brand hash + kind. Only drawings that finished (a picture, or the engine's
// own refusal of the look) are kept; a busy or broken Chrome is not.
const cache = new Map<string, Drawn>();
export const sampleCacheSize = (): number => cache.size;
// How many Chrome runs the renderer started (tests: a cached picture starts none).
export const renderStats = { runs: 0 };
export const clearSampleCache = (): void => cache.clear();
const cacheGet = (k: string): Drawn | undefined => { const v = cache.get(k); if (v) { cache.delete(k); cache.set(k, v); } return v; };
function cachePut(k: string, v: Drawn): void {
  cache.delete(k);
  cache.set(k, v);
  while (cache.size > SAMPLE_CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

// ---- the renderer ------------------------------------------------------------------------------------------------------------

export function createLookRenderer(deps: Deps): LookRenderer {
  const lookId = (look: Json) => String(look.id ?? 'look');
  const who = (userId: string | undefined) => userId ?? 'anyone';

  return {
    async preview(req: PreviewRequest) {
      const eng = (await lookEngine()) as unknown as EngineLooks & { lookBrief(l: unknown): LookBrief };
      const hash = eng.lookHash(req.look);
      const briefs = eng.lookBrief(req.look);
      const kinds = req.kinds.filter((k) => briefs.kinds[k]?.variants.length);
      const samples = new Map<string, PreviewSample>();
      const bl = await brandFor(deps, req.look);
      const keyOf = (k: string) => `${hash}|${bl.key}|${k}`;
      const todo: string[] = [];
      for (const k of kinds) {
        const hit = cacheGet(keyOf(k));
        if (hit) samples.set(k, { kind: k, ok: hit.ok, ...(hit.image ? { image: hit.image } : {}), ...(hit.error ? { error: hit.error } : {}), warnings: hit.warnings });
        else todo.push(k);
      }
      if (todo.length) {
        const run = await submit({ brandId: req.scope.brandId, class: 'preview', supersedeKey: `samples:${who(req.userId)}:${lookId(req.look)}`, deadline: Date.now() + PREVIEW_WAIT_MS },
          () => drawJobs(deps, req.look, todo.map((kind) => ({ kind, index: 0, scenario: 'sample' as const })), { withRects: false, brand: bl }));
        if (run.status === 'superseded') return { samples: [], superseded: true };
        if (run.status === 'expired') {
          for (const k of todo) samples.set(k, { kind: k, ok: false, error: 'The picture waited too long for its turn. Try again', warnings: [] });
        } else {
          todo.forEach((k, n) => {
            const d = run.value[n] ?? { ok: false, warnings: [], rects: [], error: 'Not drawn' };
            if (!d.busy && !/unexpected error|could not be started|not installed/.test(d.error ?? '')) cachePut(keyOf(k), d);
            samples.set(k, { kind: k, ok: d.ok, ...(d.image ? { image: d.image } : {}), ...(d.error ? { error: d.error } : {}), warnings: d.warnings });
          });
        }
      }
      return { samples: kinds.map((k) => samples.get(k)!).filter(Boolean) };
    },

    async previewComposition(req: CompositionPreviewRequest): Promise<CompositionPreview> {
      const run = await submit({ brandId: req.scope.brandId, class: 'preview', supersedeKey: `design:${who(req.userId)}:${lookId(req.look)}`, deadline: Date.now() + PREVIEW_WAIT_MS },
        () => drawJobs(deps, req.look, [{ kind: req.kind, index: req.index, scenario: req.scenario }], { withRects: req.withRects }));
      if (run.status === 'superseded') return { superseded: true };
      if (run.status === 'expired') return { error: 'The picture waited too long for its turn. Try again' };
      const d = run.value[0];
      if (!d) return { error: 'Not drawn' };
      return d.ok ? { image: d.image, rects: d.rects, warnings: d.warnings } : { error: d.error ?? 'The design could not be drawn', warnings: d.warnings };
    },

    async gate(req: GateRenderRequest): Promise<GateCheck[][]> {
      const scenarios: CopyScenario[] = ['sample', 'stress', 'minimal'];
      const jobs = req.targets.flatMap((t) => scenarios.map((scenario) => ({ kind: t.kind, index: t.index, scenario })));
      const unfinished = (why: string): GateCheck[][] => req.targets.map(() => scenarios.map((s) => ({ name: `render:${s}`, passed: false, message: why })));
      const startedAt = Date.now();
      const run = await submit({ brandId: req.scope.brandId, class: 'gate', supersedeKey: `gate:${who(req.userId)}:${lookId(req.look)}`, deadline: startedAt + GATE_WAIT_MS },
        () => { const t0 = Date.now(); return drawJobs(deps, req.look, jobs, { withRects: false, stop: () => Date.now() - t0 > GATE_RUN_MS }); });
      if (run.status === 'superseded') return unfinished('A newer check of this look replaced this one');
      if (run.status === 'expired') return unfinished('The checks waited too long for their turn. Run them again');
      return req.targets.map((_, i) => scenarios.map((s, j): GateCheck => {
        const d = run.value[i * scenarios.length + j];
        if (!d) return { name: `render:${s}`, passed: false, message: 'Ran out of time before this was drawn. Run the checks again' };
        if (d.ok) return { name: `render:${s}`, passed: true, ...(s === 'stress' && d.fill !== undefined && d.fill < 1 ? { message: `Takes text up to ${Math.round(d.fill * 100)}% of the limit its brief states` } : {}) };
        return { name: `render:${s}`, passed: false, message: `${s[0]!.toUpperCase()}${s.slice(1)} copy: ${d.error ?? 'could not be drawn'}`.slice(0, 400) };
      }));
    },
  };
}

// Connects the engine's renderer to the Looks routes and the gate.
export function connectLookRenderer(deps: Deps): void {
  setLookRenderer(createLookRenderer(deps));
}
