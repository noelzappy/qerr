// node --test   A post's own design (design.composition) and the art layer (the art primitive). Pure parts need no Chrome; the renders do.
//   1. the art geometry: units, caps, path commands;          2. the validator: the art's bounds, fixed lists, palette roles and caps;
//   3. a post's own design is held to the look exactly as the look's compositions are, and refused without a look;
//   4. an own design that cannot be drawn is refused before anything is drawn;
//   5. Chrome: an own design with art behind the words is drawn and said; art over the words is refused by the page, and the post falls
//      back to the look's variant with a note naming the reason (strictOwn refuses instead); an own design the look refuses falls back too.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/core.mjs';
import { loadBrand } from './lib/design/brand.mjs';
import { DesignError } from './lib/design/errors.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { postCompositionProblems, validateLook } from './lib/design/look.mjs';
import { validateDesign } from './lib/design/spec.mjs';
import { renderPostWithLook } from './lib/design/directions/index.mjs';
import { ART_LIMITS, artGeometry, pathProblems, pathPoints } from './lib/design/directions/art-geom.mjs';
import { findChrome } from './lib/design/chrome.mjs';
import { renderDesignBlock } from './lib/design-render.mjs';
import { validateBatch } from './lib/batch.mjs';
import { probePicture } from './lib/design/picture-probe.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
const PACK = 'brands/kettleworks';
const BRAND_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, PACK, 'brand.json'), 'utf8'));
const LOOK = BRAND_JSON.looks.find((l) => l.id === BRAND_JSON.style.direction);
const statement = () => clone(LOOK.compositions.find((c) => c.kind === 'statement'));
// the roast look's first statement, with art: a big soft circle behind the words, a ring and a line, at the back (z 0)
function withArt(z = 0, shapes) {
  const c = statement();
  c.name = 'Own art';
  c.elements.unshift({ type: 'art', place: { inset: 'page' }, z, shapes: shapes ?? [
    { shape: 'circle', cx: 120, cy: 160, r: 260, colour: 'light-tint' },
    { shape: 'ring', cx: 820, cy: 120, r: 140, stroke: 6, colour: 'accent', opacity: 0.6 },
    { shape: 'path', d: [['M', 80, 880], ['C', 300, 820, 500, 940, 700, 880]], stroke: 5, colour: 'accent' },
  ] });
  return c;
}

// ---- 1. geometry ----
test('art geometry: thousandths of the box, round shapes stay round, paths count their points, every cap holds', () => {
  const g = artGeometry([{ shape: 'circle', cx: 500, cy: 500, r: 100 }, { shape: 'rect', x: 0, y: 0, w: 500, h: 1000, radius: 50 }], 1000, 500);
  assert.deepEqual([g.pieces[0].x, g.pieces[0].y, g.pieces[0].w, g.pieces[0].h], [450, 200, 100, 100], 'a radius is thousandths of the shorter side');
  assert.deepEqual([g.pieces[1].w, g.pieces[1].h], [500, 500]);
  assert.equal(pathPoints([['M', 0, 0], ['L', 1, 1], ['Q', 1, 1, 2, 2], ['C', 1, 1, 2, 2, 3, 3], ['Z']]), 7);
  assert.deepEqual(pathProblems([['M', 0, 0], ['L', 10, 10]]), []);
  for (const bad of [[['L', 0, 0], ['L', 1, 1]], [['M', 0, 0], ['A', 1, 1, 0, 0, 1, 2, 2]], [['M', 0, 0], ['L', 1]], [['M', 0, 0], ['L', 1, 'x']], [['M', 0, 0], ['L', 1, 9e9]], [['M', 0, 0]], 'M0 0L1 1']) assert.ok(pathProblems(bad).length, JSON.stringify(bad));
  assert.throws(() => artGeometry(Array.from({ length: ART_LIMITS.shapes + 1 }, () => ({ shape: 'circle', cx: 1, cy: 1, r: 1 })), 100, 100));
  const big = [['M', 0, 0], ...Array.from({ length: 99 }, () => ['C', 1, 1, 2, 2, 3, 3])];
  assert.throws(() => artGeometry([{ shape: 'path', d: big }, { shape: 'path', d: big }], 100, 100), /points/);
  // a field of dots never holds more than the mark cap, however fine its spacing
  const dots = artGeometry([{ shape: 'dots', x: 0, y: 0, w: 1000, h: 1000, gap: 8, size: 1 }], 4000, 4000);
  assert.ok(dots.marks <= ART_LIMITS.marks);
  // paths hold numbers only
  for (const p of artGeometry([{ shape: 'path', d: [['M', 0, 0], ['L', 500, 500], ['Z']], rot: 30 }, { shape: 'stripes', x: 0, y: 0, w: 1000, h: 1000, gap: 40, width: 10 }, { shape: 'arc', cx: 500, cy: 500, r: 300, sweep: 90, stroke: 4 }], 1080, 1350).pieces) assert.match(p.d, /^[MLQCZAa0-9 .\-]+$/);
});

// ---- 2. the validator ----
const lookWith = (c) => ({ ...clone(LOOK), compositions: [c] });
test('art: a valid art layer passes; the caps, fixed lists, palette roles and placement are held', () => {
  assert.deepEqual(validateLook(lookWith(withArt()), 'look'), []);
  const cases = [
    [(c) => { c.elements[0].shapes = Array.from({ length: 25 }, () => ({ shape: 'circle', cx: 1, cy: 1, r: 1 })); }, /list of 1 to 24/],
    [(c) => { const d = [['M', 0, 0], ...Array.from({ length: 99 }, () => ['C', 1, 1, 2, 2, 3, 3])]; c.elements[0].shapes = [{ shape: 'path', d }, { shape: 'path', d }]; }, /path points; the most is 400/],
    [(c) => { c.elements.push({ type: 'art', place: { inset: 'page' }, shapes: Array.from({ length: 22 }, () => ({ shape: 'circle', cx: 1, cy: 1, r: 1 })) }); }, /shapes; the most is 24/],
    [(c) => { c.elements[0].shapes[0].colour = '#ff0000'; }, /never a hex/],
    [(c) => { c.elements[0].shapes[0].colour = 'accent-type'; }, /a colour a panel can be filled with/],
    [(c) => { c.elements[0].shapes[0].opacity = 1.5; }, /opacity must be a number from 0.05 to 1/],
    [(c) => { c.elements[0].shapes[0].blend = 'difference'; }, /blend must be one of/],
    [(c) => { c.elements[0].shapes[0].shape = 'star'; }, /shape must be one of/],
    [(c) => { c.elements[0].shapes[0].cx = 'calc(1px)'; }, /whole number/],
    [(c) => { c.elements[0].shapes[2].d = [['M', 0, 0], ['A', 1, 1, 0, 0, 1, 5, 5]]; }, /M, L, Q, C or Z/],
    [(c) => { c.elements[0].shapes[2].gradient = { kind: 'linear', stops: ["paper", "soft"] }; }, /"gradient" is not a setting/],
    [(c) => { c.elements[0].shapes[0].gradient = { kind: 'linear', stops: ['paper', 'soft'] }; }, /colour or a gradient/],
    [(c) => { c.elements[0].shapes[0].onload = 'x'; }, /not a setting/],
    [(c) => { c.elements[0].fill = 'paper'; }, /not a setting/],
    [(c) => { delete c.elements[0].place; }, /needs a place/],
    [(c) => { c.elements[3].children.push({ type: 'art', place: { px: { x: 0, y: 0, w: 10, h: 10 } }, shapes: [{ shape: 'circle', cx: 1, cy: 1, r: 1 }] }); }, /art goes at the top|holds/],
  ];
  for (const [edit, want] of cases) {
    const c = withArt();
    edit(c);
    const p = validateLook(lookWith(c), 'look');
    assert.ok(p.some((x) => want.test(x)), `${want}: ${p.join(' | ')}`);
    assert.ok(p.every((x) => x.length <= 200 && !/calc\(|onload/.test(x.replace(/"onload"/, ''))), p.join(' | '));
  }
});

// ---- 3. the post's own design ----
const post = (extra = {}) => ({ template: 'post', kind: 'statement', headline: 'Slow coffee, *quick smiles*', sub: 'Our filter of the week, poured by hand.', ...extra });
test('own design: held to the look like its compositions; refused without a look, of another kind, or with hostile values', () => {
  assert.deepEqual(validateDesign(post({ composition: withArt() }), 'design', { look: LOOK }), []);
  assert.deepEqual(postCompositionProblems(withArt(), LOOK, 'statement'), []);
  assert.match(validateDesign(post({ composition: withArt() }), 'design', { direction: 'retail' }).join(' '), /drawn with the brand's look/);
  assert.match(validateDesign(post({ composition: withArt() }), 'design').join(' '), /drawn with the brand's look/);
  assert.match(postCompositionProblems(withArt(), LOOK, 'photo')[0], /a statement post; this post is a photo/);
  const hostile = [
    JSON.parse('{"__proto__": {"x": 1}, "kind": "statement"}'), { ...withArt(), render: 'alert(1)' }, { ...withArt(), name: '<script>alert(1)</script>\u0000' },
    (() => { const c = withArt(); c.elements[1].fill = 'red;background:url(x)'; return c; })(), (() => { const c = withArt(); c.elements[0].shapes[0].colour = 'javascript:alert(1)'; return c; })(),
    (() => { const c = withArt(); c.ground = 'tint'; return c; })(), // a page colour the look does not list
    (() => { const c = withArt(); c.elements[4].children[0].weight = 950; return c; })(), 'statement', [withArt()], null, 42,
    { ...withArt(), extra: 'x'.repeat(70 * 1024) },
  ];
  for (const h of hostile) {
    const p = validateDesign(post({ composition: h }), 'design', { look: LOOK });
    assert.ok(p.length, JSON.stringify(h).slice(0, 80));
    assert.ok(p.every((x) => !/<script>|alert\(|javascript:|url\(x\)/.test(x)), p.join(' | '));
  }
});

// ---- 4. refused before anything is drawn ----
test('own design: one that cannot be drawn is refused with a DesignError that says so, and nothing is drawn', () => {
  const brand = { ...loadBrand(), looks: [LOOK], style: { ...loadBrand().style, direction: LOOK.id } };
  const ctx = { size: SIZES.feed, brand, image: () => 'data:image/png;base64,iVBORw0KGgo=', imageSize: () => ({ w: 1, h: 1 }) };
  const ok = renderPostWithLook(LOOK, post({ composition: withArt() }), ctx);
  assert.equal(ok.post.id, `${LOOK.id}/statement/own`);
  assert.equal(ok.post.own, true);
  assert.match(ok.body, /class="abs k-art"/);
  for (const c of [{ ...withArt(), render: 'x' }, (() => { const c = withArt(); c.elements[0].shapes[0].colour = 'red'; return c; })(), { ...withArt(), kind: 'photo' }]) {
    assert.throws(() => renderPostWithLook(LOOK, post({ composition: c }), ctx), (e) => e instanceof DesignError && /this post's own design cannot be drawn/.test(e.message));
  }
  // a design whose accepts rule declines the words is refused, never drawn wrongly
  const strict = withArt(); strict.accepts = [{ field: 'headline', maxChars: 5 }];
  assert.throws(() => renderPostWithLook(LOOK, post({ composition: strict }), ctx), /does not take these words/);
});

// ---- 5. Chrome ----
const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const out = path.join('out', `test-own-${process.pid}`);
let saved;
test.before(() => { saved = process.env.BRAND_DIR; process.env.BRAND_DIR = PACK; });
test.after(() => { if (saved === undefined) delete process.env.BRAND_DIR; else process.env.BRAND_DIR = saved; fs.rmSync(path.join(ROOT, out), { recursive: true, force: true }); });

test('Chrome: an own design with art behind the words is drawn and said; art over the words is refused and the look\'s variant draws the post', { skip }, async () => {
  const good = await renderDesignBlock({ root: ROOT, design: post({ composition: withArt() }), postId: 'own-good', outDir: out });
  assert.ok(good.ok, good.error);
  assert.deepEqual(good.ownDesign, { asked: true, used: true, reasons: [] });
  assert.ok(good.notes.some((n) => /the post's own design "Own art"/.test(n)), good.notes.join(' / '));

  // the same art laid over the headline (the top layer, a solid disc across the words)
  const over = withArt(9, [{ shape: 'circle', cx: 500, cy: 330, r: 300, colour: 'gold' }]);
  const fell = await renderDesignBlock({ root: ROOT, design: post({ composition: over }), postId: 'own-over', outDir: out });
  assert.ok(fell.ok, fell.error);
  assert.equal(fell.ownDesign.used, false);
  assert.match(fell.ownDesign.reasons.join(' '), /art lies over the words/);
  assert.ok(fell.notes.some((n) => /the post's own design was not used .*the look's design drew it/.test(n)), fell.notes.join(' / '));
  assert.ok(fell.notes.some((n) => /composition roast\/statement\/\d \(/.test(n)), 'the look\'s own variant drew it');

  // the AI's trial render refuses instead of falling back
  const strict = await renderDesignBlock({ root: ROOT, design: post({ composition: over }), postId: 'own-strict', outDir: out, strictOwn: true });
  assert.equal(strict.ok, false);
  assert.match(strict.error, /art lies over the words/);
});

test('Chrome: an own design the look now refuses is not drawn; the post is drawn with the look\'s variant and says why', { skip }, async () => {
  const c = withArt(); c.ground = 'tint';
  const r = await renderDesignBlock({ root: ROOT, design: post({ composition: c }), postId: 'own-stale', outDir: out });
  assert.ok(r.ok, r.error);
  assert.equal(r.ownDesign.used, false);
  assert.match(r.ownDesign.reasons.join(' '), /page colour \(tint\)/);
  assert.ok(r.notes.some((n) => /the post's own design was not used/.test(n)));
});

// ---- a batch file carries a post's own design, held to the brand's look ----
test('a batch: a post\'s own design is held to the brand\'s look when the batch is validated, and refused for a brand without a look', () => {
  const batch = (composition) => ({ name: 'own', timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'media/own', posts: [{ id: 'p1', date: '2027-06-02', title: 'T', caption: 'Words', design: post({ composition }) }] });
  assert.deepEqual(validateBatch(batch(withArt()), { root: ROOT }).errors, []);
  const bad = withArt(); bad.elements[0].shapes[0].colour = 'accent-type';
  assert.match(validateBatch(batch(bad), { root: ROOT }).errors.join(' '), /post p1: design: composition: elements\[0\]\.shapes\[0\]\.colour/);
  const before = process.env.BRAND_DIR;
  process.env.BRAND_DIR = 'brands/demo';
  try { assert.match(validateBatch(batch(withArt()), { root: ROOT }).errors.join(' '), /drawn with the brand's look/); } finally { process.env.BRAND_DIR = before; }
});

// ---- the picture the AI designer looks at ----
test('Chrome: a picture probe gives a small thumbnail and the colour of its plain background; a busy picture has none the page could take', { skip }, async () => {
  const jar = await probePicture({ root: ROOT, file: 'packages/engine/design/assets/demo/object-jar.jpg', size: 256 });
  assert.equal(jar.thumb.mediaType, 'image/jpeg');
  assert.ok(Buffer.from(jar.thumb.data, 'base64').length > 1000);
  assert.ok(Math.max(jar.w, jar.h) > 256, 'the picture keeps its own size; the thumbnail is small');
  assert.ok(Array.isArray(jar.edge.rgb) && jar.edge.rgb.length === 3);
  const market = await probePicture({ root: ROOT, file: 'packages/engine/design/assets/demo/scene-market.jpg' });
  assert.equal(market.edge.picture, false);
  await assert.rejects(probePicture({ root: ROOT, file: '../outside.jpg' }));
  await assert.rejects(probePicture({ root: ROOT, file: 'packages/engine/design/assets/demo/object-jar.jpg', size: 5000 }));
});
