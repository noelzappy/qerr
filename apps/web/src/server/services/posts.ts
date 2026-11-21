// Reviewing posts: edit, approve, remove, render, upload media. Any change to what a post says or shows, or when and where
// it goes, takes an approval back: approval always covers exactly what is stored now.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Prisma, type Batch, type Post } from '@prisma/client';
import { z } from 'zod';
import { audit, type AuditActor } from '../audit.js';
import type { Deps } from '../deps.js';
import { HttpError } from '../http.js';
import { enqueueTracked } from './activity.js';
import { approvalReport, type PostWithBatch } from './approval.js';
import { designSchema, missingSources, renderTitle, networksSchema, problemsOf, type StagedPost } from './batches.js';
import { DESIGN_WARNING_PREFIX } from './render.js';
import { privateKey } from '../storage/types.js';
import { asMedia, joinNetworks, MEDIA_TYPES, POST_KEY_RE, safeFileName, sniffMedia, splitNetworks, type MediaEntry, type NetworkOverride } from './post-model.js';

type Actor = AuditActor & { id: string };

export const patchPostInput = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  caption: z.string().min(1).max(10_000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-01').optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:00').optional(),
  networks: networksSchema.optional(),
  design: designSchema.nullable().optional(),
  sources: z.array(z.string().min(1).max(64)).max(50).optional(),
});

export const MAX_MEDIA_PER_POST = 20;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function loadPost(deps: Pick<Deps, 'prisma'>, id: string): Promise<PostWithBatch> {
  const post = /^[0-9a-f-]{36}$/i.test(id) ? await deps.prisma.post.findUnique({ where: { id }, include: { batch: true } }) : null;
  if (!post) throw new HttpError(404, 'Post not found');
  return post;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const CLEAR_APPROVAL = { status: 'draft', approvedById: null, approvedAt: null } as const;

async function dropApproval(deps: Deps, actor: Actor | null, post: Post, reason: string): Promise<void> {
  await audit(deps, actor, 'post.unapprove', 'post', post.id, { postKey: post.postKey, auto: true, reason });
}

export async function patchPost(deps: Deps, actor: Actor, id: string, input: z.infer<typeof patchPostInput>): Promise<Post> {
  const post = await loadPost(deps, id);
  if (post.status === 'removed') throw new HttpError(409, 'This post has been removed. Restore it to edit it');

  const nextNetworks = input.networks
    ? (() => {
        const { skip = [], ...overrides } = input.networks;
        return joinNetworks(skip, overrides as Record<string, NetworkOverride>);
      })()
    : (post.networks as Record<string, unknown>);
  const next = {
    title: input.title ?? post.title,
    caption: input.caption ?? post.caption,
    date: input.date ?? post.date,
    time: input.time ?? post.time,
    networks: nextNetworks,
    design: input.design === undefined ? (post.design as Record<string, unknown> | null) : input.design,
    sources: input.sources ?? post.sources,
  };

  const staged: StagedPost = { postKey: post.postKey, title: next.title, date: next.date, time: next.time, caption: next.caption, networks: next.networks, design: next.design, sources: next.sources, warnings: [] };
  const errors = await problemsOf(post.batch, [staged]);
  const media = asMedia(post.media);
  for (const [n, o] of Object.entries(splitNetworks(next.networks).overrides)) {
    for (const rel of o.media ?? []) if (!media.some((m) => m.rel === rel)) errors.push(`${n}: media "${rel}" is not one of this post's files`);
  }
  if (input.sources) for (const s of await missingSources(deps, input.sources)) errors.push(`source ${s} is not in the vault`);
  if (errors.length) throw new HttpError(422, 'The post is not valid', [...new Set(errors)]);

  const changedFields = (['title', 'caption', 'date', 'time', 'networks', 'design', 'sources'] as const).filter((k) => {
    if (input[k] === undefined) return false;
    return !sameJson(next[k], k === 'networks' ? post.networks : k === 'design' ? post.design : post[k]);
  });
  if (!changedFields.length) return post;
  const designChanged = changedFields.includes('design');
  // The title is a label for the team; everything else changes what is published or where.
  const contentChanged = changedFields.some((f) => f !== 'title');

  const data: Prisma.PostUpdateInput = {};
  if (changedFields.includes('title')) data.title = next.title;
  if (changedFields.includes('caption')) data.caption = next.caption;
  if (changedFields.includes('date')) data.date = next.date;
  if (changedFields.includes('time')) data.time = next.time;
  if (changedFields.includes('networks')) data.networks = next.networks as Prisma.InputJsonValue;
  if (changedFields.includes('sources')) data.sources = next.sources;
  let droppedRenders: MediaEntry[] = [];
  if (designChanged) {
    if (next.design) {
      data.design = next.design as Prisma.InputJsonValue;
      data.renderStatus = 'queued';
      data.renderError = null;
    } else {
      data.design = Prisma.DbNull;
      data.renderStatus = 'none';
      data.renderError = null;
      droppedRenders = media.filter((m) => m.source === 'render');
      data.media = media.filter((m) => m.source !== 'render') as unknown as Prisma.InputJsonValue;
      data.warnings = post.warnings.filter((w) => !w.startsWith(DESIGN_WARNING_PREFIX));
    }
  }
  const wasApproved = post.status === 'approved';
  if (wasApproved && contentChanged) Object.assign(data, CLEAR_APPROVAL);

  const updated = await deps.prisma.post.update({ where: { id }, data });
  await Promise.all(droppedRenders.map((m) => deps.storage.deleteObject(m.key).catch(() => undefined)));
  await audit(deps, actor, 'post.update', 'post', id, { postKey: post.postKey, fields: changedFields });
  if (wasApproved && contentChanged) await dropApproval(deps, actor, post, `Edited: ${changedFields.join(', ')}`);
  if (designChanged && next.design) await enqueueTracked(deps, 'render-post', { postId: id }, { singletonKey: id }, { title: renderTitle(post.title), actorId: actor.id, batchId: post.batchId, postId: id });
  return (await deps.prisma.post.findUnique({ where: { id } })) ?? updated;
}

export type ApproveResult = { ok: true; post: Post } | { ok: false; blockers: string[] };

export async function approvePost(deps: Deps, actor: Actor, id: string): Promise<ApproveResult> {
  const post = await loadPost(deps, id);
  if (post.status === 'removed') throw new HttpError(409, 'This post has been removed. Restore it first');
  if (post.status === 'approved') return { ok: true, post };
  const report = await approvalReport(deps, post);
  if (report.blockers.length) return { ok: false, blockers: report.blockers };
  const approved = await markApproved(deps, actor, post, { bulk: false });
  return { ok: true, post: approved };
}

async function markApproved(deps: Deps, actor: Actor, post: PostWithBatch, detail: Record<string, unknown>): Promise<Post> {
  const updated = await deps.prisma.post.update({ where: { id: post.id }, data: { status: 'approved', approvedById: actor.id, approvedAt: deps.now() } });
  if (post.batch.status === 'draft') await deps.prisma.batch.update({ where: { id: post.batchId }, data: { status: 'in_review' } });
  await audit(deps, actor, 'post.approve', 'post', post.id, { postKey: post.postKey, ...detail });
  return updated;
}

export async function unapprovePost(deps: Deps, actor: Actor, id: string): Promise<Post> {
  const post = await loadPost(deps, id);
  if (post.status !== 'approved') throw new HttpError(409, 'This post is not approved');
  const updated = await deps.prisma.post.update({ where: { id }, data: CLEAR_APPROVAL });
  await audit(deps, actor, 'post.unapprove', 'post', id, { postKey: post.postKey });
  return updated;
}

export async function removePost(deps: Deps, actor: Actor, id: string): Promise<{ post: Post; inBuffer: number }> {
  const post = await loadPost(deps, id);
  if (post.status === 'removed') return { post, inBuffer: 0 };
  const inBuffer = await deps.prisma.delivery.count({ where: { postId: id, status: { in: ['created', 'unknown'] } } });
  const updated = await deps.prisma.post.update({ where: { id }, data: { status: 'removed', removedAt: deps.now(), approvedById: null, approvedAt: null } });
  await audit(deps, actor, 'post.remove', 'post', id, { postKey: post.postKey, wasApproved: post.status === 'approved', inBuffer });
  return { post: updated, inBuffer };
}

export async function restorePost(deps: Deps, actor: Actor, id: string): Promise<Post> {
  const post = await loadPost(deps, id);
  if (post.status !== 'removed') throw new HttpError(409, 'This post has not been removed');
  const updated = await deps.prisma.post.update({ where: { id }, data: { status: 'draft', removedAt: null } });
  await audit(deps, actor, 'post.restore', 'post', id, { postKey: post.postKey });
  return updated;
}

export async function requestRender(deps: Deps, actor: Actor, id: string): Promise<Post> {
  const post = await loadPost(deps, id);
  if (post.status === 'removed') throw new HttpError(409, 'This post has been removed. Restore it first');
  if (!post.design) throw new HttpError(409, 'This post has no design to render. Add a design, or upload images');
  const updated = await deps.prisma.post.update({ where: { id }, data: { renderStatus: 'queued', renderError: null } });
  await enqueueTracked(deps, 'render-post', { postId: id }, { singletonKey: id }, { title: renderTitle(post.title), actorId: actor.id, batchId: post.batchId, postId: id });
  await audit(deps, actor, 'post.render', 'post', id, { postKey: post.postKey });
  return updated;
}

export interface ApproveAllResult {
  approved: Array<{ id: string; postKey: string }>;
  skipped: Array<{ id: string; postKey: string; reasons: string[] }>;
}

// Approves every draft post that has nothing to flag: no blockers, no warnings, images ready.
export async function approveAll(deps: Deps, actor: Actor, batchId: string): Promise<ApproveAllResult> {
  const batch = await deps.prisma.batch.findUnique({ where: { id: batchId }, include: { posts: { orderBy: { position: 'asc' } } } });
  if (!batch) throw new HttpError(404, 'Batch not found');
  const result: ApproveAllResult = { approved: [], skipped: [] };
  for (const p of batch.posts) {
    const mine = { id: p.id, postKey: p.postKey };
    if (p.status === 'removed') continue;
    if (p.status === 'approved') {
      result.skipped.push({ ...mine, reasons: ['Already approved'] });
      continue;
    }
    const post: PostWithBatch = { ...p, batch: batch as Batch };
    const report = await approvalReport(deps, post);
    const reasons = [...report.blockers, ...report.warnings.map((w) => `Warning: ${w}`)];
    if (reasons.length) {
      result.skipped.push({ ...mine, reasons });
      continue;
    }
    await markApproved(deps, actor, post, { bulk: true });
    result.approved.push(mine);
  }
  return result;
}

// ---- media uploaded by hand ----

export async function uploadMedia(deps: Deps, actor: Actor, id: string, file: { name: string; bytes: Buffer }): Promise<Post> {
  const post = await loadPost(deps, id);
  if (post.status === 'removed') throw new HttpError(409, 'This post has been removed. Restore it first');
  const ext = path.extname(file.name).toLowerCase();
  const type = MEDIA_TYPES[ext];
  if (!type) throw new HttpError(415, `Files of type "${ext || 'none'}" are not accepted. Use ${Object.keys(MEDIA_TYPES).join(', ')}`);
  if (!file.bytes.length) throw new HttpError(422, 'The file is empty');
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new HttpError(413, `The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
  const sniffed = sniffMedia(file.bytes);
  const agrees = type.kind === 'image' ? sniffed === type.contentType : !!sniffed?.startsWith('video/');
  if (!agrees) throw new HttpError(422, `This file does not look like a real ${ext.slice(1).toUpperCase()} file`);
  const media = asMedia(post.media);
  if (media.length >= MAX_MEDIA_PER_POST) throw new HttpError(409, `A post can hold ${MAX_MEDIA_PER_POST} files`);

  const sha256 = createHash('sha256').update(file.bytes).digest('hex');
  const base = safeFileName(file.name);
  let rel = base;
  for (let n = 2; media.some((m) => m.rel === rel); n++) rel = `${path.basename(base, ext)}-${n}${ext}`;
  if (!POST_KEY_RE.test(post.postKey)) throw new HttpError(409, 'This post has an id that cannot be used for files');
  const key = privateKey('renders', post.batchId, post.postKey, `${sha256.slice(0, 16)}-${rel}`);
  await deps.storage.putObject(key, file.bytes, sniffed ?? type.contentType);
  const entry: MediaEntry = { rel, key, sha256, size: file.bytes.length, contentType: sniffed ?? type.contentType, kind: type.kind, source: 'upload' };
  const updated = await deps.prisma.post.update({
    where: { id },
    data: { media: [...media, entry] as unknown as Prisma.InputJsonValue, ...(post.status === 'approved' ? CLEAR_APPROVAL : {}) },
  });
  await audit(deps, actor, 'post.update', 'post', id, { postKey: post.postKey, fields: ['media'], added: rel, size: entry.size });
  if (post.status === 'approved') await dropApproval(deps, actor, post, 'A file was added');
  return updated;
}

export async function removeMedia(deps: Deps, actor: Actor, id: string, rel: string): Promise<Post> {
  const post = await loadPost(deps, id);
  const media = asMedia(post.media);
  const entry = media.find((m) => m.rel === rel);
  if (!entry) throw new HttpError(404, 'File not found on this post');
  if (entry.source !== 'upload') throw new HttpError(409, 'This image was made from the design. Change the design or render again instead');
  const { skip, overrides } = splitNetworks(post.networks);
  const cleaned: Record<string, NetworkOverride> = {};
  for (const [n, o] of Object.entries(overrides)) {
    const list = o.media?.filter((r) => r !== rel);
    const { media: _m, ...rest } = o;
    cleaned[n] = list?.length ? { ...rest, media: list } : rest;
  }
  const remaining = media.filter((m) => m.rel !== rel);
  const updated = await deps.prisma.post.update({
    where: { id },
    data: { media: remaining as unknown as Prisma.InputJsonValue, networks: joinNetworks(skip, cleaned) as Prisma.InputJsonValue, ...(post.status === 'approved' ? CLEAR_APPROVAL : {}) },
  });
  if (!remaining.some((m) => m.key === entry.key)) await deps.storage.deleteObject(entry.key).catch(() => undefined);
  await audit(deps, actor, 'post.update', 'post', id, { postKey: post.postKey, fields: ['media'], removed: rel });
  if (post.status === 'approved') await dropApproval(deps, actor, post, 'A file was removed');
  return updated;
}
