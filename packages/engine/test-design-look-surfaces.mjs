// node --test   (two look capabilities about surfaces: words that cross a shape's edge on purpose, and decorative backgrounds)
//   1. crossing: a shape's key and a text's overlap are explicit and bounded; the edge check skips only the pairing a look names; accidental
//      collisions stay refused; every part of crossing words is measured for contrast on its own (an outline may carry a part);
//   2. backdrop: patterns from palette roles and bounded numbers only, the same every time, bounded in size, refused when hostile;
//   3. with Chrome: a crossing headline draws and an accidental one is refused, a part of the words on a colour it does not read on is caught
//      even when it is a sliver of the words, every pattern draws, and the emptiness check counts a pattern only where its pixels show it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrand } from './lib/design/brand.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { buildPage } from './lib/design/page.mjs';
import { partContrast, preparePage, renderImage } from './lib/design/render.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { normaliseDesign } from './lib/design/spec.mjs';
import { crossesOnPurpose, findLayoutProblems, findPostProblems, inkGap, insideShape, luminance } from './lib/design/checks.mjs';
import { lookCatalogue, validateLook } from './lib/design/look.mjs';
import { BACKDROP_PATTERNS, ELEMENTS } from './lib/design/look-elements.mjs';
import { BACKDROP_LIMITS, backdropGeometry } from './lib/design/directions/backdrop-geom.mjs';
import { PRESETS } from './lib/design/directions/primitives/backdrop.mjs';
import { markCrossing } from './lib/design/directions/kit.mjs';
import { renderPostWithLook, shippedLooks } from './lib/design/directions/index.mjs';
import { paletteBrand } from './testlib/retail-copy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const clone = (v) => JSON.parse(JSON.stringify(v));
const SOFT = { ...clone(shippedLooks().soft), id: 'surfaces', origin: 'copy:shipped:soft', name: 'Surfaces' };
const PX = (x, y, w, h) => ({ px: { x, y, w, h } });
const HOSTILE = ['"><script>window.__pwn=1</script>', 'javascript:alert(1)', 'url(http://evil.example/x.png)', 'red;background:url(x)', '</style>', '__proto__', 'constructor', 'a‮b', 'x'.repeat(5000)];
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const ctx = { size: SIZES.feed, brand: loadBrand(), image: () => PIXEL, imageSize: () => ({ w: 600, h: 600 }) };

// a statement on the pale page: a white disc (key a), a deep block (key b) and a headline that may cross the disc
const DISC = { type: 'box', place: PX(48, 210, 770, 770), fill: 'paper', radius: 'full', key: 'a' };
const HEAD = { type: 'text', field: 'headline', style: 'display', size: 128, place: PX(156, 400, 852), overlap: { with: 'a', allow: true }, z: 2 };
function crossLook({ head = {}, disc = {}, extra = [], ground = 'tint' } = {}) {
  return clone({
    ...SOFT,
    compositions: [{
      kind: 'statement', name: 'Cross', describe: 'A headline that crosses the edge of a disc.', ground, fit: 'margins',
      fields: { headline: { required: true, max: 60 }, sub: { max: 90 } },
      elements: [{ ...DISC, ...disc }, ...extra, { ...HEAD, ...head }, { type: 'text', field: 'sub', style: 'body', place: PX(156, 1050, 600), when: { present: 'sub' } }],
    }],
  });
}
const errs = (l) => validateLook(l, 'look', {});
const says = (l, re, what) => {
  const e = errs(l);
  assert.ok(e.some((x) => re.test(x)), `${what}: expected ${re} in ${e.join(' | ')}`);
  for (const x of e) assert.ok(x.length <= 200 && !/<script|javascript:|evil\.example|‮|xxxxxxxx/.test(x), `${what}: not echoed: ${x.slice(0, 80)}`);
};

// ==================================================================================================== 1. crossing, no Chrome
test('crossing: key and overlap are in the catalogue, as fixed lists', () => {
  const cat = lookCatalogue();
  for (const t of ['box', 'block', 'sticker', 'gradient', 'icon-badge']) assert.deepEqual(cat.elements[t].properties.key.values, ['a', 'b', 'c', 'd', 'e', 'f'], `${t}.key`);
  for (const t of ['text', 'fitted-stack']) {
    const o = cat.elements[t].properties.overlap;
    assert.equal(o.kind, 'object');
    assert.deepEqual(o.props.with.values, ['any-shape', 'a', 'b', 'c', 'd', 'e', 'f']);
    assert.deepEqual(o.required, ['with', 'allow']);
    assert.deepEqual([o.props.outline.props.w.min, o.props.outline.props.w.max], [2, 12]);
  }
  for (const t of ['photo', 'rule', 'keyline', 'glyph', 'backdrop']) assert.equal(cat.elements[t].properties.key, undefined, `${t} has no key`);
});

test('crossing: a valid look, and the rules that join properties', () => {
  assert.deepEqual(errs(crossLook()), []);
  assert.deepEqual(errs(crossLook({ head: { overlap: { with: 'any-shape', allow: true } } })), []);
  says(crossLook({ head: { overlap: { with: 'a', allow: false } } }), /allow must be true/, 'allow false');
  says(crossLook({ head: { overlap: { with: 'a' } } }), /needs allow/, 'allow missing');
  says(crossLook({ head: { overlap: { with: 'b', allow: true } } }), /no shape of the composition has key b/, 'a key nothing has');
  says(crossLook({ extra: [{ type: 'block', colour: 'accent', place: PX(900, 1100, 100, 100), key: 'a' }] }), /already is/, 'a key used twice');
  says(crossLook({ disc: { fill: undefined } }), /no fill/, 'a key on a box with no fill');
  says(crossLook({ extra: [{ type: 'sticker', shape: 'seal', size: 160, field: 'sub', place: PX(820, 1100), key: 'c' }] }), /does not judge/, 'a key on a seal');
  says(crossLook({ extra: [{ type: 'icon-badge', icon: 'check', shape: 'none', ink: 'ink', place: PX(900, 1100, 64, 64), key: 'c' }] }), /does not judge/, 'a key on a bare icon');
  // words inside the shape they name cannot cross its edge
  const inside = crossLook();
  inside.compositions[0].elements[0] = { ...DISC, children: [{ type: 'text', field: 'headline', style: 'display', size: 100, overlap: { with: 'a', allow: true } }] };
  inside.compositions[0].elements.splice(1, 1);
  says(inside, /the box the words sit in/, 'crossing its own box');
  // at most three crossing texts
  const many = crossLook({ extra: [0, 1, 2].map((i) => ({ type: 'text', field: 'sub', style: 'body', place: PX(156, 100 + i * 10, 300), overlap: { with: 'a', allow: true }, when: { present: 'sub' } })) });
  says(many, /at most 3 texts/, 'four crossing texts');
});

test('crossing: hostile values are refused and never echoed', () => {
  for (const h of [...HOSTILE, NaN, Infinity, -1, 7, true, null, {}, [], ['a']]) {
    says(crossLook({ head: { overlap: { with: h, allow: true } } }), /overlap|with/, `with ${String(h).slice(0, 12)}`);
    says(crossLook({ disc: { key: h } }), /key/, `key ${String(h).slice(0, 12)}`);
    if (h !== true) says(crossLook({ head: { overlap: { with: 'a', allow: h } } }), /allow/, `allow ${String(h).slice(0, 12)}`);
    says(crossLook({ head: { overlap: { with: 'a', allow: true, outline: { colour: h, w: 4 } } } }), /outline/, `outline colour ${String(h).slice(0, 12)}`);
    if (typeof h !== 'number' || !(h >= 2 && h <= 12)) says(crossLook({ head: { overlap: { with: 'a', allow: true, outline: { colour: 'ink', w: h } } } }), /outline/, `outline width ${String(h).slice(0, 12)}`);
  }
  says(crossLook({ head: { overlap: { with: 'a', allow: true, render: 'x' } } }), /render|setting/, 'a render key');
  says(crossLook({ head: { overlap: JSON.parse('{"with":"a","allow":true,"__proto__":{"x":1}}') } }), /./, 'a __proto__ key');
  says(crossLook({ head: { overlap: { with: 'a', allow: true, extra: 'red;background:url(x)' } } }), /setting/, 'an unknown key');
});

test('crossing: the ink must read on the shape and on the page, or an outline must carry it', () => {
  // a dark disc on the pale page: dark ink reads on the page, not on the disc
  says(crossLook({ disc: { fill: 'dark' } }), /must read on dark too/, 'dark ink across a dark disc');
  // light ink on the dark disc does not read on the pale page...
  says(crossLook({ disc: { fill: 'dark' }, head: { ink: 'paper' } }), /does not read on fill|must read on/, 'light ink across onto the pale page');
  // ...unless an outline that reads on the page carries it there (the outline in ink, the letters in paper on it)
  assert.deepEqual(errs(crossLook({ disc: { fill: 'dark' }, head: { ink: 'paper', overlap: { with: 'a', allow: true, outline: { colour: 'ink', w: 5 } } } })), []);
  // an outline the letters do not read on is refused
  says(crossLook({ disc: { fill: 'dark' }, head: { ink: 'paper', overlap: { with: 'a', allow: true, outline: { colour: 'soft', w: 5 } } } }), /does not read on its outline/, 'letters on an outline they do not read on');
});

test('crossing: the kit writes only fixed marks, from the tables', () => {
  const box = '<div class="abs k-box" data-el data-fill style="left:1px">x</div>';
  assert.equal(markCrossing(box, { key: 'b' }), '<div class="abs k-box" data-el data-fill style="left:1px" data-ovk="b">x</div>');
  assert.equal(markCrossing(box, { overlap: { with: 'any-shape', allow: true } }), '<div class="abs k-box" data-el data-fill style="left:1px" data-ov="any">x</div>');
  assert.equal(markCrossing(box, { overlap: { with: 'c', allow: true, outline: { colour: 'ink', w: 4 } } }), '<div class="k-olt abs k-box" data-el data-fill style="--k-olc:var(--c-ink);--k-olw:4px;left:1px" data-ov="c">x</div>');
  assert.equal(markCrossing(box, {}), box);
  for (const h of HOSTILE) {
    assert.throws(() => markCrossing(box, { key: h }), /shape key/);
    assert.throws(() => markCrossing(box, { overlap: { with: h, allow: true } }), /overlap/);
    assert.throws(() => markCrossing(box, { overlap: { with: 'a', allow: true, outline: { colour: h, w: 4 } } }), /outline/);
  }
  assert.throws(() => markCrossing(box, { overlap: { with: 'a', allow: 'yes' } }), /overlap/);
  assert.throws(() => markCrossing(box, { overlap: { with: 'a', allow: true, outline: { colour: 'ink', w: 4.5 } } }), /outline/);
  // drawn: the disc carries its key, the headline its pairing; nothing else
  const body = renderPostWithLook(crossLook(), { template: 'post', kind: 'statement', name: 'x', headline: '"><b>Hi</b> *there*' }, ctx, { shipped: false }).body;
  assert.equal((body.match(/data-ovk="a"/g) ?? []).length, 1);
  assert.equal((body.match(/data-ov="a"/g) ?? []).length, 1);
  assert.ok(!/<b>/.test(body));
});

test('crossing: the edge check skips only the pairing a look names (pure)', () => {
  const ink = (o) => ({ role: 'headline', text: 'Hello', x0: 100, x1: 900, y0: 400, y1: 500, frame: '', ...o });
  const shapes = [{ x0: 50, y0: 300, x1: 600, y1: 700, frame: '', key: 'a' }, { x0: 700, y0: 450, x1: 1000, y1: 900, frame: '' }];
  const edges = (i, sh = shapes) => findPostProblems({ texts: [], inks: [i], shapes: sh }).filter((p) => p.kind === 'edge');
  assert.equal(edges(ink(), [shapes[0]]).length, 1, 'no overlap: refused');
  assert.equal(edges(ink({ ov: 'a' }), [shapes[0]]).length, 0, 'the named shape: allowed');
  assert.equal(edges(ink({ ov: 'b' }), [shapes[0]]).length, 1, 'another key: refused');
  assert.equal(edges(ink({ ov: 'a' })).length, 1, 'the named shape is allowed, an unnamed one it also runs into is not');
  assert.equal(edges(ink({ ov: 'any' })).length, 0, 'any shape');
  for (const ov of ['', 'A', 'aa', 'any-shape', 'x', '*', 'a;b', 7, null]) assert.equal(crossesOnPurpose({ ov }, { key: 'a' }), false, `ov ${String(ov)}`);
});

test('edges: a circle, an ellipse and a rounded box are judged on their real outline, not their box (pure)', () => {
  const R = 300, circle = { x0: 100, y0: 100, x1: 100 + 2 * R, y1: 100 + 2 * R, frame: '', rad: [[R, R], [R, R], [R, R], [R, R]] };
  const edges = (i, f) => findPostProblems({ texts: [], inks: [{ role: 'headline', text: 'Hi', frame: '', ...i }], shapes: [f] }).filter((p) => p.kind === 'edge');
  // inside the circle's box, in its top-left corner past the curve: outside the circle and clear of it, so no problem
  assert.equal(inkGap({ x0: 110, y0: 110, x1: 160, y1: 140 }, circle) > 10, true);
  assert.deepEqual(edges({ x0: 110, y0: 110, x1: 160, y1: 140 }, circle), []);
  // across the curve: inside the box and cutting the circle's edge, refused as crossing (the box alone would call it 0 px inside the top)
  const across = edges({ x0: 180, y0: 160, x1: 420, y1: 220 }, circle);
  assert.equal(across.length, 1);
  assert.equal(across[0].crossing, true);
  // well inside the circle at its middle: the room is measured to the curve above and below the words, the least at the ends of the line
  // (its sides may stand 12 px out, as for a straight block: here the line's ends 300 and 500 are judged at 312 and 488)
  assert.ok(Math.abs(inkGap({ x0: 300, y0: 380, x1: 500, y1: 420 }, circle) + (380 - (400 - Math.sqrt(R * R - 88 * 88)))) < 1e-9);
  // a long line inside the circle's box whose ends reach past the curve is not inside it
  assert.equal(edges({ x0: 120, y0: 390, x1: 680, y1: 420 }, circle).length, 0, 'at the widest part the circle holds it');
  assert.equal(edges({ x0: 120, y0: 180, x1: 680, y1: 210 }, circle).length, 1, 'near the top its ends cross the curve');
  // an ellipse: radii of half its width and half its height
  const ell = { x0: 0, y0: 0, x1: 800, y1: 400, frame: '', rad: [[400, 200], [400, 200], [400, 200], [400, 200]] };
  assert.equal(insideShape(ell, 400, 5), true);
  assert.equal(insideShape(ell, 20, 20), false);
  // a rounded box: straight sides keep the old rule (the sides may stand 12 px out), the corners are curves
  const card = { x0: 100, y0: 100, x1: 900, y1: 500, frame: '', rad: [[40, 40], [40, 40], [40, 40], [40, 40]] };
  assert.equal(inkGap({ x0: 140, y0: 200, x1: 600, y1: 240 }, card), -100);
  assert.equal(edges({ x0: 102, y0: 104, x1: 300, y1: 130 }, card).length, 1, 'in the corner, past the curve: crossing');
  // letter by letter when the page gives each letter's ink: a line whose box corner pokes past the curve where no letter stands is inside
  // (an 's' near the curve, the descender of a 'y' far from it); a letter across the curve is a crossing
  const line = { x0: 120, y0: 560, x1: 520, y1: 640 };
  assert.equal(inkGap(line, circle), 0, 'the line\'s box alone crosses the curve');
  const glyphs = [[200, 560, 250, 600], [440, 560, 500, 640]];
  assert.ok(inkGap({ ...line, glyphs }, circle) < -10, 'its letters are well inside');
  assert.equal(inkGap({ ...line, glyphs: [[110, 560, 160, 610], ...glyphs] }, circle), 0, 'a letter across the curve');
  // square shapes are judged as before
  assert.equal(inkGap({ x0: 140, y0: 200, x1: 600, y1: 240 }, { x0: 100, y0: 100, x1: 900, y1: 500 }), -100);
});

test('crossing: a nested phrase is judged with its headline for overlap and margins (pure)', () => {
  const m = {
    W: 1080, H: 1350,
    roles: [
      { role: 'headline', text: 'A new', rects: [{ x0: 156, x1: 900, y0: 400, y1: 520 }], nested: false, within: -1 },
      { role: 'accent', text: 'of the month', rects: [{ x0: 156, x1: 700, y0: 800, y1: 920 }], nested: true, within: 0 },
      { role: 'sub', text: 'Roasted', rects: [{ x0: 156, x1: 700, y0: 830, y1: 880 }], nested: false, within: -1 },
    ],
  };
  const p = findLayoutProblems(m, { pad: 72, top: 72, bottom: 72 });
  assert.ok(p.some((x) => x.kind === 'overlap' && x.role === 'headline' && x.other === 'sub'), JSON.stringify(p));
  m.roles[1].rects = [{ x0: 156, x1: 700, y0: 1300, y1: 1340 }];
  assert.ok(findLayoutProblems(m, { pad: 72, top: 72, bottom: 72 }).some((x) => x.kind === 'outside' && x.edge === 'bottom'));
});

test('crossing: each part is judged on its own pixels; an outline counts only when it is wide enough and reads both ways (pure)', () => {
  const lum = (hex) => luminance(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const white = { p05: lum('#ffffff'), p95: lum('#ffffff') }, navy = { p05: lum('#10151f'), p95: lum('#10151f') };
  const r = { color: 'rgb(255, 255, 255)', size: 120 };
  assert.ok(partContrast(r, navy, 4.5) > 15);
  assert.ok(partContrast(r, white, 4.5) < 1.1, 'white on white fails');
  assert.ok(partContrast({ ...r, outline: { color: 'rgb(16, 21, 31)', w: 6 } }, white, 4.5) > 15, 'a navy outline 5% of the size carries white letters on white');
  assert.ok(partContrast({ ...r, outline: { color: 'rgb(16, 21, 31)', w: 2 } }, white, 4.5) < 1.1, 'a hairline outline (under 3% of the size) does not count');
  assert.ok(partContrast({ ...r, outline: { color: 'rgb(230, 230, 230)', w: 8 } }, white, 4.5) < 1.3, 'an outline that does not read on the ground does not count');
});

// ==================================================================================================== 2. backdrop, no Chrome
const BD = { type: 'backdrop', pattern: 'dots', place: { inset: 'page' } };
function bdLook(bd = {}, { inBox = false } = {}) {
  const el = { ...BD, ...bd };
  return clone({
    ...SOFT,
    compositions: [{
      kind: 'statement', name: 'Pattern', describe: 'A pattern behind a headline.', ground: 'paper', fit: 'margins',
      fields: { headline: { required: true, max: 60 } },
      elements: [
        inBox ? { type: 'box', place: PX(0, 0, 1080, 1350), children: [{ ...el, place: PX(0, 0, 1080, 1350) }] } : el,
        { type: 'text', field: 'headline', style: 'display', size: 120, place: PX(72, 500, 936), z: 2 },
      ],
    }],
  });
}

test('backdrop: every pattern and preset is valid; the rules that join its settings', () => {
  for (const p of BACKDROP_PATTERNS) assert.deepEqual(errs(bdLook({ pattern: p })), [], p);
  for (const [name, p] of Object.entries(PRESETS)) assert.deepEqual(errs(bdLook(p)), [], `preset ${name}`);
  assert.deepEqual(errs(bdLook({ pattern: 'confetti', colour: 'accent', second: 'field', seed: 42, scale: 60, density: 0.6, opacity: 0.4 })), []);
  assert.deepEqual(errs(bdLook({ pattern: 'stripes', angle: 45, mask: 'fade-down', radius: 40 })), []);
  says(bdLook({ second: 'field' }), /for confetti and blobs/, 'a second colour on dots');
  says(bdLook({ at: 'center' }), /for rings and halftone/, 'a centre on dots');
  says(bdLook({ pattern: 'rings', angle: 30 }), /no direction/, 'an angle on rings');
  says(bdLook({ seed: 3 }), /arrangement/, 'a seed on dots');
  says(bdLook({ pattern: 'grain', colour: 'accent' }), /page's own texture/, 'a colour on the grain');
  says(bdLook({ colour: 'body' }), /a colour a panel can be filled with/, 'a text colour');
  says(bdLook({}, { inBox: true }), /goes at the top of the composition/, 'a pattern in a box');
  for (const [k, v] of [['scale', 11], ['scale', 241], ['scale', 40.5], ['density', 0.05], ['density', 1.01], ['opacity', 0.02], ['opacity', 0.61], ['angle', 180], ['angle', -1], ['seed', 10000], ['seed', 1.5], ['pattern', 'zigzag'], ['mask', 'blur'], ['at', 'middle']]) says(bdLook({ [k]: v }), new RegExp(k), `${k} ${v}`);
  for (const h of HOSTILE) for (const k of ['pattern', 'colour', 'mask', 'at']) says(bdLook({ [k]: h }), new RegExp(k), `hostile ${k} ${h.slice(0, 10)}`);
  for (const v of [NaN, Infinity, -Infinity, '40', true, null, [], {}]) for (const k of ['scale', 'density', 'opacity', 'angle', 'seed']) says(bdLook({ [k]: v }), new RegExp(k), `${k} ${String(v)}`);
  assert.equal(ELEMENTS.backdrop.flow, false);
});

const D_OK = /^[MLZaQTz0-9 .-]*$/;
test('backdrop: the geometry is built from numbers only, the same every time, and bounded', () => {
  for (const pattern of BACKDROP_PATTERNS.filter((p) => p !== 'grain')) {
    for (const [w, h, scale, angle] of [[1080, 1350, 12, 0], [1080, 1350, 12, 37], [300, 200, 240, 90], [1, 1, 12, 0], [4000, 4000, 12, 45]]) {
      const o = { pattern, w, h, scale, density: 1, angle: ['rings', 'blobs', 'confetti'].includes(pattern) ? 0 : angle, seed: 9999, two: true };
      const a = backdropGeometry(o), b = backdropGeometry(o);
      assert.deepEqual(a, b, `${pattern} is the same every time`);
      assert.ok(a.marks <= BACKDROP_LIMITS.marks, `${pattern} ${w}x${h} at ${scale}: ${a.marks} marks`);
      for (const p of a.paths) { assert.match(p.d, D_OK, `${pattern}: path data`); assert.ok(p.d.length < 600000, `${pattern}: ${p.d.length} characters`); }
      for (const bl of a.blobs ?? []) for (const k of ['x', 'y', 'r']) assert.ok(Number.isInteger(bl[k]) && bl[k] >= 0 && bl[k] <= 100);
    }
  }
  const s1 = backdropGeometry({ pattern: 'confetti', w: 1080, h: 1350, scale: 60, density: 0.5, seed: 1 }), s2 = backdropGeometry({ pattern: 'confetti', w: 1080, h: 1350, scale: 60, density: 0.5, seed: 2 });
  assert.notDeepEqual(s1, s2, 'another seed, another arrangement');
  assert.notDeepEqual(backdropGeometry({ pattern: 'blobs', w: 1080, h: 1350, scale: 160, seed: 1 }), backdropGeometry({ pattern: 'blobs', w: 1080, h: 1350, scale: 160, seed: 2 }));
  assert.deepEqual([2, 3, 4].map((n) => backdropGeometry({ pattern: 'blobs', w: 500, h: 500, scale: 100, density: (n - 2) / 2 || 0.1 }).blobs.length), [2, 3, 4]);
  for (const bad of [{ w: NaN }, { w: Infinity }, { w: 0 }, { w: 4001 }, { scale: 11 }, { scale: 241 }, { density: 2 }, { angle: 180 }, { seed: -1 }, { seed: 1e9 }, { pattern: 'zigzag' }, { at: 'middle' }, { scale: '40' }])
    assert.throws(() => backdropGeometry({ pattern: 'dots', w: 100, h: 100, scale: 40, ...bad }), /backdrop/, JSON.stringify(bad));
});

test('backdrop: the drawn page holds only the fixed classes, palette colours and numbers', () => {
  for (const [i, p] of [...BACKDROP_PATTERNS.map((pattern) => ({ pattern })), ...Object.values(PRESETS), { pattern: 'confetti', colour: 'field', second: 'accent', seed: 77 }, { pattern: 'blobs', colour: 'accent', second: 'field', seed: 5 }].entries()) {
    const body = renderPostWithLook(bdLook({ ...p, mask: p.mask ?? ['none', 'fade-down', 'fade-up', 'fade-left', 'fade-right', 'vignette', 'edges'][i % 7] }), { template: 'post', kind: 'statement', name: 'x', headline: 'Hello' }, ctx, { shipped: false }).body;
    const bd = body.match(/<(div|i) class="abs (?:k-paper )?k-backdrop[^>]*>/)?.[0];
    assert.ok(bd, `${p.pattern}: a backdrop is drawn`);
    assert.match(bd, /aria-hidden="true" data-el="[0-9.]+" data-deco/);
    for (const d of body.matchAll(/ d="([^"]*)"/g)) assert.match(d[1], /^[MLZaQTz0-9 .-]*$|^M[0-9.]+/);
    for (const st of body.matchAll(/<path d="[^"]*" style="([^"]*)"/g)) assert.match(st[1], /^(?:fill:var\(--c-[a-z-]+\)|fill:none;stroke:var\(--c-[a-z-]+\);stroke-width:[0-9.]+px)$/);
    assert.ok(!/url\(/.test(bd.replace(/--k-grain[^;"]*/g, '')), `${p.pattern}: no url in the backdrop`);
    if (p.pattern !== 'grain') assert.match(bd, / data-pattern data-scale="\d+"/);
  }
});

// ==================================================================================================== 3. with Chrome
const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-surfaces-'));
let browser;
test.before(async () => { if (chrome) browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(HERE, '..', '..', 'out', 'design.lock') }); });
test.after(() => { browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
const brandFor = (look, colours) => { const b = loadBrand(); return { ...b, ...(colours ?? {}), looks: [look], style: { ...b.style, direction: look.id } }; };
let shot = 0;
const draw = async (look, words, colours) => renderImage(browser, brandFor(look, colours), { spec: normaliseDesign({ template: 'post', kind: 'statement', name: 'surfaces', ...words }), sizeName: 'feed', outFile: path.join(process.env.SURF_OUT ?? tmp, `draw-${++shot}.png`) }, { tmpDir: tmp });

test('Chrome: a headline crossing its disc draws; the same headline without the pairing is refused by the edge check', { skip }, async () => {
  const words = { headline: 'Small batches, *roasted slowly.*', sub: 'Roasted on Thursday and on your doorstep the next morning.' };
  const big = { size: 150 };
  const r = await draw(crossLook({ head: big }), words);
  assert.deepEqual(r.warnings, []);
  await assert.rejects(draw(crossLook({ head: { ...big, overlap: undefined } }), words), /edge of a block or rule/, 'no pairing: refused');
  // a second, unnamed shape the words also run into is still refused
  const block = { type: 'block', colour: 'tint-deep', place: PX(600, 650, 480, 140), z: 1 };
  await assert.rejects(draw(crossLook({ head: big, extra: [block] }), words), /edge of a block or rule/, 'another shape: refused');
  // any-shape lets the words cross both
  await draw(crossLook({ head: { ...big, overlap: { with: 'any-shape', allow: true } }, extra: [block] }), words);
});

test('Chrome: the page reports a disc as a circle, and cuts words that cross it on its curve, not its box', { skip }, async () => {
  // the headline's first line runs across the top of the disc, where its curve is well inside its box
  const look = crossLook({ head: { size: 110, place: PX(156, 222, 852) } }), words = { headline: 'Small batches, *roasted slowly.*' };
  const brand = brandFor(look), prep = preparePage(brand, { spec: normaliseDesign({ template: 'post', kind: 'statement', name: 'x', ...words }), sizeName: 'feed' });
  const page = await browser.page(1080, 1350);
  try {
    await page.setContent(buildPage({ brand, size: SIZES.feed, ...prep.out }));
    await page.evaluate('window.__ds.ready({})');
    await page.evaluate('window.__ds.fitLines()');
    const pm = await page.evaluate('window.__ds.postMetrics({})');
    const disc = pm.shapes.find((f) => f.key === 'a');
    assert.ok(disc && Array.isArray(disc.rad), 'the disc has its corners');
    const w = disc.x1 - disc.x0, h = disc.y1 - disc.y0;
    for (const [rx, ry] of disc.rad) { assert.ok(Math.abs(rx - w / 2) < 1 && Math.abs(ry - h / 2) < 1, `a circle: ${rx} x ${ry} for ${w} x ${h}`); }
    const head = (await page.evaluate('window.__ds.measure()')).roles.find((x) => x.role === 'headline');
    // every piece judged as on the disc has its centre inside the circle, and none outside it does
    const cx = (disc.x0 + disc.x1) / 2, cy = (disc.y0 + disc.y1) / 2, r = w / 2;
    const inC = (q) => Math.hypot((q.x0 + q.x1) / 2 - cx, (q.y0 + q.y1) / 2 - cy) <= r + 3;
    assert.equal(head.parts.length, 2, 'on the disc and off it');
    const [onDisc, off] = head.parts[0].every(inC) ? [head.parts[0], head.parts[1]] : [head.parts[1], head.parts[0]];
    assert.ok(onDisc.every(inC), 'the part on the disc is inside its curve');
    assert.ok(off.filter((q) => (q.x0 + q.x1) / 2 > disc.x0 && (q.x0 + q.x1) / 2 < disc.x1 && (q.y0 + q.y1) / 2 > disc.y0 && (q.y0 + q.y1) / 2 < disc.y1).every((q) => !inC({ x0: q.x0, x1: q.x1, y0: q.y0, y1: q.y1 }) || Math.hypot((q.x0 + q.x1) / 2 - cx, (q.y0 + q.y1) / 2 - cy) > r - 3), 'a piece in the disc\'s box but past its curve is judged off it');
  } finally { await page.close(); }
});

test('Chrome: a sliver of the words on a colour it does not read on is caught, part by part', { skip }, async () => {
  // a brand whose accent is a dark grey: the ink reads on the page, not on the block; the words reach a few pixels into the block
  const colours = paletteBrand({ name: 'Grey Mill', light: '#F7F5F0', ink: '#10151F', primary: '#1B2A41', gold: '#2E3033', deep: '#5A5A5A' });
  const words = { headline: 'Weighed twice', sub: 'Weighed when it is filled and again before it leaves.' };
  const lookWith = (block) => {
    const l = crossLook({ ground: 'paper', extra: block ? [block] : [], head: { size: 110, nowrap: true, overlap: block ? { with: 'b', allow: true } : { with: 'any-shape', allow: true } } });
    l.compositions[0].elements.shift();
    return l;
  };
  const measure = async (look) => {
    const brand = brandFor(look, colours), prep = preparePage(brand, { spec: normaliseDesign({ template: 'post', kind: 'statement', name: 'x', ...words }), sizeName: 'feed' });
    const page = await browser.page(1080, 1350);
    try {
      await page.setContent(buildPage({ brand, size: SIZES.feed, ...prep.out }));
      await page.evaluate('window.__ds.ready({})');
      await page.evaluate('window.__ds.fitLines()');
      return (await page.evaluate('window.__ds.measure()')).roles.find((x) => x.role === 'headline');
    } finally { await page.close(); }
  };
  // where the words end, then a block whose left edge is 16 px before that
  const first = await measure(lookWith(null));
  const end = Math.round(Math.max(...first.rects.map((q) => q.x1)));
  const block = { type: 'block', colour: 'accent', place: PX(end - 16, 300, 1080 - (end - 16), 400), key: 'b' };
  const look = lookWith(block);
  const head = await measure(look);
  const area = (rs) => rs.reduce((t, q) => t + (q.x1 - q.x0) * (q.y1 - q.y0), 0);
  assert.equal(head.parts.length, 2, 'two parts: on the page and on the block');
  const share = Math.min(...head.parts.map(area)) / area(head.rects);
  assert.ok(share > 0 && share < 0.05, `the part on the block is a sliver (${share.toFixed(3)})`);
  const r = await draw(look, words, colours);
  assert.ok(r.warnings.some((w) => /low contrast: the headline/.test(w)), `the part on the block fails: ${r.warnings.join(' | ')}`);
  // judged as one, the sliver would hide in the darkest 5% of the words' pixels: the page alone passes
  const page = lookWith(null);
  assert.deepEqual((await draw(page, words, colours)).warnings, []);
});

const half = (bd) => clone({
  ...SOFT,
  compositions: [{
    kind: 'statement', name: 'Half', describe: 'A headline at the top and nothing under it.', ground: 'paper', fit: 'margins',
    fields: { headline: { required: true, max: 60 } },
    elements: [...(bd ? [{ type: 'backdrop', place: { inset: 'page' }, ...bd }] : []), { type: 'text', field: 'headline', style: 'display', size: 120, place: PX(72, 160, 936), z: 2 }],
  }],
});
test('Chrome: the emptiness check sees a pattern only where its pixels show it', { skip }, async () => {
  const words = { headline: 'Every bag weighed twice' };
  await assert.rejects(draw(half(), words), /empty area/, 'a half empty page');
  await assert.rejects(draw(half({ pattern: 'dots', scale: 36, density: 0.35, opacity: 0.04 })), /empty area/, 'a faint pattern is still empty space');
  const r = await draw(half({ pattern: 'dots', colour: 'field', scale: 40, density: 0.6, opacity: 0.35 }), words);
  assert.deepEqual(r.warnings, [], 'a pattern that shows covers the page');
  // and it is measured: the same bold pattern faded out at the foot leaves the foot empty
  await assert.rejects(draw(half({ pattern: 'dots', colour: 'field', scale: 40, density: 0.6, opacity: 0.35, mask: 'fade-down' }), words), /empty area/);
});

test('Chrome: a pattern is seen against what is under it, not the page colour: on a panel of its own colour it covers nothing there', { skip }, async () => {
  const look = half({ pattern: 'dots', colour: 'field', scale: 40, density: 0.6, opacity: 0.35 });
  const brand = brandFor(look), prep = preparePage(brand, { spec: normaliseDesign({ template: 'post', kind: 'statement', name: 'x', headline: 'Every bag weighed twice' }), sizeName: 'feed' });
  const page = await browser.page(1080, 1350);
  try {
    await page.setContent(buildPage({ brand, size: SIZES.feed, ...prep.out }));
    await page.evaluate('window.__ds.ready({})');
    // a panel in the pattern's own colour under the lower half of the page (no data-fill: it is not a block of the look, so only the
    // pattern's own visibility decides whether those cells are covered)
    await page.evaluate(`(() => { const cv = document.querySelector('.cv'), d = document.createElement('div'); d.style.cssText = 'position:absolute;left:0;top:700px;width:1080px;height:650px;background:var(--c-field);z-index:-1'; cv.prepend(d); })()`);
    const cells = async () => {
      await page.evaluate("window.__ds.patternMode('with')");
      const a = await page.screenshotPng();
      await page.evaluate("window.__ds.patternMode('without')");
      const b = await page.screenshotPng();
      await page.evaluate('window.__ds.patternMode(false)');
      return page.evaluate(`window.__ds.patternCover(${JSON.stringify(a.toString('base64'))}, ${JSON.stringify(b.toString('base64'))})`);
    };
    const cols = Math.ceil(1080 / 20), rowOf = (k) => Math.floor(k / cols);
    const seen = await cells();
    assert.ok(seen.some((k) => rowOf(k) * 20 < 650), 'the pattern shows on the page above the panel');
    assert.deepEqual(seen.filter((k) => rowOf(k) * 20 >= 760), [], 'on the panel of its own colour it shows nowhere');
  } finally { await page.close(); }
});

test('Chrome: every pattern and every preset draws under words that still read', { skip }, async () => {
  const look = (bd) => clone({
    ...SOFT,
    compositions: [{
      kind: 'statement', name: 'All', describe: 'A pattern behind a headline and a sub line.', ground: 'paper', fit: 'margins', calm: { maxShare: 0.8 },
      fields: { headline: { required: true, max: 60 }, sub: { max: 100 } },
      elements: [{ type: 'backdrop', place: { inset: 'page' }, ...bd }, { type: 'text', field: 'headline', style: 'display', size: 120, place: PX(72, 400, 936), z: 2 }, { type: 'text', field: 'sub', style: 'body', place: PX(72, 900, 700), z: 2 }],
    }],
  });
  const words = { headline: 'Every bag weighed twice', sub: 'Weighed when it is filled and again before it leaves.' };
  for (const [name, p] of Object.entries(PRESETS)) {
    const r = await draw(look(p), words);
    // the quiet ones keep the words reading at the brand's targets; a bold one is measured like anything else (a warning names the words)
    if (name.startsWith('quiet-')) assert.deepEqual(r.warnings, [], `preset ${name}`);
    else for (const w of r.warnings) assert.match(w, /^low contrast: the (sub|headline) text/, `preset ${name}`);
  }
  for (const pattern of BACKDROP_PATTERNS) {
    const p = { pattern, ...(pattern === 'grain' ? {} : { colour: 'field', opacity: 0.12 }) };
    const r = await renderImage(browser, brandFor(look(p)), { spec: normaliseDesign({ template: 'post', kind: 'statement', name: 'surfaces', ...words }), sizeName: 'feed', outFile: path.join(process.env.SURF_OUT ?? tmp, `pattern-${pattern}.png`) }, { tmpDir: tmp });
    assert.deepEqual(r.warnings, [], pattern);
  }
});
