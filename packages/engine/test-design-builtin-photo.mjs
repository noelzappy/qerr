// node --test   (the photo group of the built-in templates as layouts, lib/design/builtin/photo.mjs: the full-bleed photo post
// at every size is drawn from its layout, by lib/design/layout-photo.mjs, and the page is exactly the one its function drew,
// for fields filled, empty and hostile, text at the top, the bottom or per size, every style variant and every size; and the
// photo page's block types and options are checked like the rest of the format. The page covers likewise: one layout per kind,
// drawn by lib/design/layout-cover.mjs at the cover sizes, the same page as their function's. No Chrome: the pixel comparison is
// testlib/template-baseline.mjs, see testlib/CONVERTING.md.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { brandFile } from './lib/core.mjs';
import { loadBrand, normaliseBrand } from './lib/design/brand.mjs';
import { builtinLayoutFor } from './lib/design/builtin-layouts.mjs';
import { BLOCK_TYPES, exclusive, layoutCatalogue, validateLayout, whenHolds, whenProblems } from './lib/design/layout.mjs';
import { layoutFit, renderLayoutWith } from './lib/design/layout-render.mjs';
import { preparePage } from './lib/design/render.mjs';
import { COVER_SIZES, SIZES, SIZE_NAMES } from './lib/design/sizes.mjs';
import { forSize, normaliseDesign, validateDesign } from './lib/design/spec.mjs';
import { LEGACY_FNS, TEMPLATE_FNS } from './design/templates/index.mjs';
import { markupFixture } from './testlib/markup-fixture.mjs';
import { STYLES } from './testlib/template-baseline.mjs';

const RAW = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
const demo = loadBrand();
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brands = Object.fromEntries(Object.entries(STYLES).map(([k, style]) => [k, style ? { ...demo, ...normaliseBrand({ ...RAW, style }) } : demo]));
// Two more looks: the logo on the right with the website, and a brand whose accent device is "none" (the body's acc-none).
brands.right = { ...demo, ...normaliseBrand({ ...RAW, style: { logo: 'bottom-right', footer: 'website' } }) };
brands.noaccent = { ...demo, ...normaliseBrand({ ...RAW, style: { type: { accent: 'none' } } }) };
const ctxOf = (brand, size, counter) => ({ size: SIZES[size], brand, counter, image: () => PIXEL, imageSize: () => ({ w: 1800, h: 1200 }) });
const parts = (o) => ({ body: o.body, bodyClass: o.bodyClass ?? '', bodyAttrs: o.bodyAttrs ?? '', sheet: o.sheet ?? '', warnings: o.warnings ?? [] });
// The pages are checked against the hashes recorded from the template functions (testlib/markup-fixture.mjs).
const fx = markupFixture('photo');
const draw = (t, spec, ctx) => {
  const page = parts(TEMPLATE_FNS[t](spec, ctx));
  assert.deepEqual(page, parts(LEGACY_FNS[t](spec, ctx)), `${t}: the layout's page is the function's`);
  return page;
};
const refusal = (t, spec, ctx) => {
  let a, b;
  try { TEMPLATE_FNS[t](spec, ctx); } catch (e) { a = e; }
  try { LEGACY_FNS[t](spec, ctx); } catch (e) { b = e; }
  assert.ok(a instanceof DesignError && b instanceof DesignError, `${JSON.stringify(spec).slice(0, 120)}: ${a} / ${b}`);
  assert.equal(a.message, b.message);
  return `DesignError: ${a.message}`;
};
const has = (errs, frag) => errs.some((e) => e.includes(frag));
const H = ['"><script>window.__pwn=1</script>', '</style><script>x</script>', '<img src=x onerror=alert(1)>', '*a* \\n b', '`${x}`', 'url(http://evil.example/x)'];

// One case: the spec drawn at every size, for every look and page.
const same = (s) => {
  assert.deepEqual(validateDesign(s), [], JSON.stringify(s));
  const drawn = [];
  for (const brand of Object.values(brands)) for (const size of SIZE_NAMES) for (const counter of [undefined, { n: 1, total: 2 }]) drawn.push(draw('photo', forSize(normaliseDesign(s), size), ctxOf(brand, size, counter)));
  fx.check({ s }, drawn, JSON.stringify(s).slice(0, 160));
};

test('the photo post is drawn from its layout at every size', () => {
  for (const size of SIZE_NAMES) {
    const p = preparePage({ ...demo }, { spec: normaliseDesign({ template: 'photo', headline: 'h', image: 'design/assets/demo/scene-market.jpg', sizes: [size] }), sizeName: size });
    assert.equal(p.layout?.id, 'photo', size);
    // the fit check holds the text to the size's own margins, as for the function
    assert.equal(layoutFit(p.layout, size), SIZES[size]);
    assert.match(p.out.body, /^<div class="pcanvas photo"><img class="bg"/);
  }
  assert.equal(builtinLayoutFor({ template: 'photo', headline: 'h', image: 'a.jpg', textAt: 'bottom' }).id, 'photo');
});

test('the same page as the function: fields filled, empty and hostile, text top, bottom and per size, every look and size', () => {
  const specs = [
    { template: 'photo', headline: 'Saving, *together.*', image: 'a.jpg' },
    { template: 'photo', eyebrow: 'Market day', headline: 'Saving, *together.*', sub: 'Every *deposit* on the record.', image: 'a.jpg' },
    { template: 'photo', eyebrow: 'E', headline: 'h', sub: 's', image: 'a.jpg', textAt: 'bottom' },
    { template: 'photo', headline: 'h', sub: 's', image: 'a.jpg', textAt: 'top', scrim: 'none', scrimPeak: 0.4, lines: false },
    { template: 'photo', eyebrow: 'E', headline: 'h\\nline two', image: 'a.jpg', textAt: { feed: 'bottom', square: 'top', story: 'bottom' }, focal: { feed: '10% 90%', wide: 'left top' } },
    { template: 'photo', headline: 'h', image: 'a.jpg', textAt: { story: 'bottom' }, focal: { x: 0.25, y: 0.75 }, lines: [{ t: 'br', x: 0.1, y: 0.6, l: 0.06 }] },
    { template: 'photo', headline: 'h', image: 'a.jpg', focal: 'center top' },
  ];
  for (const h of H) {
    specs.push({ template: 'photo', eyebrow: h.slice(0, 60), headline: h, sub: h, image: `${h.replace(/[^a-z]/g, '') || 'x'}.jpg` });
    specs.push({ template: 'photo', eyebrow: h.slice(0, 60), headline: h, sub: h, image: 'a.jpg', textAt: 'bottom' });
  }
  for (const s of specs) same(s);
});

test('a hostile focal point or textAt that slipped past the validator is still drawn as the function drew it', () => {
  for (const size of SIZE_NAMES) {
    for (const v of ['"><x', 'middle', '', null, undefined, 1]) {
      const spec = { ...forSize(normaliseDesign({ template: 'photo', headline: 'h', image: 'a.jpg' }), size), textAtResolved: v, focalCss: v };
      fx.check({ size, v: v === undefined ? 'undefined' : v }, draw('photo', spec, ctxOf(demo, size)), `${size} ${v}`);
    }
  }
});

// A photo page as a brand could not write it (the registry's own format), to test its block types and options.
const photoLayout = (head = {}, more = {}) => ({
  id: 'p', name: 'Photo', page: 'photo',
  fields: { headline: { required: true }, sub: {}, image: { required: true } },
  canvas: { feed: { columns: 12, rows: 15, margin: { top: 80, right: 70, bottom: 56, left: 70 }, gutter: 20 } },
  blocks: [
    { type: 'backdrop', px: { x: 0, y: 0, w: 1080, h: 1350 } },
    { type: 'scrim' },
    { type: 'lines' },
    { type: 'headline', eyebrow: true, subField: 'sub', px: { x: 70, y: 84, w: 880, h: 1115 }, ...head },
    { type: 'photoFooter' },
  ],
  ...more,
});
const mod = (f, head) => { const l = photoLayout(head); f(l); return validateLayout(l); };

test('the photo page\'s block types and options: valid, invalid and hostile', () => {
  assert.deepEqual(validateLayout(photoLayout()), []);
  assert.deepEqual(validateLayout(photoLayout({ valign: 'bottom' })), []);
  assert.deepEqual(validateLayout(photoLayout({ eyebrow: false, subField: undefined }, { fields: { headline: {}, image: {} } })), []);
  for (const v of ['yes', 1, null, {}, '"><x']) assert.ok(has(mod(() => {}, { eyebrow: v }), 'eyebrow must be true or false'), String(v));
  for (const v of ['middle', 'BOTTOM', 1, '"><x']) assert.ok(has(mod(() => {}, { valign: v }), 'valign must be one of'), String(v));
  // the photo page sets its own type and width; what it does not draw is refused
  assert.ok(has(mod(() => {}, { size: 112 }), '.size is not used on a photo page'));
  assert.ok(has(mod(() => {}, { align: 'center' }), '.align is not used on a photo page'));
  assert.ok(has(mod(() => {}, { subWidth: 500 }), 'subWidth is used on poster and editorial pages only'));
  assert.ok(has(mod((l) => l.blocks.push({ type: 'sub', px: { x: 70, y: 1210, w: 500, h: 40 } }), {}), 'a photo page does not draw a sub block'));
  assert.ok(has(mod((l) => l.blocks.push({ type: 'bar' }), {}), 'a bar block belongs to poster pages'));
  // the chrome has no rectangle; the backdrop takes the image field
  assert.ok(has(mod((l) => { l.blocks[1].px = { x: 0, y: 0, w: 10, h: 10 }; }), 'a scrim has no slot'));
  assert.ok(has(mod((l) => { l.blocks[4].px = { x: 0, y: 0, w: 10, h: 10 }; }), 'a photoFooter has no slot'));
  assert.ok(has(mod((l) => { delete l.fields.image; }), '"image" is not in the layout\'s fields'));
  assert.ok(has(mod((l) => { l.blocks[0].field = 'headline'; }), 'a backdrop cannot show "headline"'));
  // text keeps inside the size's minimum margins
  assert.ok(has(mod(() => {}, { px: { x: 10, y: 84, w: 880, h: 1115 } }), 'keeps inside the feed page\'s minimum margins'));
  // two headline boxes on the same text must exclude each other
  assert.ok(has(mod((l) => l.blocks.push({ type: 'headline', valign: 'bottom', subField: 'sub', px: { x: 70, y: 84, w: 880, h: 1115 } })), 'is shown by more than one block'));
  assert.deepEqual(mod((l) => { l.blocks[3].when = { field: 'textAt', is: 'top' }; l.blocks.push({ type: 'headline', when: { field: 'textAt', not: 'top' }, valign: 'bottom', subField: 'sub', px: { x: 70, y: 84, w: 880, h: 1115 } }); }), []);
  // a brand's own (grid) layout cannot use any of it, and the editor and the AI are not offered it
  const grid = { id: 'g', name: 'G', fields: { headline: {}, image: {} }, canvas: { feed: { columns: 12, rows: 15, margin: 70 } }, blocks: [{ type: 'headline', slot: { col: 1, row: 1, width: 12, height: 4 }, eyebrow: true }, { type: 'backdrop', slot: { col: 1, row: 5, width: 12, height: 4 } }] };
  assert.ok(has(validateLayout(grid), 'eyebrow is used on photo pages only'));
  assert.ok(has(validateLayout(grid), 'a backdrop block belongs to photo pages'));
  for (const t of ['backdrop', 'scrim', 'lines', 'photoFooter']) assert.ok(!BLOCK_TYPES.includes(t) && !(t in layoutCatalogue().blocks), t);
  assert.ok(!('eyebrow' in layoutCatalogue().blocks.headline.options));
});

test('a photo page draws hostile text only escaped, and its numbers only from the layout and the page\'s type table', () => {
  for (const h of H) {
    const spec = forSize(normaliseDesign({ template: 'photo', eyebrow: h.slice(0, 60), headline: h, sub: h, image: 'a.jpg' }), 'feed');
    const body = renderLayoutWith(photoLayout(), spec, ctxOf(demo, 'feed')).body;
    assert.ok(!/<script|<img src=x|<\/style>|style="[^"]*url\(/.test(body), h);
  }
  // a layout that has no rectangle for a size is refused there, as any layout
  const spec = forSize(normaliseDesign({ template: 'photo', headline: 'h', image: 'a.jpg' }), 'story');
  assert.throws(() => renderLayoutWith(photoLayout(), spec, ctxOf(demo, 'story')), /has no story size/);
});

test('a condition on a page cover\'s kind: one of the cover sizes, unset on any other design, never on a grid page', () => {
  assert.deepEqual(whenProblems({ field: 'kind', is: 'profile' }, []), []);
  assert.deepEqual(whenProblems({ field: 'kind', not: ['x', 'linkedin'] }, []), []);
  for (const v of ['feed', 'Profile', '"><x', 1, null]) assert.ok(whenProblems({ field: 'kind', is: v }, []).some((e) => e.includes('.is must be one of profile, facebook, linkedin, x')), String(v));
  assert.ok(whenProblems({ field: 'kind', is: 'x' }, [], 'w', { page: 'grid' }).some((e) => e.includes('field must be one of artefact on a grid page')));
  assert.equal(whenHolds({ field: 'kind', is: 'facebook' }, { template: 'pagecover', kind: 'facebook' }), true);
  assert.equal(whenHolds({ field: 'kind', is: 'facebook' }, { template: 'pagecover', kind: 'x' }), false);
  assert.equal(whenHolds({ field: 'kind', is: 'facebook' }, { template: 'text' }), false);
  assert.equal(whenHolds({ field: 'kind', not: 'facebook' }, { template: 'text' }), true);
  assert.equal(exclusive({ field: 'kind', is: 'x' }, { field: 'kind', is: 'profile' }), true);
  assert.equal(exclusive({ field: 'kind', is: 'x' }, { field: 'kind', not: 'profile' }), false);
});

// ---- the page covers ----
const KINDS = Object.keys(COVER_SIZES);
const coverCtx = (brand, kind) => ({ size: COVER_SIZES[kind], brand, image: () => PIXEL, imageSize: () => null });

test('each page cover is drawn from its own layout, exactly as its function drew it, for every look and hostile brand words', () => {
  for (const kind of KINDS) {
    const p = preparePage({ ...demo }, { spec: { template: 'pagecover', kind }, sizeName: kind });
    assert.equal(p.layout?.id, `pagecover-${kind}`);
    assert.equal(layoutFit(p.layout, kind), COVER_SIZES[kind]);
  }
  const looks = Object.values(brands);
  for (const h of H) looks.push({ ...demo, tagline: `${h}, ${h}`, descriptor: `${h}.`, website: h, logoFullSrc: PIXEL, logoMarkSrc: PIXEL });
  looks.push({ ...demo, tagline: 'No comma here', descriptor: 'No full stop' });
  looks.forEach((brand, i) => {
    for (const kind of KINDS) {
      const spec = { template: 'pagecover', kind };
      fx.check({ cover: kind, look: i, words: [brand.tagline, brand.descriptor, brand.website] }, draw('pagecover', spec, coverCtx(brand, kind)), `${kind} ${brand.tagline}`);
      assert.ok(!/<script|<img src=x|<\/style>/.test(TEMPLATE_FNS.pagecover(spec, coverCtx(brand, kind)).body), kind);
    }
  });
  // a kind that slipped past the validator matches no layout, and the function draws it (an empty page), as before
  for (const kind of ['feed', '__proto__', undefined]) assert.equal(builtinLayoutFor({ template: 'pagecover', kind }), null, String(kind));
});

const coverLayout = (blk = {}, more = {}) => ({
  id: 'c', name: 'Cover', page: 'cover', fields: {},
  canvas: { facebook: { columns: 1, rows: 1, margin: 0, gutter: 0 } },
  blocks: [{ type: 'coverWords', px: { x: 0, y: 62, w: 1640, h: 500 }, ...blk }],
  ...more,
});

test('the cover page: its sizes, its block types and options, valid, invalid and hostile', () => {
  assert.deepEqual(validateLayout(coverLayout()), []);
  assert.deepEqual(validateLayout(coverLayout({ arrange: 'row', align: 'left', logo: 16, size: 200, subSize: 80, urlSize: 60, gap: 0, subGap: 120, urlGap: 0, subWidth: 1200 })), []);
  assert.deepEqual(validateLayout(coverLayout({}, { canvas: { profile: { columns: 1, rows: 1, margin: 0 } }, blocks: [{ type: 'coverMark', px: { x: 250, y: 250, w: 580, h: 580 } }] })), []);
  for (const [k, bad, msg] of [['arrange', 'grid', 'arrange must be one of column, row'], ['align', 'right', 'align must be one of center, left'], ['logo', 161, 'logo must be a whole number from 16 to 160'], ['size', 23, 'size must be a whole number from 24 to 200'], ['subWidth', 99.5, 'subWidth must be a whole number from 100 to 1200'], ['gap', '"><x', 'gap must be a whole number from 0 to 160'], ['urlGap', -1, 'urlGap must be a whole number'], ['subSize', null, 'subSize must be a whole number']]) {
    assert.ok(has(validateLayout(coverLayout({ [k]: bad })), msg), `${k} ${bad}`);
  }
  // only a cover page is drawn at the cover sizes, and a cover page only at them
  assert.ok(has(validateLayout(coverLayout({}, { canvas: { feed: { columns: 1, rows: 1, margin: 48 } } })), 'canvas has an unknown size "feed" (sizes of a cover page: profile, facebook, linkedin, x)'));
  assert.ok(has(validateLayout(photoLayout({}, { canvas: { facebook: { columns: 1, rows: 1, margin: 24 } } })), 'canvas has an unknown size "facebook"'));
  assert.ok(has(validateLayout(coverLayout({ px: { x: 0, y: 62, w: 1640, h: 600 } })), 'past the facebook page\'s height of 624'));
  // the cover's words are the brand's: no field needed there, and its blocks show none
  assert.ok(has(validateLayout(coverLayout({ field: 'headline' }, { fields: { headline: {} } })), 'a coverWords shows no field'));
  assert.ok(has(validateLayout({ ...photoLayout(), fields: {} }), 'fields must name at least one field'));
  // a cover page draws its own blocks only, and nobody else draws them
  assert.ok(has(validateLayout(coverLayout({}, { blocks: [{ type: 'headline', px: { x: 100, y: 100, w: 400, h: 100 } }], fields: { headline: {} } })), 'a cover page does not draw a headline block'));
  assert.ok(has(validateLayout(photoLayout({}, { blocks: [...photoLayout().blocks, { type: 'coverMark', px: { x: 0, y: 0, w: 10, h: 10 } }] })), 'a coverMark block belongs to cover pages'));
  for (const t of ['coverMark', 'coverWords']) assert.ok(!BLOCK_TYPES.includes(t) && !(t in layoutCatalogue().blocks), t);
  // drawn only at a cover size
  assert.throws(() => renderLayoutWith({ ...coverLayout(), canvas: { feed: {} } }, { template: 'pagecover', kind: 'x' }, ctxOf(demo, 'feed')), /drawn at the cover sizes only/);
});

test('the markup fixture holds every case these tests draw, and only those', () => fx.done());
