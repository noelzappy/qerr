// Creating, importing, changing and deleting batches. Validation is the engine's: a batch is valid here exactly when
// `validateBatch` would accept the same JSON from a file.
import type { Batch, Post, Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit, type AuditActor } from '../audit.js';
import type { Deps } from '../deps.js';
import { HttpError } from '../http.js';
import { pipelineEngine } from '../engine/pipeline.js';
import { enqueueTracked } from './activity.js';
import { designProblems } from './design-images.js';
import { joinNetworks, POST_KEY_RE, rawBatchForEngine, slugify, type NetworkOverride } from './post-model.js';

export const NETWORK_NAMES = ['instagram', 'linkedin', 'facebook', 'x'] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const override = z.strictObject({
  caption: z.string().min(1).max(10_000).optional(),
  type: z.string().min(1).max(30).optional(),
  shouldShareToFeed: z.boolean().optional(),
  firstComment: z.string().min(1).max(2200).optional(),
  media: z.array(z.string().min(1).max(200)).max(20).optional(),
});
export const networksSchema = z.strictObject({
  skip: z.array(z.enum(NETWORK_NAMES)).max(4).optional(),
  instagram: override.optional(),
  linkedin: override.optional(),
  facebook: override.optional(),
  x: override.optional(),
});
export const designSchema = z.record(z.string(), z.unknown());

export const postInput = z.strictObject({
  postKey: z.string().regex(POST_KEY_RE, 'Use letters, digits, . _ - only, and not just dots').optional(),
  title: z.string().trim().min(1).max(200),
  date: z.string().regex(DATE, 'Use a date like 2026-12-01'),
  time: z.string().regex(HHMM, 'Use a time like 09:00').optional(),
  caption: z.string().min(1).max(10_000),
  networks: networksSchema.optional(),
  design: designSchema.nullish(),
  sources: z.array(z.string().min(1).max(64)).max(50).optional(),
});
export type PostInput = z.infer<typeof postInput>;

const batchHeader = {
  title: z.string().trim().min(1).max(200),
  timezone: z.string().min(1).max(64),
  defaultTime: z.string().regex(HHMM, 'Use a time like 09:00'),
  defaultNetworks: z.array(z.enum(NETWORK_NAMES)).min(1).max(4).optional(),
  periodStart: z.string().regex(DATE).nullish(),
  periodEnd: z.string().regex(DATE).nullish(),
};
export const createBatchInput = z.strictObject({ ...batchHeader, name: z.string().trim().min(1).max(60).optional(), posts: z.array(postInput).max(200).optional() });
export const patchBatchInput = z.strictObject({
  title: batchHeader.title.optional(),
  timezone: batchHeader.timezone.optional(),
  defaultTime: batchHeader.defaultTime.optional(),
  defaultNetworks: batchHeader.defaultNetworks,
  periodStart: batchHeader.periodStart,
  periodEnd: batchHeader.periodEnd,
});
export const importInput = z.strictObject({ json: z.unknown() });

const unprocessable = (message: string, details: string[]) => new HttpError(422, message, details);

async function uniqueName(deps: Pick<Deps, 'prisma'>, wanted: string): Promise<string> {
  const base = (wanted.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^-+|-+$/g, '') || 'batch').slice(0, 60);
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}-${n}`;
    if (!(await deps.prisma.batch.findUnique({ where: { name }, select: { id: true } }))) return name;
  }
}

function datesOf(posts: Array<{ date: string }>): { periodStart: string | null; periodEnd: string | null } {
  const dates = posts.map((p) => p.date).sort();
  return { periodStart: dates[0] ?? null, periodEnd: dates[dates.length - 1] ?? null };
}

export interface StagedPost {
  postKey: string;
  title: string;
  date: string;
  time: string;
  caption: string;
  networks: Record<string, unknown>;
  design: Record<string, unknown> | null;
  sources: string[];
  warnings: string[];
}

// Every error the engine and our design rules find in these posts, with the batch header, all listed together.
export async function problemsOf(header: Pick<Batch, 'timezone' | 'defaultTime' | 'defaultNetworks'> & { name: string }, staged: StagedPost[]): Promise<string[]> {
  const engine = await pipelineEngine();
  const errors: string[] = [];
  if (!engine.validTimeZone(header.timezone)) errors.push(`timezone "${header.timezone}" is not a valid IANA time zone (for example Europe/London)`);
  if (!HHMM.test(header.defaultTime)) errors.push(`defaultTime "${header.defaultTime}" must look like 09:00`);
  for (const s of staged) if (!POST_KEY_RE.test(s.postKey)) errors.push(`post ${s.postKey}: id may only use letters, digits, . _ - (up to 60 characters) and cannot be only dots`);
  if (errors.length) return errors;
  if (!staged.length) return [];
  const raw = rawBatchForEngine(
    header,
    staged.map((s, i) => ({ ...s, id: `staged-${i}`, batchId: '', position: i, media: [], renderStatus: 'none', renderError: null, status: 'draft', approvedById: null, approvedAt: null, removedAt: null, updatedAt: new Date() }) as unknown as Post),
    { mediaRoot: 'media/none', withDesign: true, withMedia: false, networks: engine.networks },
  );
  const { errors: engineErrors } = engine.validateBatch(raw, { fallbackName: header.name, root: engine.root });
  errors.push(...engineErrors);
  for (const s of staged) {
    if (s.design) for (const p of await designProblems(s.design)) errors.push(`post ${s.postKey}: ${p}`);
  }
  return [...new Set(errors)];
}

export const renderTitle = (title: string) => `Render: ${title}`;

async function enqueueRenders(deps: Deps, posts: Array<Pick<Post, 'id' | 'design' | 'title' | 'batchId'>>, actorId: string | null): Promise<void> {
  for (const p of posts) {
    if (p.design) await enqueueTracked(deps, 'render-post', { postId: p.id }, { singletonKey: p.id }, { title: renderTitle(p.title), actorId, batchId: p.batchId, postId: p.id });
  }
}

async function insertBatch(
  deps: Deps,
  actor: AuditActor & { id: string },
  header: { name: string; title: string; timezone: string; defaultTime: string; defaultNetworks: string[]; periodStart: string | null; periodEnd: string | null; aiDraft?: Prisma.InputJsonValue },
  staged: StagedPost[],
): Promise<{ batch: Batch; posts: Post[] }> {
  const created = await deps.prisma.$transaction(async (tx) => {
    const batch = await tx.batch.create({ data: { ...header, status: 'draft', ownerId: actor.id } });
    const posts: Post[] = [];
    for (const [i, s] of staged.entries()) {
      posts.push(
        await tx.post.create({
          data: {
            batchId: batch.id, postKey: s.postKey, position: i, title: s.title, date: s.date, time: s.time, caption: s.caption,
            networks: s.networks as Prisma.InputJsonValue,
            design: s.design ? (s.design as Prisma.InputJsonValue) : undefined,
            media: [], renderStatus: s.design ? 'queued' : 'none', sources: s.sources, warnings: s.warnings,
          },
        }),
      );
    }
    return { batch, posts };
  });
  await enqueueRenders(deps, created.posts, actor.id);
  return created;
}

function stageManual(inputs: PostInput[], defaultTime: string, startAt = 0): StagedPost[] {
  const seen = new Set<string>();
  return inputs.map((p, i) => {
    const postKey = p.postKey ?? `${String(startAt + i + 1).padStart(2, '0')}-${slugify(p.title)}`;
    if (seen.has(postKey)) throw unprocessable('The batch is not valid', [`post ${postKey}: duplicate id`]);
    seen.add(postKey);
    const { skip = [], ...overrides } = p.networks ?? {};
    return {
      postKey, title: p.title, date: p.date, time: p.time ?? defaultTime, caption: p.caption,
      networks: joinNetworks(skip, overrides as Record<string, NetworkOverride>),
      design: p.design ?? null, sources: p.sources ?? [], warnings: [],
    };
  });
}

// Sources must exist in the vault. Manual posts refuse unknown ids (a typo); imported drafts turn them into warnings.
export async function missingSources(deps: Pick<Deps, 'prisma'>, ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  const valid = unique.filter((i) => /^[0-9a-f-]{36}$/i.test(i));
  const found = valid.length ? await deps.prisma.vaultItem.findMany({ where: { id: { in: valid } }, select: { id: true } }) : [];
  const have = new Set(found.map((f) => f.id));
  return new Set(unique.filter((i) => !have.has(i)));
}

export async function createBatch(deps: Deps, actor: AuditActor & { id: string }, input: z.infer<typeof createBatchInput>) {
  const defaultNetworks = input.defaultNetworks ?? [...(await pipelineEngine()).classicNetworks];
  const name = await uniqueName(deps, input.name ?? slugify(input.title));
  const staged = stageManual(input.posts ?? [], input.defaultTime);
  const errors = await problemsOf({ name, timezone: input.timezone, defaultTime: input.defaultTime, defaultNetworks }, staged);
  const missing = await missingSources(deps, staged.flatMap((s) => s.sources));
  for (const id of missing) errors.push(`source ${id} is not in the vault`);
  if (errors.length) throw unprocessable('The batch is not valid', errors);
  const period = datesOf(staged);
  const { batch, posts } = await insertBatch(
    deps, actor,
    { name, title: input.title, timezone: input.timezone, defaultTime: input.defaultTime, defaultNetworks, periodStart: input.periodStart ?? period.periodStart, periodEnd: input.periodEnd ?? period.periodEnd },
    staged,
  );
  await audit(deps, actor, 'batch.create', 'batch', batch.id, { name: batch.name, title: batch.title, posts: posts.length });
  return { batch, posts };
}

export async function addPosts(deps: Deps, actor: AuditActor & { id: string }, batchId: string, inputs: PostInput[]) {
  const batch = await deps.prisma.batch.findUnique({ where: { id: batchId }, include: { posts: { select: { postKey: true, position: true } } } });
  if (!batch) throw new HttpError(404, 'Batch not found');
  const start = batch.posts.reduce((n, p) => Math.max(n, p.position + 1), 0);
  const staged = stageManual(inputs, batch.defaultTime, start);
  const taken = new Set(batch.posts.map((p) => p.postKey));
  const errors = (await problemsOf(batch, staged)).concat(staged.filter((s) => taken.has(s.postKey)).map((s) => `post ${s.postKey}: duplicate id`));
  for (const id of await missingSources(deps, staged.flatMap((s) => s.sources))) errors.push(`source ${id} is not in the vault`);
  if (errors.length) throw unprocessable('The post is not valid', errors);
  const posts: Post[] = [];
  for (const [i, s] of staged.entries()) {
    posts.push(
      await deps.prisma.post.create({
        data: {
          batchId, postKey: s.postKey, position: start + i, title: s.title, date: s.date, time: s.time, caption: s.caption,
          networks: s.networks as Prisma.InputJsonValue, design: s.design ? (s.design as Prisma.InputJsonValue) : undefined,
          media: [], renderStatus: s.design ? 'queued' : 'none', sources: s.sources, warnings: [],
        },
      }),
    );
  }
  await enqueueRenders(deps, posts, actor.id);
  await audit(deps, actor, 'batch.update', 'batch', batchId, { addedPosts: posts.map((p) => p.postKey) });
  return posts;
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);

export interface ImportResult {
  batch: Batch;
  posts: Post[];
  // Notes for the person importing, not errors: they are also on the posts.
  warnings: string[];
}

// Used by the import endpoint and by the AI drafting job. `raw` is the engine's batch JSON; posts may carry
// `sources: [vaultItemId]` and `warnings: [string]`. Every problem is reported at once as a 422. `aiDraft` marks the
// batch as drafted by the AI and keeps the drafter's notes with it.
export async function importEngineBatch(deps: Deps, actor: AuditActor & { id: string }, raw: unknown, options: { aiDraft?: Prisma.InputJsonValue } = {}): Promise<ImportResult> {
  const engine = await pipelineEngine();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw unprocessable('The batch is not valid', ['the batch must be a JSON object']);
  const input = raw as Record<string, unknown>;
  // The app keeps media in its own bucket, so the engine's mediaRoot folder means nothing here; the validator only wants it present.
  const forValidation = { ...input, mediaRoot: typeof input.mediaRoot === 'string' && input.mediaRoot ? input.mediaRoot : 'media/imported' };
  const { errors, batch: valid } = engine.validateBatch(forValidation, { fallbackName: 'imported', root: engine.root });
  const posts = Array.isArray(input.posts) ? input.posts.map(asRecord) : [];
  const allErrors = [...errors];
  for (const p of posts) if (typeof p.id === 'string' && !POST_KEY_RE.test(p.id)) allErrors.push(`post ${p.id}: id may only use letters, digits, . _ - (up to 60 characters) and cannot be only dots`);
  if (!errors.length) {
    for (const p of posts) {
      if (p.design !== undefined) for (const problem of await designProblems(p.design)) allErrors.push(`post ${String(p.id)}: ${problem}`);
    }
  }
  if (allErrors.length || !valid) throw unprocessable('The batch is not valid', [...new Set(allErrors)]);

  const defaultNetworks = Array.isArray(input.defaultNetworks) ? (input.defaultNetworks as string[]) : [...engine.classicNetworks];
  const importWarnings: string[] = [];
  const allSourceIds = posts.flatMap((p) => strings(p.sources));
  const unknown = await missingSources(deps, allSourceIds);

  const staged: StagedPost[] = posts.map((p) => {
    const warnings = strings(p.warnings);
    const id = String(p.id);
    const sources = strings(p.sources).filter((s) => !unknown.has(s));
    for (const s of strings(p.sources).filter((x) => unknown.has(x))) warnings.push(`Source ${s} is not in the vault, so this post's claims are not linked to it`);

    const rawNetworks = asRecord(p.networks);
    const overrides: Record<string, NetworkOverride> = {};
    const legacyFiles: string[] = [];
    const names = (list: unknown) => (Array.isArray(list) ? list.map((m) => (typeof m === 'string' ? m : String(asRecord(m).file ?? ''))).filter(Boolean) : []);
    legacyFiles.push(...names(p.media));
    for (const [n, o] of Object.entries(rawNetworks)) {
      const { media, ...rest } = asRecord(o);
      legacyFiles.push(...names(media));
      overrides[n] = rest as NetworkOverride;
    }
    if (legacyFiles.length && p.design === undefined) {
      const msg = `Post ${id} names media files (${[...new Set(legacyFiles)].join(', ')}) that were not imported. Upload the images to this post before approving it`;
      warnings.push(msg);
      importWarnings.push(msg);
    }
    return {
      postKey: id, title: typeof p.title === 'string' && p.title ? p.title : id, date: String(p.date),
      time: typeof p.time === 'string' ? p.time : valid.defaultTime, caption: String(p.caption),
      networks: joinNetworks(strings(p.skip), overrides),
      design: p.design === undefined ? null : asRecord(p.design), sources, warnings,
    };
  });
  for (const s of unknown) importWarnings.push(`Source ${s} is not in the vault`);

  const period = datesOf(staged);
  const suppliedStart = typeof input.periodStart === 'string' && DATE.test(input.periodStart) ? input.periodStart : null;
  const suppliedEnd = typeof input.periodEnd === 'string' && DATE.test(input.periodEnd) ? input.periodEnd : null;
  const name = await uniqueName(deps, valid.name);
  const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 200) : valid.name;
  const created = await insertBatch(
    deps, actor,
    { name, title, timezone: valid.timezone, defaultTime: valid.defaultTime, defaultNetworks, periodStart: suppliedStart ?? period.periodStart, periodEnd: suppliedEnd ?? period.periodEnd, ...(options.aiDraft ? { aiDraft: options.aiDraft } : {}) },
    staged,
  );
  await audit(deps, actor, 'batch.import', 'batch', created.batch.id, { name, posts: created.posts.length, warnings: importWarnings.length });
  return { ...created, warnings: importWarnings };
}

export async function patchBatch(deps: Deps, actor: AuditActor & { id: string }, id: string, input: z.infer<typeof patchBatchInput>) {
  const batch = await deps.prisma.batch.findUnique({ where: { id }, include: { posts: true } });
  if (!batch) throw new HttpError(404, 'Batch not found');
  const timing = input.timezone !== undefined || input.defaultTime !== undefined || input.defaultNetworks !== undefined;
  if (timing) {
    const sent = await deps.prisma.delivery.count({ where: { post: { batchId: id }, status: { in: ['created', 'unknown'] } } });
    if (sent) throw new HttpError(409, 'Posts from this batch are already in Buffer, so its time zone, default time and networks can no longer change');
  }
  const next = {
    timezone: input.timezone ?? batch.timezone,
    defaultTime: input.defaultTime ?? batch.defaultTime,
    defaultNetworks: input.defaultNetworks ?? batch.defaultNetworks,
  };
  const engine = await pipelineEngine();
  const problems: string[] = [];
  if (!engine.validTimeZone(next.timezone)) problems.push(`timezone "${next.timezone}" is not a valid IANA time zone (for example Europe/London)`);
  if (problems.length) throw unprocessable('The batch is not valid', problems);
  const changed = Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined);
  const updated = await deps.prisma.$transaction(async (tx) => {
    const row = await tx.batch.update({
      where: { id },
      data: { ...(input.title !== undefined ? { title: input.title } : {}), ...next, ...(input.periodStart !== undefined ? { periodStart: input.periodStart } : {}), ...(input.periodEnd !== undefined ? { periodEnd: input.periodEnd } : {}) },
    });
    // The time zone, default time and networks decide when and where a post goes, so earlier approvals no longer stand.
    if (timing) {
      await tx.post.updateMany({ where: { batchId: id, status: 'approved' }, data: { status: 'draft', approvedById: null, approvedAt: null } });
    }
    return row;
  });
  const reset = timing ? batch.posts.filter((p) => p.status === 'approved').length : 0;
  await audit(deps, actor, 'batch.update', 'batch', id, { fields: changed, approvalsReset: reset });
  return updated;
}

// Only while nothing has gone to Buffer. A delivery that was marked absent never reached Buffer; every other one did, or may have.
export async function deleteBatch(deps: Deps, actor: AuditActor & { id: string; role?: string }, id: string): Promise<void> {
  const batch = await deps.prisma.batch.findUnique({ where: { id }, include: { posts: { select: { id: true, media: true } } } });
  if (!batch) throw new HttpError(404, 'Batch not found');
  if (actor.role !== 'admin' && batch.ownerId !== actor.id) throw new HttpError(403, 'Only an admin or the person who made the batch can delete it');
  const sent = await deps.prisma.delivery.count({ where: { post: { batchId: id }, status: { not: 'failed' } } });
  if (sent) throw new HttpError(409, 'Posts from this batch have been sent to Buffer, so the batch cannot be deleted. Delete them in Buffer first if they should go');
  const keys = batch.posts.flatMap((p) => (Array.isArray(p.media) ? (p.media as Array<{ key?: string }>).map((m) => m.key).filter((k): k is string => !!k) : []));
  await deps.prisma.batch.delete({ where: { id } });
  await Promise.all(keys.map((k) => deps.storage.deleteObject(k).catch(() => undefined)));
  await audit(deps, actor, 'batch.delete', 'batch', id, { name: batch.name, posts: batch.posts.length });
}
