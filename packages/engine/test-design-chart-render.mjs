// The chart drawn in Chrome (needs Google Chrome; skipped without it): the shipped designs (the ledger Big number page with bars, an area and a
// line; the clean Number page with its sparkline) pass every check of a post; a chart's words are held to their cells (a value too wide for its
// slot is refused) and their contrast is measured on the pixels behind them (bars and lines included); the marks stay inside the chart's box.
// Run: node --test test-design-chart-render.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBrand } from './lib/design/brand.mjs';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { preparePage, renderImage } from './lib/design/render.mjs';
import { buildPage } from './lib/design/page.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { normaliseDesign, validateDesign } from './lib/design/spec.mjs';
import { CHARTS as LEDGER_CHARTS, NORMAL as LEDGER_NORMAL } from './testlib/ledger-copy.mjs';
import { CHARTS as CLEAN_CHARTS, NORMAL as CLEAN_NORMAL } from './testlib/clean-copy.mjs';
import { paletteBrand } from './testlib/retail-copy.mjs';

const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-chart-'));
let browser;
test.before(async () => { if (chrome) browser = await Browser.launch({ chromePath: chrome }); });
test.after(() => { browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const asCopy = (l) => ({ ...structuredClone(l), origin: `copy:shipped:${l.id}` });
const brandOf = (look, extra = {}) => { const b = loadBrand(); return { ...b, numbers: { decimal: '.', group: ',', currency: '€', currencyAt: 'before' }, ...extra, looks: [look], style: { ...b.style, direction: look.id } }; };
let n = 0;
const draw = async (brand, spec) => {
  const look = brand.looks[0];
  const probs = validateDesign(spec, 'test', { look });
  if (probs.length) throw new Error(`invalid spec: ${probs.join('; ')}`);
  return renderImage(browser, brand, { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, `c${n++}.png`) }, { tmpDir: tmp });
};

// the three sets of brand colours the shipped looks are drawn in (test-design-look-equivalence.mjs): the demo's, a dark one and a pale one
const COLOURS = {
  demo: {},
  dark: paletteBrand({ name: 'Night Kitchen', light: '#EFEAE0', ink: '#10151F', primary: '#1B2A41', gold: '#F2B84B', deep: '#8A5A00' }),
  pale: paletteBrand({ name: 'Pale Mill', light: '#F5F0E6', ink: '#2A2418', primary: '#9C3B16', gold: '#EADFC0', deep: '#9A7B2E' }),
};
test('the shipped chart designs pass every check in three sets of colours, the marks included: the ledger Big number with bars, an area and a line; the clean Number with a sparkline', { skip }, async () => {
  const ledger = asCopy(shippedLooks().ledger), clean = asCopy(shippedLooks().clean);
  for (const [set, colours] of Object.entries(COLOURS)) {
    for (const [look, copy, charts, id] of [[ledger, LEDGER_NORMAL, LEDGER_CHARTS, 'ledger/figure/0'], [clean, CLEAN_NORMAL, CLEAN_CHARTS, 'clean/figure/0']]) {
      for (const chart of charts[id]) {
        const r = await draw(brandOf(look, colours), { template: 'post', kind: 'figure', variant: 0, ...copy[id], chart });
        assert.deepEqual(r.warnings, [], `${set} ${id} ${chart.kind ?? 'default'}: ${r.warnings.join(' | ')}`);
      }
    }
  }
});

// a statement that draws every kind, in a box the test chooses
const trial = (el = {}, ground = 'paper') => ({
  ...asCopy(shippedLooks().ledger), id: 'trial', origin: 'copy:shipped:ledger',
  compositions: [{
    kind: 'statement', name: 'Trial', describe: 'A headline and a chart, for the tests.', ground, fields: { headline: { required: true, max: 60 }, chart: {} },
    elements: [
      { type: 'text', field: 'headline', style: 'display', size: 96, place: { px: { x: 80, y: 200, w: 920, h: 200 } } },
      { type: 'chart', place: { px: { x: 80, y: 480, w: 920, h: 520 } }, kinds: ['bar', 'hbar', 'line', 'area', 'spark', 'donut', 'progress'], colours: { mark: 'field', highlight: 'accent', track: 'light-tint', grid: 'rule' }, ...Object.fromEntries(Object.entries({ ink: 'ink', ...el }).filter(([, v]) => v !== undefined)) },
    ],
  }],
});
const series = (vals, extra = {}) => ({ series: vals.map((value, i) => ({ label: `M${i + 1}`, value })), ...extra });

test('every kind draws on a plain page and passes the checks', { skip }, async () => {
  const brand = brandOf(trial());
  for (const chart of [series([1450, 1600, 1720, 1980], { kind: 'bar', unit: 'currency', highlight: 'last' }), series([38, 27, 21, 14], { kind: 'hbar', unit: 'percent', highlight: 0 }),
    series([820, 860, 845, 910, 980], { kind: 'line' }), series([120, -80, 60, -40], { kind: 'bar', unit: 'currency' }), series([3, 5, 4, 7], { kind: 'spark' }),
    { kind: 'donut', unit: 'percent', series: [{ label: 'Reached', value: 72 }] }, { kind: 'progress', unit: 'currency', total: 2000, series: [{ label: 'Pot', value: 1250 }] }]) {
    const r = await draw(brand, { template: 'post', kind: 'statement', headline: 'Groups save more', chart });
    assert.deepEqual(r.warnings, [], `${chart.kind}: ${r.warnings.join(' | ')}`);
  }
});

test('the data marks are held to 3:1 against the surface behind them (WCAG 1.4.11), measured on the pixels as drawn', { skip }, async () => {
  // a faint colour on the paper page: the demo's light tint (about 1.1:1 on white), for every kind of mark in turn
  const faint = (colours) => brandOf(trial({ colours: { mark: 'field', highlight: 'accent', track: 'rule-soft', grid: 'rule', ...colours } }));
  const cases = [
    [{ highlight: 'light-tint' }, series([1450, 1600, 1720], { kind: 'bar', unit: 'currency', highlight: 'last' }), /the chart's bars are [0-9.]+:1 against the surface behind them \(needs 3:1\)/],
    [{ mark: 'light-tint' }, series([820, 860, 845, 910], { kind: 'line' }), /the chart's line is [0-9.]+:1 against the surface behind it \(needs 3:1\)/],
    [{ highlight: 'light-tint' }, { kind: 'donut', unit: 'percent', series: [{ label: 'Reached', value: 72 }] }, /the chart's donut is [0-9.]+:1/],
    [{ highlight: 'light-tint' }, { kind: 'progress', unit: 'currency', total: 2000, series: [{ label: 'Pot', value: 1250 }] }, /the chart's progress bar is [0-9.]+:1/],
  ];
  for (const [colours, chart, re] of cases) {
    const r = await draw(faint(colours), { template: 'post', kind: 'statement', headline: 'Groups save more', chart });
    assert.ok(r.warnings.some((w) => re.test(w)), `${chart.kind}: ${r.warnings.join(' | ') || 'no warning'}`);
  }
  // the same marks in a colour that reads pass: the track and the grid are not data marks, so their light colours are fine
  const ok = await draw(faint({}), { template: 'post', kind: 'statement', headline: 'Groups save more', chart: { kind: 'donut', unit: 'percent', series: [{ label: 'Reached', value: 72 }] } });
  assert.deepEqual(ok.warnings, []);
});

test('other words keep 10 px off a chart\'s box like off any block; the chart\'s own words, at its edges by design, are held to their cells instead', { skip }, async () => {
  // the headline's one line starts 50 px above the chart's box: its ink runs into the box
  const near = trial();
  near.compositions[0].elements[0] = { ...near.compositions[0].elements[0], place: { px: { x: 80, y: 430, w: 920, h: 120 } } };
  await assert.rejects(draw(brandOf(near), { template: 'post', kind: 'statement', headline: 'Groups save more', chart: series([900, 1900, 2900], { unit: 'currency' }) }), /the headline "[^"]+" (is only \d+ px from|runs into) the edge of a block or rule/);
  // the chart's labels sit on its bottom edge and its values above its bars: no edge problem for them
  const r = await draw(brandOf(trial({ kinds: ['bar'] })), { template: 'post', kind: 'statement', headline: 'Groups save more', chart: series([900, 1900, 2900], { unit: 'currency' }) });
  assert.deepEqual(r.warnings, []);
});

test('a value too wide for its slot is refused by the fit check, never drawn over its neighbour', { skip }, async () => {
  const brand = brandOf(trial({ kinds: ['bar'], valueSize: 60, place: { px: { x: 80, y: 480, w: 600, h: 520 } } }));
  const chart = series([980000001, 990000002, 970000003, 960000004, 950000005, 940000006, 930000007, 920000008, 910000009, 900000010, 890000011, 880000012], { unit: 'currency' });
  await assert.rejects(draw(brand, { template: 'post', kind: 'statement', headline: 'Too many figures', chart }), /the meta \("€980M"\) runs \d+ px out of its place/);
});

test('the words of a chart are measured on the pixels behind them: each label and value is a measured text, the marks stay drawn under them', { skip }, async () => {
  // the contrast check hides every text and reads what is left under each one: here, the bars, the grid and the page
  const brand = brandOf(trial({ kinds: ['bar'], axis: 'grid' }));
  const spec = { template: 'post', kind: 'statement', headline: 'Groups save more', chart: series([900, 1900, 2900], { unit: 'currency' }) };
  const prep = preparePage(brand, { spec: normaliseDesign(spec), sizeName: 'feed' });
  const page = await browser.page(1080, 1350);
  try {
    await page.setContent(buildPage({ brand, size: SIZES.feed, ...prep.out }));
    await page.evaluate('window.__ds.ready({})');
    const m = await page.evaluate('window.__ds.measure()');
    const words = m.roles.filter((r) => r.rects.length && /^(M[1-3]|€[0-9,]+)$/.test(r.text)).map((r) => [r.role, r.text]);
    assert.deepEqual(words.filter(([role]) => role === 'label').map(([, t]) => t), ['M1', 'M2', 'M3']);
    assert.deepEqual(words.filter(([role]) => role === 'meta').map(([, t]) => t).sort(), ['€1,900', '€2,900', '€900']);
    assert.equal(m.charts.length, 1);
    assert.ok(m.charts[0].ink.y0 >= m.charts[0].box.y0 - 1 && m.charts[0].ink.y1 <= m.charts[0].box.y1 + 1, 'everything drawn inside the chart box');
    await page.evaluate('window.__ds.hide(true)');
    const shown = JSON.parse(await page.evaluate(`JSON.stringify({ marks: [...document.querySelectorAll('[data-chart] path')].map((p) => getComputedStyle(p).visibility), words: [...document.querySelectorAll('[data-chart] [data-role]')].map((w) => getComputedStyle(w).visibility) })`));
    assert.ok(shown.marks.length >= 4 && shown.marks.every((v) => v === 'visible'), 'the bars and lines stay drawn while the words are read');
    assert.ok(shown.words.length === 6 && shown.words.every((v) => v === 'hidden'), 'the words are hidden while what is under them is read');
  } finally { await page.close(); }
});
