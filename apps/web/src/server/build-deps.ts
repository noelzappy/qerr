// Adds the pieces built from the others (auth, the rate-limit buckets) to the injected dependencies.
import { createAuth } from './auth.js';
import type { AppDeps, Deps } from './deps.js';
import { createLimits } from './rate-limit.js';

export function buildDeps(input: AppDeps): Deps {
  const auth = createAuth({ prisma: input.prisma, config: input.config, mailer: input.mailer });
  return { ...input, auth, limits: input.limits ?? createLimits(input.now) };
}
