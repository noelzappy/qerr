// The shipped soft look as data (lib/design/looks/soft.look.json) and the bounded round-shape capabilities it uses: pure checks, no Chrome.
// Run: node --test test-design-look-soft.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateLook, lookBrief, lookCatalogue } from './lib/design/look.mjs';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { NORMAL, STRESS, MINIMAL } from './testlib/soft-copy.mjs';

const look = JSON.parse(fs.readFileSync(new URL('./lib/design/looks/soft.look.json', import.meta.url), 'utf8'));

test('the soft look loads, names itself and is registered as a shipped look', () => {
  assert.equal(look.id, 'soft');
  assert.equal(look.name, 'Soft');
  assert.equal(look.origin, 'shipped');
  assert.equal(look.compositions.length, 11);
  assert.equal(look.colour.logic, 'tonal');
  assert.equal(shippedLooks().soft.id, 'soft');
  assert.ok(look.description.length > 40 && look.description.length <= 300);
});

test('validateLook reports no problem at all (fully strict: no allow-list)', () => {
  assert.deepEqual(validateLook(look, 'soft', { shipped: true }), []);
});

test('lookBrief lists all seven kinds with the right variant counts', () => {
  const b = lookBrief(look);
  assert.deepEqual(Object.keys(b.kinds).sort(), ['event', 'figure', 'list', 'offer', 'photo', 'quote', 'statement']);
  const counts = Object.fromEntries(Object.entries(b.kinds).map(([k, v]) => [k, v.variants.length]));
  assert.deepEqual(counts, { statement: 3, figure: 2, list: 1, quote: 1, photo: 2, event: 1, offer: 1 });
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

// ---- what makes it soft ----
const walkEls = (els, fn, parent = null) => { for (const e of els) { fn(e, parent); if (e.children) walkEls(e.children, fn, e); } };
const ROUND = (e) => e.radius !== undefined || (e.type === 'sticker' && ['circle', 'pill'].includes(e.shape)) || (e.type === 'photo' && e.shape !== 'rect' && e.shape !== 'print');

test('nothing is sharp: no rules, bars, tilt, hard shadows or square corners', () => {
  for (const v of Object.values(look.devices.angles)) assert.equal(v, 0);
  assert.equal(look.dials.tilt, 0);
  assert.equal(look.devices.frame.t, 0);
  for (const c of look.compositions) {
    walkEls(c.elements, (e) => {
      const at = `${c.kind}/${c.name}`;
      assert.ok(!['rule', 'frame', 'band', 'seam', 'meta-row', 'punch-hole'].includes(e.type), `${at}: ${e.type}`);
      assert.equal(e.rot, undefined, `${at}: rot`);
      assert.notEqual(e.shadow, 'hard', `${at}: hard shadow`);
      assert.ok(!e.shadow || typeof e.shadow === 'string', `${at}: shadow is a named soft one`);
      assert.equal(e.skew, undefined);
      if (e.type === 'photo') assert.ok(e.blend === 'ground' || ['rounded', 'circle', 'oval', 'pill', 'arch'].includes(e.shape), `${at}: photo shape ${e.shape}`);
      if (e.type === 'block') assert.ok(e.radius !== undefined, `${at}: a block is round`);
      if (e.type === 'box' && e.fill !== undefined && e.fill !== 'paper-warm') assert.ok(e.radius !== undefined, `${at}: a filled box is rounded`);
      if (e.type === 'sticker') assert.ok(['circle', 'pill', 'tile'].includes(e.shape) && (e.shape !== 'tile' || e.radius >= 48), `${at}: sticker`);
      if (typeof e.radius === 'number' && e.type === 'box' && e.fill) assert.ok(e.radius >= 44, `${at}: card radius ${e.radius}`);
    });
  }
});

test('every composition is built from round shapes and uses the tonal palette', () => {
  const tonal = new Set(['tint-deep', 'light-tint', 'paper', 'field', 'field-deep', 'primary', 'ink', 'body', 'muted', 'muted-dark', 'accent-type']);
  for (const c of look.compositions) {
    let round = 0;
    walkEls(c.elements, (e) => {
      if (ROUND(e)) round++;
      for (const k of ['fill', 'ink', 'colour']) if (typeof e[k] === 'string') assert.ok(tonal.has(e[k]) || e[k].startsWith('on-'), `${c.name}: ${k} ${e[k]}`);
    });
    assert.ok(round >= 1, `${c.kind}/${c.name}: ${round} round shapes`);
    assert.ok(['tint', 'dark'].includes(c.ground), `${c.name}: ground ${c.ground}`);
  }
});

test('type is sentence case in medium weights', () => {
  assert.equal(look.fonts.display.family, 'Hanken Grotesk');
  assert.ok(look.type.display.weight >= 600 && look.type.display.weight <= 700);
  assert.equal(look.type.label.upper, false);
  assert.equal(look.type.display.case, 'as-typed');
  assert.ok(look.type.display.lead >= 1.0 && look.type.body.lead >= 1.35);
});

test('the test copy names every composition (sample, stress, minimal)', () => {
  for (const set of [NORMAL, STRESS, MINIMAL]) {
    const keys = Object.keys(set).sort();
    const want = [];
    const seen = {};
    for (const c of look.compositions) { const i = seen[c.kind] ?? 0; seen[c.kind] = i + 1; want.push(`soft/${c.kind}/${i}`); }
    assert.deepEqual(keys, want.sort());
  }
});

// ---- the bounded capabilities it added to the schema ----
const sample = () => structuredClone(look);
const elOf = (l, kind, type) => { let hit; walkEls(l.compositions.find((c) => c.kind === kind).elements, (e) => { if (!hit && e.type === type) hit = e; }); return hit; };

test('radius: a number, full, oval or arch; corners go with a radius and never with an oval', () => {
  const ok = (mut) => { const l = sample(); mut(l); return validateLook(l, 'soft', { shipped: true }); };
  for (const r of ['full', 'oval', 'arch', 48, 200]) assert.deepEqual(ok((l) => { elOf(l, 'statement', 'box').radius = r; }), [], String(r));
  assert.ok(ok((l) => { elOf(l, 'statement', 'box').radius = 'pentagon'; }).length);
  assert.ok(ok((l) => { elOf(l, 'statement', 'box').radius = 201; }).length);
  for (const c of ['all', 'top', 'bottom', 'left', 'right']) assert.deepEqual(ok((l) => { const b = elOf(l, 'statement', 'box'); b.radius = 64; b.corners = c; }), [], c);
  assert.ok(ok((l) => { const b = elOf(l, 'statement', 'box'); b.radius = 64; b.corners = 'diagonal'; }).length);
  assert.ok(ok((l) => { const b = elOf(l, 'statement', 'box'); delete b.radius; b.corners = 'top'; }).some((e) => /corners/.test(e)));
  assert.ok(ok((l) => { const b = elOf(l, 'statement', 'box'); b.radius = 'oval'; b.corners = 'top'; }).some((e) => /oval/.test(e)));
});

test('photo shapes include oval and pill; shadows include the two soft presets and nothing free-form', () => {
  const ok = (mut) => { const l = sample(); mut(l); return validateLook(l, 'soft', { shipped: true }); };
  for (const s of ['oval', 'pill', 'circle', 'arch']) assert.deepEqual(ok((l) => { const p = elOf(l, 'offer', 'photo'); p.shape = s; delete p.radius; }), [], s);
  for (const s of ['hard', 'soft', 'lift']) assert.deepEqual(ok((l) => { elOf(l, 'offer', 'photo').shadow = s; }), [], s);
  for (const s of ['blur', 'soft; background:url(x)', 'inset']) assert.ok(ok((l) => { elOf(l, 'offer', 'photo').shadow = s; }).length, s);
  assert.ok(ok((l) => { elOf(l, 'statement', 'text').textShadow = 'soft'; }).length, 'letters take only the hard shadow');
});

test('rows: round tiles, rounded rows, a gap between rows and a dotted rule are bounded', () => {
  const ok = (mut) => { const l = sample(); mut(l); return validateLook(l, 'soft', { shipped: true }); };
  const rows = (l) => elOf(l, 'list', 'rows');
  assert.deepEqual(ok((l) => { rows(l).rowRadius = 'full'; rows(l).rowGap = 48; rows(l).numberTile.radius = 70; }), []);
  assert.ok(ok((l) => { rows(l).rowRadius = 101; }).length);
  assert.ok(ok((l) => { rows(l).rowGap = 49; }).length);
  assert.ok(ok((l) => { rows(l).numberTile.radius = 'x'; }).length);
  assert.deepEqual(ok((l) => { rows(l).rule = 'hair'; rows(l).ruleStyle = 'dotted'; }), []);
  assert.ok(ok((l) => { rows(l).ruleStyle = 'wavy'; }).length);
});

test('the catalogue lists the new properties with help in plain words', () => {
  const cat = lookCatalogue();
  const text = JSON.stringify(cat);
  for (const w of ['corners', 'rowRadius', 'rowGap', 'ruleStyle', 'lift', 'oval', 'arch', 'opsz']) assert.ok(text.includes(`"${w}"`), w);
  assert.ok(cat.lists.photoShapes.includes('oval') && cat.lists.photoShapes.includes('pill'));
});

test('a ground may be tint, and tint-deep is a fill with dark inks only', () => {
  const l = sample(); l.colour.grounds = ['tint', 'paper', 'field', 'dark', 'soft'];
  assert.deepEqual(validateLook(l, 'soft', { shipped: true }), []);
  const bad = sample(); elOf(bad, 'statement', 'box').fill = 'tint-deep'; elOf(bad, 'statement', 'box').ink = 'on-field';
  assert.ok(validateLook(bad, 'soft', { shipped: true }).some((e) => /does not read/.test(e)));
});

// ---- the signature of the soft look and the capabilities that carry it ----
test('every page has the quiet header: the brand\'s logo (look-level) and its web address (a text source)', () => {
  assert.equal(look.logo.default, 'top-left');
  for (const c of look.compositions) {
    let site = 0;
    walkEls(c.elements, (e) => { if (e.type === 'text' && e.source === 'site') { site++; assert.equal(e.align, 'right'); } });
    assert.equal(site, 1, `${c.kind}/${c.name}`);
  }
});

test('the headline carries its emphasis in the deep colour (accentAsType field), never a bar or a tilt', () => {
  assert.equal(look.colour.accentAsType, 'field');
  assert.deepEqual(look.devices.highlight.pad, [0, 0, 0, 0]);
  walkEls(look.compositions.flatMap((c) => c.elements), (e) => { if (e.type === 'text' && e.field === 'headline') assert.ok([undefined, 'accent', 'none'].includes(e.emphasis), e.emphasis); });
});

test('statement/1 is the myth and fact page: two rounded panels with the fixed words Myth and Fact, parts of one headline', () => {
  const c = look.compositions.filter((x) => x.kind === 'statement')[1];
  assert.equal(c.name, 'Myth and fact');
  const words = [], parts = [], radii = [];
  walkEls(c.elements, (e) => { if (e.word) words.push(e.word); if (e.type === 'text' && e.field === 'headline') parts.push(e.part); if (e.type === 'box' && e.fill && typeof e.radius === 'number') radii.push(e.radius); });
  assert.deepEqual(words, ['Myth', 'Fact']);
  assert.deepEqual(parts, ['pre', 'phrase']);
  assert.deepEqual(radii, [44, 44]);
  assert.deepEqual(lookBrief(look).kinds.statement.variants[1].accepts.map((a) => [a.part, a.minChars, a.maxChars]), [['pre', 3, 30], ['phrase', 3, 30]]);
});

test('both photo pages melt the picture into the page at the foot, one left aligned and one centred', () => {
  const photos = look.compositions.filter((x) => x.kind === 'photo');
  assert.equal(photos.length, 2);
  for (const c of photos) {
    let p;
    walkEls(c.elements, (e) => { if (e.type === 'photo') p = e; });
    assert.equal(p.blend, 'ground');
    assert.ok(p.fade >= 100 && p.fade <= 400);
    assert.equal(p.place.px.y + p.place.px.h, 1350, 'it runs to the foot of the page');
    assert.equal(p.place.px.x, 0);
    assert.equal(p.place.px.w, 1080);
  }
  const centred = [];
  for (const c of photos) walkEls(c.elements, (e) => { if (e.type === 'text' && e.field === 'headline') centred.push(e.align === 'center'); });
  assert.deepEqual(centred, [false, true]);
});

test('photo blend: ground or fade for a plain rectangle only, with a fade length from 0 to 400', () => {
  const ok = (mut) => { const l = structuredClone(look); mut(l); return validateLook(l, 'soft', { shipped: true }); };
  const photo = (l) => { let p; walkEls(l.compositions.find((c) => c.name === 'Foot photo').elements, (e) => { if (e.type === 'photo') p = e; }); return p; };
  for (const b of ['none', 'ground', 'fade']) assert.deepEqual(ok((l) => { photo(l).blend = b; if (b === 'none') delete photo(l).fade; }), [], b);
  for (const f of [0, 400]) assert.deepEqual(ok((l) => { photo(l).fade = f; }), [], String(f));
  for (const f of [-1, 401, 'long', 1.5]) assert.ok(ok((l) => { photo(l).fade = f; }).length, String(f));
  assert.ok(ok((l) => { photo(l).blend = 'stretch'; }).length);
  assert.ok(ok((l) => { photo(l).shape = 'circle'; }).some((e) => /rectangle/.test(e)));
  for (const k of ['shadow', 'ring', 'keyline']) assert.ok(ok((l) => { photo(l)[k] = k === 'shadow' ? 'soft' : k === 'ring' ? { w: 4, colour: 'paper' } : 2; }).some((e) => /takes no/.test(e)), k);
  assert.ok(ok((l) => { delete photo(l).blend; photo(l).fade = 100; }).some((e) => /fade/.test(e)));
});

test('text words: exactly one of field, source or word; the words and the sources are fixed lists', () => {
  const ok = (mut) => { const l = structuredClone(look); mut(l); return validateLook(l, 'soft', { shipped: true }); };
  const site = (l) => { let t; walkEls(l.compositions[0].elements, (e) => { if (e.source === 'site') t = e; }); return t; };
  assert.deepEqual(ok((l) => { const t = site(l); delete t.source; t.word = 'Fact'; }), []);
  assert.ok(ok((l) => { site(l).word = 'Fact'; }).some((e) => /exactly one/.test(e)));
  assert.ok(ok((l) => { const t = site(l); delete t.source; t.word = 'Rumour'; }).length);
  assert.ok(ok((l) => { site(l).source = 'url'; }).length);
});

test('accepts: minChars is a whole number up to the field\'s maximum and never above maxChars', () => {
  const ok = (mut) => { const l = structuredClone(look); mut(l); return validateLook(l, 'soft', { shipped: true }); };
  const rule = (l) => l.compositions.filter((c) => c.kind === 'statement')[1].accepts[0];
  assert.deepEqual(ok((l) => { rule(l).minChars = 30; }), []);
  assert.ok(ok((l) => { rule(l).minChars = 31; }).some((e) => /more than maxChars/.test(e)));
  for (const v of [0, -1, 1.5, 'x', 71]) assert.ok(ok((l) => { rule(l).minChars = v; }).length, String(v));
});

test('the look-level logo and the emphasis colour take only their fixed values', () => {
  const ok = (mut) => { const l = structuredClone(look); mut(l); return validateLook(l, 'soft', { shipped: true }); };
  for (const v of ['off', 'corner', 'top-left']) assert.deepEqual(ok((l) => { l.logo.default = v; }), [], v);
  assert.ok(ok((l) => { l.logo.default = 'centre'; }).length);
  for (const v of ['never', 'when-contrast', 'field']) assert.deepEqual(ok((l) => { l.colour.accentAsType = v; }), [], v);
  assert.ok(ok((l) => { l.colour.accentAsType = 'always'; }).length);
});
