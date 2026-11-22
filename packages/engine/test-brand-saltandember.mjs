// node --test   The fictional Salt & Ember pack (brands/saltandember), the grill restaurant that shows off the plate look: it loads as a complete
// brand drawn with its own copy of the shipped roast look, its spelling rules leave the right spelling alone, its example batch covers every kind
// and passes the batch and post checks, and every picture it names is a credited photo (design/assets/photos, not committed) or one of its own drawings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR, ROOT } from './lib/core.mjs';
import { loadBrand, loadDirection, loadSeries } from './lib/design/brand.mjs';
import { validateBatchDesigns } from './lib/design/batch.mjs';
import { POST_KINDS } from './lib/design/post-spec.mjs';
import { validateDesign } from './lib/design/spec.mjs';
import { lookOfBrand, postKinds, shippedLooks } from './lib/design/directions/index.mjs';
import { lintText, textFieldsOf } from './lib/design/lint.mjs';

const SLUG = 'saltandember', LOOK = 'plate', NAME = 'Salt & Ember';
const PACK = path.join(ROOT, 'brands', SLUG);
const file = path.join(PACK, 'brand.json');
const batch = JSON.parse(fs.readFileSync(path.join(PACK, 'batches', 'example-posts.json'), 'utf8'));
const credits = fs.readFileSync(path.join(ENGINE_DIR, 'design', 'assets', 'photos', 'CREDITS.md'), 'utf8');
const seen = (v) => [...String(v).replace(/\*/g, '')].length;

test(`the ${NAME} pack loads as a complete brand, drawn with its copy of the shipped ${LOOK} look`, () => {
  const brand = loadBrand({ file });
  assert.equal(brand.name, NAME);
  assert.ok(brand.logoFullSrc.startsWith('data:image/png;base64,') && brand.logoMarkSrc.startsWith('data:image/png;base64,'));
  assert.equal(loadDirection({ file }), LOOK);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(raw.looks.length, 1);
  const { origin, ...own } = raw.looks[0];
  assert.equal(origin, `copy:shipped:${LOOK}`);
  const { origin: _o, ...shipped } = structuredClone(shippedLooks()[LOOK]);
  assert.deepEqual(own, shipped, 'the pack carries the shipped look unchanged (make-assets and the look file move together)');
});

test(`the ${NAME} spelling rules catch the wrong forms and leave the name and its web address alone`, () => {
  const brand = loadBrand({ file });
  const wrong = (t) => lintText([{ field: 'sub', text: t }], 'feed', brand).some((w) => /should be written/.test(w));
  for (const ok of ['Salt & Ember', 'Dinner at Salt & Ember tonight', 'Book on saltandember.example', 'https://saltandember.example/tables']) assert.equal(wrong(ok), false, ok);
  for (const bad of ['Salt and Ember', 'Salt+Ember', 'Salt&Ember', 'SALT & EMBER', 'salt & ember']) assert.equal(wrong(bad), true, bad);
});

test(`the ${NAME} example batch covers every post kind, fits the look and names only credited or drawn pictures`, () => {
  const brand = loadBrand({ file }), look = lookOfBrand(brand), kinds = postKinds(brand);
  assert.equal(look?.id, LOOK);
  assert.ok(batch.posts.length >= 8);
  assert.deepEqual(validateBatchDesigns(batch.posts, { series: loadSeries({ file }) }), []);
  assert.deepEqual([...new Set(batch.posts.map((p) => p.design.kind))].sort(), [...POST_KINDS].sort());
  for (const p of batch.posts) {
    const d = p.design;
    assert.deepEqual(validateDesign(d, p.id, { look }), [], p.id);
    for (const [f, v] of Object.entries(kinds[d.kind].fields)) if (v.budget && typeof d[f] === 'string') assert.ok(seen(d[f]) <= v.budget, `${p.id}: ${f} is ${seen(d[f])} characters, the budget is ${v.budget}`);
    assert.deepEqual(lintText(textFieldsOf(d), 'feed', brand), [], p.id);
    assert.doesNotMatch(JSON.stringify(d), /\$|£/, `${p.id}: euros only`);
    if (d.image) {
      const own = d.image.startsWith(`brands/${SLUG}/pictures/`) && fs.existsSync(path.join(ROOT, d.image));
      const photo = d.image.startsWith('design/assets/photos/') && credits.includes(`\`${path.basename(d.image)}\``);
      assert.ok(own || photo, `${p.id}: ${d.image} is a credited photo or one of the pack's drawings`);
    }
  }
});
