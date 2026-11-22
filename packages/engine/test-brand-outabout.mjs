// node --test   The fictional Outabout pack (brands/outabout), the what's-on guide for an invented city that shows off the guide look: it
// loads as a complete brand drawn in its own copy of the shipped guide look, its spelling rules leave the right spelling alone, and its
// example batch covers every post kind and passes the batch and post checks in that look.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR, ROOT } from './lib/core.mjs';
import { loadBrand, loadDirection, loadLook, loadSeries } from './lib/design/brand.mjs';
import { validateBatchDesigns } from './lib/design/batch.mjs';
import { postProblems, POST_KINDS } from './lib/design/post-spec.mjs';
import { lookBrief } from './lib/design/look.mjs';
import { postKinds, shippedLooks } from './lib/design/directions/index.mjs';
import { foreignMoneyWarning, lintText, textFieldsOf } from './lib/design/lint.mjs';

const PACK = path.join(ROOT, 'brands', 'outabout');
const file = path.join(PACK, 'brand.json');
const batch = JSON.parse(fs.readFileSync(path.join(PACK, 'batches', 'example-posts.json'), 'utf8'));
const CREDITS = fs.readFileSync(path.join(ENGINE_DIR, 'design', 'assets', 'photos', 'CREDITS.md'), 'utf8');
const seen = (v) => [...String(v).replace(/\*/g, '').replace(/\[\[|\]\]/g, '').replace(/\{\{[a-z-]+\}\}/g, 'xx')].length;

test('the Outabout pack loads as a complete brand, with its logos and fonts, drawn in its copy of the guide look', () => {
  const brand = loadBrand({ file });
  assert.equal(brand.name, 'Outabout');
  assert.ok(brand.logoFullSrc.startsWith('data:image/png;base64,') && brand.logoMarkSrc.startsWith('data:image/png;base64,'));
  assert.equal(brand.font.family, 'Archivo');
  assert.ok(brand.fontFaces.length > 0);
  assert.equal(loadDirection({ file }), 'guide');
  // the brand's look is the shipped guide look, copied: only the origin differs
  const own = loadLook({ file });
  assert.equal(own.origin, 'copy:shipped:guide');
  assert.deepEqual({ ...own, origin: 'shipped' }, JSON.parse(JSON.stringify(shippedLooks().guide)));
});

test('the Outabout spelling rules catch the wrong forms and leave the brand name and its web address alone', () => {
  const brand = loadBrand({ file });
  const wrong = (t) => lintText([{ field: 'sub', text: t }], 'feed', brand).some((w) => /should be written/.test(w));
  for (const ok of ['Outabout', 'Plans from Outabout', 'See outabout.example', 'https://outabout.example/jobs']) assert.equal(wrong(ok), false, ok);
  for (const bad of ['Out about', 'out-about', 'OutAbout', 'OUTABOUT', 'follow outabout now']) assert.equal(wrong(bad), true, bad);
});

test('the Outabout example batch covers every post kind and every composition of the look, within its budgets', () => {
  const brand = loadBrand({ file }), brief = lookBrief(loadLook({ file })), kinds = postKinds(brand);
  assert.deepEqual(validateBatchDesigns(batch.posts, { series: loadSeries({ file }) }), []);
  assert.ok(batch.posts.length >= 8);
  assert.deepEqual([...new Set(batch.posts.map((p) => p.design.kind))].sort(), [...POST_KINDS].sort());
  const drawn = new Set(batch.posts.map((p) => `${p.design.kind}/${p.design.variant ?? 0}`));
  for (const [kind, k] of Object.entries(brief.kinds)) for (const v of k.variants) assert.ok(drawn.has(`${kind}/${v.index}`), `${kind}/${v.index} has an example`);
  for (const p of batch.posts) {
    const d = p.design;
    assert.deepEqual(postProblems(d, p.id, { brief }), [], p.id);
    // a post that names its composition is held to that composition's own budgets; one that does not, to the smallest of the kind
    const own = d.variant === undefined ? null : brief.kinds[d.kind].variants.find((v) => v.index === d.variant).fields;
    for (const [f, v] of Object.entries(kinds[d.kind].fields)) {
      const max = own ? own[f]?.max : v.budget;
      if (max && typeof d[f] === 'string') assert.ok(seen(d[f]) <= max, `${p.id}: ${f} is ${seen(d[f])} characters, the guide budget is ${max}`);
    }
    assert.deepEqual(lintText(textFieldsOf(d), 'feed', brand), [], p.id);
    // the brand's money is pounds (money.local); no caption or image text mentions another currency
    assert.match(brand.money.local, /pounds \(£\)/);
    for (const [where, text] of [['caption', p.caption], ...Object.entries(p.networks).filter(([, n]) => n.caption).map(([k, n]) => [`${k} caption`, n.caption])]) assert.equal(foreignMoneyWarning(where, text, brand), null, `${p.id} ${where}`);
    // a picture is one of the engine's synthetic demo pictures (committed), or a photo recorded in the photo credits (the photos themselves
    // are git-ignored, so a fresh clone holds the credit, not the file)
    for (const img of [d.image, ...(d.gallery ?? []).map((g) => g.image)].filter(Boolean)) {
      if (img.startsWith('design/assets/demo/')) assert.ok(fs.existsSync(path.join(ENGINE_DIR, img)), `${p.id}: ${img} is one of the engine's synthetic pictures`);
      else assert.ok(img.startsWith('design/assets/photos/') && CREDITS.includes(`| \`${path.basename(img)}\` |`), `${p.id}: ${img} has a row in design/assets/photos/CREDITS.md`);
    }
  }
});
