// A post's design drawn without being saved: the post editor's live preview.
//
// The design is checked exactly as saving a post checks it (problemsOf: the engine's batch validator plus our picture rules),
// then drawn once through the same renderer and checks as the render job, as a JPEG data URL. Nothing is written to a post, its
// media or its batch; a vault photo, and each brand graphic the active look's chosen composition places, is copied to a temporary
// folder that is removed afterwards. Runs under the render lock
// (one Chrome at a time).
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Deps } from '../deps.js';
import { pipelineEngine, type RenderResult } from '../engine/pipeline.js';
import { describeError, logger } from '../log.js';
import { HttpError } from '../http.js';
import { problemsOf, type StagedPost } from './batches.js';
import { attachGraphics, copyVaultFile, photosOfDesign, withoutVaultIds } from './design-images.js';
import { DEFAULT_BRAND_ID } from './looks.js';
import { assertInside } from './post-model.js';

type Json = Record<string, unknown>;
export const PREVIEW_SIZES = ['feed', 'wide', 'story', 'square'] as const;

export interface DesignPreviewResult {
  ok: boolean;
  // The first image, and every image (a carousel has one per page).
  image?: string;
  images?: string[];
  size: string;
  error?: string;
  warnings: string[];
  notes: string[];
}

// The problems saving a post with this design would report, with the same words (the post is a stand-in; only its design counts).
export async function designPreviewProblems(design: Json, deps?: Pick<Deps, 'prisma' | 'storage'>): Promise<string[]> {
  const staged: StagedPost = { postKey: 'preview', title: 'Preview', date: '2030-01-01', time: '09:00', caption: 'Preview', networks: {}, design, sources: [], warnings: [] };
  const problems = await problemsOf({ name: 'preview', timezone: 'UTC', defaultTime: '09:00', defaultNetworks: ['instagram'] }, [staged], deps);
  // Saving words each problem "post <id>: design: ..."; here there is no post, so the stand-in's id is left off.
  return problems.map((p) => p.replace(/^post preview: /, ''));
}

// Which size to draw: the one asked for when the design makes it, else the design's first size.
function sizeFor(design: Json, wanted: string): string {
  const raw = design.sizes;
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(',').map((s) => s.trim()).filter(Boolean) : ['feed'];
  return list.includes(wanted) ? wanted : list[0] ?? 'feed';
}

export async function previewDesign(
  deps: Deps,
  design: Json,
  // `render` replaces the engine's renderer (tests only; the route never passes it).
  opts: { size?: string; lock: <T>(fn: () => Promise<T>) => Promise<T>; render?: (options: Record<string, unknown>) => Promise<RenderResult> },
): Promise<DesignPreviewResult> {
  const problems = await designPreviewProblems(design, deps);
  if (problems.length) throw new HttpError(422, 'The post is not valid', problems);

  const engine = await pipelineEngine();
  const size = sizeFor(design, opts.size ?? 'feed');
  const runDir = path.join(engine.root, 'out', 'design-preview', randomUUID());
  return opts.lock(async (): Promise<DesignPreviewResult> => {
    try {
      // A private copy of the design whose vault photos point at files copied next to this run.
      const spec = structuredClone(design) as Json;
      await fs.mkdir(path.join(runDir, 'in'), { recursive: true });
      let n = 0;
      for (const photo of await photosOfDesign(deps, spec)) {
        if (!photo.item) return { ok: false, size, error: 'This design uses a picture that is no longer in Facts', warnings: [], notes: [] };
        if (!photo.vaultItemId) continue; // matched by file name only: the repository file is what the design names
        if (photo.item.deletedAt || !photo.item.fileKey) return { ok: false, size, error: `The picture "${photo.item.title}" was deleted or has no file`, warnings: [], notes: [] };
        photo.node.image = await copyVaultFile(deps, photo.item, runDir, ++n);
      }
      // The brand graphics and cut-outs the active look's chosen composition places, from the vault (never from the request).
      const graphicIssues = await attachGraphics(deps, spec, { runDir, brandId: DEFAULT_BRAND_ID });
      if (graphicIssues.length) return { ok: false, size, error: graphicIssues.join('; '), warnings: [], notes: [] };
      const render = opts.render ?? ((o: Record<string, unknown>) => engine.renderDesignBlock(o));
      const r = await render({
        root: engine.root,
        design: withoutVaultIds(spec),
        postId: 'preview',
        stem: 'preview',
        only: [size],
        outDir: path.relative(engine.root, path.join(runDir, 'out')),
      });
      if (!r.ok) return { ok: false, size, error: r.error ?? 'The preview could not be made', warnings: r.warnings, notes: r.notes };
      const images: string[] = [];
      for (const f of r.files) images.push(`data:image/jpeg;base64,${(await fs.readFile(assertInside(runDir, f.abs))).toString('base64')}`);
      return { ok: true, size, image: images[0], images, warnings: [...new Set(r.warnings)], notes: r.notes };
    } catch (err) {
      logger.error('design.preview_failed', describeError(err));
      return { ok: false, size, error: 'The preview could not be made because of an unexpected error', warnings: [], notes: [] };
    } finally {
      await fs.rm(runDir, { recursive: true, force: true });
    }
  });
}
