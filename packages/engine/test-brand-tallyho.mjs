// node --test   The fictional Tallyho pack (brands/tallyho), the polls and community brand that shows off the loud look: it loads as a complete
// brand, its spelling rules leave the right spelling alone, and its example batch passes the batch and post checks in the loud look.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR, ROOT } from './lib/core.mjs';
import { loadBrand, loadSeries, validateBrand } from './lib/design/brand.mjs';
import { validateBatchDesigns } from './lib/design/batch.mjs';
import { postProblems, POST_KINDS } from './lib/design/post-spec.mjs';
import { lookBrief, shippedLooks } from './lib/design/directions/index.mjs';
import { lintText, textFieldsOf } from './lib/design/lint.mjs';

const PACK = path.join(ROOT, 'brands', 'tallyho');
const file = path.join(PACK, 'brand.json');
const batch = JSON.parse(fs.readFileSync(path.join(PACK, 'batches', 'example-posts.json'), 'utf8'));
const vault = JSON.parse(fs.readFileSync(path.join(PACK, 'vault.json'), 'utf8'));

test('the Tallyho pack loads as a complete brand, with its logos and fonts', () => {
  assert.deepEqual(validateBrand(JSON.parse(fs.readFileSync(file, 'utf8'))), []);
  const brand = loadBrand({ file });
  assert.equal(brand.name, 'Tallyho');
  assert.ok(brand.logoFullSrc.startsWith('data:image/png;base64,') && brand.logoMarkSrc.startsWith('data:image/png;base64,'));
  assert.equal(brand.font.family, 'Hanken Grotesk');
  assert.deepEqual(brand.darkGrounds.sort(), ['dark', 'deep']);
});

test('the Tallyho spelling rules catch the wrong forms and leave the brand name and its web address alone', () => {
  const brand = loadBrand({ file });
  const wrong = (t) => lintText([{ field: 'sub', text: t }], 'feed', brand).some((w) => /should be written/.test(w));
  for (const ok of ['Tallyho', 'Ask with Tallyho today', 'See tallyho.example', 'https://tallyho.example/games']) assert.equal(wrong(ok), false, ok);
  for (const bad of ['Tally ho', 'tally-ho', 'TallyHo', 'TALLYHO', 'join tallyho now']) assert.equal(wrong(bad), true, bad);
});

test('the Tallyho example batch covers every post kind and fits the loud look', () => {
  const brand = loadBrand({ file }), brief = lookBrief(shippedLooks().loud);
  // Tallyho turns emoji on (brand.json emoji), and its letter post carries two
  assert.equal(brand.emoji, true);
  assert.deepEqual(validateBatchDesigns(batch.posts, { series: loadSeries({ file }), emoji: brand.emoji }), []);
  assert.ok(batch.posts.some((p) => /\p{Extended_Pictographic}/u.test(JSON.stringify(p.design))), 'a post shows emoji');
  assert.ok(batch.posts.length >= 8);
  assert.deepEqual([...new Set(batch.posts.map((p) => p.design.kind))].sort(), [...POST_KINDS].sort());
  for (const p of batch.posts) {
    const d = p.design;
    assert.deepEqual(postProblems(d, p.id, { brief, emoji: brand.emoji }), [], p.id);
    assert.deepEqual(lintText(textFieldsOf(d), 'feed', brand), [], p.id);
    // pictures come from the engine's photo library, recorded in its CREDITS.md (the photos themselves are git-ignored)
    if (d.image) {
      assert.match(d.image, /^design\/assets\/photos\/[a-z0-9-]+\.jpg$/, p.id);
      assert.ok(fs.readFileSync(path.join(ENGINE_DIR, 'design', 'assets', 'photos', 'CREDITS.md'), 'utf8').includes(`| \`${path.basename(d.image)}\` |`), `${p.id}: ${d.image} has a row in CREDITS.md`);
    }
  }
});

test('the Tallyho vault holds invented items with round figures only', () => {
  assert.ok(vault.vault.length >= 5);
  for (const v of vault.vault) {
    assert.match(v.sourceNote, /Invented|Example/);
    for (const n of v.body.match(/\d[\d,]*%?/g) ?? []) if (/%$|,/.test(n)) assert.match(n, /^(\d{1,3}(,000)+|\d+0%)$/, `${v.title}: ${n} is a round figure`);
  }
});
