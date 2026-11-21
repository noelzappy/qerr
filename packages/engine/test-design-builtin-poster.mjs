// node --test   (the poster group of the built-in templates as layouts, lib/design/builtin/poster.mjs: object, product (centred and
// beside), myth-fact and closing are drawn from their layouts, and each page is exactly the one its function drew, with fields
// filled, empty and hostile, every ground, accent and option the templates take, and the same refusals; and the poster page's
// new block types and options are checked like the rest. No Chrome: the pixel comparison is testlib/template-baseline.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { brandFile } from './lib/core.mjs';
import { loadBrand, normaliseBrand } from './lib/design/brand.mjs';
import { builtinLayoutFor } from './lib/design/builtin-layouts.mjs';
import { DesignError } from './lib/design/errors.mjs';
import { BLOCK_TYPES, layoutCatalogue, validateLayout } from './lib/design/layout.mjs';
import { renderLayoutWith } from './lib/design/layout-render.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { forSize, normaliseDesign, validateDesign } from './lib/design/spec.mjs';
import { LEGACY_FNS, TEMPLATE_FNS } from './design/templates/index.mjs';
import { STYLES } from './testlib/template-baseline.mjs';

const RAW = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
const demo = loadBrand();
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brands = Object.fromEntries(Object.entries(STYLES).map(([k, style]) => [k, style ? { ...demo, ...normaliseBrand({ ...RAW, style }) } : demo]));
const ctxOf = (brand, counter, dims = { w: 660, h: 1354 }) => ({ size: SIZES.feed, brand, counter, image: () => PIXEL, imageSize: () => dims });
const parts = (o) => ({ body: o.body, bodyClass: o.bodyClass ?? '', bodyAttrs: o.bodyAttrs ?? '', sheet: o.sheet ?? '' });
const has = (errs, frag) => errs.some((e) => e.includes(frag));
const H = ['"><script>window.__pwn=1</script>', '</style><script>x</script>', '<img src=x onerror=alert(1)>', '*a* \\n b', '`${x}`', 'url(http://evil.example/x)'];
const GROUNDS = ['light', 'soft', 'cool', 'warm', 'dark', 'deep', 'white', 'tint', 'mint', 'gold-pale', 'ink'];
const ACCENTS = [undefined, 'muted', 'colour', 'weight', 'none'];
const SERIES = Object.keys(RAW.series);

// The layout's page and the function's, for every style, as a single post and as carousel pages, and for picture sizes that
// differ (product sizes its glow from the picture's own ratio).
function same(s, { dims = [{ w: 660, h: 1354 }] } = {}) {
  const spec = forSize(normaliseDesign(s), 'feed');
  for (const [style, brand] of Object.entries(brands)) {
    for (const counter of [undefined, { n: 1, total: 2 }, { n: 2, total: 3 }]) {
      for (const d of dims) {
        const why = `${style} ${JSON.stringify(counter)} ${JSON.stringify(d)} ${JSON.stringify(s).slice(0, 160)}`;
        assert.ok(builtinLayoutFor(spec, counter), `not drawn from a layout: ${why}`);
        assert.deepEqual(parts(TEMPLATE_FNS[s.template](spec, ctxOf(brand, counter, d))), parts(LEGACY_FNS[s.template](spec, ctxOf(brand, counter, d))), why);
      }
    }
  }
}

test('object, product, myth-fact and closing are drawn from their layouts, product by its variant', () => {
  assert.equal(builtinLayoutFor({ template: 'object', headline: 'h', image: 'a.jpg' }).id, 'object');
  assert.equal(builtinLayoutFor({ template: 'product', headline: 'h', image: 'a.png' }).id, 'product');
  assert.equal(builtinLayoutFor({ template: 'product', headline: 'h', image: 'a.png', layout: 'center' }).id, 'product');
  assert.equal(builtinLayoutFor({ template: 'product', headline: 'h', image: 'a.png', layout: 'side' }).id, 'product-side');
  assert.equal(builtinLayoutFor({ template: 'myth-fact', myth: 'm', factLead: 'f' }).id, 'myth-fact');
  assert.equal(builtinLayoutFor({ template: 'closing' }).id, 'closing');
  // every design the templates' own validator accepts is valid for these (the layouts never widen what a design may hold)
  for (const s of [{ template: 'object', headline: 'h', image: 'a.jpg', align: 'center', size: 120 }, { template: 'product', headline: 'h', image: 'a.png', layout: 'side', glow: false }, { template: 'myth-fact', myth: 'm', factLead: 'f' }, { template: 'closing', map: true }]) assert.deepEqual(validateDesign(s), [], JSON.stringify(s));
});

test('object: fields filled, empty and hostile, every ground, accent, size, align and photo option', () => {
  for (const h of H) same({ template: 'object', headline: h, sub: h, image: 'a.jpg', label: h.slice(0, 40), series: 'explainers' });
  for (const ground of [undefined, 'photo', ...GROUNDS]) for (const accent of ACCENTS) {
    same({ template: 'object', headline: 'a *b*', image: 'a.jpg', ground, accent });
    same({ template: 'object', headline: 'a *b*', sub: 's', image: 'a.jpg', ground, accent, series: 'news', align: 'center' });
  }
  for (const size of [undefined, 76, 88, 104, 120]) for (const align of [undefined, 'left', 'center']) for (const sub of [undefined, 'A *sub* line']) {
    same({ template: 'object', headline: 'h', sub, image: 'a.jpg', size, align });
  }
  for (const photoTop of [300, 600, 777, 960]) same({ template: 'object', headline: 'h', image: 'a.jpg', photoTop, focal: '10% 90%', zoom: 2.5 });
  for (const series of SERIES) same({ template: 'object', headline: 'h', image: 'a.jpg', series });
});

test('product: centred and beside, with and without a sub line, every size, align, ground, glow and phone position', () => {
  for (const h of H) for (const layout of [undefined, 'side']) same({ template: 'product', layout, headline: h, sub: h, image: 'a.png', label: h.slice(0, 40) });
  const dims = [{ w: 660, h: 1354 }, { w: 1000, h: 500 }, { w: 300, h: 3000 }, { w: 0, h: 0 }, null];
  for (const layout of [undefined, 'center', 'side']) {
    for (const size of [undefined, 76, 88, 104, 120]) for (const align of [undefined, 'left', 'center']) for (const sub of [undefined, 'A sub line']) {
      same({ template: 'product', layout, headline: 'h *x*', sub, image: 'a.png', size, align });
    }
    for (const glow of [undefined, true, false]) for (const phoneTop of [undefined, 300, 700, 960]) for (const sub of [undefined, 's']) {
      same({ template: 'product', layout, headline: 'h', sub, image: 'a.png', glow, phoneTop }, { dims });
    }
    for (const ground of [undefined, ...GROUNDS]) for (const accent of ACCENTS) same({ template: 'product', layout, headline: 'a *b*', image: 'a.png', ground, accent });
    // the series gives its accent, never its ground (the template's default ground, cool, comes first)
    for (const series of SERIES) same({ template: 'product', layout, headline: 'a *b*', image: 'a.png', series });
  }
});

test('myth-fact: the slabs, the series mark opposite the bar, every ground and accent, and the flowing page', () => {
  for (const h of H) same({ template: 'myth-fact', myth: h, factLead: h, fact: h, label: h.slice(0, 40) });
  for (const fact of [undefined, 'The *fact* explained\\non two lines.']) for (const label of [undefined, 'Busting myths']) for (const series of [undefined, ...SERIES]) {
    same({ template: 'myth-fact', myth: 'A myth.', factLead: 'The *fact.*', fact, label, series });
  }
  for (const ground of [undefined, ...GROUNDS]) for (const accent of ACCENTS) same({ template: 'myth-fact', myth: 'm', factLead: 'f *g*', ground, accent });
  const out = TEMPLATE_FNS['myth-fact'](forSize(normaliseDesign({ template: 'myth-fact', myth: 'm', factLead: 'f' }), 'feed'), ctxOf(demo));
  assert.equal(out.bodyAttrs, 'data-editorial="1" data-flex="1"');
  assert.ok(!out.body.includes('id="txt"'), 'the slabs have no #txt box');
});

test('closing: the tagline and the website by default, the map, every ground and accent', () => {
  for (const h of H) same({ template: 'closing', headline: h, line: h.slice(0, 60) });
  for (const map of [undefined, false, true]) for (const headline of [undefined, 'See you *next week.*']) for (const line of [undefined, 'acmesavings.example/join']) {
    same({ template: 'closing', map, headline, line });
  }
  for (const ground of [undefined, ...GROUNDS]) for (const accent of ACCENTS) same({ template: 'closing', ground, accent, series: 'explainers' });
  // a brand whose tagline has no comma, and a hostile tagline and website, go through the same escaping
  for (const tagline of ['Saving made simple', '"><script>x</script>, <b>y</b>']) {
    const brand = { ...demo, tagline, website: '<i>w</i>' }, spec = forSize(normaliseDesign({ template: 'closing' }), 'feed');
    assert.deepEqual(parts(TEMPLATE_FNS.closing(spec, ctxOf(brand))), parts(LEGACY_FNS.closing(spec, ctxOf(brand))));
    assert.ok(!TEMPLATE_FNS.closing(spec, ctxOf(brand)).body.includes('<script>'));
  }
});

test('the poster templates refuse what their functions refused, with the same words', () => {
  const refused = (s, brand = demo) => {
    const spec = forSize(normaliseDesign(s), 'feed');
    let a, b;
    try { TEMPLATE_FNS[s.template](spec, ctxOf(brand)); } catch (e) { a = e; }
    try { LEGACY_FNS[s.template](spec, ctxOf(brand)); } catch (e) { b = e; }
    assert.ok(a instanceof DesignError && b instanceof DesignError, `${JSON.stringify(s)}: ${a} / ${b}`);
    assert.equal(a.message, b.message);
  };
  for (const t of [{ template: 'object', headline: 'h', image: 'a.jpg' }, { template: 'product', headline: 'h', image: 'a.png' }, { template: 'product', layout: 'side', headline: 'h', image: 'a.png' }, { template: 'myth-fact', myth: 'm', factLead: 'f' }, { template: 'closing' }]) {
    refused({ ...t, series: 'nope' });
    refused({ ...t, ground: 'purple' });
    refused({ ...t, series: 'nope', ground: 'purple' });
    if (t.template !== 'object') refused({ ...t, ground: 'photo' }); // only object and number take a photo ground
  }
  // the closing page's map needs the brand's dot map
  refused({ template: 'closing', map: true }, { ...demo, map: null });
});

test('the poster page\'s new block types and options: valid, invalid and hostile', () => {
  const poster = () => ({
    id: 'p', name: 'Poster', page: 'poster', ground: 'cool',
    fields: { headline: {}, sub: {}, myth: { required: true }, factLead: { required: true }, fact: {}, image: { required: true } },
    canvas: { feed: { columns: 12, rows: 15, margin: 80, gutter: 40 } },
    blocks: [
      { type: 'decoration', kind: 'glow', px: { x: 570, y: 300, w: 450, h: 1050 } },
      { type: 'bar', label: 'none' },
      { type: 'headline', specAlign: true, fallback: 'tagline', subField: 'sub', subFallback: 'website', px: { x: 80, y: 170, w: 470, h: 100 } },
      { type: 'slabs', px: { x: 80, y: 300, w: 470, h: 900 }, children: [{ type: 'headline', field: 'myth', size: 68 }, { type: 'headline', field: 'factLead', size: 68 }, { type: 'sub', field: 'fact' }] },
      { type: 'screen', phoneTop: true, px: { x: 570, y: 300, w: 450, h: 1050 } },
      { type: 'mark' },
    ],
  });
  const mod = (f) => { const l = poster(); f(l); return validateLayout(l); };
  assert.deepEqual(validateLayout(poster()), []);
  // fixed lists and flags only
  for (const v of ['brand', 'yes', 'Auto', ...H, 1, true, null, {}, []]) {
    assert.ok(has(mod((l) => { l.blocks[1].label = v; }), 'label must be one of auto, none'), String(v));
    assert.ok(has(mod((l) => { l.blocks[2].fallback = v; }), 'fallback must be one of none, tagline'), String(v));
    assert.ok(has(mod((l) => { l.blocks[2].subFallback = v; }), 'subFallback must be one of none, website'), String(v));
  }
  assert.ok(has(mod((l) => { l.blocks[1].label = 'website'; }), 'label must be one of auto, none'));
  assert.ok(has(mod((l) => { l.blocks[2].fallback = 'website'; }), 'fallback must be one of none, tagline'));
  assert.ok(has(mod((l) => { l.blocks[2].subFallback = 'tagline'; }), 'subFallback must be one of none, website'));
  for (const v of ['yes', 1, null, {}, 'true']) {
    assert.ok(has(mod((l) => { l.blocks[2].specAlign = v; }), 'specAlign must be true or false'), String(v));
    assert.ok(has(mod((l) => { l.blocks[4].phoneTop = v; }), 'phoneTop must be true or false'), String(v));
  }
  // the chrome mark has no slot and shows no field; the slabs take no option the page does not honour, and hold blocks it draws
  assert.ok(has(mod((l) => { l.blocks[5].px = { x: 80, y: 1200, w: 920, h: 40 }; }), 'a mark has no slot'));
  assert.ok(has(mod((l) => { l.blocks[5].field = 'myth'; }), 'a mark shows no field'));
  assert.ok(has(mod((l) => { l.blocks[3].children.push({ type: 'logo' }); }), 'a poster page does not draw a logo block'));
  assert.ok(has(mod((l) => { l.blocks[3].children[0].valign = 'top'; }), 'no valign'));
  assert.ok(has(mod((l) => { l.blocks[3].children[0].field = 'quote'; }), 'not in the layout\'s fields'));
  assert.ok(has(mod((l) => { l.blocks[3].px = { x: 0, y: 300, w: 470, h: 900 }; }), 'keeps inside the feed page\'s minimum margins'));
  assert.ok(has(mod((l) => { l.blocks[4].glow = false; }), 'glow is not used on a poster page'));
  assert.ok(has(mod((l) => { l.blocks[4].device = 'desktop'; }), 'device is not used on a poster page'));
  // the poster headline's own options are not honoured on an editorial page nor offered on a grid page (nor to the editor or the AI)
  const editorial = { id: 'e', name: 'E', page: 'editorial', fields: { headline: {} }, canvas: { feed: { columns: 12, rows: 15, margin: 70 } }, blocks: [{ type: 'headline', px: { x: 70, y: 154, w: 940, h: 300 } }] };
  for (const [k, v] of [['specAlign', true], ['fallback', 'tagline']]) assert.ok(has(validateLayout({ ...editorial, blocks: [{ ...editorial.blocks[0], [k]: v }] }), `${k} is used on poster pages only`), k);
  const grid = { id: 'g', name: 'G', fields: { headline: {} }, canvas: { feed: { columns: 12, rows: 15, margin: 70 } }, blocks: [{ type: 'headline', slot: { col: 1, row: 1, width: 12, height: 4 } }] };
  for (const [k, v] of [['specAlign', true], ['fallback', 'tagline'], ['subFallback', 'website']]) assert.ok(has(validateLayout({ ...grid, blocks: [{ ...grid.blocks[0], [k]: v }] }), `${k} is used on poster pages only`), k);
  assert.ok(has(validateLayout({ ...grid, blocks: [...grid.blocks, { type: 'mark' }] }), 'a mark block belongs to poster pages'));
  assert.ok(has(validateLayout({ ...grid, blocks: [...grid.blocks, { type: 'slabs', slot: { col: 1, row: 6, width: 12, height: 4 } }] }), 'a slabs block belongs to poster pages'));
  for (const t of ['slabs', 'mark']) assert.ok(!BLOCK_TYPES.includes(t) && !(t in layoutCatalogue().blocks), t);
  for (const o of ['specAlign', 'fallback', 'subFallback', 'label', 'phoneTop']) assert.ok(!Object.values(layoutCatalogue().blocks).some((b) => o in b.options), o);
});

test('the new drawings escape what they show and take only validated numbers', () => {
  const l = {
    id: 'p', name: 'Poster', page: 'poster', ground: 'cool',
    fields: { headline: {}, line: {}, myth: { required: true }, factLead: { required: true }, fact: {}, image: { required: true } },
    canvas: { feed: { columns: 12, rows: 15, margin: 80, gutter: 40 } },
    blocks: [
      { type: 'decoration', kind: 'glow', px: { x: 570, y: 300, w: 450, h: 1050 } },
      { type: 'bar' },
      { type: 'headline', specAlign: true, fallback: 'tagline', subField: 'line', subFallback: 'website', px: { x: 80, y: 170, w: 470, h: 100 } },
      { type: 'slabs', px: { x: 80, y: 300, w: 470, h: 900 }, children: [{ type: 'headline', field: 'myth', size: 68 }, { type: 'headline', field: 'factLead', size: 68 }, { type: 'sub', field: 'fact' }] },
      { type: 'screen', phoneTop: true, px: { x: 570, y: 300, w: 450, h: 1050 } },
      { type: 'mark' },
    ],
  };
  assert.deepEqual(validateLayout(l), []);
  for (const h of H) {
    const spec = { template: 'layout', headline: h, line: h, myth: h, factLead: h, fact: h, label: h, image: 'a.png', align: h, phoneTop: h, size: h };
    const out = renderLayoutWith(l, spec, ctxOf({ ...demo, tagline: h, website: h }));
    for (const bad of ['<script', '<img src=x', '</style>', '`${']) assert.ok(!out.body.includes(bad), `${bad} in ${h}`);
    assert.ok(!out.body.includes('text-align:"'), 'the align is a listed value');
  }
  // a phoneTop outside 300 to 960, or not a whole number, is ignored: the phone stays at its rectangle
  for (const phoneTop of [299, 961, 400.5, '400', NaN, -1]) {
    const out = renderLayoutWith(l, { template: 'layout', myth: 'm', factLead: 'f', image: 'a.png', phoneTop }, ctxOf(demo));
    assert.ok(out.body.includes('left:570px;top:300px;width:450px'), String(phoneTop));
  }
  const at = renderLayoutWith(l, { template: 'layout', myth: 'm', factLead: 'f', image: 'a.png', phoneTop: 700 }, ctxOf(demo));
  assert.ok(at.body.includes('left:570px;top:700px;width:450px'));
});
