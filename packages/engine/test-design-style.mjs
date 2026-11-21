// node --test   (the style layer: brand.json `style`, the colour roles, the type roles and the ground names, old and new; the real
// render at the end needs Google Chrome and is skipped without it)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, brandFile } from './lib/core.mjs';
import { readBrandImage } from './lib/design/assets.mjs';
import { brandCssVars, canonicalGrounds, loadBrand, normaliseBrand, resolveStyle, styleClasses, styleProblems, validateBrand } from './lib/design/brand.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { buildPage } from './lib/design/page.mjs';
import { renderImage } from './lib/design/render.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { forSize, normaliseDesign, validateDesign } from './lib/design/spec.mjs';
import { GROUND_ALIASES, GROUND_NAMES, STYLE_DEFAULTS, groundName, isDarkColour } from './lib/design/tokens.mjs';
import { TEMPLATE_FNS } from './lib/design/builtin-layouts.mjs';
import { hs } from './design/templates/common.mjs';
import { bar } from './design/templates/poster.mjs';
import { decodePng, pngBytes } from './testlib/png.mjs';

const RAW = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brand = loadBrand();
const withStyle = (style, extra = {}) => ({ ...brand, ...normaliseBrand({ ...RAW, ...extra, style }), artworkSrc: style?.decoration?.kind === 'artwork' ? PIXEL : null });
const page = (b, spec, extra = {}) => {
  const t = TEMPLATE_FNS[spec.template](forSize(normaliseDesign(spec), 'feed'), { size: SIZES.feed, brand: b, image: () => PIXEL, imageSize: () => ({ w: 1640, h: 1025 }), ...extra });
  return buildPage({ brand: b, size: SIZES.feed, ...t });
};
const bodyOf = (h) => h.split('<body')[1].split('<script')[0];
const htmlClass = (h) => /<html lang="en"(?: class="([^"]*)")?/.exec(h)[1] ?? '';

const FULL = {
  type: { display: { case: 'upper', tracking: 0.02, weight: 800 }, body: { case: 'as-typed', tracking: 0, weight: 400 }, label: { case: 'as-typed', tracking: 0.01, weight: 600 }, scale: 1.1, accent: 'none' },
  surface: 'outline',
  decoration: { kind: 'grid', on: 'all', alpha: 0.12 },
  photo: { treatment: 'duotone', strength: 0.6, colour: 'primary', shadows: 'dark', highlights: 'warm' },
  logo: 'bottom-right',
  footer: 'pill',
};

test('ground names: the neutral names, and the older names read as the same grounds everywhere', () => {
  assert.deepEqual(GROUND_NAMES, ['light', 'soft', 'cool', 'warm', 'dark', 'deep']);
  for (const [old, now] of Object.entries(GROUND_ALIASES)) assert.equal(groundName(old), now);
  for (const g of GROUND_NAMES) assert.equal(groundName(g), g);
  for (const bad of ['paper', '__proto__', 'constructor', 'toString', '', null, 5, 'Light', 'ink;x']) assert.equal(groundName(bad), null, String(bad));
  // specs
  for (const g of [...GROUND_NAMES, ...Object.keys(GROUND_ALIASES)]) assert.deepEqual(validateDesign({ template: 'text', headline: 'h', ground: g }, 'p'), [], g);
  assert.ok(validateDesign({ template: 'text', headline: 'h', ground: 'constructor' }, 'p').some((e) => e.includes('ground must be one of')));
  // a spec with an older name draws exactly the page the new name draws, on the editorial and the poster pages
  for (const [old, now] of Object.entries(GROUND_ALIASES)) {
    assert.equal(bodyOf(page(brand, { template: 'text', headline: 'h', ground: old })), bodyOf(page(brand, { template: 'text', headline: 'h', ground: now })), old);
    assert.equal(bodyOf(page(brand, { template: 'object', headline: 'h', image: 'a.jpg', ground: old })), bodyOf(page(brand, { template: 'object', headline: 'h', image: 'a.jpg', ground: now })), old);
  }
  // a brand pack written with the older names (grounds and series) loads into the same brand
  const old = structuredClone(RAW);
  old.grounds = Object.fromEntries(Object.entries(RAW.grounds).map(([k, v]) => [Object.keys(GROUND_ALIASES).find((a) => GROUND_ALIASES[a] === k) ?? k, v]));
  for (const s of Object.values(old.series)) s.ground = Object.keys(GROUND_ALIASES).find((a) => GROUND_ALIASES[a] === s.ground) ?? s.ground;
  assert.ok('white' in old.grounds && 'gold-pale' in old.grounds && old.series.explainers.ground === 'white');
  assert.deepEqual(validateBrand(old), []);
  const a = normaliseBrand(old), b = normaliseBrand(RAW);
  assert.deepEqual(a.grounds, b.grounds);
  assert.deepEqual(a.series, b.series);
  assert.equal(brandCssVars({ ...brand, ...a }), brandCssVars(brand));
  assert.deepEqual(canonicalGrounds({ white: '#FFFFFF', deep: '#000000' }), { light: '#FFFFFF', deep: '#000000' });
});

test('which grounds are dark is worked out from their colours, so any ground can be dark or saturated', () => {
  assert.deepEqual(brand.darkGrounds, ['dark', 'deep']);
  assert.equal(isDarkColour('#000000'), true);
  assert.equal(isDarkColour('#FFFFFF'), false);
  assert.equal(isDarkColour('#E8EEF9'), false);
  assert.equal(isDarkColour('#1C2D52'), true);
  // black and neon: every ground dark; the soft ground's page gets light type and the decoration
  const neon = withStyle(undefined, { grounds: { light: '#0A0A0A', soft: '#111111', cool: '#00FF85', warm: '#FF2EC4', dark: '#000000', deep: '#151515' } });
  assert.deepEqual(neon.darkGrounds, ['light', 'soft', 'dark', 'deep']);
  const soft = page(neon, { template: 'text', headline: 'h', ground: 'soft' });
  assert.match(soft, /<body class="acc-muted dark"/);
  assert.match(soft, /<div class="cv dots" style="--bg:var\(--g-soft\)">/);
  // a saturated light-enough ground (the neon green) keeps ink type
  assert.match(page(neon, { template: 'object', headline: 'h', image: 'a.jpg', ground: 'cool' }), /<body class="acc-colour"/);
  // the footer logo follows what it sits on: the light mark and wordmark on a dark ground (or a dark panel), the full colour logo
  // on a light one; the logo pill is light even when the light ground is not
  assert.match(page(neon, { template: 'stats', big: '1' }), /<div class="ft footer"><div><span class="logo-inv">/);
  assert.match(page(brand, { template: 'stats', big: '1', ground: 'dark' }), /<div class="ft footer"><div><span class="logo-inv">/);
  assert.match(page(brand, { template: 'text', headline: 'h', ground: 'dark' }), /<div class="ft footer on-light"><div><img class="logo"/, 'on the light panel');
  assert.match(page(brand, { template: 'stats', big: '1' }), /<div class="ft footer"><div><img class="logo"/);
  assert.ok(brandCssVars(neon).includes('--pill:#FFFFFF') && brandCssVars(brand).includes('--pill:#FFFFFF'));
  assert.ok(brandCssVars(withStyle(undefined, { grounds: { ...RAW.grounds, light: '#FBF6EE' } })).includes('--pill:#FBF6EE'));
});

test('style block: every field is checked against its list or range, and unknown fields are refused', () => {
  assert.deepEqual(styleProblems(undefined), []);
  assert.deepEqual(styleProblems({}), []);
  assert.deepEqual(styleProblems(FULL), []);
  assert.deepEqual(styleProblems({ decoration: { kind: 'artwork', artwork: 'brands/x/art.webp', fit: 'corner', opacity: 0.4 } }), []);
  assert.deepEqual(styleProblems({ photo: { treatment: 'tint', colour: 'warm' } }), []);
  const bad = [
    [[], 'style must be an object'], [{ css: 'body{}' }, 'unknown entries (css)'],
    [{ type: 'big' }, 'type must be an object'], [{ type: { headline: {} } }, 'unknown entries (headline)'],
    [{ type: { display: { case: 'lower' } } }, 'display.case must be one of as-typed, upper'],
    [{ type: { display: { case: 'upper;}</style><script>' } } }, 'display.case must be one of'],
    [{ type: { label: { tracking: 0.5 } } }, 'label.tracking must be a number of em from -0.1 to 0.3'],
    [{ type: { body: { tracking: '0.1em' } } }, 'body.tracking must be a number'],
    [{ type: { body: { weight: 450.5 } } }, 'body.weight must be a whole number from 100 to 900'],
    [{ type: { display: { weight: 1000 } } }, 'display.weight must be a whole number'],
    [{ type: { display: { family: 'Comic' } } }, 'unknown entries (family)'],
    [{ type: { scale: 2 } }, 'type.scale must be a number from 0.8 to 1.25'], [{ type: { scale: NaN } }, 'type.scale'],
    [{ type: { accent: 'underline' } }, 'type.accent must be one of series, muted, colour, weight, none'],
    [{ surface: 'glass' }, 'surface must be one of shadow, outline, flat'],
    [{ decoration: 'grid' }, 'decoration must be an object'], [{ decoration: { kind: 'stars' } }, 'decoration.kind must be one of'],
    [{ decoration: { on: 'light' } }, 'decoration.on must be one of dark, all'], [{ decoration: { kind: 'artwork' } }, 'artwork is needed'],
    [{ decoration: { kind: 'artwork', artwork: 'evil.svg' } }, 'artwork must be the path of a .png, .jpg or .webp'],
    [{ decoration: { kind: 'artwork', artwork: 'url(http://evil/x.png)") ;x.png' } }, null], // a path is only ever read as a file (see readBrandImage)
    [{ decoration: { fit: 'tile' } }, 'decoration.fit must be one of cover, corner'], [{ decoration: { opacity: 0 } }, 'opacity must be a number from 0.05 to 1'],
    [{ decoration: { alpha: 1 } }, 'alpha must be a number from 0.01 to 0.4'],
    [{ photo: { treatment: 'sepia' } }, 'photo.treatment must be one of none, tint, duotone, overlay'],
    [{ photo: { colour: '#FF0000' } }, 'photo.colour must be one of'], [{ photo: { shadows: 'var(--x)' } }, 'photo.shadows must be one of'],
    [{ photo: { strength: 2 } }, 'photo.strength must be a number from 0 to 1'],
    [{ logo: 'centre' }, 'logo must be one of auto, top-left, top-right, bottom-left, bottom-right'], [{ footer: 'url' }, 'footer must be one of website, pill, none'],
  ];
  for (const [s, frag] of bad) {
    const p = styleProblems(s);
    if (frag) assert.ok(p.some((e) => e.includes(frag)), `${JSON.stringify(s)} -> ${frag} (got ${p.join(' | ')})`);
  }
  // the whole brand file is checked with it
  assert.ok(validateBrand({ ...RAW, style: { surface: 'glass' } }).some((e) => e.includes('brand.json: style.surface')));
  assert.deepEqual(validateBrand({ ...RAW, style: FULL }), []);
});

test('the defaults are the look before the style layer: nothing in the page changes for a brand without a style block', () => {
  assert.deepEqual(resolveStyle(undefined), JSON.parse(JSON.stringify(STYLE_DEFAULTS)));
  assert.equal(styleClasses(brand), '');
  const vars = brandCssVars(brand);
  for (const t of ['--hw:400', '--aw:300', '--pw:600', '--h-track:-0.02em', '--p-track:-0.035em', '--h-scale:1', '--d-case:none', '--b-w:400', '--b-track:-0.006em', '--l-w:500', '--l-track:0.07em', '--l-track-n:0.01em', '--l-case:uppercase', "--display:'Inter'", "--label:'IBM Plex Mono'", '--inv:#FFFFFF', '--dot:rgba(255,255,255,0.08)', '--tex:rgba(255,255,255,0.045)']) assert.ok(vars.includes(t), t);
  assert.ok(!vars.includes('--art:'));
  for (const spec of [{ template: 'text', headline: 'a *b*' }, { template: 'closing' }, { template: 'object', headline: 'h', image: 'a.jpg', ground: 'photo' }]) {
    const h = page(brand, spec);
    assert.equal(htmlClass(h), '', spec.template);
    assert.ok(!/class="[^"]*\b(st-|grid|art)\b/.test(bodyOf(h)), spec.template);
  }
});

test('colour roles: the inverse text colour and the outline colour can be set, and default to the light ground and the ink', () => {
  assert.equal(brand.text.inverse, brand.grounds.light);
  assert.equal(brand.surfaces.outline, brand.text.ink);
  const b = withStyle({ surface: 'outline' }, { text: { ...RAW.text, inverse: '#FFF4E0' }, surfaces: { ...RAW.surfaces, outline: '#FF2EC4' } });
  const vars = brandCssVars(b);
  assert.ok(vars.includes('--inv:#FFF4E0') && vars.includes('--outline:#FF2EC4') && vars.includes('--dot:rgba(255,244,224,0.08)'), vars);
  for (const [k, v] of [['text', 'inverse'], ['surfaces', 'outline']]) {
    assert.ok(validateBrand({ ...RAW, [k]: { ...RAW[k], [v]: 'red;}</style>' } }).some((e) => e.includes(`${k}.${v} must be a #rrggbb`)), v);
  }
});

test('type roles: display and label fonts of their own, case, tracking, weight, scale and the accent device reach the page as checked values', () => {
  const b = withStyle(FULL);
  const vars = brandCssVars(b);
  for (const t of ['--d-case:uppercase', '--hw:800', '--pw:800', '--aw:500', '--h-track:0.02em', '--p-track:0.02em', '--h-scale:1.1', '--b-w:400', '--b-track:0em', '--b-case:none', '--l-w:600', '--l-track:0.01em', '--l-case:none']) assert.ok(vars.includes(t), t);
  // the accent device "none" applies to every page unless the post asks for its own
  assert.match(page(b, { template: 'text', headline: 'a *b*', series: 'explainers' }), /<body class="acc-none"/);
  assert.match(page(b, { template: 'object', headline: 'a *b*', image: 'a.jpg' }), /<body class="acc-none"/);
  assert.match(page(b, { template: 'object', headline: 'a *b*', image: 'a.jpg', accent: 'colour' }), /<body class="acc-colour"/);
  assert.match(page(b, { template: 'photo', headline: 'a *b*', image: 'a.jpg' }), /<body class="photo acc-none"/);
  // the stylesheet uses the roles
  assert.match(brand.css, /\.h\{font-family:var\(--display\),var\(--font\),sans-serif;[^}]*text-transform:var\(--d-case\)/);
  assert.match(brand.css, /\.lbl\{font-family:var\(--label\),var\(--mono\),monospace;[^}]*text-transform:var\(--l-case\)/);
  assert.match(brand.css, /\.acc-none \.h em,\.acc-none \.ps-h em/);
  // fonts: a display and a label family, each with its own files (or the sans or mono by name)
  const files = [...RAW.font.files, { role: 'display', weight: '400 900', file: 'design/fonts/inter-v20-latin.woff2', range: 'U+0000-00FF' }];
  assert.deepEqual(validateBrand({ ...RAW, font: { ...RAW.font, display: 'Brand Display', files } }), []);
  assert.deepEqual(validateBrand({ ...RAW, font: { ...RAW.font, label: 'Inter' } }), [], 'labels in the sans');
  assert.ok(validateBrand({ ...RAW, font: { ...RAW.font, display: 'Nowhere Sans' } }).some((e) => e.includes('font.display names "Nowhere Sans", which has no font files')));
  assert.ok(validateBrand({ ...RAW, font: { ...RAW.font, label: "x';}</style>" } }).some((e) => e.includes('font.label may only use')));
  assert.ok(validateBrand({ ...RAW, font: { ...RAW.font, files } }).some((e) => e.includes('is a display font, but font.display names no family')));
  assert.ok(validateBrand({ ...RAW, font: { ...RAW.font, files: [{ ...files[0], role: 'heading' }] } }).some((e) => e.includes('role must be one of sans, mono, display, label')));
  const pack = path.join(ROOT, 'out', 'test-style-fonts');
  fs.rmSync(pack, { recursive: true, force: true });
  fs.mkdirSync(pack, { recursive: true });
  try {
    fs.writeFileSync(path.join(pack, 'brand.json'), JSON.stringify({ ...RAW, font: { ...RAW.font, display: 'Brand Display', label: 'Inter', files } }));
    const loaded = loadBrand({ file: path.join(pack, 'brand.json') });
    assert.deepEqual([...new Set(loaded.fontFaces.map((f) => `${f.role}:${f.family}`))], ['sans:Inter', 'mono:IBM Plex Mono', 'display:Brand Display']);
    const v = brandCssVars(loaded);
    assert.ok(v.includes("--display:'Brand Display'") && v.includes("--label:'Inter'"), v);
  } finally { fs.rmSync(pack, { recursive: true, force: true }); }
});

test('surfaces: shadow (the default), outline or flat, on cards, panels, the desktop window and the phone', () => {
  const desk = { template: 'screen', device: 'desktop', image: 'a.png', headline: 'h' }, ph = { template: 'product', headline: 'h', image: 'p.webp' };
  assert.match(page(brand, desk), /class="win obj"[^>]*box-shadow:0px [^"]*rgba\(20,33,61,0\.25\)/);
  assert.match(page(brand, ph), /class="phone"[^>]*filter:drop-shadow/);
  const out = withStyle({ surface: 'outline' }, { surfaces: { ...RAW.surfaces, outline: '#FF2EC4' } });
  assert.equal(htmlClass(page(out, desk)), 'st-outline');
  assert.match(page(out, desk), /class="win obj"[^>]*box-shadow:0 0 0 3px #FF2EC4"/);
  assert.ok(!/class="phone"[^>]*filter/.test(page(out, ph)));
  const flat = withStyle({ surface: 'flat' });
  assert.equal(htmlClass(page(flat, desk)), 'st-flat');
  assert.match(page(flat, desk), /class="win obj"[^>]*box-shadow:0 0 0 [\d.]+px rgba\(20,33,61,0\.08\)"/);
  assert.match(brand.css, /\.st-outline \.obj\.card,[^{]*\{box-shadow:0 0 0 var\(--ow\) var\(--outline\)\}/);
  assert.match(brand.css, /\.st-flat \.obj\.card,[^{]*\{box-shadow:none\}/);
});

test('decoration: none, dots, grid, lines or brand artwork, on the dark grounds or on all; a page can still say dots: false', () => {
  const cls = (b, spec) => /<div class="cv( poster)?([^"]*)"/.exec(page(b, spec))[2].trim();
  const text = (g) => ({ template: 'text', headline: 'h', ground: g }), post = (g) => ({ template: 'object', headline: 'h', image: 'a.jpg', ground: g });
  assert.equal(cls(brand, text('dark')), 'dots');
  assert.equal(cls(brand, post('dark')), 'tex');
  assert.equal(cls(brand, text('light')), '');
  assert.equal(cls(withStyle({ decoration: { kind: 'none' } }), text('dark')), '');
  assert.equal(cls(withStyle({ decoration: { kind: 'grid' } }), post('deep')), 'grid');
  assert.equal(cls(withStyle({ decoration: { kind: 'grid' } }), post('light')), '');
  assert.equal(cls(withStyle({ decoration: { kind: 'grid', on: 'all' } }), post('light')), 'grid');
  assert.equal(cls(withStyle({ decoration: { kind: 'lines', on: 'all' } }), text('soft')), 'tex');
  assert.equal(cls(withStyle({ decoration: { kind: 'dots', on: 'all' } }), { ...text('soft'), dots: false }), '');
  const art = withStyle({ decoration: { kind: 'artwork', artwork: 'x.png', on: 'all', fit: 'corner', opacity: 0.3 } });
  assert.equal(cls(art, text('light')), 'art');
  assert.equal(htmlClass(page(art, text('light'))), 'st-art-corner');
  assert.ok(brandCssVars(art).includes(`--art:url("${PIXEL}");--art-o:0.3`));
  // without its picture the artwork is left off rather than drawn from nothing
  assert.equal(cls({ ...art, artworkSrc: null }, text('light')), '');
  // the light-ground versions of dots and lines are the ink at the same strength
  assert.match(brand.css, /\.cv\{[^}]*--dc:var\(--dot-l\);--tc:var\(--tex-l\)\}/);
  assert.match(brand.css, /\.cv\.grid\{background-image:linear-gradient\(var\(--dc\)/);
});

test('brand artwork: only a PNG, JPEG or WebP picture inside the repository is embedded; SVG and anything else is refused', () => {
  const dir = path.join(ROOT, 'out', 'test-style-art');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, 'ok.png'), pngBytes(8, 8, () => [200, 30, 90]));
    fs.writeFileSync(path.join(dir, 'svg.png'), '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    fs.writeFileSync(path.join(dir, 'page.webp'), '<html><script>alert(1)</script>');
    fs.writeFileSync(path.join(dir, 'gif.png'), Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'));
    const rel = (f) => path.relative(ROOT, path.join(dir, f));
    assert.match(readBrandImage(rel('ok.png'), { root: ROOT }), /^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    for (const f of ['svg.png', 'page.webp', 'gif.png']) assert.throws(() => readBrandImage(rel(f), { root: ROOT }), /not a PNG, JPEG or WebP picture/, f);
    assert.throws(() => readBrandImage('../../../etc/hosts', { root: ROOT }), /stay inside the repository/);
    assert.throws(() => readBrandImage(rel('missing.png'), { root: ROOT }), /missing/);
    // and loadBrand reads it when, and only when, the decoration is artwork
    fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify({ ...RAW, style: { decoration: { kind: 'artwork', artwork: rel('ok.png') } } }));
    assert.match(loadBrand({ file: path.join(dir, 'brand.json') }).artworkSrc, /^data:image\/png;base64,/);
    fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify({ ...RAW, style: { decoration: { kind: 'artwork', artwork: rel('svg.png') } } }));
    assert.throws(() => loadBrand({ file: path.join(dir, 'brand.json') }), /not a PNG, JPEG or WebP/);
    fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify({ ...RAW, style: { decoration: { kind: 'dots', artwork: rel('svg.png') } } }));
    assert.equal(loadBrand({ file: path.join(dir, 'brand.json') }).artworkSrc, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('photo treatment: on photographs only, from brand colour variables; a treated poster photo is still sampled for the page colour', () => {
  for (const [t, c] of [['tint', 'st-ph-tint'], ['duotone', 'st-ph-duotone'], ['overlay', 'st-ph-overlay']]) {
    const b = withStyle({ photo: { treatment: t, colour: 'accent', shadows: 'deep', highlights: 'cool', strength: 0.35 } });
    const h = page(b, { template: 'object', headline: 'h', image: 'a.jpg', ground: 'photo' });
    assert.equal(htmlClass(h), c);
    // the page reads the photo as the treatment draws it (runtime.mjs applies treatment.mjs to the strips it reads)
    assert.ok(bodyOf(h).includes('data-sample data-fx="0.5" data-fy="0.5"'), t);
    assert.ok(brandCssVars(b).includes('--ph-k:0.35;--ph-c:var(--gold);--ph-lo:var(--g-deep);--ph-hi:var(--g-cool)'), t);
  }
  assert.ok(bodyOf(page(brand, { template: 'object', headline: 'h', image: 'a.jpg' })).includes('data-sample'));
  // the treatment rules reach photo windows and the photo post's picture, never phones or desktop windows
  const rules = brand.css.split('\n').filter((l) => l.startsWith('.st-ph-')).join('\n');
  assert.ok(rules.length && !/\.phone|\.win/.test(rules), rules);
  assert.match(rules, /\.st-ph-duotone \.ph img,\.st-ph-duotone \.pcanvas>img\.bg\{filter:grayscale\(1\)/);
});

test('logo and footer: the poster bar at the top or the bottom, the logo on either side, a pill, or no website', () => {
  const obj = { template: 'object', headline: 'h', image: 'a.jpg' };
  assert.match(page(brand, obj), /<div class="pbar" style="left:80px;right:80px;top:60px"><span class="logo-inv/);
  const br = withStyle({ logo: 'bottom-right' });
  assert.match(page(br, { template: 'number', big: '1' }), /<div class="pbar flip" style="left:80px;right:80px;top:1250px">/);
  // myth-fact moves its series mark to the top when the bar is at the bottom
  assert.match(page(br, { template: 'myth-fact', myth: 'm', factLead: 'f' }), /<div class="pmark" style="right:80px;top:63px">/);
  assert.match(page(withStyle({ logo: 'top-right' }), obj), /<div class="pbar flip" style="left:80px;right:80px;top:60px">/);
  // with the logo at the bottom, editorial pages and photo posts keep their footer there and follow the side
  assert.match(page(br, { template: 'text', headline: 'h' }), /<div class="ft footer flip">/);
  assert.match(page(br, { template: 'photo', headline: 'h', image: 'a.jpg' }), /<div class="footer flip">/);
  const pill = withStyle({ footer: 'pill' });
  assert.match(page(pill, obj), /<div class="pbar"[^>]*><span class="lpill"><img src="data:image\/png;base64,[^"]+" alt="Acme Savings"><\/span><span class="purl"/);
  assert.match(page(pill, { template: 'text', headline: 'h' }), /<div class="ft footer"><div><span class="lpill">/);
  const none = withStyle({ footer: 'none' });
  assert.ok(!page(none, obj).includes('class="purl"'));
  assert.ok(!page(none, { template: 'text', headline: 'h' }).includes('data-role="foot"'));
  assert.ok(!page(none, { template: 'photo', headline: 'h', image: 'a.jpg' }).includes('data-role="url"'));
  // a carousel still says Swipe on its first page
  assert.match(page(none, obj, { counter: { n: 1, total: 3 } }), /data-role="foot">Swipe →</);
});

test('a bottom logo bar goes to the top on poster pages whose photo or phone takes the bottom edge', () => {
  const bl = withStyle({ logo: 'bottom-left' }), br = withStyle({ logo: 'bottom-right' });
  const top = (flip = '') => new RegExp(`<div class="pbar${flip}" style="left:80px;right:80px;top:60px">`);
  const bottom = (flip = '') => new RegExp(`<div class="pbar${flip}" style="left:80px;right:80px;top:1250px">`);
  // the object photo always bleeds off the bottom; the side the brand chose is kept
  assert.match(page(bl, { template: 'object', headline: 'h', image: 'a.jpg' }), top());
  assert.match(page(br, { template: 'object', headline: 'h', image: 'a.jpg' }), top(' flip'));
  // number: with a photo the bar goes up, without one it stays where the brand put it
  assert.match(page(bl, { template: 'number', big: '52', image: 'a.jpg' }), top());
  assert.match(page(bl, { template: 'number', big: '52' }), bottom());
  // product: the centred phone runs off the bottom; a phone beside the headline only when it reaches the bar
  const tall = { imageSize: () => ({ w: 660, h: 1354 }) };
  assert.match(page(bl, { template: 'product', headline: 'h', image: 'p.png' }, tall), top());
  assert.match(page(bl, { template: 'product', headline: 'h', image: 'p.png', layout: 'side', phoneTop: 700 }, tall), top());
  assert.match(page(bl, { template: 'product', headline: 'h', image: 'p.png', layout: 'side' }, { imageSize: () => ({ w: 660, h: 1000 }) }), bottom());
  // the first page of a carousel: "Swipe →" goes up with the bar
  assert.match(page(bl, { template: 'object', headline: 'h', image: 'a.jpg' }, { counter: { n: 1, total: 3 } }), /top:60px"><span class="logo-inv[^]*?data-role="foot">Swipe →</);
  // pages with nothing at the bottom keep the brand's bar
  assert.match(page(bl, { template: 'myth-fact', myth: 'm', factLead: 'f' }), bottom());
  assert.match(page(bl, { template: 'closing' }), bottom());
});

const LEDGER = { columns: [{ label: 'Day' }, { label: 'Paid in', align: 'end' }], rows: [['01', '10.00'], ['02', '12.50']], notes: ['n1'] };

test('editorial text is coloured for the surface it sits on: the light panel of a dark page, a dark panel of a light one', () => {
  // a dark page: the sub line, the footer and a ledger's notes sit on the light panel; the running head on the dark ground
  const dark = bodyOf(page(brand, { template: 'text', headline: 'h', sub: 's', ground: 'dark' }));
  assert.match(dark, /<div class="abs sub on-light" data-role="sub" data-min="30" data-onpanel /);
  assert.match(dark, /<div class="ft footer on-light"><div><img class="logo"/);
  assert.match(dark, /<div class="rh"><span class="lbl" data-role="label">/);
  assert.match(bodyOf(page(brand, { template: 'ledger', headline: 'h', ground: 'dark', ...LEDGER })), /<span class="lbl n on-light" data-role="label" data-onpanel>n1<\/span>/);
  // the footer's logo alone needs no tone class (its logo is drawn for the panel already)
  assert.match(bodyOf(page(brand, { template: 'screen', device: 'desktop', headline: 'h', image: 'd.png', ground: 'dark' })), /<div class="ft footer"><div><img class="logo"/);
  // a light page with the light panel: nothing changes
  assert.doesNotMatch(bodyOf(page(brand, { template: 'text', headline: 'h', sub: 's' })), /on-light|on-dark/);
  // a dark panel on a light page: the text on it takes the dark surface's colours, the footer the light logo
  const deep = withStyle(undefined, { surfaces: { ...RAW.surfaces, panel: RAW.grounds.dark ?? RAW.grounds.ink } });
  const onDark = bodyOf(page(deep, { template: 'text', headline: 'h', sub: 's' }));
  assert.match(onDark, /<div class="abs sub on-dark"/);
  assert.match(onDark, /<div class="ft footer on-dark"><div><span class="logo-inv">/);
  // and the stylesheet colours them as a page of that tone
  for (const rule of ['.dark .on-light .lbl,.dark .lbl.on-light{color:var(--muted)}', '.dark .on-light .sub,.dark .sub.on-light,.dark .on-light .checks li{color:var(--body)}', '.on-dark .lbl,.lbl.on-dark,.on-dark .sub,.sub.on-dark,.on-dark .checks li{color:var(--inv-body)}']) assert.ok(brand.css.includes(rule), rule);
});

test('the logo at the top of editorial pages and photo posts: the footer goes up, and the running head or the text moves out of its way', () => {
  const tl = withStyle({ logo: 'top-left' }), tr = withStyle({ logo: 'top-right', footer: 'pill' });
  const text = bodyOf(page(tl, { template: 'text', headline: 'h', sub: 's' }));
  assert.match(text, /<div class="rh low"><span class="lbl" data-role="foot">Acme Savings<\/span><span class="lbl" data-role="foot">Acme Savings<\/span><\/div><div class="rh-rule low"><\/div>/);
  assert.match(text, /<div class="ft footer up"><div><img class="logo"[^>]*><\/div><span class="lbl n" data-role="foot">/);
  assert.match(bodyOf(page(tr, { template: 'cover', headline: 'h', image: 'a.jpg' })), /<div class="ft footer up flip"><div><span class="lpill">/);
  // the logo alone (screen pages) goes up too
  assert.match(bodyOf(page(tl, { template: 'screen', headline: 'h', image: 'p.png' })), /<div class="ft footer up"><div><img class="logo"/);
  // on a dark page the footer at the top is on the ground, and the running head at the foot on the light panel
  const dark = bodyOf(page(tl, { template: 'text', headline: 'h', ground: 'dark' }));
  assert.match(dark, /<div class="ft footer up"><div><span class="logo-inv">/);
  assert.match(dark, /<div class="rh low on-light">[^]*<div class="rh-rule low on-light"><\/div>/);
  // a picture that takes the top band (photo-story's full-bleed photo) or, under a running head, the foot (a phone beside a
  // passbook running off the bottom) keeps the chrome where it is; the side still follows the style
  assert.match(bodyOf(page(tr, { template: 'photo-story', headline: 'h', image: 'a.jpg' })), /<div class="ft footer flip">/);
  const beside = bodyOf(page(tl, { template: 'screen', headline: 'h', image: 'p.png', beside: { days: 31, ticked: 3, today: 4 } }));
  assert.match(beside, /<div class="rh"><span class="lbl" data-role="label">/);
  assert.match(beside, /<div class="ft footer"><div>/);
  // the photo post: the footer at the top (as far from it as it sits from the bottom; under a story's top band), the text under it
  const photo = (b, size, textAt) => TEMPLATE_FNS.photo(forSize(normaliseDesign({ template: 'photo', headline: 'h', image: 'a.jpg', textAt }), size), { size: SIZES[size], brand: b, image: () => PIXEL }).body;
  assert.match(photo(tl, 'feed', 'top'), /<div class="ptext" id="pt" style="top:151px;max-width:880px">/);
  assert.match(photo(tl, 'feed', 'top'), /<div class="footer up" style="top:56px"><div class="lpill">/);
  assert.match(photo(tl, 'feed', 'bottom'), /<div class="ptext" id="pt" style="bottom:84px;max-width:880px">/);
  assert.match(photo(tr, 'story', 'bottom'), /<div class="ptext" id="pt" style="bottom:350px;max-width:900px">[^]*<div class="footer up flip" style="top:270px">/);
  // at the bottom (the default) nothing moves
  assert.match(photo(brand, 'feed', 'top'), /<div class="ptext" id="pt" style="top:84px;max-width:880px">[^]*<div class="footer"><div class="lpill">/);
  assert.match(bodyOf(page(brand, { template: 'text', headline: 'h' })), /<div class="rh">[^]*<div class="rh-rule"><\/div>[^]*<div class="ft footer">/);
});

test('style values never reach the page as they are: unchecked hostile values map to nothing', () => {
  const evil = '"></style><script>window.__pwn=1</script>';
  const raw = { ...RAW, style: { type: { display: { case: evil, tracking: evil, weight: evil }, label: { case: evil }, accent: evil, scale: evil }, surface: evil, decoration: { kind: evil, on: evil, fit: evil }, photo: { treatment: evil, colour: evil }, logo: evil, footer: evil } };
  assert.ok(validateBrand(raw).length >= 10, 'validateBrand refuses every one of them');
  // even if a caller skipped the check, the tables only ever give their own names
  const b = { ...brand, ...normaliseBrand(raw) };
  const h = page(b, { template: 'text', headline: 'h' }) + page(b, { template: 'object', headline: 'h', image: 'a.jpg' }) + page(b, { template: 'photo', headline: 'h', image: 'a.jpg' });
  assert.ok(!h.includes('__pwn'), 'no hostile style value in any page');
  assert.equal((h.match(/<script/g) ?? []).length, 3);
});

const chrome = findChrome();
test('real render: a styled brand (black and neon, outlined, grid, condensed capitals) and a duotone brand pass the checks', { skip: chrome ? false : 'Google Chrome not found' }, async () => {
  const dir = path.join(ROOT, 'out', 'test-style-render');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(ROOT, 'out', 'design.lock') });
  try {
    const neon = {
      ...RAW,
      grounds: { light: '#0B0B0F', soft: '#121218', cool: '#16161E', warm: '#1B1B24', dark: '#000000', deep: '#0E0E14' },
      text: { ink: '#F4F4F6', body: '#D6D6DE', muted: '#B4B4C2', mutedInv: '#B4B4C2', invBody: '#D6D6DE', inverse: '#FFFFFF', hair: { color: '#FFFFFF', alpha: 0.16 } },
      accents: { gold: '#39FF88', goldDeep: '#39FF88', primary: '#39FF88' },
      surfaces: { panel: '#121218', card: '#16161E', line: { color: '#FFFFFF', alpha: 0.16 }, outline: '#39FF88' },
      poster: { ...RAW.poster, slabs: { myth: '#16161E', fact: '#39FF88' } },
      style: { type: { display: { case: 'upper', tracking: -0.01, weight: 700 }, label: { case: 'upper', tracking: 0.12 }, accent: 'colour' }, surface: 'outline', decoration: { kind: 'grid', on: 'all', alpha: 0.1 }, logo: 'top-right', footer: 'pill' },
    };
    fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify(neon));
    const b = loadBrand({ file: path.join(dir, 'brand.json') });
    for (const [i, d] of [{ template: 'text', headline: 'Every deposit. *On record.*', sub: 'One place for savings.' }, { template: 'object', headline: 'Save *together.*', image: 'packages/engine/design/assets/demo/scene-market.jpg', ground: 'cool' }].entries()) {
      const r = await renderImage(browser, b, { spec: normaliseDesign(d), sizeName: 'feed', outFile: path.join(dir, `neon-${i}.png`) }, { tmpDir: path.join(dir, 'tmp') });
      assert.deepEqual(r.warnings, [], d.template);
    }
    const duo = { ...RAW, style: { type: { accent: 'none' }, photo: { treatment: 'duotone', shadows: 'dark', highlights: 'warm' } } };
    fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify(duo));
    const d = loadBrand({ file: path.join(dir, 'brand.json') });
    const r = await renderImage(browser, d, { spec: normaliseDesign({ template: 'photo', image: 'packages/engine/design/assets/demo/scene-market.jpg', headline: 'Saving together, *every week.*' }), sizeName: 'feed', outFile: path.join(dir, 'duo.png') }, { tmpDir: path.join(dir, 'tmp') });
    // the photo checks still run on the treated pixels: the scrim is raised as far as the text needs
    assert.ok(r.ratios.headline >= d.photo.minContrast.headline, JSON.stringify(r));
    assert.ok(!r.warnings.some((w) => /low contrast/.test(w)), r.warnings.join('\n'));
  } finally {
    browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('real render: a treated poster photo lends the page the colour it is drawn in, and the type is picked against that', { skip: chrome ? false : 'Google Chrome not found' }, async () => {
  const dir = path.join(ROOT, 'out', 'test-style-treated');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const JAR = 'packages/engine/design/assets/demo/object-jar.jpg', MARKET = 'packages/engine/design/assets/demo/scene-market.jpg';
  // Each treatment with the demo brand's colours, and the colour Chrome draws the jar's plain background (rgb(243, 239, 230)) in.
  // The demo's overlay at its default strength (its primary at 0.5) is a mid blue that neither ink nor white type reaches 7:1 on,
  // so that page keeps its ground and the photo is a band; a lighter overlay becomes the page.
  const runs = [
    { t: 'none', photo: { treatment: 'none' }, drawn: [243, 239, 230], scene: 'band' },
    { t: 'tint', photo: { treatment: 'tint' }, drawn: [238, 239, 243], scene: 'band' },
    // in grey the market's sky and its buildings near the top are one tone, so as drawn its edge is plain
    { t: 'duotone', photo: { treatment: 'duotone' }, drawn: [248, 248, 248], scene: 'page' },
    { t: 'overlay', photo: { treatment: 'overlay' }, drawn: [145, 165, 207], low: true, scene: 'band' },
    { t: 'overlay', photo: { treatment: 'overlay', strength: 0.3 }, drawn: [184, 195, 216], scene: 'band' },
  ];
  const browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(ROOT, 'out', 'design.lock') });
  try {
    for (const [n, { t, photo, drawn, low, scene }] of runs.entries()) {
      fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify({ ...RAW, style: { photo } }));
      const b = loadBrand({ file: path.join(dir, 'brand.json') });
      const as = t === 'none' ? '' : ` with the ${t} treatment`;
      const cases = [
        [{ template: 'object', headline: 'Every euro, *on record.*', sub: 'One place for savings.', image: JAR, ground: 'photo' }, 600],
        [{ template: 'number', big: '*€* 14.8M+', line: 'processed', stats: ['3,900+|members saving daily', '400+|organisations registered'], image: JAR, ground: 'photo' }, 616],
      ];
      for (const [d, top] of cases) {
        const out = path.join(dir, `${n}-${d.template}.png`);
        const r = await renderImage(browser, b, { spec: normaliseDesign(d), sizeName: 'feed', outFile: out }, { tmpDir: path.join(dir, 'tmp') });
        const what = `${t} ${JSON.stringify(photo)} ${d.template}`;
        const rgb = `rgb(${drawn.join(', ')})`;
        const note = low ? `photo background is plain (${rgb}${as}), but no type colour reaches 7:1 on it (at best 6.4:1): the photo is placed as a full-bleed band on the ground` : `photo background is plain (${rgb}${as}, drift 0.0): the page takes its colour and the photo runs into it`;
        assert.ok(r.notes.includes(note), `${what}: ${r.notes.join('\n')}`);
        // every check passed on the page as drawn (no warning: contrast, fit)
        assert.deepEqual(r.warnings, [], what);
        for (const k of ['headline', 'sub', 'label']) if (r.ratios[k] !== undefined) assert.ok(r.ratios[k] >= b.contrast[k], `${what} ${k} ${r.ratios[k]}`);
        // the photo is drawn in that colour just under its top edge; the page above it is the same colour (no seam), or, when the
        // type could not be read on it, the page's own ground (cool for a photo ground without a series)
        const png = decodePng(fs.readFileSync(out)), at = (x, y) => [...png.data.slice((y * png.w + x) * 4, (y * png.w + x) * 4 + 3)];
        const ground = [1, 3, 5].map((k) => parseInt(b.grounds.cool.slice(k, k + 2), 16));
        for (const x of [40, 540, 1040]) {
          const page = at(x, top - 12), pic = at(x, top + 12), want = low ? ground : drawn;
          const near = (u, v) => u.every((c, j) => Math.abs(c - v[j]) <= 2);
          assert.ok(near(pic, drawn) && near(page, want), `${what} at x ${x}: page ${page} (want ${want}), photo ${pic} (want ${drawn})`);
        }
      }
      // a scene judged as it is drawn: still a band under tint and overlay; under duotone the market's grey edge is plain
      const r = await renderImage(browser, b, { spec: normaliseDesign({ template: 'object', headline: 'Save *together.*', image: MARKET, ground: 'photo' }), sizeName: 'feed', outFile: path.join(dir, `${n}-scene.png`) }, { tmpDir: path.join(dir, 'tmp') });
      assert.ok(r.notes.some((x) => x.startsWith(scene === 'band' ? `photo background is not plain${as} (` : `photo background is plain (`) && x.includes(as)), `${t} scene: ${r.notes.join('\n')}`);
      assert.deepEqual(r.warnings, [], `${t} scene`);
    }
  } finally {
    browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('real render: the poster logo is measured, so a wordmark on a surface it was not drawn for gives a contrast warning', { skip: chrome ? false : 'Google Chrome not found' }, async () => {
  const dir = path.join(ROOT, 'out', 'test-style-logo');
  fs.rmSync(dir, { recursive: true, force: true });
  // A page made for this test: the real bar (white wordmark, drawn for the dark ground) over a pale box, or on the ground itself.
  TEMPLATE_FNS['test-logo-surface'] = (spec, ctx) => ({
    body: `<div class="cv poster" style="--bg:var(--g-deep)">${spec.pale ? '<div class="abs" style="left:0;top:0;width:1080px;height:220px;background:var(--g-warm)"></div>' : ''}${bar(ctx, true, { right: '' })}<div class="abs" id="txt" style="left:80px;top:400px;width:920px;text-align:left"><div class="ps-h" data-role="headline" style="font-size:${hs(104)}">Save together.</div></div></div>`,
    bodyClass: 'acc-colour dark', bodyAttrs: 'data-editorial="1"',
  });
  const browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(ROOT, 'out', 'design.lock') });
  try {
    const run = (pale) => renderImage(browser, brand, { spec: { template: 'test-logo-surface', pale }, sizeName: 'feed', outFile: path.join(dir, `${pale ? 'pale' : 'ground'}.png`) }, { tmpDir: path.join(dir, 'tmp') });
    const pale = await run(true);
    assert.ok(pale.warnings.some((w) => /^low contrast: the logo text is \d+\.\d:1 against the surface behind it \(needs 4\.5:1\)$/.test(w)), pale.warnings.join('\n'));
    assert.ok(pale.ratios.label < 2, JSON.stringify(pale.ratios));
    // on the ground it was drawn for it passes, and it never stops a render (no fit problem for the logo)
    const ground = await run(false);
    assert.deepEqual(ground.warnings, []);
    assert.ok(ground.ratios.label >= brand.contrast.label, JSON.stringify(ground.ratios));
  } finally {
    delete TEMPLATE_FNS['test-logo-surface'];
    browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('real render: text on the light panel of a dark editorial page, and the logo at the top, pass every check', { skip: chrome ? false : 'Google Chrome not found' }, async () => {
  const dir = path.join(ROOT, 'out', 'test-style-surface');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify({ ...RAW, style: { logo: 'top-left' } }));
  const top = loadBrand({ file: path.join(dir, 'brand.json') });
  const scene = 'packages/engine/design/assets/demo/scene-market.jpg';
  const dark = [
    { template: 'text', headline: 'Every deposit, *on record.*', sub: 'One place for the group\'s savings.', ground: 'dark' },
    { template: 'ledger', headline: 'The week, *on one page.*', sub: 'Every deposit in a row.', ground: 'dark', ...LEDGER },
    { template: 'photo-story', layout: 'print', headline: 'Market day, *together.*', image: scene, ground: 'dark' },
  ];
  const browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(ROOT, 'out', 'design.lock') });
  try {
    let i = 0;
    const run = (b, d, sizeName = 'feed') => renderImage(browser, b, { spec: normaliseDesign(d), sizeName, outFile: path.join(dir, `${i++}.png`) }, { tmpDir: path.join(dir, 'tmp') });
    // the sub line, the website and a ledger's notes on the light panel meet their contrast targets; so does the running head
    // when the logo at the top sends it down onto the panel, and the text keeps clear of the footer at the top
    for (const b of [brand, top]) for (const d of dark) assert.deepEqual((await run(b, d)).warnings, [], `${b.style.logo} ${d.template}`);
    // the photo post with its footer at the top, the text at the bottom where the footer was
    for (const size of ['feed', 'story']) assert.deepEqual((await run(top, { template: 'photo', headline: 'Market day, *every week.*', sub: 'The collector records each deposit.', image: scene, textAt: 'bottom' }, size)).warnings, [], size);
  } finally {
    browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
