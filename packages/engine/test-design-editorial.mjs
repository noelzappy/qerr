// node --test   (the editorial templates: validation, brand tokens, hostile values, the carousel PDF, one real render per template)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBrand, brandCssVars, dropShadowCss, shadowCss, shadowProblems, validateBrand, loadSeries } from './lib/design/brand.mjs';
import { hasAlpha } from './lib/design/assets.mjs';
import { contrastRatio, luminance, webpSize } from './lib/design/checks.mjs';
import { ENGINE_DIR, ROOT, brandFile } from './lib/core.mjs';
import { findChrome } from './lib/design/chrome.mjs';
import { findLayoutProblems, explainProblems } from './lib/design/checks.mjs';
import { ledgerLayout, passbookGeometry } from './lib/design/figures.mjs';
import { pdfPages, snapMediaBox } from './lib/design/pdf.mjs';
import { NETWORKS, PAGE_TEMPLATES, validateDesign } from './lib/design/spec.mjs';
import { NETWORKS as ROUTED } from './lib/networks.mjs';
import { imageSize } from './lib/design/checks.mjs';
import { pngBytes } from './testlib/png.mjs';
import { renderSpec } from './testlib/render.mjs';
import { TEMPLATE_FNS } from './lib/design/builtin-layouts.mjs';

const SERIES = loadSeries();
const v = (d, where = 'p') => validateDesign(d, where, { series: SERIES });
const has = (errs, frag) => errs.some((e) => e.includes(frag));
const ledger = () => ({ template: 'ledger', headline: 'h', columns: [{ label: 'Day' }, { label: 'Amount', align: 'end' }], rows: [['01', '10.00'], ['02', '20.00']], mark: [{ row: 1, col: 1 }], notes: ['a note'] });
const passbook = () => ({ template: 'passbook', headline: 'h', days: 31, ticked: 17, today: 18, tick: 'gold', register: { title: 'Where', rows: [['a', '1'], ['b', '-']], mark: 0 } });

test('x is a network of the design spec as it is of the scheduler', () => {
  assert.ok(NETWORKS.includes('x'));
  assert.deepEqual(NETWORKS, ROUTED);
});

test('every editorial template: a good spec passes, and each field names its problem', () => {
  const good = {
    cover: { template: 'cover', headline: 'h', image: 'a.jpg', sub: 's', series: 'explainers', focal: '60% 40%', zoom: 1.2 },
    text: { template: 'text', headline: 'h', artefact: { type: 'register', title: 'T', rows: [['a', '1']] } },
    ledger: ledger(), passbook: passbook(),
    'myth-fact': { template: 'myth-fact', myth: 'm', factLead: 'f', fact: 'x', label: 'Myth vs fact' },
    stats: { template: 'stats', big: '14.8M+', line: 'l', stats: ['1|a', '2|b', '3|c'], image: 'a.jpg' },
    screen: { template: 'screen', headline: 'h', image: 's.png', beside: { days: 30, ticked: 4 } },
    'photo-story': { template: 'photo-story', headline: 'h', image: 'a.jpg', layout: 'print' },
    closing: { template: 'closing' },
    object: { template: 'object', headline: 'h', image: 'a.jpg' },
    number: { template: 'number', big: '1' },
    product: { template: 'product', headline: 'h', image: 'p.webp' },
  };
  for (const [k, d] of Object.entries(good)) assert.deepEqual(v(d), [], k);
  assert.deepEqual(Object.keys(good).sort(), [...PAGE_TEMPLATES].sort());
  assert.deepEqual(v({ template: 'screen', device: 'desktop', headline: 'h', image: 'd.webp', title: 'Passbooks', tilt: true, region: 0.75, framed: false }), []);
  assert.deepEqual(v({ template: 'screen', headline: 'h', image: 'p.webp', framed: true }), []);
  const bad = [
    [{ template: 'cover', headline: 'h' }, 'image is required'], [{ template: 'cover', image: 'a.jpg' }, 'headline is required'],
    [{ template: 'cover', headline: 'h', image: 'a.jpg', zoom: 4 }, 'zoom must be'], [{ template: 'cover', headline: 'h', image: 'a.jpg', focal: 'x' }, 'focal must look like'],
    [{ template: 'text', headline: 'h', artefact: { type: 'chart' } }, 'artefact.type'], [{ template: 'text', headline: 'h', caption: 'c' }, 'caption is no longer used'],
    [{ template: 'text', headline: 'h', size: 99 }, 'size must be one of'], [{ template: 'cover', headline: 'h', image: 'a.jpg', size: 84 }, 'size is not used'],
    [{ ...ledger(), columns: [{ label: 'a' }] }, 'columns needs 2 to 5'], [{ ...ledger(), columns: Array(6).fill({ label: 'a' }) }, 'columns needs 2 to 5'],
    [{ ...ledger(), rows: [] }, 'rows needs 1 to 10'], [{ ...ledger(), rows: Array(11).fill(['a', 'b']) }, 'rows needs 1 to 10'],
    [{ ...ledger(), rows: [['only one']] }, 'one per column'], [{ ...ledger(), rows: [['x'.repeat(17), 'b']] }, 'rows[0][0] is 17 characters'],
    [{ ...ledger(), columns: [{ label: 'a', align: 'middle' }, { label: 'b' }] }, 'align must be'], [{ ...ledger(), mark: [{ row: 5, col: 0 }] }, 'mark[0]'],
    [{ ...ledger(), notes: ['a', 'b', 'c'] }, 'notes must be a list of up to 2'], [{ ...ledger(), notes: ['x'.repeat(61)] }, 'notes[0]'],
    [{ ...ledger(), rotate: 2 }, 'rotate is no longer used'], [{ ...ledger(), rotate: '0.5' }, 'rotate is no longer used'],
    [{ ...ledger(), columns: Array(5).fill({ label: 'x'.repeat(16) }), rows: [Array(5).fill('y'.repeat(16))], mark: [] }, 'too wide for the sheet'],
    [{ ...passbook(), days: 27 }, 'days must be a whole number from 28 to 31'], [{ ...passbook(), ticked: 32 }, 'ticked must be'], [{ ...passbook(), today: 0 }, 'today must be'],
    [{ ...passbook(), tick: 'red' }, 'tick must be one of'], [{ ...passbook(), register: { rows: [] } }, 'rows needs 1 to 6'], [{ ...passbook(), register: { rows: [['a']] } }, 'must be ["label", "value"]'],
    [{ ...passbook(), register: { rows: Array(7).fill(['a', 'b']) } }, 'rows needs 1 to 6'], [{ ...passbook(), register: { rows: [['a', 'b']], mark: 3 } }, 'mark must be a row number'],
    [{ template: 'myth-fact', myth: 'm' }, 'factLead is required'], [{ template: 'myth-fact', factLead: 'f' }, 'myth is required'],
    [{ template: 'stats', stats: ['1|a'] }, 'big is required'], [{ template: 'stats', big: '1', stats: ['1|a', '2|b', '3|c', '4|d'] }, 'most is 3'], [{ template: 'stats', big: 'x'.repeat(41) }, 'big is 41'],
    [{ template: 'screen', headline: 'h' }, 'image is required'], [{ template: 'screen', headline: 'h', image: 's.png', statusFill: '#F0F0F4' }, 'statusFill is no longer used'],
    [{ template: 'screen', headline: 'h', image: 's.png', framed: false }, 'use a pre-framed phone capture'], [{ template: 'screen', headline: 'h', image: 's.png', device: 'tablet' }, 'device must be one of'],
    [{ template: 'screen', headline: 'h', image: 's.png', framed: 'yes' }, 'framed must be true or false'], [{ template: 'screen', headline: 'h', image: 's.png', title: 'Passbooks' }, 'title is only used with "device": "desktop"'],
    [{ template: 'screen', headline: 'h', image: 's.png', device: 'desktop', region: 0.2 }, 'region must be a number from 0.4 to 1'], [{ template: 'screen', headline: 'h', image: 's.png', device: 'desktop', tilt: 'yes' }, 'tilt must be true or false'],
    [{ template: 'screen', headline: 'h', image: 's.png', device: 'desktop', beside: { days: 31 } }, 'beside is only used with a phone'], [{ template: 'screen', headline: 'h', image: 's.png', device: 'desktop', title: 'x'.repeat(41) }, 'title is 41'],
    [{ template: 'screen', headline: 'h', image: 's.png', caption: 'Fig. x' }, 'caption is no longer used'], [{ template: 'screen', headline: 'h', image: 's.png', beside: { register: { rows: [['a', 'b']] } } }, 'register is not used'],
    [{ template: 'photo-story', headline: 'h', image: 'a.jpg', layout: 'wall' }, 'layout must be'], [{ template: 'photo-story', headline: 'h' }, 'image is required'],
    [{ template: 'closing', line: 'x'.repeat(61) }, 'line is 61'],
    [{ template: 'text', headline: 'h', series: 'nope' }, 'not in brand.json'], [{ template: 'text', headline: 'h', series: 'Bad Key' }, 'series must be a key'],
    [{ template: 'text', headline: 'h', ground: 'red' }, 'ground must be one of'], [{ template: 'text', headline: 'h', ground: 'paper' }, 'ground must be one of light, soft, cool, warm, dark, deep (the older names white, tint, mint, gold-pale, ink also work)'], [{ template: 'text', headline: 'h', accent: 'bold' }, 'accent must be one of'],
    [{ template: 'text', headline: 'h', label: 'x'.repeat(41) }, 'label is 41'], [{ template: 'text', headline: 'h', label: 'a\nb' }, 'one line'],
  ];
  for (const [d, frag] of bad) assert.ok(has(v(d), frag), `${JSON.stringify(d).slice(0, 80)} -> ${frag} (got ${v(d).join(' | ')})`);
});

test('the editorial templates are feed only, and say so', () => {
  for (const t of PAGE_TEMPLATES) {
    const d = { template: t, headline: 'h', image: 'a.jpg', myth: 'm', factLead: 'f', big: '1', ...(t === 'ledger' ? ledger() : {}), sizes: ['wide'] };
    assert.ok(has(v(d), 'is made for the feed format (1080x1350) only'), t);
  }
  assert.ok(has(v({ template: 'carousel', sizes: ['story'], pages: [{ template: 'text', headline: 'a' }, { template: 'closing' }] }), 'feed format'));
  assert.deepEqual(v({ template: 'text', headline: 'h', sizes: ['feed'] }), []);
  assert.deepEqual(v({ template: 'photo', headline: 'h', image: 'a.jpg', sizes: ['feed', 'wide', 'story'] }), []);
});

test('carousel: pages 2 to 10 of any editorial template, a carousel-level series, no old slides', () => {
  const page = { template: 'text', headline: 'a' };
  assert.deepEqual(v({ template: 'carousel', series: 'explainers', label: 'Own', pages: [page, { template: 'closing' }] }), []);
  assert.ok(has(v({ template: 'carousel', pages: [page] }), '2 to 10'));
  assert.ok(has(v({ template: 'carousel', pages: Array(11).fill(page) }), '2 to 10'));
  assert.ok(has(v({ template: 'carousel', pages: [page, { template: 'photo', headline: 'x', image: 'a.jpg' }] }), 'page 2: template must be one of'));
  assert.ok(has(v({ template: 'carousel', series: 'nope', pages: [page, page] }), 'not in brand.json'));
  assert.ok(has(v({ template: 'carousel', slides: [page, page], pages: [page, page] }), 'takes "pages"'));
  assert.ok(has(v({ template: 'card', headline: 'x' }), 'template must be one of'));
});

const HOSTILE = ['<script>window.__pwn=1</script>', '"><img src=x onerror=alert(1)>', '</svg><script>1</script>', 'javascript:alert(1)', 'red;background:url(http://evil/x)', '*<b>x</b>*', '**', '* *', 'x'.repeat(5000)];
test('hostile values in ledger, register, series, label, caption and every other field are refused or kept as text', () => {
  for (const h of HOSTILE) {
    const errs = [
      ...v({ ...ledger(), columns: [{ label: h }, { label: 'b' }] }), ...v({ ...ledger(), rows: [[h, 'b']] }), ...v({ ...ledger(), notes: [h] }), ...v({ ...ledger(), rotate: h }), ...v({ ...ledger(), mark: [{ row: h, col: 0 }] }),
      ...v({ ...passbook(), register: { rows: [[h, 'b']] } }), ...v({ ...passbook(), days: h }), ...v({ ...passbook(), tick: h }),
      ...v({ template: 'text', headline: 'h', series: h }), ...v({ template: 'text', headline: 'h', ground: h }), ...v({ template: 'text', headline: 'h', accent: h }),
      ...v({ template: 'screen', headline: 'h', image: 's.png', statusFill: h }), ...v({ template: 'screen', headline: 'h', image: 's.png', caption: h, beside: { days: h } }),
    ];
    // every probe above must be refused, except texts that are plainly short, one line and harmless as text
    const textOnly = ['*<b>x</b>*', '**', '* *'].includes(h);
    if (!textOnly) assert.ok(errs.length >= 10, `${h.slice(0, 30)}: ${errs.length}`);
  }
  // a long headline is refused by the common limit, and a series label that is not a brand key never reaches a page
  assert.ok(has(v({ template: 'text', headline: 'x'.repeat(5000) }), 'the most the tool accepts is 220'));
});

test('brand file: shadows, surfaces, grounds, radii, window chrome, series and fonts are validated, and the CSS is built from the numbers', () => {
  const good = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
  assert.deepEqual(validateBrand(good), []);
  const mod = (f) => { const b = structuredClone(good); f(b); return validateBrand(b); };
  assert.ok(mod((b) => { b.shadows.card[0].x = 'url(x)'; }).some((e) => e.includes('shadows.card[0].x must be a number')));
  assert.ok(mod((b) => { b.shadows.card[1].blur = -1; }).some((e) => e.includes('blur must be a number from 0 to 300')));
  assert.ok(mod((b) => { b.shadows.card[1].blur = 1e9; }).some((e) => e.includes('blur')));
  assert.ok(mod((b) => { b.shadows.window[0].color = 'red'; }).some((e) => e.includes('color must be a #rrggbb')));
  assert.ok(mod((b) => { b.shadows.window[0].alpha = 2; }).some((e) => e.includes('alpha must be a number from 0 to 1')));
  assert.ok(mod((b) => { b.shadows.card[0].inset = 'yes'; }).some((e) => e.includes('inset')));
  assert.ok(mod((b) => { b.shadows.card = []; }).some((e) => e.includes('shadows.card must be a list')));
  assert.ok(mod((b) => { delete b.shadows.phone; }).some((e) => e.includes('shadows.phone')));
  assert.ok(mod((b) => { b.shadows.phone[0].spread = 4; }).some((e) => e.includes('drop shadow: spread must be 0')));
  assert.ok(mod((b) => { b.surfaces.panel = 'brown'; }).some((e) => e.includes('surfaces.panel')));
  assert.ok(mod((b) => { b.surfaces.line.alpha = -1; }).some((e) => e.includes('surfaces.line.alpha')));
  assert.ok(mod((b) => { b.grounds.light = 'url(x)'; }).some((e) => e.includes('grounds.light')));
  // the older ground names are read as the new ones, but never both for one ground, and every ground is needed
  assert.ok(mod((b) => { b.grounds.white = '#FFFFFF'; }).some((e) => e.includes('grounds.light and grounds.white are the same ground')));
  assert.deepEqual(mod((b) => { b.grounds = { white: '#FFFFFF', tint: '#F5F7FB', mint: '#E8EEF9', 'gold-pale': '#FCEBE4', ink: '#14213D', deep: '#1C2D52' }; }), []);
  assert.ok(mod((b) => { delete b.grounds.cool; }).some((e) => e.includes('grounds.cool must be a #rrggbb colour (or give it under its older name mint)')));
  assert.ok(mod((b) => { b.grounds.white = 'url(x)'; delete b.grounds.light; }).some((e) => e.includes('grounds.white must be a #rrggbb')));
  assert.ok(mod((b) => { b.grounds.paper = '#F4F1EA'; }).some((e) => e.includes('unknown entries')));
  assert.ok(mod((b) => { b.accents.primary = 'green'; }).some((e) => e.includes('accents.primary')));
  assert.ok(mod((b) => { b.radius.card = '8px;x'; }).some((e) => e.includes('radius.card')));
  assert.ok(mod((b) => { b.scale = 0; }).some((e) => e.includes('scale must be a number')));
  assert.ok(mod((b) => { b.window.bar = 'x'; }).some((e) => e.includes('window.bar')));
  assert.ok(mod((b) => { b.window.tilt.rotateY = 90; }).some((e) => e.includes('window.tilt.rotateY')));
  assert.ok(mod((b) => { b.phone.refWidth = -1; }).some((e) => e.includes('phone.refWidth')));
  assert.ok(mod((b) => { b.series['bad key'] = { name: 'x', ground: 'white', accent: 'colour' }; }).some((e) => e.includes('series key')));
  assert.ok(mod((b) => { b.series['explainers'].ground = 'paper'; }).some((e) => e.includes('series.explainers.ground')));
  assert.ok(mod((b) => { b.series['explainers'].ground = '__proto__'; }).some((e) => e.includes('series.explainers.ground')));
  assert.deepEqual(mod((b) => { b.series['explainers'].ground = 'gold-pale'; }), []);
  assert.ok(mod((b) => { b.series['explainers'].accent = 'bold'; }).some((e) => e.includes('series.explainers.accent')));
  assert.ok(mod((b) => { b.series['explainers'].name = 'a\nb'; }).some((e) => e.includes('series.explainers.name')));
  assert.ok(mod((b) => { b.font.files[0].range = 'U+0000;}</style>'; }).some((e) => e.includes('range')));
  assert.ok(mod((b) => { b.font.files[0].file = 'x.ttf'; }).some((e) => e.includes('.woff2')));
  assert.ok(mod((b) => { b.contrast.sub = 0; }).some((e) => e.includes('contrast.sub')));
  assert.deepEqual(shadowProblems({ x: 1, y: 2, blur: 3, spread: -4, color: '#14213D', alpha: 0.3 }, 's'), []);
  assert.equal(shadowCss([{ x: 1, y: 2, blur: 3, spread: -4, color: '#14213D', alpha: 0.3 }, { x: 0, y: 0, blur: 0, spread: 1.5, color: '#FFFFFF', alpha: 0.1, inset: true }]), '1px 2px 3px -4px rgba(20,33,61,0.3),inset 0px 0px 0px 1.5px rgba(255,255,255,0.1)');
  assert.equal(shadowCss([{ x: 0, y: 13, blur: 27, spread: -5, color: '#14213D', alpha: 0.18 }], 2), '0px 26px 54px -10px rgba(20,33,61,0.18)');
  assert.equal(dropShadowCss([{ x: 0, y: 24, blur: 32, spread: 0, color: '#14213D', alpha: 0.22 }], 1.5), 'drop-shadow(0px 36px 48px rgba(20,33,61,0.22))');
  const brand = loadBrand();
  const vars = brandCssVars(brand);
  // the website's own tokens (acmesavings.example globals.css), the card shadow drawn at the brand scale (2 post px per website px)
  for (const t of ['--g-light:#FFFFFF', '--g-soft:#F5F7FB', '--g-dark:#14213D', '--ink:#14213D', '--body:#3C4A63', '--muted:#5B6880', '--primary:#2F5BB7', '--gold:#F0805F', '--gold-deep:#A8401F',
    '--panel:#F5F7FB', '--card:#FFFFFF', '--line:rgba(20,33,61,0.08)', '--r-card:16px', '--shadow-card:0px 26px 54px -10px rgba(20,33,61,0.18),0px 16px 32px -16px rgba(20,33,61,0.22)']) assert.ok(vars.includes(t), t);
  assert.deepEqual(brand.shadows.window.map((l) => [l.y, l.blur, l.spread, l.alpha]), [[30, 60, -12, 0.25], [18, 36, -18, 0.3]]);
  assert.deepEqual([brand.radius.card, brand.radius.device, brand.window.bar, brand.window.dot], [8, 12, 32, 8]);
  // nothing of the old warm paper look is left: no paper or stone ground, no table, no grain, no warm shadow colour
  assert.ok(!/paper|stone|table|grain|#4A3618|#D9D1C2|#F4F1EA/i.test(vars + brand.css.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(SERIES.includes('explainers') && SERIES.includes('community'));
});

// Contrast of every text colour the stylesheet puts on each ground, against the brand's targets.
test('contrast on the new grounds: body, labels and accents on white and tint, light text on ink', () => {
  const brand = loadBrand();
  const L = (hex) => luminance(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
  const ratio = (a, b) => contrastRatio(L(a), L(b));
  const C = brand.contrast, t = brand.text, a = brand.accents;
  for (const ground of [brand.grounds.light, brand.grounds.soft, brand.surfaces.panel, brand.surfaces.card]) {
    assert.ok(ratio(t.ink, ground) >= C.headline, `ink on ${ground}`);
    assert.ok(ratio(t.body, ground) >= C.sub, `body on ${ground}: ${ratio(t.body, ground).toFixed(2)}`);
    assert.ok(ratio(t.muted, ground) >= C.label, `muted labels on ${ground}: ${ratio(t.muted, ground).toFixed(2)}`);
    assert.ok(ratio(a.primary, ground) >= C.accent, `primary accent on ${ground}`);
    assert.ok(ratio(a.goldDeep, ground) >= C.accent, `gold-deep on ${ground}`);
    assert.ok(ratio(a.gold, ground) < C.accent, 'the logo gold is too light for text on a light ground (it is only used for marks there)');
  }
  assert.ok(ratio(t.inverse, brand.grounds.dark) >= C.headline);
  assert.ok(ratio(t.invBody, brand.grounds.dark) >= C.sub);
  assert.ok(ratio(a.gold, brand.grounds.dark) >= C.accent);
  // the stylesheet never colours text gold except on the dark page, a dark panel (.on-dark) and photo posts
  const css = brand.css;
  assert.ok(!/(^|\n)\.acc-colour(?![^{]*\.on-dark)[^{]*\{[^}]*--gold/.test(css) && /\.dark\.acc-colour \.h em\{color:var\(--gold\)/.test(css));
  assert.ok(/\n\.acc-colour \.on-dark \.h em,\.acc-colour \.h\.on-dark em\{color:var\(--gold\)\}/.test(css));
  // the two-tone headline: the continuation in muted grey (light grounds) or the muted light grey (ink) reaches the accent target
  for (const ground of [brand.grounds.light, brand.grounds.soft]) assert.ok(ratio(t.muted, ground) >= C.accent, `muted continuation on ${ground}`);
  assert.ok(ratio(t.mutedInv, brand.grounds.dark) >= C.accent, 'muted light grey on the dark ground');
  assert.ok(/\.acc-muted \.h em\{color:var\(--muted\)\}/.test(css) && /\.dark\.acc-muted \.h em\{color:var\(--muted-inv\)\}/.test(css));
});

test('screens: alpha and size are read from the bytes of PNG and WebP files', () => {
  const rgb = pngBytes(4, 4, () => [255, 255, 255]), rgba = pngBytes(4, 4, () => [255, 255, 255, 0], { alpha: true });
  assert.equal(hasAlpha(rgb), false);
  assert.equal(hasAlpha(rgba), true);
  const riff = (chunk, body) => { const b = Buffer.alloc(30); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(22, 4); b.write('WEBP', 8, 'latin1'); b.write(chunk, 12, 'latin1'); body.copy(b, 16); return b; };
  const vp8x = (flags, w, h) => { const d = Buffer.alloc(14); d.writeUInt32LE(10, 0); d[4] = flags; d.writeUIntLE(w - 1, 8, 3); d.writeUIntLE(h - 1, 11, 3); return riff('VP8X', d); };
  assert.equal(hasAlpha(vp8x(0x10, 660, 1354)), true);
  assert.equal(hasAlpha(vp8x(0x00, 1640, 1025)), false);
  assert.deepEqual(webpSize(vp8x(0x10, 660, 1354)), { w: 660, h: 1354 });
  const vp8l = (alpha, w, h) => { const d = Buffer.alloc(14); d.writeUInt32LE(5, 0); d[4] = 0x2f; d.writeUInt32LE(((w - 1) | ((h - 1) << 14) | ((alpha ? 1 : 0) << 28)) >>> 0, 5); return riff('VP8L', d); };
  assert.equal(hasAlpha(vp8l(true, 660, 1354)), true);
  assert.equal(hasAlpha(vp8l(false, 660, 1354)), false);
  assert.deepEqual(webpSize(vp8l(true, 660, 1354)), { w: 660, h: 1354 });
  assert.equal(hasAlpha(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), false);
});

test('figures: ledger layout fits or says it does not; passbook geometry follows the month', () => {
  const cols = [{ label: 'Day', align: 'start' }, { label: 'Amount', align: 'end' }];
  const L = ledgerLayout(cols, [['01', '10.00']]);
  assert.ok(L.ok && L.fs === 22 && L.cols[0].x === 0 && L.cols[1].anchor === 'end' && Math.round(L.cols[1].x) === 860);
  assert.equal(ledgerLayout(cols, Array(10).fill(['1', '2'])).pitch, 40);
  assert.equal(ledgerLayout(cols, [['1', '2']]).pitch, 56);
  const wide = ledgerLayout(Array(5).fill({ label: 'x'.repeat(16) }), [Array(5).fill('y'.repeat(16))]);
  assert.equal(wide.ok, false);
  assert.equal(passbookGeometry(350, 480, 28).rows, 4);
  assert.equal(passbookGeometry(350, 480, 31).rows, 5);
});

test('layout problems for objects, the panel and body text', () => {
  const S = { pad: 62, top: 46 };
  const base = { W: 1080, H: 1350, avoid: [], imgs: [], roles: [], footer: { x0: 70, y0: 1260, x1: 1010, y1: 1294 }, panel: { x0: 0, y0: 540, x1: 1080, y1: 1350 }, logo: { x0: 70, y0: 1262, x1: 220, y1: 1294 } };
  const o = (x0, y0, x1, y1, extra = {}) => ({ x0, y0, x1, y1, ...extra });
  assert.deepEqual(findLayoutProblems({ ...base, objs: [o(70, 590, 480, 1130), o(556, 620, 1000, 950)] }, S), []);
  const kinds = (m) => findLayoutProblems(m, S).map((p) => p.kind);
  assert.ok(kinds({ ...base, objs: [o(70, 590, 480, 1130), o(400, 620, 1000, 950)] }).includes('objoverlap'));
  assert.ok(kinds({ ...base, objs: [o(-20, 590, 480, 1130)] }).includes('objout'));
  assert.ok(kinds({ ...base, objs: [o(70, 590, 480, 1300)] }).includes('objfoot'));
  assert.ok(kinds({ ...base, objs: [o(560, 600, 1010, 1500, { bleed: true })] }).length === 0); // a phone runs off the bottom
  assert.ok(kinds({ ...base, objs: [o(60, 1100, 480, 1250, { bleed: true })] }).includes('objlogo') === false);
  assert.ok(kinds({ ...base, objs: [o(60, 1200, 480, 1500, { bleed: true })] }).includes('objlogo'));
  assert.ok(kinds({ ...base, objs: [o(70, 400, 480, 900)] }).includes('objpanel'));
  const role = (r, rects, extra = {}) => ({ role: r, rects, color: 'rgb(0,0,0)', overX: 0, text: `${r} text`, ...extra });
  const straddle = { ...base, objs: [], roles: [role('headline', [{ x0: 70, y0: 400, x1: 900, y1: 700 }])] };
  assert.deepEqual(kinds(straddle), ['panel']);
  assert.deepEqual(kinds({ ...base, objs: [], roles: [role('sub', [{ x0: 70, y0: 400, x1: 900, y1: 700 }], { onpanel: true })] }), []);
  assert.ok(kinds({ ...base, objs: [], roles: [role('sub', [{ x0: 70, y0: 300, x1: 900, y1: 340 }], { size: 28, min: 30 })] }).includes('small'));
  // text inside an object is exempt from the picture rule; text on another object is not
  const ob = o(70, 590, 480, 1130);
  const inside = role('artbody', [{ x0: 100, y0: 700, x1: 300, y1: 730 }], { inAvoid: [0] });
  assert.deepEqual(kinds({ ...base, objs: [ob], avoid: [{ ...ob, id: 0 }], roles: [inside] }), []);
  assert.ok(kinds({ ...base, objs: [ob], avoid: [{ ...ob, id: 0 }], roles: [{ ...inside, inAvoid: [] }] }).includes('avoid'));
  assert.match(explainProblems(findLayoutProblems(straddle, S), 'feed'), /into the panel/);
  assert.match(explainProblems([{ kind: 'objoverlap', role: 'object' }], 'feed'), /two drawn objects overlap/);
});

test('PDF: pages and sizes are read from the bytes; Chrome\'s page box is corrected without moving a byte offset', () => {
  const fake = Buffer.from('%PDF-1.4\n1 0 obj\n<</Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 810 1013.03998]\n/Contents 3 0 R>>\nendobj\n<</Type /Page\n/MediaBox [0 0 810 1013.03998]\n>>\n<</Type /Pages\n/Count 2>>\n', 'latin1');
  assert.deepEqual(pdfPages(fake).map((p) => [p.width, p.height]), [[810, 1013.04], [810, 1013.04]]);
  const fixed = snapMediaBox(fake, { width: 810, height: 1012.5 });
  assert.equal(fixed.changed, 2);
  assert.equal(fixed.pdf.length, fake.length);
  assert.deepEqual(pdfPages(fixed.pdf).map((p) => [p.width, p.height]), [[810, 1012.5], [810, 1012.5]]);
  assert.equal(snapMediaBox(fixed.pdf, { width: 810, height: 1012.5 }).changed, 0); // already right
  assert.equal(snapMediaBox(Buffer.from('/MediaBox [0 0 600 800]'), { width: 810, height: 1012.5 }).changed, 0); // some other size is left alone
});

// ---- real renders (need Chrome) ----
const chrome = findChrome();
const SKIP = 'Google Chrome not found (set CHROME_PATH); skipping the real render';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-editorial-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const pic = path.join(tmp, 'pic.png');
fs.writeFileSync(pic, pngBytes(1400, 1000, (x, y) => [90 + (x % 60), 120 + (y % 50), 100]));
// A plain screenshot (no transparency), a pre-framed phone capture (a phone drawn into a transparent picture, the website's size)
// and a transparent picture whose corners are opaque (a screenshot saved with an alpha channel, not a framed phone).
const shot = path.join(tmp, 'shot.png');
fs.writeFileSync(shot, pngBytes(430, 940, (x, y) => [245, 245 - (y % 40), 240]));
const insidePhone = (x, y, w, h, m = 4, r = 80) => {
  if (x < m || y < m || x >= w - m || y >= h - m) return false;
  const cx = Math.min(Math.max(x, m + r), w - m - r), cy = Math.min(Math.max(y, m + r), h - m - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const framedPhone = path.join(tmp, 'phone.png');
fs.writeFileSync(framedPhone, pngBytes(660, 1354, (x, y) => (!insidePhone(x, y, 660, 1354) ? [0, 0, 0, 0] : insidePhone(x, y, 660, 1354, 26, 60) ? [248, 250, 249, 255] : [24, 28, 27, 255]), { alpha: true }));
const opaqueRgba = path.join(tmp, 'opaque-rgba.png');
fs.writeFileSync(opaqueRgba, pngBytes(660, 1354, (x, y) => [245, 245 - (y % 40), 240, 255], { alpha: true }));
const desk = path.join(tmp, 'desk.png');
fs.writeFileSync(desk, pngBytes(1640, 1025, (x, y) => (y < 68 ? [255, 255, 255] : [250 - (x % 30), 250, 248 - (y % 24)])));

const RENDERS = {
  cover: { template: 'cover', series: 'explainers', headline: 'Why the paper passbook *lets you down*', sub: 'Four ways a paper record fails.', image: pic },
  text: { template: 'text', headline: 'Nobody else *can see it.*', sub: 'The office only learns what was collected when the book comes back.' },
  'text artefact': { template: 'text', headline: 'A register', sub: 'One card.', artefact: { type: 'register', title: 'Where it exists', rows: [['Member', '1'], ['Office', '-']], mark: 0 } },
  ledger: { template: 'ledger', headline: 'Totals are *added by hand.*', sub: 'One slip carries forward.', columns: [{ label: 'Day' }, { label: 'Deposit', align: 'end' }, { label: 'Total', align: 'end' }], rows: Array.from({ length: 10 }, (_, i) => [String(i + 1).padStart(2, '0'), '10.00', `${(i + 1) * 10}.00`]), mark: [{ row: 3, col: 2 }], notes: ['An example', 'Amounts in €'] },
  passbook: { template: 'passbook', headline: 'A page gets lost', sub: 'The only copy.', days: 31, ticked: 17, register: { title: 'Where it exists', rows: [['Member', '1'], ['Office', '-']], mark: 0 } },
  'passbook grid': { template: 'passbook', headline: 'Every euro,\n*on record.*', days: 28, ticked: 10, today: 11, tick: 'gold' },
  'myth-fact': { template: 'myth-fact', series: 'myth-vs-fact', myth: 'Going digital means every member needs a smartphone.', factLead: 'Members keep saving *exactly as they do today.*', fact: 'The collector records each deposit.' },
  stats: { template: 'stats', series: 'the-numbers', big: '*€* 14.8M+', line: 'processed', stats: ['3,900+|members saving daily', '400+|organisations registered'], image: pic },
  'stats rows': { template: 'stats', big: '14.8M+', line: 'processed', stats: ['3,900+|members', '400+|organisations', '12|regions'] },
  screen: { template: 'screen', headline: 'A deposit, recorded *where it is collected.*', sub: 'Agents enter each deposit on their phone.', image: framedPhone },
  'screen beside': { template: 'screen', headline: 'The same passbook, *on record.*', sub: 'Each member sees their balance.', image: framedPhone, beside: { days: 31, ticked: 17 } },
  'screen desktop': { template: 'screen', device: 'desktop', headline: 'Watch the page fill *towards its target.*', sub: 'Anyone can see how far the page has come.', image: desk, title: 'Passbooks', region: 0.75 },
  'screen desktop tilt': { template: 'screen', device: 'desktop', headline: 'Every passbook, *on record.*', image: desk, tilt: true },
  panel: { template: 'photo-story', series: 'community', headline: 'Saving together has *always worked.*', sub: 'The group keeps the trust.', image: pic },
  print: { template: 'photo-story', series: 'news', layout: 'print', headline: 'Fintech Innovation of *the Year 2025.*', sub: 'Awarded to Acme Savings.', image: pic },
  closing: { template: 'closing' },
};

test('end to end: every editorial template renders at 1080x1350 with no warnings', { skip: chrome ? false : SKIP }, async () => {
  for (const [name, spec] of Object.entries(RENDERS)) {
    const r = await renderSpec(spec, path.join(tmp, `${name.replace(/ /g, '-')}.jpg`));
    assert.equal(r.code, 0, `${name}: ${r.text}`);
    assert.deepEqual(imageSize(fs.readFileSync(r.out)), { w: 1080, h: 1350 }, name);
    assert.deepEqual(r.warnings, [], `${name}: ${r.text}`);
  }
});

test('end to end: a carousel writes one image per page and a PDF of 1080x1350 px pages (810 x 1012.5 pt)', { skip: chrome ? false : SKIP }, async () => {
  const r = await renderSpec({ template: 'carousel', series: 'explainers', pages: [RENDERS.cover, RENDERS.text, RENDERS.ledger, RENDERS.closing] }, path.join(tmp, 'car', 'pass.jpg'));
  assert.equal(r.code, 0, r.text);
  for (let i = 1; i <= 4; i++) assert.ok(fs.existsSync(path.join(tmp, 'car', `pass-${i}.jpg`)), `page ${i}`);
  const pdf = fs.readFileSync(path.join(tmp, 'car', 'pass.pdf'));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const pages = pdfPages(pdf);
  assert.equal(pages.length, 4);
  for (const p of pages) { assert.equal(p.width, 810); assert.equal(p.height, 1012.5); }
  assert.deepEqual([r.pdf.file, r.pdf.pages], ['pass.pdf', 4]);
  // the folio and the swipe cue: page 1 says Swipe, later pages the website (read back from the page the template builds)
  const { TEMPLATE_FNS } = await import('./lib/design/builtin-layouts.mjs');
  const brand = loadBrand();
  // the poster closing page carries no folio or series label: a small logo and the tagline only
  const html = (n) => TEMPLATE_FNS.closing({ template: 'closing', series: 'explainers' }, { size: { name: 'feed' }, brand, counter: { n, total: 4 }, image: () => '' }).body;
  assert.ok(!html(4).includes('04 / 04') && !html(4).includes('Savings sense') && html(4).includes('class="pbar"'));
  const cover = TEMPLATE_FNS.text({ template: 'text', headline: 'x', series: 'explainers' }, { size: { name: 'feed' }, brand, counter: { n: 1, total: 4 }, image: () => '' }).body;
  assert.ok(cover.includes('Swipe →') && cover.includes('01 / 04'));
});

test('end to end: a phone screen must be a pre-framed capture; a plain screenshot is refused, never framed in CSS', { skip: chrome ? false : SKIP }, async () => {
  for (const [image, why] of [[shot, /no transparency/], [opaqueRgba, /corners are not transparent/]]) {
    fs.rmSync(path.join(tmp, 'unframed-feed.jpg'), { force: true });
    const r = await renderSpec({ template: 'screen', headline: 'A phone', image }, path.join(tmp, 'unframed.jpg'));
    assert.notEqual(r.code, 0, r.text);
    assert.match(r.text, /use a pre-framed phone capture/i);
    assert.match(r.text, why);
    assert.ok(!fs.existsSync(r.out), 'nothing is written for a refused phone');
  }
});

const pageOf = (spec, extra = {}) => TEMPLATE_FNS.screen(spec, { size: { name: 'feed' }, brand: loadBrand(), image: () => 'data:image/png;base64,AA', ...extra }).body;

test('phone: a pre-framed capture is shown as it is, with the website drop shadow scaled to its width; no bezel is drawn', () => {
  const html = pageOf({ template: 'screen', headline: 'h', image: 'p.webp' });
  const k = 470 / 300; // the phone's width on the page over the website's phone slot
  assert.ok(html.includes('class="phone"') && html.includes('data-phone') && html.includes('data-fit="width"'));
  assert.ok(html.includes(`filter:drop-shadow(0px ${+(24 * k).toFixed(3)}px ${+(32 * k).toFixed(3)}px rgba(20,33,61,0.22))`), html.match(/filter:[^"]*/)?.[0]);
  assert.ok(!/class="(device|glass|bar)"|border-radius:62px/.test(html), 'no CSS phone body, glass or window bar');
});

test('desktop window: the website DeviceFrame chrome (bar, three dots, title pill, radius, device shadow, line), scaled from its own numbers', () => {
  const size = () => ({ w: 1640, h: 1025 });
  const html = pageOf({ template: 'screen', device: 'desktop', headline: 'h', image: 'd.png', title: 'Passbooks <b>x</b>' }, { imageSize: size });
  const k = 940 / 560, n = (v) => String(Math.round(v * 100) / 100), s3 = (v) => String(+Number(v).toFixed(3)); // sizes to 0.01 px, shadows to 0.001 px
  assert.equal((html.match(/<span class="dot"/g) ?? []).length, 3);
  assert.ok(html.includes(`class="bar" style="height:${n(32 * k)}px;padding:0 ${n(12 * k)}px;gap:${n(6 * k)}px"`));
  assert.ok(html.includes(`border-radius:${n(12 * k)}px;box-shadow:0px ${s3(30 * k)}px ${s3(60 * k)}px ${s3(-12 * k)}px rgba(20,33,61,0.25),0px ${s3(18 * k)}px ${s3(36 * k)}px ${s3(-18 * k)}px rgba(20,33,61,0.3),0 0 0 `), html.match(/class="win[^>]*/)?.[0]);
  assert.ok(html.includes('rgba(20,33,61,0.08)'), 'the 1 px ring is the website line colour');
  assert.ok(html.includes('class="ttl"') && html.includes('Passbooks &lt;b&gt;x&lt;/b&gt;') && !html.includes('<b>x</b>'));
  assert.ok(!html.includes('data-phone'));
  // framed: the capture brings its own chrome, so no bar is drawn
  assert.ok(!pageOf({ template: 'screen', device: 'desktop', headline: 'h', image: 'd.png', framed: true }).includes('class="bar"'));
  // region: the top-left share of the capture, in a window of the capture's own shape
  const zoom = pageOf({ template: 'screen', device: 'desktop', headline: 'h', image: 'd.png', region: 0.75 }, { imageSize: size });
  assert.ok(zoom.includes(`class="crop" style="height:${n((940 * 1025) / 1640)}px"`) && zoom.includes(`style="width:${n(100 / 0.75)}%"`));
  // tilt: the website hero lean
  assert.ok(pageOf({ template: 'screen', device: 'desktop', headline: 'h', image: 'd.png', tilt: true }).includes(`perspective(${n(1600 * k)}px) rotateY(-8deg) rotateX(4deg)`));
});
