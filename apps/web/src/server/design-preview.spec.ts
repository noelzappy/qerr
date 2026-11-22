// The post editor's preview: a design drawn without being saved. Chrome is never started here: invalid designs are refused
// before any drawing, and the drawing itself is replaced by a stand-in that writes a small file.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pipelineEngine, type RenderResult } from './engine/pipeline.js';
import { previewDesign } from './services/design-preview.js';
import { withRenderSlot } from './services/render-limit.js';
import { jpegBytes, seedBatch } from './testing-batches.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
let root: string;
beforeAll(async () => {
  t = await createTestApp();
  root = (await pipelineEngine()).root;
});
afterAll(() => t.close());
beforeEach(() => t.reset());

const DESIGN = { template: 'cover', headline: 'Every euro, *on record*', image: 'design/assets/photos/cocoa-pods.jpg' };
const editor = async () => t.api(await t.signIn(await t.createUser('editor')));

// Stands in for the renderer: writes one picture where the real one would, and remembers what it was asked for.
function fakeRender(calls: Array<Record<string, unknown>>, result: Partial<RenderResult> = {}) {
  return async (options: Record<string, unknown>): Promise<RenderResult> => {
    calls.push(options);
    const dir = path.resolve(String(options.root), String(options.outDir));
    fs.mkdirSync(dir, { recursive: true });
    const abs = path.join(dir, 'preview-feed.jpg');
    fs.writeFileSync(abs, jpegBytes('preview'));
    return { ok: true, files: [{ size: 'feed', slide: null, file: 'preview-feed.jpg', abs, w: 1080, h: 1350 }], warnings: ['one warning', 'one warning'], notes: [], ...result };
  };
}

describe('POST /api/posts/preview-design', () => {
  it('needs a signed-in editor or admin', async () => {
    expect((await t.api().post('/api/posts/preview-design', { design: DESIGN })).status).toBe(401);
    const admin = t.api(await t.signIn(await t.createUser('admin')));
    // A bad design is refused before any drawing, so this never reaches Chrome.
    expect((await admin.post('/api/posts/preview-design', { design: { template: 'nonsense' } })).status).toBe(422);
  });

  it('refuses a body that is not a design', async () => {
    const api = await editor();
    expect((await api.post('/api/posts/preview-design', {})).status).toBe(400);
    expect((await api.post('/api/posts/preview-design', { design: [] })).status).toBe(400);
    expect((await api.post('/api/posts/preview-design', { design: DESIGN, size: 'huge' })).status).toBe(400);
  });

  it('refuses an invalid design with the words saving a post uses', async () => {
    const api = await editor();
    const res = await api.post('/api/posts/preview-design', { design: { template: 'nonsense' } });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('The post is not valid');
    expect(res.body.details.join(' ')).toContain('template must be one of');

    const noHeadline = await api.post('/api/posts/preview-design', { design: { template: 'cover', image: DESIGN.image } });
    expect(noHeadline.status).toBe(422);
    expect(noHeadline.body.details.join(' ')).toContain('headline');

    // The same design, saved on a post, gives the same problems.
    const { posts } = await seedBatch(t, await t.createUser('editor'), { posts: [{ key: 'p1', images: [] }] });
    const saved = await api.patch(`/api/posts/${posts[0]!.id}`, { design: { template: 'cover', image: DESIGN.image } });
    expect(saved.status).toBe(422);
    expect(saved.body.details.map((d: string) => d.replace(/^post p1: /, ''))).toEqual(noHeadline.body.details);
  });

  it('refuses a picture outside design/assets', async () => {
    const api = await editor();
    const res = await api.post('/api/posts/preview-design', { design: { ...DESIGN, image: '../../etc/photo.jpg' } });
    expect(res.status).toBe(422);
    expect(res.body.details.join(' ')).toContain('must be a file under design/assets/');
  });

  it('leaves no files behind when refusing', async () => {
    const api = await editor();
    await api.post('/api/posts/preview-design', { design: { template: 'nonsense' } });
    const dir = path.join(root, 'out', 'design-preview');
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([]);
  });
});

describe('previewDesign', () => {
  it('draws one image and the design-check warnings, and stores nothing', async () => {
    const editorUser = await t.createUser('editor');
    const { post } = await seedBatch(t, editorUser, { posts: [{ key: 'p1', design: DESIGN, renderStatus: 'ok', images: [] }] }).then((s) => ({ post: s.posts[0]! }));
    const before = {
      posts: JSON.stringify(await t.prisma.post.findMany({ orderBy: { id: 'asc' } })),
      batches: await t.prisma.batch.count(),
      activity: await t.prisma.auditLog.count(),
    };
    const calls: Array<Record<string, unknown>> = [];
    const edited = { ...DESIGN, headline: 'A different headline' };
    const r = await previewDesign(t.deps, edited, { lock: withRenderSlot, render: fakeRender(calls) });
    expect(r.ok).toBe(true);
    expect(r.size).toBe('feed');
    expect(r.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(r.images).toHaveLength(1);
    expect(r.warnings).toEqual(['one warning']);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ only: ['feed'], postId: 'preview' });

    // Nothing was stored: the post, its media, the batch and the log are as they were, and the work folder is gone.
    expect(JSON.stringify(await t.prisma.post.findMany({ orderBy: { id: 'asc' } }))).toBe(before.posts);
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } })).design).toEqual(DESIGN);
    expect(await t.prisma.batch.count()).toBe(before.batches);
    expect(await t.prisma.auditLog.count()).toBe(before.activity);
    expect(fs.readdirSync(path.join(root, 'out', 'design-preview'))).toEqual([]);
  });

  it('draws the size asked for when the design makes it, else its first size', async () => {
    const calls: Array<Record<string, unknown>> = [];
    await previewDesign(t.deps, { template: 'photo', headline: 'Hello', image: DESIGN.image, sizes: ['wide', 'story'] }, { size: 'story', lock: withRenderSlot, render: fakeRender(calls) });
    await previewDesign(t.deps, { template: 'photo', headline: 'Hello', image: DESIGN.image, sizes: ['wide', 'story'] }, { size: 'square', lock: withRenderSlot, render: fakeRender(calls) });
    expect(calls.map((c) => c.only)).toEqual([['story'], ['wide']]);
  });

  it('reports a design that cannot be drawn as an answer, not an error', async () => {
    const r = await previewDesign(t.deps, DESIGN, { lock: withRenderSlot, render: fakeRender([], { ok: false, files: [], error: 'headline does not fit' }) });
    expect(r).toMatchObject({ ok: false, error: 'headline does not fit' });
    expect(r.image).toBeUndefined();
  });

  it('copies a vault photo for the drawing and removes the copy afterwards', async () => {
    const user = await t.createUser('editor');
    const key = 'vault/preview-test.jpg';
    await t.storage.putObject(key, jpegBytes('vault'), 'image/jpeg');
    const photo = await t.prisma.vaultItem.create({ data: { kind: 'photo', title: 'Team', body: '', status: 'confirmed', fileKey: key, fileName: 'team.jpg', contentType: 'image/jpeg', size: 80, licence: 'own', createdById: user.id } });
    const calls: Array<Record<string, unknown>> = [];
    const r = await previewDesign(t.deps, { ...DESIGN, image: `design/assets/photos/vault-${photo.id}.jpg`, vaultItemId: photo.id }, {
      lock: withRenderSlot,
      render: async (o) => {
        const used = (o.design as Record<string, unknown>).image as string;
        calls.push({ used, exists: fs.existsSync(path.join(root, used)), hasVaultId: 'vaultItemId' in (o.design as object) });
        return fakeRender([])(o);
      },
    });
    expect(r.ok).toBe(true);
    expect(calls[0]).toMatchObject({ exists: true, hasVaultId: false });
    expect(String(calls[0]!.used)).toContain('out/design-preview/');
    expect(fs.readdirSync(path.join(root, 'out', 'design-preview'))).toEqual([]);
  });

  it('says so when the vault photo is gone', async () => {
    const r = await previewDesign(t.deps, { ...DESIGN, image: 'design/assets/photos/vault-33333333-3333-4333-8333-333333333333.jpg', vaultItemId: '33333333-3333-4333-8333-333333333333' }, { lock: withRenderSlot, render: fakeRender([]) });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('no longer in Facts');
  });
});
