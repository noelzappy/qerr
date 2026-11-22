// The style layer in Settings: colour roles set one by one, type roles, surfaces, decoration, photo treatment, logo and footer,
// and the fonts and artwork they upload. Every value is checked by the form's schema and by the engine's validateBrand.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pipelineEngine } from './engine/pipeline.js';
import {
  applyProposal, brandSettingsSchema, contrast, contrastChecks, currentSettings, engineStyle, explicitRoles, expandBrand, paletteChanges, resetBrandState, settingsFromBrand, splitPackBrand, type BrandSettings,
} from './services/brand-settings.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
let root: string;
beforeAll(async () => {
  t = await createTestApp();
  root = (await pipelineEngine()).root;
});
afterAll(() => { resetBrandState(); return t.close(); });
beforeEach(async () => { await t.reset(); resetBrandState(); });

const engine = await import('@qerr/engine/design/brand' as string) as { validateBrand(b: unknown): string[] };
const tokens = await import('@qerr/engine/design/tokens' as string) as { DIRECTIONS: string[] };
const DEMO = (f: string) => fs.readFileSync(path.join(root, 'brands', 'demo', f));
const INTER = () => fs.readFileSync(path.join(root, 'packages', 'engine', 'design', 'fonts', 'inter-v20-latin.woff2'));
const activeBrand = () => JSON.parse(fs.readFileSync(path.join(root, process.env.BRAND_DIR!, 'brand.json'), 'utf8'));
const BEFORE = {
  name: 'Globex Garden', website: 'globex.example', tagline: 'Grow with us.', descriptor: '', timezone: 'Europe/London', language: 'British English', money: null,
  colours: { primary: '#2E7D32', accent: '#F9A825', dark: '#1B2A1E', light: '#F3F7F2' }, headlineWeight: 500, corners: 'soft',
  series: [{ key: 'tips', name: 'Tips', ground: 'gold-pale', accent: 'colour' }, { key: 'dark', name: 'Dark', ground: 'ink', accent: 'muted' }], spellings: [], voice: '', visualDirection: '',
  logo: { wordmarkFrom: 0, markGap: 0 },
};
const S = (extra: Record<string, unknown> = {}): BrandSettings => brandSettingsSchema.parse({ ...BEFORE, ...extra });
const STYLE = {
  type: { display: { font: 'body', case: 'upper', tracking: 0.02, weight: 700 }, body: { case: 'as-typed', tracking: null, weight: null }, label: { font: 'body', case: 'as-typed', tracking: 0, weight: 600 }, scale: 1.1, accent: 'none' },
  surface: 'outline', decoration: { kind: 'grid', on: 'all', alpha: 0.1, fit: 'cover', opacity: 1 },
  photo: { treatment: 'duotone', strength: 0.5, colour: 'primary', shadows: 'dark', highlights: 'warm' }, logo: 'bottom-right', footer: 'pill',
};

async function admin() { return t.api(await t.signIn(await t.createUser('admin'))); }
function upload(api: ReturnType<TestApp['api']>, url: string, name: string, body: Buffer, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(body)], name));
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return api.post(url, form);
}

describe('the style settings', () => {
  it('fill in to the look before the style layer, so settings saved before it (with the older ground names) keep working', async () => {
    const s = S();
    expect(s.roles).toEqual({ grounds: {}, text: {}, accents: {}, surfaces: {}, slabs: {} });
    expect(s.style).toMatchObject({ surface: 'shadow', decoration: { kind: 'auto', on: 'dark' }, photo: { treatment: 'none' }, logo: 'auto', footer: 'website', type: { accent: 'series', label: { font: 'mono', case: 'upper' }, display: { font: 'body', case: 'as-typed' } } });
    expect(s.series.map((x) => x.ground)).toEqual(['warm', 'dark']);
    const b = expandBrand(s);
    expect(engine.validateBrand(b)).toEqual([]);
    expect(b.style).toEqual({ type: { display: { case: 'as-typed' }, body: { case: 'as-typed' }, label: { case: 'upper' }, scale: 1, accent: 'series' }, surface: 'shadow', decoration: { kind: 'auto', on: 'dark', fit: 'cover', opacity: 1 }, photo: { treatment: 'none', strength: 0.5, colour: 'primary', shadows: 'dark', highlights: 'light' }, logo: 'auto', footer: 'website' });
    // a row saved before: stored as it was, read with the defaults
    await t.prisma.brandProfile.create({ data: { settings: BEFORE } });
    const read = currentSettings(await t.prisma.brandProfile.findUniqueOrThrow({ where: { id: 'brand' } }));
    expect(read.name).toBe('Globex Garden');
    expect(read.style.surface).toBe('shadow');
    const api = await admin();
    expect((await api.put('/api/settings/brand', BEFORE)).status).toBe(200);
    expect(activeBrand().series.tips.ground).toBe('warm');
  });

  it('check every field against its list or range and refuse anything else', async () => {
    expect(engine.validateBrand(expandBrand(S({ style: STYLE })))).toEqual([]);
    const bad: Array<Record<string, unknown>> = [
      { style: { surface: 'glass' } }, { style: { decoration: { kind: 'stars' } } }, { style: { decoration: { on: 'light' } } }, { style: { decoration: { alpha: 1 } } },
      { style: { photo: { treatment: 'sepia' } } }, { style: { photo: { colour: '#FF0000' } } }, { style: { photo: { shadows: 'var(--x)' } } }, { style: { photo: { strength: 3 } } },
      { style: { logo: 'centre' } }, { style: { footer: 'url' } }, { style: { css: 'x' } },
      { style: { type: { display: { case: 'lower' } } } }, { style: { type: { display: { font: 'Comic Sans' } } } }, { style: { type: { label: { font: 'serif' } } } },
      { style: { type: { label: { tracking: 0.9 } } } }, { style: { type: { body: { weight: 950 } } } }, { style: { type: { scale: 3 } } }, { style: { type: { accent: 'underline' } } },
      { style: { type: { display: { case: '"></style><script>alert(1)</script>' } } } },
      { roles: { grounds: { light: 'white' } } }, { roles: { grounds: { white: '#FFFFFF' } } }, { roles: { text: { ink: 'red;}</style>' } } }, { roles: { accents: { neon: '#00FF00' } } }, { roles: { css: {} } },
    ];
    for (const extra of bad) expect(brandSettingsSchema.safeParse({ ...BEFORE, ...extra }).success, JSON.stringify(extra)).toBe(false);
    const api = await admin();
    expect((await api.put('/api/settings/brand', { ...BEFORE, style: { surface: 'glass' } })).status).toBe(400);
    expect((await api.post('/api/settings/brand/preview', { ...BEFORE, roles: { text: { ink: 'url(x)' } } })).status).toBe(400);
    expect(await t.prisma.brandProfile.count()).toBe(0);
  });

  it('write the style block the engine reads, with the type roles, surfaces, decoration, photo treatment, logo and footer', () => {
    const b = expandBrand(S({ style: STYLE }));
    expect(b.style).toEqual({
      type: { display: { case: 'upper', tracking: 0.02, weight: 700 }, body: { case: 'as-typed' }, label: { case: 'as-typed', tracking: 0, weight: 600 }, scale: 1.1, accent: 'none' },
      surface: 'outline', decoration: { kind: 'grid', on: 'all', alpha: 0.1, fit: 'cover', opacity: 1 },
      photo: { treatment: 'duotone', strength: 0.5, colour: 'primary', shadows: 'dark', highlights: 'warm' }, logo: 'bottom-right', footer: 'pill',
    });
    // artwork without a picture leaves the page plain until one is uploaded
    expect((expandBrand(S({ style: { decoration: { kind: 'artwork' } } })).style as { decoration: { kind: string } }).decoration.kind).toBe('none');
    // an imported pack's style comes back into the form, not into the Advanced fragment
    const pack = JSON.parse(DEMO('brand.json').toString('utf8'));
    pack.style = { surface: 'flat', decoration: { kind: 'lines', on: 'all' }, type: { label: { case: 'as-typed' } } };
    const split = splitPackBrand(pack);
    expect(split.advanced.style).toBeUndefined();
    expect(split.settings.style).toMatchObject({ surface: 'flat', decoration: { kind: 'lines', on: 'all' }, type: { label: { case: 'as-typed', font: 'mono' } } });
    expect(settingsFromBrand(pack).style.surface).toBe('flat');
  });
});

describe('the design direction', () => {
  const STYLE_BEFORE = { type: { display: { case: 'as-typed' }, body: { case: 'as-typed' }, label: { case: 'upper' }, scale: 1, accent: 'series' }, surface: 'shadow', decoration: { kind: 'auto', on: 'dark', fit: 'cover', opacity: 1 }, photo: { treatment: 'none', strength: 0.5, colour: 'primary', shadows: 'dark', highlights: 'light' }, logo: 'auto', footer: 'website' };

  it('is none by default, and a brand without one writes exactly the style block it wrote before', () => {
    expect(S().style.direction).toBeNull();
    expect(brandSettingsSchema.parse({ ...BEFORE, style: { direction: null } }).style.direction).toBeNull();
    expect('direction' in engineStyle(S().style)).toBe(false);
    expect(JSON.stringify(engineStyle(S().style))).toBe(JSON.stringify(STYLE_BEFORE));
    expect(JSON.stringify(expandBrand(S()).style)).toBe(JSON.stringify(STYLE_BEFORE));
  });

  it('is written into the style block when chosen, and the engine accepts every one of its directions', () => {
    for (const direction of tokens.DIRECTIONS) {
      const b = expandBrand(S({ style: { direction } }));
      expect((b.style as { direction: string }).direction).toBe(direction);
      expect(engine.validateBrand(b)).toEqual([]);
    }
  });

  it('is saved, comes back through GET, reaches the pack folder in use and is refused when it is not in the list', async () => {
    const api = await admin();
    expect((await api.get('/api/settings/brand')).body.settings.style.direction).toBeNull();
    const put = await api.put('/api/settings/brand', S({ style: { direction: 'swiss' } }));
    expect(put.status).toBe(200);
    expect(put.body.settings.style.direction).toBe('swiss');
    expect((await api.get('/api/settings/brand')).body.settings.style.direction).toBe('swiss');
    // A newly saved brand starts on the Clean look, which overrides the direction in the pack; classic layouts use the setting.
    expect(activeBrand().style.direction).toBe('clean');
    expect((await api.put('/api/settings/looks/active', { ref: null })).status).toBe(200);
    expect(activeBrand().style.direction).toBe('swiss');
    expect(engine.validateBrand(activeBrand())).toEqual([]);
    // back to none: the key leaves the brand file
    expect((await api.put('/api/settings/brand', S({ style: { direction: null } }))).status).toBe(200);
    expect('direction' in activeBrand().style).toBe(false);
    for (const bad of ['cubist', '', 'Swiss', 7, ['swiss']]) {
      expect((await api.put('/api/settings/brand', { ...BEFORE, style: { direction: bad } })).status, String(bad)).toBe(400);
      expect((await api.post('/api/settings/brand/preview', { ...BEFORE, style: { direction: bad } })).status, String(bad)).toBe(400);
    }
  });

  it('is kept when a reference proposal is applied and when a brand pack is read back into the form', () => {
    const proposal = { colours: {}, display: { case: 'as-typed' }, label: { case: 'upper' }, accent: 'none', surface: 'flat', decoration: { kind: 'none' }, photo: { treatment: 'none' } };
    const next = applyProposal(S({ style: { direction: 'retail' } }), proposal as never);
    expect(next.style.direction).toBe('retail');
    expect(next.style.surface).toBe('flat');
    const pack = JSON.parse(DEMO('brand.json').toString('utf8'));
    pack.style = { ...pack.style, direction: 'editorial' };
    expect(splitPackBrand(pack).settings.style.direction).toBe('editorial');
    expect(settingsFromBrand(pack).style.direction).toBe('editorial');
    expect(splitPackBrand(pack).advanced.style).toBeUndefined();
    // a direction the engine does not know is read as none, not as an error
    pack.style.direction = 'cubist';
    expect(settingsFromBrand(pack).style.direction).toBeNull();
  });
});

describe('colour roles', () => {
  it('start from the four colours: with no role set the brand is exactly what the four colours make', () => {
    const b = expandBrand(S());
    expect(b.grounds).toMatchObject({ light: '#FFFFFF', soft: '#F3F7F2', dark: (b.text as Record<string, string>).ink });
    expect(contrastChecks(b).filter((c) => !c.ok)).toEqual([]);
    expect(contrastChecks(b).some((c) => c.set)).toBe(false);
  });

  it('use a role that is set exactly as it is, never fitted, and mark the pairs it fails in', () => {
    // a saturated full-bleed ground and a colour people chose for the headline that does not read on it
    const s = S({ roles: { grounds: { cool: '#FF8A50' }, text: { ink: '#7A7A7A' }, accents: { primary: '#FFD400' } } });
    const b = expandBrand(s);
    expect((b.grounds as Record<string, string>).cool).toBe('#FF8A50');
    expect((b.text as Record<string, string>).ink).toBe('#7A7A7A');
    expect((b.accents as Record<string, string>).primary).toBe('#FFD400');
    expect(engine.validateBrand(b)).toEqual([]);
    expect(explicitRoles(s)).toEqual(['grounds.cool', 'text.ink', 'accents.primary', 'slabs.fact']);
    const failing = contrastChecks(b, explicitRoles(s)).filter((c) => !c.ok);
    expect(failing.length).toBeGreaterThan(0);
    expect(failing.filter((c) => !c.set).map((c) => c.label)).toEqual([]);
    expect(failing.map((c) => c.label)).toContain('Headline on the cool ground');
    // nothing set is listed as moved, even though it does not read
    expect(paletteChanges(s, b)).toEqual([]);
    // the derived text colours are fitted to the grounds as set: the body text still reads on the orange ground
    expect(contrast((b.text as Record<string, string>).body!, '#FF8A50')).toBeGreaterThanOrEqual(7);
  });

  it('let every ground be dark: the inverse, sub line and accent colours are fitted to the dark grounds people set', () => {
    const s = S({ roles: { grounds: { light: '#0B0B0F', soft: '#111117', cool: '#16161E', warm: '#1B1B24', dark: '#000000', deep: '#0D0D13' }, text: { inverse: '#F5F5F5' }, slabs: { myth: '#16161E', fact: '#1F1F2A' } } });
    const b = expandBrand(s);
    expect(engine.validateBrand(b)).toEqual([]);
    const checks = contrastChecks(b);
    expect(checks.find((c) => c.label === 'Headline on the light ground')).toMatchObject({ ok: true });
    expect(checks.find((c) => c.label === 'Accent words on the soft ground')).toMatchObject({ ok: true });
    expect(checks.find((c) => c.label === 'Sub line on the warm ground')).toMatchObject({ ok: true });
  });

  it('come back from the preview with every role, which ones are set, and which pairs fail', async () => {
    const api = await admin();
    const res = await api.post('/api/settings/brand/preview', { ...BEFORE, roles: { text: { ink: '#BBBBBB' } } });
    expect(res.status).toBe(200);
    expect(res.body.explicit).toEqual(['text.ink']);
    expect(res.body.palette.text.ink).toBe('#BBBBBB');
    expect(res.body.palette.surfaces).toMatchObject({ panel: '#F3F7F2', card: '#FFFFFF' });
    expect(res.body.checks.filter((c: { ok: boolean; set?: boolean }) => !c.ok && c.set).length).toBeGreaterThan(0);
  });
});

describe('the files of the style layer', () => {
  it('take a display and a label font of their own (woff2, a name of their own) and write them into the pack', async () => {
    const api = await admin();
    await api.put('/api/settings/brand', S({ style: { ...STYLE, type: { ...STYLE.type, display: { ...STYLE.type.display, font: 'own' }, label: { ...STYLE.type.label, font: 'own' } } } }));
    expect((await upload(api, '/api/settings/brand/font?role=heading', 'f.woff2', INTER(), { family: 'Brand Display' })).status).toBe(400);
    expect((await upload(api, '/api/settings/brand/font?role=display', 'f.woff2', Buffer.from('<svg/>'), { family: 'Brand Display' })).status).toBe(415);
    expect((await upload(api, '/api/settings/brand/font?role=display', 'f.woff2', INTER(), { family: 'Inter' })).status).toBe(400);
    expect((await upload(api, '/api/settings/brand/font?role=display', 'f.woff2', INTER(), { family: "x';}</style>" })).status).toBe(400);
    const d = await upload(api, '/api/settings/brand/font?role=display', 'f.woff2', INTER(), { family: 'Brand Display' });
    expect(d.status).toBe(200);
    expect(d.body.fonts).toEqual({ body: null, display: 'Brand Display', label: null });
    expect((await upload(api, '/api/settings/brand/font?role=label', 'f.woff2', INTER(), { family: 'brand display' })).status).toBe(400);
    const l = await upload(api, '/api/settings/brand/font?role=label', 'f.woff2', INTER(), { family: 'Brand Label' });
    expect(l.body.fonts).toEqual({ body: null, display: 'Brand Display', label: 'Brand Label' });
    const written = activeBrand();
    expect(written.font.display).toBe('Brand Display');
    expect(written.font.label).toBe('Brand Label');
    const files = written.font.files.filter((f: { role: string }) => f.role === 'display' || f.role === 'label');
    expect(files.map((f: { file: string }) => f.file)).toEqual([`${process.env.BRAND_DIR}/fonts/label.woff2`, `${process.env.BRAND_DIR}/fonts/display.woff2`]);
    expect(fs.readFileSync(path.join(root, process.env.BRAND_DIR!, 'fonts', 'display.woff2')).equals(INTER())).toBe(true);
    // removing the display font: headlines go back to the body font
    const off = await api.delete('/api/settings/brand/font?role=display');
    expect(off.body.fonts.display).toBeNull();
    expect(activeBrand().font.display).toBeUndefined();
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await upload(editor, '/api/settings/brand/font?role=label', 'f.woff2', INTER(), { family: 'X' })).status).toBe(403);
  });

  it('take brand artwork only as PNG, JPEG or WebP (never SVG or GIF) and show it once the decoration is artwork', async () => {
    const api = await admin();
    await api.put('/api/settings/brand', S({ style: { decoration: { kind: 'artwork', on: 'all', fit: 'corner', opacity: 0.4 } } }));
    expect((activeBrand().style.decoration.kind)).toBe('none');
    expect((await upload(api, '/api/settings/brand/artwork', 'a.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))).status).toBe(415);
    expect((await upload(api, '/api/settings/brand/artwork', 'a.png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).status).toBe(415);
    expect((await upload(api, '/api/settings/brand/artwork', 'a.gif', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'))).status).toBe(415);
    const ok = await upload(api, '/api/settings/brand/artwork', 'art.png', DEMO('logos/logo-mark.png'));
    expect(ok.status).toBe(200);
    expect(ok.body.artwork).toBe('/api/settings/brand/artwork');
    const deco = activeBrand().style.decoration;
    expect(deco).toMatchObject({ kind: 'artwork', on: 'all', fit: 'corner', opacity: 0.4, artwork: `${process.env.BRAND_DIR}/artwork/artwork.png` });
    expect(fs.readFileSync(path.join(root, deco.artwork)).equals(DEMO('logos/logo-mark.png'))).toBe(true);
    const served = await api.get('/api/settings/brand/artwork');
    expect(served.status).toBe(200);
    // the Advanced fragment cannot point the artwork (or the display and label families) anywhere else
    const adv = await api.put('/api/settings/brand/advanced', { advanced: { style: { decoration: { artwork: 'brands/demo/logos/logo-full.png' } }, font: { display: 'Other' } }, map: null });
    expect(adv.status).toBe(200);
    expect(activeBrand().style.decoration.artwork).toBe(`${process.env.BRAND_DIR}/artwork/artwork.png`);
    expect(activeBrand().font.display).toBeUndefined();
    expect((await api.delete('/api/settings/brand/artwork')).body.artwork).toBeNull();
    expect(activeBrand().style.decoration.kind).toBe('none');
  });
});
