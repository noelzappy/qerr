// The shape every route, job and test works with. Everything outside the process is injected here.
import type { PrismaClient } from '@prisma/client';
import type { AppAuth } from './auth.js';
import type { AppConfig } from './config.js';
import type { Jobs } from './jobs/types.js';
import type { Mailer } from './mail.js';
import type { Limits } from './rate-limit.js';
import type { Storage } from './storage/types.js';

export type Role = 'admin' | 'editor';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Deps {
  prisma: PrismaClient;
  config: AppConfig;
  // Every outbound HTTP call (Buffer, AI, search) goes through this, so tests can fake the other side.
  fetchImpl: typeof fetch;
  storage: Storage;
  jobs: Jobs;
  mailer: Mailer;
  now: () => Date;
  // Built by buildDeps; callers of createAppAndDeps do not pass these.
  auth: AppAuth;
  limits: Limits;
}

export type AppDeps = Omit<Deps, 'auth' | 'limits'> & Partial<Pick<Deps, 'limits'>>;

// Hono context variables set by the middleware.
export type AppEnv = { Variables: { user: SessionUser; requestId: string; clientIp: string } };
