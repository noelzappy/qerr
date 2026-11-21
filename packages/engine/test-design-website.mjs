// node --test   (the website look of 2026-11-20: two-tone headlines, the silk ribbon, the phone glow and fade, the dot grid on ink,
// the outlined pills and the check list, the dot map of the region; no Chrome needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadBrand, loadSeries, mapProblems, validateBrand } from './lib/design/brand.mjs';
import { textFieldsOf } from './lib/design/lint.mjs';
import { buildPage } from './lib/design/page.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { normaliseDesign, validateDesign } from './lib/design/spec.mjs';
import { ENGINE_DIR, ROOT, brandFile } from './lib/core.mjs';
import { TEMPLATE_FNS } from './lib/design/builtin-layouts.mjs';
import { fmtE } from './design/templates/common.mjs';
import { dotMapSvg } from './design/templates/map.mjs';

const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const SERIES = loadSeries();
const v = (d) => validateDesign(d, 'p', { series: SERIES });
const has = (errs, frag) => errs.some((e) => e.includes(frag));
const brand = loadBrand();
const html = (spec, extra = {}) => {
  const t = TEMPLATE_FNS[spec.template](spec, { size: SIZES.feed, brand, image: () => PIXEL, imageSize: () => ({ w: 660, h: 1354 }), ...extra });
  return buildPage({ brand, size: SIZES.feed, ...t });
};
const HOSTILE = ['"><script>window.__pwn=1</script>', '<img src=x onerror="window.__pwn=2">', '</span><svg onload=window.__pwn=3>', 'url(http://evil.example/x)'];

test('two-tone headline: the continuation is escaped first, then marked; muted is the default accent of every series', () => {
  assert.equal(fmtE('Every euro, on record. *One place for savings.*'), 'Every euro, on record. <em data-role="accent">One place for savings.</em>');
  for (const h of HOSTILE) {
    const out = fmtE(`Statement. *${h}*`);
    assert.ok(!/<(script|img|svg)/i.test(out) && /^Statement\. <em data-role="accent">[^<]*<\/em>$/.test(out), out);
  }
  const page = html({ template: 'text', headline: 'Every euro, on record. *One place.*' });
  assert.match(page, /<body class="acc-muted"/);
  // the editorial series keep the website's muted continuation; the myth-vs-fact posters set theirs in colour
  assert.ok(Object.entries(brand.series).every(([k, s]) => s.accent === (k === 'myth-vs-fact' ? 'colour' : 'muted')));
  assert.equal(brand.font.headlineWeight, 400); // the website's level-2 heading: regular weight, line height 1.2, tracking -0.02em
  assert.deepEqual([brand.font.leading, brand.font.tracking], [1.2, -0.02]);
  assert.deepEqual(v({ template: 'text', headline: 'h', accent: 'muted' }), []);
});

test('pills and check lists: short one-line texts, on a phone screen only, escaped in the page', () => {
  const phone = { template: 'screen', headline: 'h', image: 'p.webp' };
  assert.deepEqual(v({ ...phone, pills: ['Read-only by design'], checks: ['Two-person approval', 'Paid only once approved'] }), []);
  const bad = [
    [{ ...phone, pills: 'Read-only' }, 'pills must be a list of 1 to 4'], [{ ...phone, pills: [] }, 'pills must be a list of 1 to 4'],
    [{ ...phone, pills: Array(5).fill('a') }, 'pills must be a list of 1 to 4'], [{ ...phone, pills: ['x'.repeat(29)] }, 'pills[0] is 29 characters'],
    [{ ...phone, pills: ['a\nb'] }, 'pills[0] must be one line'], [{ ...phone, pills: [{ toString: () => 'x' }] }, 'pills[0] must be a text'],
    [{ ...phone, checks: ['x'.repeat(49)] }, 'checks[0] is 49 characters'], [{ ...phone, checks: [''] }, 'checks[0] must not be empty'],
    [{ ...phone, device: 'desktop', checks: ['a'] }, 'checks is only used with a phone'], [{ ...phone, beside: { days: 31 }, pills: ['a'] }, 'pills is only used with a phone'],
  ];
  for (const [d, frag] of bad) assert.ok(has(v(d), frag), `${frag}: ${v(d).join(' | ')}`);
  for (const h of HOSTILE) {
    const page = html({ ...phone, pills: [h.slice(0, 28)], checks: [h.slice(0, 48)] });
    assert.equal((page.match(/<script/gi) ?? []).length, 1, h); // the runtime only
    assert.ok(!/<img src=x|<svg onload|<span[^>]* on\w+=/i.test(page), h); // the words are there, but only as text
    assert.match(page, /<span class="pill" data-role="label">[^<]*<\/span>/);
    assert.match(page, /<ul class="checks"[^>]*><li><span class="ck" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><polyline points="20 6 9 17 4 12"\/><\/svg><\/span><span data-role="sub" data-min="30">[^<]*<\/span><\/li><\/ul>/);
  }
  // they are image text, so the brand lint reads them
  assert.deepEqual(textFieldsOf(normaliseDesign({ ...phone, pills: ['Ask Acme helper'], checks: ['ok'] })).filter((f) => /pill|check/.test(f.field)).map((f) => f.field), ['pill 1', 'check 1']);
});

test('the phone glow and fade: on by default (glow) or by choice (fade), booleans only, phone only', () => {
  const phone = { template: 'screen', headline: 'h', image: 'p.webp' };
  assert.match(html(phone), /<div class="glow" aria-hidden="true" style="left:[\d.]+px;top:[\d.]+px;width:[\d.]+px;height:[\d.]+px"><\/div>/);
  assert.ok(!html({ ...phone, glow: false }).includes('class="glow"'));
  const faded = html({ ...phone, fade: true });
  assert.match(faded, /<div class="cut" style="height:\d+px"><img data-user data-phone/);
  assert.ok(faded.includes('class="glow"'));
  assert.ok(has(v({ ...phone, glow: 'yes' }), 'glow must be true or false') && has(v({ ...phone, fade: 1 }), 'fade must be true or false'));
  assert.ok(has(v({ ...phone, device: 'desktop', glow: true }), 'glow is only used with a phone'));
  assert.ok(has(v({ ...phone, fade: true, beside: { days: 31 } }), 'fade and beside cannot be used together'));
  assert.ok(/\.glow\{[^}]*filter:blur\(var\(--glow-blur\)\)/.test(brand.css) && /mask-image:linear-gradient\(to bottom,var\(--ink\) calc\(100% - var\(--fade\)\),transparent\)/.test(brand.css));
});

test('the dot grid: on every ink page unless dots is false; never on a light page', () => {
  assert.match(html({ template: 'text', headline: 'h', ground: 'ink' }), /<div class="cv dots"/);
  assert.ok(!html({ template: 'text', headline: 'h', ground: 'ink', dots: false }).includes('cv dots'));
  assert.ok(!html({ template: 'closing' }).includes('cv dots'), 'the poster closing page has the fine line texture instead');
  assert.ok(!html({ template: 'text', headline: 'h', dots: true }).includes('cv dots'));
  assert.ok(has(v({ template: 'closing', dots: 'on' }), 'dots must be true or false'));
  // the website's .dot-grid: 1 px white dots at 8% on a 24 px grid, at the brand scale
  assert.deepEqual(brand.dots, { size: 1, spacing: 24, alpha: 0.08 });
  // the dots take the page's dot colour (--dc): the light dots (--dot) on a dark page, ink dots on a light one
  assert.ok(/\.cv\.dots\{background-image:radial-gradient\(var\(--dc\) var\(--dot-r\),transparent var\(--dot-r\)\)/.test(brand.css));
  assert.ok(/\.dark \.cv\{--dc:var\(--dot\);/.test(brand.css));
  // the older name of the dark ground is the same page
  const bodyOf = (h) => h.split('<body')[1].split('<script')[0];
  assert.equal(bodyOf(html({ template: 'text', headline: 'h', ground: 'ink' })), bodyOf(html({ template: 'text', headline: 'h', ground: 'dark' })));
});

test('the silk ribbon and figure captions are gone: refused on every template, with the reason', () => {
  const specs = [{ template: 'text', headline: 'h' }, { template: 'cover', headline: 'h', image: 'a.jpg' }, { template: 'stats', big: '1' }, { template: 'closing' },
    { template: 'passbook', headline: 'h' }, { template: 'screen', headline: 'h', image: 'p.webp' }, { template: 'photo-story', headline: 'h', image: 'a.jpg' },
    { template: 'object', headline: 'h', image: 'a.jpg' }, { template: 'product', headline: 'h', image: 'p.webp' }, { template: 'myth-fact', myth: 'm', factLead: 'f' }];
  for (const d of specs) {
    assert.deepEqual(v(d), [], d.template);
    assert.ok(has(v({ ...d, silk: true }), 'silk is no longer used'), d.template);
    assert.ok(has(v({ ...d, caption: 'Fig. One page' }), 'caption is no longer used'), d.template);
    assert.ok(!/class="silk|Fig\./.test(html(d)), d.template);
  }
  assert.ok(has(v({ template: 'carousel', silk: true, pages: [{ template: 'closing' }, { template: 'closing' }] }), 'silk'));
  assert.ok(has(v({ template: 'carousel', pages: [{ template: 'closing', caption: 'x' }, { template: 'closing' }] }), 'caption is no longer used'));
});

test('brand file: the gradient, glow, dots, fade, type and poster tokens are checked', () => {
  const good = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
  assert.deepEqual(validateBrand(good), []);
  const mod = (f) => { const b = structuredClone(good); f(b); return validateBrand(b); };
  assert.ok(has(mod((b) => { b.gradient.teal = 'red;}</style>'; }), 'gradient.teal'));
  assert.ok(has(mod((b) => { b.gradient.extra = '#000000'; }), 'unknown entries'));
  assert.ok(has(mod((b) => { b.text.mutedInv = 'url(x)'; }), 'text.mutedInv'));
  assert.ok(has(mod((b) => { b.dots.alpha = 2; }), 'dots.alpha') && has(mod((b) => { b.dots.spacing = '24px'; }), 'dots.spacing'));
  assert.ok(has(mod((b) => { b.glow.blur = -1; }), 'glow.blur') && has(mod((b) => { b.phone.fade = 'x'; }), 'phone.fade'));
  assert.ok(has(mod((b) => { b.font.leading = '1.2;x'; }), 'font.leading') && has(mod((b) => { b.font.tracking = 1; }), 'font.tracking'));
  assert.ok(has(mod((b) => { b.art = { silk: 'x.webp' }; }), 'art is no longer used'));
  assert.ok(has(mod((b) => { b.poster.slabs.myth = 'red'; }), 'poster.slabs.myth') && has(mod((b) => { b.poster.texture.alpha = 1; }), 'poster.texture.alpha'));
  assert.ok(has(mod((b) => { b.poster.headlineWeight = '600;x'; }), 'poster.headlineWeight') && has(mod((b) => { b.poster.slabRadius = -1; }), 'poster.slabRadius'));
  assert.ok(has(mod((b) => { delete b.poster; }), '"poster" is missing'));
  assert.deepEqual(Object.values(good.gradient), ['#4A6FA5', '#2F8FBF', '#9CC3EE', '#F0805F', '#E8603C']); // the website's --g-1 ... --g-5
});

test('the brand\'s dot map: a closing option, numbers and fixed classes only', () => {
  assert.deepEqual(v({ template: 'closing', map: true }), []);
  assert.ok(has(v({ template: 'closing', map: 'island' }), 'map must be true or false'));
  assert.ok(brand.map, 'the brand pack has a map.json');
  const svg = dotMapSvg(brand.map, 410, 512);
  const tags = svg.match(/<[^>]+>/g);
  assert.ok(tags.length > 1400);
  for (const t of tags) assert.match(t, /^<circle class="m[dgr]" cx="[\d.]+" cy="[\d.]+" r="[\d.]+"( stroke-width="[\d.]+")? opacity="[\d.]+"\/>$/);
  assert.ok(svg.includes('class="mg"') && svg.includes('class="mr"')); // the lit regions, with the ring around their capitals
  assert.match(html({ template: 'closing', map: true }), /<svg class="fig map" style="left:\d+px;top:\d+px" width="\d+" height="\d+" viewBox="0 0 \d+ \d+" aria-hidden="true"><circle/);
});

test('a brand without map.json cannot draw the map, and a bad map.json is refused field by field', () => {
  assert.throws(() => dotMapSvg(null, 410, 512), /this brand has no map/);
  const good = { grid: { cols: 4, rows: 3 }, lit: ['A'], regions: [{ name: 'A', capital: [1.5, 1], cells: [0, 0, 1, 1, 3, 2] }] };
  assert.deepEqual(mapProblems(good), []);
  assert.ok(dotMapSvg(good, 100, 80).includes('class="mg"'));
  const bad = (f) => { const m = structuredClone(good); f(m); return mapProblems(m).join('\n'); };
  assert.match(bad((m) => { m.grid.cols = 'x'; }), /grid.cols/);
  assert.match(bad((m) => { m.regions[0].cells.push(4, 0); }), /inside the grid/);
  assert.match(bad((m) => { m.regions[0].cells.push(1); }), /pairs/);
  assert.match(bad((m) => { m.regions[0].capital = ['1', 1]; }), /capital/);
  assert.match(bad((m) => { m.lit = ['Nowhere']; }), /lit must list/);
  assert.match(bad((m) => { m.regions = []; }), /1 to 100 regions/);
});
