// node --test   (the template baseline harness, testlib/template-baseline.mjs: its PNG decoder and pixel comparison, and its cases;
// the renders themselves are run by hand, see testlib/CONVERTING.md)
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_TEMPLATES } from './lib/design/spec.mjs';
import { GROUND_NAMES } from './lib/design/tokens.mjs';
import { comparePixels, decodePng, pngBytes } from './testlib/png.mjs';
import { CASES, STYLES, caseProblems, selectCases } from './testlib/template-baseline.mjs';

test('the PNG decoder reads back what the encoder wrote, and the comparison counts the pixels that differ', () => {
  const rgb = (x, y) => [(x * 7) % 256, (y * 11) % 256, (x * y) % 256];
  const a = decodePng(pngBytes(37, 21, rgb));
  assert.deepEqual([a.w, a.h], [37, 21]);
  assert.deepEqual([...a.data.slice((5 * 37 + 9) * 4, (5 * 37 + 9) * 4 + 4)], [...rgb(9, 5), 255]);
  const rgba = decodePng(pngBytes(3, 2, (x, y) => [x, y, 9, x * 100], { alpha: true }));
  assert.deepEqual([...rgba.data.slice(4 * 5, 4 * 6)], [2, 1, 9, 200]);
  assert.deepEqual(comparePixels(a, a), { sameSize: true, differing: 0, maxDelta: 0, box: null });
  const b = decodePng(pngBytes(37, 21, (x, y) => (x === 3 && y === 4 ? [0, 0, 0] : x === 30 && y === 10 ? [rgb(x, y)[0] + 2, rgb(x, y)[1], rgb(x, y)[2]] : rgb(x, y))));
  assert.deepEqual(comparePixels(a, b), { sameSize: true, differing: 2, maxDelta: 44, box: { x0: 3, y0: 4, x1: 30, y1: 10 } });
  assert.equal(comparePixels(a, decodePng(pngBytes(2, 2, rgb))).sameSize, false);
  assert.throws(() => decodePng(Buffer.from('not a png at all, not even close to one')), /not a PNG/);
});

test('the baseline cases are valid designs and cover every template, ground and style the conversion must keep', () => {
  assert.deepEqual(caseProblems(), []);
  const shown = new Set(CASES.flatMap((c) => (c.design.template === 'carousel' ? c.design.pages : [c.design]).map((p) => p.template)));
  for (const t of [...PAGE_TEMPLATES, 'photo']) assert.ok(shown.has(t), t);
  for (const t of PAGE_TEMPLATES) assert.ok(CASES.some((c) => c.design.template === 'carousel' && c.design.pages[0].template === t) && CASES.some((c) => c.design.template === 'carousel' && c.design.pages.slice(1).some((p) => p.template === t)), `${t} as page 1 and as a later page`);
  // every ground kind (by name, by older name, and the photo's own), on the page templates
  const grounds = new Set(CASES.flatMap((c) => (c.design.template === 'carousel' ? c.design.pages : [c.design]).map((p) => p.ground)).filter(Boolean));
  for (const g of ['photo', 'ink', 'gold-pale', 'mint', ...GROUND_NAMES.filter((n) => n !== 'light' && n !== 'soft')]) assert.ok(grounds.has(g), g);
  // the style variants exercise the stage-1 style hooks
  assert.deepEqual(Object.keys(STYLES), ['demo', 'outline', 'flat']);
  assert.equal(STYLES.outline.logo, 'top-right');
  assert.equal(STYLES.flat.photo.treatment, 'duotone');
  // --only selects the cases (carousels included) that show a template
  const number = selectCases({ only: ['number'] }).map((c) => c.id);
  assert.ok(number.includes('number-jar') && number.includes('carousel-number') && number.includes('carousel-object') && !number.includes('text'));
  assert.equal(new Set(CASES.map((c) => c.id)).size, CASES.length);
});
