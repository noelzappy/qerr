// Scheduling, mounted at /api/schedule: the plan, sending (draft or live), deliveries, refreshing status, resolving an
// unclear answer and deleting a Buffer post. Live sends and deletes need an admin or the batch's owner.
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit.js';
import type { AppEnv, Deps } from '../deps.js';
import { HttpError, notFound, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { enqueueTracked } from '../services/activity.js';
import { buildPlan, deleteFromBuffer, deliveriesOf, refreshTitle, requestSend, resolveDelivery, type Mode } from '../services/schedule.js';

const sendInput = z.strictObject({
  mode: z.enum(['draft', 'live']),
  confirm: z.strictObject({ postsXChannels: z.number().int().min(0), token: z.string().min(1).max(128) }),
});
const resolveInput = z.strictObject({ action: z.enum(['mark-sent', 'mark-absent']), bufferId: z.string().min(1).max(200).optional() });
const deleteInput = z.strictObject({ confirm: z.literal(true) });
const UUID = /^[0-9a-f-]{36}$/i;

export function scheduleRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin', 'editor'));

  const batchIdOf = (id: string) => {
    if (!UUID.test(id)) throw notFound('Batch not found');
    return id;
  };

  app.get('/batches/:id/plan', async (c) => {
    const mode: Mode = c.req.query('mode') === 'live' ? 'live' : 'draft';
    const { plan } = await buildPlan(deps, batchIdOf(c.req.param('id')), mode);
    return c.json({ plan });
  });

  app.post('/batches/:id/send', async (c) => {
    const body = await readJson(c, sendInput);
    const { jobId, plan } = await requestSend(deps, c.get('user'), batchIdOf(c.req.param('id')), body);
    return c.json({ queued: true, jobId, count: plan.count, willSend: plan.willSend }, 202);
  });

  app.get('/batches/:id/deliveries', async (c) => c.json(await deliveriesOf(deps, batchIdOf(c.req.param('id')))));

  app.post('/batches/:id/refresh', async (c) => {
    const id = batchIdOf(c.req.param('id'));
    const batch = await deps.prisma.batch.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!batch) throw notFound('Batch not found');
    const { jobId } = await enqueueTracked(deps, 'refresh-delivery', { batchId: id }, { singletonKey: id }, { title: refreshTitle(batch.title), actorId: c.get('user').id, batchId: id });
    await audit(deps, c.get('user'), 'schedule.refresh', 'batch', id, { queued: !!jobId });
    return c.json({ queued: true, jobId }, 202);
  });

  app.post('/deliveries/:id/resolve', async (c) => {
    const { action, bufferId } = await readJson(c, resolveInput);
    const d = await resolveDelivery(deps, c.get('user'), c.req.param('id'), action, bufferId);
    return c.json({ delivery: { id: d.id, status: d.status, bufferStatus: d.bufferStatus, bufferId: d.bufferId, statusNote: d.statusNote, error: d.error } });
  });

  app.post('/deliveries/:id/delete-from-buffer', async (c) => {
    await readJson(c, deleteInput);
    const d = await deleteFromBuffer(deps, c.get('user'), c.req.param('id'));
    return c.json({ delivery: { id: d.id, status: d.status, bufferStatus: d.bufferStatus, statusNote: d.statusNote } });
  });

  app.all('*', () => {
    throw new HttpError(404, 'Not found');
  });
  return app;
}
