// Batches: list, create, import an engine batch, change, delete. Editors and admins; the creator is the batch's owner.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Deps } from '../deps.js';
import { HttpError, notFound, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { addPosts, createBatch, deleteBatch, importEngineBatch, importInput, patchBatchInput, createBatchInput, patchBatch, postInput } from '../services/batches.js';
import { audit } from '../audit.js';
import { draftBriefSchema, draftTitle, findWebOccasions, periodOccasions } from '../services/ai-jobs.js';
import { enqueueTracked } from '../services/activity.js';
import { aiReadiness } from '../services/ai-config.js';
import { batchView, countPosts, postSummary } from '../services/post-view.js';

const UUID = /^[0-9a-f-]{36}$/i;
const addPostsInput = z.strictObject({ posts: z.array(postInput).min(1).max(100) });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const periodQuery = z.object({ from: z.string().regex(DAY), to: z.string().regex(DAY) });
const webOccasionsInput = z.strictObject({ periodStart: z.string().regex(DAY), periodEnd: z.string().regex(DAY), known: z.array(z.string().max(80)).max(60).optional() });

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
  // Whether drafting can run, so the dialog can say what is missing before anyone fills it in.
  app.get('/ai-draft', async (c) => {
    const [ready, search] = await Promise.all([aiReadiness(deps, 'draft'), deps.prisma.searchSetting.findUnique({ where: { id: 'search' }, select: { id: true } })]);
    return c.json({ ...ready, search: !!search });
  });

  // The occasions of a period for "This period" in Draft with AI: the calendar's, for the brand's country. Free: no AI runs.
  app.get('/ai-draft/occasions', async (c) => {
    const p = periodQuery.safeParse({ from: c.req.query('from'), to: c.req.query('to') });
    if (!p.success || p.data.to < p.data.from) throw new HttpError(422, 'Give the period as from and to, like 2026-12-01');
    if (Date.parse(p.data.to) - Date.parse(p.data.from) > 400 * 86_400_000) throw new HttpError(422, 'A period of at most 400 days');
    return c.json(await periodOccasions(deps, p.data));
  });

  // "Look for events this month": a web search and an AI call (budget, log and cost apply). Proposals only; nothing is saved.
  app.post('/ai-draft/occasions/web', async (c) => {
    const body = await readJson(c, webOccasionsInput);
    if (body.periodEnd < body.periodStart) throw new HttpError(422, 'The end must be on or after the start');
    const { missing } = await aiReadiness(deps, 'draft');
    if (missing === 'provider') throw new HttpError(409, 'No AI provider is set up for drafting. Ask an admin to add one in Settings, AI and search');
    if (missing === 'budget') throw new HttpError(409, 'No monthly AI budget is set, so the AI cannot run. Ask an admin to set one in Settings, AI and search');
    return c.json(await findWebOccasions(deps, c.get('user'), { period: { from: body.periodStart, to: body.periodEnd }, known: body.known ?? [] }));
  });

  app.post('/ai-draft', async (c) => {
    const actor = c.get('user');
    const brief = await readJson(c, draftBriefSchema);
    const { missing } = await aiReadiness(deps, 'draft');
    if (missing === 'provider') throw new HttpError(409, 'No AI provider is set up for drafting. Ask an admin to add one in Settings, AI and search');
    if (missing === 'budget') throw new HttpError(409, 'No monthly AI budget is set, so the AI cannot run. Ask an admin to set one in Settings, AI and search');
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
