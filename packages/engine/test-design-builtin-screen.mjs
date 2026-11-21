// node --test   (the screen template as layouts, lib/design/builtin/screen.mjs: every variant, desktop, beside, fade and the phone
// row, is drawn from its layout, and the page is exactly the one the template function drew (testlib/builtin-markup.json), with every field filled, empty and
// hostile, every ground, accent, flag and option, on single posts and carousel pages, for pictures of any shape; and the screen
// group's pieces of the editorial page (the screen block, halo, beside, footlogo, a headline's lists and row, specWindow) take
// valid values only. No Chrome: the pixel comparison is testlib/template-baseline.mjs, run by hand.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { brandFile } from './lib/core.mjs';
import { loadBrand, normaliseBrand } from './lib/design/brand.mjs';
import { TEMPLATE_FNS, builtinLayoutFor } from './lib/design/builtin-layouts.mjs';
import { LAYOUTS } from './lib/design/builtin/screen.mjs';
import { DesignError } from './lib/design/errors.mjs';
import { BLOCK_TYPES, layoutCatalogue, layoutUsesPhone, validateLayout } from './lib/design/layout.mjs';
import { renderLayoutWith } from './lib/design/layout-render.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { forSize, normaliseDesign, validateDesign } from './lib/design/spec.mjs';
import { markupFixture } from './testlib/markup-fixture.mjs';
import { STYLES } from './testlib/template-baseline.mjs';

const RAW = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
const demo = loadBrand();
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brands = Object.fromEntries(Object.entries(STYLES).map(([k, style]) => [k, style ? { ...demo, ...normaliseBrand({ ...RAW, style }) } : demo]));
// The pictures' sizes the drawings work from: the website's phone, a squat one (a faded phone shorter than its cut), a desktop
// capture, and none (the size could not be read: the default ratio).
const DIMS = [{ w: 660, h: 1354 }, { w: 800, h: 600 }, { w: 2400, h: 1500 }, undefined];
const ctxOf = (brand, counter, dims = DIMS[0]) => ({ size: SIZES.feed, brand, counter, image: () => PIXEL, imageSize: () => dims });
const parts = (o) => ({ body: o.body, bodyClass: o.bodyClass ?? '', bodyAttrs: o.bodyAttrs ?? '', sheet: o.sheet ?? '' });
// The pages are checked against the hashes recorded from the template functions the layouts replaced
// (testlib/markup-fixture.mjs), and so are the refusals' words.
const fx = markupFixture('screen');
const drawTemplate = (t, spec, ctx) => parts(TEMPLATE_FNS[t](spec, ctx));
const refusal = (t, spec, ctx) => {
  let a;
  try { TEMPLATE_FNS[t](spec, ctx); } catch (e) { a = e; }
  assert.ok(a instanceof DesignError, `${JSON.stringify(spec).slice(0, 120)}: ${a}`);
  return `DesignError: ${a.message}`;
};
const has = (errs, frag) => errs.some((e) => e.includes(frag));
const H = ['"><script>window.__pwn=1</script>', '</style><script>x</script>', '<img src=x onerror=alert(1)>', '*a* \\n b', '`${x}`'];
const HOSTILE = ['"><script>window.__pwn=1</script>', 'url(http://evil.example/x)', '__proto__', '1e3', NaN, -1, 1.5, null, {}, [], 'true'];

// One case: the spec drawn for each of `looks` ([brand, counter, dims]).
const same = (s, looks) => {
  const spec = forSize(normaliseDesign(s), 'feed');
  fx.check({ s, looks: looks.map(([b, c, d]) => [Object.keys(brands).find((k) => brands[k] === b), c, d]) }, looks.map(([b, c, d]) => drawTemplate('screen', spec, ctxOf(b, c, d))), JSON.stringify(s).slice(0, 160));
};

// Every variant, with and without the fields and flags it takes.
const specs = [];
const img = 'design/assets/screens/a-phone.png';
for (const sub of [undefined, 'Every deposit shows *the moment* it is made.']) {
  for (const glow of [undefined, true, false]) {
    for (const [pills, checks] of [[undefined, undefined], [['Read-only by design'], undefined], [undefined, ['Two-person approval', 'Every change logged']], [['A', 'B', 'C', 'D'], ['One', 'Two', 'Three', 'Four']]]) {
      specs.push({ template: 'screen', headline: 'Your savings, *on your phone.*', sub, image: img, glow, pills, checks });
      specs.push({ template: 'screen', headline: 'The app, *at a glance.*', sub, image: img, glow, pills, checks, fade: true });
    }
  }
  for (const beside of [{}, { days: 31, ticked: 17 }, { days: 28, ticked: 9, today: 10, tick: 'gold' }, { days: 30, ticked: 30, today: 30, tick: 'ink' }]) specs.push({ template: 'screen', headline: 'The same passbook, *on record.*', sub, image: img, beside });
  for (const framed of [undefined, true, false]) {
    for (const tilt of [undefined, true, false]) {
      for (const [title, region] of [[undefined, undefined], ['Passbooks', 0.75], [undefined, 0.4], ['T', 1]]) specs.push({ template: 'screen', device: 'desktop', headline: 'Watch the page *fill.*', sub, image: 'design/assets/demo/screen-desk.png', framed, tilt, title, region });
    }
  }
}
for (const ground of ['light', 'soft', 'cool', 'warm', 'dark', 'deep', 'white', 'tint', 'mint', 'gold-pale', 'ink']) {
  for (const accent of [undefined, 'muted', 'colour', 'weight', 'none']) {
    specs.push({ template: 'screen', headline: 'a *b*', image: img, ground, accent, pills: ['p'] });
    specs.push({ template: 'screen', headline: 'a *b*', image: img, ground, accent, fade: true, series: 'news', dots: false });
    specs.push({ template: 'screen', headline: 'a *b*', image: img, ground, accent, beside: { days: 31 }, label: 'L', headRight: 'R' });
    specs.push({ template: 'screen', headline: 'a *b*', sub: 's', image: img, ground, accent, device: 'desktop', series: 'myth-vs-fact' });
  }
}
const hostile = [];
for (const h of H) {
  hostile.push({ template: 'screen', headline: h, sub: h, image: h, pills: [h, h], checks: [h], label: h.slice(0, 40), headRight: h.slice(0, 30), title: h });
  hostile.push({ template: 'screen', headline: h, sub: h, image: h, fade: true, pills: [h], checks: [h, h] });
  hostile.push({ template: 'screen', headline: h, sub: h, image: h, beside: { days: h, ticked: h, today: h, tick: h } });
  hostile.push({ template: 'screen', device: 'desktop', headline: h, sub: h, image: h, title: h, tilt: true, framed: true, region: h });
}

test('every screen variant is drawn from its layout, and every layout is valid', () => {
  for (const { layout } of LAYOUTS.screen) assert.deepEqual(validateLayout(layout), [], layout.id);
  const id = (s) => builtinLayoutFor({ template: 'screen', headline: 'h', image: 'a.png', ...s }).id;
  assert.equal(id({}), 'screen');
  assert.equal(id({ pills: ['a'], checks: ['b'], glow: false }), 'screen');
  assert.equal(id({ fade: true }), 'screen-fade');
  assert.equal(id({ beside: { days: 31 } }), 'screen-beside');
  assert.equal(id({ device: 'desktop' }), 'screen-desktop');
  assert.equal(id({ device: 'desktop', framed: true, tilt: true }), 'screen-desktop');
  // as the function chooses: a desktop first, then beside, then fade
  assert.equal(id({ device: 'desktop', beside: { days: 31 }, fade: true }), 'screen-desktop');
  assert.equal(id({ beside: { days: 31 }, fade: true }), 'screen-beside');
  // the renderer still insists on a pre-framed capture for every phone variant, not for the desktop window
  for (const { layout } of LAYOUTS.screen) assert.equal(layoutUsesPhone(layout), layout.id !== 'screen-desktop', layout.id);
});

test('the screen layouts draw exactly the pages the function drew: every variant, field, flag, ground, accent, style and page', () => {
  assert.ok(specs.length > 200, `${specs.length} specs`);
  // the specs are designs the engine accepts (the hostile ones below are not, and are drawn all the same)
  for (const s of specs) assert.deepEqual(validateDesign(s, 's'), [], JSON.stringify(s));
  // every style and page, and the phone and its glow sized from the picture: a squat picture, a wide one, and one whose size
  // could not be read
  const looks = [...Object.values(brands).flatMap((b) => [undefined, { n: 1, total: 2 }, { n: 2, total: 3 }].map((c) => [b, c, DIMS[0]])), ...DIMS.map((d) => [demo, undefined, d])];
  for (const s of [...specs, ...hostile]) same(s, looks);
});

test('the screen layouts refuse what the function refused, with the same words', () => {
  const refuse = (s) => {
    fx.check({ refused: s }, refusal('screen', forSize(normaliseDesign(s), 'feed'), ctxOf(demo)), JSON.stringify(s));
  };
  for (const v of [{}, { fade: true }, { beside: { days: 31 } }, { device: 'desktop' }]) {
    refuse({ template: 'screen', headline: 'h', image: img, series: 'nope', ...v });
    refuse({ template: 'screen', headline: 'h', image: img, ground: 'photo', ...v });
    refuse({ template: 'screen', headline: 'h', image: img, ground: 'purple', ...v });
  }
});

test('hostile words, lists, numbers and names reach the screen page only escaped or checked', () => {
  for (const h of H) {
    for (const v of [{ pills: [h, h], checks: [h] }, { fade: true, pills: [h], checks: [h] }, { beside: { days: h, ticked: h, today: h, tick: h } }, { device: 'desktop', title: h, region: h, framed: true, tilt: true }]) {
      const out = TEMPLATE_FNS.screen(forSize(normaliseDesign({ template: 'screen', headline: h, sub: h, image: h, label: h.slice(0, 40), ...v }), 'feed'), ctxOf(demo, { n: 1, total: 2 }));
      assert.ok(!/<script|<img src=x|<\/style>|`\$\{x\}`/.test(out.body), `${h} ${JSON.stringify(v)}`);
    }
  }
});

// ---- the screen group's pieces of the editorial page ----
const page = (blocks, fields = { headline: { required: true }, sub: {}, image: { required: true } }) => ({
  id: 'scr', name: 'Screen', page: 'editorial', fields, canvas: { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } }, blocks: [...blocks, { type: 'footlogo' }],
});
const ROW = () => [
  { type: 'halo' },
  { type: 'runhead' },
  { type: 'headline', size: 70, subField: 'sub', subWidth: 430, lists: true, row: true, px: { x: 70, y: 126, w: 430, h: 1114 } },
  { type: 'screen', px: { x: 540, y: 126, w: 470, h: 1114 } },
];
const mod = (f) => { const b = ROW(); f(b); return validateLayout(page(b)); };
const grid = (blk, fields = { headline: {}, image: {} }) => validateLayout({ id: 'g', name: 'G', fields, canvas: { feed: { columns: 12, rows: 15, margin: 70 } }, blocks: [{ type: 'headline', slot: { col: 1, row: 1, width: 12, height: 4 } }, blk] });
const draw = (l, spec, dims = DIMS[0]) => renderLayoutWith(l, forSize(normaliseDesign({ template: 'screen', image: img, ...spec }), 'feed'), ctxOf(demo, undefined, dims)).body;

test('the screen pieces are valid on an editorial page only, with options from their fixed lists', () => {
  assert.deepEqual(validateLayout(page(ROW())), []);
  // a headline's lists and row, and a window's specWindow: true or false, on an editorial page only
  for (const [i, k] of [[2, 'lists'], [2, 'row'], [3, 'specWindow']]) {
    for (const v of HOSTILE) assert.ok(has(mod((b) => { b[i][k] = v; }), `${k} must be true or false`), `${k} ${String(v)}`);
  }
  assert.deepEqual(mod((b) => { b[3] = { type: 'screen', device: 'desktop', specWindow: true, px: { x: 540, y: 126, w: 470, h: 1114 } }; }), []);
  for (const k of ['lists', 'row']) {
    assert.ok(has(grid({ type: 'headline', slot: { col: 1, row: 6, width: 12, height: 4 }, field: 'headline', [k]: true }), `${k} is used on editorial pages only`), k);
    const poster = { id: 'p', name: 'P', page: 'poster', fields: { headline: {} }, canvas: { feed: { columns: 12, rows: 15, margin: 80 } }, blocks: [{ type: 'bar' }, { type: 'headline', px: { x: 80, y: 170, w: 920, h: 400 }, [k]: true }] };
    assert.ok(has(validateLayout(poster), `${k} is used on editorial pages only`), k);
  }
  assert.ok(has(grid({ type: 'screen', slot: { col: 1, row: 6, width: 12, height: 8 }, device: 'desktop', specWindow: true }), 'specWindow is used on editorial pages only'));
  // the new block types belong to the editorial page: never offered to the editor or the AI
  for (const t of ['halo', 'beside', 'footlogo']) {
    assert.ok(!BLOCK_TYPES.includes(t) && !(t in layoutCatalogue().blocks), t);
    assert.ok(has(grid({ type: t, slot: { col: 1, row: 6, width: 4, height: 4 } }), `a ${t} block belongs to editorial pages`), t);
  }
  assert.ok(!('lists' in layoutCatalogue().blocks.headline.options) && !('row' in layoutCatalogue().blocks.headline.options) && !('specWindow' in layoutCatalogue().blocks.screen.options));
  // halo and footlogo are placed by the page (behind the phone, at the foot); beside takes a rectangle and shows no field
  assert.ok(has(mod((b) => { b[0].px = { x: 0, y: 0, w: 100, h: 100 }; }), 'a halo has no slot'));
  assert.ok(has(validateLayout({ ...page(ROW()), blocks: [...ROW(), { type: 'footlogo', px: { x: 0, y: 1300, w: 100, h: 40 } }] }), 'a footlogo has no slot'));
  assert.ok(has(mod((b) => { b.push({ type: 'beside' }); }), 'slot is required'));
  assert.ok(has(mod((b) => { b.push({ type: 'beside', field: 'sub', px: { x: 70, y: 126, w: 300, h: 300 } }); }), 'a beside shows no field'));
  assert.ok(has(mod((b) => { b.push({ type: 'beside', px: { x: 70, y: 126, w: 300, h: 300 } }); }), 'overlap'));
  assert.ok(has(mod((b) => { b.push({ type: 'beside', kind: 'card', px: { x: 70, y: 126, w: 300, h: 300 } }); }), '"kind" is not a known setting'));
  // the screen block on an editorial page takes device, fit, specWindow and titleField only
  assert.ok(has(mod((b) => { b[3].glow = false; }), 'glow is not used on an editorial page'));
  assert.ok(has(mod((b) => { b[3].align = 'left'; }), 'align is not used on an editorial page'));
  assert.ok(has(mod((b) => { b[3].fit = 'stretch'; }), 'fit must be one of contain, crop'));
  assert.ok(has(mod((b) => { b[2].subField = 'image'; }), 'a headline cannot show "image"'));
});

test('a headline in a row needs the layout\'s phone beside it; the glow follows the phone; nothing reaches the page unchecked', () => {
  const spec = { headline: 'H', sub: 'S', pills: ['P'], checks: ['C'] };
  const row = draw(page(ROW()), spec);
  assert.match(row, /<div class="abs" style="left:70px;top:126px;width:940px;height:1114px;display:flex;align-items:center;gap:40px"><div style="flex:1;min-width:0"><div id="txt" style="width:430px">/);
  assert.equal((row.match(/data-phone/g) ?? []).length, 1, 'the phone is drawn once, in the row');
  assert.ok(row.indexOf('class="glow"') < row.indexOf('class="rh"'), 'the glow lies under the running head');
  // the phone's rectangle decides the row: elsewhere, or at another height, or missing, is refused
  for (const p of [{ x: 300, y: 126, w: 470, h: 1114 }, { x: 540, y: 140, w: 470, h: 1100 }, { x: 540, y: 126, w: 470, h: 1000 }]) {
    const b = ROW();
    b[3].px = p;
    if (p.x < 500) b[2].px = { x: 70, y: 126, w: 200, h: 100 };
    assert.throws(() => draw(page(b), spec), (e) => e instanceof DesignError && /a headline set in a row needs the layout's phone beside it/.test(e.message), JSON.stringify(p));
  }
  // an empty headline draws no row: the phone is then drawn on its own, at its rectangle
  const lone = draw(page(ROW()), { sub: 'S' });
  assert.equal((lone.match(/data-phone/g) ?? []).length, 1);
  assert.match(lone, /class="phone" data-obj data-avoid data-bleed style="left:540px;top:126px;width:470px/);
  const noPhone = ROW().slice(0, 3);
  assert.throws(() => draw(page(noPhone, { headline: {}, sub: {} }), spec), DesignError);
  // without a phone the halo draws nothing; a phone that is not in a row is drawn on its own, and its glow is its own size
  assert.equal(draw(page([{ type: 'halo' }, { type: 'headline', px: { x: 70, y: 154, w: 940, h: 300 } }], { headline: {} }), spec).includes('glow'), false);
  const own = draw(page([{ type: 'halo' }, { type: 'headline', px: { x: 70, y: 154, w: 940, h: 300 } }, { type: 'screen', px: { x: 300, y: 500, w: 400, h: 600 } }], { headline: {}, image: {} }), spec);
  const g = demo.glow.inset * demo.scale, glowAt = (x, y, w, h) => `class="glow" aria-hidden="true" style="left:${x - g}px;top:${y - g}px;width:${w + 2 * g}px;height:${Math.round((h + 2 * g) * 100) / 100}px"`;
  assert.ok(own.includes(glowAt(300, 500, 400, (400 * 1354) / 660)), 'the glow is the whole phone\'s size');
  assert.match(own, /class="phone" data-obj data-avoid data-bleed style="left:300px;top:500px;width:400px/);
  const cut = draw(page([{ type: 'halo' }, { type: 'headline', px: { x: 70, y: 154, w: 940, h: 300 } }, { type: 'screen', fit: 'crop', px: { x: 300, y: 500, w: 400, h: 600 } }], { headline: {}, image: {} }), spec);
  assert.ok(cut.includes(glowAt(300, 500, 400, 600)), 'the glow of a cut phone is no taller than the cut');
  assert.match(cut, /<div class="cut" style="height:600px">/);
  // lists: off by default (a headline without it shows no pills), escaped items when on
  const plain = draw(page([{ type: 'headline', px: { x: 70, y: 154, w: 940, h: 300 } }], { headline: {} }), { headline: 'H', pills: ['P'], checks: ['C'] });
  assert.ok(!plain.includes('pill') && !plain.includes('checks'));
  for (const h of H) {
    const out = draw(page(ROW()), { headline: h, sub: h, pills: [h], checks: [h] });
    assert.ok(!/<script|<img src=x|<\/style>/.test(out), h);
    const card = draw(page([{ type: 'headline', px: { x: 70, y: 154, w: 940, h: 300 } }, { type: 'beside', px: { x: 70, y: 550, w: 380, h: 500 } }], { headline: {} }), { headline: 'H', beside: { days: h, ticked: h, today: h, tick: h } });
    assert.ok(card.includes('class="obj card"') && !/<script|<img src=x|<\/style>/.test(card), h);
  }
  // no beside in the spec: no card
  assert.ok(!draw(page([{ type: 'headline', px: { x: 70, y: 154, w: 940, h: 300 } }, { type: 'beside', px: { x: 70, y: 550, w: 380, h: 500 } }], { headline: {} }), { headline: 'H' }).includes('card'));
  // specWindow off: the window as the block says, whatever the spec's flags
  const win = (specWindow) => draw(page([{ type: 'headline', px: { x: 70, y: 154, w: 940, h: 300 } }, { type: 'screen', device: 'desktop', specWindow, px: { x: 70, y: 548, w: 940, h: 692 } }], { headline: {}, image: {} }), { headline: 'H', device: 'desktop', framed: true, tilt: true, region: 0.5 }, DIMS[2]);
  assert.ok(win(true).includes('rotateY') && win(true).includes('class="crop"') && !win(true).includes('class="bar"'));
  assert.ok(!win(false).includes('rotateY') && !win(false).includes('class="crop"') && win(false).includes('class="bar"'));
  // the footer with the logo alone: no website and no "Swipe →", on page 1 of a carousel too
  const foot = renderLayoutWith(page(ROW()), forSize(normaliseDesign({ template: 'screen', headline: 'H', image: img }), 'feed'), ctxOf(demo, { n: 1, total: 2 })).body;
  assert.ok(!foot.includes('Swipe') && !foot.includes(demo.website));
});

test('the markup fixture holds every case these tests draw, and only those', () => fx.done());
