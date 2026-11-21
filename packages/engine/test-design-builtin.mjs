// node --test   (the built-in templates as layouts, lib/design/builtin-layouts.mjs: every built-in layout is valid, a design that
// names a converted template is drawn from its layout, and the page is exactly the one the template function drew, for the demo
// brand and the style variants, on single posts and carousel pages, with hostile text too. No Chrome: the pixel comparison is
// testlib/template-baseline.mjs, run by hand, see testlib/CONVERTING.md.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { brandFile } from './lib/core.mjs';
import { loadBrand, normaliseBrand } from './lib/design/brand.mjs';
import { BUILTIN, builtinLayoutFor, builtinProblems } from './lib/design/builtin-layouts.mjs';
import { DesignError } from './lib/design/errors.mjs';
import { validateLayout } from './lib/design/layout.mjs';
import { layoutFit } from './lib/design/layout-render.mjs';
import { preparePage } from './lib/design/render.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { forSize, normaliseDesign, validateDesign } from './lib/design/spec.mjs';
import { LEGACY_FNS, TEMPLATE_FNS } from './design/templates/index.mjs';
import { markupFixture } from './testlib/markup-fixture.mjs';
import { CASES, STYLES, currentMarkup } from './testlib/template-baseline.mjs';

const RAW = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
const demo = loadBrand();
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brands = Object.fromEntries(Object.entries(STYLES).map(([k, style]) => [k, style ? { ...demo, ...normaliseBrand({ ...RAW, style }) } : demo]));
// The templates with layouts registered (lib/design/builtin/*.mjs): a group that converts one needs no change here.
const CONVERTED = Object.keys(BUILTIN);
const ctxOf = (brand, counter, dims = { w: 1800, h: 1800 }) => ({ size: SIZES.feed, brand, counter, image: () => PIXEL, imageSize: () => dims });
const parts = (o) => ({ body: o.body, bodyClass: o.bodyClass ?? '', bodyAttrs: o.bodyAttrs ?? '', sheet: o.sheet ?? '' });
// The pages are checked against the hashes recorded from the template functions (testlib/markup-fixture.mjs).
const fx = markupFixture('builtin');
const harness = markupFixture('harness');
const draw = (t, spec, ctx) => {
  const page = parts(TEMPLATE_FNS[t](spec, ctx));
  assert.deepEqual(page, parts(LEGACY_FNS[t](spec, ctx)), `${t}: the layout's page is the function's`);
  return page;
};
const refusal = (t, spec, ctx) => {
  let a, b;
  try { TEMPLATE_FNS[t](spec, ctx); } catch (e) { a = e; }
  try { LEGACY_FNS[t](spec, ctx); } catch (e) { b = e; }
  assert.ok(a instanceof DesignError && b instanceof DesignError, JSON.stringify(spec).slice(0, 120));
  assert.equal(a.message, b.message);
  return `DesignError: ${a.message}`;
};

// Every page of the harness's cases that one of the converted templates draws, as the spec the renderer sees.
const pages = CASES.flatMap((c) => {
  const spec = normaliseDesign(c.design);
  return (spec.template === 'carousel' ? spec.pages.map((p, i) => ({ id: `${c.id}-${i + 1}`, spec: p, counter: { n: i + 1, total: spec.pages.length } })) : [{ id: c.id, spec }])
    .filter((p) => CONVERTED.includes(p.spec.template));
});

test('every built-in layout is a valid layout, registered under a real template, its variants reachable', () => {
  assert.deepEqual(builtinProblems(), []);
  for (const [t, list] of Object.entries(BUILTIN)) for (const v of list) assert.deepEqual(validateLayout(v.layout), [], t);
  assert.equal(builtinLayoutFor({ template: 'number', big: '1' }).id, 'number');
  assert.equal(builtinLayoutFor({ template: 'text', headline: 'h' }).id, 'text');
  // the templates not converted yet are still drawn by their functions; so is anything that is not a template
  for (const t of [...Object.keys(LEGACY_FNS).filter((x) => !CONVERTED.includes(x)), 'layout', 'carousel', 'constructor', '__proto__', 'toString']) assert.equal(builtinLayoutFor({ template: t }), null, t);
  assert.equal(builtinLayoutFor(null), null);
});

test('a converted template draws exactly the page its function drew, for every case, style and carousel page', () => {
  assert.ok(pages.length >= 10, `${pages.length} pages`);
  for (const [style, brand] of Object.entries(brands)) {
    for (const p of pages) {
      const spec = forSize(p.spec, 'feed');
      const drawn = [p.counter, undefined, { n: 1, total: 4 }, { n: 3, total: 4 }].map((counter) => draw(spec.template, spec, ctxOf(brand, counter)));
      fx.check({ page: p.id, style }, drawn, `${style} ${p.id}`);
    }
  }
});

test('the same page with every field filled, empty, hostile, and every ground and accent', () => {
  const H = ['"><script>window.__pwn=1</script>', '</style><script>x</script>', '<img src=x onerror=alert(1)>', '*a* \\n b', '`${x}`'];
  const specs = [];
  for (const h of H) {
    specs.push({ template: 'number', big: h.slice(0, 40), line: h, stats: [[h, h], [h, h], [h, h]], image: 'a.jpg', label: h.slice(0, 40) });
    specs.push({ template: 'text', headline: h, sub: h, label: h.slice(0, 40), headRight: h.slice(0, 30) });
  }
  for (const ground of ['light', 'soft', 'cool', 'warm', 'dark', 'deep', 'white', 'tint', 'mint', 'gold-pale', 'ink']) {
    for (const accent of [undefined, 'muted', 'colour', 'weight', 'none']) {
      specs.push({ template: 'number', big: '1', ground, accent }, { template: 'number', big: '1', ground, accent, image: 'a.jpg', series: 'the-numbers' });
      specs.push({ template: 'text', headline: 'a *b*', ground, accent, dots: false }, { template: 'text', headline: 'a *b*', ground, accent, size: 70, series: 'news' });
    }
  }
  specs.push({ template: 'number', big: '1', ground: 'photo', image: 'a.jpg', photoTop: 300 }, { template: 'number', big: '1', image: 'a.jpg', photoTop: 960, focal: '10% 90%', zoom: 2 });
  for (const size of [70, 84, 112]) specs.push({ template: 'text', headline: 'h', size });
  for (const [style, brand] of Object.entries(brands)) {
    for (const s of specs) {
      const spec = forSize(normaliseDesign(s), 'feed');
      const drawn = [undefined, { n: 1, total: 2 }, { n: 2, total: 2 }].map((counter) => draw(s.template, spec, ctxOf(brand, counter)));
      fx.check({ s, style }, drawn, `${style} ${JSON.stringify(s).slice(0, 120)}`);
    }
  }
});

test('a converted template refuses what its function refused, with the same words', () => {
  const same = (s) => fx.check({ refused: s }, refusal(s.template, forSize(normaliseDesign(s), 'feed'), ctxOf(demo)), JSON.stringify(s));
  same({ template: 'number', big: '1', ground: 'photo' }); // a photo ground with no photo
  same({ template: 'number', big: '1', series: 'nope' });
  same({ template: 'number', big: '1', ground: 'purple', image: 'a.jpg' });
  same({ template: 'text', headline: 'h', series: 'nope' });
  same({ template: 'text', headline: 'h', ground: 'photo' });
});

test('the renderer draws a converted template from its layout, with the templates\' fit margins', () => {
  const brand = { ...demo, root: demo.root };
  const p = preparePage(brand, { spec: normaliseDesign({ template: 'text', headline: 'h' }), sizeName: 'feed' });
  assert.equal(p.layout.id, 'text');
  assert.deepEqual({ pad: layoutFit(p.layout, 'feed').pad, top: layoutFit(p.layout, 'feed').top }, { pad: 62, top: 46 });
  assert.equal(preparePage(brand, { spec: normaliseDesign({ template: 'number', big: '1' }), sizeName: 'feed' }).layout.id, 'number');
  // a template that is not converted has no layout (the closing page, while it is drawn by its function)
  if (!CONVERTED.includes('closing')) assert.equal(preparePage(brand, { spec: normaliseDesign({ template: 'closing' }), sizeName: 'feed' }).layout, null);
});

// Every design the templates' validator accepts, over every choice the registry's variants are chosen by, is drawn from a
// layout: no valid design reaches a page without one (the template functions are gone).
test('every valid design of a built-in template, at every size and carousel page, has a built-in layout', () => {
  const REG = { title: 'T', rows: [['Rent', '400.00']], mark: 0 };
  const LEDGER = { columns: [{ label: 'Day' }, { label: 'Paid', align: 'end' }], rows: [['01', '10.00']] };
  const ARTEFACTS = [undefined, { type: 'ledger', ...LEDGER }, { type: 'register', ...REG }, { type: 'passbook', days: 30 }, { type: 'passbook', days: 30, register: REG }];
  const SIZES_ = [undefined, 70, 76, 84, 88, 104, 112, 120];
  const BASE = {
    object: [{ headline: 'h', image: 'a.jpg' }, { size: SIZES_, align: [undefined, 'left', 'center'], sub: [undefined, 's'] }],
    number: [{ big: '1' }, { image: [undefined, 'a.jpg'], ground: [undefined, 'photo'] }],
    product: [{ headline: 'h', image: 'a.png' }, { layout: [undefined, 'center', 'side', 'panel'], size: SIZES_, glow: [undefined, true, false], sub: [undefined, 's'] }],
    'myth-fact': [{ myth: 'm', factLead: 'f' }, { fact: [undefined, 'x'] }],
    closing: [{}, { map: [undefined, true, false], headline: [undefined, 'h'] }],
    cover: [{ headline: 'h', image: 'a.jpg' }, { sub: [undefined, 's'] }],
    text: [{ headline: 'h' }, { artefact: ARTEFACTS, size: SIZES_, sub: [undefined, 's'], register: [undefined, REG] }],
    ledger: [{ headline: 'h', ...LEDGER }, { size: SIZES_, sub: [undefined, 's'], notes: [undefined, ['n']] }],
    passbook: [{ headline: 'h' }, { size: SIZES_, sub: [undefined, 's'], register: [undefined, REG], artefact: [undefined, { type: 'passbook', register: REG }] }],
    stats: [{ big: '1' }, { image: [undefined, 'a.jpg'], stats: [undefined, ['1|a'], ['1|a', '2|b', '3|c']] }],
    screen: [{ headline: 'h', image: 'a.png' }, { device: [undefined, 'phone', 'desktop'], beside: [undefined, { days: 31 }], fade: [undefined, true, false], glow: [undefined, false], pills: [undefined, ['p']], sub: [undefined, 's'] }],
    'photo-story': [{ headline: 'h', image: 'a.jpg' }, { layout: [undefined, 'panel', 'print', 'center', 'side'], sub: [undefined, 's'] }],
    photo: [{ headline: 'h', image: 'a.jpg' }, { textAt: [undefined, 'top', 'bottom', { feed: 'bottom', story: 'top' }], scrim: [undefined, 'none'], sizes: [undefined, ['feed', 'wide', 'story', 'square']] }],
    pagecover: [{}, { kind: [undefined, 'profile', 'facebook', 'linkedin', 'x', 'feed'] }],
  };
  const product = (vary) => Object.entries(vary).reduce((list, [k, vs]) => list.flatMap((o) => vs.map((v) => (v === undefined ? o : { ...o, [k]: v }))), [{}]);
  let n = 0;
  for (const [template, [base, vary]] of Object.entries(BASE)) {
    for (const v of product(vary)) {
      const d = { template, ...base, ...v };
      if (validateDesign(d).length) continue;
      const spec = normaliseDesign(d);
      const sizes = template === 'pagecover' ? [d.kind] : spec.sizes;
      for (const size of sizes) {
        for (const counter of template === 'photo' || template === 'pagecover' ? [undefined] : [undefined, { n: 1, total: 2 }, { n: 2, total: 2 }]) {
          assert.ok(builtinLayoutFor(forSize(spec, size), counter), `no layout for ${JSON.stringify(d)} at ${size} ${JSON.stringify(counter)}`);
          n++;
        }
      }
    }
  }
  assert.ok(n > 1000, `${n} designs`);
});

test('every page of the harness, at every size it is made at and for every style, has the markup recorded', async () => {
  const all = await currentMarkup();
  let n = 0;
  for (const [style, files] of Object.entries(all)) for (const [file, text] of Object.entries(files)) { harness.check(`${style}/${file}`, text); n++; }
  assert.ok(n >= 400, `${n} pages`);
});

test('the markup fixture holds every case these tests draw, and only those', () => {
  fx.done();
  harness.done();
});
