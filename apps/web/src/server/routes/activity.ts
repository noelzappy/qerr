// Activity: what the background work is doing and did. Every signed-in person sees every run (it is a small team, and
// the runs hold only titles, counts and plain sentences, never keys).
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Deps } from '../deps.js';
import { notFound, pageQuery, readQuery } from '../http.js';
import { JOB_NAMES } from '../jobs/types.js';
import { requireUser } from '../middleware.js';
import { ACTIVE_STATUSES, activityView, SYSTEM_KINDS } from '../services/activity.js';

const STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;

const query = pageQuery.extend({
  // active = queued and running; finished = done, failed and cancelled
  status: z.enum(['active', 'finished', 'all', ...STATUSES]).default('all'),
  kind: z.enum(JOB_NAMES).optional(),
  batchId: z.string().trim().min(1).max(100).optional(),
  // 'hide' leaves out the timer-driven status checks; 'only' shows just those
  system: z.enum(['include', 'hide', 'only']).default('include'),
  // research results and send outcomes are big enough to leave out of a long list unless asked for
  withResult: z.enum(['true', 'false']).default('false'),
});

export function activityRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps));

  app.get('/', async (c) => {
    const q = readQuery(c, query);
    const statusWhere = q.status === 'all' ? {} : q.status === 'active' ? { status: { in: ACTIVE_STATUSES } } : q.status === 'finished' ? { status: { in: ['done', 'failed', 'cancelled'] } } : { status: q.status };
    const system = { kind: { in: [...SYSTEM_KINDS] }, actorId: null };
    const where = {
      ...statusWhere,
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.batchId ? { batchId: q.batchId } : {}),
      ...(q.system === 'hide' ? { NOT: system } : q.system === 'only' ? system : {}),
    };
    const [total, rows] = await Promise.all([
      deps.prisma.activityRun.count({ where }),
      deps.prisma.activityRun.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return c.json({ items: rows.map((r) => activityView(r, { result: q.withResult === 'true' })), page: q.page, pageSize: q.pageSize, total });
  });

  app.get('/:id', async (c) => {
    const row = await deps.prisma.activityRun.findUnique({ where: { id: c.req.param('id') } });
    if (!row) throw notFound('That activity was not found');
    return c.json({ run: activityView(row, { result: true }) });
  });

  return app;
}
