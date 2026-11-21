import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pipelineEngine } from './engine/pipeline.js';
import { resetBrandState, syncBrand } from './services/brand-settings.js';
import { layoutsForBrand, mergeLayouts } from './services/layouts.js';
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

const admin = async () => t.api(await t.signIn(await t.createUser('admin')));
const activeBrand = () => JSON.parse(fs.readFileSync(path.join(root, process.env.BRAND_DIR!, 'brand.json'), 'utf8'));
const at = (col: number, row: number, width: number, height: number) => ({ col, row, width, height });
const GRID = { columns: 12, rows: 24, margin: { top: 56, right: 70, bottom: 56, left: 70 }, gutter: 20, rowGutter: 0 };
const layout = (o: Record<string, unknown> = {}) => ({
  id: 'big-quote', name: 'Big quote', fields: { quote: { required: true, max: 120 } }, canvas: { feed: GRID },
  blocks: [{ type: 'headline', field: 'quote', slot: at(1, 3, 12, 12), size: 88 }, { type: 'logo', slot: at(1, 24, 6, 1), valign: 'bottom' }],
  ...o,
});

describe('who may use the layouts', () => {
  it('is admins only', async () => {
    expect((await t.api().get('/api/settings/layouts')).status).toBe(401);
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await editor.get('/api/settings/layouts')).status).toBe(403);
    expect((await editor.post('/api/settings/layouts', { definition: layout() })).status).toBe(403);
  });
});

describe('the list', () => {
  it('gives the layouts, the starting points and the engine catalogue', async () => {
    const api = await admin();
    const res = await api.get('/api/settings/layouts');
    expect(res.status).toBe(200);
    expect(res.body.layouts).toEqual([]);
    expect(res.body.starters.map((s: { id: string }) => s.id)).toContain('myth-fact');
    expect(Object.keys(res.body.catalogue.blocks)).toEqual(expect.arrayContaining(['headline', 'slab', 'photo', 'screen', 'decoration', 'spacer']));
    expect(res.body.catalogue.grounds).toContain('light');
    expect(res.body.max).toBe(40);
  });
});

describe('creating and checking', () => {
  it('stores a valid layout and writes it into the brand pack, where a design can use it', async () => {
    const api = await admin();
    const res = await api.post('/api/settings/layouts', { definition: layout() });
    expect(res.status).toBe(201);
    expect(res.body.layout).toMatchObject({ slug: 'big-quote', name: 'Big quote', enabled: true, origin: 'blank' });
    expect(activeBrand().layouts.map((l: { id: string }) => l.id)).toEqual(['big-quote']);
    const engine = await pipelineEngine();
    expect(engine.designBlockProblems({ template: 'layout', layout: 'big-quote', quote: 'Hello' }, { root })).toEqual([]);
    expect(engine.designBlockProblems({ template: 'layout', layout: 'big-quote' }, { root })[0]).toMatch(/quote is required by this layout/);
    const audit = await t.prisma.auditLog.findFirst({ where: { action: 'layout.create' } });
    expect(audit?.detail).toMatchObject({ layout: 'big-quote', origin: 'blank' });
  });

  it('refuses a layout the engine does not accept, with its reasons, and stores nothing', async () => {
    const api = await admin();
    const bad = [
      layout({ blocks: [{ type: 'html', slot: at(1, 1, 1, 1) }] }),
      layout({ css: 'body{background:url(http://evil.example)}' }),
      layout({ id: '"><script>alert(1)</script>' }),
      layout({ canvas: { feed: { ...GRID, margin: 0 } } }),
      layout({ blocks: [{ type: 'headline', field: 'quote', slot: at(1, 1, 12, 4), style: 'color:red' }] }),
    ];
    for (const definition of bad) {
      const res = await api.post('/api/settings/layouts', { definition });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('The layout is not valid');
      expect(res.body.details.length).toBeGreaterThan(0);
    }
    expect(await t.prisma.brandLayout.count()).toBe(0);
    expect((await api.post('/api/settings/layouts', { definition: layout(), extra: 1 })).status).toBe(400);
  });

  it('checks without storing', async () => {
    const api = await admin();
    expect((await api.post('/api/settings/layouts/validate', { definition: layout() })).body.problems).toEqual([]);
    const res = await api.post('/api/settings/layouts/validate', { definition: layout({ blocks: [] }) });
    expect(res.body.problems[0]).toMatch(/blocks must be a list of 1 to 24/);
  });

  it('copies a starting point under a free id, and refuses a taken id', async () => {
    const api = await admin();
    const a = await api.post('/api/settings/layouts', { starter: 'myth-fact' });
    expect(a.status).toBe(201);
    expect(a.body.layout).toMatchObject({ slug: 'myth-fact', origin: 'starter:myth-fact' });
    const b = await api.post('/api/settings/layouts', { starter: 'myth-fact', name: 'Myth and fact' });
    expect(b.body.layout.slug).toBe('myth-and-fact');
    const c = await api.post('/api/settings/layouts', { starter: 'myth-fact' });
    expect(c.body.layout.slug).toBe('myth-fact-2');
    expect((await api.post('/api/settings/layouts', { starter: 'nope' })).status).toBe(404);
    expect((await api.post('/api/settings/layouts', { definition: { ...layout(), id: 'myth-fact' } })).status).toBe(409);
  });
});

describe('changing', () => {
  it('updates, switches off and on, duplicates and deletes', async () => {
    const api = await admin();
    const { body: { layout: made } } = await api.post('/api/settings/layouts', { definition: layout() });
    const put = await api.put(`/api/settings/layouts/${made.id}`, { definition: layout({ name: 'Quote, larger' }) });
    expect(put.status).toBe(200);
    expect(put.body.layout.name).toBe('Quote, larger');
    expect((await api.put(`/api/settings/layouts/${made.id}`, { definition: layout({ blocks: 'x' }) })).status).toBe(400);
    // off: gone from the pack; on: back
    expect((await api.patch(`/api/settings/layouts/${made.id}`, { enabled: false })).body.layout.enabled).toBe(false);
    expect(activeBrand().layouts ?? []).toEqual([]);
    await api.patch(`/api/settings/layouts/${made.id}`, { enabled: true });
    expect(activeBrand().layouts.map((l: { id: string }) => l.id)).toEqual(['big-quote']);
    // a copy starts switched off, under a free id
    const dup = await api.post(`/api/settings/layouts/${made.id}/duplicate`);
    expect(dup.status).toBe(201);
    expect(dup.body.layout).toMatchObject({ slug: 'big-quote-copy', enabled: false, origin: 'copy:big-quote' });
    expect(dup.body.layout.definition.id).toBe('big-quote-copy');
    // renaming the id to a taken one is refused
    expect((await api.put(`/api/settings/layouts/${made.id}`, { definition: layout({ id: 'big-quote-copy' }) })).status).toBe(409);
    expect((await api.delete(`/api/settings/layouts/${dup.body.layout.id}`)).status).toBe(200);
    expect((await api.delete(`/api/settings/layouts/${dup.body.layout.id}`)).status).toBe(404);
  });

  it('keeps a layout a post uses: no delete and no new id', async () => {
    const user = await t.createUser('admin');
    const api = t.api(await t.signIn(user));
    const { body: { layout: made } } = await api.post('/api/settings/layouts', { definition: layout() });
    await seedBatch(t, user, { posts: [{ key: 'p1', design: { template: 'layout', layout: 'big-quote', quote: 'Hello' } }] });
    const del = await api.delete(`/api/settings/layouts/${made.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error).toMatch(/1 post use this layout; switch it off instead/);
    expect((await api.put(`/api/settings/layouts/${made.id}`, { definition: layout({ id: 'other-id' }) })).status).toBe(409);
    expect((await api.put(`/api/settings/layouts/${made.id}`, { definition: layout({ name: 'Same id' }) })).status).toBe(200);
  });
});

describe('the brand pack', () => {
  it('leaves out a stored layout that no longer passes the engine, so the brand is still written', async () => {
    await t.prisma.brandLayout.create({ data: { slug: 'broken', name: 'Broken', definition: { id: 'broken', blocks: [] } } });
    await t.prisma.brandLayout.create({ data: { slug: 'big-quote', name: 'Big quote', definition: layout(), position: 1 } });
    expect((await layoutsForBrand(t.deps)).map((l) => l.id)).toEqual(['big-quote']);
    await syncBrand(t.deps);
    expect(activeBrand().layouts.map((l: { id: string }) => l.id)).toEqual(['big-quote']);
  });

  it('puts the stored layouts ahead of the pack\'s own, replacing one with the same id', () => {
    expect(mergeLayouts([{ id: 'a', n: 1 }], [{ id: 'a', n: 2 }, { id: 'b' }, 'junk'])).toEqual([{ id: 'a', n: 1 }, { id: 'b' }]);
  });
});

describe('the post editor', () => {
  it('lists the brand\'s layouts and their fields to any signed-in person', async () => {
    const api = await admin();
    await api.post('/api/settings/layouts', { definition: layout({ fields: { quote: { required: true, max: 120 } } }) });
    expect((await t.api().get('/api/layouts')).status).toBe(401);
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    const res = await editor.get('/api/layouts');
    expect(res.status).toBe(200);
    expect(res.body.layouts).toEqual([{ id: 'big-quote', name: 'Big quote', description: null, sizes: ['feed'], fields: [{ name: 'quote', kind: 'text', required: true, max: 120, min: null, word: 'a quotation' }] }]);
    expect(JSON.stringify(res.body)).not.toContain('slot');
  });
});

describe('the preview', () => {
  it('refuses an invalid layout before any drawing', async () => {
    const api = await admin();
    const res = await api.post('/api/settings/layouts/preview', { definition: layout({ blocks: [] }) });
    expect(res.status).toBe(400);
  });

  it('draws a layout with sample words through the renderer and its checks', async () => {
    const engine = await pipelineEngine();
    if (!engine.findChrome()) return;
    const api = await admin();
    const ok = await api.post('/api/settings/layouts/preview', { definition: layout(), size: 'feed' });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect(ok.body.image).toMatch(/^data:image\/jpeg;base64,/);
    // words that do not fit come back as the renderer's explanation, and nothing is kept
    const long = await api.post('/api/settings/layouts/preview', { definition: layout({ blocks: [{ type: 'headline', field: 'quote', slot: at(1, 3, 6, 1), size: 136 }] }), sample: { quote: 'A quotation far too long to fit one small row of the grid at all' } });
    expect(long.body.ok).toBe(false);
    expect(long.body.error).toMatch(/does not fit/);
    expect(fs.readdirSync(path.join(root, 'out', 'layout-preview'))).toEqual([]);
  });
});
