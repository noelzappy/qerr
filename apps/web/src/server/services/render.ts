// The render-post job: turns a post's `design` block into finished images in the private bucket.
//
// The design engine reads pictures from disk relative to the repository root, so a vault photo, and each brand graphic the active
// look's chosen composition places (design-images.ts attachGraphics), is copied from the bucket into out/app-render/<run>/
// (git-ignored) and only the temporary copy of the spec points at it. The folder is removed
// afterwards. One Chrome at a time: the queue runs one job at a time and a process-level lock covers direct calls.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Post, Prisma } from '@prisma/client';
import { audit } from '../audit.js';
import type { Deps } from '../deps.js';
import { pipelineEngine } from '../engine/pipeline.js';
import { describeError, logger } from '../log.js';
import { privateKey } from '../storage/types.js';
import { trackRun, type RunHandle } from './activity.js';
import { syncBrand } from './brand-settings.js';
import { attachGraphics, copyVaultFile, designProblems, photosOfDesign, withoutVaultIds } from './design-images.js';
import { DEFAULT_BRAND_ID } from './looks.js';
import { asMedia, assertInside, MEDIA_TYPES, POST_KEY_RE, type MediaEntry } from './post-model.js';

export const DESIGN_WARNING_PREFIX = 'Design check: ';

let chain: Promise<unknown> = Promise.resolve();
// Runs jobs one after another, whatever calls them and whether the one before succeeded.
export function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export function renderPost(deps: Deps, payload: { postId: string; activityId?: string }): Promise<void> {
  const meta = async () => {
    const post = await deps.prisma.post.findUnique({ where: { id: payload.postId }, select: { title: true, batchId: true } });
    return { title: `Render: ${post?.title ?? 'a post'}`, batchId: post?.batchId ?? null, postId: post ? payload.postId : null };
  };
  return trackRun(deps, 'render-post', payload, meta, (handle) => oneAtATime(() => renderNow(deps, payload.postId, handle)));
}

async function fail(deps: Deps, post: Post, message: string, handle: RunHandle): Promise<void> {
  handle.fail(message);
  await deps.prisma.post.update({ where: { id: post.id }, data: { renderStatus: 'failed', renderError: message.slice(0, 1000) } });
  await audit(deps, null, 'post.render.failed', 'post', post.id, { postKey: post.postKey, error: message.slice(0, 300) });
}

async function renderNow(deps: Deps, postId: string, handle: RunHandle): Promise<void> {
  const post = await deps.prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.status === 'removed') return;
  if (!post.design) {
    if (post.renderStatus !== 'none') await deps.prisma.post.update({ where: { id: post.id }, data: { renderStatus: 'none', renderError: null } });
    return;
  }
  const designAtStart = JSON.stringify(post.design);
  await deps.prisma.post.update({ where: { id: post.id }, data: { renderStatus: 'rendering', renderError: null } });

  handle.progress({ step: 'Checking the design' });
  // The engine reads the brand from the pack folder: make it match the brand saved in Settings first.
  const brand = await syncBrand(deps);
  if (brand.logosMissing) return await fail(deps, post, 'Add your logo and its mark in Settings, Brand before images can be made', handle);
  const engine = await pipelineEngine();
  const runDir = path.join(engine.root, 'out', 'app-render', randomUUID());
  try {
    if (!POST_KEY_RE.test(post.postKey)) return await fail(deps, post, 'This post has an id that cannot be used for files', handle);
    const problems = await designProblems(post.design, deps);
    if (problems.length) return await fail(deps, post, `The design is not valid: ${problems.join('; ')}`, handle);

    // A private copy of the spec whose vault photos point at files copied next to this run.
    const spec = structuredClone(post.design) as Record<string, unknown>;
    await fs.mkdir(path.join(runDir, 'in'), { recursive: true });
    let n = 0;
    for (const photo of await photosOfDesign(deps, spec)) {
      if (!photo.item) return await fail(deps, post, `The design uses a vault photo (${photo.vaultItemId}) that is not in the vault`, handle);
      if (!photo.vaultItemId) continue; // matched by file name only: the repository file is what the design names
      if (photo.item.deletedAt || !photo.item.fileKey) return await fail(deps, post, `The vault photo "${photo.item.title}" was deleted or has no file`, handle);
      photo.node.image = await copyVaultFile(deps, photo.item, runDir, ++n);
    }
    // The brand graphics and cut-outs the active look's chosen composition places, found in the vault and copied the same way.
    const graphicIssues = await attachGraphics(deps, spec, { runDir, brandId: DEFAULT_BRAND_ID });
    if (graphicIssues.length) return await fail(deps, post, graphicIssues.join('; '), handle);

    handle.progress({ step: 'Drawing the images' });
    // The folio is the post's number in its batch (removed posts do not count).
    const siblings = await deps.prisma.post.findMany({ where: { batchId: post.batchId, status: { not: 'removed' } }, select: { id: true }, orderBy: { position: 'asc' } });
    const at = siblings.findIndex((s) => s.id === post.id);
    const result = await engine.renderDesignBlock({
      ...(at >= 0 ? { folio: { n: at + 1, total: siblings.length } } : {}),
      root: engine.root,
      design: withoutVaultIds(spec),
      postId: post.postKey,
      outDir: path.relative(engine.root, path.join(runDir, 'out')),
    });
    if (!result.ok) return await fail(deps, post, result.error ?? 'The images could not be made', handle);

    const uploaded: MediaEntry[] = [];
    for (const f of result.files) {
      handle.progress({ step: 'Saving the images', done: uploaded.length, total: result.files.length });
      const body = await fs.readFile(assertInside(runDir, f.abs));
      const type = MEDIA_TYPES[path.extname(f.file).toLowerCase()] ?? { contentType: 'image/jpeg', kind: 'image' as const };
      const key = privateKey('renders', post.batchId, post.postKey, `${f.size}-${f.file}`);
      await deps.storage.putObject(key, body, type.contentType);
      uploaded.push({ rel: f.file, key, sha256: createHash('sha256').update(body).digest('hex'), size: body.length, contentType: type.contentType, kind: 'image', source: 'render', renderSize: f.size, slide: f.slide });
    }

    // The post may have changed while Chrome worked. A newer design has its own queued job; do not overwrite it with old pictures.
    const latest = await deps.prisma.post.findUnique({ where: { id: post.id } });
    if (!latest || latest.status === 'removed' || JSON.stringify(latest.design) !== designAtStart) return;

    const before = asMedia(latest.media);
    const kept = before.filter((m) => m.source === 'upload');
    const stale = before.filter((m) => m.source === 'render' && !uploaded.some((u) => u.key === m.key));
    const warnings = [...latest.warnings.filter((w) => !w.startsWith(DESIGN_WARNING_PREFIX)), ...[...new Set(result.warnings)].map((w) => `${DESIGN_WARNING_PREFIX}${w}`)];
    const wasApproved = latest.status === 'approved';
    await deps.prisma.post.update({
      where: { id: post.id },
      data: {
        media: [...uploaded, ...kept] as unknown as Prisma.InputJsonValue, renderStatus: 'ok', renderError: null, warnings,
        // New pictures are new content: an earlier approval no longer covers them.
        ...(wasApproved ? { status: 'draft', approvedById: null, approvedAt: null } : {}),
      },
    });
    await Promise.all(stale.map((m) => deps.storage.deleteObject(m.key).catch(() => undefined)));
    if (wasApproved) await audit(deps, null, 'post.unapprove', 'post', post.id, { postKey: post.postKey, reason: 'The images were made again' });
    await audit(deps, null, 'post.render.done', 'post', post.id, { postKey: post.postKey, files: uploaded.length, warnings: result.warnings.length });
    handle.result({ postKey: post.postKey, files: uploaded.length, sizes: [...new Set(uploaded.map((u) => u.renderSize).filter(Boolean))], warnings: result.warnings.length });
  } catch (err) {
    logger.error('render.failed', { postId, ...describeError(err, [deps.config.authSecret]) });
    await fail(deps, post, 'The images could not be made because of an unexpected error. Try again, and tell an admin if it keeps happening', handle);
  } finally {
    await fs.rm(runDir, { recursive: true, force: true });
  }
}
