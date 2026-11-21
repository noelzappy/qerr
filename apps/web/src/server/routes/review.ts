// Reviewing posts, mounted at /api/posts: read, edit, render, approve, remove, restore, files, and "approve all".
import { Hono } from 'hono';
import type { AppEnv, Deps } from '../deps.js';
import { HttpError, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { approvalReport } from '../services/approval.js';
import { approveAll, approvePost, loadPost, MAX_UPLOAD_BYTES, patchPost, patchPostInput, removeMedia, removePost, requestRender, restorePost, unapprovePost, uploadMedia } from '../services/posts.js';
import { postView } from '../services/post-view.js';

export function reviewRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin', 'editor'));

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

  app.post('/:id/render', async (c) => {
    const id = c.req.param('id');
    await requestRender(deps, c.get('user'), id);
    return c.json({ queued: true, post: await postView(deps, await loadPost(deps, id)) }, 202);
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
