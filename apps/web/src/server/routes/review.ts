// Reviewing posts, mounted at /api/posts: read, edit, render, approve, remove, restore, files, and "approve all".
import { Hono } from 'hono';
import type { AppEnv, Deps } from '../deps.js';
import { HttpError, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { z } from 'zod';
import { audit } from '../audit.js';
import { ACTIVE_STATUSES, enqueueTracked } from '../services/activity.js';
import { getSetting, SETTING_BUDGET, spentThisMonth } from '../services/ai-config.js';
import { approvalReport } from '../services/approval.js';
import { approveAll, approvePost, loadPost, MAX_UPLOAD_BYTES, patchPost, patchPostInput, removeMedia, removePost, requestRender, restorePost, unapprovePost, uploadMedia } from '../services/posts.js';
import { postView } from '../services/post-view.js';
import { ownDesignProblems, ownDesignStart, previewOwnDesign, saveOwnDesign, switchDesign } from '../services/ai-design.js';

const ownDesignBody = z.strictObject({ definition: z.record(z.string(), z.unknown()) });

export function reviewRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin', 'editor'));

  // Why a post cannot be rewritten with AI right now, in words for the person, or null when it can. Says nothing about
  // which provider is set up, only whether one is.
  async function rewriteBlocker(post: Awaited<ReturnType<typeof loadPost>>): Promise<string | null> {
    if (post.status === 'removed') return 'This post has been removed. Restore it to rewrite it';
    if (!(await deps.prisma.aiProvider.count({ where: { enabled: true, tasks: { has: 'rewrite' } } }))) return 'No AI provider is set up for rewriting posts. Ask an admin to tick "Rewriting posts" in Settings, AI and search';
    const [limit, spent] = await Promise.all([getSetting<unknown>(deps, SETTING_BUDGET, 0), spentThisMonth(deps)]);
    if (typeof limit !== 'number' || limit <= 0) return 'There is no monthly AI budget. Ask an admin to set one in Settings, AI and search';
    if (spent >= limit) return 'The monthly AI budget is used up. Ask an admin to raise it in Settings, AI and search';
    const facts = post.sources.length ? await deps.prisma.vaultItem.count({ where: { id: { in: post.sources }, deletedAt: null } }) : 0;
    if (!facts) return 'This post has no linked facts to work from. Link a fact first';
    const running = await deps.prisma.activityRun.count({ where: { kind: 'rewrite-post', postId: post.id, status: { in: ACTIVE_STATUSES } } });
    if (running) return 'A rewrite of this post is already queued or running';
    return null;
  }

  // The post, what stops it being approved, and everything worth a look.
  async function detail(id: string) {
    const post = await loadPost(deps, id);
    const report = await approvalReport(deps, post);
    const sources = post.sources.length ? await deps.prisma.vaultItem.findMany({ where: { id: { in: post.sources } }, select: { id: true, kind: true, title: true, status: true, deletedAt: true } }) : [];
    const { batch } = post;
    return {
      post: await postView(deps, post),
      blockers: report.blockers,
      warnings: report.warnings,
      sources: post.sources.map((sid) => sources.find((s) => s.id === sid) ?? { id: sid, kind: null, title: null, status: 'missing', deletedAt: null }),
      batch: { id: batch.id, name: batch.name, title: batch.title, timezone: batch.timezone, status: batch.status, ownerId: batch.ownerId },
      rewrite: await rewriteBlocker(post).then((reason) => ({ available: reason === null, reason })),
    };
  }

  // Declared before /:id routes so the literal path wins.
  app.post('/batches/:batchId/approve-all', async (c) => c.json(await approveAll(deps, c.get('user'), c.req.param('batchId'))));

  app.get('/:id', async (c) => c.json(await detail(c.req.param('id'))));

  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    await patchPost(deps, c.get('user'), id, await readJson(c, patchPostInput));
    return c.json(await detail(id));
  });

  // The post's two designs: switch to the other (the look's design back, or the AI's again). Words stay; approval is taken back.
  app.post('/:id/design/switch', async (c) => {
    const id = c.req.param('id');
    await switchDesign(deps, c.get('user'), id);
    return c.json(await detail(id));
  });
  // The post's own design in the design editor: what is wrong with a draft of it, its real picture, and saving it (the post is drawn again).
  app.get('/:id/own-design', async (c) => c.json(await ownDesignStart(deps, c.req.param('id'))));
  app.post('/:id/own-design/check', async (c) => {
    const { definition } = await readJson(c, ownDesignBody);
    return c.json({ problems: await ownDesignProblems(deps, c.req.param('id'), definition) });
  });
  app.post('/:id/own-design/preview', async (c) => {
    const { definition } = await readJson(c, ownDesignBody);
    return c.json(await previewOwnDesign(deps, c.req.param('id'), definition));
  });
  app.put('/:id/own-design', async (c) => {
    const id = c.req.param('id');
    const { definition } = await readJson(c, ownDesignBody);
    await saveOwnDesign(deps, c.get('user'), id, definition);
    return c.json(await detail(id));
  });

  app.post('/:id/render', async (c) => {
    const id = c.req.param('id');
    await requestRender(deps, c.get('user'), id);
    return c.json({ queued: true, post: await postView(deps, await loadPost(deps, id)) }, 202);
  });

  // Asks the AI to rewrite this post's words from its linked facts, in the background. The job saves the result as an edit
  // (approval is taken off) and reports in Activity. Refused here, with the reason, when it could not run.
  app.post('/:id/rewrite', async (c) => {
    const actor = c.get('user');
    const id = c.req.param('id');
    const { instruction } = await readJson(c, z.strictObject({ instruction: z.string().trim().min(1, 'Say what should change').max(500, 'Keep it to 500 characters') }));
    const post = await loadPost(deps, id);
    const reason = await rewriteBlocker(post);
    if (reason) throw new HttpError(409, reason);
    const { jobId, activityId } = await enqueueTracked(deps, 'rewrite-post', { postId: id, instruction, apply: true, actorId: actor.id }, { singletonKey: `rewrite-post:${id}` }, { title: `Rewrite: ${post.title}`, actorId: actor.id, batchId: post.batchId, postId: id });
    if (jobId === null) throw new HttpError(409, 'A rewrite of this post is already queued or running');
    await audit(deps, actor, 'ai.rewrite_requested', 'post', id, { postKey: post.postKey });
    return c.json({ queued: true, activityId }, 202);
  });

  app.post('/:id/approve', async (c) => {
    const id = c.req.param('id');
    const result = await approvePost(deps, c.get('user'), id);
    if (!result.ok) return c.json({ error: 'This post cannot be approved yet', blockers: result.blockers }, 409);
    return c.json(await detail(id));
  });

  app.post('/:id/unapprove', async (c) => {
    const id = c.req.param('id');
    await unapprovePost(deps, c.get('user'), id);
    return c.json(await detail(id));
  });

  app.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const { inBuffer } = await removePost(deps, c.get('user'), id);
    return c.json({ post: await postView(deps, await loadPost(deps, id)), inBuffer });
  });

  app.post('/:id/restore', async (c) => {
    const id = c.req.param('id');
    await restorePost(deps, c.get('user'), id);
    return c.json(await detail(id));
  });

  app.post('/:id/media', async (c) => {
    const id = c.req.param('id');
    let body: Record<string, unknown>;
    try {
      body = await c.req.parseBody();
    } catch {
      throw new HttpError(400, 'Send the file as multipart form data with the field name "file"');
    }
    const file = body.file;
    if (!(file instanceof File)) throw new HttpError(400, 'Send the file as multipart form data with the field name "file"');
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'The file is too large');
    await uploadMedia(deps, c.get('user'), id, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
    return c.json(await detail(id), 201);
  });

  app.delete('/:id/media/:rel', async (c) => {
    const id = c.req.param('id');
    await removeMedia(deps, c.get('user'), id, decodeURIComponent(c.req.param('rel')));
    return c.json(await detail(id));
  });

  return app;
}
