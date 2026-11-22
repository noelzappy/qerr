// The render-post job: turns a post's `design` block into finished images in the private bucket.
//
// The design engine reads pictures from disk relative to the repository root, so a vault photo, and each brand graphic the active
// look's chosen composition places (design-images.ts attachGraphics), is copied from the bucket into out/app-render/<run>/
// (git-ignored) and only the temporary copy of the spec points at it. The folder is removed
// afterwards. At most RENDER_CONCURRENCY renders at once (services/render-limit.ts): the job runner takes that many jobs and each takes a slot.
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
import { withRenderSlot } from './render-limit.js';
import { syncBrand } from './brand-settings.js';
import { attachGraphics, copyVaultFile, designProblems, photosOfDesign, withoutVaultIds } from './design-images.js';
import { DEFAULT_BRAND_ID } from './looks.js';
import { asMedia, assertInside, MEDIA_TYPES, POST_KEY_RE, type MediaEntry } from './post-model.js';

export const DESIGN_WARNING_PREFIX = 'Design check: ';
// The start of the design warning a post carries when its own design (the AI's, or one edited from it) could not be drawn and the look's drew it.
export const OWN_DESIGN_NOT_USED = "the post's own design was not used, so the look's design drew it: ";
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);


export function renderPost(deps: Deps, payload: { postId: string; activityId?: string }): Promise<void> {
  const meta = async () => {
    const post = await deps.prisma.post.findUnique({ where: { id: payload.postId }, select: { title: true, batchId: true } });
    return { title: `Render: ${post?.title ?? 'a post'}`, batchId: post?.batchId ?? null, postId: post ? payload.postId : null };
  };
  return trackRun(deps, 'render-post', payload, meta, (handle) => withRenderSlot(() => renderNow(deps, payload.postId, handle)));
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
    let problems = await designProblems(post.design, deps);
    // A post's own design the look no longer takes (the look changed since): the post is still drawn, with the look's design, and says why
    // (the engine falls back and notes it). Only the own design may be the problem; anything else fails the render as before.
    if (problems.length && isObj(post.design) && 'composition' in post.design) {
      const { composition: _own, ...plain } = post.design as Record<string, unknown>;
      if (!(await designProblems(plain, deps)).length) problems = [];
    }
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
    // a post's own design that the page refused: the look's design drew it, and the post says so (OWN_DESIGN_NOT_USED, read by the post card)
    const ownNote = result.ownDesign?.asked && !result.ownDesign.used ? [`${OWN_DESIGN_NOT_USED}${(result.ownDesign.reasons[0] ?? 'it could not be drawn').slice(0, 400)}`] : [];
    const warnings = [...latest.warnings.filter((w) => !w.startsWith(DESIGN_WARNING_PREFIX)), ...[...new Set([...ownNote, ...result.warnings])].map((w) => `${DESIGN_WARNING_PREFIX}${w}`)];
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
