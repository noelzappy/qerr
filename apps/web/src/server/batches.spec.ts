import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedBatch } from './testing-batches.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

// The example batch the repository ships in batches/, so the file and the import cannot drift apart.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const example = () => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'batches', 'example-editorial.json'), 'utf8'));
const ID = '00000000-0000-0000-0000-000000000000';
const manual = (over: Record<string, unknown> = {}) => ({
  title: 'December batch', timezone: 'UTC', defaultTime: '09:00',
  posts: [{ title: 'First post', date: '2027-03-01', caption: 'Hello from Acme Savings' }],
  ...over,
});

describe('authentication on every batch route', () => {
  const routes: Array<[string, string, unknown?]> = [
    ['GET', '/api/batches'], ['POST', '/api/batches', manual()], ['POST', '/api/batches/import', { json: {} }],
    ['GET', `/api/batches/${ID}`], ['PATCH', `/api/batches/${ID}`, { title: 'x' }], ['DELETE', `/api/batches/${ID}`], ['POST', `/api/batches/${ID}/posts`, { posts: [] }],
  ];
  it.each(routes)('%s %s needs a signed-in user', async (method, url, body) => {
    const api = t.api();
    const res = method === 'GET' ? await api.get(url) : method === 'DELETE' ? await api.delete(url) : method === 'PATCH' ? await api.patch(url, body) : await api.post(url, body);
    expect(res.status).toBe(401);
    expect(await t.prisma.batch.count()).toBe(0);
  });
});

describe('importing an engine batch', () => {
  it('imports the example batch, queues a render for each design and audits it', async () => {
    const { api, user } = await t.signedIn('editor');
    const res = await api.post('/api/batches/import', { json: example() });
    expect(res.status).toBe(201);
    expect(res.body.batch).toMatchObject({ name: 'example-editorial', timezone: 'Europe/London', status: 'draft', ownerId: user.id });
    expect(res.body.batch.counts.total).toBe(7);
    expect(res.body.warnings).toEqual([]);
    const posts = await t.prisma.post.findMany({ orderBy: { position: 'asc' } });
    expect(posts.map((p) => p.postKey)[0]).toBe('01-savings-sense');
    expect(posts.every((p) => p.renderStatus === 'queued' && p.status === 'draft')).toBe(true);
    expect(posts[0]!.time).toBe('09:00');
    expect(posts[0]!.networks).toEqual({ instagram: expect.any(Object) });
    expect(t.jobs.enqueued.filter((j) => j.name === 'render-post')).toHaveLength(7);
    const log = await t.prisma.auditLog.findFirst({ where: { action: 'batch.import' } });
    expect(log?.detail).toMatchObject({ name: 'example-editorial', posts: 7 });
  });

  it('gives a second import of the same name a new unique name', async () => {
    const { api } = await t.signedIn('editor');
    await api.post('/api/batches/import', { json: example() });
    const again = await api.post('/api/batches/import', { json: example() });
    expect(again.status).toBe(201);
    expect(again.body.batch.name).toBe('example-editorial-2');
  });

  it('lists every error at once as a 422', async () => {
    const { api } = await t.signedIn('editor');
    const bad = {
      name: 'bad', timezone: 'Mars/Olympus', defaultTime: '25:00', mediaRoot: 'media/bad',
      posts: [{ id: 'a', date: '2027-02-31', caption: 'x' }],
    };
    const res = await api.post('/api/batches/import', { json: bad });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('The batch is not valid');
    expect(res.body.details.join('\n')).toContain('Mars/Olympus');
    expect(res.body.details.join('\n')).toContain('25:00');

    const second = await api.post('/api/batches/import', {
      json: {
        name: 'bad2', timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'media/bad',
        posts: [
          { id: 'one', date: '2027-02-31', caption: 'x' },
          { id: 'one', date: '2027-03-01', caption: '' },
          { id: 'three', date: '2027-03-01', caption: 'ok', skip: ['instagram', 'linkedin', 'facebook'], design: { template: 'nonsense' } },
        ],
      },
    });
    expect(second.status).toBe(422);
    const text = second.body.details.join('\n');
    expect(text).toContain('2027-02-31');
    expect(text).toContain('duplicate id');
    expect(text).toContain('caption is required');
    expect(text).toContain('template must be one of');
    expect(second.body.details.length).toBeGreaterThanOrEqual(4);
    expect(await t.prisma.batch.count()).toBe(0);
  });

  it('refuses a design picture that is not under design/assets or a vault photo', async () => {
    const { api } = await t.signedIn('editor');
    const raw = example();
    raw.posts = [{ ...raw.posts[0], design: { template: 'photo', headline: 'Hello *there*', image: '/etc/hosts.jpg' } }];
    const res = await api.post('/api/batches/import', { json: raw });
    expect(res.status).toBe(422);
    expect(res.body.details.join('\n')).toContain('must be a file under design/assets/');
    raw.posts[0].design.image = 'design/assets/../../secrets.png';
    expect((await api.post('/api/batches/import', { json: raw })).status).toBe(422);
  });

  it('accepts a media-only post with a warning that the files must be uploaded', async () => {
    const { api } = await t.signedIn('editor');
    const raw = { name: 'legacy', timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'media/legacy', posts: [{ id: 'p1', date: '2027-04-01', caption: 'Legacy post', media: ['photo-1.jpg', 'photo-2.jpg'] }] };
    const res = await api.post('/api/batches/import', { json: raw });
    expect(res.status).toBe(201);
    expect(res.body.warnings[0]).toContain('photo-1.jpg');
    const post = await t.prisma.post.findFirstOrThrow();
    expect(post.media).toEqual([]);
    expect(post.warnings[0]).toContain('Upload the images to this post');
    expect(post.renderStatus).toBe('none');
  });

  it('keeps known vault sources and turns unknown ones into warnings', async () => {
    const { api, user } = await t.signedIn('editor');
    const item = await t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'A fact', body: 'b', status: 'confirmed', createdById: user.id } });
    const unknown = '11111111-1111-4111-8111-111111111111';
    const raw = { name: 'src', timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'm', posts: [{ id: 'p1', date: '2027-04-01', caption: 'Post', sources: [item.id, unknown], warnings: ['Check the figure'] }] };
    const res = await api.post('/api/batches/import', { json: raw });
    expect(res.status).toBe(201);
    const post = await t.prisma.post.findFirstOrThrow();
    expect(post.sources).toEqual([item.id]);
    expect(post.warnings).toContain('Check the figure');
    expect(post.warnings.some((w) => w.includes(unknown))).toBe(true);
    expect(res.body.warnings.some((w: string) => w.includes(unknown))).toBe(true);
  });

  it('accepts the batch as JSON text and refuses text that is not JSON', async () => {
    const { api } = await t.signedIn('editor');
    expect((await api.post('/api/batches/import', { json: JSON.stringify(example()) })).status).toBe(201);
    const res = await api.post('/api/batches/import', { json: '{nope' });
    expect(res.status).toBe(422);
    expect(res.body.details[0]).toContain('not valid JSON');
  });
});

describe('creating a batch by hand', () => {
  it('creates a batch with an automatic unique name and default networks', async () => {
    const { api, user } = await t.signedIn('editor');
    const one = await api.post('/api/batches', manual());
    expect(one.status).toBe(201);
    expect(one.body.batch).toMatchObject({ name: 'december-batch', ownerId: user.id, defaultNetworks: ['instagram', 'linkedin', 'facebook'], periodStart: '2027-03-01', periodEnd: '2027-03-01' });
    const two = await api.post('/api/batches', manual());
    expect(two.body.batch.name).toBe('december-batch-2');
    const post = await t.prisma.post.findFirstOrThrow({ where: { batchId: one.body.batch.id } });
    expect(post).toMatchObject({ postKey: '01-first-post', time: '09:00', renderStatus: 'none' });
    expect((await t.prisma.auditLog.findMany({ where: { action: 'batch.create' } })).length).toBe(2);
  });

  it('refuses a bad time zone and a bad post, reporting each', async () => {
    const { api } = await t.signedIn('editor');
    const tz = await api.post('/api/batches', manual({ timezone: 'Nowhere/Land' }));
    expect(tz.status).toBe(422);
    expect(tz.body.details[0]).toContain('Nowhere/Land');
    const post = await api.post('/api/batches', manual({ posts: [{ title: 'x', date: '2027-13-01', caption: 'c' }, { title: 'y', date: '2027-03-01', caption: 'c', design: { template: 'nope' } }] }));
    expect(post.status).toBe(422);
    expect(post.body.details.length).toBeGreaterThanOrEqual(2);
    const shape = await api.post('/api/batches', { ...manual(), extra: 1 });
    expect(shape.status).toBe(400);
    expect(await t.prisma.batch.count()).toBe(0);
  });

  it('refuses an unknown vault source on a manual post', async () => {
    const { api } = await t.signedIn('editor');
    const res = await api.post('/api/batches', manual({ posts: [{ title: 'x', date: '2027-03-01', caption: 'c', sources: ['11111111-1111-4111-8111-111111111111'] }] }));
    expect(res.status).toBe(422);
    expect(res.body.details[0]).toContain('is not in the vault');
  });

  it('adds posts to an existing batch and refuses a duplicate key', async () => {
    const { api } = await t.signedIn('editor');
    const made = await api.post('/api/batches', manual());
    const id = made.body.batch.id;
    const added = await api.post(`/api/batches/${id}/posts`, { posts: [{ title: 'Second', date: '2027-03-02', caption: 'More' }] });
    expect(added.status).toBe(201);
    expect(added.body.posts[0].postKey).toBe('02-second');
    const dup = await api.post(`/api/batches/${id}/posts`, { posts: [{ postKey: '02-second', title: 'Again', date: '2027-03-03', caption: 'More' }] });
    expect(dup.status).toBe(422);
  });

  it('widens the period of a batch started empty as posts are added or moved, and never narrows it', async () => {
    const { api } = await t.signedIn('editor');
    const made = await api.post('/api/batches', manual({ posts: [] }));
    expect(made.status).toBe(201);
    const id = made.body.batch.id;
    expect(made.body.batch).toMatchObject({ periodStart: null, periodEnd: null });
    const added = await api.post(`/api/batches/${id}/posts`, { posts: [{ title: 'One', date: '2027-03-10', caption: 'c' }, { title: 'Two', date: '2027-03-04', caption: 'c' }] });
    expect(added.status).toBe(201);
    expect(await t.prisma.batch.findUniqueOrThrow({ where: { id } })).toMatchObject({ periodStart: '2027-03-04', periodEnd: '2027-03-10' });
    const moved = await api.patch(`/api/posts/${added.body.posts[0].id}`, { date: '2027-03-20' });
    expect(moved.status).toBe(200);
    expect(await t.prisma.batch.findUniqueOrThrow({ where: { id } })).toMatchObject({ periodStart: '2027-03-04', periodEnd: '2027-03-20' });
    await api.patch(`/api/posts/${added.body.posts[0].id}`, { date: '2027-03-06' });
    expect(await t.prisma.batch.findUniqueOrThrow({ where: { id } })).toMatchObject({ periodStart: '2027-03-04', periodEnd: '2027-03-20' });
  });
});

describe('post keys that are only dots', () => {
  it.each(['.', '..', '...'])('refuses %s by hand and on import, and accepts a key that merely starts with a dot', async (key) => {
    const { api } = await t.signedIn('editor');
    const hand = await api.post('/api/batches', manual({ posts: [{ postKey: key, title: 'x', date: '2027-03-01', caption: 'c' }] }));
    expect(hand.status).toBe(400);
    const imported = await api.post('/api/batches/import', { json: { name: 'dots', timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'm', posts: [{ id: key, date: '2027-04-01', caption: 'Post' }] } });
    expect(imported.status).toBe(422);
    expect(imported.body.details.join(' ')).toContain('cannot be only dots');
    expect(await t.prisma.batch.count()).toBe(0);
    const ok = await api.post('/api/batches', manual({ posts: [{ postKey: `${key}a`, title: 'x', date: '2027-03-01', caption: 'c' }] }));
    expect(ok.status).toBe(201);
  });

  it('refuses a dotted key when adding a post, and never turns an upload name into a path part', async () => {
    const { api } = await t.signedIn('editor');
    const made = await api.post('/api/batches', manual());
    expect((await api.post(`/api/batches/${made.body.batch.id}/posts`, { posts: [{ postKey: '..', title: 'x', date: '2027-03-02', caption: 'c' }] })).status).toBe(400);
    const { safeFileName, assertInside } = await import('./services/post-model.js');
    expect(['.', '..', '...', '/..'].map(safeFileName)).toEqual(['file', 'file', 'file', 'file']);
    expect(() => assertInside('/tmp/base', '/tmp/base/../etc/x')).toThrow();
    expect(() => assertInside('/tmp/base', '/tmp/base')).toThrow();
    expect(assertInside('/tmp/base', '/tmp/base/a/b')).toBe('/tmp/base/a/b');
  });

  it('will not render, approve or send a post whose stored key is only dots', async () => {
    const { api, user } = await t.signedIn('editor');
    const { posts } = await seedBatch(t, user, { defaultNetworks: ['linkedin'], posts: [{ key: '..', images: [] }] });
    const res = await api.post(`/api/posts/${posts[0]!.id}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.blockers.join(' ')).toContain('cannot be used for files');
    const { renderPost } = await import('./services/render.js');
    await t.prisma.post.update({ where: { id: posts[0]!.id }, data: { design: { template: 'photo', headline: 'Hi *x*', image: 'design/assets/photos/cocoa-pods.jpg' } } });
    await renderPost(t.deps, { postId: posts[0]!.id });
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id: posts[0]!.id } })).renderStatus).toBe('failed');
  });
});

describe('listing, reading, changing and deleting', () => {
  it('lists batches with counts per post status and the owner', async () => {
    const { api, user } = await t.signedIn('editor');
    await seedBatch(t, user, { name: 'b1', posts: [{ key: 'a', status: 'approved' }, { key: 'b' }, { key: 'c', status: 'removed' }] });
    const res = await api.get('/api/batches');
    expect(res.status).toBe(200);
    expect(res.body.batches[0]).toMatchObject({ name: 'b1', owner: { id: user.id }, counts: { total: 3, draft: 1, approved: 1, removed: 1 } });
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('returns a batch with its posts and thumbnails', async () => {
    const { api, user } = await t.signedIn('editor');
    const { batch } = await seedBatch(t, user, { posts: [{ key: 'a' }] });
    const res = await api.get(`/api/batches/${batch.id}`);
    expect(res.status).toBe(200);
    expect(res.body.posts[0]).toMatchObject({ postKey: 'a', status: 'draft', mediaCount: 1 });
    expect(res.body.posts[0].thumbnailUrl).toContain('ttl=300');
    expect((await api.get('/api/batches/not-an-id')).status).toBe(404);
  });

  it('changes the title freely and resets approvals when timing changes', async () => {
    const { api, user } = await t.signedIn('editor');
    const { batch } = await seedBatch(t, user, { posts: [{ key: 'a', status: 'approved' }] });
    const title = await api.patch(`/api/batches/${batch.id}`, { title: 'New title' });
    expect(title.body.batch.title).toBe('New title');
    expect((await t.prisma.post.findFirstOrThrow()).status).toBe('approved');
    const tz = await api.patch(`/api/batches/${batch.id}`, { timezone: 'Europe/London', defaultNetworks: ['linkedin'] });
    expect(tz.status).toBe(200);
    expect((await t.prisma.post.findFirstOrThrow()).status).toBe('draft');
    expect((await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'batch.update' }, orderBy: { at: 'desc' } })).detail).toMatchObject({ approvalsReset: 1 });
    expect((await api.patch(`/api/batches/${batch.id}`, { timezone: 'Mars/Base' })).status).toBe(422);
  });

  it('keeps the timing of a batch that is already in Buffer', async () => {
    const { api, user } = await t.signedIn('editor');
    const { batch, posts } = await seedBatch(t, user, { posts: [{ key: 'a', status: 'approved' }] });
    await t.prisma.delivery.create({ data: { postId: posts[0]!.id, network: 'x', account: 'a', channelId: 'c', mode: 'draft', status: 'created', hash: 'h', dueAt: new Date() } });
    expect((await api.patch(`/api/batches/${batch.id}`, { defaultTime: '10:00' })).status).toBe(409);
    expect((await api.patch(`/api/batches/${batch.id}`, { title: 'Still fine' })).status).toBe(200);
  });

  it('deletes a draft batch for its owner or an admin, and not for another editor', async () => {
    const owner = await t.signedIn('editor');
    const other = await t.signedIn('editor');
    const admin = await t.signedIn('admin');
    const { batch } = await seedBatch(t, owner.user, { posts: [{ key: 'a' }] });
    expect((await other.api.delete(`/api/batches/${batch.id}`)).status).toBe(403);
    expect((await owner.api.delete(`/api/batches/${batch.id}`)).status).toBe(200);
    expect(await t.prisma.batch.count()).toBe(0);
    expect(t.storage.objects.size).toBe(0);
    const again = await seedBatch(t, owner.user, { posts: [{ key: 'a' }] });
    expect((await admin.api.delete(`/api/batches/${again.batch.id}`)).status).toBe(200);
    expect((await t.prisma.auditLog.findMany({ where: { action: 'batch.delete' } })).length).toBe(2);
  });

  it('refuses to delete a batch that has anything in Buffer, even an unclear send', async () => {
    const { api, user } = await t.signedIn('editor');
    const { batch, posts } = await seedBatch(t, user, { posts: [{ key: 'a' }] });
    await t.prisma.delivery.create({ data: { postId: posts[0]!.id, network: 'x', account: 'a', channelId: 'c', mode: 'draft', status: 'unknown', hash: 'h', dueAt: new Date() } });
    const res = await api.delete(`/api/batches/${batch.id}`);
    expect(res.status).toBe(409);
    expect(await t.prisma.batch.count()).toBe(1);
  });
});
