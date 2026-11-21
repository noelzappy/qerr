// Google Fonts for the type roles: a curated list, downloaded once by the server through deps.fetchImpl (faked here) and
// stored like an uploaded font. Nothing is fetched at render time; the files end up embedded in the brand as data: URIs.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pipelineEngine } from './engine/pipeline.js';
import { resetBrandState } from './services/brand-settings.js';
import { GOOGLE_FONT_CATEGORIES, GOOGLE_FONTS, googleCssUrl, isGoogleFileUrl, parseFontFaces } from './services/google-fonts.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
let root: string;
beforeAll(async () => {
  t = await createTestApp();
  root = (await pipelineEngine()).root;
});
afterAll(() => { resetBrandState(); return t.close(); });
beforeEach(async () => { await t.reset(); resetBrandState(); });

const engine = await import('@vesk/engine/design/brand' as string) as { loadBrand(o: { root?: string; file?: string }): { font: Record<string, unknown>; fontFaces: Array<{ role: string; family: string; src: string; range: string; weight: string }> } };
const FONT = (f: string) => fs.readFileSync(path.join(root, 'packages', 'engine', 'design', 'fonts', f));
const LATIN = () => FONT('inter-v20-latin.woff2');
const LATIN_EXT = () => FONT('inter-v20-latin-ext.woff2');
const activeBrand = () => JSON.parse(fs.readFileSync(path.join(root, process.env.BRAND_DIR!, 'brand.json'), 'utf8'));

const RANGE_LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const RANGE_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF';
const face = (subset: string, family: string, weight: number, url: string, range: string) =>
  `/* ${subset} */\n@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url(${url}) format('woff2');\n  unicode-range: ${range};\n}\n`;
// What the css2 API answers: a vietnamese face first (which is left out), then latin-ext and latin.
const css = (family: string, weight: number, base = 'https://fonts.gstatic.com/s/x/v1') =>
  face('vietnamese', family, weight, `${base}/viet.woff2`, 'U+0102-0103, U+0110-0111') + face('latin-ext', family, weight, `${base}/ext.woff2`, RANGE_EXT) + face('latin', family, weight, `${base}/latin.woff2`, RANGE_LATIN);

// A fake Google: the CSS, then the files by name; anything else is an unexpected request.
function fakeGoogle(opts: { css?: (url: string) => Response; file?: (url: string) => Response } = {}) {
  t.setFetch(async (input) => {
    const url = String(input);
    if (url.startsWith('https://fonts.googleapis.com/')) {
      if (opts.css) return opts.css(url);
      const m = /family=([^:]+):wght@(\d+)/.exec(url)!;
      return new Response(css(decodeURIComponent(m[1]!.replace(/\+/g, ' ')), Number(m[2])), { headers: { 'content-type': 'text/css' } });
    }
    if (opts.file) return opts.file(url);
    if (url.endsWith('/latin.woff2')) return new Response(new Uint8Array(LATIN()), { headers: { 'content-type': 'font/woff2' } });
    if (url.endsWith('/ext.woff2')) return new Response(new Uint8Array(LATIN_EXT()), { headers: { 'content-type': 'font/woff2' } });
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
    expect(googleCssUrl(GOOGLE_FONTS.find((g) => g.family === 'Plus Jakarta Sans')!, 600)).toBe('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600&display=swap');
  });

  it('is served to admins only', async () => {
    const res = await (await admin()).get('/api/settings/brand/google-fonts');
    expect(res.status).toBe(200);
    expect(res.body.fonts.find((g: { family: string }) => g.family === 'Fraunces')).toMatchObject({ category: 'serif', licence: 'OFL-1.1' });
    const editor = await t.signedIn('editor');
    expect((await editor.api.get('/api/settings/brand/google-fonts')).status).toBe(403);
  });

  it('reads only the faces of a css2 answer and trusts only fonts.gstatic.com over https', () => {
    const faces = parseFontFaces(css('Fraunces', 600));
    expect(faces.map((f) => f.subset)).toEqual(['vietnamese', 'latin-ext', 'latin']);
    expect(faces[2]).toMatchObject({ weight: '600', style: 'normal', url: 'https://fonts.gstatic.com/s/x/v1/latin.woff2', format: 'woff2', range: RANGE_LATIN });
    expect(isGoogleFileUrl('https://fonts.gstatic.com/s/a.woff2')).toBe(true);
    for (const u of ['http://fonts.gstatic.com/s/a.woff2', 'https://fonts.gstatic.com.example.net/a.woff2', 'https://user@fonts.gstatic.com/a.woff2', 'https://fonts.gstatic.com:8443/a.woff2', 'https://evil.example/a.woff2', 'data:font/woff2;base64,AAAA', '/s/a.woff2']) {
      expect(isGoogleFileUrl(u)).toBe(false);
    }
  });
});

describe('POST /api/settings/brand/google-font', () => {
  it('downloads the latin and latin-ext files once, stores them like an upload and embeds them in the brand', async () => {
    const api = await admin();
    fakeGoogle();
    const res = await pick(api, { role: 'display', family: 'Fraunces', weight: 600 });
    expect(res.status).toBe(200);
    // one CSS request with a browser's User-Agent, then the two files; the vietnamese file is never asked for
    expect(t.fetchCalls.map((c) => c.url)).toEqual([
      'https://fonts.googleapis.com/css2?family=Fraunces:wght@600&display=swap', 'https://fonts.gstatic.com/s/x/v1/latin.woff2', 'https://fonts.gstatic.com/s/x/v1/ext.woff2',
    ]);
    expect(String((t.fetchCalls[0]!.init?.headers as Record<string, string>)['user-agent'])).toMatch(/Chrome\/\d+/);
    expect(t.fetchCalls.every((c) => c.init?.redirect === 'error')).toBe(true);
    expect(res.body.fontSources.display).toEqual({ family: 'Fraunces', source: 'google', google: { family: 'Fraunces', weight: 600 }, file: '/api/settings/brand/font/display' });
    expect(res.body.fonts.display).toBe('Fraunces');
    // headlines switch to their own font; nothing else in the settings changes
    expect(res.body.settings.style.type.display.font).toBe('own');
    expect([...t.storage.objects.values()].map((o) => o.contentType)).toEqual(['font/woff2', 'font/woff2']);

    const written = activeBrand();
    expect(written.font.display).toBe('Fraunces');
    const files = written.font.files.filter((f: { role: string }) => f.role === 'display');
    expect(files).toEqual([
      { role: 'display', weight: '100 900', file: `${process.env.BRAND_DIR}/fonts/display-latin.woff2`, range: RANGE_LATIN },
      { role: 'display', weight: '100 900', file: `${process.env.BRAND_DIR}/fonts/display-latin-ext.woff2`, range: RANGE_EXT },
    ]);
    expect(fs.readFileSync(path.join(root, process.env.BRAND_DIR!, 'fonts', 'display-latin.woff2')).equals(LATIN())).toBe(true);
    expect(fs.readFileSync(path.join(root, process.env.BRAND_DIR!, 'fonts', 'display-latin-ext.woff2')).equals(LATIN_EXT())).toBe(true);
    // the engine embeds both files under the family, as data: URIs (the render page loads nothing)
    const loaded = engine.loadBrand({ root, file: path.join(root, process.env.BRAND_DIR!, 'brand.json') });
    const faces = loaded.fontFaces.filter((f) => f.family === 'Fraunces');
    expect(faces.map((f) => f.range)).toEqual([RANGE_LATIN, RANGE_EXT]);
    expect(faces.every((f) => f.src.startsWith('data:font/woff2;base64,'))).toBe(true);
    expect(loaded.font.display).toBe('Fraunces');

    // the page can show the font in its own face, from the app itself
    const preview = await api.get('/api/settings/brand/font/display');
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toBe('font/woff2');
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'brand.font.google' } });
    expect(audit.detail).toMatchObject({ role: 'display', family: 'Fraunces', weight: 600, licence: 'OFL-1.1', subsets: ['latin', 'latin-ext'] });

    // another family replaces it: the two old files are removed
    const again = await pick(api, { role: 'display', family: 'Bebas Neue', weight: 400 });
    expect(again.status).toBe(200);
    expect(again.body.fontSources.display).toMatchObject({ family: 'Bebas Neue', google: { family: 'Bebas Neue', weight: 400 } });
    expect(t.storage.objects.size).toBe(2);
    // removing it: headlines go back to the body font and no file is left
    const off = await api.delete('/api/settings/brand/font?role=display');
    expect(off.body.fontSources.display).toBeNull();
    expect(t.storage.objects.size).toBe(0);
    expect(activeBrand().font.display).toBeUndefined();
  });

  it('sets the body font, keeps the families of the roles apart, and gives way to an upload', async () => {
    const api = await admin();
    fakeGoogle();
    const body = await pick(api, { role: 'body', family: 'Inter', weight: 400 });
    expect(body.status).toBe(200);
    expect(body.body.fontSources.body).toMatchObject({ family: 'Inter', source: 'google', google: { family: 'Inter', weight: 400 } });
    expect(body.body.font).toEqual({ family: 'Inter' });
    const sans = activeBrand().font.files.filter((f: { role: string }) => f.role === 'sans');
    expect(sans.map((f: { file: string }) => f.file)).toEqual([`${process.env.BRAND_DIR}/fonts/brand-latin.woff2`, `${process.env.BRAND_DIR}/fonts/brand-latin-ext.woff2`]);
    expect(activeBrand().font.files.filter((f: { role: string }) => f.role === 'mono')).toHaveLength(4);
    // the same family for the labels gets a name of its own, so the two sets of files never mix
    const label = await pick(api, { role: 'label', family: 'Inter', weight: 600 });
    expect(label.body.fontSources.label).toMatchObject({ family: 'Inter Label', google: { family: 'Inter', weight: 600 } });
    expect(label.body.settings.style.type.label.font).toBe('own');
    expect(activeBrand().font.label).toBe('Inter Label');
    // a mono for labels from Google is not the built-in IBM Plex Mono either
    const mono = await pick(api, { role: 'label', family: 'IBM Plex Mono', weight: 500 });
    expect(mono.body.fontSources.label.family).toBe('IBM Plex Mono Label');
    expect(t.storage.objects.size).toBe(4);
    // an uploaded body font replaces the Google one and both of its files
    const form = new FormData();
    form.set('file', new File([new Uint8Array(LATIN())], 'brand.woff2'));
    form.set('family', 'Brand Sans');
    const up = await api.post('/api/settings/brand/font?role=body', form);
    expect(up.status).toBe(200);
    expect(up.body.fontSources.body).toEqual({ family: 'Brand Sans', source: 'upload', file: '/api/settings/brand/font/body' });
    expect(t.storage.objects.size).toBe(3);
    expect(activeBrand().font.files.filter((f: { role: string }) => f.role === 'sans').map((f: { file: string }) => f.file)).toEqual([`${process.env.BRAND_DIR}/fonts/brand.woff2`]);
    // back to Inter: nothing of the body font is left
    await api.delete('/api/settings/brand/font?role=body');
    expect(t.storage.objects.size).toBe(2);
  });

  it('lets an imported brand pack replace a Google body font, leaving none of its files behind', async () => {
    const api = await admin();
    fakeGoogle();
    expect((await pick(api, { role: 'body', family: 'Manrope', weight: 500 })).status).toBe(200);
    const googleKeys = [...t.storage.objects.keys()];
    expect(googleKeys).toHaveLength(2);
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
      { role: 'display', family: 'Comic Sans', weight: 400 },
      { role: 'display', family: 'Fraunces&family=Other', weight: 400 },
      { role: 'display', family: 'fraunces', weight: 400 },
      { role: 'display', family: 'Bebas Neue', weight: 700 },
      { role: 'display', family: 'Fraunces', weight: 650 },
      { role: 'heading', family: 'Fraunces', weight: 600 },
      { role: 'display', family: 'Fraunces', weight: '600' },
      { role: 'display', family: 'Fraunces', weight: 600, url: 'https://evil.example/x.css' },
    ]) {
      const res = await pick(api, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(t.fetchCalls).toHaveLength(0);
    await nothingStored();
  });

  it('refuses a file anywhere but fonts.gstatic.com, and never downloads it', async () => {
    const api = await admin();
    fakeGoogle({ css: () => new Response(css('Fraunces', 600, 'https://fonts.example.net/s')) });
    const res = await pick(api, { role: 'display', family: 'Fraunces', weight: 600 });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/outside fonts\.gstatic\.com/);
    expect(t.fetchCalls).toHaveLength(1);
    await nothingStored();
    fakeGoogle({ css: () => new Response(css('Fraunces', 600, 'http://fonts.gstatic.com/s')) });
    expect((await pick(api, { role: 'display', family: 'Fraunces', weight: 600 })).status).toBe(502);
    await nothingStored();
  });

  it('refuses bytes that are not woff2, and files over the size limit', async () => {
    const api = await admin();
    fakeGoogle({ file: () => new Response('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'.repeat(4)) });
    const bad = await pick(api, { role: 'display', family: 'Fraunces', weight: 600 });
    expect(bad.status).toBe(502);
    expect(bad.body.error).toMatch(/not a woff2 font/);
    await nothingStored();
    // too big, whether the size is declared or only found while reading
    const big = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(3 * 1024 * 1024)]);
    fakeGoogle({ file: () => new Response(new Uint8Array(big)) });
    const over = await pick(api, { role: 'display', family: 'Fraunces', weight: 600 });
    expect(over.status).toBe(413);
    expect(over.body.error).toMatch(/larger than/);
    await nothingStored();
    fakeGoogle({ file: () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < 40; i++) c.enqueue(new Uint8Array(128 * 1024)); c.close(); } })) });
    expect((await pick(api, { role: 'display', family: 'Fraunces', weight: 600 })).status).toBe(413);
    await nothingStored();
  });

  it('says clearly when Google no longer serves the font, fails, or cannot be reached, and stores nothing', async () => {
    const api = await admin();
    fakeGoogle({ css: () => new Response('<html>Bad request</html>', { status: 400 }) });
    const gone = await pick(api, { role: 'body', family: 'Lora', weight: 500 });
    expect(gone.status).toBe(502);
    expect(gone.body.error).toBe('Google Fonts no longer serves Lora 500. Choose another weight or family.');
    fakeGoogle({ css: () => new Response('not found', { status: 404 }) });
    expect((await pick(api, { role: 'body', family: 'Lora', weight: 500 })).body.error).toMatch(/no longer serves/);
    fakeGoogle({ css: () => new Response('<html>server error SECRET-PAGE</html>', { status: 500 }) });
    const down = await pick(api, { role: 'body', family: 'Lora', weight: 500 });
    expect(down.status).toBe(502);
    expect(down.body.error).toBe('Google Fonts did not answer for Lora 500 (HTTP 500). Try again later.');
    expect(JSON.stringify(down.body)).not.toContain('SECRET-PAGE');
    t.setFetch(async () => { throw new TypeError('fetch failed'); });
    const offline = await pick(api, { role: 'body', family: 'Lora', weight: 500 });
    expect(offline.status).toBe(502);
    expect(offline.body.error).toMatch(/could not be reached.*fonts\.googleapis\.com and fonts\.gstatic\.com/);
    // the CSS answers but a file fails
    fakeGoogle({ file: (u) => (u.endsWith('/ext.woff2') ? new Response('no', { status: 503 }) : new Response(new Uint8Array(LATIN()))) });
    const half = await pick(api, { role: 'body', family: 'Lora', weight: 500 });
    expect(half.status).toBe(502);
    expect(half.body.error).toMatch(/latin-ext file of Lora 500 could not be downloaded \(HTTP 503\)/);
    // an answer with no latin face at all
    fakeGoogle({ css: () => new Response(face('cyrillic', 'Lora', 500, 'https://fonts.gstatic.com/s/c.woff2', 'U+0400-045F')) });
    expect((await pick(api, { role: 'body', family: 'Lora', weight: 500 })).body.error).toMatch(/no latin file/);
    await nothingStored();
  });

  it('keeps a family Google has only in latin to its one file', async () => {
    const api = await admin();
    fakeGoogle({ css: () => new Response(face('latin', 'Permanent Marker', 400, 'https://fonts.gstatic.com/s/x/v1/latin.woff2', RANGE_LATIN)) });
    const res = await pick(api, { role: 'display', family: 'Permanent Marker', weight: 400 });
    expect(res.status).toBe(200);
    expect(activeBrand().font.files.filter((f: { role: string }) => f.role === 'display')).toEqual([{ role: 'display', weight: '100 900', file: `${process.env.BRAND_DIR}/fonts/display-latin.woff2`, range: RANGE_LATIN }]);
  });

  it('is for admins only', async () => {
    fakeGoogle();
    const editor = await t.signedIn('editor');
    expect((await pick(editor.api, { role: 'display', family: 'Fraunces', weight: 600 })).status).toBe(403);
    expect((await editor.api.get('/api/settings/brand/font/display')).status).toBe(403);
    expect(t.fetchCalls).toHaveLength(0);
    await nothingStored();
  });
});
