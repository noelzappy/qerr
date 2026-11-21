// A carousel page made with one of the brand's own layouts: a post's design that has one is checked as a single post made with
// that layout would be, a layout a carousel page uses is kept like one a post uses, and the layout editor's preview draws a layout
// as page 1, a middle page or the last page of a carousel.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pipelineEngine } from './engine/pipeline.js';
import { resetBrandState } from './services/brand-settings.js';
import { seedBatch } from './testing-batches.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
let root: string;
beforeAll(async () => {
  t = await createTestApp();
  root = (await pipelineEngine()).root;
});
afterAll(() => { resetBrandState(); return t.close(); });
beforeEach(async () => {
  await t.reset();
  resetBrandState();
});

const at = (col: number, row: number, width: number, height: number) => ({ col, row, width, height });
const GRID = { columns: 12, rows: 24, margin: { top: 56, right: 70, bottom: 56, left: 70 }, gutter: 20, rowGutter: 0 };
// A layout made for carousels: "Start here" and a dark page on page 1, the folio on the others.
const step = (o: Record<string, unknown> = {}) => ({
  id: 'step', name: 'Step', ground: [{ when: { page: 'first' }, ground: 'dark' }, { ground: 'light' }], texture: 'none',
  fields: { headline: { required: true, max: 90 }, image: {} }, canvas: { feed: GRID },
  blocks: [
    { type: 'label', text: 'Start here', slot: at(1, 2, 8, 1), when: { page: 'first' } },
    { type: 'label', source: 'folio', slot: at(9, 2, 4, 1), align: 'right', when: { page: 'later' } },
    { type: 'headline', slot: at(1, 5, 12, 6), size: 84 },
    { type: 'photo', slot: at(1, 12, 12, 11), frame: 'card', when: { present: 'image' } },
    { type: 'logo', slot: at(1, 24, 6, 1), valign: 'bottom' },
  ],
  ...o,
});
const page = (o: Record<string, unknown> = {}) => ({ template: 'layout', layout: 'step', headline: 'Every saving, *on record.*', ...o });
const carousel = (pages: unknown[]) => ({ template: 'carousel', series: 'explainers', pages });

async function setUp() {
  const user = await t.createUser('admin');
  const api = t.api(await t.signIn(user));
  expect((await api.post('/api/settings/layouts', { definition: step() })).status).toBe(201);
  const { posts } = await seedBatch(t, user, { posts: [{ key: 'p1', design: { template: 'closing' } }] });
  return { api, user, post: posts[0]! };
}

describe('a carousel page made with a brand layout', () => {
  it('is accepted on a post and stored as it was given', async () => {
    const { api, post } = await setUp();
    const design = carousel([page(), page({ headline: 'Second' }), { template: 'closing' }]);
    const res = await api.patch(`/api/posts/${post.id}`, { design });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await t.prisma.post.findUnique({ where: { id: post.id } }))!.design).toEqual(design);
  });

  it('is checked as a single post made with that layout would be', async () => {
    const { api, post } = await setUp();
    const cases: Array<[unknown, RegExp]> = [
      [page({ layout: 'nope' }), /design page 1: layout "nope" is not one of the brand's layouts \(step\)/],
      [page({ headline: undefined }), /design page 1: headline is required by this layout/],
      [page({ headline: 'x'.repeat(91) }), /design page 1: headline is 91 characters; this layout takes up to 90/],
      [page({ quote: 'Not declared' }), /design page 1: quote is not used by layout "step"/],
      [page({ sizes: ['feed'] }), /design page 1: sizes is set on the carousel, not on one of its pages/],
      [page({ '<img src=x>': 'x' }), /design page 1: \?img src=x\? is not used by layout "step"/],
      [page({ image: '../../etc/passwd.jpg' }), /must be a file under design\/assets\/ or a vault photo/],
    ];
    for (const [p, re] of cases) {
      const res = await api.patch(`/api/posts/${post.id}`, { design: carousel([p, { template: 'closing' }]) });
      expect(res.status, String(re)).toBe(422);
      const all = [res.body.error, ...(res.body.details ?? [])].join('\n');
      expect(all, String(re)).toMatch(re);
      expect(JSON.stringify(res.body)).not.toContain('<img');
    }
    expect((await t.prisma.post.findUnique({ where: { id: post.id } }))!.design).toEqual({ template: 'closing' });
  });

  it('may name a vault photo for its picture, as a post made with the layout may', async () => {
    const { api, post } = await setUp();
    const withPhoto = page({ image: 'design/assets/demo/object-jar.jpg', vaultItemId: '00000000-0000-4000-8000-000000000000' });
    const single = await api.patch(`/api/posts/${post.id}`, { design: withPhoto });
    expect(single.status, JSON.stringify(single.body)).toBe(200);
    const res = await api.patch(`/api/posts/${post.id}`, { design: carousel([withPhoto, { template: 'closing' }]) });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it('keeps the layout it uses: no delete and no new id while a carousel page names it', async () => {
    const user = await t.createUser('admin');
    const api = t.api(await t.signIn(user));
    const { body: { layout: made } } = await api.post('/api/settings/layouts', { definition: step() });
    await seedBatch(t, user, { posts: [{ key: 'c1', design: carousel([{ template: 'closing' }, page()]) }] });
    const del = await api.delete(`/api/settings/layouts/${made.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error).toMatch(/1 post use this layout/);
    expect((await api.put(`/api/settings/layouts/${made.id}`, { definition: step({ id: 'other-id' }) })).status).toBe(409);
  });
});

describe('the layout editor\'s preview as a carousel page', () => {
  const admin = async () => t.api(await t.signIn(await t.createUser('admin')));

  it('takes page 1, a middle page or the last page, and nothing else', async () => {
    const api = await admin();
    expect((await api.post('/api/settings/layouts/preview', { definition: step(), page: 'second' })).status).toBe(400);
    expect((await api.post('/api/settings/layouts/preview', { definition: step(), page: 'later' })).status).toBe(400);
    // a carousel is drawn at the feed size: a layout without one cannot be a page
    const tall = step({ canvas: { story: { ...GRID, margin: { top: 250, right: 70, bottom: 320, left: 70 } } } });
    const res = await api.post('/api/settings/layouts/preview', { definition: tall, page: 'first' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, size: 'feed', page: 'first' });
    expect(res.body.error).toMatch(/no feed size/);
  });

  it('draws the layout with its place in the carousel', async () => {
    const engine = await pipelineEngine();
    if (!engine.findChrome()) return;
    const api = await admin();
    const shots: Record<string, string> = {};
    for (const place of ['first', 'middle', 'last', undefined]) {
      const res = await api.post('/api/settings/layouts/preview', { definition: step(), size: 'story', ...(place ? { page: place } : {}) });
      expect(res.status).toBe(200);
      expect(res.body.ok, res.body.error).toBe(true);
      expect(res.body.size).toBe('feed');
      expect(res.body.page).toBe(place);
      expect(res.body.image).toMatch(/^data:image\/jpeg;base64,/);
      shots[place ?? 'single'] = res.body.image;
    }
    // page 1 has its own block and ground; the middle and last pages differ by their folio; a single post is none of them
    expect(new Set(Object.values(shots)).size).toBe(4);
    const keep = process.env.VESK_KEEP_RENDERS;
    if (keep) for (const [k, v] of Object.entries(shots)) { fs.mkdirSync(keep, { recursive: true }); fs.writeFileSync(path.join(keep, `preview-${k}.jpg`), Buffer.from(v.split(',')[1]!, 'base64')); }
    expect(fs.readdirSync(path.join(root, 'out', 'layout-preview'))).toEqual([]);
  });
});
