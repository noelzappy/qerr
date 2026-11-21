// A job queue for tests: remembers what was enqueued and never runs anything on its own.
// Tests call handlers directly (handlers.renderPost(deps, payload)) or use runNext() to run what was queued.
import type { Deps } from '../deps.js';
import { handlerFor } from './handlers.js';
import type { EnqueueOptions, JobName, JobPayloads, Jobs } from './types.js';

export interface FakeJobs extends Jobs {
  enqueued: Array<{ name: JobName; payload: unknown; options?: EnqueueOptions }>;
  // Runs and removes every queued job in order (jobs queued while running are run too).
  drain(deps: Deps): Promise<void>;
  // What jobStates answers, by job id. A job id left out counts as gone.
  states: Map<string, string>;
}

export function createFakeJobs(): FakeJobs {
  const enqueued: FakeJobs['enqueued'] = [];
  const states = new Map<string, string>();
  return {
    enqueued,
    states,
    async jobStates(jobs) {
      return new Map(jobs.flatMap((j) => (states.has(j.jobId) ? [[j.jobId, states.get(j.jobId)!] as [string, string]] : [])));
    },
    async enqueue<N extends JobName>(name: N, payload: JobPayloads[N], options?: EnqueueOptions) {
      if (options?.singletonKey && enqueued.some((j) => j.name === name && j.options?.singletonKey === options.singletonKey)) return null;
      enqueued.push({ name, payload, options });
      return `fake-${enqueued.length}`;
    },
    async start() {},
    async stop() {},
    async drain(deps) {
      while (enqueued.length) {
        const job = enqueued.shift()!;
        await handlerFor(job.name)(deps, job.payload as never);
      }
    },
  };
}
