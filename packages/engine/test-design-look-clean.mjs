// The shipped clean look as data (lib/design/looks/clean.look.json): the classic poster pages (a headline, a figure, myth and fact, a
// picture melting into the page) as a look. Pure checks, no Chrome (test-design-look-equivalence.mjs draws it through every check).
// Run: node --test test-design-look-clean.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateLook, lookBrief } from './lib/design/look.mjs';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { NORMAL, STRESS, MINIMAL } from './testlib/clean-copy.mjs';

const look = JSON.parse(fs.readFileSync(new URL('./lib/design/looks/clean.look.json', import.meta.url), 'utf8'));
const walkEls = (els, fn) => { for (const e of els) { fn(e); if (e.children) walkEls(e.children, fn); } };

test('the clean look loads, names itself and is registered as a shipped look', () => {
  assert.equal(look.id, 'clean');
  assert.equal(look.name, 'Clean');
  assert.equal(look.origin, 'shipped');
  assert.equal(look.compositions.length, 10);
  assert.equal(shippedLooks().clean.id, 'clean');
  assert.ok(look.description.length > 40 && look.description.length <= 300);
});

test('validateLook reports no problem at all (fully strict: no allow-list)', () => {
  assert.deepEqual(validateLook(look, 'clean', { shipped: true }), []);
});

test('lookBrief lists all seven kinds with the right variant counts', () => {
  const b = lookBrief(look);
  const counts = Object.fromEntries(Object.entries(b.kinds).map(([k, v]) => [k, v.variants.length]));
  assert.deepEqual(counts, { statement: 2, figure: 2, list: 1, quote: 1, photo: 2, event: 1, offer: 1 });
  for (const v of Object.values(b.kinds)) for (const x of v.variants) { assert.ok(x.name); assert.ok(x.describe.length > 40 && x.describe.length <= 300); }
});

test('it is set in the brand\'s own fonts and names no colour, url, path or markup', () => {
  for (const f of Object.values(look.fonts)) assert.equal(f.source, 'brand');
  const bad = [];
  (function walk(v, at) {
    if (typeof v === 'string') { if (/#[0-9a-f]{3,8}/i.test(v) || v.includes('url(') || v.includes('/') || v.includes('<')) bad.push(`${at}: ${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  })(look, 'look');
  assert.deepEqual(bad, []);
});

test('every page has the logo top left and the web address top right, and headlines are two-tone (the deep field colour)', () => {
  assert.equal(look.logo.default, 'top-left');
  assert.equal(look.colour.accentAsType, 'field');
  for (const c of look.compositions) {
    let site = 0;
    walkEls(c.elements, (e) => { if (e.type === 'text' && e.source === 'site') { site++; assert.equal(e.align, 'right'); } });
    assert.equal(site, 1, `${c.kind}/${c.name}`);
  }
});

test('both photo pages melt the picture into the page at its foot; myth and fact are two rounded cards', () => {
  for (const c of look.compositions.filter((x) => x.kind === 'photo')) {
    let p; walkEls(c.elements, (e) => { if (e.type === 'photo') p = e; });
    assert.equal(p.blend, 'ground');
    assert.equal(p.place.px.y + p.place.px.h, 1350);
  }
  const mf = look.compositions.filter((x) => x.kind === 'statement')[1];
  const words = [], radii = [];
  walkEls(mf.elements, (e) => { if (e.word) words.push(e.word); if (e.type === 'box' && e.fill && typeof e.radius === 'number') radii.push(e.radius); });
  assert.deepEqual(words, ['Myth', 'Fact']);
  assert.deepEqual(radii, [32, 32]);
});

test('the test copy names every composition (sample, stress, minimal)', () => {
  const want = [], seen = {};
  for (const c of look.compositions) { const i = seen[c.kind] ?? 0; seen[c.kind] = i + 1; want.push(`clean/${c.kind}/${i}`); }
  for (const set of [NORMAL, STRESS, MINIMAL]) assert.deepEqual(Object.keys(set).sort(), want.sort());
});
