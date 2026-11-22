// Named series (services/series.ts, routes/series.ts): stored per brand, checked by the engine against the active look, numbered from the
// posts, linked to posts by the post editor and by an import, and handed to the AI drafter. No Buffer, no Chrome.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { currentSettings, resetBrandState } from './services/brand-settings.js';
import { seriesFor } from './services/series.js';
import { createTestApp, type TestApp } from './testing.js';
import { seedBatch } from './testing-batches.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => { resetBrandState(); return t.close(); });
beforeEach(async () => { await t.reset(); resetBrandState(); });

const S = '/api/settings/series';
const admin = async () => { const u = await t.createUser('admin'); return { user: u, api: t.api(await t.signIn(u)) }; };
async function withLook(api: Awaited<ReturnType<typeof admin>>['api'], ref = 'shipped:swiss') {
  await t.prisma.brandProfile.create({ data: { settings: currentSettings(null) as object } });
  expect((await api.put('/api/settings/looks/active', { ref })).status).toBe(200);
}
const tip = { name: 'Tip of the week', kind: 'statement', mark: 'Tip #{n}', cadence: 'weekly', weekday: 1, firstNumber: 12 };

describe('series settings', () => {
  it('are for admins; editors may read them for the post editor', async () => {
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await editor.get(S)).status).toBe(403);
    expect((await editor.post(S, tip)).status).toBe(403);
    expect((await editor.get('/api/series')).status).toBe(200);
  });

  it('need a look in use, and are checked by the engine against it', async () => {
    const { api } = await admin();
    const none = await api.post(S, tip);
    expect(none.status).toBe(400);
    expect(none.body.error).toMatch(/Series are drawn by a look/);
    await withLook(api);
    expect((await api.post(S, { ...tip, mark: 'Tip {n} of {n}' })).body.error).toMatch(/number once/);
    expect((await api.post(S, { ...tip, variants: [7] })).body.error).toMatch(/design 8 is not one of them/);
    expect((await api.post(S, { ...tip, cadence: 'daily' })).status).toBe(400);
    expect((await api.post(S, { ...tip, brandId: 'other' })).status).toBe(400);
    const ok = await api.post(S, tip);
    expect(ok.status).toBe(201);
    expect(ok.body.series).toMatchObject({ slug: 'tip-of-the-week', nextNumber: 12, nextMark: 'Tip #12', problems: [], designsInLook: true });
    const list = await api.get(S);
    expect(list.body.look.ref).toBe('shipped:swiss');
    expect(list.body.look.kinds.statement.length).toBeGreaterThan(0);
    expect(list.body.series.map((s: { slug: string }) => s.slug)).toEqual(['tip-of-the-week']);
  });

  it('keep designs only for the look they were chosen in, and flag it when another look is in use', async () => {
    const { api } = await admin();
    await withLook(api);
    const made = (await api.post(S, { ...tip, variants: [0] })).body.series;
    expect(made.lookRef).toBe('shipped:swiss');
    expect((await api.put('/api/settings/looks/active', { ref: 'shipped:retail' })).status).toBe(200);
    const after = (await api.get(S)).body.series[0];
    expect(after.designsInLook).toBe(false);
    // the drafter does not get designs of another look
    expect((await seriesFor(t.deps).forDrafting({ brandId: 'brand' }))[0]!.variants).toEqual([]);
    // an unrelated change is not refused because of them
    expect((await api.patch(`${S}/${made.id}`, { name: 'Weekly tip' })).status).toBe(200);
  });

  it('count their next number from the live posts that carry them, and lose the link (not the posts) when deleted', async () => {
    const { user, api } = await admin();
    await withLook(api);
    const s = (await api.post(S, tip)).body.series;
    const batch = await seedBatch(t, user, { posts: [{ key: 'a', images: [] }, { key: 'b', images: [] }, { key: 'c', images: [], status: 'removed' }] });
    await t.prisma.post.update({ where: { id: batch.posts[0]!.id }, data: { seriesId: s.id, seriesNumber: 14 } });
    await t.prisma.post.update({ where: { id: batch.posts[2]!.id }, data: { seriesId: s.id, seriesNumber: 30 } });
    expect((await api.get(S)).body.series[0]).toMatchObject({ nextNumber: 15, posts: 1, nextMark: 'Tip #15' });
    expect((await seriesFor(t.deps).forDrafting({ brandId: 'brand' }))).toEqual([{ slug: 'tip-of-the-week', name: 'Tip of the week', kind: 'statement', variants: [], mark: 'Tip #{n}', markField: 'label', cadence: 'weekly', weekday: 1, nextNumber: 15 }]);
    expect((await api.patch(`${S}/${s.id}`, { enabled: false })).body.series.enabled).toBe(false);
    expect(await seriesFor(t.deps).forDrafting({ brandId: 'brand' })).toEqual([]);
    expect((await api.delete(`${S}/${s.id}`)).status).toBe(200);
    const kept = await t.prisma.post.findUnique({ where: { id: batch.posts[0]!.id } });
    expect(kept).toMatchObject({ seriesId: null, postKey: 'a' });
  });

  it('a post is put in a series and taken out from the post editor, without touching its approval', async () => {
    const { user, api } = await admin();
    await withLook(api);
    const s = (await api.post(S, tip)).body.series;
    const batch = await seedBatch(t, user, { posts: [{ key: 'a', images: [], status: 'approved' }] });
    const id = batch.posts[0]!.id;
    const put = await api.patch(`/api/posts/${id}`, { series: { id: s.id, number: 12 } });
    expect(put.status).toBe(200);
    const row = await t.prisma.post.findUnique({ where: { id } });
    expect(row).toMatchObject({ seriesId: s.id, seriesNumber: 12, status: 'approved' });
    expect((await api.patch(`/api/posts/${id}`, { series: { id: '00000000-0000-4000-8000-000000000000', number: 1 } })).status).toBe(422);
    expect((await api.patch(`/api/posts/${id}`, { series: null })).status).toBe(200);
    expect(await t.prisma.post.findUnique({ where: { id } })).toMatchObject({ seriesId: null, seriesNumber: null });
  });

  it('an import links a post to the series its slug names, and warns about one the brand does not have', async () => {
    const { api } = await admin();
    await withLook(api);
    const s = (await api.post(S, tip)).body.series;
    const json = {
      name: 'series-import', timezone: 'UTC', defaultTime: '09:00', defaultNetworks: ['linkedin'],
      posts: [
        { id: 'a', date: '2027-06-01', caption: 'One', series: { slug: 'tip-of-the-week', number: 12 } },
        { id: 'b', date: '2027-06-02', caption: 'Two', series: { slug: 'not-ours', number: 3 } },
      ],
    };
    const res = await api.post('/api/batches/import', { json });
    expect(res.status).toBe(201);
    const posts = await t.prisma.post.findMany({ where: { batchId: res.body.batch.id }, orderBy: { position: 'asc' } });
    expect(posts.map((p) => [p.postKey, p.seriesId, p.seriesNumber])).toEqual([['a', s.id, 12], ['b', null, null]]);
    expect(posts[1]!.warnings.join()).toMatch(/names the series "not-ours", which this brand does not have/);
    expect((await api.post('/api/batches/import', { json: { ...json, name: 'bad', posts: [{ ...json.posts[0], series: { slug: 'Bad', number: 1 } }] } })).status).toBe(422);
  });
});
