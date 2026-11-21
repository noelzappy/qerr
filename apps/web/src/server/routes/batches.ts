// Batches: list, create, import an engine batch, change, delete. Editors and admins; the creator is the batch's owner.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Deps } from '../deps.js';
import { HttpError, notFound, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { addPosts, createBatch, deleteBatch, importEngineBatch, importInput, patchBatchInput, createBatchInput, patchBatch, postInput } from '../services/batches.js';
import { audit } from '../audit.js';
import { draftBriefSchema, draftTitle } from '../services/ai-jobs.js';
import { enqueueTracked } from '../services/activity.js';
import { batchView, countPosts, postSummary } from '../services/post-view.js';

const UUID = /^[0-9a-f-]{36}$/i;
const addPostsInput = z.strictObject({ posts: z.array(postInput).min(1).max(100) });

export function batchesRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin', 'editor'));

  const load = async (id: string) => {
    const batch = UUID.test(id) ? await deps.prisma.batch.findUnique({ where: { id }, include: { owner: { select: { id: true, name: true, email: true } }, posts: { orderBy: { position: 'asc' } } } }) : null;
    if (!batch) throw notFound('Batch not found');
    return batch;
  };

  app.get('/', async (c) => {
    const batches = await deps.prisma.batch.findMany({
      orderBy: { createdAt: 'desc' }, take: 200,
      include: { owner: { select: { id: true, name: true, email: true } }, posts: { select: { status: true, renderStatus: true } } },
    });
    return c.json({ batches: batches.map((b) => batchView(b, b.owner, countPosts(b.posts))) });
  });

  app.post('/', async (c) => {
    const actor = c.get('user');
    const { batch, posts } = await createBatch(deps, actor, await readJson(c, createBatchInput));
    return c.json({ batch: batchView(batch, { id: actor.id, name: actor.name, email: actor.email }, countPosts(posts)) }, 201);
  });

  app.post('/import', async (c) => {
    const actor = c.get('user');
    const { json } = await readJson(c, importInput);
    let raw = json;
    if (typeof json === 'string') {
      try {
        raw = JSON.parse(json);
      } catch {
        throw new HttpError(422, 'The batch is not valid', ['the text is not valid JSON']);
      }
    }
    const { batch, posts, warnings } = await importEngineBatch(deps, actor, raw);
    return c.json({ batch: batchView(batch, { id: actor.id, name: actor.name, email: actor.email }, countPosts(posts)), warnings }, 201);
  });

  // Asks the AI to draft a batch in the background. The batch appears in the list, marked as an AI draft, when it is ready;
  // if the drafting fails, the reason is in the audit log (ai.draft_batch.failed).
  app.post('/ai-draft', async (c) => {
    const actor = c.get('user');
    const brief = await readJson(c, draftBriefSchema);
    const ready = await deps.prisma.aiProvider.count({ where: { enabled: true, tasks: { has: 'draft' } } });
    if (!ready) throw new HttpError(409, 'No AI provider is set up for drafting. Ask an admin to add one in Settings, AI');
    const { jobId, activityId } = await enqueueTracked(deps, 'draft-batch', { actorId: actor.id, brief }, { singletonKey: `draft-batch:${actor.id}` }, { title: draftTitle(deps, brief), actorId: actor.id });
    await audit(deps, actor, 'ai.draft_requested', 'batch', null, { queued: jobId !== null, count: brief.count ?? 10 });
    return c.json({ queued: jobId !== null, alreadyQueued: jobId === null, activityId }, 202);
  });

  app.get('/:id', async (c) => {
    const b = await load(c.req.param('id'));
    const posts = await Promise.all(b.posts.map((p) => postSummary(deps, p)));
    return c.json({ batch: { ...batchView(b, b.owner, countPosts(b.posts)), aiDraft: b.aiDraft ?? null }, posts });
  });

  app.patch('/:id', async (c) => {
    const actor = c.get('user');
    const b = await load(c.req.param('id'));
    const updated = await patchBatch(deps, actor, b.id, await readJson(c, patchBatchInput));
    const fresh = await load(updated.id);
    return c.json({ batch: batchView(fresh, fresh.owner, countPosts(fresh.posts)) });
  });

  app.delete('/:id', async (c) => {
    const b = await load(c.req.param('id'));
    await deleteBatch(deps, c.get('user'), b.id);
    return c.json({ ok: true });
  });

  app.post('/:id/posts', async (c) => {
    const b = await load(c.req.param('id'));
    const { posts } = await readJson(c, addPostsInput);
    const created = await addPosts(deps, c.get('user'), b.id, posts);
    return c.json({ posts: await Promise.all(created.map((p) => postSummary(deps, p))) }, 201);
  });

  return app;
}
