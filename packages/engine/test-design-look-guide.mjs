// The shipped guide look as data (lib/design/looks/guide.look.json): a city what's-on guide, a bright brand field with huge condensed
// capitals, rows of round pictures and an arrow button, event posters on full photographs with a two-colour info footer, a job post.
// Pure checks first; the last tests draw pages and need Google Chrome (skipped without it). test-design-look-equivalence.mjs draws every
// composition from sample, stress and minimal copy in three sets of brand colours through every check.
// Run: node --test test-design-look-guide.mjs
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
import { ICON_NAMES, ICONS, PATH_DATA } from './lib/design/icons.mjs';
import { ROOT } from './lib/core.mjs';
import { NORMAL, STRESS, MINIMAL } from './testlib/guide-copy.mjs';

const look = JSON.parse(fs.readFileSync(new URL('./lib/design/looks/guide.look.json', import.meta.url), 'utf8'));
const walkEls = (els, fn) => { for (const e of els) { fn(e); if (e.children) walkEls(e.children, fn); } };
const comps = (kind) => look.compositions.filter((c) => c.kind === kind);
const typesOf = (c) => { const t = []; walkEls(c.elements, (e) => t.push(e.type)); return t; };

test('the guide look loads, names itself and is registered as a shipped look', () => {
  assert.equal(look.id, 'guide');
  assert.equal(look.name, 'Guide');
  assert.equal(look.origin, 'shipped');
  assert.equal(look.compositions.length, 10);
  assert.equal(shippedLooks().guide.id, 'guide');
  assert.ok(look.description.length > 40 && look.description.length <= 300);
});

test('validateLook reports no problem at all (fully strict: no allow-list)', () => {
  assert.deepEqual(validateLook(look, 'guide', { shipped: true }), []);
});

test('lookBrief lists all seven kinds with the right variant counts', () => {
  const b = lookBrief(look);
  const counts = Object.fromEntries(Object.entries(b.kinds).map(([k, v]) => [k, v.variants.length]));
  assert.deepEqual(counts, { statement: 2, figure: 1, list: 1, quote: 1, photo: 2, event: 2, offer: 1 });
  for (const v of Object.values(b.kinds)) for (const x of v.variants) { assert.ok(x.name); assert.ok(x.describe.length > 40 && x.describe.length <= 300); }
});

test('it is set in a heavy condensed display face from the library and names no colour, url, path or markup', () => {
  assert.equal(look.fonts.display.source, 'library');
  assert.equal(look.fonts.display.family, 'Anton');
  assert.equal(look.type.display.case, 'upper');
  const bad = [];
  (function walk(v, at) {
    if (typeof v === 'string') { if (/#[0-9a-f]{3,8}/i.test(v) || v.includes('url(') || v.includes('/') || v.includes('<')) bad.push(`${at}: ${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  })(look, 'look');
  assert.deepEqual(bad, []);
});

test('the guide devices: the logo top left, the brand field, round pictures with an arrow, info rows, the black title block, the series label', () => {
  assert.equal(look.logo.default, 'top-left');
  assert.equal(look.colour.logic, 'field');
  const [cover, sticker] = comps('statement');
  for (const c of [cover, sticker]) {
    assert.equal(c.ground, 'field');
    assert.ok(typesOf(c).includes('photo-row') && typesOf(c).includes('button'), c.name);
  }
  let row; walkEls(cover.elements, (e) => { if (e.type === 'photo-row') row = e; });
  assert.ok(row.overlap > 0, 'the cover overlaps its round pictures');
  let head; walkEls(cover.elements, (e) => { if (e.field === 'headline') head = e; });
  assert.deepEqual(Object.keys(head.pills).sort(), ['fill', 'ink', 'shape']);
  assert.ok(head.icons);
  // every composition shows the series label (the week), top right or as a chip over a picture
  for (const c of look.compositions) { let label = 0; walkEls(c.elements, (e) => { if (e.field === 'label') label++; }); assert.equal(label, 1, `${c.kind}/${c.name}`); }
  const [poster, listing] = comps('event');
  assert.ok(typesOf(poster).includes('info-rows') && typesOf(listing).includes('info-rows'));
  const fills = []; walkEls(poster.elements, (e) => { if (e.type === 'box' && e.fill) fills.push(e.fill); });
  assert.ok(fills.includes('ink') && fills.includes('paper') && fills.includes('field'), 'a black title block and a two-colour footer');
  const hiring = comps('photo')[1];
  assert.ok(typesOf(hiring).includes('overlay') && typesOf(hiring).includes('info-rows') && typesOf(hiring).includes('button'));
});

test('the bowl icon (the sticker of a food post) is one path of the engine\'s own icon set', () => {
  assert.ok(ICON_NAMES.includes('bowl'));
  assert.match(ICONS.bowl.d, PATH_DATA);
});

test('the test copy names every composition (sample, stress, minimal)', () => {
  const want = [], seen = {};
  for (const c of look.compositions) { const i = seen[c.kind] ?? 0; seen[c.kind] = i + 1; want.push(`guide/${c.kind}/${i}`); }
  for (const set of [NORMAL, STRESS, MINIMAL]) assert.deepEqual(Object.keys(set).sort(), want.sort());
});

test('the logo sits above every element layer, so a colour laid over a full picture never covers it', () => {
  const css = fs.readFileSync(path.join(ROOT, 'packages', 'engine', 'design', 'directions', 'kit.css'), 'utf8');
  const rule = /\.k-logo\{[^}]*z-index:(\d+)/.exec(css);
  assert.ok(rule && Number(rule[1]) > 9, 'element layers run from 0 to 9');
});

// ---- drawn (Chrome) ----
const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qerr-guide-'));
let browser;
test.before(async () => { if (chrome) browser = await Browser.launch({ chromePath: chrome }); });
test.after(() => { browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
const brand = () => { const b = loadBrand({ file: path.join(ROOT, 'brands', 'outabout', 'brand.json') }); return b; };

test('words in a pill are judged on the pill: a tall face (Anton) draws no false contrast warning', { skip }, async () => {
  for (const [kind, variant] of [['statement', 0], ['list', 0], ['photo', 0], ['offer', 0]]) {
    const copy = NORMAL[`guide/${kind}/${variant}`];
    const spec = { template: 'post', kind, variant, name: 'guide-test', ...copy, ...(kind === 'photo' || kind === 'offer' ? { image: 'design/assets/demo/scene-market.jpg' } : {}) };
    assert.ok(/\[\[/.test(spec.headline), `${kind}/${variant} has a pill`);
    const r = await renderImage(browser, brand(), { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, `${kind}-${variant}.png`) }, { tmpDir: tmp });
    assert.deepEqual(r.warnings.filter((w) => /low contrast/.test(w)), [], `${kind}/${variant}`);
  }
});
