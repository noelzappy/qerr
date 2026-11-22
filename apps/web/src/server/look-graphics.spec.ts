// Brand graphics and cut-outs a look places, from the vault to the drawing. A look's `graphic` element names a vault item by its id; when a
// post, a post preview or a design of a look is drawn, the app finds the composition that draws it, loads the items its graphics name,
// checks them, copies their files next to the run and hands them to the engine as the post spec's `graphics`. Nothing in a request names
// those files. Chrome is never started: the post drawings are replaced by a stand-in that records what it was given, and the look
// renderer stops where Chrome would start (CHROME_PATH points nowhere in the tests).
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pipelineEngine, type PipelineEngine, type RenderResult } from './engine/pipeline.js';
import { currentSettings, resetBrandState, syncBrand } from './services/brand-settings.js';
import { previewDesign } from './services/design-preview.js';
import { clearSampleCache, connectLookRenderer } from './services/look-render.js';
import { setLookRenderer } from './services/looks.js';
import { renderPost } from './services/render.js';
import { withRenderSlot } from './services/render-limit.js';
import { jpegBytes, seedBatch } from './testing-batches.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
let root: string;
let engine: PipelineEngine;
// Chrome is kept out on purpose, whatever the machine has: the look renderer must stop where Chrome would start (see above)
const chromeBefore = process.env.CHROME_PATH;
beforeAll(async () => { process.env.CHROME_PATH = path.join(path.sep, 'nonexistent', 'chrome'); t = await createTestApp(); engine = await pipelineEngine(); root = engine.root; });
afterAll(() => { if (chromeBefore === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = chromeBefore; resetBrandState(); return t.close(); });
beforeEach(async () => { await t.reset(); resetBrandState(); clearSampleCache(); });
afterEach(() => setLookRenderer(null));

const BASE = '/api/settings/looks';
const GRAPHIC_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const MISSING_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
type Api = ReturnType<TestApp['api']>;
const admin = async (): Promise<Api> => t.api(await t.signIn(await t.createUser('admin')));

// A PNG header with an alpha channel (colour type 6): what the vault's checks read. The drawing itself is a stand-in here.
function png(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8;
  ihdr[17] = 6;
  const iend = Buffer.concat([Buffer.alloc(4), Buffer.from('IEND', 'latin1'), Buffer.alloc(4)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, iend]);
}
const MARK = png(400, 600);

async function graphicItem(over: Record<string, unknown> = {}) {
  await t.storage.putObject(`vault/${GRAPHIC_ID}.png`, MARK, 'image/png');
  return t.prisma.vaultItem.create({
    data: { id: GRAPHIC_ID, kind: 'photo', role: 'graphic', tintable: true, title: 'Leaf mark', body: '', status: 'unconfirmed', fileKey: `vault/${GRAPHIC_ID}.png`, fileName: 'leaf mark.png', contentType: 'image/png', size: MARK.length, width: 400, height: 600, licence: 'own', ...over },
  });
}

// A renderer that passes every check, so a look can be published and made the active one without Chrome.
function passingRenderer() {
  setLookRenderer({
    preview: async (req) => ({ samples: req.kinds.map((kind) => ({ kind, ok: true, image: 'data:image/jpeg;base64,/9j/4AAQ', warnings: [] })) }),
    previewComposition: async () => ({ image: 'data:image/jpeg;base64,/9j/4AAQ', rects: [], warnings: [] }),
    gate: async (req) => req.targets.map(() => [{ name: 'render:sample', passed: true }]),
  });
}

const PIECE = { type: 'graphic', ref: GRAPHIC_ID, at: 'top-right', size: 's', z: 1 };
// A copy of the shipped retail look ("mine") whose first statement design ("Stack") places the graphic, made the brand's active look.
// Returns the copy's definition as the look renderer is handed it.
async function activeLookWithGraphic(api: Api, { ref = GRAPHIC_ID }: { ref?: string } = {}) {
  passingRenderer();
  await t.prisma.brandProfile.create({ data: { settings: currentSettings(null) as object } });
  const demo = (f: string) => fs.readFileSync(path.join(root, 'brands', 'demo', 'logos', f));
  for (const [which, file] of [['full', 'logo-full.png'], ['mark', 'logo-mark.png']] as const) {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(demo(file))], file));
    expect((await api.post(`/api/settings/brand/logo/${which}`, form)).status).toBe(200);
  }
  const look = (await api.post(`${BASE}/duplicate`, { source: 'shipped:retail', slug: 'mine', name: 'Mine' })).body.look;
  const stack = look.compositions.find((c: { kind: string; name: string }) => c.kind === 'statement' && c.name === 'Stack');
  expect(stack).toBeTruthy();
  const definition = { ...stack.definition, elements: [...stack.definition.elements, { ...PIECE, ref }] };
  const draft = await api.put(`${BASE}/mine/compositions/${stack.id}/draft`, { definition });
  expect(draft.status, JSON.stringify(draft.body).slice(0, 600)).toBe(200);
  expect((await api.post(`${BASE}/mine/compositions/${stack.id}/publish`)).status).toBe(200);
  expect((await api.post(`${BASE}/mine/publish`)).status).toBe(200);
  expect((await api.put(`${BASE}/active`, { ref: 'own:mine' })).status).toBe(200);
  await syncBrand(t.deps);
  setLookRenderer(null);
  return (await api.get(`${BASE}/own:mine`)).body.look;
}

const STATEMENT = { template: 'post', kind: 'statement', variant: 0, headline: 'Fresh bread, *every morning*' };
const OTHER_DESIGN = { ...STATEMENT, variant: 1 };

// Stands in for the renderer: records what it was given (and whether each graphic file is there, with the vault's bytes) and writes one picture.
function recordingRender(calls: Array<{ design: Record<string, unknown>; files: Record<string, string | null> }>) {
  return async (o: Record<string, unknown>): Promise<RenderResult> => {
    const design = structuredClone(o.design) as Record<string, unknown>;
    const files: Record<string, string | null> = {};
    const nodes = [design, ...(Array.isArray(design.pages) ? design.pages as Array<Record<string, unknown>> : [])];
    for (const n of nodes) for (const g of (Array.isArray(n.graphics) ? n.graphics : []) as Array<{ image: string }>) {
      const abs = path.join(root, g.image);
      files[g.image] = fs.existsSync(abs) ? fs.readFileSync(abs).toString('hex') : null;
    }
    calls.push({ design, files });
    const dir = path.resolve(String(o.root), String(o.outDir));
    fs.mkdirSync(dir, { recursive: true });
    const abs = path.join(dir, 'preview-feed.jpg');
    fs.writeFileSync(abs, jpegBytes('preview'));
    return { ok: true, files: [{ size: 'feed', slide: null, file: 'preview-feed.jpg', abs, w: 1080, h: 1350 }], warnings: [], notes: [] };
  };
}
const leftovers = (dir: string) => { const d = path.join(root, 'out', dir); return fs.existsSync(d) ? fs.readdirSync(d) : []; };

describe('which graphics a post needs', () => {
  it('are those of the composition the active look draws it with, and nothing for another design or the classic layouts', async () => {
    const api = await admin();
    expect(engine.designGraphicNeeds(STATEMENT, { root })).toEqual([]);
    await activeLookWithGraphic(api);
    expect(engine.designGraphicNeeds(STATEMENT, { root })).toEqual([{ page: null, kind: 'statement', variant: 0, name: 'Stack', refs: [GRAPHIC_ID] }]);
    expect(engine.designGraphicNeeds(OTHER_DESIGN, { root })).toEqual([]);
    expect(engine.designGraphicNeeds({ template: 'carousel', pages: [OTHER_DESIGN, STATEMENT] }, { root })).toEqual([{ page: 1, kind: 'statement', variant: 0, name: 'Stack', refs: [GRAPHIC_ID] }]);
  });
});

describe('the post preview', () => {
  it('hands the renderer the vault file of each graphic the design places, copied for the run, and removes the copy afterwards', async () => {
    const api = await admin();
    await activeLookWithGraphic(api);
    await graphicItem();
    const calls: Parameters<typeof recordingRender>[0] = [];
    const r = await previewDesign(t.deps, STATEMENT, { lock: withRenderSlot, render: recordingRender(calls) });
    expect(r.ok, r.error).toBe(true);
    const graphics = calls[0]!.design.graphics as Array<{ ref: string; image: string; tintable: boolean }>;
    expect(graphics).toHaveLength(1);
    expect(graphics[0]).toMatchObject({ ref: GRAPHIC_ID, tintable: true });
    expect(graphics[0]!.image).toMatch(/^out\/design-preview\/[0-9a-f-]+\/in\/\d+-leaf-mark\.png$/);
    expect(calls[0]!.files[graphics[0]!.image]).toBe(MARK.toString('hex'));
    expect(leftovers('design-preview')).toEqual([]);
    // another design of the look places none: nothing is handed over
    await previewDesign(t.deps, OTHER_DESIGN, { lock: withRenderSlot, render: recordingRender(calls) });
    expect(calls[1]!.design.graphics).toBeUndefined();
    // a carousel: only the page drawn with that design gets it
    await previewDesign(t.deps, { template: 'carousel', pages: [OTHER_DESIGN, STATEMENT] }, { lock: withRenderSlot, render: recordingRender(calls) });
    const pages = calls[2]!.design.pages as Array<Record<string, unknown>>;
    expect(pages[0]!.graphics).toBeUndefined();
    expect((pages[1]!.graphics as Array<{ ref: string }>).map((g) => g.ref)).toEqual([GRAPHIC_ID]);
  });

  it('a cut-out keeps its own colours: it is never handed over as recolourable', async () => {
    const api = await admin();
    await activeLookWithGraphic(api);
    await graphicItem({ role: 'cutout', tintable: true });
    const calls: Parameters<typeof recordingRender>[0] = [];
    expect((await previewDesign(t.deps, STATEMENT, { lock: withRenderSlot, render: recordingRender(calls) })).ok).toBe(true);
    expect(calls[0]!.design.graphics).toEqual([expect.objectContaining({ ref: GRAPHIC_ID, tintable: false })]);
  });

  it('never takes graphics from the request: a design that names one is refused before anything is drawn', async () => {
    const api = await admin();
    await activeLookWithGraphic(api);
    await graphicItem();
    const res = await api.post('/api/posts/preview-design', { design: { ...STATEMENT, graphics: [{ ref: GRAPHIC_ID, image: 'brands/demo/logos/logo-mark.png' }] } });
    expect(res.status).toBe(422);
    expect(res.body.details.join(' ')).toContain('graphics is filled in from the look\'s brand graphics');
    const page = await api.post('/api/posts/preview-design', { design: { template: 'carousel', pages: [OTHER_DESIGN, { ...STATEMENT, graphics: [] }] } });
    expect(page.status).toBe(422);
    expect(page.body.details.join(' ')).toContain('design page 2: graphics is filled in');
  });

  it('refuses a graphic that is not there, deleted, no longer a cut-out or graphic, or another brand\'s, naming the design and the graphic', async () => {
    const api = await admin();
    await activeLookWithGraphic(api);
    const calls: Parameters<typeof recordingRender>[0] = [];
    const preview = () => previewDesign(t.deps, STATEMENT, { lock: withRenderSlot, render: recordingRender(calls) });

    const missing = await preview();
    expect(missing.ok).toBe(false);
    expect(missing.error).toBe(`The design "Stack" places a brand graphic that is not in Pictures (id ${GRAPHIC_ID}). It may have been removed for good: choose another graphic for this design in Settings, Looks`);

    const item = await graphicItem();
    await t.prisma.vaultItem.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
    expect((await preview()).error).toContain('The design "Stack" places the brand graphic "Leaf mark", which was deleted from Pictures');

    await t.prisma.vaultItem.update({ where: { id: item.id }, data: { deletedAt: null, role: 'photo' } });
    expect((await preview()).error).toContain('The design "Stack" places "Leaf mark", which is no longer a cut-out or graphic (it is now a photo)');

    await t.prisma.vaultItem.update({ where: { id: item.id }, data: { role: 'graphic', fileKey: null } });
    expect((await preview()).error).toContain('"Leaf mark", which has no file yet');

    await t.prisma.vaultItem.update({ where: { id: item.id }, data: { fileKey: `vault/${GRAPHIC_ID}.png`, contentType: 'image/jpeg' } });
    expect((await preview()).error).toContain('whose file is not a PNG or WebP picture');

    await t.prisma.vaultItem.update({ where: { id: item.id }, data: { contentType: 'image/png', brandId: 'another-brand' } });
    expect((await preview()).error).toContain('places a brand graphic that is not in Pictures');

    // a carousel names the page
    const page = await previewDesign(t.deps, { template: 'carousel', pages: [OTHER_DESIGN, STATEMENT] }, { lock: withRenderSlot, render: recordingRender(calls) });
    expect(page.error).toMatch(/^Page 2: The design "Stack" places a brand graphic/);

    expect(calls).toEqual([]);
    expect(leftovers('design-preview')).toEqual([]);
  });
});

describe('the render-post job', () => {
  let real: PipelineEngine['renderDesignBlock'];
  beforeEach(() => { real = engine.renderDesignBlock; });
  afterEach(() => { engine.renderDesignBlock = real; });

  async function postWith(design: Record<string, unknown>) {
    const { posts } = await seedBatch(t, await t.createUser('editor'), { posts: [{ key: 'p1', design, renderStatus: 'queued', images: [] }] });
    return posts[0]!;
  }

  it('draws a post with the graphics its design places, copied from the vault and removed afterwards', async () => {
    const api = await admin();
    await activeLookWithGraphic(api);
    await graphicItem();
    const calls: Parameters<typeof recordingRender>[0] = [];
    engine.renderDesignBlock = recordingRender(calls);
    const post = await postWith(STATEMENT);
    await renderPost(t.deps, { postId: post.id });
    const row = await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row.renderError).toBeNull();
    expect(row.renderStatus).toBe('ok');
    const graphics = calls[0]!.design.graphics as Array<{ ref: string; image: string; tintable: boolean }>;
    expect(graphics.map((g) => g.ref)).toEqual([GRAPHIC_ID]);
    expect(graphics[0]!.image).toMatch(/^out\/app-render\/[0-9a-f-]+\/in\/\d+-leaf-mark\.png$/);
    expect(calls[0]!.files[graphics[0]!.image]).toBe(MARK.toString('hex'));
    // the stored design is untouched: the graphics live only in the run's copy
    expect(row.design).toEqual(STATEMENT);
    expect(leftovers('app-render')).toEqual([]);
  });

  it('fails clearly when a graphic is gone or changed role, and draws nothing', async () => {
    const api = await admin();
    await activeLookWithGraphic(api);
    const calls: Parameters<typeof recordingRender>[0] = [];
    engine.renderDesignBlock = recordingRender(calls);
    const post = await postWith(STATEMENT);
    await renderPost(t.deps, { postId: post.id });
    let row = await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row.renderStatus).toBe('failed');
    expect(row.renderError).toContain(`The design "Stack" places a brand graphic that is not in Pictures (id ${GRAPHIC_ID})`);

    await graphicItem({ role: 'photo', tintable: false });
    await renderPost(t.deps, { postId: post.id });
    row = await t.prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(row.renderError).toContain('"Leaf mark", which is no longer a cut-out or graphic');
    expect(calls).toEqual([]);
    expect(leftovers('app-render')).toEqual([]);
  });
});

describe('the Looks design editor\'s preview', () => {
  it('finds the graphics of the design being edited in the vault before drawing it, and says which is missing', async () => {
    const api = await admin();
    const look = await activeLookWithGraphic(api, { ref: MISSING_ID });
    connectLookRenderer(t.deps);
    const stack = look.compositions.find((c: { name: string }) => c.name === 'Stack');
    const answer = await api.post(`${BASE}/preview-design`, { ref: 'own:mine', kind: 'statement', index: 0, scenario: 'sample' });
    expect(answer.status).toBe(200);
    expect(answer.body.problems).toEqual([{ path: 'definition', message: expect.stringContaining(`The design "Stack" places a brand graphic that is not in Pictures (id ${MISSING_ID})`) }]);
    // the draft being edited is what counts: pointed at a graphic the vault has, it gets as far as Chrome (not installed in the tests)
    await graphicItem();
    const draft = { ...stack.definition, elements: stack.definition.elements.map((e: { type: string }) => (e.type === 'graphic' ? { ...PIECE } : e)) };
    const fixed = await api.post(`${BASE}/preview-design`, { ref: 'own:mine', kind: 'statement', index: 0, scenario: 'sample', draft });
    expect(fixed.body.problems).toEqual([{ path: 'definition', message: expect.stringContaining('Chrome is not installed') }]);
    expect(leftovers('look-render')).toEqual([]);
  });

  it('draws a sample again once a missing graphic is in the vault (a sample is kept only for the vault as it was)', async () => {
    const api = await admin();
    await activeLookWithGraphic(api);
    connectLookRenderer(t.deps);
    const first = await api.post(`${BASE}/preview`, { ref: 'own:mine', kinds: ['statement'] });
    expect(first.body.samples[0].error).toContain('The design "Stack" places a brand graphic that is not in Pictures');
    await graphicItem();
    const again = await api.post(`${BASE}/preview`, { ref: 'own:mine', kinds: ['statement'] });
    expect(again.body.samples[0].error).toContain('Chrome is not installed');
  });
});
