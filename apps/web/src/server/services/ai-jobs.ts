// The work behind the draft-batch, research-run and rewrite-post jobs. Each loads the stored AI settings, calls the
// AI seam (ai.ts) and saves what came back. Anything the AI returns is untrusted text: research results go into the
// vault as unconfirmed items, and nothing here confirms, approves or sends.
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { loadAI, type DraftBatchResult, type ResearchResult } from '../ai.js';
import { audit } from '../audit.js';
import { noHandle, readableError, trackRun, type RunHandle } from './activity.js';
import type { Deps } from '../deps.js';
import { HttpError } from '../http.js';
import { getAiConfig, getSetting, SETTING_RESEARCH_LAST_RUN, SETTING_TOPICS, setSetting, type AiRunContext } from './ai-config.js';
import { linkVaultPhotos, vaultForAi, vaultListForAi, kindFromAi } from './ai-vault.js';
import { ensureScreenFraming } from './screen-framing.js';
import { importEngineBatch, NETWORK_NAMES } from './batches.js';
import { createVaultItemFromSystem, VAULT_KINDS } from './vault.js';
import { brandInfo } from '../brand.js';
import { proposalOf, syncBrand } from './brand-settings.js';
import { layoutProblems } from './layouts.js';
import { loadPost, patchPost, patchPostInput } from './posts.js';
import { splitNetworks, joinNetworks, type NetworkOverride } from './post-model.js';

const isKind = (k: string): k is (typeof VAULT_KINDS)[number] => (VAULT_KINDS as readonly string[]).includes(k);
const SOURCE_NOTES_MAX = 20_000;
// Photos and screens need a file, which research cannot supply.
const RESEARCH_KINDS = VAULT_KINDS.filter((k) => k !== 'photo' && k !== 'screen');

// Every decrypted key in the config, so a run can keep them out of what it stores if a provider error quotes one.
const keysOf = (config: Awaited<ReturnType<typeof getAiConfig>>): string[] => [...config.providers.map((p) => p.apiKey), ...(config.search ? [config.search.apiKey] : [])].filter(Boolean);

async function aiFor(deps: Deps, task: 'draft' | 'research' | 'rewrite', run: AiRunContext = {}, handle: RunHandle = noHandle) {
  // The AI library reads the brand from the pack folder: make it match the brand saved in Settings first.
  await syncBrand(deps);
  const config = await getAiConfig(deps, run);
  handle.hide(...keysOf(config));
  if (!config.providers.some((p) => p.tasks.includes(task))) {
    throw new Error(`No AI provider is set up for ${task}. Add one in Settings, AI and search.`);
  }
  const { createAI } = await loadAI();
  return { ai: createAI(config), config };
}

const vaultView = (i: { id: string; kind: string; title: string; body: string; status: string; sourceUrl: string | null; validUntil: Date | null; recordedAt: Date | null }) => ({
  id: i.id, kind: i.kind.replace(/_/g, '-'), title: i.title, body: i.body, status: i.status, sourceUrl: i.sourceUrl,
  validUntil: i.validUntil?.toISOString() ?? null, recordedAt: i.recordedAt?.toISOString() ?? null,
});

// ---- research ----

export function runResearch(deps: Deps, payload: { actorId?: string; topics?: string[]; activityId?: string }): Promise<{ created: number; checked: number }> {
  return trackRun(deps, 'research-run', payload, () => ({ title: 'Research run', actorId: payload.actorId ?? null }), (handle) => researchNow(deps, payload, handle));
}

const cap = (text: unknown, n: number) => String(text ?? '').slice(0, n);

// The AI library's notes for a research run, cut to a size that is safe to keep: what it searched, read and skipped
// (pages dropped as too old included) and what it dropped, with no keys and no page text.
function researchNotes(notes: unknown): Record<string, unknown> {
  const n = (notes ?? {}) as Record<string, unknown>;
  const topics = Array.isArray(n.topics) ? n.topics : [];
  const dropped = Array.isArray(n.dropped) ? n.dropped : [];
  return {
    windowStart: typeof n.windowStart === 'string' ? n.windowStart : null,
    model: typeof n.model === 'string' ? n.model : null,
    ...(typeof n.stoppedEarly === 'string' ? { stoppedEarly: cap(n.stoppedEarly, 300) } : {}),
    topics: topics.slice(0, 12).map((t) => {
      const x = (t ?? {}) as Record<string, unknown>;
      return {
        topic: cap(x.topic, 200), results: Number(x.results) || 0, pagesRead: Number(x.pagesRead) || 0,
        skipped: (Array.isArray(x.skipped) ? x.skipped : []).slice(0, 20).map((r) => cap(r, 300)),
      };
    }),
    dropped: dropped.slice(0, 40).map((d) => {
      const x = (d ?? {}) as Record<string, unknown>;
      return { title: cap(x.title, 200), reason: cap(x.reason, 300) };
    }),
  };
}

async function researchNow(deps: Deps, payload: { actorId?: string; topics?: string[] }, handle: RunHandle): Promise<{ created: number; checked: number }> {
  handle.progress({ step: 'Reading the vault' });
  const stored = await getSetting<unknown>(deps, SETTING_TOPICS, []);
  const topics = (payload.topics?.length ? payload.topics : Array.isArray(stored) ? (stored as string[]) : []).filter((t) => typeof t === 'string' && t.trim());
  if (!topics.length) throw new Error('There are no research topics. Add some in Settings, AI and search.');
  const { ai, config } = await aiFor(deps, 'research', {}, handle);
  const since = await getSetting<string | null>(deps, SETTING_RESEARCH_LAST_RUN, null);
  const startedAt = deps.now();
  const vault = (await deps.prisma.vaultItem.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: 'desc' }, take: 300 })).map(vaultView);

  let result: ResearchResult;
  try {
    result = await ai.research({ topics, vault, ...(since ? { since } : {}), onProgress: (p) => handle.progress(p) });
  } finally {
    await config.flush();
  }

  let created = 0;
  handle.progress({ step: 'Saving what was found', done: 0, total: (result.items ?? []).length });
  for (const item of result.items ?? []) {
    if (!item || typeof item.title !== 'string' || !item.title.trim()) continue;
    const urls = (Array.isArray(item.sourceUrls) ? item.sourceUrls : []).filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
    const found = item.foundAt ? new Date(item.foundAt) : null;
    await createVaultItemFromSystem(deps, {
      kind: isKind(kindFromAi(String(item.kind))) && (RESEARCH_KINDS as readonly string[]).includes(kindFromAi(String(item.kind))) ? (kindFromAi(String(item.kind)) as (typeof VAULT_KINDS)[number]) : 'news',
      title: String(item.title),
      body: typeof item.body === 'string' ? item.body : '',
      sourceUrl: urls[0] ?? null,
      sourceNotes: `Found by AI research on ${startedAt.toISOString().slice(0, 10)}. Not checked by a person.${urls.length ? `\nSources:\n${urls.join('\n')}` : ''}`.slice(0, SOURCE_NOTES_MAX),
      recordedAt: found && !Number.isNaN(found.getTime()) ? found : null,
      tags: ['ai-research'],
      createdById: null,
    }, { id: payload.actorId ?? null });
    created += 1;
  }

  let checked = 0;
  for (const check of result.checks ?? []) {
    const target = check?.vaultItemId ? await deps.prisma.vaultItem.findUnique({ where: { id: String(check.vaultItemId) } }) : null;
    if (!target) continue;
    const urls = (Array.isArray(check.sourceUrls) ? check.sourceUrls : []).filter((u) => typeof u === 'string');
    // Notes only: a check never changes the item's status or words, so it cannot confirm or unconfirm anything.
    const line = `[AI check ${startedAt.toISOString().slice(0, 10)}] ${String(check.verdict).slice(0, 40)}: ${String(check.note ?? '').slice(0, 1000)}${urls.length ? ` (${urls.join(', ')})` : ''}`;
    await deps.prisma.vaultItem.update({ where: { id: target.id }, data: { sourceNotes: `${target.sourceNotes ? `${target.sourceNotes}\n` : ''}${line}`.slice(-SOURCE_NOTES_MAX) } });
    checked += 1;
  }

  await setSetting(deps, SETTING_RESEARCH_LAST_RUN, startedAt.toISOString());
  await audit(deps, payload.actorId ? { id: payload.actorId } : null, 'ai.research', 'research', null, { topics: topics.length, created, checked });
  handle.result({ created, checked, ...researchNotes((result as { notes?: unknown }).notes) });
  return { created, checked };
}

// ---- rewrite ----

const rewritePayload = z.object({ postId: z.string().min(1), instruction: z.string().trim().min(1).max(2000), apply: z.boolean().optional(), actorId: z.string().optional(), activityId: z.string().optional() });

// Returns the AI's new version of the post. Without `apply` it is not saved (the caller decides). With `apply` (what the
// post page's "Rewrite with AI" does) it is saved through the same edit as a person's, so the usual checks run, an
// approved post goes back to Writing, and a changed design is made again.
export async function runRewrite(deps: Deps, rawPayload: unknown): Promise<Record<string, unknown>> {
  const payload = rewritePayload.parse(rawPayload);
  const activityId = (rawPayload as { activityId?: string }).activityId;
  return trackRun(deps, 'rewrite-post', { activityId }, async () => {
    const post = await deps.prisma.post.findUnique({ where: { id: payload.postId }, select: { title: true, batchId: true } });
    return { title: `Rewrite: ${post?.title ?? 'a post'}`, actorId: payload.actorId ?? null, batchId: post?.batchId ?? null, postId: post ? payload.postId : null };
  }, (handle) => rewriteNow(deps, payload, handle));
}

async function rewriteNow(deps: Deps, payload: z.infer<typeof rewritePayload>, handle: RunHandle): Promise<Record<string, unknown>> {
  handle.progress({ step: 'Asking the AI' });
  const post = await deps.prisma.post.findUnique({ where: { id: payload.postId } });
  if (!post) throw new Error('The post was not found');
  const { ai, config } = await aiFor(deps, 'rewrite', {}, handle);
  const sources = post.sources.length
    ? await deps.prisma.vaultItem.findMany({ where: { id: { in: post.sources }, deletedAt: null } })
    : [];
  let result: Record<string, unknown>;
  try {
    result = await ai.rewrite({
      post: { id: post.postKey, postKey: post.postKey, title: post.title, date: post.date, time: post.time, caption: post.caption, networks: splitNetworks(post.networks).overrides, design: post.design, sources: post.sources },
      instruction: payload.instruction,
      // Not filtered here: the library hides what is not usable and says why when the post still cites it.
      vault: sources.map((i) => vaultForAi(i, deps.now())),
    });
  } finally {
    await config.flush();
  }
  await audit(deps, payload.actorId ? { id: payload.actorId } : null, 'ai.rewrite_post', 'post', post.id, { instruction: payload.instruction, result });
  if (!payload.apply) {
    handle.result({ postId: post.id, instruction: cap(payload.instruction, 300) });
    return result;
  }
  handle.progress({ step: 'Saving the new words' });
  const changes = await applyRewrite(deps, payload, post, result);
  handle.result({ postId: post.id, instruction: cap(payload.instruction, 300), applied: true, changed: changes.fields, before: { caption: cap(post.caption, 1500) }, after: { caption: cap(changes.caption, 1500) }, approvalWithdrawn: post.status === 'approved' && changes.contentChanged });
  return result;
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

// JSON with the keys in a fixed order, so two values that say the same thing compare equal (the database keeps keys in its own order).
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => (Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sort(x)])) : v);
  return JSON.stringify(sort(value));
}
const normalisedNetworks = (value: unknown) => { const { skip, overrides } = splitNetworks(value); return joinNetworks(skip, overrides); };

// The post's networks after a rewrite, or null when the rewrite changes none of them. The AI may only add or change the words of
// a network the post already goes to; an empty entry, a network the post does not go to, and a file list are ignored, and the
// settings the post already has for a network are kept.
function rewrittenNetworks(current: unknown, fromAi: unknown, defaults: string[]): Record<string, unknown> | null {
  const { skip, overrides } = splitNetworks(current);
  const merged: Record<string, NetworkOverride> = { ...overrides };
  for (const [network, offered] of Object.entries(splitNetworks(fromAi).overrides)) {
    if (!(network in overrides) && !defaults.includes(network)) continue;
    const { media: _files, ...rest } = offered;
    const real = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && !(typeof v === 'string' && !v.trim())));
    if (Object.keys(real).length) merged[network] = { ...overrides[network], ...real };
  }
  const next = joinNetworks(skip, merged);
  return canonical(next) === canonical(joinNetworks(skip, overrides)) ? null : next;
}

// Saves the AI's version as an edit by the person who asked. A rewrite that does not pass the edit checks fails the run
// with the reason and leaves the post as it was.
async function applyRewrite(deps: Deps, payload: z.infer<typeof rewritePayload>, post: { id: string; networks: unknown; caption: string; status: string }, result: Record<string, unknown>) {
  const actor = payload.actorId ? await deps.prisma.user.findUnique({ where: { id: payload.actorId }, select: { id: true, email: true } }) : null;
  if (!actor) throw new Error('The person who asked for the rewrite could not be found');
  const input: Record<string, unknown> = {};
  if (isText(result.title)) input.title = result.title;
  if (isText(result.caption)) input.caption = result.caption;
  if (typeof result.date === 'string') input.date = result.date;
  if (typeof result.time === 'string') input.time = result.time;
  if (result.design && typeof result.design === 'object' && !Array.isArray(result.design)) input.design = result.design;
  if (Array.isArray(result.sources)) input.sources = result.sources.filter(isText);
  // Per-network captions from the AI, merged into what the post already has. Nothing changes when the AI sends nothing real.
  const before = await loadPost(deps, post.id);
  const networks = rewrittenNetworks(post.networks, result.networks, before.batch.defaultNetworks);
  if (networks) input.networks = networks;
  const parsed = patchPostInput.parse(input);
  const after = await patchPost(deps, actor, post.id, parsed);
  const view = (p: object, k: string) => { const v = (p as Record<string, unknown>)[k]; return canonical(k === 'networks' ? normalisedNetworks(v) : v ?? null); };
  const fields = (['title', 'caption', 'date', 'time', 'networks', 'design', 'sources'] as const).filter((k) => view(before, k) !== view(after, k));
  return { fields, caption: after.caption, contentChanged: fields.some((f) => f !== 'title') };
}

// ---- design references ----

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function runAnalyseReference(deps: Deps, payload: { referenceId: string; actorId?: string; activityId?: string }): Promise<void> {
  const meta = async () => {
    const r = await deps.prisma.designReference.findUnique({ where: { id: payload.referenceId }, select: { fileName: true } });
    return { title: `Describe design reference ${r?.fileName ?? ''}`.trim(), actorId: payload.actorId ?? null };
  };
  return trackRun(deps, 'analyse-reference', payload, meta, (handle) => analyseNow(deps, payload, handle));
}

// The AI looks at the picture and writes the style brief drafts are given. A failure is kept on the reference so the page can
// say what went wrong; the brief people may have edited is replaced only by a new successful analysis.
async function analyseNow(deps: Deps, payload: { referenceId: string; actorId?: string }, handle: RunHandle): Promise<void> {
  const ref = await deps.prisma.designReference.findUnique({ where: { id: payload.referenceId } });
  if (!ref) return;
  if (!IMAGE_TYPES.includes(ref.contentType)) throw new Error('The reference is not a picture the AI can read');
  await deps.prisma.designReference.update({ where: { id: ref.id }, data: { status: 'analysing', error: null } });
  try {
    handle.progress({ step: 'Reading the picture' });
    const data = await deps.storage.getObject(ref.fileKey);
    const { ai, config } = await aiFor(deps, 'draft', { actorId: payload.actorId ?? null }, handle);
    let out;
    handle.progress({ step: 'Asking the AI to describe the style' });
    try {
      out = await ai.analyseReference({ image: { mediaType: ref.contentType, data }, note: ref.note || null });
    } finally {
      await config.flush();
    }
    // The style settings the AI proposes are checked against the settings' own lists before they are stored; a proposal that
    // does not pass is left out (the brief still counts).
    const { proposal: _raw, composition: _layout, ...rest } = out.analysis as Record<string, unknown>;
    const proposal = proposalOf(out.analysis);
    // The composition (a layout the reference suggests) is checked again by the engine's layout validator; one that does not pass
    // is left out. It is only ever used when an admin previews it and adds it in Settings, Layouts.
    const composition = _layout && !(await layoutProblems(_layout)).length ? _layout : null;
    const analysis = { ...rest, ...(proposal ? { proposal } : {}), ...(composition ? { composition } : {}) };
    await deps.prisma.designReference.update({ where: { id: ref.id }, data: { status: 'ready', analysis: analysis as Prisma.InputJsonValue, brief: out.brief.slice(0, 2000), error: null } });
    await audit(deps, payload.actorId ? { id: payload.actorId } : null, 'design_reference.analysed', 'design_reference', ref.id, { promptVersion: out.notes?.promptVersion ?? null, model: out.notes?.model ?? null, proposal: !!proposal, composition: !!composition });
    await syncBrand(deps);
    handle.result({ referenceId: ref.id });
  } catch (err) {
    const message = readableError(err, [deps.config.authSecret]);
    await deps.prisma.designReference.update({ where: { id: ref.id }, data: { status: 'failed', error: message.slice(0, 500) } });
    throw err;
  }
}

// ---- draft ----

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const draftBriefSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  periodStart: z.string().regex(DATE, 'Use a date like 2026-12-01').optional(),
  periodEnd: z.string().regex(DATE, 'Use a date like 2026-12-31').optional(),
  count: z.number().int().min(1).max(30).optional(),
  series: z.array(z.string().regex(/^[a-z0-9-]+$/).max(40)).min(1).max(12).optional(),
  channels: z.array(z.enum(NETWORK_NAMES)).min(1).max(4).optional(),
  timezone: z.string().min(1).max(64).optional(),
  // The team's own words for this batch (what to cover, how varied); the AI treats them as preferences, never as facts.
  guidance: z.string().trim().min(1).max(600).optional(),
});
export type DraftBrief = z.infer<typeof draftBriefSchema>;

const draftPayload = z.object({ actorId: z.string().min(1), brief: draftBriefSchema.optional(), activityId: z.string().optional() });

export const draftTitle = (deps: Pick<Deps, 'now'>, brief: DraftBrief = {}): string =>
  brief.title ?? `AI draft for ${monthLabel(brief.periodStart && brief.periodEnd ? brief.periodStart : nextMonth(deps.now()).from)}`;

const monthLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// The first and last day of the month after `now`, which is what a brief without a period means.
function nextMonth(now: Date): { from: string; to: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

const problemsText = (e: unknown): string => {
  if (e instanceof HttpError && Array.isArray(e.details)) return `${e.message}: ${(e.details as unknown[]).map(String).join('; ')}`;
  return String((e as Error)?.message ?? e);
};

// Asks the AI for a batch and makes it a real one: a draft batch owned by the person who asked, imported through the same
// path as a batch file (so every engine and design rule applies), with each post linked to its vault sources, the AI's
// warnings on the post, and the drafter's notes kept on the batch. Rendering is queued by the import. All or nothing: if
// the AI fails, the budget is used up or the answer does not pass the checks, no batch is made, the failure is written to
// the audit log as `ai.draft_batch.failed`, and the job fails so it shows as failed.
export async function runDraftBatch(deps: Deps, rawPayload: unknown): Promise<{ batchId: string; posts: number }> {
  const payload = draftPayload.parse(rawPayload);
  return trackRun(deps, 'draft-batch', payload, () => ({ title: draftTitle(deps, payload.brief), actorId: payload.actorId }), (handle) => draftNow(deps, payload, handle));
}

async function draftNow(deps: Deps, payload: z.infer<typeof draftPayload>, handle: RunHandle): Promise<{ batchId: string; posts: number }> {
  handle.progress({ step: 'Reading the vault' });
  const actor = await deps.prisma.user.findUnique({ where: { id: payload.actorId } });
  if (!actor || actor.disabled) throw new Error('The person who asked for this draft no longer has access');
  const brief = payload.brief ?? {};
  const runId = randomUUID();
  const period = brief.periodStart && brief.periodEnd ? { from: brief.periodStart, to: brief.periodEnd } : nextMonth(deps.now());
  await syncBrand(deps);
  const timezone = brief.timezone ?? brandInfo().timezone;
  let spent: Awaited<ReturnType<typeof getAiConfig>> | null = null;

  try {
    const { ai, config } = await aiFor(deps, 'draft', { runId, actorId: actor.id }, handle);
    spent = config;
    // Only what a person has confirmed, that is current and (photos, screens) has its rights settled is offered: the AI is
    // sent nothing else, and its library rejects a post that cites or pictures anything else (vaultListForAi).
    const items = await deps.prisma.vaultItem.findMany({
      where: { deletedAt: null, status: 'confirmed' },
      orderBy: { updatedAt: 'desc' }, take: 500,
    });
    let result: DraftBatchResult;
    try {
      await ensureScreenFraming(deps, items);
      result = await ai.draftBatch({
        vault: vaultListForAi(items, deps.now()),
        ...(brief.series ? { series: brief.series } : {}),
        period,
        count: brief.count ?? 10,
        ...(brief.channels ? { channels: brief.channels } : {}),
        ...(brief.guidance ? { guidance: brief.guidance } : {}),
        timezone,
        onProgress: (p: { step: string; done?: number; total?: number }) => handle.progress(p),
      } as Parameters<typeof ai.draftBatch>[0]);
    } finally {
      await config.flush();
    }

    const drafted = result?.batch;
    const posts = drafted && Array.isArray((drafted as { posts?: unknown }).posts) ? ((drafted as { posts: unknown[] }).posts) : null;
    if (!drafted || !posts?.length) throw new Error('The AI returned no posts, so no batch was made');
    const raw = {
      ...drafted,
      title: brief.title ?? `AI draft for ${monthLabel(period.from)}`,
      periodStart: period.from,
      periodEnd: period.to,
      posts: posts.map((p) => {
        const { design, photoIds: _photoIds, ...rest } = (p ?? {}) as Record<string, unknown>;
        return { ...rest, ...(design === undefined ? {} : { design: linkVaultPhotos(design).design }) };
      }),
    };
    const aiDraft = {
      ...(result.notes ?? {}), runId, draftedAt: deps.now().toISOString(), requestedById: actor.id,
      brief: { count: brief.count ?? 10, series: brief.series ?? null, channels: brief.channels ?? null, period, timezone },
    };
    handle.progress({ step: 'Saving the batch', done: 0, total: posts.length });
    let imported;
    try {
      imported = await importEngineBatch(deps, { id: actor.id, email: actor.email }, raw, { aiDraft: aiDraft as Prisma.InputJsonValue });
    } catch (e) {
      throw new Error(`The AI's draft did not pass the app's checks, so no batch was made. ${problemsText(e)}`.slice(0, 1500));
    }
    await deps.prisma.aiCall.updateMany({ where: { runId }, data: { batchId: imported.batch.id } });
    await audit(deps, { id: actor.id, email: actor.email }, 'ai.draft_batch', 'batch', imported.batch.id, {
      runId, posts: imported.posts.length, rejected: Array.isArray((result.notes as { rejected?: unknown[] } | undefined)?.rejected) ? ((result.notes as { rejected: unknown[] }).rejected.length) : 0,
    });
    const withImages = imported.posts.filter((p) => p.design).length;
    handle.progress({ step: withImages ? 'Images queued for rendering' : 'Batch saved' });
    handle.result({ batchId: imported.batch.id, title: imported.batch.title, delivered: imported.posts.length, requested: brief.count ?? 10, imagesQueued: withImages });
    return { batchId: imported.batch.id, posts: imported.posts.length };
  } catch (e) {
    await spent?.flush().catch(() => undefined);
    const err = e as { code?: unknown; message?: unknown };
    await audit(deps, { id: actor.id, email: actor.email }, 'ai.draft_batch.failed', 'batch', null, {
      runId, code: typeof err.code === 'string' ? err.code : null, error: String(err.message ?? e).slice(0, 1500),
    });
    throw e;
  }
}
