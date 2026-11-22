// Scheduling: the plan (what a send would do, per post and network), the send job, status refresh, manual resolution of
// unclear answers, and deleting a Buffer post.
//
// Rules carried over from the engine and never relaxed here:
//  - only approved posts are sent;
//  - an answer that is not clearly a success or a refusal is stored as "unknown" and is never retried;
//  - a draft goes first, then the same content is made live (or the owner's setting allows going straight to live);
//  - media is copied to the public prefix only for what is about to be sent.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Batch, Delivery, Post } from '@prisma/client';
import { audit, type AuditActor } from '../audit.js';
import type { Deps } from '../deps.js';
import { pipelineEngine, type EngineItem, type EngineRow, type EngineState, type PipelineEngine, type PushSummary } from '../engine/pipeline.js';
import { HttpError } from '../http.js';
import { describeError, logger } from '../log.js';
import { type RunHandle, enqueueTracked, trackRun } from './activity.js';
import { approvalProblems, itemsForPosts } from './approval.js';
import { clientsFor, loadAccountsConfig, type AccountsConfig } from './buffer-accounts.js';
import { createPersister, stateFromDeliveries, type DeliveryWithPostKey } from './delivery-state.js';
import { assertInside, engineRel, mediaFor, rawBatchForEngine, targetNetworks } from './post-model.js';

// Network names as people read them, for the plan's notes.
const NETWORK_LABEL: Record<string, string> = { instagram: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook', x: 'X' };

export type Mode = 'draft' | 'live';
type Actor = AuditActor & { id: string; role?: string };

const settingKey = (batchId: string) => `send:${batchId}`;
const ALLOW_DIRECT_LIVE = 'allowDirectLive';

// ---- the plan ----

export interface PlanRow {
  postId: string;
  postKey: string;
  title: string;
  network: string;
  account: string | null;
  channelId: string | null;
  // The time as the team wrote it (batch time zone) and as Buffer receives it.
  dueAtLocal: string;
  dueAtUtc: string;
  action: 'create' | 'skip' | 'refuse';
  promote: boolean;
  // Why a row is skipped or refused, or a note on what a create does.
  explanation: string | null;
  warnings: string[];
  // Things missing before this row can be sent: a route, a channel, a key, a time in the future.
  problems: string[];
  needsDraftFirst: boolean;
  willSend: boolean;
  media: number;
}

export interface Plan {
  batchId: string;
  mode: Mode;
  rows: PlanRow[];
  // Posts x channels in this plan: the number the confirm dialog shows.
  count: number;
  willSend: number;
  approvedPosts: number;
  notApproved: number;
  // Changes whenever anything that decides what would be sent changes. The send must quote it.
  token: string;
  allowDirectLive: boolean;
}

interface Context {
  batch: Batch & { posts: Array<Post & { deliveries: Delivery[] }> };
  approved: Array<Post & { deliveries: Delivery[] }>;
  cfg: AccountsConfig;
  engine: PipelineEngine;
  state: EngineState;
  engineRows: EngineRow[];
  items: EngineItem[];
  plan: Plan;
}

async function loadConfig(deps: Deps): Promise<AccountsConfig> {
  try {
    return await loadAccountsConfig(deps);
  } catch {
    throw new HttpError(409, 'A stored Buffer key cannot be read. Ask an admin to enter the key again under Channels');
  }
}

const unknownReason = 'unknown, check Buffer: an earlier attempt got no clear answer. Refresh the status, or resolve it by hand once you have looked in Buffer';

export async function buildPlan(deps: Deps, batchId: string, mode: Mode): Promise<Context> {
  const batch = /^[0-9a-f-]{36}$/i.test(batchId)
    ? await deps.prisma.batch.findUnique({ where: { id: batchId }, include: { posts: { orderBy: { position: 'asc' }, include: { deliveries: true } } } })
    : null;
  if (!batch) throw new HttpError(404, 'Batch not found');
  const engine = await pipelineEngine();
  const approved = batch.posts.filter((p) => p.status === 'approved');
  const cfg = await loadConfig(deps);
  const allowDirectLive = (await deps.prisma.appSetting.findUnique({ where: { key: ALLOW_DIRECT_LIVE } }))?.value === true;
  const emptyPlan: Plan = { batchId, mode, rows: [], count: 0, willSend: 0, approvedPosts: approved.length, notApproved: batch.posts.filter((p) => p.status === 'draft').length, token: '', allowDirectLive };
  if (!approved.length) return { batch, approved, cfg, engine, state: { batch: batch.name, posts: {} }, engineRows: [], items: [], plan: emptyPlan };

  const { errors, items } = await itemsForPosts({ prisma: deps.prisma }, batch, approved);
  if (errors.length) throw new HttpError(409, 'An approved post is no longer valid. Open it in review to fix it', errors);
  const flat: DeliveryWithPostKey[] = batch.posts.flatMap((p) => p.deliveries.map((d) => ({ ...d, post: { postKey: p.postKey } })));
  const state = stateFromDeliveries(batch.name, flat);
  const engineRows = engine.planRows(items, state, { live: mode === 'live' });
  const now = deps.now().getTime();

  const blockersByPost = new Map<string, string[]>();
  for (const p of approved) blockersByPost.set(p.id, await approvalProblems(deps, { ...p, batch }));

  const rows: PlanRow[] = engineRows.map((r) => {
    const item = r.item;
    const post = approved.find((p) => p.postKey === item.postId)!;
    const rec = state.posts[item.postId]?.[item.network];
    const problems: string[] = [];
    const account = item.account ? cfg.accounts.find((a) => a.name === item.account) : undefined;
    if (!item.account) problems.push(`No Buffer account is set for ${NETWORK_LABEL[item.network] ?? item.network}. An admin chooses one in Settings, Channels`);
    else if (!account) problems.push(`The Buffer account "${item.account}" no longer exists`);
    else if (!account.apiKey) problems.push(`The Buffer account "${item.account}" has no key`);
    if (item.account && !item.channelId) problems.push(`No channel is set for ${NETWORK_LABEL[item.network] ?? item.network}. An admin chooses one in Settings, Channels`);
    if (r.action === 'create' && mode === 'live' && Date.parse(item.dueAt) <= now) problems.push(`The due time (${item.date} ${item.time}) has passed`);
    // Approval can go stale: a source unconfirmed or deleted, a photo's rights changed, a time that has passed.
    for (const b of blockersByPost.get(post.id) ?? []) problems.push(`Approval no longer holds: ${b}`);
    const needsDraftFirst = r.action === 'create' && mode === 'live' && !r.promote && !allowDirectLive;
    if (needsDraftFirst) problems.push('Send this as a draft first. It can go live once the draft is in Buffer');
    const explanation = rec?.status === 'unknown' && r.action === 'refuse' ? unknownReason : (r.reason ?? r.note ?? null);
    return {
      postId: post.id, postKey: item.postId, title: item.title, network: item.network, account: item.account, channelId: item.channelId,
      dueAtLocal: `${item.date} ${item.time}`, dueAtUtc: item.dueAt, action: r.action, promote: !!r.promote, explanation,
      warnings: item.warnings, problems, needsDraftFirst,
      willSend: r.action === 'create' && problems.length === 0, media: item.media.length,
    };
  });
  const token = createHash('sha256')
    .update(JSON.stringify({ mode, rows: rows.map((r) => [r.postKey, r.network, r.account, r.channelId, r.dueAtUtc, items.find((i) => i.postId === r.postKey && i.network === r.network)?.hash, r.action, r.promote, r.willSend, r.problems]) }))
    .digest('hex')
    .slice(0, 32);
  const plan: Plan = { ...emptyPlan, rows, count: rows.length, willSend: rows.filter((r) => r.willSend).length, token };
  return { batch, approved, cfg, engine, state, engineRows, items, plan };
}

// ---- requesting a send ----

export interface SendRequest {
  mode: Mode;
  confirm: { postsXChannels: number; token: string };
}

const canGoLive = (actor: Actor, batch: Batch) => actor.role === 'admin' || actor.id === batch.ownerId;

export async function requestSend(deps: Deps, actor: Actor, batchId: string, req: SendRequest): Promise<{ jobId: string | null; plan: Plan }> {
  const ctx = await buildPlan(deps, batchId, req.mode);
  if (req.mode === 'live' && !canGoLive(actor, ctx.batch)) throw new HttpError(403, 'Only an admin or the person who made this batch can send it live');
  if (!ctx.plan.approvedPosts) throw new HttpError(409, 'There are no approved posts in this batch. Approve posts first');
  if (req.confirm.postsXChannels !== ctx.plan.count || req.confirm.token !== ctx.plan.token) {
    throw new HttpError(409, 'The plan changed since you opened it, so nothing was sent. Review the plan again and confirm', { count: ctx.plan.count, token: ctx.plan.token });
  }
  if (req.mode === 'live' && ctx.plan.rows.some((r) => r.needsDraftFirst)) {
    throw new HttpError(409, 'Every post must be in Buffer as a draft before it goes live. Send the drafts first', ctx.plan.rows.filter((r) => r.needsDraftFirst).map((r) => `${r.postKey} / ${r.network}`));
  }
  if (!ctx.plan.willSend) throw new HttpError(409, 'Nothing in this plan can be sent. The plan lists why for each post and channel', ctx.plan.rows.filter((r) => !r.willSend).map((r) => `${r.postKey} / ${r.network}: ${[...r.problems, r.explanation].filter(Boolean).join('; ')}`));

  const { jobId } = await enqueueTracked(deps, 'send-batch', { batchId, mode: req.mode, actorId: actor.id, planToken: ctx.plan.token }, { singletonKey: batchId }, { title: sendTitle(ctx.batch.title, req.mode), actorId: actor.id, batchId });
  await writeRun(deps, batchId, { state: 'queued', mode: req.mode, at: deps.now().toISOString(), actorId: actor.id, count: ctx.plan.count, willSend: ctx.plan.willSend });
  await audit(deps, actor, req.mode === 'live' ? 'schedule.send_live' : 'schedule.send_draft', 'batch', batchId, { count: ctx.plan.count, willSend: ctx.plan.willSend, token: ctx.plan.token, queued: !!jobId });
  return { jobId, plan: ctx.plan };
}

// ---- the last run, kept for the deliveries page ----

export interface RunRecord {
  state: 'queued' | 'running' | 'done' | 'refused';
  mode: Mode;
  at: string;
  actorId?: string;
  count?: number;
  willSend?: number;
  message?: string;
  summary?: Pick<PushSummary, 'created' | 'skipped' | 'refused' | 'failed' | 'unknown' | 'stopped' | 'notAttempted' | 'byAccount'>;
  // What the engine reported, row by row (no keys).
  log?: string[];
}

async function writeRun(deps: Pick<Deps, 'prisma'>, batchId: string, run: RunRecord): Promise<void> {
  const value = JSON.parse(JSON.stringify(run));
  await deps.prisma.appSetting.upsert({ where: { key: settingKey(batchId) }, create: { key: settingKey(batchId), value }, update: { value } });
}

async function lastRun(deps: Pick<Deps, 'prisma'>, batchId: string): Promise<RunRecord | null> {
  const row = await deps.prisma.appSetting.findUnique({ where: { key: settingKey(batchId) } });
  return (row?.value as unknown as RunRecord | undefined) ?? null;
}

// ---- the send job ----

// Every line passes through the masker with every account key, and a Bearer token is masked whatever its value.
export const maskLines = (mask: (text: string, secrets?: string[]) => string, lines: string[], secrets: string[]): string[] => lines.map((l) => mask(l, secrets));

const sendTitle = (batchTitle: string, mode: Mode) => `Send batch ${batchTitle} to Buffer${mode === 'live' ? ' (live)' : ' as drafts'}`;
export const refreshTitle = (batchTitle?: string) => (batchTitle ? `Buffer status check: ${batchTitle}` : 'Buffer status check');

export function sendBatch(deps: Deps, payload: { batchId: string; mode: Mode; actorId: string; planToken?: string; activityId?: string }): Promise<void> {
  const meta = async () => {
    const batch = await deps.prisma.batch.findUnique({ where: { id: payload.batchId }, select: { title: true } });
    return { title: sendTitle(batch?.title ?? 'a batch', payload.mode), actorId: payload.actorId, batchId: batch ? payload.batchId : null };
  };
  return trackRun(deps, 'send-batch', payload, meta, (handle) => sendNow(deps, payload, handle));
}

const LIST_CAP = 100;

async function sendNow(deps: Deps, payload: { batchId: string; mode: Mode; actorId: string; planToken?: string }, handle: RunHandle): Promise<void> {
  const { batchId, mode } = payload;
  const actor = await deps.prisma.user.findUnique({ where: { id: payload.actorId }, select: { id: true, email: true } });
  const startedAt = deps.now().toISOString();
  const lines: string[] = [];
  let tmp: string | null = null;
  const secrets: string[] = [];
  const log = (m: string) => {
    if (lines.length < 300) lines.push(String(m));
  };
  try {
    handle.progress({ step: 'Checking the plan' });
    const ctx = await buildPlan(deps, batchId, mode);
    secrets.push(...ctx.cfg.accounts.map((a) => a.apiKey).filter(Boolean));
    handle.hide(...secrets);
    if (payload.planToken && payload.planToken !== ctx.plan.token) {
      handle.fail('The plan changed after it was confirmed, so nothing was sent. Review the plan again and confirm');
      await writeRun(deps, batchId, { state: 'refused', mode, at: startedAt, actorId: payload.actorId, message: 'The plan changed after it was confirmed, so nothing was sent. Review the plan again and confirm' });
      return;
    }
    if (!ctx.plan.willSend) {
      handle.fail('Nothing in the plan can be sent');
      await writeRun(deps, batchId, { state: 'refused', mode, at: startedAt, actorId: payload.actorId, message: 'Nothing in the plan can be sent' });
      return;
    }
    await writeRun(deps, batchId, { state: 'running', mode, at: startedAt, actorId: payload.actorId, count: ctx.plan.count, willSend: ctx.plan.willSend });
    const { engine } = ctx;
    const sendable = new Set(ctx.plan.rows.filter((r) => r.willSend).map((r) => `${r.postKey}|${r.network}`));
    handle.progress({ step: 'Preparing the images', done: 0, total: sendable.size });

    // Copy the files this send needs out of the private bucket into a temporary media folder laid out the way the engine expects.
    tmp = path.join(os.tmpdir(), `qerr-send-${randomUUID()}`);
    const files = new Map<string, { key: string; sha256: string }>();
    for (const post of ctx.approved) {
      for (const network of targetNetworks(post, ctx.batch.defaultNetworks, engine.networks)) {
        if (!sendable.has(`${post.postKey}|${network}`)) continue;
        for (const m of mediaFor(post, network)) files.set(engineRel(post, m), { key: m.key, sha256: m.sha256 });
      }
    }
    for (const [rel, f] of files) {
      const body = await deps.storage.getObject(f.key);
      if (createHash('sha256').update(body).digest('hex') !== f.sha256) throw new Error(`A stored file changed since it was approved (${rel}). Nothing was sent`);
      const dest = assertInside(tmp, path.join(tmp, rel));
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, body);
    }

    const raw = rawBatchForEngine(ctx.batch, ctx.approved, { mediaRoot: tmp, withDesign: false, withMedia: true, networks: engine.networks });
    const { errors, batch: valid } = engine.validateBatch(raw, { fallbackName: ctx.batch.name, root: engine.root });
    if (errors.length || !valid) throw new Error(`The approved posts are not valid: ${errors.join('; ')}`);
    const { routing } = ctx.cfg;
    const publicConfig = deps.storage.publicConfig;

    const first = engine.resolveItems(valid, { routing, accounts: ctx.cfg.accounts });
    const wanted = first.filter((i) => sendable.has(`${i.postId}|${i.network}`));
    const uploadState = { batch: ctx.batch.name, posts: {}, media: {} as Record<string, unknown> };
    let uploadStopped: string | null = null;
    if (wanted.length) {
      handle.progress({ step: 'Uploading the images', done: 0, total: sendable.size });
      const plan = engine.planUploads({ batch: valid, items: wanted, prefix: publicConfig.prefix, publicBaseUrl: publicConfig.publicBaseUrl });
      const uploaded = await engine.runUpload({ plan, s3: deps.storage, config: publicConfig, state: uploadState, saveState: () => {}, fetchImpl: deps.fetchImpl, log, now: () => deps.now().getTime() });
      uploadStopped = uploaded.stopped;
    }
    if (uploadStopped) {
      handle.fail(engine.maskSecrets(uploadStopped, secrets));
      await writeRun(deps, batchId, { state: 'done', mode, at: startedAt, actorId: payload.actorId, message: uploadStopped, log: maskLines(engine.maskSecrets, lines, secrets) });
      return;
    }

    const items = engine.resolveItems(valid, { routing, accounts: ctx.cfg.accounts, uploaded: uploadState.media });
    const byKey = new Map(items.map((i) => [`${i.postId}|${i.network}`, i]));
    const rows: EngineRow[] = engine.planRows(items, ctx.state, { live: mode === 'live' }).map((r) => {
      const planned = ctx.plan.rows.find((p) => p.postKey === r.item.postId && p.network === r.item.network);
      if (r.action === 'create' && planned && !planned.willSend) return { item: r.item, action: 'refuse', reason: planned.problems.join('; ') };
      return r;
    });
    const clients: Record<string, { gql: (q: string, v?: Record<string, unknown>) => Promise<unknown> }> = {};
    for (const [name, client] of await clientsFor(deps, { ...ctx.cfg, accounts: ctx.cfg.accounts.filter((a) => a.apiKey) })) clients[name] = client;

    const persister = createPersister(deps, {
      state: ctx.state,
      postIds: new Map(ctx.batch.posts.map((p) => [p.postKey, p.id])),
      items: byKey,
    });
    // The engine saves its state after each Buffer answer, so the number of sendable records that changed is how far it got.
    const before = new Map([...sendable].map((k) => { const [post, network] = k.split('|'); return [k, JSON.stringify(ctx.state.posts[post!]?.[network!] ?? null)] as const; }));
    const reportProgress = () => {
      let done = 0;
      for (const [k, was] of before) { const [post, network] = k.split('|'); if (JSON.stringify(ctx.state.posts[post!]?.[network!] ?? null) !== was) done++; }
      handle.progress({ step: 'Sending to Buffer', done, total: sendable.size });
    };
    handle.progress({ step: 'Sending to Buffer', done: 0, total: sendable.size });
    const summary = await engine.runPush({ rows, clients, state: ctx.state, saveState: () => { persister.save(); reportProgress(); }, live: mode === 'live', fetchImpl: deps.fetchImpl, log, now: () => deps.now().getTime() });
    await persister.flush();

    // A batch is "scheduled" once every post that goes out has a live post in Buffer for each of its channels.
    const done = await deps.prisma.delivery.findMany({ where: { post: { batchId } } });
    const live = (postId: string, network: string) => done.some((d) => d.postId === postId && d.network === network && d.status === 'created' && d.mode === 'live');
    const everyLive = ctx.plan.rows.length > 0 && ctx.plan.rows.every((r) => live(r.postId, r.network));
    if (mode === 'live' && everyLive) await deps.prisma.batch.update({ where: { id: batchId }, data: { status: 'scheduled' } });
    else if (ctx.batch.status === 'draft') await deps.prisma.batch.update({ where: { id: batchId }, data: { status: 'in_review' } });

    const { byAccount, notAttempted, stopped, created, skipped, refused, failed, unknown } = summary;
    const outcome = (d: (typeof done)[number]) => ({ title: ctx.batch.posts.find((p) => p.id === d.postId)?.title ?? d.postId, network: d.network });
    const mine = done.filter((d) => sendable.has(`${ctx.batch.posts.find((p) => p.id === d.postId)?.postKey}|${d.network}`));
    const sent = mine.filter((d) => d.status === 'created').map(outcome);
    const notSent = mine.filter((d) => d.status !== 'created').map((d) => ({ ...outcome(d), reason: engine.maskSecrets(d.error ?? d.statusNote ?? 'Buffer did not confirm it', secrets).slice(0, 300) }));
    const skippedRows = ctx.plan.rows.filter((r) => !r.willSend).map((r) => ({ title: r.title, network: r.network, reason: [...r.problems, r.explanation].filter(Boolean).join('; ').slice(0, 300) || 'Not sent' }));
    handle.result({
      mode, created, skipped, refused, failed, unknown, notAttempted: notAttempted.length, stopped: stopped ? engine.maskSecrets(stopped, secrets) : null,
      sent: sent.slice(0, LIST_CAP), failedPosts: [...notSent, ...skippedRows].slice(0, LIST_CAP),
    });
    if (!created && (failed || unknown || stopped)) handle.fail(stopped ? engine.maskSecrets(stopped, secrets) : `Nothing was sent: ${failed} failed and ${unknown} unclear`);
    await writeRun(deps, batchId, {
      state: 'done', mode, at: startedAt, actorId: payload.actorId, count: ctx.plan.count, willSend: ctx.plan.willSend,
      summary: { created, skipped, refused, failed, unknown, stopped: stopped ? engine.maskSecrets(stopped, secrets) : null, notAttempted, byAccount },
      log: maskLines(engine.maskSecrets, lines, secrets),
    });
    await audit(deps, actor ?? { id: payload.actorId }, mode === 'live' ? 'schedule.send_live.done' : 'schedule.send_draft.done', 'batch', batchId, { created, skipped, refused, failed, unknown, stopped: !!stopped, notAttempted: notAttempted.length });
  } catch (err) {
    logger.error('send.failed', { batchId, ...describeError(err, [deps.config.authSecret, ...secrets]) });
    const message = err instanceof HttpError ? err.message : `The send stopped before finishing: ${describeError(err, secrets).message}`;
    // Lines are stored only once every account key has been masked out of them. If the engine cannot be loaded to do that,
    // none are stored.
    let log: string[] | undefined;
    try {
      const engine = await pipelineEngine();
      log = maskLines(engine.maskSecrets, lines, secrets);
    } catch {
      log = undefined;
    }
    await writeRun(deps, batchId, { state: 'refused', mode, at: startedAt, actorId: payload.actorId, message: log ? message : 'The send stopped before finishing', ...(log ? { log } : {}) });
    handle.fail(message);
  } finally {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  }
}

// ---- reading deliveries ----

export async function deliveriesOf(deps: Deps, batchId: string) {
  const batch = await deps.prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw new HttpError(404, 'Batch not found');
  const rows = await deps.prisma.delivery.findMany({ where: { post: { batchId } }, include: { post: { select: { postKey: true, title: true, date: true, time: true } } }, orderBy: [{ createdAt: 'asc' }] });
  const counts: Record<string, number> = {};
  for (const d of rows) counts[d.bufferStatus ?? d.status] = (counts[d.bufferStatus ?? d.status] ?? 0) + 1;
  return {
    batch: { id: batch.id, name: batch.name, status: batch.status },
    counts,
    deliveries: rows.map((d) => ({
      id: d.id, postId: d.postId, postKey: d.post.postKey, title: d.post.title, network: d.network, account: d.account, channelId: d.channelId,
      bufferId: d.bufferId, mode: d.mode, status: d.status, bufferStatus: d.bufferStatus, dueAt: d.dueAt, error: d.error, statusNote: d.statusNote,
      previous: d.previous, lastCheckedAt: d.lastCheckedAt, updatedAt: d.updatedAt,
    })),
    lastRun: await lastRun(deps, batchId),
  };
}

// ---- refreshing status ----

const NOT_LISTED = "Not in Buffer's scheduled or draft lists. It may have been published, deleted, or be on a later page. Check Buffer";

export function refreshDeliveries(deps: Deps, payload: { batchId: string; activityId?: string }): Promise<{ checked: number; unknown: number }> {
  const meta = async () => {
    const batch = await deps.prisma.batch.findUnique({ where: { id: payload.batchId }, select: { title: true } });
    return { title: refreshTitle(batch?.title), batchId: batch ? payload.batchId : null };
  };
  return trackRun(deps, 'refresh-delivery', payload, meta, (handle) => refreshNow(deps, payload, handle));
}

async function refreshNow(deps: Deps, payload: { batchId: string }, handle: RunHandle): Promise<{ checked: number; unknown: number }> {
  const out = await refreshCore(deps, payload, handle);
  handle.result(out);
  return out;
}

async function refreshCore(deps: Deps, payload: { batchId: string }, handle: RunHandle): Promise<{ checked: number; unknown: number }> {
  handle.progress({ step: 'Asking Buffer for the status' });
  const batch = await deps.prisma.batch.findUnique({ where: { id: payload.batchId }, include: { posts: { include: { deliveries: true } } } });
  if (!batch) return { checked: 0, unknown: 0 };
  const flat: DeliveryWithPostKey[] = batch.posts.flatMap((p) => p.deliveries.map((d) => ({ ...d, post: { postKey: p.postKey } })));
  const watching = flat.filter((d) => ['created', 'unknown'].includes(d.status) && d.bufferStatus !== 'sent' && d.bufferStatus !== 'failed');
  if (!watching.length) return { checked: 0, unknown: 0 };

  const engine = await pipelineEngine();
  const cfg = await loadConfig(deps);
  const secrets = cfg.accounts.map((a) => a.apiKey).filter(Boolean);
  const clients = await clientsFor(deps, { ...cfg, accounts: cfg.accounts.filter((a) => a.apiKey) });
  const now = deps.now();
  const fullState = stateFromDeliveries(batch.name, flat);

  // The text an unclear create was sent with, so the engine can recognise it in Buffer's list.
  const needsText = watching.some((d) => d.status === 'unknown');
  if (needsText) {
    const { items } = await itemsForPosts(deps, batch, batch.posts.filter((p) => p.status !== 'removed'));
    for (const i of items) {
      const rec = fullState.posts[i.postId]?.[i.network];
      if (rec?.status === 'unknown') rec.text = i.text;
    }
  }

  let unknown = 0;
  const accountsToCheck = cfg.accounts.filter((a) => watching.some((d) => d.account === a.name));
  let accountsDone = 0;
  for (const account of cfg.accounts) {
    const mine = watching.filter((d) => d.account === account.name);
    if (!mine.length) continue;
    handle.progress({ step: `Checking ${account.name}`, done: accountsDone++, total: accountsToCheck.length });
    const client = clients.get(account.name);
    const note = async (d: DeliveryWithPostKey, statusNote: string, extra: Record<string, unknown> = {}) => {
      await deps.prisma.delivery.update({ where: { id: d.id }, data: { statusNote, ...extra } });
    };
    if (!client) {
      for (const d of mine) await note(d, `The Buffer account "${account.name}" has no key, so its status cannot be checked`);
      continue;
    }
    const state: EngineState = { batch: batch.name, posts: {} };
    for (const d of mine) {
      const rec = fullState.posts[d.post.postKey]?.[d.network];
      if (rec) (state.posts[d.post.postKey] ??= {})[d.network] = rec;
    }
    const lines: string[] = [];
    let orgId: string;
    try {
      orgId = await engine.resolveOrg(client, account.organizationId);
    } catch (e) {
      for (const d of mine) await note(d, `Could not reach Buffer for "${account.name}": ${engine.maskSecrets(String((e as Error).message), secrets).slice(0, 200)}`);
      continue;
    }
    const { remote } = await engine.runStatus({ accounts: [{ name: account.name, client, orgId }], accountOf: () => account.name, state, saveState: () => {}, log: (m: string) => lines.push(String(m)) });
    const listingFailed = lines.some((l) => l.startsWith('Could not list'));
    for (const d of mine) {
      if (listingFailed) {
        await note(d, `Could not list Buffer's posts for "${account.name}", so the status is unchanged. Try again, or check Buffer`);
        continue;
      }
      const rec = state.posts[d.post.postKey]?.[d.network];
      const bufferId = rec?.bufferId ?? d.bufferId;
      const hit = bufferId ? remote.find((p) => p.id === bufferId) : undefined;
      if (hit) {
        // Found by id (or recognised by the engine from its text and time when the create was unclear).
        await deps.prisma.delivery.update({
          where: { id: d.id },
          data: { status: 'created', bufferId: hit.id, bufferStatus: hit.listedAs === 'draft' ? 'draft' : 'scheduled', error: null, statusNote: null, lastCheckedAt: now },
        });
      } else {
        unknown++;
        await deps.prisma.delivery.update({
          where: { id: d.id },
          data: { bufferStatus: 'unknown', statusNote: d.status === 'unknown' ? 'Not found in Buffer by the status check. Look in Buffer by hand' : NOT_LISTED, lastCheckedAt: now },
        });
      }
    }
  }
  await audit(deps, null, 'schedule.refresh.done', 'batch', batch.id, { checked: watching.length, unknown });
  return { checked: watching.length, unknown };
}

// ---- resolving by hand ----

export type ResolveAction = 'mark-sent' | 'mark-absent';

// A person has looked in Buffer. mark-sent: it is there (optionally say its id). mark-absent: it is not there.
export async function resolveDelivery(deps: Deps, actor: Actor, deliveryId: string, action: ResolveAction, bufferId?: string): Promise<Delivery> {
  if (actor.role !== 'admin') throw new HttpError(403, 'Only an admin can resolve an unclear delivery by hand');
  const d = await findDeliveryFor(deps, actor, deliveryId);
  if (d.status !== 'unknown' && d.bufferStatus !== 'unknown') throw new HttpError(409, 'Only a delivery with an unclear status can be resolved by hand');
  const now = deps.now();
  const who = actor.email ?? actor.id;
  // An id typed by a person is attached only when no other delivery holds it and Buffer says it is on this channel.
  const attaching = action === 'mark-sent' && d.status === 'unknown' ? bufferId ?? d.bufferId : null;
  if (action === 'mark-sent' && d.status === 'unknown' && !attaching) throw new HttpError(422, 'Say which Buffer post this is: enter its id');
  if (attaching && attaching !== d.bufferId) await verifyBufferPost(deps, d, attaching);
  let data;
  if (d.status === 'unknown') {
    data = action === 'mark-sent'
      ? { status: 'created', bufferId: attaching, bufferStatus: d.mode === 'live' ? 'scheduled' : 'draft', error: null, statusNote: `Confirmed in Buffer by ${who}`, lastCheckedAt: now }
      : { status: 'failed', bufferStatus: null, error: `Marked as not in Buffer by ${who}`, statusNote: 'Nothing was found in Buffer. It can be sent again', lastCheckedAt: now };
  } else {
    // Created earlier, but a status check could not find it in Buffer's lists.
    data = action === 'mark-sent'
      ? { bufferStatus: 'sent', statusNote: `Confirmed as published by ${who}`, lastCheckedAt: now }
      : { status: 'deleted', bufferStatus: null, statusNote: `Marked as gone from Buffer by ${who}`, lastCheckedAt: now };
  }
  const updated = await deps.prisma.delivery.update({ where: { id: d.id }, data });
  await audit(deps, actor, 'schedule.resolve', 'delivery', d.id, { action, network: d.network, postKey: d.post.postKey, bufferId: attaching ?? d.bufferId ?? null });
  return updated;
}

// A Buffer post id may be attached to, or deleted for, a delivery only if no other delivery claims it and Buffer itself
// reports the post on this delivery's channel. Never trusts the id alone. (The by-id query is unverified against real Buffer.)
async function verifyBufferPost(deps: Deps, d: Delivery & { post: { postKey: string } }, bufferId: string): Promise<void> {
  const other = await deps.prisma.delivery.findFirst({ where: { bufferId, id: { not: d.id } }, select: { id: true } });
  if (other) throw new HttpError(409, 'Another delivery already holds this Buffer post');
  const engine = await pipelineEngine();
  const cfg = await loadConfig(deps);
  const account = cfg.accounts.find((a) => a.name === d.account);
  if (!account?.apiKey) throw new HttpError(409, `The Buffer account "${d.account}" has no key, so the post cannot be checked`);
  const client = (await clientsFor(deps, { ...cfg, accounts: [account] })).get(account.name)!;
  let found: { id?: string; channelId?: string } | null;
  try {
    const data = await client.gql(`query { post(input: { id: ${JSON.stringify(bufferId)} }) { id channelId } }`);
    found = data?.post ?? null;
  } catch (e) {
    const message = engine.maskSecrets(String((e as Error).message), [account.apiKey]).slice(0, 200);
    throw new HttpError(502, `Buffer could not confirm that post, so nothing was changed. (${message})`);
  }
  if (!found?.id) throw new HttpError(422, 'Buffer has no post with that id in this account');
  if (found.channelId !== d.channelId) throw new HttpError(409, 'That Buffer post is on a different channel from this delivery');
}

async function findDeliveryFor(deps: Deps, actor: Actor, id: string) {
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await deps.prisma.delivery.findUnique({ where: { id }, include: { post: { include: { batch: true } } } }) : null;
  if (!d) throw new HttpError(404, 'Delivery not found');
  if (actor.role !== 'admin' && actor.id !== d.post.batch.ownerId) throw new HttpError(403, 'Only an admin or the person who made the batch can do this');
  return d;
}

// ---- deleting from Buffer ----

export async function deleteFromBuffer(deps: Deps, actor: Actor, deliveryId: string): Promise<Delivery> {
  const d = await findDeliveryFor(deps, actor, deliveryId);
  if (d.status !== 'created' || !d.bufferId || !['draft', 'scheduled'].includes(d.bufferStatus ?? '')) {
    throw new HttpError(409, 'Only a post that is a draft or scheduled in Buffer can be deleted from here. Refresh its status first');
  }
  await verifyBufferPost(deps, d, d.bufferId);
  const engine = await pipelineEngine();
  const cfg = await loadConfig(deps);
  const account = cfg.accounts.find((a) => a.name === d.account);
  if (!account?.apiKey) throw new HttpError(409, `The Buffer account "${d.account}" has no key, so the post cannot be deleted from here`);
  const client = (await clientsFor(deps, { ...cfg, accounts: [account] })).get(account.name)!;
  const secrets = [account.apiKey];
  try {
    const res = await engine.deletePost(client, d.bufferId);
    if (!res.ok) {
      await audit(deps, actor, 'schedule.delete_from_buffer', 'delivery', d.id, { network: d.network, postKey: d.post.postKey, bufferId: d.bufferId, outcome: 'refused', message: engine.maskSecrets(res.message, secrets).slice(0, 300) });
      throw new HttpError(422, `Buffer would not delete it: ${engine.maskSecrets(res.message, secrets).slice(0, 300)}`);
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (!engine.isBufferError(e)) throw e;
    const message = engine.maskSecrets(e.message, secrets).slice(0, 300);
    if (e.ambiguous) {
      // The delete may or may not have happened. It is not recorded as deleted, and the status says so.
      await deps.prisma.delivery.update({ where: { id: d.id }, data: { bufferStatus: 'unknown', statusNote: 'The answer to the delete was not clear. Check Buffer, then resolve it here', lastCheckedAt: deps.now() } });
      await audit(deps, actor, 'schedule.delete_from_buffer', 'delivery', d.id, { network: d.network, postKey: d.post.postKey, bufferId: d.bufferId, outcome: 'unknown', message });
      throw new HttpError(502, `Buffer's answer was not clear, so the post is marked unknown rather than deleted. Check Buffer. (${message})`);
    }
    await audit(deps, actor, 'schedule.delete_from_buffer', 'delivery', d.id, { network: d.network, postKey: d.post.postKey, bufferId: d.bufferId, outcome: 'failed', message });
    throw new HttpError(502, `Buffer did not delete it: ${message}`);
  }
  const updated = await deps.prisma.delivery.update({ where: { id: d.id }, data: { status: 'deleted', bufferStatus: null, statusNote: `Deleted from Buffer by ${actor.email ?? actor.id}`, lastCheckedAt: deps.now() } });
  await audit(deps, actor, 'schedule.delete_from_buffer', 'delivery', d.id, { network: d.network, postKey: d.post.postKey, bufferId: d.bufferId, outcome: 'deleted' });
  return updated;
}
