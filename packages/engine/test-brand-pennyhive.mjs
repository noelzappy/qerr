// node --test   The fictional Pennyhive pack (brands/pennyhive), the finance test brand beside the demo: it loads as a complete brand,
// its spelling rules leave the right spelling alone, and its example batch passes the batch and post checks in the pack's direction.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR, ROOT } from './lib/core.mjs';
import { loadBrand, loadDirection, loadSeries } from './lib/design/brand.mjs';
import { validateBatchDesigns } from './lib/design/batch.mjs';
import { postProblems, POST_KINDS } from './lib/design/post-spec.mjs';
import { postKinds, shippedLooks } from './lib/design/directions/index.mjs';
import { lintText, textFieldsOf } from './lib/design/lint.mjs';
import { validateDesign } from './lib/design/spec.mjs';
import { validateBatch } from './lib/batch.mjs';

const PACK = path.join(ROOT, 'brands', 'pennyhive');
const file = path.join(PACK, 'brand.json');
const batch = JSON.parse(fs.readFileSync(path.join(PACK, 'batches', 'example-posts.json'), 'utf8'));
const seen = (v) => [...String(v).replace(/\*/g, '')].length;

test('the Pennyhive pack loads as a complete brand, with its logos, fonts and map', () => {
  const brand = loadBrand({ file });
  assert.equal(brand.name, 'Pennyhive');
  assert.ok(brand.logoFullSrc.startsWith('data:image/png;base64,') && brand.logoMarkSrc.startsWith('data:image/png;base64,'));
  assert.equal(brand.font.family, 'Hanken Grotesk');
  assert.ok(brand.fontFaces.length > 0);
  assert.ok(brand.map && brand.map.regions.length === 3);
  assert.deepEqual(brand.darkGrounds.sort(), ['dark', 'deep']);
});

test('the Pennyhive spelling rules catch the wrong forms and leave the brand name and its web address alone', () => {
  const brand = loadBrand({ file });
  const wrong = (t) => lintText([{ field: 'sub', text: t }], 'feed', brand).some((w) => /should be written/.test(w));
  for (const ok of ['Pennyhive', 'Save with Pennyhive today', 'See pennyhive.example', 'https://pennyhive.example/pricing']) assert.equal(wrong(ok), false, ok);
  for (const bad of ['Penny hive', 'penny-hive', 'PennyHive', 'PENNYHIVE', 'join pennyhive now']) assert.equal(wrong(bad), true, bad);
});

test('the Pennyhive example batch covers every post kind and fits the pack\'s direction', () => {
  const brand = loadBrand({ file }), direction = loadDirection({ file }), kinds = postKinds(brand);
  assert.deepEqual(validateBatchDesigns(batch.posts, { series: loadSeries({ file }) }), []);
  assert.deepEqual([...new Set(batch.posts.map((p) => p.design.kind))].sort(), [...POST_KINDS].sort());
  for (const p of batch.posts) {
    const d = p.design;
    assert.deepEqual(postProblems(d, p.id, { direction }), [], p.id);
    for (const [f, v] of Object.entries(kinds[d.kind].fields)) if (v.budget && d[f] !== undefined) assert.ok(seen(d[f]) <= v.budget, `${p.id}: ${f} is ${seen(d[f])} characters, the ${direction} budget is ${v.budget}`);
    assert.deepEqual(lintText(textFieldsOf(d), 'feed', brand), [], p.id);
    if (d.image) assert.ok(fs.existsSync(path.join(ENGINE_DIR, d.image)), `${p.id}: ${d.image} is one of the engine's synthetic pictures`);
  }
});

// The pack's second example batch shows off the shipped Ledger look (for a brand that picks it in Settings, Brand and look): every post and
// carousel page fits that look and names one of its variants, keeps to the brand's spelling rules, and uses synthetic pictures or credited photos.
test('the Pennyhive Ledger batch fits the shipped Ledger look, with a how-it-works carousel', () => {
  const CREDITS = fs.readFileSync(path.join(ENGINE_DIR, 'design', 'assets', 'photos', 'CREDITS.md'), 'utf8');
  const brand = loadBrand({ file }), ledger ={ ...shippedLooks().ledger, origin: 'copy:shipped:ledger' };
  const lb = JSON.parse(fs.readFileSync(path.join(PACK, 'batches', 'example-ledger.json'), 'utf8'));
  assert.deepEqual(validateBatch(lb, { fallbackName: 'example-ledger' }).errors, []);
  assert.deepEqual(validateBatchDesigns(lb.posts, { series: loadSeries({ file }) }), []);
  assert.ok(lb.posts.length >= 8);
  const pages = lb.posts.flatMap((p) => (p.design.template === 'carousel' ? p.design.pages.map((d) => [p, d]) : [[p, p.design]]));
  assert.deepEqual([...new Set(pages.map(([, d]) => d.kind))].sort(), [...POST_KINDS].sort());
  const carousel = lb.posts.find((p) => p.design.template === 'carousel');
  assert.deepEqual(carousel.design.pages.map((d) => `${d.kind}/${d.variant}`), ['statement/0', 'figure/2', 'figure/2', 'figure/2', 'statement/0']);
  assert.equal(carousel.media.length, carousel.design.pages.length);
  for (const p of lb.posts) assert.deepEqual(validateDesign(p.design, p.id, { look: ledger }), [], p.id);
  for (const [p, d] of pages) {
    assert.ok(Number.isInteger(d.variant), `${p.id}: names its Ledger variant`);
    assert.deepEqual(lintText(textFieldsOf(d), 'feed', brand), [], p.id);
    assert.ok(!/[$£]|\b(dollars?|pounds?)\b/i.test(JSON.stringify(d) + p.caption), `${p.id}: euros only`);
    for (const img of [d.image, ...(d.gallery ?? []).map((g) => g.image)].filter(Boolean)) {
      // a synthetic demo picture (committed), or a photo with its licence on record in CREDITS.md (the photo itself is never committed)
      if (img.startsWith('design/assets/demo/')) assert.ok(fs.existsSync(path.join(ENGINE_DIR, img)), `${p.id}: ${img} is one of the engine's synthetic pictures`);
      else assert.ok(img.startsWith('design/assets/photos/') && CREDITS.includes(`| \`${path.basename(img)}\` |`), `${p.id}: ${img} is a photo with a row in CREDITS.md`);
    }
  }
});
