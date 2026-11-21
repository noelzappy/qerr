import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Deps } from '../deps.js';
import { pageQuery, readQuery } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';

const query = pageQuery.extend({
  action: z.string().trim().max(100).optional(),
  actor: z.string().trim().max(254).optional(),
  entity: z.string().trim().max(100).optional(),
});

export function auditRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin'));

  app.get('/', async (c) => {
    const q = readQuery(c, query);
    const where = {
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.actor ? { actorEmail: { contains: q.actor, mode: 'insensitive' as const } } : {}),
      ...(q.entity ? { entity: q.entity } : {}),
    };
    const [total, items] = await Promise.all([
      deps.prisma.auditLog.count({ where }),
      deps.prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return c.json({ items, page: q.page, pageSize: q.pageSize, total });
  });

  return app;
}
