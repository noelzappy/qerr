// The job handlers. Each is a plain function (deps, payload) so tests call it directly without pg-boss.
// Later work replaces the stubs below one line at a time; keep the keys and signatures.
import type { Deps } from '../deps.js';
import { runAnalyseReference, runDraftBatch, runResearch, runRewrite } from '../services/ai-jobs.js';
import { pruneSystemRuns, trackRun } from '../services/activity.js';
import { renderPost } from '../services/render.js';
import { runRedesign } from '../services/ai-design.js';
import { refreshDeliveries, sendBatch } from '../services/schedule.js';
import type { JobName, JobPayloads } from './types.js';

export type JobHandler<N extends JobName> = (deps: Deps, payload: JobPayloads[N]) => Promise<void>;
export type Handlers = { [N in JobName as CamelName<N>]: JobHandler<N> };

type CamelName<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<CamelName<B>>}` : S;

// refresh-sweep: look for batches with live or draft deliveries and queue a status refresh for each.
// Each check makes its own run when its job starts, so the list only shows checks that really ran.
async function refreshSweep(deps: Deps, payload: { activityId?: string } = {}): Promise<void> {
  await trackRun(deps, 'refresh-sweep', payload, () => ({ title: 'Buffer status check' }), async (handle) => {
    handle.progress({ step: 'Looking for batches to check' });
    const batches = await deps.prisma.batch.findMany({ where: { status: { in: ['scheduled'] } }, select: { id: true } });
    for (const b of batches) await deps.jobs.enqueue('refresh-delivery', { batchId: b.id }, { singletonKey: b.id });
    await pruneSystemRuns(deps).catch(() => undefined);
    handle.result({ batches: batches.length });
  });
}

export const handlers: Handlers = {
  renderPost,
  refreshDelivery: async (deps, payload) => { await refreshDeliveries(deps, payload); },
  refreshSweep,
  draftBatch: async (deps, payload) => { await runDraftBatch(deps, payload); },
  researchRun: async (deps, payload) => { await runResearch(deps, payload); },
  rewritePost: async (deps, payload) => { await runRewrite(deps, payload); },
  sendBatch,
  analyseReference: async (deps, payload) => { await runAnalyseReference(deps, payload); },
  redesignBatch: async (deps, payload) => { await runRedesign(deps, payload); },
};

const KEYS: Record<JobName, keyof Handlers> = {
  'render-post': 'renderPost',
  'refresh-delivery': 'refreshDelivery',
  'refresh-sweep': 'refreshSweep',
  'draft-batch': 'draftBatch',
  'research-run': 'researchRun',
  'rewrite-post': 'rewritePost',
  'send-batch': 'sendBatch',
  'analyse-reference': 'analyseReference',
  'redesign-batch': 'redesignBatch',
};

export const handlerFor = (name: JobName): JobHandler<JobName> => handlers[KEYS[name]] as JobHandler<JobName>;
