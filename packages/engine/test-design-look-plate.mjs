// The shipped plate look as data (lib/design/looks/plate.look.json): a grill restaurant after dark, with near-black grounds, full-bleed food
// pictures under colour laid over them, a fine high-contrast serif over small capitals, menus with dotted price leaders, a reservation with
// When / Where / Book on rows and a button, a chef's quote, tonight's special and a big figure. The pure checks run without Chrome; the last test
// draws every composition with the fictional Salt & Ember pack (brands/saltandember) and its drawn pictures through every check (skipped without Chrome).
// Run: node --test test-design-look-plate.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './lib/core.mjs';
import { validateLook, lookBrief } from './lib/design/look.mjs';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { loadBrand } from './lib/design/brand.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { renderImage } from './lib/design/render.mjs';
import { normaliseDesign, validateDesign } from './lib/design/spec.mjs';
import { NORMAL, STRESS, MINIMAL, PICTURES } from './testlib/plate-copy.mjs';

const look = JSON.parse(fs.readFileSync(new URL('./lib/design/looks/plate.look.json', import.meta.url), 'utf8'));
const walkEls = (els, fn) => { for (const e of els) { fn(e); if (e.children) walkEls(e.children, fn); } };
const clone = (v) => JSON.parse(JSON.stringify(v));
const compsOf = (kind) => look.compositions.filter((c) => c.kind === kind);
const asCopy = (l) => ({ ...clone(l), origin: `copy:shipped:${l.id}` });

test('the plate look loads, names itself and is registered as a shipped look', () => {
  assert.equal(look.id, 'plate');
  assert.equal(look.name, 'Plate');
  assert.equal(look.origin, 'shipped');
  assert.equal(shippedLooks().plate.id, 'plate');
  assert.ok(look.description.length > 40 && look.description.length <= 300);
});

test('validateLook reports no problem at all', () => {
  assert.deepEqual(validateLook(look, 'plate', { shipped: true }), []);
});

test('lookBrief lists all seven kinds with two designs where the restaurant needs variety', () => {
  const b = lookBrief(look);
  const counts = Object.fromEntries(Object.entries(b.kinds).map(([k, v]) => [k, v.variants.length]));
  assert.deepEqual(counts, { statement: 2, figure: 1, list: 1, quote: 1, photo: 2, event: 2, offer: 1 });
  for (const v of Object.values(b.kinds)) for (const x of v.variants) { assert.ok(x.name); assert.ok(x.describe.length > 40 && x.describe.length <= 300); }
});

test('it is set in a fine Fraunces over small capitals in Inter and names no colour, url, path or markup', () => {
  assert.equal(look.fonts.display.family, 'Fraunces');
  assert.equal(look.type.display.weight, 300);
  assert.equal(look.fonts.label.family, 'Inter');
  assert.equal(look.type.label.upper, true);
  const bad = [];
  (function walk(v, at) {
    if (typeof v === 'string') { if (/#[0-9a-f]{3,8}/i.test(v) || v.includes('url(') || v.includes('/') || v.includes('<')) bad.push(`${at}: ${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  })(look, 'look');
  assert.deepEqual(bad, []);
});

test('the restaurant devices: dark grounds, overlays on full pictures, a reservation with info rows and a button, a menu with price leaders', () => {
  assert.equal(look.colour.grounds[0], 'dark');
  assert.ok(look.compositions.filter((c) => c.ground === 'dark').length >= 7);
  for (const c of look.compositions) {
    const full = c.elements.find((e) => e.type === 'photo' && e.place?.inset === 'page');
    if (full) assert.ok(c.elements.some((e) => e.type === 'overlay'), `${c.name}: a full picture has colour over it`);
  }
  const res = compsOf('event').find((c) => c.name === 'Reservation');
  let info = 0, button = 0; walkEls(res.elements, (e) => { if (e.type === 'info-rows') info++; if (e.type === 'button') button++; });
  assert.deepEqual([info, button], [1, 1]);
  let r; walkEls(compsOf('list')[0].elements, (e) => { if (e.type === 'rows') r = e; }); assert.equal(r.leader, 'dotted');
  assert.ok(compsOf('offer')[0].elements.some((e) => e.type === 'sticker' && e.field === 'tag'));
  assert.ok(compsOf('quote')[0].fields.by);
});

test('the test copy names every composition (sample, stress, minimal), with round euro prices only', () => {
  const want = [], seen = {};
  for (const c of look.compositions) { const i = seen[c.kind] ?? 0; seen[c.kind] = i + 1; want.push(`plate/${c.kind}/${i}`); }
  for (const set of [NORMAL, STRESS, MINIMAL]) {
    assert.deepEqual(Object.keys(set).sort(), want.sort());
    const words = JSON.stringify(set);
    assert.doesNotMatch(words, /\$|£|\d[.,]\d\d\b/, 'euros only, round prices');
  }
});

// ---- every composition through every check, in the Salt & Ember pack with its drawn pictures ----
const chrome = findChrome();
test('every plate composition passes every check from sample, stress and minimal copy in the Salt & Ember pack', { skip: chrome ? false : 'Google Chrome was not found' }, async () => {
  const pack = loadBrand({ file: path.join(ROOT, 'brands', 'saltandember', 'brand.json') });
  const b = { ...pack, looks: [asCopy(shippedLooks().plate)], style: { ...pack.style, direction: 'plate' } };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-plate-'));
  const browser = await Browser.launch({ chromePath: chrome });
  let drawn = 0;
  try {
    const seen = {};
    for (const comp of look.compositions) {
      const v = seen[comp.kind] ?? 0; seen[comp.kind] = v + 1;
      const id = `plate/${comp.kind}/${v}`, pic = PICTURES[`${comp.kind}/${v}`] ?? PICTURES[comp.kind] ?? PICTURES.photo;
      for (const [name, set] of [['sample', NORMAL], ['stress', STRESS], ['minimal', MINIMAL]]) {
        const spec = { template: 'post', kind: comp.kind, variant: v, name: 'plate-test', ...set[id], ...(comp.fields.image ? { image: pic } : {}) };
        assert.deepEqual(validateDesign(spec, id, {}), [], `${id} ${name}`);
        try { await renderImage(browser, b, { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, `${comp.kind}-${v}-${name}.png`) }, { tmpDir: tmp }); drawn++; }
        catch (e) { assert.fail(`${id} (${comp.name}) ${name}: ${e.message}`); }
      }
    }
  } finally { browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  assert.equal(drawn, look.compositions.length * 3);
});
