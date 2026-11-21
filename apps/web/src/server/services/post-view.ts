// What the API returns for batches and posts. Media gets short-lived signed URLs; nothing secret is in a post.
import type { Batch, Post, User } from '@prisma/client';
import type { Deps } from '../deps.js';
import { describeError, logger } from '../log.js';
import { asMedia, splitNetworks, type MediaEntry } from './post-model.js';

export const MEDIA_URL_TTL_SECONDS = 300;

async function signed(deps: Pick<Deps, 'storage'>, m: MediaEntry) {
  let url: string | null = null;
  try {
    url = await deps.storage.presignGet(m.key, MEDIA_URL_TTL_SECONDS);
  } catch (err) {
    // The page still loads with a placeholder, but a signing fault must show in the logs, not only as a grey box.
    logger.warn('media.sign_failed', { rel: m.rel, error: describeError(err) });
    url = null;
  }
  // The bucket key stays on the server: a page needs the URL, not where the object sits.
  const { key: _key, ...rest } = m;
  return { ...rest, url };
}

export async function postView(deps: Pick<Deps, 'storage'>, post: Post) {
  const media = await Promise.all(asMedia(post.media).map((m) => signed(deps, m)));
  const { skip, overrides } = splitNetworks(post.networks);
  return {
    id: post.id,
    batchId: post.batchId,
    postKey: post.postKey,
    position: post.position,
    title: post.title,
    date: post.date,
    time: post.time,
    caption: post.caption,
    networks: { ...overrides, ...(skip.length ? { skip } : {}) },
    design: post.design ?? null,
    media,
    renderStatus: post.renderStatus,
    renderError: post.renderError,
    sources: post.sources,
    warnings: post.warnings,
    status: post.status,
    approvedById: post.approvedById,
    approvedAt: post.approvedAt,
    removedAt: post.removedAt,
    updatedAt: post.updatedAt,
  };
}

// For lists: no signed URLs except the first picture, which is the thumbnail.
export async function postSummary(deps: Pick<Deps, 'storage'>, post: Post) {
  const first = asMedia(post.media).find((m) => m.kind === 'image');
  const thumbnail = first ? await signed(deps, first) : null;
  return {
    id: post.id,
    postKey: post.postKey,
    position: post.position,
    title: post.title,
    date: post.date,
    time: post.time,
    caption: post.caption,
    status: post.status,
    renderStatus: post.renderStatus,
    warningCount: post.warnings.length,
    hasDesign: !!post.design,
    mediaCount: asMedia(post.media).length,
    thumbnailUrl: thumbnail?.url ?? null,
    updatedAt: post.updatedAt,
  };
}

type Owner = Pick<User, 'id' | 'name' | 'email'>;

export const batchView = (batch: Batch, owner: Owner | null | undefined, counts: Record<string, number>) => ({
  id: batch.id,
  name: batch.name,
  title: batch.title,
  timezone: batch.timezone,
  defaultTime: batch.defaultTime,
  defaultNetworks: batch.defaultNetworks,
  periodStart: batch.periodStart,
  periodEnd: batch.periodEnd,
  status: batch.status,
  // true when the AI drafted the batch; the notes come with the single-batch answer
  aiDrafted: batch.aiDraft !== null,
  ownerId: batch.ownerId,
  owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
  counts,
  createdAt: batch.createdAt,
  updatedAt: batch.updatedAt,
});

export function countPosts(posts: Array<Pick<Post, 'status' | 'renderStatus'>>): Record<string, number> {
  const counts: Record<string, number> = { total: posts.length, draft: 0, approved: 0, removed: 0, renderFailed: 0 };
  for (const p of posts) {
    counts[p.status] = (counts[p.status] ?? 0) + 1;
    if (p.renderStatus === 'failed') counts.renderFailed++;
  }
  return counts;
}
