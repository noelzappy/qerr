import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pipelineEngine } from './engine/pipeline.js';
import { oneAtATime, renderPost } from './services/render.js';
import { addImage, seedBatch } from './testing-batches.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
let root: string;
beforeAll(async () => {
  t = await createTestApp();
  root = (await pipelineEngine()).root;
});
afterAll(() => t.close());
beforeEach(() => t.reset());

// The same example the command-line tool ships, so the two cannot drift apart.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
// design/assets/... lives in the engine package.
const ENGINE_PACKAGE = path.join(REPO_ROOT, 'packages', 'engine');
const example = () => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'batches', 'example-editorial.json'), 'utf8'));
const runDirs = () => {
  const dir = path.join(root, 'out', 'app-render');
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
};
const PHOTO_DESIGN = { template: 'photo', headline: 'Every euro, *on record*', image: 'design/assets/photos/cocoa-pods.jpg' };

async function postWith(design: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}) {
  const editor = await t.createUser('editor');
  const { batch, posts } = await seedBatch(t, editor, { posts: [{ key: 'p1', design, renderStatus: 'queued', images: [] }] });
  if (Object.keys(extra).length) await t.prisma.post.update({ where: { id: posts[0]!.id }, data: extra });
  return { editor, batch, post: posts[0]! };
}

describe('render job without Chrome', () => {
  afterEach(() => {
    delete process.env.CHROME_PATH;
  });

  it('marks a post with no design as not needing a render', async () => {
    const { post } = await postWith(undefined);
    await renderPost(t.deps, { postId: post.id });
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } })).renderStatus).toBe('none');
  });

  it('ignores a removed post and an unknown id', async () => {
    const { post } = await postWith(PHOTO_DESIGN, { status: 'removed' });
    await renderPost(t.deps, { postId: post.id });
    await renderPost(t.deps, { postId: '00000000-0000-4000-8000-000000000000' });
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } })).renderStatus).toBe('queued');
  });

  it('fails clearly for a design the engine rejects', async () => {
    const { post } = await postWith({ template: 'nonsense' });
    await renderPost(t.deps, { postId: post.id });
    const row = await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row.renderStatus).toBe('failed');
    expect(row.renderError).toContain('The design is not valid');
    expect(row.renderError).toContain('template must be one of');
    expect(await t.prisma.auditLog.count({ where: { action: 'post.render.failed' } })).toBe(1);
  });

  it('refuses a design picture outside design/assets before Chrome is touched', async () => {
    const { post } = await postWith({ ...PHOTO_DESIGN, image: '../../etc/photo.jpg' });
    await renderPost(t.deps, { postId: post.id });
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } })).renderError).toContain('must be a file under design/assets/');
  });

  it('fails when a vault photo is missing or was deleted, and leaves no temporary files', async () => {
    const editor = await t.createUser('editor');
    const photo = await t.prisma.vaultItem.create({ data: { kind: 'photo', title: 'Gone', body: '', status: 'confirmed', fileKey: 'vault/gone.jpg', fileName: 'gone.jpg', contentType: 'image/jpeg', size: 1, licence: 'own', deletedAt: new Date(), createdById: editor.id } });
    const { post } = await postWith({ ...PHOTO_DESIGN, vaultItemId: photo.id });
    await renderPost(t.deps, { postId: post.id });
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } })).renderError).toContain('was deleted or has no file');
    await t.prisma.post.update({ where: { id: post.id }, data: { design: { ...PHOTO_DESIGN, vaultItemId: '33333333-3333-4333-8333-333333333333' }, renderStatus: 'queued' } });
    await renderPost(t.deps, { postId: post.id });
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } })).renderError).toContain('that is not in the vault');
    expect(runDirs()).toEqual([]);
  });

  it('reports a missing Chrome as a failed render and cleans up after itself', async () => {
    process.env.CHROME_PATH = '/nonexistent/chrome';
    const { post } = await postWith(PHOTO_DESIGN);
    await renderPost(t.deps, { postId: post.id });
    const row = await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row.renderStatus).toBe('failed');
    expect(row.renderError).toContain('Chrome was not found');
    expect(runDirs()).toEqual([]);
  });
});

describe('one render at a time', () => {
  it('runs queued jobs one after another, even when one of them fails', async () => {
    const order: string[] = [];
    const job = (name: string, ms: number, fail = false) => oneAtATime(async () => {
      order.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${name}:end`);
      if (fail) throw new Error('boom');
    });
    const results = await Promise.allSettled([job('a', 30), job('b', 5, true), job('c', 1)]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });
});

// The one test that drives real Chrome: the first post of the example batch (a seven-page carousel), with its cover
// picture taken from a vault photo so the copy-from-the-bucket step is exercised too. Skipped without Chrome or without
// the (git-ignored) pictures the design names.
const needsFiles = () => {
  const post = example().posts[0];
  const pictures = [...JSON.stringify(post.design).matchAll(/"image":\s*"([^"]+)"/g)].map((m) => m[1]!);
  return pictures.every((p) => fs.existsSync(path.join(ENGINE_PACKAGE, p)));
};
let chromeAvailable = false;
try {
  const e = await pipelineEngine();
  chromeAvailable = !!e.findChrome() && needsFiles();
} catch {
  chromeAvailable = false;
}

describe.skipIf(!chromeAvailable)('render job with real Chrome', () => {
  it('renders the example carousel into the private bucket, keeps hand uploads and replaces old renders', async () => {
    const design = structuredClone(example().posts[0].design);
    const coverFile = path.join(ENGINE_PACKAGE, design.pages[0].image);
    const photoBytes = fs.readFileSync(coverFile);
    const ext = path.extname(coverFile).toLowerCase(), coverType = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
    const editor = await t.createUser('editor');
    const photo = await t.prisma.vaultItem.create({
      data: { kind: 'photo', title: 'Cover', body: '', status: 'confirmed', fileKey: `vault/cover${ext}`, fileName: `cover${ext}`, contentType: coverType, size: photoBytes.length, licence: 'own', createdById: editor.id },
    });
    await t.storage.putObject(`vault/cover${ext}`, photoBytes, coverType);
    design.pages[0].vaultItemId = photo.id;

    const { batch, posts } = await seedBatch(t, editor, { posts: [{ key: '01-savings-sense', design, renderStatus: 'queued', status: 'approved', images: ['hand.jpg'] }] });
    const old = await addImage(t, batch.id, '01-savings-sense', 'old.jpg');
    const kept = (posts[0]!.media as unknown as Array<Record<string, unknown>>)[0]!;
    await t.prisma.post.update({ where: { id: posts[0]!.id }, data: { media: [{ ...old, source: 'render', renderSize: 'feed', slide: 0 }, kept] as never } });

    await renderPost(t.deps, { postId: posts[0]!.id });

    const row = await t.prisma.post.findUniqueOrThrow({ where: { id: posts[0]!.id } });
    expect(row.renderError).toBeNull();
    expect(row.renderStatus).toBe('ok');
    const media = row.media as unknown as Array<{ rel: string; key: string; sha256: string; size: number; source: string; renderSize?: string; slide?: number; contentType: string }>;
    const rendered = media.filter((m) => m.source === 'render');
    expect(rendered).toHaveLength(7);
    expect(rendered.map((m) => m.slide)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const m of rendered) {
      expect(m.key).toMatch(new RegExp(`^renders/[A-Za-z0-9_-]{43}/${batch.id}/01-savings-sense/feed-${m.rel.replace(/\./g, '\\.')}$`));
      expect(m.contentType).toBe('image/jpeg');
      const bytes = await t.storage.getObject(m.key);
      expect(bytes[0]).toBe(0xff);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(m.sha256);
      expect(bytes.length).toBe(m.size);
    }
    expect(new Set(rendered.map((m) => m.key.split('/')[1])).size).toBe(rendered.length);
    // The hand upload stays; the old render is gone from the post and from the bucket.
    expect(media.filter((m) => m.source === 'upload').map((m) => m.rel)).toEqual(['hand.jpg']);
    expect(t.storage.objects.has(old.key)).toBe(false);
    expect([...t.storage.objects.keys()].every((k) => k.startsWith('renders/') || k.startsWith('vault/'))).toBe(true);
    // New pictures are new content: the earlier approval no longer stands.
    expect(row.status).toBe('draft');
    expect(await t.prisma.auditLog.count({ where: { action: 'post.unapprove' } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'post.render.done' } })).toBe(1);
    expect(runDirs()).toEqual([]);
  }, 240_000);
});
