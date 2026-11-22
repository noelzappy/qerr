// The shipped ledger look as data (lib/design/looks/ledger.look.json): a modern fintech look. Deep pages lit by a glow of the brand colour,
// big figures with change pills, phone screens, feature rows with icons, a how-it-works step page, a trust card, a testimonial with round
// pictures and an offer with a button. Pure checks, no Chrome (test-design-look-equivalence.mjs draws it through every check).
// Run: node --test test-design-look-ledger.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateLook, lookBrief } from './lib/design/look.mjs';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { NORMAL, STRESS, MINIMAL, PICTURES } from './testlib/ledger-copy.mjs';

const look = JSON.parse(fs.readFileSync(new URL('./lib/design/looks/ledger.look.json', import.meta.url), 'utf8'));
const walkEls = (els, fn) => { for (const e of els) { fn(e); if (e.children) walkEls(e.children, fn); } };
const elsOf = (c) => { const out = []; walkEls(c.elements, (e) => out.push(e)); return out; };
const byName = (name) => look.compositions.find((c) => c.name === name);

test('the ledger look loads, names itself and is registered as a shipped look', () => {
  assert.equal(look.id, 'ledger');
  assert.equal(look.name, 'Ledger');
  assert.equal(look.origin, 'shipped');
  assert.equal(look.compositions.length, 12);
  assert.equal(shippedLooks().ledger.id, 'ledger');
  assert.ok(look.description.length > 40 && look.description.length <= 300);
});

test('validateLook reports no problem at all (fully strict: no allow-list)', () => {
  assert.deepEqual(validateLook(look, 'ledger', { shipped: true }), []);
});

test('lookBrief lists all seven kinds with the right variant counts', () => {
  const b = lookBrief(look);
  const counts = Object.fromEntries(Object.entries(b.kinds).map(([k, v]) => [k, v.variants.length]));
  assert.deepEqual(counts, { statement: 2, figure: 3, list: 2, quote: 1, photo: 2, event: 1, offer: 1 });
  for (const v of Object.values(b.kinds)) for (const x of v.variants) { assert.ok(x.name); assert.ok(x.describe.length > 40 && x.describe.length <= 300); }
});

test('it is set in Inter from the font library and names no colour, url, path or markup', () => {
  for (const f of Object.values(look.fonts)) { assert.equal(f.source, 'library'); assert.equal(f.family, 'Inter'); }
  const bad = [];
  (function walk(v, at) {
    if (typeof v === 'string') { if (/#[0-9a-f]{3,8}/i.test(v) || v.includes('url(') || v.includes('/') || v.includes('<')) bad.push(`${at}: ${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  })(look, 'look');
  assert.deepEqual(bad, []);
});

test('the deep pages are lit by a gradient of brand colour roles, under everything else', () => {
  const dark = look.compositions.filter((c) => c.ground === 'dark');
  assert.ok(dark.length >= 5);
  for (const c of dark) {
    const g = c.elements.find((e) => e.type === 'gradient');
    assert.ok(g, `${c.name}: a gradient`);
    assert.deepEqual(g.place, { inset: 'page' });
    assert.ok(g.gradient.stops.includes('dark') && g.gradient.stops.includes('field'), `${c.name}: from the brand's own roles`);
    assert.equal(g.z, 0);
  }
});

test('the design devices: change pills, a phone screen, icon rows, a trust badge, round pictures and buttons', () => {
  // a big figure with a change pill (a button on the tag, an arrow up and right)
  for (const name of ['Big number', 'Balance card']) {
    const c = byName(name), els = elsOf(c);
    assert.ok(els.some((e) => e.type === 'fitted-stack' && e.field === 'big'), name);
    assert.ok(els.some((e) => e.type === 'button' && e.field === 'tag' && e.icon === 'arrow-up-right'), name);
  }
  // the phone: drawn by the engine round a bare screenshot (a dark body, an island, side buttons, a soft lift); a pre-framed capture is shown as it is
  const phone = elsOf(byName('Phone')).find((e) => e.type === 'device');
  assert.ok(phone && !elsOf(byName('Phone')).some((e) => e.type === 'photo'), 'no flat picture: the device draws the phone');
  assert.deepEqual([phone.model, phone.finish, phone.cutout, phone.buttons, phone.shadow], ['phone', 'dark', 'island', true, 'lift']);
  // features: a tick on each row's tile; the event: a calendar, a clock and a pin for its date, time and place
  assert.deepEqual(elsOf(byName('Features')).find((e) => e.type === 'rows').icons, ['check']);
  assert.deepEqual(elsOf(byName('Live session')).find((e) => e.type === 'rows').icons, ['calendar', 'clock', 'pin']);
  // trust: a shield on a badge in the brand colour
  assert.ok(elsOf(byName('Trust card')).some((e) => e.type === 'icon-badge' && e.icon === 'shield' && e.fill === 'field'));
  // testimonial: the one portrait picture of the person quoted (avatar) in a ring of the brand colour; round pictures from the gallery, overlapping and
  // ringed in the page colour, when there is no avatar
  const row = elsOf(byName('Testimonial')).find((e) => e.type === 'photo-row');
  assert.ok(row.overlap > 0 && row.ring.colour === 'paper');
  assert.deepEqual(row.when, { present: 'gallery', absent: 'avatar' });
  const face = elsOf(byName('Testimonial')).find((e) => e.type === 'avatar');
  assert.deepEqual([face.shape, face.ring.colour, face.when.present], ['circle', 'field', 'avatar']);
  assert.ok(byName('Testimonial').fields.avatar && byName('Testimonial').fields.gallery);
  // the offer and the hero end in a button in the accent colour
  for (const name of ['Gradient offer', 'Gradient hero', 'Phone']) assert.ok(elsOf(byName(name)).some((e) => e.type === 'button' && e.field === 'cta' && e.fill === 'gold'), name);
  // the how-it-works step page: the step number fitted on a tile, the page number from the folio
  const step = elsOf(byName('Step'));
  assert.ok(step.some((e) => e.type === 'fitted-stack' && e.field === 'big'));
  assert.ok(step.some((e) => e.type === 'text' && e.source === 'folio'));
  assert.equal(look.devices.folio, 'pad2-of-total');
});

test('the test copy names every composition (sample, stress, minimal), in euros only', () => {
  const want = [], seen = {};
  for (const c of look.compositions) { const i = seen[c.kind] ?? 0; seen[c.kind] = i + 1; want.push(`ledger/${c.kind}/${i}`); }
  for (const set of [NORMAL, STRESS, MINIMAL]) assert.deepEqual(Object.keys(set).sort(), want.sort());
  const words = JSON.stringify([NORMAL, STRESS, MINIMAL]);
  assert.ok(!/[$£¥]|\b(dollars?|pounds?|USD|GBP)\b/.test(words), 'euros only');
  for (const [id, p] of Object.entries(PICTURES)) assert.ok(want.includes(id) && fs.existsSync(new URL(`./${p.image}`, import.meta.url)), id);
});
