// The shipped bloom look as data (lib/design/looks/bloom.look.json): pure checks, no Chrome. Run: node --test test-design-look-bloom.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateLook, lookBrief } from './lib/design/look.mjs';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { NORMAL, STRESS, MINIMAL } from './testlib/bloom-copy.mjs';

const look = JSON.parse(fs.readFileSync(new URL('./lib/design/looks/bloom.look.json', import.meta.url), 'utf8'));
const walkEls = (els, fn) => { for (const e of els) { fn(e); if (e.children) walkEls(e.children, fn); } };

test('the bloom look loads, names itself and is registered as a shipped look', () => {
  assert.equal(look.id, 'bloom');
  assert.equal(look.origin, 'shipped');
  assert.equal(look.compositions.length, 9);
  assert.equal(look.colour.logic, 'one-accent');
  assert.equal(shippedLooks().bloom.id, 'bloom');
  assert.ok(look.description.length > 40 && look.description.length <= 300);
});

test('validateLook reports no problem at all (fully strict: no allow-list)', () => {
  assert.deepEqual(validateLook(look, 'bloom', { shipped: true }), []);
});

test('lookBrief lists all seven kinds with the right variant counts', () => {
  const b = lookBrief(look);
  assert.deepEqual(Object.keys(b.kinds).sort(), ['event', 'figure', 'list', 'offer', 'photo', 'quote', 'statement']);
  const counts = Object.fromEntries(Object.entries(b.kinds).map(([k, v]) => [k, v.variants.length]));
  assert.deepEqual(counts, { statement: 2, figure: 1, list: 1, quote: 1, photo: 2, event: 1, offer: 1 });
  for (const v of Object.values(b.kinds)) for (const x of v.variants) { assert.ok(x.name); assert.ok(x.describe.length > 40 && x.describe.length <= 300); }
});

test('no string carries a colour, a url, a path or markup', () => {
  const bad = [];
  (function walk(v, at) {
    if (typeof v === 'string') { if (/#[0-9a-f]{3,8}/i.test(v) || v.includes('url(') || v.includes('/') || v.includes('<')) bad.push(`${at}: ${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  })(look, 'look');
  assert.deepEqual(bad, []);
});

test('it is warm and organic: cream paper, a soft serif with italics, arches, ovals and circles, almost no tilt', () => {
  assert.equal(look.fonts.display.family, 'Fraunces');
  assert.equal(look.fonts.display.italic, true);
  assert.ok(look.fonts.display.opsz >= 9 && look.fonts.display.opsz <= 144, 'optical size set inside the font\'s axis');
  assert.equal(look.fonts.text.family, 'Hanken Grotesk');
  assert.equal(look.type.label.upper, false);
  assert.deepEqual(look.colour.grounds, ['paper']);
  for (const v of Object.values(look.devices.angles)) assert.ok(Math.abs(v) <= 2);
  const shapes = new Set();
  for (const c of look.compositions) {
    assert.equal(c.ground, 'paper');
    walkEls(c.elements, (e) => {
      assert.ok(!['frame', 'band', 'seam', 'meta-row', 'punch-hole'].includes(e.type), e.type);
      assert.notEqual(e.shadow, 'hard');
      if (e.rot !== undefined) assert.ok(Math.abs(typeof e.rot === 'number' ? e.rot : look.devices.angles[e.rot]) <= 2);
      if (typeof e.radius === 'string') shapes.add(e.radius);
      if (e.type === 'photo') shapes.add(e.shape);
      if (e.type === 'sticker') shapes.add(e.shape);
      if (e.type === 'text' && e.field === 'headline') assert.equal(e.emphasis, 'italic', 'headlines italicise the emphasis');
    });
  }
  for (const s of ['arch', 'oval', 'full', 'circle']) assert.ok(shapes.has(s), `uses ${s}`);
});

test('the photo kinds lead with an arch, an oval or a circle window; none is a square-cornered rectangle', () => {
  for (const c of look.compositions.filter((x) => ['photo', 'offer'].includes(x.kind))) {
    let seen = 0;
    walkEls(c.elements, (e) => { if (e.type === 'photo') { seen++; assert.ok(['arch', 'oval', 'circle'].includes(e.shape), `${c.name}: ${e.shape}`); } });
    assert.equal(seen, 1, c.name);
  }
});

test('the list marks its items with small round dots and dotted rules', () => {
  const list = look.compositions.find((c) => c.kind === 'list');
  let rows;
  walkEls(list.elements, (e) => { if (e.type === 'rows') rows = e; });
  assert.equal(rows.numberTile.radius, 'full');
  assert.ok(rows.numberTile.size <= 64);
  assert.equal(rows.ruleStyle, 'dotted');
});

test('the test copy names every composition (sample, stress, minimal)', () => {
  const want = [], seen = {};
  for (const c of look.compositions) { const i = seen[c.kind] ?? 0; seen[c.kind] = i + 1; want.push(`bloom/${c.kind}/${i}`); }
  for (const set of [NORMAL, STRESS, MINIMAL]) assert.deepEqual(Object.keys(set).sort(), [...want].sort());
});

test('the optical size is bounded by the font\'s own axis and only for a font that has one', () => {
  const ok = (mut) => { const l = structuredClone(look); mut(l); return validateLook(l, 'bloom', { shipped: true }); };
  assert.deepEqual(ok((l) => { l.fonts.display.opsz = 9; }), []);
  assert.deepEqual(ok((l) => { l.fonts.display.opsz = 144; }), []);
  assert.ok(ok((l) => { l.fonts.display.opsz = 8; }).length);
  assert.ok(ok((l) => { l.fonts.display.opsz = 145; }).length);
  assert.ok(ok((l) => { l.fonts.text.opsz = 20; }).some((e) => /optical size axis/.test(e)));
  assert.ok(ok((l) => { l.fonts.display.opsz = 'wide'; }).length);
});
