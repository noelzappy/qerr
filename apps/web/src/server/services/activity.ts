// Activity: one ActivityRun row per piece of background work, so people can see what is queued, running and done.
//
//   enqueueTracked   creates the run (queued), puts its id in the job payload and enqueues the job
//   trackRun         wraps a job handler: running -> progress -> done or failed (a handler called without an
//                    activityId, such as the 15-minute timer or a test, gets its own run)
//   reconcileActivity  on server start, ends runs whose job is gone as failed
//
// Bookkeeping never breaks the work: a failed write is logged and the job carries on. Nothing secret is stored: errors
// pass through readableError, progress and results are plain counts and sentences.
import type { Prisma, ActivityRun } from '@prisma/client';
import type { Deps } from '../deps.js';
import { HttpError } from '../http.js';
import type { EnqueueOptions, JobName, JobPayloads } from '../jobs/types.js';
import { describeError, logger } from '../log.js';

export type ActivityStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export const ACTIVE_STATUSES: ActivityStatus[] = ['queued', 'running'];
// The timer-driven status checks. Hidden by default in the UI when no person started them.
export const SYSTEM_KINDS: JobName[] = ['refresh-delivery', 'refresh-sweep'];
export const RESTART_MESSAGE = 'Stopped when the server restarted';
const SYSTEM_KEEP_DAYS = 14;
const PROGRESS_EVERY_MS = 1000;

export interface Progress { step: string; done?: number; total?: number }
export interface RunMeta { title: string; actorId?: string | null; batchId?: string | null; postId?: string | null }

// ---- error text ----

// A sentence a person can read, with keys and tokens taken out. Known secrets are removed first, then anything shaped like one.
export function readableError(err: unknown, secrets: string[] = []): string {
  let message = err instanceof HttpError ? err.message : describeError(err, secrets).message;
  if (err instanceof HttpError && Array.isArray(err.details)) message = `${message}: ${err.details.map(String).join('; ')}`;
  for (const s of secrets) if (s && s.length >= 6) message = message.split(s).join('[hidden]');
  message = message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [hidden]')
    .replace(/\b(?:sk|pk|key|tok)[-_][A-Za-z0-9_-]{8,}/gi, '[hidden]')
    .replace(/([?&](?:api[_-]?key|key|token|secret)=)[^&\s]+/gi, '$1[hidden]');
  return message.trim().slice(0, 1000) || 'The work stopped for a reason that was not recorded';
}

// ---- writing runs ----

async function quietly<T>(deps: Deps, what: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    logger.warn('activity.write_failed', { what, ...describeError(err, [deps.config.authSecret]) });
    return undefined;
  }
}

async function createRun(deps: Deps, kind: JobName, meta: RunMeta, status: 'queued' | 'running' = 'queued'): Promise<ActivityRun | null> {
  const row = await quietly(deps, 'create', () => deps.prisma.activityRun.create({
    data: {
      kind, status, title: meta.title.slice(0, 300), actorId: meta.actorId ?? null, batchId: meta.batchId ?? null, postId: meta.postId ?? null,
      ...(status === 'running' ? { startedAt: deps.now() } : {}),
    },
  }));
  return row ?? null;
}

// Creates the run, enqueues the job with the run's id in its payload and stores the pg-boss job id. When the queue refuses
// a second job for the same key (a draft or a render is already waiting), the new run is removed and the one already
// waiting is returned, so a person is pointed at the work that is really going to happen.
export async function enqueueTracked<N extends JobName>(
  deps: Deps, name: N, payload: JobPayloads[N], options: EnqueueOptions | undefined, meta: RunMeta,
): Promise<{ jobId: string | null; activityId: string | null }> {
  const run = await createRun(deps, name, meta);
  let jobId: string | null;
  try {
    jobId = await deps.jobs.enqueue(name, run ? ({ ...payload, activityId: run.id } as JobPayloads[N]) : payload, options);
  } catch (err) {
    if (run) await quietly(deps, 'enqueue-failed', () => finishRun(deps, run.id, { status: 'failed', error: readableError(err, [deps.config.authSecret]) }));
    throw err;
  }
  if (!run) return { jobId, activityId: null };
  if (jobId === null) {
    await quietly(deps, 'drop-duplicate', () => deps.prisma.activityRun.delete({ where: { id: run.id } }));
    const existing = await quietly(deps, 'find-existing', () => deps.prisma.activityRun.findFirst({
      where: { kind: name, status: { in: ACTIVE_STATUSES }, ...(meta.postId ? { postId: meta.postId } : {}), ...(meta.batchId && !meta.postId ? { batchId: meta.batchId } : {}), ...(name === 'draft-batch' && meta.actorId ? { actorId: meta.actorId } : {}) },
      orderBy: { createdAt: 'desc' }, select: { id: true },
    }));
    return { jobId: null, activityId: existing?.id ?? null };
  }
  await quietly(deps, 'job-id', () => deps.prisma.activityRun.update({ where: { id: run.id }, data: { jobId } }));
  return { jobId, activityId: run.id };
}

interface Finish { status: 'done' | 'failed' | 'cancelled'; result?: unknown; error?: string | null; progress?: Progress | null }

async function finishRun(deps: Deps, id: string, f: Finish): Promise<void> {
  await deps.prisma.activityRun.update({
    where: { id },
    data: {
      status: f.status, finishedAt: deps.now(), error: f.error ?? null,
      ...(f.result === undefined ? {} : { result: f.result as Prisma.InputJsonValue }),
      ...(f.progress === undefined ? {} : { progress: (f.progress ?? undefined) as Prisma.InputJsonValue | undefined }),
    },
  });
}

// Writes the newest progress at most once a second: the first call goes straight through, later ones wait for the slot.
export function createProgressWriter(write: (p: Progress) => Promise<unknown>, everyMs = PROGRESS_EVERY_MS, clock: () => number = Date.now) {
  let last = -Infinity;
  let pending: Progress | null = null;
  let timer: NodeJS.Timeout | null = null;
  let inflight: Promise<unknown> = Promise.resolve();
  const send = (p: Progress) => {
    last = clock();
    inflight = inflight.then(() => write(p)).catch(() => undefined);
  };
  return {
    update(p: Progress): void {
      const wait = last + everyMs - clock();
      if (wait <= 0 && !timer) { pending = null; send(p); return; }
      pending = p;
      if (!timer) {
        timer = setTimeout(() => { timer = null; if (pending) { const next = pending; pending = null; send(next); } }, Math.max(wait, 0));
        timer.unref?.();
      }
    },
    // Drops what is waiting and lets the write in flight finish. The caller writes the final progress itself.
    async stop(): Promise<void> {
      if (timer) clearTimeout(timer);
      timer = null; pending = null;
      await inflight;
    },
  };
}

export interface RunHandle {
  id: string | null;
  progress(p: Progress): void;
  // Marks the run failed without throwing, for work that reports its own failure and returns (a render that could not finish).
  fail(message: string): void;
  // What the run reports when it ends (used instead of the handler's return value).
  result(value: unknown): void;
  // Secrets to take out of an error message if the work throws.
  hide(...secrets: string[]): void;
}

const noHandle: RunHandle = { id: null, progress() {}, fail() {}, result() {}, hide() {} };
export { noHandle };

// Runs `work` as the handler of a job. `meta` is only read when the payload carries no run to continue.
export async function trackRun<T>(
  deps: Deps, kind: JobName, payload: { activityId?: string }, meta: () => Promise<RunMeta> | RunMeta, work: (handle: RunHandle) => Promise<T>,
): Promise<T> {
  let id: string | null = null;
  const started = await quietly(deps, 'start', async () => {
    if (payload.activityId) {
      // A retry of a job that already failed goes back to running; its old error and end time are cleared.
      const found = await deps.prisma.activityRun.updateMany({
        where: { id: payload.activityId, status: { in: ['queued', 'running', 'failed'] } },
        data: { status: 'running', startedAt: deps.now(), finishedAt: null, error: null },
      });
      if (found.count) return payload.activityId;
      const existing = await deps.prisma.activityRun.findUnique({ where: { id: payload.activityId }, select: { id: true } });
      if (existing) return existing.id;
    }
    return (await createRun(deps, kind, await meta(), 'running'))?.id ?? null;
  });
  id = started ?? null;

  const secrets: string[] = [deps.config.authSecret];
  let failure: string | null = null;
  const writer = id ? createProgressWriter((p) => deps.prisma.activityRun.update({ where: { id: id! }, data: { progress: p as unknown as Prisma.InputJsonValue } })) : null;
  let latest = null as Progress | null;
  let reported: unknown;
  const handle: RunHandle = {
    id,
    progress(p) { latest = p; writer?.update(p); },
    fail(message) { failure ??= message; },
    result(value) { reported = value; },
    hide(...s) { secrets.push(...s); },
  };

  let value: T;
  try {
    value = await work(handle);
  } catch (err) {
    await writer?.stop();
    if (id) await quietly(deps, 'fail', () => finishRun(deps, id!, { status: 'failed', error: readableError(err, secrets), ...(latest ? { progress: latest } : {}) }));
    throw err;
  }
  await writer?.stop();
  if (id) {
    const out = reported === undefined ? value : reported;
    // Known secrets come out of the stored result too, not only the error.
    let text = out === undefined ? undefined : JSON.stringify(out);
    if (text) for (const sec of secrets) if (sec && sec.length >= 6) text = text.split(sec).join('[hidden]');
    const result = text === undefined ? undefined : (JSON.parse(text) as unknown);
    await quietly(deps, 'finish', () => finishRun(deps, id!, failure !== null
      ? { status: 'failed', error: readableError(failure, secrets), result, ...(latest ? { progress: latest } : {}) }
      : { status: 'done', result, ...(latest ? { progress: { ...latest, ...(latest.total !== undefined ? { done: latest.total } : {}) } } : {}) }));
  }
  return value;
}

// ---- after a restart ----

export type JobStates = (jobs: Array<{ kind: string; jobId: string }>) => Promise<Map<string, string>>;
const LIVE_JOB_STATES = new Set(['created', 'retry', 'active']);

// Runs left queued or running by a process that is gone end as failed. A run that was running was being worked on by the
// process that stopped, so it ends at once (if pg-boss retries the job, the handler puts the run back to running). A run
// that was only queued ends when its job no longer exists or has already ended in pg-boss. Without a way to ask pg-boss
// (no `states`), queued runs are left alone.
export async function reconcileActivity(deps: Deps): Promise<{ failed: number }> {
  const open = await deps.prisma.activityRun.findMany({ where: { status: { in: ACTIVE_STATUSES } }, select: { id: true, kind: true, status: true, jobId: true } });
  if (!open.length) return { failed: 0 };
  const states = deps.jobs.jobStates && open.some((r) => r.status === 'queued' && r.jobId)
    ? await deps.jobs.jobStates(open.filter((r) => r.status === 'queued' && r.jobId).map((r) => ({ kind: r.kind, jobId: r.jobId! }))).catch(() => null)
    : null;
  const orphans = open.filter((r) => {
    if (r.status === 'running') return true;
    if (!r.jobId) return true;
    if (!states) return false;
    return !LIVE_JOB_STATES.has(states.get(r.jobId) ?? 'missing');
  });
  if (!orphans.length) return { failed: 0 };
  const done = await deps.prisma.activityRun.updateMany({
    where: { id: { in: orphans.map((r) => r.id) }, status: { in: ACTIVE_STATUSES } },
    data: { status: 'failed', error: RESTART_MESSAGE, finishedAt: deps.now() },
  });
  return { failed: done.count };
}

// The 15-minute status checks fill the list, so finished ones from people-less runs go after two weeks.
export async function pruneSystemRuns(deps: Deps): Promise<number> {
  const before = new Date(deps.now().getTime() - SYSTEM_KEEP_DAYS * 86_400_000);
  const r = await deps.prisma.activityRun.deleteMany({ where: { kind: { in: SYSTEM_KINDS }, actorId: null, status: { in: ['done', 'failed', 'cancelled'] }, createdAt: { lt: before } } });
  return r.count;
}

// ---- reading runs ----

export interface ActivityView {
  id: string; kind: string; status: ActivityStatus; title: string;
  // true for the timer-driven status checks (no person started them)
  system: boolean;
  actorId: string | null; batchId: string | null; postId: string | null;
  progress: Progress | null; result?: unknown; error: string | null;
  createdAt: string; startedAt: string | null; finishedAt: string | null; updatedAt: string;
}

export function activityView(r: ActivityRun, opts: { result?: boolean } = {}): ActivityView {
  return {
    id: r.id, kind: r.kind, status: r.status as ActivityStatus, title: r.title,
    system: !r.actorId && (SYSTEM_KINDS as string[]).includes(r.kind),
    actorId: r.actorId, batchId: r.batchId, postId: r.postId,
    progress: (r.progress as Progress | null) ?? null,
    ...(opts.result ? { result: r.result ?? null } : {}),
    error: r.error,
    createdAt: r.createdAt.toISOString(), startedAt: r.startedAt?.toISOString() ?? null, finishedAt: r.finishedAt?.toISOString() ?? null, updatedAt: r.updatedAt.toISOString(),
  };
}
