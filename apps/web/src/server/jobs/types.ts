// Job names and payloads. Payloads never contain secrets: they carry ids, and the handler reads the rest from the database.
export const JOB_NAMES = ['render-post', 'refresh-delivery', 'refresh-sweep', 'draft-batch', 'research-run', 'rewrite-post', 'send-batch', 'analyse-reference', 'redesign-batch'] as const;
export type JobName = (typeof JOB_NAMES)[number];

// Every payload may carry `activityId`: the ActivityRun that shows this job's progress (see services/activity.ts). Without
// one (the timer, a test calling a handler) the handler makes its own run.
export interface JobPayloads {
  'render-post': { postId: string; activityId?: string };
  'refresh-delivery': { batchId: string; activityId?: string };
  // The 15-minute timer. Finds batches that have deliveries to check and enqueues refresh-delivery for each.
  'refresh-sweep': { activityId?: string };
  // actorId owns the batch the AI drafts; the brief says what to draft (see draftBriefSchema in services/ai-jobs.ts)
  'draft-batch': { actorId: string; brief?: import('../services/ai-jobs.js').DraftBrief; activityId?: string };
  'research-run': { actorId?: string; topics?: string[]; activityId?: string };
  'rewrite-post': { postId: string; instruction: string; apply?: boolean; actorId?: string; activityId?: string };
  // planToken: the plan fingerprint the person confirmed; the job sends nothing if the plan has changed since.
  'send-batch': { batchId: string; mode: 'draft' | 'live'; actorId: string; planToken?: string; activityId?: string };
  // The AI describes one design reference picture (services/ai-jobs.ts)
  'analyse-reference': { referenceId: string; actorId?: string; activityId?: string };
  // The AI composes a new design for the batch's single posts, keeping their words (services/ai-design.ts); postIds narrows it.
  'redesign-batch': { batchId: string; actorId: string; postIds?: string[]; activityId?: string };
}

export interface EnqueueOptions {
  // At most one waiting job per key (render-post uses the post id).
  singletonKey?: string;
  // Seconds from now.
  startAfter?: number;
}

export interface Jobs {
  enqueue<N extends JobName>(name: N, payload: JobPayloads[N], options?: EnqueueOptions): Promise<string | null>;
  // Starts the workers. Handlers run with these deps. Safe to skip in tests, which call the handlers directly.
  start(deps: import('../deps.js').Deps): Promise<void>;
  stop(): Promise<void>;
  // The pg-boss state of each job ('created', 'retry', 'active', 'completed', 'cancelled', 'failed'); a job that no longer
  // exists is left out. Used after a restart to end runs whose job is gone.
  jobStates?(jobs: Array<{ kind: string; jobId: string }>): Promise<Map<string, string>>;
}
