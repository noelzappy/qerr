// node --test   The fictional Northbeam pack (brands/northbeam), the product-studio brand that shows off the studio look: it loads as a complete
// brand, its colours carry the look (red field, near-black and cream pages), its spelling rules leave the right spelling alone, and its example
// batch passes the batch and post checks against the studio look.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR, ROOT } from './lib/core.mjs';
import { loadBrand, loadSeries } from './lib/design/brand.mjs';
import { validateBatchDesigns } from './lib/design/batch.mjs';
import { postProblems, POST_KINDS } from './lib/design/post-spec.mjs';
import { lookBrief } from './lib/design/look.mjs';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { accentPlan, palette } from './lib/design/directions/colour.mjs';
import { displayTarget } from './lib/design/checks.mjs';
import { lintText, textFieldsOf } from './lib/design/lint.mjs';

const PACK = path.join(ROOT, 'brands', 'northbeam');
const file = path.join(PACK, 'brand.json');
const batch = JSON.parse(fs.readFileSync(path.join(PACK, 'batches', 'example-posts.json'), 'utf8'));
const seen = (v) => [...String(v).replace(/\*/g, '').replace(/\[\[|\]\]/g, '')].length;
const studio = shippedLooks().studio;

test('the Northbeam pack loads as a complete brand, with its logos and fonts', () => {
  const brand = loadBrand({ file });
  assert.equal(brand.name, 'Northbeam');
  assert.ok(brand.logoFullSrc.startsWith('data:image/png;base64,') && brand.logoMarkSrc.startsWith('data:image/png;base64,'));
  assert.equal(brand.font.family, 'Inter');
  assert.ok(brand.fontFaces.length > 0);
  assert.deepEqual(brand.darkGrounds.sort(), ['dark', 'deep']);
});

test('its colours carry the studio look: the red is the field as it is, and reads as type on the dark page and on cream', () => {
  const brand = loadBrand({ file }), pal = palette(brand, displayTarget(brand)), plan = accentPlan(brand, pal);
  assert.equal(pal.field, brand.accents.primary, 'the red field is not deepened');
  assert.equal(pal.onField, brand.grounds.light, 'cream type on the red field');
  assert.ok(plan.word.dark && plan.word.paper, 'the red final word reads on the dark page and on cream, so no page is turned light');
});

test('the Northbeam spelling rules catch the wrong forms and leave the brand name and its web address alone', () => {
  const brand = loadBrand({ file });
  const wrong = (t) => lintText([{ field: 'sub', text: t }], 'feed', brand).some((w) => /should be written/.test(w));
  for (const ok of ['Northbeam', 'Work with Northbeam', 'See northbeam.example', 'https://northbeam.example/work']) assert.equal(wrong(ok), false, ok);
  for (const bad of ['North beam', 'north-beam', 'NorthBeam', 'NORTHBEAM', 'ask northbeam now']) assert.equal(wrong(bad), true, bad);
});

test('the Northbeam example batch covers every post kind and fits the studio look', () => {
  const brand = loadBrand({ file }), brief = lookBrief(studio);
  assert.ok(batch.posts.length >= 8);
  assert.deepEqual(validateBatchDesigns(batch.posts, { series: loadSeries({ file }), look: studio }), []);
  const designs = batch.posts.flatMap((p) => (p.design.template === 'carousel' ? p.design.pages.map((d, i) => [`${p.id} page ${i + 1}`, d]) : [[p.id, p.design]]));
  assert.deepEqual([...new Set(designs.map(([, d]) => d.kind))].sort(), [...POST_KINDS].sort());
  assert.ok(batch.posts.some((p) => p.design.template === 'carousel'), 'a carousel, to show Swipe');
  for (const [id, d] of designs) {
    assert.deepEqual(postProblems(d, id, { brief }), [], id);
    const fields = brief.kinds[d.kind].variants[d.variant].fields;
    for (const [f, v] of Object.entries(fields)) if (v.max && typeof d[f] === 'string') assert.ok(seen(d[f]) <= v.max, `${id}: ${f} is ${seen(d[f])} characters, the design holds ${v.max}`);
    assert.deepEqual(lintText(textFieldsOf(d), 'feed', brand), [], id);
    for (const pic of [d.image, ...(d.gallery ?? []).map((g) => g.image)].filter(Boolean)) {
      if (pic.startsWith('design/assets/demo/')) assert.ok(fs.existsSync(path.join(ENGINE_DIR, pic)), `${id}: ${pic} is one of the engine's synthetic pictures`);
      else {
        // a stock or owner's photo is not committed (rule 7), but its licence and source are: one row in the photos' CREDITS.md
        assert.match(pic, /^design\/assets\/photos\/[a-z0-9-]+\.jpg$/, `${id}: ${pic}`);
        assert.ok(CREDITS.includes(`| \`${path.basename(pic)}\` |`), `${id}: ${pic} has a row in design/assets/photos/CREDITS.md`);
      }
    }
  }
});
const CREDITS = fs.readFileSync(path.join(ENGINE_DIR, 'design', 'assets', 'photos', 'CREDITS.md'), 'utf8');
