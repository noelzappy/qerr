// pg-boss on the app's own Postgres. Queue names and payloads are in types.ts; handlers in handlers.ts.
import { PgBoss } from 'pg-boss';
import type { Deps } from '../deps.js';
import { describeError, logger } from '../log.js';
import { handlerFor } from './handlers.js';
import { JOB_NAMES, type EnqueueOptions, type JobName, type JobPayloads, type Jobs } from './types.js';

export * from './types.js';
export { handlers } from './handlers.js';

interface QueueSetting {
  // pg-boss queue policy: 'short' keeps at most one waiting job per singletonKey
  policy: 'standard' | 'short';
  retryLimit: number;
  expireInSeconds: number;
  localConcurrency: number;
}

// send-batch never retries on its own: an uncertain create must be looked at by a person, not repeated.
const SETTINGS: Record<JobName, QueueSetting> = {
  'render-post': { policy: 'short', retryLimit: 1, expireInSeconds: 600, localConcurrency: 1 },
  'refresh-delivery': { policy: 'short', retryLimit: 1, expireInSeconds: 300, localConcurrency: 1 },
  'refresh-sweep': { policy: 'short', retryLimit: 0, expireInSeconds: 300, localConcurrency: 1 },
  'draft-batch': { policy: 'short', retryLimit: 0, expireInSeconds: 1800, localConcurrency: 1 },
  'research-run': { policy: 'short', retryLimit: 0, expireInSeconds: 1800, localConcurrency: 1 },
  'rewrite-post': { policy: 'standard', retryLimit: 0, expireInSeconds: 600, localConcurrency: 1 },
  'send-batch': { policy: 'short', retryLimit: 0, expireInSeconds: 900, localConcurrency: 1 },
  'analyse-reference': { policy: 'short', retryLimit: 0, expireInSeconds: 600, localConcurrency: 1 },
  'redesign-batch': { policy: 'short', retryLimit: 0, expireInSeconds: 3600, localConcurrency: 1 },
};

// renderConcurrency: how many render-post jobs this process takes at once (RENDER_CONCURRENCY); the others wait in the database.
export function createBossJobs(options: { databaseUrl: string; schema?: string; renderConcurrency?: number }): Jobs {
  const boss = new PgBoss({ connectionString: options.databaseUrl, schema: options.schema ?? 'pgboss' });
  let started = false;
  let startPromise: Promise<void> | null = null;

  boss.on('error', (err: unknown) => logger.error('jobs.error', describeError(err)));

  // The queues exist as soon as enqueue is first used, so a request never fails because the workers have not started.
  async function ensureStarted(): Promise<void> {
    if (started) return;
    startPromise ??= (async () => {
      await boss.start();
      for (const name of JOB_NAMES) {
        const s = SETTINGS[name];
        await boss.createQueue(name, { policy: s.policy, retryLimit: s.retryLimit, expireInSeconds: s.expireInSeconds });
      }
      started = true;
    })();
    await startPromise;
  }

  return {
    async enqueue<N extends JobName>(name: N, payload: JobPayloads[N], opts: EnqueueOptions = {}) {
      await ensureStarted();
      return boss.send(name, payload as object, { singletonKey: opts.singletonKey, startAfter: opts.startAfter });
    },

    async start(deps: Deps) {
      await ensureStarted();
      for (const name of JOB_NAMES) {
        const s = SETTINGS[name];
        const localConcurrency = name === 'render-post' ? Math.max(1, options.renderConcurrency ?? s.localConcurrency) : s.localConcurrency;
        await boss.work<JobPayloads[typeof name]>(name, { localConcurrency, batchSize: 1 }, async (jobs) => {
          for (const job of jobs) {
            try {
              await handlerFor(name)(deps, job.data as never);
            } catch (err) {
              // The job id and queue only: payloads and messages stay out of the log.
              logger.error('jobs.failed', { queue: name, jobId: job.id, ...describeError(err, [deps.config.authSecret]) });
              throw err;
            }
          }
        });
      }
      // Every 15 minutes check the status of what has been sent.
      await boss.schedule('refresh-sweep', '*/15 * * * *', {});
    },

    async jobStates(jobs) {
      await ensureStarted();
      const states = new Map<string, string>();
      for (const j of jobs) {
        const found = await boss.getJobById(j.kind, j.jobId).catch(() => null);
        if (found) states.set(j.jobId, found.state);
      }
      return states;
    },

    async stop() {
      if (!started && !startPromise) return;
      await boss.stop({ graceful: true, timeout: 10_000 });
      started = false;
      startPromise = null;
    },
  };
}
