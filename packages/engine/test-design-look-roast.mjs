// The shipped roast look as data (lib/design/looks/roast.look.json): a neighbourhood café, with cream and espresso grounds, a soft serif,
// menu boards whose items run to their price along a dotted leader, round badges, a stamp card and opening hours on labelled rows. The pure
// checks run without Chrome; the last test draws every
// composition with the fictional Kettleworks Coffee pack (brands/kettleworks) and its drawn pictures through every check (skipped without Chrome).
// Run: node --test test-design-look-roast.mjs
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
import { NORMAL, STRESS, MINIMAL, PICTURES } from './testlib/roast-copy.mjs';

const look = JSON.parse(fs.readFileSync(new URL('./lib/design/looks/roast.look.json', import.meta.url), 'utf8'));
const walkEls = (els, fn) => { for (const e of els) { fn(e); if (e.children) walkEls(e.children, fn); } };
const clone = (v) => JSON.parse(JSON.stringify(v));
const compsOf = (kind) => look.compositions.filter((c) => c.kind === kind);
const asCopy = (l) => ({ ...clone(l), origin: `copy:shipped:${l.id}` });

test('the roast look loads, names itself and is registered as a shipped look', () => {
  assert.equal(look.id, 'roast');
  assert.equal(look.name, 'Roast');
  assert.equal(look.origin, 'shipped');
  assert.equal(shippedLooks().roast.id, 'roast');
  assert.ok(look.description.length > 40 && look.description.length <= 300);
});

test('validateLook reports no problem at all', () => {
  assert.deepEqual(validateLook(look, 'roast', { shipped: true }), []);
});

test('lookBrief lists all seven kinds with two designs where the café needs variety', () => {
  const b = lookBrief(look);
  const counts = Object.fromEntries(Object.entries(b.kinds).map(([k, v]) => [k, v.variants.length]));
  assert.deepEqual(counts, { statement: 2, figure: 1, list: 2, quote: 1, photo: 2, event: 2, offer: 2 });
  for (const v of Object.values(b.kinds)) for (const x of v.variants) { assert.ok(x.name); assert.ok(x.describe.length > 40 && x.describe.length <= 300); }
});

test('it is set in Fraunces over Hanken Grotesk and names no colour, url, path or markup', () => {
  assert.equal(look.fonts.display.family, 'Fraunces');
  assert.equal(look.fonts.text.family, 'Hanken Grotesk');
  const bad = [];
  (function walk(v, at) {
    if (typeof v === 'string') { if (/#[0-9a-f]{3,8}/i.test(v) || v.includes('url(') || v.includes('/') || v.includes('<')) bad.push(`${at}: ${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  })(look, 'look');
  assert.deepEqual(bad, []);
});

test('the café devices: menu lists with dotted price leaders, a stamp card of round stamps, hours on info rows, a round badge on the drink of the week', () => {
  for (const c of compsOf('list')) { let r; walkEls(c.elements, (e) => { if (e.type === 'rows') r = e; }); assert.equal(r.leader, 'dotted', c.name); }
  const stamp = compsOf('offer').find((c) => c.name === 'Stamp card');
  let rounds = 0, tag = 0; walkEls(stamp.elements, (e) => { if (e.type === 'box' && e.radius === 'full' && e.w === e.h) rounds++; if (e.type === 'sticker' && e.field === 'tag' && e.shape === 'circle') tag++; });
  assert.equal(rounds, 9); assert.equal(tag, 1);
  const hours = compsOf('event').find((c) => c.name === 'Opening hours');
  let info = 0; walkEls(hours.elements, (e) => { if (e.type === 'info-rows') info++; }); assert.equal(info, 1);
  const dotw = compsOf('photo').find((c) => c.name === 'Drink of the week');
  assert.ok(dotw.elements.some((e) => e.type === 'sticker' && e.shape === 'circle' && e.field === 'tag'));
  assert.ok(compsOf('quote')[0].fields.by);
});

test('the test copy names every composition (sample, stress, minimal), with round euro prices only', () => {
  const want = [], seen = {};
  for (const c of look.compositions) { const i = seen[c.kind] ?? 0; seen[c.kind] = i + 1; want.push(`roast/${c.kind}/${i}`); }
  for (const set of [NORMAL, STRESS, MINIMAL]) {
    assert.deepEqual(Object.keys(set).sort(), want.sort());
    const words = JSON.stringify(set);
    assert.doesNotMatch(words, /\$|£|\d[.,]\d\d\b/, 'euros only, round prices');
  }
});

// ---- every composition through every check, in the Kettleworks pack with its drawn pictures ----
const chrome = findChrome();
test('every roast composition passes every check from sample, stress and minimal copy in the Kettleworks pack', { skip: chrome ? false : 'Google Chrome was not found' }, async () => {
  const pack = loadBrand({ file: path.join(ROOT, 'brands', 'kettleworks', 'brand.json') });
  const b = { ...pack, looks: [asCopy(shippedLooks().roast)], style: { ...pack.style, direction: 'roast' } };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-roast-'));
  const browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(tmp, 'design.lock') });
  let drawn = 0;
  try {
    const seen = {};
    for (const comp of look.compositions) {
      const v = seen[comp.kind] ?? 0; seen[comp.kind] = v + 1;
      const id = `roast/${comp.kind}/${v}`, pic = PICTURES[`${comp.kind}/${v}`] ?? PICTURES[comp.kind] ?? PICTURES.photo;
      for (const [name, set] of [['sample', NORMAL], ['stress', STRESS], ['minimal', MINIMAL]]) {
        const spec = { template: 'post', kind: comp.kind, variant: v, name: 'roast-test', ...set[id], ...(comp.fields.image ? { image: pic } : {}) };
        assert.deepEqual(validateDesign(spec, id, {}), [], `${id} ${name}`);
        try { await renderImage(browser, b, { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, `${comp.kind}-${v}-${name}.png`) }, { tmpDir: tmp }); drawn++; }
        catch (e) { assert.fail(`${id} (${comp.name}) ${name}: ${e.message}`); }
      }
    }
  } finally { browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  assert.equal(drawn, look.compositions.length * 3);
});
