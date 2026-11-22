import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateAiOptions } from './ai.js';
import { aiImport } from './engine/root.js';
import { pipelineEngine } from './engine/pipeline.js';
import { brandSettingsSchema, brandState, contrast, contrastChecks, expandBrand, mergeAdvanced, mix, paletteChanges, resetBrandState, settingsFromBrand, syncBrand, baseBrand, withoutUnreadContrast, type BrandSettings } from './services/brand-settings.js';
import { renderPost } from './services/render.js';
import { seedBatch } from './testing-batches.js';
import { createTestApp, type TestApp } from './testing.js';

// The real AI library, talking to a fake provider.
const fake = vi.hoisted(() => ({ fetch: null as null | ((url: string, init?: RequestInit) => Promise<Response>), bodies: [] as any[] }));
const realCreateAI = (await aiImport<{ createAI: (options: unknown) => unknown }>()).createAI;
vi.mock('./ai.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ai.js')>()),
  loadAI: async () => ({ createAI: (options: CreateAiOptions) => realCreateAI({ ...options, fetch: fake.fetch, sleep: async () => {} } as never) as never }),
}));

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
  fake.fetch = null;
  fake.bodies = [];
});

const DEMO = (f: string) => fs.readFileSync(path.join(root, 'brands', 'demo', 'logos', f));
const INTER = () => fs.readFileSync(path.join(root, 'packages', 'engine', 'design', 'fonts', 'inter-v20-latin.woff2'));

// Written as settings were saved before the style layer: older ground names, no roles, no style.
const SETTINGS_BEFORE = {
  name: 'Globex Garden', website: 'globex.example', tagline: 'Grow with us.', descriptor: 'A fictional garden centre.', timezone: 'America/New_York',
  language: 'American English', money: null, colours: { primary: '#2E7D32', accent: '#F9A825', dark: '#1B2A1E', light: '#F3F7F2' },
  headlineWeight: 500, corners: 'round', series: [{ key: 'tips', name: 'Garden tips', ground: 'white', accent: 'colour' }, { key: 'news', name: 'News', ground: 'tint', accent: 'muted' }],
  spellings: [{ wrong: 'GlobexGarden', right: 'Globex Garden' }], voice: 'Friendly and practical.', visualDirection: 'Airy pages, one plant photo, lots of white.',
  logo: { wordmarkFrom: 0, markGap: 0 },
};
const SETTINGS: BrandSettings = brandSettingsSchema.parse(SETTINGS_BEFORE);

async function admin() {
  return t.api(await t.signIn(await t.createUser('admin')));
}

function upload(api: ReturnType<TestApp['api']>, url: string, name: string, body: Buffer, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(body)], name));
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return api.post(url, form);
}

const activeBrand = () => JSON.parse(fs.readFileSync(path.join(root, process.env.BRAND_DIR!, 'brand.json'), 'utf8'));

describe('expanding the settings', () => {
  it('makes a complete brand the engine accepts, with the colours spread over every ground', async () => {
    const engine = await import('@vesk/engine/design/brand' as string) as { validateBrand(b: unknown): string[] };
    const b = expandBrand(SETTINGS);
    expect(engine.validateBrand(b)).toEqual([]);
    // The accent reads on every dark page as given; the green is nudged a shade darker so small text reads on its pale tint.
    expect((b.accents as Record<string, string>).gold).toBe('#F9A825');
    expect(contrast((b.accents as Record<string, string>).primary!, '#2E7D32')).toBeLessThan(1.1);
    expect(contrastChecks(b).filter((c) => !c.ok)).toEqual([]);
    expect((b.grounds as Record<string, string>).dark).toBe('#1B2A1E');
    expect((b.radius as Record<string, number>).card).toBe(20);
    // the fixture names its grounds by their older names (white, tint); the brand gets the new ones
    expect(b.series).toEqual({ tips: { name: 'Garden tips', ground: 'light', accent: 'colour' }, news: { name: 'News', ground: 'soft', accent: 'muted' } });
    expect(b.spelling).toEqual([{ wrong: 'GlobexGarden', flags: '', right: 'Globex Garden' }]);
    expect(b.voice).toBe('Friendly and practical.');
    expect(JSON.stringify(b)).not.toContain('Acme');
  });

  it('keeps every text colour readable on every page colour, adjusting only the colours that need it', () => {
    // The walkthrough's bakery: its terracotta primary is too light for small text on its own pale page colours.
    const bakery = { ...SETTINGS, colours: { primary: '#B4532A', accent: '#E9B949', dark: '#2B1D14', light: '#FAF4EC' } };
    const b = expandBrand(bakery);
    expect(contrastChecks(b).filter((c) => !c.ok)).toEqual([]);
    const changes = paletteChanges(bakery, b);
    expect(changes.map((c) => c.colour)).toEqual(['primary']);
    expect(changes[0]!.from).toBe('#B4532A');
    // Only as much darker as it needs: still the same terracotta family, not black.
    expect(contrast(changes[0]!.to, '#B4532A')).toBeLessThan(1.6);
    // Colours that already pass are left exactly as given.
    const calm = { ...SETTINGS, colours: { primary: '#1D4ED8', accent: '#FACC15', dark: '#111827', light: '#F8FAFC' } };
    expect(paletteChanges(calm, expandBrand(calm))).toEqual([]);
    // A bright orange primary and amber accent with a mid-grey "dark" colour: all three are moved until text reads.
    const loud = { ...SETTINGS, colours: { primary: '#FF9900', accent: '#FFB000', dark: '#555555', light: '#FFFFFF' } };
    const lb = expandBrand(loud);
    expect(contrastChecks(lb).filter((c) => !c.ok)).toEqual([]);
    expect(paletteChanges(loud, lb).map((c) => c.colour).sort()).toEqual(['accent', 'dark', 'primary']);
  });

  it('checks small text and accents too, on every ground and both myth-and-fact slabs', () => {
    const b = expandBrand(SETTINGS);
    const labels = contrastChecks(b).map((c) => c.label);
    expect(labels).toContain('Accent words on the cool ground');
    expect(labels).toContain('Labels on the deep ground');
    expect(labels).toContain('Accent words on the fact slab');
    expect(labels).toContain('Accent words on the myth slab');
    // The fact slab's accent words in the walkthrough's colours, before the fix, were 4.1:1.
    const before = structuredClone(b) as Record<string, any>;
    before.accents.primary = '#B4532A';
    before.poster.slabs.fact = mix('#B4532A', '#FFFFFF', 0.14);
    expect(contrastChecks(before).find((c) => c.label === 'Accent words on the fact slab')).toMatchObject({ ok: false, needs: 4.5 });
  });

  it('reads the demo pack back into the form, and keeps Advanced away from the managed files', () => {
    const s = settingsFromBrand(baseBrand());
    expect(s.name).toBe('Acme Savings');
    expect(s.colours.primary).toBe('#2F5BB7');
    expect(s.series.length).toBeGreaterThan(0);
    const b = mergeAdvanced(expandBrand(SETTINGS), { logos: { full: 'evil.png', wordmarkFrom: 12 }, font: { files: [] }, contrast: { headline: 4.5 }, ['__proto__' as string]: { x: 1 } });
    expect((b.logos as Record<string, unknown>).full).not.toBe('evil.png');
    expect((b.logos as Record<string, unknown>).wordmarkFrom).toBe(12);
    expect(((b.font as Record<string, unknown>).files as unknown[]).length).toBeGreaterThan(0);
    expect((b.contrast as Record<string, number>).headline).toBe(4.5);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(contrast('#FFFFFF', '#000000')).toBe(21);
  });

  it('writes how the numbers of a chart are written, reads it back, and refuses a sign or a pair of marks the engine would refuse', async () => {
    const { numbersProblems } = await import('@vesk/engine/design/chart' as string) as { numbersProblems(v: unknown): string[] };
    expect(settingsFromBrand(baseBrand()).numbers).toEqual({ decimal: '.', group: ',', currency: '€', currencyAt: 'before', currencySpace: false, percentSpace: false });
    const own = { decimal: ',' as const, group: ' ' as const, currency: 'kr', currencyAt: 'after' as const, currencySpace: true, percentSpace: true };
    const b = expandBrand({ ...SETTINGS, numbers: own });
    expect(b.numbers).toEqual(own);
    expect(numbersProblems(b.numbers)).toEqual([]);
    expect(settingsFromBrand(b).numbers).toEqual(own);
    expect(expandBrand(SETTINGS).numbers).toBeUndefined();
    for (const bad of [{ ...own, currency: '<b>' }, { ...own, currency: 'EUROS' }, { ...own, currency: '1€' }, { ...own, group: ',' as const, decimal: ',' as const }, { ...own, colour: 'red' }, { ...own, currencyAt: 'middle' }]) {
      expect(brandSettingsSchema.safeParse({ ...SETTINGS_BEFORE, numbers: bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('Settings, Brand', () => {
  it('shows the configured pack until something is saved; editors cannot see or change it', async () => {
    const api = await admin();
    const res = await api.get('/api/settings/brand');
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(false);
    expect(res.body.settings.name).toBe('Acme Savings');
    expect(res.body.checks.length).toBeGreaterThan(0);
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await editor.get('/api/settings/brand')).status).toBe(403);
    expect((await editor.put('/api/settings/brand', SETTINGS)).status).toBe(403);
  });

  it('saves the settings, writes them out as a pack folder, and the app and the engine use it at once', async () => {
    const api = await admin();
    const res = await api.put('/api/settings/brand', SETTINGS);
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
    expect(res.body.logosMissing).toBe(true);
    expect(process.env.BRAND_DIR).toMatch(/^state\/brand\/[0-9a-f]{16}$/);
    const written = activeBrand();
    expect(written.name).toBe('Globex Garden');
    expect(written.visualDirection).toBe('Airy pages, one plant photo, lots of white.');
    const app = await t.api().get('/api/app');
    expect(app.body.brand.name).toBe('Globex Garden');
    expect(app.body.brand.timezone).toBe('America/New_York');
    expect(app.body.brand.series).toEqual([{ key: 'tips', name: 'Garden tips' }, { key: 'news', name: 'News' }]);
    // Not the demo logo: there is none until one is uploaded.
    expect(app.body.brand.logo).toBeNull();
    expect((await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'brand.update' } })).detail).toMatchObject({ name: 'Globex Garden', firstSave: true });
  });

  it('previews unsaved colours: the checks, the colours posts will use and which ones were moved, without saving', async () => {
    const api = await admin();
    const res = await api.post('/api/settings/brand/preview', { ...SETTINGS, colours: { primary: '#B4532A', accent: '#E9B949', dark: '#2B1D14', light: '#FAF4EC' } });
    expect(res.status).toBe(200);
    expect(res.body.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
    expect(res.body.changes).toEqual([{ colour: 'primary', from: '#B4532A', to: res.body.palette.accents.primary }]);
    expect(res.body.palette.slabs.fact).toMatch(/^#[0-9A-F]{6}$/);
    expect(await t.prisma.brandProfile.count()).toBe(0);
    expect((await api.post('/api/settings/brand/preview', { ...SETTINGS, colours: { ...SETTINGS.colours, primary: 'red' } })).status).toBe(400);
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await editor.post('/api/settings/brand/preview', SETTINGS)).status).toBe(403);
  });

  it('keeps the contrast for large headlines: written only when set, read back, 3 to 7 only', async () => {
    const api = await admin();
    expect(SETTINGS.contrastDisplay).toBeNull();
    expect((expandBrand(SETTINGS).contrast as Record<string, unknown>).display).toBeUndefined();
    expect((expandBrand({ ...SETTINGS, contrastDisplay: 3.5 }).contrast as Record<string, unknown>).display).toBe(3.5);
    const res = await api.put('/api/settings/brand', { ...SETTINGS, contrastDisplay: 7 });
    expect(res.status).toBe(200);
    expect(res.body.settings.contrastDisplay).toBe(7);
    expect((await api.get('/api/settings/brand')).body.settings.contrastDisplay).toBe(7);
    const engine = await import('@vesk/engine/design/brand' as string) as { validateBrand(b: unknown): string[] };
    const written = activeBrand();
    // The pack carries it when the engine reads it (the guard drops it, and says so in the log, when it does not).
    if (engine.validateBrand({ ...written, contrast: { ...written.contrast, display: 99 } }).some((p) => /contrast\.display/.test(p))) expect(written.contrast.display).toBe(7);
    expect(settingsFromBrand({ ...written, contrast: { ...written.contrast, display: 3.2 } }).contrastDisplay).toBe(3.2);
    for (const bad of [2.9, 7.1]) expect((await api.put('/api/settings/brand', { ...SETTINGS, contrastDisplay: bad })).status).toBe(400);
    expect((await api.put('/api/settings/brand', { ...SETTINGS, contrastDisplay: null })).body.settings.contrastDisplay).toBeNull();
  });

  it('drops contrast.display for an engine that does not read it, and keeps it for one that does', () => {
    const brand = { contrast: { headline: 4.5, display: 5 } };
    const reads = (b: any) => (b.contrast.display === 99 ? ['brand.json: contrast.display must be a ratio from 3 to 7'] : []);
    const ignores = () => [];
    expect(withoutUnreadContrast(brand, reads)).toBe(brand);
    expect(withoutUnreadContrast(brand, ignores)).toEqual({ contrast: { headline: 4.5 } });
    const none = { contrast: { headline: 4.5 } };
    expect(withoutUnreadContrast(none, ignores)).toBe(none);
  });

  it('refuses settings the engine would refuse, and fields it does not know', async () => {
    const api = await admin();
    expect((await api.put('/api/settings/brand', { ...SETTINGS, colours: { ...SETTINGS.colours, primary: 'red' } })).status).toBe(400);
    expect((await api.put('/api/settings/brand', { ...SETTINGS, css: 'body{}' })).status).toBe(400);
    expect((await api.put('/api/settings/brand', { ...SETTINGS, series: [{ key: 'Bad Key', name: 'x', ground: 'white', accent: 'muted' }] })).status).toBe(400);
    expect((await api.put('/api/settings/brand', { ...SETTINGS, series: [{ key: 'a', name: 'x', ground: 'neon', accent: 'muted' }] })).status).toBe(400);
    expect((await api.put('/api/settings/brand', { ...SETTINGS, timezone: 'Mars/Base' })).status).toBe(400);
    expect((await api.put('/api/settings/brand', { ...SETTINGS, name: 'Two\nlines' })).status).toBe(400);
    expect(await t.prisma.brandProfile.count()).toBe(0);
  });

  it('takes PNG logos and a woff2 font only, and renders refuse until both logos are there', async () => {
    const api = await admin();
    await api.put('/api/settings/brand', SETTINGS);
    const editor = await t.createUser('editor');
    const { posts } = await seedBatch(t, editor, { posts: [{ key: 'p1', design: { template: 'photo', headline: 'Hello', image: 'design/assets/photos/cocoa-pods.jpg' }, renderStatus: 'queued', images: [] }] });
    await renderPost(t.deps, { postId: posts[0]!.id });
    expect(await t.prisma.post.findUniqueOrThrow({ where: { id: posts[0]!.id } })).toMatchObject({ renderStatus: 'failed', renderError: expect.stringContaining('Add your logo') });

    expect((await upload(api, '/api/settings/brand/logo/full', 'logo.jpg', Buffer.from('not a png'))).status).toBe(415);
    expect((await upload(api, '/api/settings/brand/logo/other', 'logo.png', DEMO('logo-full.png'))).status).toBe(404);
    const full = await upload(api, '/api/settings/brand/logo/full?wordmarkFrom=360&markGap=39', 'logo.png', DEMO('logo-full.png'));
    expect(full.status).toBe(200);
    expect(full.body.logos.fullSize).toEqual([1740, 338]);
    expect(full.body.settings.logo).toEqual({ wordmarkFrom: 360, markGap: 39 });
    expect(full.body.logosMissing).toBe(true);
    const mark = await upload(api, '/api/settings/brand/logo/mark', 'mark.png', DEMO('logo-mark.png'));
    expect(mark.body.logosMissing).toBe(false);
    expect(brandState()).toMatchObject({ source: 'database', logosMissing: false });
    const written = activeBrand();
    expect(written.logos.full).toBe(`${process.env.BRAND_DIR}/logos/logo-full.png`);
    expect(fs.readFileSync(path.join(root, written.logos.mark)).equals(DEMO('logo-mark.png'))).toBe(true);
    expect((await t.api().get('/api/app')).body.brand.logo).toMatch(/^\/brand\/logo-mark\.png\?v=[0-9a-f]{16}$/);
    const served = await api.get('/api/settings/brand/logo/mark');
    expect(served.status).toBe(200);

    expect((await upload(api, '/api/settings/brand/font', 'font.woff2', Buffer.from('not a font'), { family: 'Brand Sans' })).status).toBe(415);
    expect((await upload(api, '/api/settings/brand/font', 'font.woff2', INTER(), { family: 'Brand<script>' })).status).toBe(400);
    const font = await upload(api, '/api/settings/brand/font', 'font.woff2', INTER(), { family: 'Brand Sans' });
    expect(font.body.font).toEqual({ family: 'Brand Sans' });
    expect(activeBrand().font.family).toBe('Brand Sans');
    expect(activeBrand().font.files[0].file).toBe(`${process.env.BRAND_DIR}/fonts/brand.woff2`);
    expect((await api.delete('/api/settings/brand/font')).body.font).toBeNull();
  });

  it('merges Advanced settings and a dot map after the engine checks them', async () => {
    const api = await admin();
    await api.put('/api/settings/brand', SETTINGS);
    expect((await api.put('/api/settings/brand/advanced', { advanced: { scale: 99 }, map: null })).status).toBe(400);
    expect((await api.put('/api/settings/brand/advanced', { advanced: {}, map: { grid: { cols: 1 } } })).status).toBe(400);
    const map = JSON.parse(fs.readFileSync(path.join(root, 'brands', 'demo', 'map.json'), 'utf8'));
    const res = await api.put('/api/settings/brand/advanced', { advanced: { lint: { headlineMaxChars: { feed: 70, wide: 48, story: 60, square: 50 } } }, map });
    expect(res.status).toBe(200);
    expect(activeBrand().lint.headlineMaxChars.feed).toBe(70);
    expect(fs.existsSync(path.join(root, process.env.BRAND_DIR!, 'map.json'))).toBe(true);
  });
});

describe('importing a brand pack', () => {
  const PACK = (f: string) => fs.readFileSync(path.join(root, 'brands', 'demo', f));
  const form = (files: Record<string, Buffer>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(files)) f.set(k, new File([new Uint8Array(v)], `${k}.bin`));
    return f;
  };

  it('moves a whole pack in: its exact colours and rules, its logos and its map, with the form filled from it', async () => {
    const api = await admin();
    const res = await api.post('/api/settings/brand/import', form({ brand: PACK('brand.json'), full: PACK('logos/logo-full.png'), mark: PACK('logos/logo-mark.png'), map: PACK('map.json') }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ saved: true, logosMissing: false, logos: { fullSize: [1740, 338] } });
    expect(res.body.settings).toMatchObject({ name: 'Acme Savings', timezone: 'Europe/London', logo: { wordmarkFrom: 360, markGap: 39 } });
    const pack = JSON.parse(PACK('brand.json').toString('utf8'));
    const written = activeBrand();
    expect(written.grounds).toEqual(pack.grounds);
    expect(written.text).toEqual(pack.text);
    expect(written.spelling).toEqual(pack.spelling);
    expect(written.series).toEqual(pack.series);
    expect(written.logos.full).toBe(`${process.env.BRAND_DIR}/logos/logo-full.png`);
    expect(fs.existsSync(path.join(root, process.env.BRAND_DIR!, 'map.json'))).toBe(true);
    expect((await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'brand.import' } })).detail).toMatchObject({ name: 'Acme Savings', map: true });
  });

  it('keeps a pack\'s own font when its .woff2 comes with it, and says so plainly when it does not', async () => {
    const api = await admin();
    const pack = JSON.parse(PACK('brand.json').toString('utf8'));
    pack.font.family = 'Brand Grotesk';
    pack.font.mono = 'Brand Mono';
    const files = { brand: Buffer.from(JSON.stringify(pack)), full: PACK('logos/logo-full.png'), mark: PACK('logos/logo-mark.png') };
    const without = await api.post('/api/settings/brand/import', form(files));
    expect(without.status).toBe(200);
    expect(without.body.notes.join(' ')).toMatch(/"Brand Grotesk".*Upload its \.woff2/);
    expect(without.body.notes.join(' ')).toMatch(/"Brand Mono"/);
    // Not a family name pointing at another font's files: the built-in font, under its own name.
    expect(activeBrand().font.family).toBe('Inter');
    expect(activeBrand().font.mono).toBe('IBM Plex Mono');
    const withFont = await api.post('/api/settings/brand/import', form({ ...files, font: INTER() }));
    expect(withFont.body.font).toEqual({ family: 'Brand Grotesk' });
    expect(withFont.body.notes.join(' ')).not.toMatch(/Grotesk/);
    expect(activeBrand().font.family).toBe('Brand Grotesk');
    expect(activeBrand().font.files[0].file).toBe(`${process.env.BRAND_DIR}/fonts/brand.woff2`);
  });

  it('refuses a pack the engine would refuse, or logos that are not PNG, and changes nothing', async () => {
    const api = await admin();
    const bad = JSON.parse(PACK('brand.json').toString('utf8'));
    bad.grounds.white = 'white';
    expect((await api.post('/api/settings/brand/import', form({ brand: Buffer.from(JSON.stringify(bad)), full: PACK('logos/logo-full.png'), mark: PACK('logos/logo-mark.png') }))).status).toBe(400);
    expect((await api.post('/api/settings/brand/import', form({ brand: PACK('brand.json'), full: Buffer.from('jpeg'), mark: PACK('logos/logo-mark.png') }))).status).toBe(415);
    expect((await api.post('/api/settings/brand/import', form({ brand: PACK('brand.json') }))).status).toBe(400);
    expect((await api.post('/api/settings/brand/import', form({ brand: Buffer.from('{'), full: PACK('logos/logo-full.png'), mark: PACK('logos/logo-mark.png') }))).status).toBe(400);
    expect(await t.prisma.brandProfile.count()).toBe(0);
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await editor.post('/api/settings/brand/import', form({ brand: PACK('brand.json'), full: PACK('logos/logo-full.png'), mark: PACK('logos/logo-mark.png') }))).status).toBe(403);
  });
});

describe('design references', () => {
  const STYLE = { summary: 'Calm pages with one big headline.', palette: [{ hex: '#f3f7f2', role: 'background' }], typography: 'Large sans-serif.', layout: 'Left aligned.', imagery: 'One plant photo.', mood: 'Calm', avoid: 'Clutter.' };

  async function withProvider() {
    const api = await admin();
    expect((await api.post('/api/settings/ai/providers', { name: 'Claude', kind: 'anthropic', model: 'm', apiKey: 'sk-ant-SECRETAIKEY-9876', tasks: ['draft'] })).status).toBe(201);
    await api.put('/api/settings/ai/budget', { monthlyBudgetUsd: 10 });
    return api;
  }

  it('uploads a picture, the AI describes it, and the brief reaches the brand the AI reads', async () => {
    const api = await withProvider();
    fake.fetch = async (_url, init) => {
      fake.bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'respond', input: STYLE }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'tool_use' }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    expect((await upload(api, '/api/settings/brand/references', 'evil.svg', Buffer.from('<svg/>'))).status).toBe(415);
    const res = await upload(api, '/api/settings/brand/references', 'Moodboard 1.png', DEMO('logo-mark.png'), { note: 'the calm layout' });
    expect(res.status).toBe(201);
    expect(res.body.reference).toMatchObject({ fileName: 'Moodboard_1.png', status: 'pending', note: 'the calm layout' });
    expect(t.jobs.enqueued.map((j) => j.name)).toEqual(['analyse-reference']);
    await t.jobs.drain(t.deps);

    const image = fake.bodies[0].messages[0].content[0];
    expect(image).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png' } });
    expect(Buffer.from(image.source.data, 'base64').equals(DEMO('logo-mark.png'))).toBe(true);
    const list = await api.get('/api/settings/brand/references');
    const ref = list.body.references[0];
    expect(ref.status).toBe('ready');
    expect(ref.brief).toMatch(/^Calm pages with one big headline\. Palette: #F3F7F2 background\./);
    expect(ref.imageUrl).toBeTruthy();
    // No brand was saved: the configured pack is copied with the brief added.
    expect(brandState().source).toBe('pack');
    expect(activeBrand().references).toEqual([ref.brief]);
    expect(activeBrand().name).toBe('Acme Savings');

    // People may edit the brief or switch a reference off.
    const edited = await api.patch(`/api/settings/brand/references/${ref.id}`, { brief: 'Only white grounds.' });
    expect(edited.body.reference.brief).toBe('Only white grounds.');
    expect(activeBrand().references).toEqual(['Only white grounds.']);
    await api.patch(`/api/settings/brand/references/${ref.id}`, { enabled: false });
    expect(process.env.BRAND_DIR).toBe('brands/demo');
    expect((await api.delete(`/api/settings/brand/references/${ref.id}`)).status).toBe(200);
    expect(await t.prisma.designReference.count()).toBe(0);
  });

  it('keeps the failure on the reference when the AI cannot describe it', async () => {
    const api = await withProvider();
    fake.fetch = async () => new Response(JSON.stringify({ error: { message: 'model cannot read images' } }), { status: 400, headers: { 'content-type': 'application/json' } });
    await upload(api, '/api/settings/brand/references', 'ref.png', DEMO('logo-mark.png'));
    await t.jobs.drain(t.deps).catch(() => undefined);
    const ref = (await api.get('/api/settings/brand/references')).body.references[0];
    expect(ref.status).toBe('failed');
    expect(ref.error).toMatch(/400/);
    expect(ref.error).not.toContain('SECRETAIKEY');
    const again = await api.post(`/api/settings/brand/references/${ref.id}/analyse`, {});
    expect(again.body.reference.status).toBe('pending');
  });

  const PROPOSAL = {
    colours: { light: '#0b0b0f', soft: '#111117', cool: '#16161e', warm: '#1b1b24', dark: '#000000', deep: '#0d0d13', ink: '#f4f4f6', body: '#d6d6de', muted: '#b4b4c2', inverse: '#ffffff', primary: '#39ff88', accent: '#39ff88' },
    display: { case: 'upper', tracking: 0.01, weight: 700 }, label: { case: 'upper', tracking: 0.12, font: 'mono' },
    accent: 'colour', surface: 'outline', decoration: { kind: 'grid', on: 'all' }, photo: { treatment: 'duotone', strength: 0.8 },
  };

  it('proposes a look from a reference: shown beside the settings in force, saved only when an admin accepts it', async () => {
    const api = await withProvider();
    fake.fetch = async () => new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'respond', input: { ...STYLE, proposal: PROPOSAL } }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'tool_use' }), { status: 200, headers: { 'content-type': 'application/json' } });
    await upload(api, '/api/settings/brand/references', 'neon.png', DEMO('logo-mark.png'));
    await t.jobs.drain(t.deps);
    const ref = (await api.get('/api/settings/brand/references')).body.references[0];
    expect(ref.analysis.proposal).toMatchObject({ surface: 'outline', colours: { light: '#0B0B0F', primary: '#39FF88' } });
    // the preview: both sets of settings with their colours and checks; nothing is saved
    const view = await api.get(`/api/settings/brand/references/${ref.id}/proposal`);
    expect(view.status).toBe(200);
    expect(view.body.current.settings.style.surface).toBe('shadow');
    expect(view.body.proposed.settings.roles.grounds).toMatchObject({ light: '#0B0B0F', dark: '#000000' });
    expect(view.body.proposed.settings.roles.accents).toMatchObject({ primary: '#39FF88', gold: '#39FF88' });
    expect(view.body.proposed.settings.style).toMatchObject({ surface: 'outline', decoration: { kind: 'grid', on: 'all' }, photo: { treatment: 'duotone', strength: 0.8 }, type: { accent: 'colour', display: { case: 'upper', tracking: 0.01, weight: 700 }, label: { case: 'upper', font: 'mono' } } });
    expect(view.body.proposed.palette.grounds.light).toBe('#0B0B0F');
    expect(view.body.proposed.explicit).toContain('grounds.light');
    expect(view.body.proposed.settings.name).toBe('Acme Savings');
    expect(await t.prisma.brandProfile.count()).toBe(0);
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await editor.post(`/api/settings/brand/references/${ref.id}/apply`, {})).status).toBe(403);
    expect((await editor.get(`/api/settings/brand/references/${ref.id}/proposal`)).status).toBe(403);
    // accepting: saved, audited, and the engine reads the new look
    const applied = await api.post(`/api/settings/brand/references/${ref.id}/apply`, {});
    expect(applied.status).toBe(200);
    expect(applied.body.settings.style.surface).toBe('outline');
    expect(activeBrand().style).toMatchObject({ surface: 'outline', decoration: { kind: 'grid', on: 'all' }, type: { display: { case: 'upper' } } });
    expect(activeBrand().grounds.light).toBe('#0B0B0F');
    expect((await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'brand.reference.apply' } })).detail).toMatchObject({ fileName: 'neon.png', firstSave: true });
  });

  it('never shows or applies a proposal that does not pass the settings\' own checks', async () => {
    const api = await admin();
    const make = (analysis: unknown) => t.prisma.designReference.create({ data: { fileKey: 'brand/x/ref.png', fileName: 'ref.png', contentType: 'image/png', size: 1, status: 'ready', brief: 'b', analysis: analysis as never } });
    const hostile = [
      { ...PROPOSAL, surface: '"></style><script>alert(1)</script>' }, { ...PROPOSAL, colours: { light: 'url(x)' } }, { ...PROPOSAL, decoration: { kind: 'artwork' } },
      { ...PROPOSAL, display: { case: 'upper', tracking: 9 } }, { ...PROPOSAL, extra: 1 }, { ...PROPOSAL, colours: { __proto__: '#000000', neon: '#00FF00' } },
    ];
    for (const proposal of [...hostile, undefined]) {
      const r = await make({ ...STYLE, ...(proposal ? { proposal } : {}) });
      expect((await api.get(`/api/settings/brand/references/${r.id}/proposal`)).status, JSON.stringify(proposal)).toBe(409);
      expect((await api.post(`/api/settings/brand/references/${r.id}/apply`, {})).status).toBe(409);
    }
    expect(await t.prisma.brandProfile.count()).toBe(0);
  });

  const GRID = { columns: 12, rows: 24, margin: { top: 56, right: 70, bottom: 56, left: 70 }, gutter: 20, rowGutter: 0 };
  const COMPOSITION = {
    name: 'Split', description: 'A photo beside the headline.', fields: { image: { required: true }, headline: { required: true, max: 60 } }, grid: GRID,
    blocks: [{ type: 'photo', slot: { col: 1, row: 1, width: 6, height: 24 }, bleed: ['top', 'left', 'bottom'] }, { type: 'headline', slot: { col: 7, row: 4, width: 6, height: 9 }, size: 64 }],
  };
  const answer = (input: unknown) => async () => new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'respond', input }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'tool_use' }), { status: 200, headers: { 'content-type': 'application/json' } });

  it('keeps a layout the reference suggests only when the engine accepts it, and adds it only when an admin does', async () => {
    const api = await withProvider();
    fake.fetch = answer({ ...STYLE, composition: COMPOSITION });
    await upload(api, '/api/settings/brand/references', 'split.png', DEMO('logo-mark.png'));
    await t.jobs.drain(t.deps);
    const ref = (await api.get('/api/settings/brand/references')).body.references[0];
    expect(ref.analysis.composition).toMatchObject({ id: 'from-reference', name: 'Split', canvas: { feed: GRID } });
    expect(await t.prisma.brandLayout.count()).toBe(0);
    const added = await api.post('/api/settings/layouts', { definition: { ...ref.analysis.composition, id: 'split' }, origin: `reference:${ref.id}` });
    expect(added.status).toBe(201);
    expect(added.body.layout).toMatchObject({ slug: 'split', origin: `reference:${ref.id}` });
    expect(activeBrand().layouts.map((l: { id: string }) => l.id)).toEqual(['split']);
    // a suggestion that is well formed but not a usable layout (blocks on each other) is never stored
    fake.fetch = answer({ ...STYLE, composition: { ...COMPOSITION, blocks: [...COMPOSITION.blocks, { type: 'logo', slot: { col: 7, row: 10, width: 6, height: 1 } }] } });
    await upload(api, '/api/settings/brand/references', 'overlap.png', DEMO('logo-mark.png'));
    await t.jobs.drain(t.deps);
    const second = (await api.get('/api/settings/brand/references')).body.references.find((r: { fileName: string }) => r.fileName === 'overlap.png');
    expect(second.status).toBe('ready');
    expect(second.analysis.composition).toBeUndefined();
  });
});

describe('sync', () => {
  it('goes back to the configured pack when the saved brand is removed', async () => {
    const api = await admin();
    await api.put('/api/settings/brand', SETTINGS);
    expect(brandState().source).toBe('database');
    await t.prisma.brandProfile.deleteMany();
    await syncBrand(t.deps);
    expect(process.env.BRAND_DIR).toBe('brands/demo');
    expect((await t.api().get('/api/app')).body.brand.name).toBe('Acme Savings');
  });
});

let chrome = false;
try { chrome = !!(await pipelineEngine()).findChrome(); } catch { chrome = false; }

describe.skipIf(!chrome)('a brand saved in Settings, rendered by real Chrome', () => {
  it('draws a post with the saved logos and colours', async () => {
    const api = await admin();
    await api.put('/api/settings/brand', SETTINGS);
    await upload(api, '/api/settings/brand/logo/full?wordmarkFrom=360&markGap=39', 'logo.png', DEMO('logo-full.png'));
    await upload(api, '/api/settings/brand/logo/mark', 'mark.png', DEMO('logo-mark.png'));
    const editor = await t.createUser('editor');
    const { posts } = await seedBatch(t, editor, { posts: [{ key: 'p1', design: { template: 'number', big: '1,200+', line: 'gardens planted this year', stats: ['9,400+|seedlings shared'] }, renderStatus: 'queued', images: [] }] });
    await renderPost(t.deps, { postId: posts[0]!.id });
    const row = await t.prisma.post.findUniqueOrThrow({ where: { id: posts[0]!.id } });
    expect(row.renderError).toBeNull();
    expect(row.renderStatus).toBe('ok');
    const media = row.media as unknown as Array<{ key: string; source: string }>;
    expect(media.filter((m) => m.source === 'render').length).toBeGreaterThan(0);
    const first = await t.storage.getObject(media[0]!.key);
    fs.mkdirSync(path.join(root, 'out', 'brand-check'), { recursive: true });
    fs.writeFileSync(path.join(root, 'out', 'brand-check', 'number.jpg'), first);
  }, 240_000);
});
