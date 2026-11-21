import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { jpegBytes, pngBytes, seedBatch } from './testing-batches.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

const ID = '00000000-0000-4000-8000-000000000000';
const NETS = ['linkedin', 'facebook'];

async function setup(posts: Parameters<typeof seedBatch>[2] extends infer O ? (O extends { posts?: infer P } ? P : never) : never = [{ key: 'a' }], defaultNetworks = NETS) {
  const editor = await t.signedIn('editor');
  const seeded = await seedBatch(t, editor.user, { defaultNetworks, posts });
  return { ...editor, ...seeded };
}

const approveBlockers = async (api: ReturnType<TestApp['api']>, id: string) => {
  const res = await api.post(`/api/posts/${id}/approve`);
  expect(res.status).toBe(409);
  return res.body.blockers as string[];
};

describe('authentication on every review route', () => {
  const routes: Array<[string, string, unknown?]> = [
    ['GET', `/api/posts/${ID}`], ['PATCH', `/api/posts/${ID}`, { caption: 'x' }], ['POST', `/api/posts/${ID}/render`], ['POST', `/api/posts/${ID}/approve`],
    ['POST', `/api/posts/${ID}/unapprove`], ['DELETE', `/api/posts/${ID}`], ['POST', `/api/posts/${ID}/restore`], ['POST', `/api/posts/${ID}/media`],
    ['DELETE', `/api/posts/${ID}/media/a.jpg`], ['POST', `/api/posts/batches/${ID}/approve-all`],
  ];
  it.each(routes)('%s %s needs a signed-in user', async (method, url, body) => {
    const api = t.api();
    const res = method === 'GET' ? await api.get(url) : method === 'DELETE' ? await api.delete(url) : method === 'PATCH' ? await api.patch(url, body) : await api.post(url, body);
    expect(res.status).toBe(401);
  });

  it('lets another editor and an admin review, approve and edit a post they do not own', async () => {
    const { posts } = await setup();
    const other = await t.signedIn('editor');
    const admin = await t.signedIn('admin');
    expect((await other.api.get(`/api/posts/${posts[0]!.id}`)).status).toBe(200);
    expect((await other.api.patch(`/api/posts/${posts[0]!.id}`, { caption: 'Edited by someone else' })).status).toBe(200);
    expect((await other.api.post(`/api/posts/${posts[0]!.id}/approve`)).status).toBe(200);
    expect((await admin.api.post(`/api/posts/${posts[0]!.id}/unapprove`)).status).toBe(200);
  });

  it('answers 404 for a post that does not exist', async () => {
    const { api } = await setup();
    expect((await api.get(`/api/posts/${ID}`)).status).toBe(404);
    expect((await api.get('/api/posts/nope')).status).toBe(404);
  });
});

describe('reading a post', () => {
  it('returns signed image links for 300 seconds, the blockers and the warnings, and no bucket keys', async () => {
    const { api, posts } = await setup([{ key: 'a', warnings: ['The AI was unsure about the date'] }]);
    const res = await api.get(`/api/posts/${posts[0]!.id}`);
    expect(res.status).toBe(200);
    expect(res.body.post.media).toHaveLength(1);
    expect(res.body.post.media[0].url).toContain('ttl=300');
    expect(res.body.post.media[0]).not.toHaveProperty('key');
    expect(res.body.blockers).toEqual([]);
    expect(res.body.warnings).toContain('The AI was unsure about the date');
    expect(res.body.batch).toMatchObject({ timezone: 'UTC' });
  });
});

describe('editing a post', () => {
  it('takes approval back when the words, date, time or networks change, and audits it', async () => {
    const { api, posts } = await setup([{ key: 'a', status: 'approved' }]);
    const id = posts[0]!.id;
    expect((await api.patch(`/api/posts/${id}`, { title: 'A better label' })).status).toBe(200);
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id } })).status).toBe('approved');

    for (const change of [{ caption: 'New words #AcmeSavings' }, { date: '2027-07-01' }, { time: '11:30' }, { networks: { skip: ['facebook'] } }]) {
      await t.prisma.post.update({ where: { id }, data: { status: 'approved', approvedAt: new Date(), approvedById: posts[0]!.approvedById } });
      const res = await api.patch(`/api/posts/${id}`, change);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const row = await t.prisma.post.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('draft');
      expect(row.approvedAt).toBeNull();
    }
    const unapproved = await t.prisma.auditLog.findMany({ where: { action: 'post.unapprove' } });
    expect(unapproved).toHaveLength(4);
    expect(unapproved[0]!.detail).toMatchObject({ auto: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'post.update' } })).toBe(5);
  });

  it('stores per-network captions and the skip list in the engine shape', async () => {
    const { api, posts } = await setup();
    const res = await api.patch(`/api/posts/${posts[0]!.id}`, { networks: { skip: ['facebook'], linkedin: { caption: 'Longer LinkedIn words' } } });
    expect(res.status).toBe(200);
    expect(res.body.post.networks).toEqual({ linkedin: { caption: 'Longer LinkedIn words' }, skip: ['facebook'] });
  });

  it('refuses invalid edits with every reason, and changes nothing', async () => {
    const { api, posts } = await setup();
    const id = posts[0]!.id;
    const bad = await api.patch(`/api/posts/${id}`, { date: '2027-13-40', design: { template: 'nonsense' } });
    expect(bad.status).toBe(422);
    expect(bad.body.details.join('\n')).toContain('2027-13-40');
    expect(bad.body.details.join('\n')).toContain('design');
    expect((await api.patch(`/api/posts/${id}`, { networks: { skip: ['linkedin', 'facebook', 'x', 'instagram'] } })).status).toBe(422);
    expect((await api.patch(`/api/posts/${id}`, { networks: { linkedin: { media: ['missing.jpg'] } } })).status).toBe(422);
    expect((await api.patch(`/api/posts/${id}`, { nope: 1 })).status).toBe(400);
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id } })).caption).toContain('Caption for a');
  });

  it('queues a render only when the design changes, and drops rendered files when the design goes', async () => {
    const { api, posts, batch } = await setup([{ key: 'a' }]);
    const id = posts[0]!.id;
    const design = { template: 'photo', headline: 'Every euro, *on record*', image: 'design/assets/photos/cocoa-pods.jpg' };
    const res = await api.patch(`/api/posts/${id}`, { design });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.post.renderStatus).toBe('queued');
    expect(t.jobs.enqueued.filter((j) => j.name === 'render-post')).toEqual([{ name: 'render-post', payload: { postId: id, activityId: expect.any(String) }, options: { singletonKey: id } }]);

    t.jobs.enqueued.length = 0;
    expect((await api.patch(`/api/posts/${id}`, { caption: 'Other words' })).body.post.renderStatus).toBe('queued');
    expect(t.jobs.enqueued).toHaveLength(0);

    // A rendered file and an uploaded file; removing the design drops only the rendered one.
    const media = [
      { rel: 'r.jpg', key: `renders/${batch.id}/a/feed-r.jpg`, sha256: 'a'.repeat(64), size: 3, contentType: 'image/jpeg', kind: 'image', source: 'render', renderSize: 'feed', slide: null },
      { rel: 'u.jpg', key: `renders/${batch.id}/a/u.jpg`, sha256: 'b'.repeat(64), size: 3, contentType: 'image/jpeg', kind: 'image', source: 'upload' },
    ];
    await t.storage.putObject(media[0]!.key, jpegBytes(), 'image/jpeg');
    await t.prisma.post.update({ where: { id }, data: { media, renderStatus: 'ok' } });
    const gone = await api.patch(`/api/posts/${id}`, { design: null });
    expect(gone.body.post.design).toBeNull();
    expect(gone.body.post.renderStatus).toBe('none');
    expect(gone.body.post.media.map((m: { rel: string }) => m.rel)).toEqual(['u.jpg']);
    expect(t.storage.objects.has(media[0]!.key)).toBe(false);
  });
});

describe('what stops an approval', () => {
  it('approves a clean post, records who and when, and moves the batch to review', async () => {
    const { api, user, posts, batch } = await setup();
    const res = await api.post(`/api/posts/${posts[0]!.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.post).toMatchObject({ status: 'approved', approvedById: user.id });
    expect(res.body.post.approvedAt).toBeTruthy();
    expect((await t.prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).status).toBe('in_review');
    expect(await t.prisma.auditLog.count({ where: { action: 'post.approve' } })).toBe(1);
    // Approving twice is not an error and does not log twice.
    expect((await api.post(`/api/posts/${posts[0]!.id}/approve`)).status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'post.approve' } })).toBe(1);
  });

  it('blocks a design whose images are not ready or failed', async () => {
    const design = { template: 'photo', headline: 'Hello *world*', image: 'design/assets/photos/cocoa-pods.jpg' };
    const { api, posts } = await setup([
      { key: 'queued', design, renderStatus: 'queued', images: [] },
      { key: 'failed', design, renderStatus: 'failed', images: [] },
    ]);
    expect((await approveBlockers(api, posts[0]!.id)).join('\n')).toContain('images are not ready');
    await t.prisma.post.update({ where: { id: posts[1]!.id }, data: { renderError: 'Chrome was not found' } });
    expect((await approveBlockers(api, posts[1]!.id)).join('\n')).toContain('Chrome was not found');
    expect(await t.prisma.post.count({ where: { status: 'approved' } })).toBe(0);
  });

  it('blocks Instagram without an image and a caption over the limit, but not other warnings', async () => {
    const { api, posts } = await setup([{ key: 'noimage', images: [] }, { key: 'long', caption: 'y'.repeat(300), networks: { skip: ['facebook', 'linkedin'] } }, { key: 'tags', caption: Array.from({ length: 35 }, (_, i) => `#tag${i}`).join(' ') }], ['instagram', 'linkedin', 'x']);
    expect((await approveBlockers(api, posts[0]!.id)).join('\n')).toContain('instagram: Instagram needs media');
    expect((await approveBlockers(api, posts[1]!.id)).join('\n')).toContain('x: caption is 300 characters');
    const view = await api.get(`/api/posts/${posts[2]!.id}`);
    expect(view.body.warnings.join('\n')).toContain('35 hashtags');
    expect(view.body.blockers.join('\n')).not.toContain('hashtags');
  });

  it('uses the account caption limit when the route has one', async () => {
    const acct = await t.prisma.bufferAccount.create({ data: { name: 'big', keyCipher: 'v1.x.y', keyVersion: 1, keyLast4: '0000', captionLimits: { x: 4000 } } });
    await t.prisma.channelRoute.create({ data: { network: 'x', accountId: acct.id, channelId: 'chx' } });
    const { api, posts } = await setup([{ key: 'long', caption: 'y'.repeat(300) }], ['x']);
    expect((await api.post(`/api/posts/${posts[0]!.id}/approve`)).status).toBe(200);
  });

  it('blocks sources that are unconfirmed, missing, deleted or stale', async () => {
    const editor = await t.signedIn('editor');
    const mk = (data: Record<string, unknown>) => t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'T', body: 'b', status: 'confirmed', createdById: editor.user.id, ...data } as never });
    const unconfirmed = await mk({ title: 'Unconfirmed claim', status: 'unconfirmed' });
    const deleted = await mk({ title: 'Deleted claim', deletedAt: new Date() });
    const stale = await mk({ title: 'Old figure', kind: 'figure', validUntil: new Date('2020-01-01') });
    const good = await mk({ title: 'Good claim' });
    const missing = '22222222-2222-4222-8222-222222222222';
    const { batch } = await seedBatch(t, editor.user, {
      defaultNetworks: NETS,
      posts: [{ key: 'u', sources: [unconfirmed.id] }, { key: 'd', sources: [deleted.id] }, { key: 's', sources: [stale.id] }, { key: 'm', sources: [missing] }, { key: 'g', sources: [good.id] }],
    });
    const posts = await t.prisma.post.findMany({ where: { batchId: batch.id }, orderBy: { position: 'asc' } });
    expect((await approveBlockers(editor.api, posts[0]!.id)).join('\n')).toContain('"Unconfirmed claim" has not been confirmed');
    expect((await approveBlockers(editor.api, posts[1]!.id)).join('\n')).toContain('"Deleted claim" was deleted');
    expect((await approveBlockers(editor.api, posts[2]!.id)).join('\n')).toContain('only valid until');
    expect((await approveBlockers(editor.api, posts[3]!.id)).join('\n')).toContain('no longer in the vault');
    expect((await editor.api.post(`/api/posts/${posts[4]!.id}/approve`)).status).toBe(200);
  });

  it('blocks photo sources and a design photo whose rights are not settled', async () => {
    const editor = await t.signedIn('editor');
    const photo = (title: string, extra: Record<string, unknown> = {}) =>
      t.prisma.vaultItem.create({
        data: { kind: 'photo', title, body: '', status: 'confirmed', fileKey: `vault/${title}.jpg`, fileName: `${title}.jpg`, contentType: 'image/jpeg', size: 10, licence: 'own', createdById: editor.user.id, ...extra },
      });
    const unsure = await photo('Unsure photo', { licence: 'rights_to_confirm' });
    const people = await photo('Crowd photo', { peoplePresent: true });
    const fine = await photo('Fine photo');
    const design = (vaultItemId: string) => ({ template: 'photo', headline: 'Hello *world*', image: 'design/assets/photos/placeholder.jpg', vaultItemId });
    const { batch } = await seedBatch(t, editor.user, {
      defaultNetworks: NETS,
      posts: [{ key: 'src', sources: [unsure.id] }, { key: 'design', design: design(people.id) }, { key: 'ok', design: design(fine.id), sources: [fine.id] }],
    });
    const posts = await t.prisma.post.findMany({ where: { batchId: batch.id }, orderBy: { position: 'asc' } });
    expect((await approveBlockers(editor.api, posts[0]!.id)).join('\n')).toContain('"rights to confirm"');
    expect((await approveBlockers(editor.api, posts[1]!.id)).join('\n')).toContain('shows people and no consent is recorded');
    expect((await editor.api.post(`/api/posts/${posts[2]!.id}/approve`)).status).toBe(200);
  });

  it('treats a design image with the file name of exactly one vault photo as that photo', async () => {
    const editor = await t.signedIn('editor');
    await t.prisma.vaultItem.create({ data: { kind: 'photo', title: 'Cocoa', body: '', status: 'confirmed', fileKey: 'vault/c.jpg', fileName: 'cocoa-pods.jpg', contentType: 'image/jpeg', size: 1, licence: 'rights_to_confirm', createdById: editor.user.id } });
    const { posts } = await seedBatch(t, editor.user, { defaultNetworks: NETS, posts: [{ key: 'a', design: { template: 'photo', headline: 'Hello *x*', image: 'design/assets/photos/cocoa-pods.jpg' } }] });
    expect((await approveBlockers(editor.api, posts[0]!.id)).join('\n')).toContain('rights to confirm');
  });

  it('blocks a time that has passed, and a removed post', async () => {
    const { api, posts } = await setup([{ key: 'past', date: '2020-01-01' }, { key: 'gone', status: 'removed' }]);
    expect((await approveBlockers(api, posts[0]!.id)).join('\n')).toContain('has already passed');
    const gone = await api.post(`/api/posts/${posts[1]!.id}/approve`);
    expect(gone.status).toBe(409);
  });

  it('uses the batch time zone when judging the time', async () => {
    const editor = await t.signedIn('editor');
    const soon = new Date(Date.now() + 30 * 60_000);
    const fmt = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(soon);
    const parts = Object.fromEntries(fmt('Pacific/Kiritimati').map((p) => [p.type, p.value]));
    // Thirty minutes from now on the wall clock of a zone 14 hours ahead of UTC is still thirty minutes from now.
    const { posts } = await seedBatch(t, editor.user, { defaultNetworks: NETS, timezone: 'Pacific/Kiritimati', posts: [{ key: 'a', date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }] });
    expect((await editor.api.post(`/api/posts/${posts[0]!.id}/approve`)).status).toBe(200);
    await t.prisma.post.update({ where: { id: posts[0]!.id }, data: { status: 'draft' } });
    t.setNow(new Date(soon.getTime() + 2 * 60_000));
    expect((await approveBlockers(editor.api, posts[0]!.id)).join('\n')).toContain('already passed');
  });
});

describe('approve all without warnings', () => {
  it('approves clean posts and explains every skipped one', async () => {
    const editor = await t.signedIn('editor');
    const unconfirmed = await t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'Maybe', body: 'b', status: 'unconfirmed', createdById: editor.user.id } });
    const design = { template: 'photo', headline: 'Hello *world*', image: 'design/assets/photos/cocoa-pods.jpg' };
    const { batch } = await seedBatch(t, editor.user, {
      defaultNetworks: NETS,
      posts: [
        { key: 'clean-1' }, { key: 'clean-2' }, { key: 'warned', warnings: ['Check the number'] }, { key: 'source', sources: [unconfirmed.id] },
        { key: 'rendering', design, renderStatus: 'queued', images: [] }, { key: 'removed', status: 'removed' }, { key: 'done', status: 'approved' },
      ],
    });
    const res = await editor.api.post(`/api/posts/batches/${batch.id}/approve-all`);
    expect(res.status).toBe(200);
    expect(res.body.approved.map((p: { postKey: string }) => p.postKey)).toEqual(['clean-1', 'clean-2']);
    const reasons = Object.fromEntries(res.body.skipped.map((s: { postKey: string; reasons: string[] }) => [s.postKey, s.reasons.join(' | ')]));
    expect(reasons.warned).toContain('Warning: Check the number');
    expect(reasons.source).toContain('has not been confirmed');
    expect(reasons.rendering).toContain('not ready');
    expect(reasons.done).toBe('Already approved');
    expect(reasons.removed).toBeUndefined();
    expect(await t.prisma.post.count({ where: { status: 'approved' } })).toBe(3);
    expect(await t.prisma.auditLog.count({ where: { action: 'post.approve' } })).toBe(2);
  });

  it('answers 404 for a batch that does not exist', async () => {
    const { api } = await setup();
    expect((await api.post(`/api/posts/batches/${ID}/approve-all`)).status).toBe(404);
  });
});

describe('remove, restore, unapprove and render', () => {
  it('removes a post softly, takes its approval back, and restores it as a draft', async () => {
    const { api, posts } = await setup([{ key: 'a', status: 'approved' }]);
    const id = posts[0]!.id;
    const gone = await api.delete(`/api/posts/${id}`);
    expect(gone.status).toBe(200);
    expect(gone.body.post).toMatchObject({ status: 'removed', approvedAt: null });
    expect(gone.body.post.removedAt).toBeTruthy();
    expect((await api.patch(`/api/posts/${id}`, { caption: 'x' })).status).toBe(409);
    expect((await api.post(`/api/posts/${id}/restore`)).body.post).toMatchObject({ status: 'draft', removedAt: null });
    expect((await api.post(`/api/posts/${id}/restore`)).status).toBe(409);
    expect(await t.prisma.post.count()).toBe(1);
    expect((await t.prisma.auditLog.findMany({ select: { action: true }, orderBy: { at: 'asc' } })).map((a) => a.action)).toEqual(expect.arrayContaining(['post.remove', 'post.restore']));
  });

  it('says when a removed post is still in Buffer', async () => {
    const { api, posts } = await setup([{ key: 'a', status: 'approved' }]);
    await t.prisma.delivery.create({ data: { postId: posts[0]!.id, network: 'x', account: 'a', channelId: 'c', mode: 'draft', status: 'created', hash: 'h', dueAt: new Date() } });
    expect((await api.delete(`/api/posts/${posts[0]!.id}`)).body.inBuffer).toBe(1);
  });

  it('unapproves only an approved post', async () => {
    const { api, posts } = await setup([{ key: 'a' }, { key: 'b', status: 'approved' }]);
    expect((await api.post(`/api/posts/${posts[0]!.id}/unapprove`)).status).toBe(409);
    expect((await api.post(`/api/posts/${posts[1]!.id}/unapprove`)).body.post.status).toBe('draft');
    expect(await t.prisma.auditLog.count({ where: { action: 'post.unapprove' } })).toBe(1);
  });

  it('queues a render with 202, and refuses a post that has no design', async () => {
    const design = { template: 'photo', headline: 'Hello *world*', image: 'design/assets/photos/cocoa-pods.jpg' };
    const { api, posts } = await setup([{ key: 'plain' }, { key: 'designed', design }]);
    expect((await api.post(`/api/posts/${posts[0]!.id}/render`)).status).toBe(409);
    const res = await api.post(`/api/posts/${posts[1]!.id}/render`);
    expect(res.status).toBe(202);
    expect(res.body.post.renderStatus).toBe('queued');
    await api.post(`/api/posts/${posts[1]!.id}/render`);
    expect(t.jobs.enqueued.filter((j) => j.name === 'render-post')).toHaveLength(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'post.render' } })).toBe(2);
  });
});

describe('files uploaded by hand', () => {
  const form = (name: string, bytes: Buffer, type = 'application/octet-stream') => {
    const f = new FormData();
    f.set('file', new File([new Uint8Array(bytes)], name, { type }));
    return f;
  };

  it('stores a real image under the private renders prefix and shows a signed link', async () => {
    const { api, posts, batch } = await setup([{ key: 'a', images: [] }]);
    const res = await api.post(`/api/posts/${posts[0]!.id}/media`, form('My photo!.JPG', jpegBytes('new')));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.post.media).toHaveLength(1);
    expect(res.body.post.media[0]).toMatchObject({ rel: 'My-photo-.JPG', source: 'upload', kind: 'image', contentType: 'image/jpeg' });
    expect(res.body.post.media[0].url).toContain('ttl=300');
    const keys = [...t.storage.objects.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(new RegExp(`^renders/[A-Za-z0-9_-]{43}/${batch.id}/a/[0-9a-f]{16}-My-photo-\\.JPG$`));
    expect(keys.some((k) => k.startsWith(t.storage.publicConfig.prefix))).toBe(false);
  });

  it('gives the same photo uploaded twice two different unguessable keys', async () => {
    const { api, posts } = await setup([{ key: 'a', images: [] }]);
    const bytes = jpegBytes('same');
    await api.post(`/api/posts/${posts[0]!.id}/media`, form('p.jpg', bytes));
    await api.post(`/api/posts/${posts[0]!.id}/media`, form('p.jpg', bytes));
    const keys = [...t.storage.objects.keys()];
    expect(keys).toHaveLength(2);
    expect(new Set(keys.map((k) => k.split('/')[1])).size).toBe(2);
    for (const k of keys) expect(k.split('/')[1]).toHaveLength(43);
  });

  it('refuses files that are not what they say, are the wrong type, or are empty', async () => {
    const { api, posts } = await setup([{ key: 'a', images: [] }]);
    const id = posts[0]!.id;
    expect((await api.post(`/api/posts/${id}/media`, form('x.jpg', Buffer.from('<?php echo 1; ?>')))).status).toBe(422);
    expect((await api.post(`/api/posts/${id}/media`, form('x.jpg', pngBytes()))).status).toBe(422);
    expect((await api.post(`/api/posts/${id}/media`, form('x.exe', jpegBytes()))).status).toBe(415);
    expect((await api.post(`/api/posts/${id}/media`, form('x.jpg', Buffer.alloc(0)))).status).toBe(422);
    expect((await api.post(`/api/posts/${id}/media`, { nofile: 1 })).status).toBe(400);
    expect(t.storage.objects.size).toBe(0);
  });

  it('accepts png, webp, gif and mp4 by their real bytes', async () => {
    const { api, posts } = await setup([{ key: 'a', images: [] }]);
    const id = posts[0]!.id;
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
    const gif = Buffer.from('GIF89a......');
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
    for (const [name, bytes] of [['a.png', pngBytes()], ['b.webp', webp], ['c.gif', gif], ['d.mp4', mp4]] as const) {
      const res = await api.post(`/api/posts/${id}/media`, form(name, bytes));
      expect(res.status, name + JSON.stringify(res.body)).toBe(201);
    }
    const post = await t.prisma.post.findUniqueOrThrow({ where: { id } });
    expect((post.media as Array<{ kind: string }>).map((m) => m.kind)).toEqual(['image', 'image', 'image', 'video']);
  });

  it('takes approval back when a file is added or removed, and removes the stored object', async () => {
    const { api, posts } = await setup([{ key: 'a', status: 'approved' }]);
    const id = posts[0]!.id;
    expect((await api.post(`/api/posts/${id}/media`, form('extra.jpg', jpegBytes('extra')))).status).toBe(201);
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id } })).status).toBe('draft');
    await t.prisma.post.update({ where: { id }, data: { status: 'approved' } });
    const before = t.storage.objects.size;
    const res = await api.delete(`/api/posts/${id}/media/extra.jpg`);
    expect(res.status).toBe(200);
    expect((await t.prisma.post.findUniqueOrThrow({ where: { id } })).status).toBe('draft');
    expect(t.storage.objects.size).toBe(before - 1);
    expect((await api.delete(`/api/posts/${id}/media/extra.jpg`)).status).toBe(404);
  });
});
