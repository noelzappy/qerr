// What stops a post being approved (blockers) and what only deserves a look (warnings). One function decides both, so the
// review page, the approve endpoint and "approve all without warnings" can never disagree.
import os from 'node:os';
import path from 'node:path';
import type { Batch, Post } from '@prisma/client';
import type { Deps } from '../deps.js';
import { pipelineEngine, type EngineItem } from '../engine/pipeline.js';
import { currencyWarnings } from './currency-check.js';
import { designProblems, photosOfDesign } from './design-images.js';
import { POST_KEY_RE, rawBatchForEngine } from './post-model.js';
import { rightsProblems, sourceProblems } from './vault-rules.js';

export type PostWithBatch = Post & { batch: Batch };

export interface ApprovalReport {
  blockers: string[];
  // The draft's own warnings plus the ones computed now (soft: they never block).
  warnings: string[];
}

// Engine warnings that mean the post cannot go out. The rest are shown as warnings.
const HARD = [/^caption is \d+ characters/, /^Instagram needs media/];

// The routing and caption limits the engine needs to judge a post, without any key.
async function routingForPlanning(deps: Pick<Deps, 'prisma'>) {
  const [accounts, routes] = await Promise.all([
    deps.prisma.bufferAccount.findMany({ select: { name: true, captionLimits: true } }),
    deps.prisma.channelRoute.findMany({ include: { account: { select: { name: true } } } }),
  ]);
  const routing: Record<string, { account: string; channelId: string | null }> = {};
  for (const r of routes) routing[r.network] = { account: r.account.name, channelId: r.channelId || null };
  return {
    routing,
    accounts: accounts.map((a) => ({ name: a.name, captionLimits: (a.captionLimits && typeof a.captionLimits === 'object' ? a.captionLimits : {}) as Record<string, number> })),
  };
}

// A folder that does not exist: the engine only needs a path to build items; nothing is read from it here.
const NO_MEDIA_ROOT = path.join(os.tmpdir(), 'vesk-no-media');

async function staleFigureDays(deps: Pick<Deps, 'prisma'>): Promise<number | undefined> {
  const row = await deps.prisma.appSetting.findUnique({ where: { key: 'staleFigureDays' } });
  return typeof row?.value === 'number' ? row.value : undefined;
}

export async function itemsForPosts(deps: Pick<Deps, 'prisma'>, batch: Batch, posts: Post[]): Promise<{ errors: string[]; items: EngineItem[] }> {
  const engine = await pipelineEngine();
  const raw = rawBatchForEngine(batch, posts, { mediaRoot: NO_MEDIA_ROOT, withDesign: false, withMedia: true, networks: engine.networks });
  const { errors, batch: valid } = engine.validateBatch(raw, { fallbackName: batch.name, root: engine.root });
  if (errors.length || !valid) return { errors, items: [] };
  const { routing, accounts } = await routingForPlanning(deps);
  const items = engine.resolveItems(valid, { routing, accounts });
  return { errors: [], items };
}

export async function approvalReport(deps: Pick<Deps, 'prisma' | 'now' | 'storage'>, post: PostWithBatch): Promise<ApprovalReport> {
  const engine = await pipelineEngine();
  const blockers: string[] = [];
  const warnings: string[] = [...post.warnings];

  if (post.status === 'removed') blockers.push('This post has been removed. Restore it first');
  if (!POST_KEY_RE.test(post.postKey)) blockers.push('This post has an id that cannot be used for files');

  // The words, networks, dates and design, checked by the engine exactly as a batch file would be.
  const { errors, items } = await itemsForPosts(deps, post.batch, [post]);
  blockers.push(...errors);
  if (post.design) blockers.push(...(await designProblems(post.design, deps)));

  if (post.design && post.renderStatus !== 'ok') {
    const why = post.renderStatus === 'failed' && post.renderError ? `: ${post.renderError}` : '';
    blockers.push(post.renderStatus === 'failed' ? `The images could not be made${why}` : 'The images are not ready yet. Wait for the render to finish, or render again');
  }
  for (const item of items) {
    for (const w of item.warnings) {
      const line = `${item.network}: ${w}`;
      // A design whose render is not ok already has its own blocker above; its "needs media" would repeat it.
      if (HARD.some((re) => re.test(w))) {
        if (!(post.design && post.renderStatus !== 'ok' && /^Instagram needs media/.test(w))) blockers.push(line);
      } else warnings.push(line);
    }
  }

  warnings.push(...(await currencyWarnings(post)));

  const staleDays = await staleFigureDays(deps);
  const now = deps.now();
  const sources = post.sources.length ? await deps.prisma.vaultItem.findMany({ where: { id: { in: post.sources } } }) : [];
  for (const id of post.sources) {
    const item = sources.find((s) => s.id === id);
    if (!item) {
      blockers.push(`A source (${id}) is no longer in the vault`);
      continue;
    }
    blockers.push(...sourceProblems(item, { now, staleFigureDays: staleDays }), ...rightsProblems(item));
  }
  for (const photo of post.design ? await photosOfDesign(deps, post.design) : []) {
    if (!photo.item) blockers.push(`The design uses a vault photo (${photo.vaultItemId}) that is not in the vault`);
    else blockers.push(...rightsProblems(photo.item), ...(photo.item.deletedAt ? [`"${photo.item.title}" was deleted from the vault`] : []));
  }

  if (!errors.length && Date.parse(engine.zonedToUtcIso(post.date, post.time, post.batch.timezone)) <= now.getTime()) {
    blockers.push(`The scheduled time (${post.date} ${post.time}) has already passed. Change the date`);
  }

  return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)] };
}

export const approvalProblems = async (deps: Pick<Deps, 'prisma' | 'now' | 'storage'>, post: PostWithBatch): Promise<string[]> => (await approvalReport(deps, post)).blockers;
