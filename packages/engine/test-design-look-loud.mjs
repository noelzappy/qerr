// The shipped loud look as data (lib/design/looks/loud.look.json): heavy condensed capitals on saturated brand colours or a darkened photo, words
// in pills, letters on grey paper with bold words and round stickers, big figures with round badges and photos taped on at an angle. Pure checks
// first; then, with Chrome, every composition from sample, stress and minimal copy in three sets of brand colours through every check
// (test-design-look-equivalence.mjs draws it with the other shipped looks too).
// Run: node --test test-design-look-loud.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateLook, lookBrief } from './lib/design/look.mjs';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { loadBrand } from './lib/design/brand.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { renderImage } from './lib/design/render.mjs';
import { normaliseDesign } from './lib/design/spec.mjs';
import { paletteBrand } from './testlib/retail-copy.mjs';
import { NORMAL, STRESS, MINIMAL } from './testlib/loud-copy.mjs';

const look = JSON.parse(fs.readFileSync(new URL('./lib/design/looks/loud.look.json', import.meta.url), 'utf8'));
const walkEls = (els, fn) => { for (const e of els) { fn(e); if (e.children) walkEls(e.children, fn); } };
const typesOf = (c) => { const t = new Set(); walkEls(c.elements, (e) => t.add(e.type)); return t; };

test('the loud look loads, names itself and is registered as a shipped look', () => {
  assert.equal(look.id, 'loud');
  assert.equal(look.name, 'Loud');
  assert.equal(look.origin, 'shipped');
  assert.equal(look.compositions.length, 13);
  assert.equal(shippedLooks().loud.id, 'loud');
  assert.ok(look.description.length > 40 && look.description.length <= 300);
});

test('validateLook reports no problem at all (fully strict: no allow-list)', () => {
  assert.deepEqual(validateLook(look, 'loud', { shipped: true }), []);
});

test('lookBrief lists all seven kinds with the right variant counts', () => {
  const b = lookBrief(look);
  const counts = Object.fromEntries(Object.entries(b.kinds).map(([k, v]) => [k, v.variants.length]));
  assert.deepEqual(counts, { statement: 3, figure: 2, list: 1, quote: 2, photo: 3, event: 1, offer: 1 });
  for (const v of Object.values(b.kinds)) for (const x of v.variants) { assert.ok(x.name); assert.ok(x.describe.length > 40 && x.describe.length <= 300); }
});

test('lookBrief says which designs draw the headline\'s pills and icons', () => {
  const marks = (kind) => lookBrief(look).kinds[kind].variants.map((v) => [v.name, v.marks]);
  assert.deepEqual(marks('statement'), [['Shout', { pills: true, icons: true }], ['Letter', { pills: false, icons: true }], ['Centre stack', { pills: true, icons: true }]]);
  assert.deepEqual(marks('figure').map(([, m]) => m), [{ pills: false, icons: false }, { pills: false, icons: false }]);
  assert.deepEqual(marks('photo').map(([, m]) => m), [{ pills: true, icons: true }, { pills: true, icons: true }, { pills: false, icons: true }]);
});

test('it is set in Anton and Hanken Grotesk from the library, and names no colour, url, path or markup', () => {
  assert.equal(look.fonts.display.family, 'Anton');
  assert.equal(look.fonts.text.family, 'Hanken Grotesk');
  const bad = [];
  (function walk(v, at) {
    if (typeof v === 'string') { if (/#[0-9a-f]{3,8}/i.test(v) || v.includes('url(') || v.includes('/') || v.includes('<')) bad.push(`${at}: ${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  })(look, 'look');
  assert.deepEqual(bad, []);
});

test('the style\'s devices: capitals with pills, letters on paper with bold words and badged icons, taped photos, round badges', () => {
  const byName = Object.fromEntries(look.compositions.map((c) => [c.name, c]));
  // loud headlines: capitals with words in pills
  for (const n of ['Shout', 'Centre stack', 'Numbered', 'Dark photo', 'Taped on colour', 'Poster', 'Price sticker']) {
    let h; walkEls(byName[n].elements, (e) => { if (e.type === 'text' && e.field === 'headline') h = e; });
    assert.ok(h.upper && h.pills, n);
  }
  // letters: a paper texture on the soft ground, the text font, bold emphasis, icons in round badges
  for (const n of ['Letter', 'Letter quote']) {
    assert.equal(byName[n].ground, 'soft');
    assert.ok(typesOf(byName[n]).has('paper-texture'), n);
  }
  let letter; walkEls(byName.Letter.elements, (e) => { if (e.field === 'headline') letter = e; });
  assert.equal(letter.font, 'text'); assert.equal(letter.emphasis, 'bold'); assert.ok(letter.icons.badge);
  // the figure: a numeral beside two icon badges and a taped photo
  const fig = byName['Truth metric'];
  assert.ok(typesOf(fig).has('taped-photo'));
  let badges = 0; walkEls(fig.elements, (e) => { if (e.type === 'icon-badge') badges++; });
  assert.equal(badges, 2);
  // a darkened photo and a photo taped on colour
  assert.ok(typesOf(byName['Dark photo']).has('overlay'));
  assert.ok(typesOf(byName['Taped on colour']).has('taped-photo'));
  // the brand name small at the foot or top, never a logo
  assert.equal(look.logo.default, 'off');
  for (const c of look.compositions) { let brand = 0; walkEls(c.elements, (e) => { if (e.source === 'brand') brand++; }); assert.equal(brand, 1, c.name); }
});

test('the test copy names every composition (sample, stress, minimal)', () => {
  const want = [], seen = {};
  for (const c of look.compositions) { const i = seen[c.kind] ?? 0; seen[c.kind] = i + 1; want.push(`loud/${c.kind}/${i}`); }
  for (const set of [NORMAL, STRESS, MINIMAL]) assert.deepEqual(Object.keys(set).sort(), want.sort());
});

// ---- with Chrome: every composition passes every check ----
const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const COLOURS = {
  demo: {},
  dark: paletteBrand({ name: 'Night Kitchen', light: '#EFEAE0', ink: '#10151F', primary: '#1B2A41', gold: '#F2B84B', deep: '#8A5A00' }),
  pale: paletteBrand({ name: 'Pale Mill', light: '#F5F0E6', ink: '#2A2418', primary: '#9C3B16', gold: '#EADFC0', deep: '#9A7B2E' }),
};
test('every loud composition passes every check from sample, stress and minimal copy, in three sets of brand colours', { skip, timeout: 1800000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qerr-loud-'));
  const browser = await Browser.launch({ chromePath: chrome });
  const copy = { ...look, origin: 'copy:shipped:loud' }, base = loadBrand();
  let drawn = 0;
  try {
    for (const [kind, versions] of Object.entries(Object.groupBy(look.compositions, (c) => c.kind))) {
      for (const [v, comp] of versions.entries()) {
        const id = `loud/${kind}/${v}`;
        for (const [copyName, set] of Object.entries({ sample: NORMAL, stress: STRESS, minimal: MINIMAL })) {
          for (const colours of Object.keys(COLOURS)) {
            const spec = { template: 'post', kind, variant: v, name: 'loud-test', ...set[id], ...(comp.fields.image ? { image: 'design/assets/demo/object-jar.jpg' } : {}) };
            const brand = { ...base, ...COLOURS[colours], looks: [copy], style: { ...base.style, direction: 'loud' } };
            try {
              await renderImage(browser, brand, { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, `${kind}-${v}-${copyName}-${colours}.png`), folio: { n: 4, total: 12 } }, { tmpDir: tmp });
              drawn++;
            } catch (e) { assert.fail(`${id} (${comp.name}) ${copyName} ${colours}: ${e.message}`); }
          }
        }
      }
    }
  } finally { browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  assert.equal(drawn, 13 * 3 * 3);
});
