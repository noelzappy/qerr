// node --test   (looks as data wired into the engine: shippedLooks(), validateBrand with brand.looks and style.direction, post designs held to a data
// look's kinds, variants and budgets, postKinds(brand) in the shape of the code directions. Pure: no Chrome.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { brandFile } from './lib/core.mjs';
import { loadBrand, validateBrand } from './lib/design/brand.mjs';
import { compositionsFor, lookBrief, lookOfBrand, postKinds, shippedLooks } from './lib/design/directions/index.mjs';
import { validateLook } from './lib/design/look.mjs';
import { validateDesign } from './lib/design/spec.mjs';

const raw = () => JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
const copyOf = (id, as) => ({ ...structuredClone(shippedLooks()[id]), id: as, origin: `copy:shipped:${id}` });

test('shippedLooks: retail, swiss, soft, bloom, clean, loud, ledger, studio, roast and plate, validated, deep frozen, the same object every call', () => {
  const s = shippedLooks();
  assert.deepEqual(Object.keys(s), ['retail', 'swiss', 'soft', 'bloom', 'clean', 'loud', 'ledger', 'studio', 'roast', 'plate']);
  assert.equal(shippedLooks(), s);
  for (const [id, look] of Object.entries(s)) {
    assert.equal(look.id, id);
    assert.equal(look.origin, 'shipped');
    assert.equal(look.compositions.length, ({ loud: 13, ledger: 12, studio: 17, roast: 12, plate: 10 })[id] ?? 9, 'nine compositions each; loud has thirteen, ledger twelve, studio seventeen, roast twelve, plate ten');
    assert.deepEqual(validateLook(look, id, { shipped: true }), []);
    assert.ok(Object.isFrozen(look) && Object.isFrozen(look.compositions) && Object.isFrozen(look.compositions[0].elements[0]));
    assert.throws(() => { look.compositions[0].name = 'x'; }, TypeError);
  }
});

test('validateBrand: brand.looks are checked in full, with the problems named by where they are; style.direction names a shipped id or one of the looks', () => {
  const b = raw(), own = copyOf('swiss', 'my-swiss');
  assert.deepEqual(validateBrand({ ...b, looks: [own], style: { ...b.style, direction: 'my-swiss' } }), []);
  assert.deepEqual(validateBrand({ ...b, style: { ...b.style, direction: 'swiss' } }), []);
  assert.ok(validateBrand({ ...b, style: { ...b.style, direction: 'my-swiss' } }).some((e) => /direction must be one of/.test(e)), 'the look is not in the brand');
  const bad = structuredClone(own);
  bad.compositions[2].elements[1].sizes = [100, 200];
  const errs = validateBrand({ ...b, looks: [own, bad].map((l, i) => ({ ...l, id: `l${i}` })) });
  assert.ok(errs.length && errs.every((e) => e.startsWith('brand.json: looks[1]')), errs.join('|'));
  assert.ok(validateBrand({ ...b, looks: [own, { ...own }] }).some((e) => /used by more than one look/.test(e)));
});

test('a post design is held to a data look: kind, variant and the budgets of the compositions', () => {
  const look = copyOf('swiss', 'my-swiss'), o = { look };
  const ok = (d, opts = o) => assert.deepEqual(validateDesign({ template: 'post', ...d }, 'd', opts), [], JSON.stringify(d));
  const refused = (d, re, opts = o) => assert.ok(validateDesign({ template: 'post', ...d }, 'd', opts).some((e) => re.test(e)), `${JSON.stringify(d).slice(0, 80)}: ${re}`);
  ok({ kind: 'statement', headline: 'Hello' });
  ok({ kind: 'list', headline: 'Three', items: ['a', 'b', 'c'] });
  ok({ kind: 'list', headline: 'Five', items: ['a', 'b', 'c', 'd', 'e'] });
  refused({ kind: 'list', headline: 'Two', items: ['a', 'b'] }, /draws 3 to 5 items/);
  refused({ kind: 'statement', headline: 'x', variant: 2 }, /2 statement variants/);
  refused({ kind: 'photo', headline: 'x'.repeat(60), image: 'a.jpg', variant: 0 }, /headline is 60 characters; the Swiss look draws it with up to 56/);
  refused({ kind: 'photo', headline: 'x'.repeat(60), image: 'a.jpg' }, /draws it with up to 56/);
  ok({ kind: 'photo', headline: 'x'.repeat(56), image: 'a.jpg' });
  ok({ kind: 'statement', headline: 'x'.repeat(70) }); // the Poster takes 70
  refused({ kind: 'nope', headline: 'x' }, /kind must be one of/);
  // a look with no composition of a kind refuses that kind
  const thin = { ...look, compositions: look.compositions.filter((c) => c.kind !== 'quote') };
  refused({ kind: 'quote', quote: 'Said' }, /has no quote composition/, { look: thin });
  // without a look the direction is looked up among the engine's: an own id is not one
  refused({ kind: 'statement', headline: 'x' }, /not one of/, { direction: 'my-swiss' });
});

test('postKinds: the kinds, fields, budgets and variants of a brand\'s direction, the same shape for a data look as for a code direction', () => {
  const b = loadBrand();
  const code = postKinds({ ...b, style: { ...b.style, direction: 'retail' } });
  assert.deepEqual(Object.keys(code), ['statement', 'figure', 'list', 'quote', 'photo', 'event', 'offer']);
  assert.deepEqual(code.statement.variants.map((v) => v.name), compositionsFor('retail', 'statement').map((c) => c.name));
  assert.deepEqual(Object.keys(code.list), ['required', 'fields', 'variants']);
  // the shipped retail look drawn as data gives the same kinds, required fields, budgets and variant names as the code retail
  const own = copyOf('retail', 'my-retail');
  const data = postKinds({ ...b, looks: [own], style: { ...b.style, direction: 'my-retail' } });
  assert.deepEqual(Object.keys(data), Object.keys(code));
  for (const kind of Object.keys(code)) {
    assert.deepEqual(data[kind].required, code[kind].required, kind);
    assert.deepEqual(data[kind].variants.map((v) => v.name), code[kind].variants.map((v) => v.name), kind);
    for (const [f, spec] of Object.entries(code[kind].fields)) {
      if (['focal', 'zoom'].includes(f)) continue;
      assert.deepEqual(data[kind].fields[f]?.budget, spec.budget, `${kind}.${f} budget`);
    }
  }
  assert.equal(lookOfBrand({ ...b, looks: [own], style: { direction: 'my-retail' } }), own);
  assert.equal(lookOfBrand({ ...b, looks: [own], style: { direction: 'retail' } }), null);
  assert.deepEqual(lookBrief(own).kinds.event.variants[0].fields.meta, { required: true, max: 40 });
});
