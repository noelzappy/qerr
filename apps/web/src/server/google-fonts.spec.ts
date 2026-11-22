// Google Fonts for the type roles: a curated list, downloaded once by the server through deps.fetchImpl (faked here) and
// stored like an uploaded font, in every weight the role is drawn at. Nothing is fetched at render time; the files end up
// embedded in the brand as data: URIs, each weight its own @font-face.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pipelineEngine } from './engine/pipeline.js';
import { resetBrandState } from './services/brand-settings.js';
import { faceDraws, GOOGLE_FONT_CATEGORIES, GOOGLE_FONTS, googleCssUrl, isGoogleFileUrl, MAX_GOOGLE_PICK_BYTES, parseFontFaces } from './services/google-fonts.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
let root: string;
beforeAll(async () => {
  t = await createTestApp();
  root = (await pipelineEngine()).root;
});
afterAll(() => { resetBrandState(); return t.close(); });
beforeEach(async () => { await t.reset(); resetBrandState(); });

const engine = await import('@qerr/engine/design/brand' as string) as {
  loadBrand(o: { root?: string; file?: string }): { font: Record<string, unknown>; fontFaces: Array<{ role: string; family: string; src: string; range: string; weight: string }> };
  validateBrand(b: unknown): string[];
};
const FONT = (f: string) => fs.readFileSync(path.join(root, 'packages', 'engine', 'design', 'fonts', f));
const LATIN = () => FONT('inter-v20-latin.woff2');
const LATIN_EXT = () => FONT('inter-v20-latin-ext.woff2');
// The file Google sends for one subset of one weight: a real woff2, marked with its weight so each stored file can be told apart.
const fileFor = (subset: string, weight: string) => Buffer.concat([subset === 'latin' ? LATIN() : LATIN_EXT(), Buffer.from(`#${weight}`)]);
const DIR = () => process.env.BRAND_DIR!;
const activeBrand = () => JSON.parse(fs.readFileSync(path.join(root, DIR(), 'brand.json'), 'utf8'));
const packFile = (name: string) => fs.readFileSync(path.join(root, DIR(), 'fonts', name));
const filesOf = (role: string) => activeBrand().font.files.filter((f: { role: string }) => f.role === role);

const RANGE_LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const RANGE_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF';
const face = (subset: string, family: string, weight: number | string, url: string, range: string) =>
  `/* ${subset} */\n@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url(${url}) format('woff2');\n  unicode-range: ${range};\n}\n`;
// What the css2 API answers for each weight asked for: a vietnamese face (which is left out), then latin-ext and latin. A static
// family has a file per weight; a variable one (`variable`) sends the same file for every weight, as Google does.
const css = (family: string, weights: number[], { base = 'https://fonts.gstatic.com/s/x/v1', variable = false } = {}) => weights.map((w) => {
  const name = variable ? 'var' : String(w);
  return face('vietnamese', family, w, `${base}/${name}-viet.woff2`, 'U+0102-0103, U+0110-0111') + face('latin-ext', family, w, `${base}/${name}-ext.woff2`, RANGE_EXT) + face('latin', family, w, `${base}/${name}-latin.woff2`, RANGE_LATIN);
}).join('');
const asked = (url: string) => {
  const m = /family=([^:]+):wght@([\d;]+)&/.exec(url)!;
  return { family: decodeURIComponent(m[1]!.replace(/\+/g, ' ')), weights: m[2]!.split(';').map(Number) };
};

// A fake Google: the CSS, then the files by name; anything else is an unexpected request.
function fakeGoogle(opts: { css?: (url: string) => Response; file?: (url: string) => Response; variable?: boolean } = {}) {
  t.setFetch(async (input) => {
    const url = String(input);
    if (url.startsWith('https://fonts.googleapis.com/')) {
      if (opts.css) return opts.css(url);
      const a = asked(url);
      return new Response(css(a.family, a.weights, { variable: opts.variable }), { headers: { 'content-type': 'text/css' } });
    }
    if (opts.file) return opts.file(url);
    const m = /\/(\w+)-(latin|ext)\.woff2$/.exec(url);
    if (m) return new Response(new Uint8Array(fileFor(m[2] === 'latin' ? 'latin' : 'latin-ext', m[1]!)), { headers: { 'content-type': 'font/woff2' } });
    throw new Error(`unexpected request ${url}`);
  });
}

async function admin() { return t.api(await t.signIn(await t.createUser('admin'))); }
const pick = (api: Awaited<ReturnType<typeof admin>>, body: Record<string, unknown>) => api.post('/api/settings/brand/google-font', body);
const nothingStored = async () => {
  expect(t.storage.objects.size).toBe(0);
  expect(await t.prisma.brandProfile.findUnique({ where: { id: 'brand' } })).toBeNull();
  expect(await t.prisma.auditLog.count({ where: { action: 'brand.font.google' } })).toBe(0);
};

describe('the curated list', () => {
  it('has about fifty families, each a plain name with real weights, a category, a licence and a note', () => {
    expect(GOOGLE_FONTS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(GOOGLE_FONTS.map((g) => g.family)).size).toBe(GOOGLE_FONTS.length);
    for (const g of GOOGLE_FONTS) {
      // The family goes into the css2 address: letters, digits and spaces only.
      expect(g.family).toMatch(/^[A-Za-z0-9 ]{1,40}$/);
      expect(GOOGLE_FONT_CATEGORIES).toContain(g.category);
      expect(['OFL-1.1', 'Apache-2.0']).toContain(g.licence);
      expect(g.note.length).toBeGreaterThan(10);
      expect(g.weights.length).toBeGreaterThan(0);
      expect([...g.weights].sort((a, b) => a - b)).toEqual(g.weights);
      for (const w of g.weights) expect(w % 100 === 0 && w >= 100 && w <= 900).toBe(true);
    }
    for (const c of GOOGLE_FONT_CATEGORIES) expect(GOOGLE_FONTS.some((g) => g.category === c)).toBe(true);
    const jakarta = GOOGLE_FONTS.find((g) => g.family === 'Plus Jakarta Sans')!;
    expect(googleCssUrl(jakarta, [600])).toBe('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600&display=swap');
    // several weights in one request, in ascending order as the API wants them
    expect(googleCssUrl(jakarta, [700, 300, 500])).toBe('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;500;700&display=swap');
  });

  it('is served to admins only', async () => {
    const res = await (await admin()).get('/api/settings/brand/google-fonts');
    expect(res.status).toBe(200);
    expect(res.body.fonts.find((g: { family: string }) => g.family === 'Fraunces')).toMatchObject({ category: 'serif', licence: 'OFL-1.1', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] });
    const editor = await t.signedIn('editor');
    expect((await editor.api.get('/api/settings/brand/google-fonts')).status).toBe(403);
  });

  it('reads the faces of a css2 answer weight by weight and trusts only fonts.gstatic.com over https', () => {
    const faces = parseFontFaces(css('Fraunces', [400, 700]));
    expect(faces.map((f) => `${f.subset} ${f.weight}`)).toEqual(['vietnamese 400', 'latin-ext 400', 'latin 400', 'vietnamese 700', 'latin-ext 700', 'latin 700']);
    expect(faces[2]).toMatchObject({ weight: '400', style: 'normal', url: 'https://fonts.gstatic.com/s/x/v1/400-latin.woff2', format: 'woff2', range: RANGE_LATIN });
    expect(faces[5]).toMatchObject({ weight: '700', url: 'https://fonts.gstatic.com/s/x/v1/700-latin.woff2' });
    // a variable family's face can say a range of weights
    const variable = parseFontFaces(face('latin', 'Inter', '400 700', 'https://fonts.gstatic.com/s/inter.woff2', RANGE_LATIN));
    expect(variable[0]!.weight).toBe('400 700');
    expect([300, 400, 550, 700, 800].map((w) => faceDraws('400 700', w))).toEqual([false, true, true, true, false]);
    expect([600, 700, 800].map((w) => faceDraws('700', w))).toEqual([false, true, false]);
    for (const bad of ['bold', '', '700 400', '400;700']) expect(faceDraws(bad, 400)).toBe(false);
    expect(isGoogleFileUrl('https://fonts.gstatic.com/s/a.woff2')).toBe(true);
    for (const u of ['http://fonts.gstatic.com/s/a.woff2', 'https://fonts.gstatic.com.example.net/a.woff2', 'https://user@fonts.gstatic.com/a.woff2', 'https://fonts.gstatic.com:8443/a.woff2', 'https://evil.example/a.woff2', 'data:font/woff2;base64,AAAA', '/s/a.woff2']) {
      expect(isGoogleFileUrl(u)).toBe(false);
    }
  });
});

describe('POST /api/settings/brand/google-font', () => {
  it('downloads every weight the headlines are drawn at, stores each file and declares each weight as its own face', async () => {
    const api = await admin();
    fakeGoogle();
    const res = await pick(api, { role: 'display', family: 'Fraunces' });
    expect(res.status).toBe(200);
    // the demo draws headlines at 400, the lighter accent at 300 and poster headlines at 600: one CSS request for the three,
    // then each latin and latin-ext file once; the vietnamese files are never asked for
    expect(t.fetchCalls.map((c) => c.url)).toEqual([
      'https://fonts.googleapis.com/css2?family=Fraunces:wght@300;400;600&display=swap',
      ...[300, 400, 600].flatMap((w) => [`https://fonts.gstatic.com/s/x/v1/${w}-latin.woff2`, `https://fonts.gstatic.com/s/x/v1/${w}-ext.woff2`]),
    ]);
    expect(String((t.fetchCalls[0]!.init?.headers as Record<string, string>)['user-agent'])).toMatch(/Chrome\/\d+/);
    expect(t.fetchCalls.every((c) => c.init?.redirect === 'error')).toBe(true);
    expect(res.body.fontSources.display).toEqual({ family: 'Fraunces', source: 'google', google: { family: 'Fraunces', weights: [300, 400, 600], missing: [] }, file: '/api/settings/brand/font/display' });
    expect(res.body.fonts.display).toBe('Fraunces');
    // headlines switch to their own font; nothing else in the settings changes
    expect(res.body.settings.style.type.display.font).toBe('own');
    expect([...t.storage.objects.values()].map((o) => o.contentType)).toEqual(Array(6).fill('font/woff2'));

    // each file in the pack, declared for the weights it is the nearest to
    const written = activeBrand();
    expect(written.font.display).toBe('Fraunces');
    const at = (w: number, subset: string) => `${DIR()}/fonts/display-${w}-${subset}.woff2`;
    expect(filesOf('display')).toEqual([
      { role: 'display', weight: '100 350', file: at(300, 'latin'), range: RANGE_LATIN },
      { role: 'display', weight: '100 350', file: at(300, 'latin-ext'), range: RANGE_EXT },
      { role: 'display', weight: '351 500', file: at(400, 'latin'), range: RANGE_LATIN },
      { role: 'display', weight: '351 500', file: at(400, 'latin-ext'), range: RANGE_EXT },
      { role: 'display', weight: '501 900', file: at(600, 'latin'), range: RANGE_LATIN },
      { role: 'display', weight: '501 900', file: at(600, 'latin-ext'), range: RANGE_EXT },
    ]);
    for (const w of [300, 400, 600]) {
      expect(packFile(`display-${w}-latin.woff2`).equals(fileFor('latin', String(w)))).toBe(true);
      expect(packFile(`display-${w}-latin-ext.woff2`).equals(fileFor('latin-ext', String(w)))).toBe(true);
    }
    expect(engine.validateBrand(written)).toEqual([]);
    // the engine embeds every file under the family, each weight its own face, as data: URIs (the render page loads nothing)
    const loaded = engine.loadBrand({ root, file: path.join(root, DIR(), 'brand.json') });
    const faces = loaded.fontFaces.filter((f) => f.family === 'Fraunces');
    expect(faces.map((f) => `${f.weight}|${f.range === RANGE_LATIN ? 'latin' : 'ext'}`)).toEqual(['100 350|latin', '100 350|ext', '351 500|latin', '351 500|ext', '501 900|latin', '501 900|ext']);
    expect(faces.every((f) => f.src.startsWith('data:font/woff2;base64,'))).toBe(true);
    expect(new Set(faces.map((f) => f.src)).size).toBe(6);
    expect(Buffer.from(faces[4]!.src.split(',')[1]!, 'base64').equals(fileFor('latin', '600'))).toBe(true);

    // the page can show the font in its own face, from the app itself: the latin file of the regular weight
    const preview = await api.get('/api/settings/brand/font/display');
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toBe('font/woff2');
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'brand.font.google' } });
    expect(audit.detail).toMatchObject({ role: 'display', family: 'Fraunces', weights: [300, 400, 600], licence: 'OFL-1.1', files: 6, subsets: ['latin', 'latin-ext'] });

    // another family replaces it: all six old files are removed; a family with one weight brings that one, for every weight
    const again = await pick(api, { role: 'display', family: 'Bebas Neue' });
    expect(again.status).toBe(200);
    expect(again.body.fontSources.display).toMatchObject({ family: 'Bebas Neue', google: { family: 'Bebas Neue', weights: [400], missing: [] } });
    expect(t.storage.objects.size).toBe(2);
    expect(filesOf('display').map((f: { weight: string }) => f.weight)).toEqual(['100 900', '100 900']);
    // removing it: headlines go back to the body font and no file is left
    const off = await api.delete('/api/settings/brand/font?role=display');
    expect(off.body.fontSources.display).toBeNull();
    expect(t.storage.objects.size).toBe(0);
    expect(activeBrand().font.display).toBeUndefined();
  });

  it('brings the nearest weight a family has for one it lacks, and asks for each weight once', async () => {
    const api = await admin();
    fakeGoogle();
    // Libre Caslon Text comes in 400 and 700: 300 and 400 are drawn with the 400, 600 with the 700
    const res = await pick(api, { role: 'display', family: 'Libre Caslon Text' });
    expect(res.status).toBe(200);
    expect(t.fetchCalls[0]!.url).toBe('https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:wght@400;700&display=swap');
    expect(res.body.fontSources.display.google).toEqual({ family: 'Libre Caslon Text', weights: [400, 700], missing: [] });
    expect(filesOf('display').map((f: { weight: string; file: string }) => `${f.weight} ${path.basename(f.file)}`)).toEqual([
      '100 549 display-400-latin.woff2', '100 549 display-400-latin-ext.woff2', '550 900 display-700-latin.woff2', '550 900 display-700-latin-ext.woff2',
    ]);
  });

  it('downloads a variable family\'s file once and declares it for all the weights it draws', async () => {
    const api = await admin();
    fakeGoogle({ variable: true });
    const res = await pick(api, { role: 'display', family: 'Fraunces' });
    expect(res.status).toBe(200);
    expect(t.fetchCalls.map((c) => c.url)).toEqual([
      'https://fonts.googleapis.com/css2?family=Fraunces:wght@300;400;600&display=swap', 'https://fonts.gstatic.com/s/x/v1/var-latin.woff2', 'https://fonts.gstatic.com/s/x/v1/var-ext.woff2',
    ]);
    expect(res.body.fontSources.display.google.weights).toEqual([300, 400, 600]);
    expect(t.storage.objects.size).toBe(2);
    expect(filesOf('display')).toEqual([
      { role: 'display', weight: '100 900', file: `${DIR()}/fonts/display-300-latin.woff2`, range: RANGE_LATIN },
      { role: 'display', weight: '100 900', file: `${DIR()}/fonts/display-300-latin-ext.woff2`, range: RANGE_EXT },
    ]);
    // Google's own answer for a range of weights reads the same way
    fakeGoogle({ css: () => new Response(face('latin', 'Fraunces', '100 900', 'https://fonts.gstatic.com/s/x/v1/var-latin.woff2', RANGE_LATIN)) });
    expect((await pick(api, { role: 'display', family: 'Fraunces' })).status).toBe(200);
    expect(filesOf('display')).toEqual([{ role: 'display', weight: '100 900', file: `${DIR()}/fonts/display-300-latin.woff2`, range: RANGE_LATIN }]);
  });

  it('follows the brand\'s weights, and says which weights a stored font lacks after they change', async () => {
    const api = await admin();
    fakeGoogle();
    expect((await pick(api, { role: 'display', family: 'Fraunces' })).status).toBe(200);
    // bold headlines: 700, the accent at 600 and posters at 900
    const view = (await api.get('/api/settings/brand')).body;
    const saved = await api.put('/api/settings/brand', { ...view.settings, headlineWeight: 700 });
    expect(saved.status).toBe(200);
    expect(saved.body.fontSources.display.google).toEqual({ family: 'Fraunces', weights: [300, 400, 600], missing: [700, 900] });
    // until it is picked again the nearest stored weight stands in: 600 is declared for everything above 500
    expect(filesOf('display').at(-1).weight).toBe('501 900');
    // picked again, it brings exactly what the headlines now use
    t.fetchCalls.length = 0;
    const again = await pick(api, { role: 'display', family: 'Fraunces' });
    expect(t.fetchCalls[0]!.url).toBe('https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700;900&display=swap');
    expect(again.body.fontSources.display.google).toEqual({ family: 'Fraunces', weights: [600, 700, 900], missing: [] });
    expect(filesOf('display').map((f: { weight: string }) => f.weight)).toEqual(['100 649', '100 649', '650 799', '650 799', '800 900', '800 900']);
    expect(t.storage.objects.size).toBe(6);
  });

  it('sets the body font in every weight body text and headlines use, keeps the families of the roles apart, and gives way to an upload', async () => {
    const api = await admin();
    fakeGoogle();
    const body = await pick(api, { role: 'body', family: 'Inter' });
    expect(body.status).toBe(200);
    // body text 400, its bold words and the headlines 400, the accent 300, website and pills 500, tags and posters 600
    expect(body.body.fontSources.body).toMatchObject({ family: 'Inter', source: 'google', google: { family: 'Inter', weights: [300, 400, 500, 600], missing: [] } });
    expect(body.body.font).toEqual({ family: 'Inter' });
    const sans = filesOf('sans');
    expect(sans.map((f: { file: string; weight: string }) => `${f.weight} ${path.basename(f.file)}`)).toEqual([
      '100 350 brand-300-latin.woff2', '100 350 brand-300-latin-ext.woff2', '351 449 brand-400-latin.woff2', '351 449 brand-400-latin-ext.woff2',
      '450 549 brand-500-latin.woff2', '450 549 brand-500-latin-ext.woff2', '550 900 brand-600-latin.woff2', '550 900 brand-600-latin-ext.woff2',
    ]);
    expect(filesOf('mono')).toHaveLength(4);
    // the preview (and the profile's font key) is the regular weight's latin file
    expect((await api.get('/api/settings/brand/font/body')).status).toBe(200);
    const fontKey = (await t.prisma.brandProfile.findUniqueOrThrow({ where: { id: 'brand' } })).fontKey!;
    expect(t.storage.objects.get(fontKey)!.body.equals(fileFor('latin', '400'))).toBe(true);
    // the same family for the labels gets a name of its own, so the two sets of files never mix; labels are drawn at 500
    const label = await pick(api, { role: 'label', family: 'Inter', weight: 600 });
    expect(label.body.fontSources.label).toMatchObject({ family: 'Inter Label', google: { family: 'Inter', weights: [500, 600] } });
    expect(label.body.settings.style.type.label.font).toBe('own');
    expect(activeBrand().font.label).toBe('Inter Label');
    // a mono for labels from Google is not the built-in IBM Plex Mono either
    const mono = await pick(api, { role: 'label', family: 'IBM Plex Mono' });
    expect(mono.body.fontSources.label).toMatchObject({ family: 'IBM Plex Mono Label', google: { weights: [500] } });
    expect(t.storage.objects.size).toBe(8 + 2);
    // an uploaded body font replaces the Google one and all of its files, and is declared for every weight as before
    const form = new FormData();
    form.set('file', new File([new Uint8Array(LATIN())], 'brand.woff2'));
    form.set('family', 'Brand Sans');
    const up = await api.post('/api/settings/brand/font?role=body', form);
    expect(up.status).toBe(200);
    expect(up.body.fontSources.body).toEqual({ family: 'Brand Sans', source: 'upload', file: '/api/settings/brand/font/body' });
    expect(t.storage.objects.size).toBe(3);
    expect(filesOf('sans')).toEqual([{ role: 'sans', weight: '100 900', file: `${DIR()}/fonts/brand.woff2`, range: 'U+0000-FFFF' }]);
    // back to Inter: nothing of the body font is left
    await api.delete('/api/settings/brand/font?role=body');
    expect(t.storage.objects.size).toBe(2);
  });

  it('still reads a Google font stored with one weight, before fonts came in several', async () => {
    const api = await admin();
    expect((await api.get('/api/settings/brand')).status).toBe(200);
    const keys = ['brand/old/display-latin.woff2', 'brand/old/display-latin-ext.woff2'];
    await t.storage.putObject(keys[0]!, fileFor('latin', '600'), 'font/woff2');
    await t.storage.putObject(keys[1]!, fileFor('latin-ext', '600'), 'font/woff2');
    const settings = (await api.get('/api/settings/brand')).body.settings;
    const admin1 = await t.prisma.user.findFirstOrThrow();
    await t.prisma.brandProfile.create({ data: {
      settings: { ...settings, style: { ...settings.style, type: { ...settings.style.type, display: { ...settings.style.type.display, font: 'own' } } } },
      assets: { display: { key: keys[0], family: 'Fraunces', files: [{ key: keys[0], range: RANGE_LATIN }, { key: keys[1], range: RANGE_EXT }], source: { kind: 'google', family: 'Fraunces', weight: 600 } } },
      updatedById: admin1.id,
    } });
    const view = (await api.get('/api/settings/brand')).body;
    // its one weight, and the weights picking it again would add
    expect(view.fontSources.display).toEqual({ family: 'Fraunces', source: 'google', google: { family: 'Fraunces', weights: [600], missing: [300, 400] }, file: '/api/settings/brand/font/display' });
    // its two files, each drawn for every weight as before
    expect(filesOf('display')).toEqual([
      { role: 'display', weight: '100 900', file: `${DIR()}/fonts/display-latin.woff2`, range: RANGE_LATIN },
      { role: 'display', weight: '100 900', file: `${DIR()}/fonts/display-latin-ext.woff2`, range: RANGE_EXT },
    ]);
    expect(packFile('display-latin.woff2').equals(fileFor('latin', '600'))).toBe(true);
    // picking it again brings the weights and removes the old files
    fakeGoogle();
    const again = await pick(api, { role: 'display', family: 'Fraunces' });
    expect(again.body.fontSources.display.google).toEqual({ family: 'Fraunces', weights: [300, 400, 600], missing: [] });
    for (const k of keys) expect(t.storage.objects.has(k)).toBe(false);
  });

  it('lets an imported brand pack replace a Google body font, leaving none of its files behind', async () => {
    const api = await admin();
    fakeGoogle();
    expect((await pick(api, { role: 'body', family: 'Manrope' })).status).toBe(200);
    const googleKeys = [...t.storage.objects.keys()];
    expect(googleKeys).toHaveLength(8);
    const pack = (f: string) => fs.readFileSync(path.join(root, 'brands', 'demo', f));
    const form = new FormData();
    for (const [k, v] of Object.entries({ brand: pack('brand.json'), full: pack('logos/logo-full.png'), mark: pack('logos/logo-mark.png') })) form.set(k, new File([new Uint8Array(v)], k));
    const res = await api.post('/api/settings/brand/import', form);
    expect(res.status).toBe(200);
    expect(res.body.fontSources.body).toBeNull();
    for (const k of googleKeys) expect(t.storage.objects.has(k)).toBe(false);
    expect((await t.prisma.brandProfile.findUniqueOrThrow({ where: { id: 'brand' } })).assets).toEqual({});
    expect(activeBrand().font.family).toBe('Inter');
  });

  it('refuses a family that is not in the list and a weight it does not offer, without asking Google', async () => {
    const api = await admin();
    fakeGoogle();
    for (const body of [
      { role: 'display', family: 'Comic Sans' },
      { role: 'display', family: 'Fraunces&family=Other' },
      { role: 'display', family: 'fraunces' },
      { role: 'display', family: 'Bebas Neue', weight: 700 },
      { role: 'display', family: 'Fraunces', weight: 650 },
      { role: 'heading', family: 'Fraunces' },
      { role: 'display', family: 'Fraunces', weight: '600' },
      { role: 'display', family: 'Fraunces', weights: [100, 200] },
      { role: 'display', family: 'Fraunces', url: 'https://evil.example/x.css' },
    ]) {
      const res = await pick(api, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(t.fetchCalls).toHaveLength(0);
    await nothingStored();
  });

  it('refuses a file anywhere but fonts.gstatic.com, and never downloads it', async () => {
    const api = await admin();
    fakeGoogle({ css: (u) => new Response(css('Fraunces', asked(u).weights, { base: 'https://fonts.example.net/s' })) });
    const res = await pick(api, { role: 'display', family: 'Fraunces' });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/outside fonts\.gstatic\.com/);
    expect(t.fetchCalls).toHaveLength(1);
    await nothingStored();
    // one weight's file elsewhere is enough to refuse them all
    fakeGoogle({ css: (u) => new Response(css('Fraunces', [300, 400]) + css('Fraunces', [600], { base: 'http://fonts.gstatic.com/s' })) });
    expect((await pick(api, { role: 'display', family: 'Fraunces' })).status).toBe(502);
    await nothingStored();
  });

  it('refuses bytes that are not woff2, files over the size limit, and more than the limit for all files together', async () => {
    const api = await admin();
    fakeGoogle({ file: () => new Response('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'.repeat(4)) });
    const bad = await pick(api, { role: 'display', family: 'Fraunces' });
    expect(bad.status).toBe(502);
    expect(bad.body.error).toMatch(/not a woff2 font/);
    await nothingStored();
    // too big, whether the size is declared or only found while reading
    const big = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(3 * 1024 * 1024)]);
    fakeGoogle({ file: () => new Response(new Uint8Array(big)) });
    const over = await pick(api, { role: 'display', family: 'Fraunces' });
    expect(over.status).toBe(413);
    expect(over.body.error).toMatch(/larger than/);
    await nothingStored();
    fakeGoogle({ file: () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < 40; i++) c.enqueue(new Uint8Array(128 * 1024)); c.close(); } })) });
    expect((await pick(api, { role: 'display', family: 'Fraunces' })).status).toBe(413);
    await nothingStored();
    // each file under its own limit, but eight of them (Inter for the body: four weights, two subsets) over the total
    const each = Math.floor(MAX_GOOGLE_PICK_BYTES / 6);
    t.fetchCalls.length = 0;
    fakeGoogle({ file: () => new Response(new Uint8Array(Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(each)]))) });
    const total = await pick(api, { role: 'body', family: 'Inter' });
    expect(total.status).toBe(413);
    expect(total.body.error).toMatch(/all its files together.*larger than/);
    expect(t.fetchCalls.length).toBeLessThan(1 + 8);
    await nothingStored();
  });

  it('says clearly when Google no longer serves the font, fails, or cannot be reached, and stores nothing', async () => {
    const api = await admin();
    // Lora comes in 400 to 700: the body's 300 is drawn with its 400
    fakeGoogle({ css: () => new Response('<html>Bad request</html>', { status: 400 }) });
    const gone = await pick(api, { role: 'body', family: 'Lora' });
    expect(gone.status).toBe(502);
    expect(gone.body.error).toBe('Google Fonts no longer serves Lora 400, 500, 600. Choose another family.');
    fakeGoogle({ css: () => new Response('not found', { status: 404 }) });
    expect((await pick(api, { role: 'body', family: 'Lora' })).body.error).toMatch(/no longer serves/);
    fakeGoogle({ css: () => new Response('<html>server error SECRET-PAGE</html>', { status: 500 }) });
    const down = await pick(api, { role: 'body', family: 'Lora' });
    expect(down.status).toBe(502);
    expect(down.body.error).toBe('Google Fonts did not answer for Lora 400, 500, 600 (HTTP 500). Try again later.');
    expect(JSON.stringify(down.body)).not.toContain('SECRET-PAGE');
    t.setFetch(async () => { throw new TypeError('fetch failed'); });
    const offline = await pick(api, { role: 'body', family: 'Lora' });
    expect(offline.status).toBe(502);
    expect(offline.body.error).toMatch(/could not be reached.*fonts\.googleapis\.com and fonts\.gstatic\.com/);
    // the CSS answers but a file fails
    fakeGoogle({ file: (u) => (u.endsWith('/500-ext.woff2') ? new Response('no', { status: 503 }) : new Response(new Uint8Array(LATIN()))) });
    const half = await pick(api, { role: 'body', family: 'Lora' });
    expect(half.status).toBe(502);
    expect(half.body.error).toMatch(/The latin-ext file of Lora 500 could not be downloaded \(HTTP 503\)/);
    // an answer with no latin face at all, or none for one of the weights
    fakeGoogle({ css: () => new Response(face('cyrillic', 'Lora', 500, 'https://fonts.gstatic.com/s/c.woff2', 'U+0400-045F')) });
    expect((await pick(api, { role: 'body', family: 'Lora' })).body.error).toMatch(/no latin file for Lora 400/);
    fakeGoogle({ css: () => new Response(css('Lora', [400, 500])) });
    expect((await pick(api, { role: 'body', family: 'Lora' })).body.error).toMatch(/no latin file for Lora 600/);
    await nothingStored();
  });

  it('keeps a family Google has only in latin to its latin files', async () => {
    const api = await admin();
    fakeGoogle({ css: () => new Response(face('latin', 'Permanent Marker', 400, 'https://fonts.gstatic.com/s/x/v1/400-latin.woff2', RANGE_LATIN)) });
    const res = await pick(api, { role: 'display', family: 'Permanent Marker' });
    expect(res.status).toBe(200);
    expect(filesOf('display')).toEqual([{ role: 'display', weight: '100 900', file: `${DIR()}/fonts/display-400-latin.woff2`, range: RANGE_LATIN }]);
  });

  it('is for admins only', async () => {
    fakeGoogle();
    const editor = await t.signedIn('editor');
    expect((await pick(editor.api, { role: 'display', family: 'Fraunces' })).status).toBe(403);
    expect((await editor.api.get('/api/settings/brand/font/display')).status).toBe(403);
    expect(t.fetchCalls).toHaveLength(0);
    await nothingStored();
  });
});
