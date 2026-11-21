// node --test   (a brand's own layouts on the built-in templates' poster and editorial pages: Settings, Layouts lists the built-in
// layouts and copies one into a brand's layout. What reads a setting of the built-in templates' own designs, and the photo post's
// and the page covers' pages, stay the built-in layouts' only; every copy is a valid brand layout, takes only validated values,
// draws hostile words only escaped, and renders with the demo brand. The real renders need Google Chrome.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBrand, loadSeries } from './lib/design/brand.mjs';
import { BUILTIN } from './lib/design/builtin-layouts.mjs';
import { findChrome } from './lib/design/chrome.mjs';
import { DesignError } from './lib/design/errors.mjs';
import { BLOCKS, BRAND_PAGE_KINDS, CHOICE_NAMES, SPEC_CHOICES, layoutCatalogue, layoutDesignProblems, normaliseLayoutDesign, sampleDesign, validateLayout, validateLayouts } from './lib/design/layout.mjs';
import { renderLayout } from './lib/design/layout-render.mjs';
import { builtinCopy, builtinCopyProblems, builtinLayouts } from './lib/design/layout-starters.mjs';
import { preparePage } from './lib/design/render.mjs';
import { SIZES, SIZE_NAMES } from './lib/design/sizes.mjs';
import { forSize } from './lib/design/spec.mjs';
import { renderDesignBlock } from './lib/design-render.mjs';

const brand = loadBrand();
const SERIES = loadSeries();
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const has = (errs, frag) => errs.some((e) => e.includes(frag));
const H = ['"><script>window.__pwn=1</script>', '</style><script>x</script>', '<img src=x onerror=alert(1)>', 'url(http://evil.example/x)', '`${x}`', '*a* \\n b'];
const HOSTILE = [...H, '__proto__', 'constructor', '1e3', NaN, -1, 1.5, 1e9, null, {}, [], true, 'true'];
const list = builtinLayouts();
const copyable = list.filter((b) => b.copyable);
const copies = copyable.map((b) => builtinCopy(b.layout.id, { newId: `my-${b.layout.id}`.slice(0, 40), name: 'Mine' }));
const BUILTIN_ONLY_OPTIONS = Object.entries(BLOCKS).flatMap(([t, s]) => Object.entries(s.options).filter(([, o]) => o.builtin).map(([k]) => [t, k]));

test('Settings, Layouts lists every built-in layout but the page covers, and says which a brand may copy and why not', () => {
  const ids = Object.values(BUILTIN).flat().map((v) => v.layout.id).filter((id) => !id.startsWith('pagecover'));
  assert.deepEqual(list.map((b) => b.layout.id), ids);
  assert.ok(!list.some((b) => b.template === 'pagecover' || b.layout.page === 'cover'));
  // every poster and editorial layout may be copied but the phone beside a passbook (the card is the design's own "beside"); the
  // photo post may not (its page is the renderer's photo post, run by the photo template's own settings)
  assert.deepEqual(list.filter((b) => !b.copyable).map((b) => b.layout.id), ['screen-beside', 'photo']);
  assert.match(list.find((b) => b.layout.id === 'photo').why, /photo page is for the built-in layouts only: the renderer raises the photo post's scrim/);
  assert.match(list.find((b) => b.layout.id === 'screen-beside').why, /beside block draws a setting of the built-in template's own designs/);
  assert.equal(list.find((b) => b.layout.id === 'product-side').variant, 'layout is side');
  assert.equal(list.find((b) => b.layout.id === 'text-ledger').variant, 'artefact is ledger');
  assert.equal(list.find((b) => b.layout.id === 'object').variant, null);
  for (const id of ['photo', 'screen-beside', 'pagecover-x', 'nope', '__proto__', undefined]) assert.equal(builtinCopy(id), null, String(id));
});

test('every copy is a valid brand layout: the same page and rectangles, without what reads the templates\' own settings', () => {
  assert.deepEqual(builtinCopyProblems(), []);
  assert.equal(copies.length, 21);
  copies.forEach((c, i) => {
    const src = copyable[i].layout;
    assert.deepEqual(validateLayout(c), [], c.id);
    assert.ok(BRAND_PAGE_KINDS.includes(c.page) && c.page === src.page, c.id);
    assert.deepEqual(Object.keys(c.canvas), ['feed'], c.id);
    assert.equal(c.id, `my-${src.id}`.slice(0, 40));
    assert.equal(c.name, 'Mine');
    const blocks = c.blocks.flatMap((b) => [b, ...(b.children ?? [])]);
    for (const b of blocks) {
      assert.ok(!BLOCKS[b.type].builtin, `${c.id} ${b.type}`);
      for (const [t, k] of BUILTIN_ONLY_OPTIONS) if (b.type === t) assert.equal(b[k], undefined, `${c.id} ${t}.${k}`);
      if (b.when?.field !== undefined) assert.ok(SPEC_CHOICES[b.when.field].brand, `${c.id} ${JSON.stringify(b.when)}`);
      if (b.from !== undefined) assert.equal(b.from, 'field');
    }
    // the copy never changes the built-in layout itself
    assert.notEqual(c.blocks, src.blocks);
  });
  // what a brand's design reads is settled: object's headline at its default size (104), the closing page without the map, the
  // artefacts of the variant's type from the layout's artefact field
  const byId = (id) => copies[copyable.findIndex((b) => b.layout.id === id)];
  assert.deepEqual(byId('object').blocks.filter((b) => b.type === 'headline').map((b) => b.size), [104]);
  assert.ok(!byId('closing').blocks.some((b) => b.type === 'decoration' && b.kind === 'map'));
  assert.equal(byId('closing').blocks.filter((b) => b.type === 'headline').length, 1);
  assert.deepEqual(byId('ledger').fields.artefact.types, ['ledger']);
  assert.deepEqual(byId('passbook-register').fields.artefact.types, ['passbook']);
  assert.deepEqual(byId('text-register').fields.artefact.types, ['register']);
  assert.ok(byId('screen').blocks.some((b) => b.type === 'halo'), 'the glow is on by default');
  assert.ok(!byId('screen-desktop').blocks.some((b) => b.specWindow !== undefined));
});

test('a brand\'s layout is refused what reads the built-in templates\' own settings, and the photo post\'s and covers\' pages', () => {
  const ed = () => structuredClone(copies[copyable.findIndex((b) => b.layout.id === 'text-ledger')]);
  const po = () => structuredClone(copies[copyable.findIndex((b) => b.layout.id === 'product')]);
  const head = (l) => l.blocks.find((b) => b.type === 'headline');
  const msg = 'reads a setting of the built-in templates\' own designs';
  // each option, refused for a brand and accepted for a built-in layout
  for (const [l, set] of [
    [ed(), (x) => { head(x).specSize = true; }],
    [ed(), (x) => { head(x).lists = true; }],
    [ed(), (x) => { x.blocks.find((b) => b.type === 'artefact').from = 'ledger'; }],
    [ed(), (x) => { x.blocks.find((b) => b.type === 'artefact').from = 'passbook'; }],
    [po(), (x) => { head(x).specAlign = true; }],
    [po(), (x) => { x.blocks.find((b) => b.type === 'screen').phoneTop = true; }],
  ]) {
    set(l);
    assert.ok(has(validateLayout(l), msg), JSON.stringify(validateLayout(l)));
    assert.deepEqual(validateLayout(l, 'layout', { builtin: true }), []);
  }
  const desk = structuredClone(copies[copyable.findIndex((b) => b.layout.id === 'screen-desktop')]);
  desk.blocks.find((b) => b.type === 'screen').specWindow = true;
  assert.ok(has(validateLayout(desk), msg));
  // the beside card
  const beside = structuredClone(BUILTIN.screen.find((v) => v.layout.id === 'screen-beside').layout);
  assert.ok(has(validateLayout(beside), 'a beside block draws a setting of the built-in templates\' own designs'));
  assert.deepEqual(validateLayout(beside, 'layout', { builtin: true }), []);
  // conditions on the templates' own choices; the artefact and its register card are a brand design's own
  for (const name of CHOICE_NAMES) {
    const l = ed(), c = SPEC_CHOICES[name];
    head(l).when = { ...head(l).when, field: name, is: c.values[0] };
    const errs = validateLayout(l).filter((e) => e.includes('.when.field'));
    if (c.brand) assert.deepEqual(errs, [], name);
    else assert.ok(has(errs, 'field must be one of artefact, register on a brand\'s own layout'), name);
  }
  // the photo post's and the page covers' pages
  const photo = structuredClone(BUILTIN.photo[0].layout);
  assert.ok(has(validateLayout(photo), 'a photo page is for the built-in layouts only'));
  assert.deepEqual(validateLayout(photo, 'layout', { builtin: true }), []);
  const cover = structuredClone(BUILTIN.pagecover[0].layout);
  assert.ok(has(validateLayout(cover), 'a cover page is for the built-in layouts only'));
  // a brand's list of layouts, as brand.json holds it, is held to the same
  assert.ok(has(validateLayouts([photo]), 'a photo page is for the built-in layouts only'));
  assert.deepEqual(validateLayouts(copies), []);
  // the built-in pages are drawn at the feed size only, built-in or not
  for (const size of ['square', 'story', 'wide']) {
    const l = ed();
    l.canvas[size] = { ...l.canvas.feed };
    assert.ok(has(validateLayout(l), `canvas has a ${size} size, but an editorial page is drawn at the feed size only`), size);
    assert.ok(has(validateLayout(l, 'layout', { builtin: true }), 'drawn at the feed size only'), size);
  }
});

test('hostile values in a brand\'s layout on a built-in page are refused before they could reach a page', () => {
  for (const c of copies) {
    for (const v of HOSTILE) {
      const errs = (f) => { const l = structuredClone(c); f(l); return validateLayout(l); };
      assert.ok(errs((l) => { l.page = v; }).length, `${c.id} page ${String(v)}`);
      assert.ok(errs((l) => { l.ground = v; }).length || v === 'true', `${c.id} ground ${String(v)}`);
      assert.ok(errs((l) => { l.blocks[0].type = v; }).length, `${c.id} type ${String(v)}`);
      const pxBlock = c.blocks.findIndex((b) => b.px);
      for (const k of ['x', 'y', 'w', 'h']) assert.ok(errs((l) => { l.blocks[pxBlock].px[k] = v; }).length, `${c.id} px.${k} ${String(v)}`);
      assert.ok(errs((l) => { l.blocks[pxBlock].when = { field: v, is: 'ledger' }; }).length, `${c.id} when ${String(v)}`);
      for (const [i, b] of c.blocks.entries()) {
        for (const [k, o] of Object.entries(layoutCatalogue().pages[c.page].blocks[b.type]?.options ?? {})) {
          const fine = o.type === 'bool' ? typeof v === 'boolean' : o.type === 'enum' ? o.values.includes(v) : Number.isInteger(v) && v >= o.min && v <= o.max;
          if (!fine) assert.ok(errs((l) => { l.blocks[i][k] = v; }).length, `${c.id} ${b.type}.${k} ${String(v)}`);
        }
      }
      // every message quotes a hostile value back without its markup
      for (const e of errs((l) => { l.blocks[pxBlock].px = v; l.blocks[0][v] = v; })) assert.ok(!/<script|<img|<\/style>/.test(e), e);
    }
  }
  // what the editor and the AI are offered on these pages is what a brand's layout may use
  const cat = layoutCatalogue().pages;
  assert.deepEqual(Object.keys(cat), ['grid', 'poster', 'editorial']);
  for (const [name, p] of Object.entries(cat)) {
    assert.deepEqual(p.sizes, name === 'grid' ? SIZE_NAMES : ['feed']);
    for (const [t, b] of Object.entries(p.blocks)) {
      assert.ok(!BLOCKS[t].builtin, t);
      for (const k of Object.keys(b.options)) assert.ok(!BLOCKS[t].options[k].builtin, `${t}.${k}`);
    }
    if (name === 'editorial') assert.deepEqual(p.blocks.artefact.options.from.values, ['field']);
  }
});

test('every copy draws its sample words, and hostile words in every field only escaped', () => {
  const ctx = (layouts) => ({ size: SIZES.feed, brand, layouts, image: () => PIXEL, imageSize: () => ({ w: 660, h: 1354 }) });
  for (const c of copies) {
    const d = sampleDesign(c);
    assert.deepEqual(layoutDesignProblems(d, 'design', { layouts: [c], series: SERIES }), [], c.id);
    const p = preparePage(brand, { spec: normaliseLayoutDesign(d, [c]), sizeName: 'feed', layouts: [c] });
    assert.ok(p.out.body.length > 100, c.id);
    for (const h of H) {
      const spec = { ...d };
      for (const k of Object.keys(c.fields)) if (typeof d[k] === 'string' && k !== 'image') spec[k] = h;
      spec.label = h.slice(0, 40);
      if (Array.isArray(d.stats)) spec.stats = d.stats.map(() => [h, h]);
      const out = renderLayout(forSize(spec, 'feed'), ctx([c]));
      for (const bad of ['<script', '<img src=x', '</style>', '`${']) assert.ok(!out.body.includes(bad), `${c.id} ${bad}`);
      assert.ok(!/style="[^"]*url\(/.test(out.body), c.id);
    }
  }
  // a copy that names a series the brand does not have is refused, as its built-in layout refuses it
  const c = copies[0];
  assert.throws(() => renderLayout(forSize({ ...sampleDesign(c), series: 'nope' }, 'feed'), ctx([c])), DesignError);
});

const chrome = findChrome() ? false : 'Google Chrome not found';
test('real render: every copy of a built-in layout renders with the demo brand and passes every check', { skip: chrome }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-builtin-copy-'));
  try {
    for (const c of copies) {
      const r = await renderDesignBlock({ design: sampleDesign(c), layouts: copies, postId: c.id, outDir: out });
      assert.equal(r.ok, true, `${c.id}: ${r.error}`);
      assert.deepEqual([r.files[0].w, r.files[0].h], [1080, 1350], c.id);
    }
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
