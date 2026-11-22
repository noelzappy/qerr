// A post's chart (lib/design/chart.mjs): the data's validation (hostile input refused, never echoed), the brand's number format, the scale
// (zero for bars, a trimmed axis only for a line the look lets trim), the geometry (everything inside its box), the post field, the look's
// chart element (validation, static checks, brief) and the markup the kit writes for it (numbers and escaped words only). Pure, no Chrome
// (test-design-chart-render.mjs draws it).
// Run: node --test test-design-chart.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CHART_KINDS, POST_CHART, chartBounds, chartDomain, chartKindFor, chartLayout, chartProblems, formatAll, formatValue, highlightIndex, numberFormat, numbersProblems,
} from './lib/design/chart.mjs';
import { postProblems } from './lib/design/post-spec.mjs';
import { validateBrand } from './lib/design/brand.mjs';
import { lookBrief, lookCatalogue, validateLook } from './lib/design/look.mjs';
import { shippedLooks, postKinds, renderPost } from './lib/design/directions/index.mjs';
import { chartOf, makeContext } from './lib/design/directions/kit.mjs';
import { loadBrand } from './lib/design/brand.mjs';
import { tokensFromLook } from './lib/design/directions/look-tokens.mjs';

const S = (vals, extra = {}) => ({ series: vals.map((value, i) => ({ label: `P${i}`, value })), ...extra });
const ok = (c) => assert.deepEqual(chartProblems(c, 'd'), [], JSON.stringify(c).slice(0, 120));
const bad = (c, re, what) => { const e = chartProblems(c, 'd'); assert.ok(e.length && e.some((x) => re.test(x)), `${what ?? JSON.stringify(c).slice(0, 80)}: ${e.join(' | ')}`); return e; };

// ---------------------------------------------------------------- the data
test('a chart takes 2 to 12 points, or one point and a total for a donut or progress bar', () => {
  ok(S([1, 2]));
  ok(S([...Array(12).keys()]));
  ok({ kind: 'bar', unit: 'currency', highlight: 'max', series: [{ value: 1 }, { value: 2.5 }] });
  ok({ kind: 'donut', unit: 'percent', series: [{ label: 'Reached', value: 72 }] });
  ok({ kind: 'progress', total: 2000, series: [{ value: 1250 }] });
  ok({ series: [{ value: 40 }], total: 50 });
  bad(S([1]), /needs total/, 'one value with no total');
  bad(S([...Array(13).keys()]), /2 to 12 points/);
  bad({ kind: 'line', series: [{ value: 1 }] }, /2 to 12 points/);
  bad({ kind: 'donut', series: [{ value: 1 }, { value: 2 }], total: 10 }, /one point and total/);
  bad({ kind: 'progress', total: 10, series: [{ value: 12 }] }, /more than its total/);
  bad({ kind: 'progress', total: 10, series: [{ value: -1 }] }, /must not be below zero/);
  bad(S([1, 2], { total: 5 }), /only for a donut or progress bar/);
  bad(S([1, 2], { highlight: 2 }), /index of a point/);
  bad(S([1, 2], { highlight: 'first' }), /index of a point/);
  bad(S([1, 2], { highlight: 0.5 }), /index of a point/);
});

const HOSTILE_STRINGS = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', 'red;background:url(//evil.example/x)', '</style>', 'javascript:alert(1)', '{{x}}', '[[pill]]', '*em*', 'a\nb', 'a\u0000b', 'a‮b', 'a b', 'x'.repeat(15), 'x'.repeat(100000)];
const HOSTILE_NUMBERS = [NaN, Infinity, -Infinity, '12', '1e3', null, true, {}, [], 1e10, -1e10, 0.001, 1.005e-7, Number.MAX_VALUE, Number.MIN_VALUE];
test('hostile data is refused with a short message that never repeats it', () => {
  const seen = (msgs, v) => { const t = String(v); if (t.length > 3) for (const m of msgs) assert.ok(!m.includes(t.slice(0, 12)), `echoed ${t.slice(0, 20)}: ${m}`); for (const m of msgs) assert.ok(m.length < 300, m); };
  for (const v of HOSTILE_STRINGS) {
    seen(bad(S([1, 2], { kind: v }), /kind must be one of/), v);
    seen(bad(S([1, 2], { unit: v }), /unit must be one of/), v);
    seen(bad(S([1, 2], { highlight: v }), /highlight/), v);
    seen(bad({ series: [{ label: v, value: 1 }, { value: 2 }] }, /label/), v);
    seen(bad({ series: [{ value: v }, { value: 2 }] }, /value must be a number/), v);
  }
  for (const v of HOSTILE_NUMBERS) {
    const e = chartProblems({ series: [{ value: v }, { value: 2 }] }, 'd');
    assert.ok(e.length, `value ${String(v)}`);
    seen(e, v);
    assert.ok(chartProblems({ kind: 'donut', series: [{ value: 1 }], total: v }, 'd').length, `total ${String(v)}`);
  }
  // shapes: not an object, a list, unknown keys (a __proto__, a constructor), a point that is not an object, deep nesting, a huge list
  for (const c of [null, 'chart', 5, [], [{ value: 1 }], { series: 'x' }, { series: [1, 2] }, { series: [[1], [2]] }, JSON.parse('{"series":[{"value":1},{"value":2}],"__proto__":{"x":1}}'),
    { series: [{ value: 1 }, { value: 2 }], constructor: { prototype: {} } }, { series: [{ value: 1, colour: 'red' }, { value: 2 }] }, { series: [{ value: 1, label: { a: { b: { c: 1 } } } }, { value: 2 }] },
    { series: Array.from({ length: 100000 }, () => ({ value: 1 })) }]) {
    assert.ok(chartProblems(c, 'd').length, JSON.stringify(c)?.slice(0, 60));
  }
  // a huge series is judged without walking all of it (the count is refused, the points past the limit are not read)
  const t0 = Date.now(); chartProblems({ series: Array.from({ length: 200000 }, () => ({ value: 'x'.repeat(10) })) }, 'd'); assert.ok(Date.now() - t0 < 500);
  // labels: one line of plain words of at most 14 characters, unicode counted as people see it
  ok({ series: [{ label: 'Rainy day fund', value: 1 }, { label: 'Café', value: 2 }] });
  bad({ series: [{ label: 'Rainy-day funds', value: 1 }, { value: 2 }] }, /15 characters; the most is 14/);
  bad({ series: [{ label: ' ', value: 1 }, { value: 2 }] }, /non-empty/);
  // values: at most two decimal places and a billion either way
  ok(S([1e9, -1e9, 12.25]));
  bad(S([1.234, 2]), /decimal places/);
  bad(S([1e9 + 1, 2]), /from -1,000,000,000 to 1,000,000,000/);
});

test('the post field: chart is a field of a post, checked by postProblems, and drawn only where the look draws one of that kind', () => {
  const post = { template: 'post', kind: 'figure', big: '€2,400', chart: S([1, 2, 3]) };
  assert.deepEqual(postProblems(post, 'p'), []);
  assert.ok(postProblems({ ...post, chart: S([1]) }, 'p').some((e) => /needs total/.test(e)));
  const ledger = lookBrief(shippedLooks().ledger);
  assert.deepEqual(ledger.kinds.figure.variants[0].fields.chart, { required: false, kinds: ['bar', 'area', 'line'], min: 3, max: 8 });
  assert.equal(ledger.kinds.figure.variants[1].fields.chart, undefined);
  assert.deepEqual(postProblems({ ...post, variant: 0 }, 'p', { brief: ledger }), []);
  assert.ok(postProblems({ ...post, variant: 1 }, 'p', { brief: ledger }).some((e) => /draws no chart/.test(e)), 'a variant without a chart');
  assert.ok(postProblems({ ...post, chart: { kind: 'donut', unit: 'percent', series: [{ value: 5 }] } }, 'p', { brief: ledger }).some((e) => /draws bar, area, line charts/.test(e)));
  assert.ok(postProblems({ ...post, chart: S([1, 2]) }, 'p', { brief: ledger }).some((e) => /3 to 8 points, not 2/.test(e)));
  assert.ok(postProblems({ template: 'post', kind: 'quote', quote: 'x', chart: S([1, 2, 3]) }, 'p', { brief: ledger }).some((e) => /draws no chart/.test(e)));
  // the clean look: a sparkline under its number
  const clean = lookBrief(shippedLooks().clean);
  assert.deepEqual(clean.kinds.figure.variants[0].fields.chart.kinds, ['spark']);
  assert.ok(postProblems({ ...post, chart: { kind: 'bar', series: [1, 2, 3, 4].map((value) => ({ value })) } }, 'p', { brief: clean }).some((e) => /draws spark charts/.test(e)));
  assert.deepEqual(postProblems({ ...post, chart: S([1, 2, 3, 4]) }, 'p', { brief: clean }), [], 'a series with no kind takes the design\'s');
});

// ---------------------------------------------------------------- the number format
test('numbers are written as the brand writes them: decimal mark, thousands, currency before or after, percent', () => {
  const eur = { decimal: '.', group: ',', currency: '€', currencyAt: 'before' };
  assert.equal(formatValue(1250, { unit: 'currency', numbers: eur }), '€1,250');
  assert.equal(formatValue(-80, { unit: 'currency', numbers: eur }), '−€80');
  assert.equal(formatValue(12.5, { unit: 'percent', numbers: eur, dec: 1 }), '12.5%');
  const de = { decimal: ',', group: '.', currency: '€', currencyAt: 'after', currencySpace: true, percentSpace: true };
  assert.equal(formatValue(1234567.5, { unit: 'currency', numbers: de, dec: 2 }), '1.234.567,50 €');
  assert.equal(formatValue(12, { unit: 'percent', numbers: de }), '12 %');
  assert.equal(formatValue(1234, { numbers: { group: 'thin' } }), '1 234');
  assert.equal(formatValue(1234, { numbers: { group: 'none' } }), '1234');
  assert.equal(formatValue(1234, { unit: 'currency' }), '1,234', 'no currency without one');
  // values alike: the same decimals for all, compact from a hundred thousand
  const f = formatAll([1, 2.5, 3], { unit: 'number' });
  assert.deepEqual([f(1), f(2.5), f(3)], ['1.0', '2.5', '3.0']);
  const g = formatAll([140000, 251000], { unit: 'currency', numbers: eur });
  assert.deepEqual([g(140000), g(251000)], ['€140k', '€251k']);
  const m = formatAll([1.2e7, 3e7], { unit: 'number' });
  assert.deepEqual([m(1.2e7), m(3e7)], ['12M', '30M']);
  assert.equal(formatValue(NaN), '');
});

test('the brand\'s numbers block: fixed lists and one short currency sign; anything else falls back to the default when drawing', () => {
  assert.deepEqual(numbersProblems(undefined), []);
  assert.deepEqual(numbersProblems({ decimal: ',', group: ' ', currency: 'kr', currencyAt: 'after', currencySpace: true, percentSpace: false }), []);
  assert.deepEqual(numbersProblems({ currency: 'GH₵' }), []);
  for (const [v, re] of [[5, /must be an object/], [{ decimal: ';' }, /decimal/], [{ group: '_' }, /group/], [{ decimal: ',', group: ',' }, /must differ/],
    [{ currency: '<b>' }, /currency/], [{ currency: '$1' }, /currency/], [{ currency: 'EUROS' }, /currency/], [{ currency: 'a b' }, /currency/], [{ currencyAt: 'middle' }, /currencyAt/],
    [{ percentSpace: 'yes' }, /percentSpace/], [{ colour: 'red' }, /does not take/]]) {
    const e = numbersProblems(v, 'numbers');
    assert.ok(e.some((x) => re.test(x)), `${JSON.stringify(v)}: ${e}`);
    if (typeof v === 'object') for (const x of e) assert.ok(!x.includes('<b>') && !x.includes('EUROS'), x);
  }
  assert.deepEqual(numberFormat({ currency: '<script>' }), numberFormat(undefined));
  // validateBrand holds a brand to it
  const b = loadBrand();
  assert.deepEqual(validateBrand({ ...b, numbers: { currency: '€' } }).filter((e) => /numbers/.test(e)), []);
  assert.ok(validateBrand({ ...b, numbers: { currency: 'url(x)' } }).some((e) => /numbers\.currency/.test(e)));
});

// ---------------------------------------------------------------- the scale and the geometry
test('bars always start at zero; a line starts at zero unless the look trims its axis', () => {
  for (const kind of ['bar', 'hbar']) {
    const d = chartDomain([980, 1000, 1020], kind, { trim: true });
    assert.equal(d.lo, 0, `${kind} ignores trim`);
    assert.equal(d.trimmed, false);
  }
  assert.equal(chartDomain([980, 1000, 1020], 'line').lo, 0);
  const t = chartDomain([980, 1000, 1020], 'line', { trim: true });
  assert.ok(t.trimmed && t.lo > 0 && t.lo <= 980 && t.hi >= 1020, JSON.stringify(t));
  assert.equal(chartDomain([-5, 10], 'line', { trim: true }).trimmed, false, 'a line with values under zero is not trimmed');
  const n = chartDomain([-80, 140], 'bar');
  assert.ok(n.lo <= -80 && n.hi >= 140 && n.zero);
  assert.deepEqual(chartDomain([3, 3], 'bar').lo, 0);
  assert.deepEqual([highlightIndex([1, 5, 2], 'max'), highlightIndex([1, 5, 2], 'min'), highlightIndex([1, 5, 2], 'last'), highlightIndex([1, 5, 2], 1), highlightIndex([1, 5, 2], 9), highlightIndex([1, 5, 2], 'none')], [1, 0, 2, 1, -1, -1]);
});

test('every mark and every word of every kind stays inside its box, whatever the data', () => {
  const sets = [[1, 2], [0, 0, 0], [1e9, -1e9], [-5, -1, -3], [0.01, 1e9, 3], [...Array(12).keys()].map((i) => (i % 2 ? -i * 1000 : i * 997)), [7, 7, 7, 7]];
  const boxes = [[920, 280], [600, 120], [200, 140], [1000, 900]];
  for (const kind of CHART_KINDS) for (const [w, h] of boxes) for (const vals of kind === 'donut' || kind === 'progress' ? [[0], [40], [100]] : sets) {
    for (const opts of [{}, { labelH: 30, valueH: 36, radius: 40, stroke: 16, marks: 'all', highlight: 0, trim: true }, { thickness: 200 }]) {
      let L;
      try { L = chartLayout({ kind, values: vals, total: 100, w, h, ...opts }); } catch (e) { assert.match(e.message, /too (narrow|short)/); continue; }
      const b = chartBounds(L, opts.stroke ?? 4);
      if (!Number.isFinite(b.x0)) continue;
      assert.ok(b.x0 >= -0.01 && b.y0 >= -0.01 && b.x1 <= w + 0.01 && b.y1 <= h + 0.01, `${kind} ${w}x${h} ${vals} ${JSON.stringify(opts)}: ${JSON.stringify(b)}`);
      for (const r of L.bars ?? []) assert.ok(Number.isFinite(r.x + r.y + r.w + r.h) && r.w >= 0 && r.h >= 0);
    }
  }
});

test('the bars stand on zero: a bar\'s length is its value, never trimmed', () => {
  const L = chartLayout({ kind: 'bar', values: [100, 200, 400], w: 600, h: 400 });
  const [a, b, c] = L.bars;
  assert.ok(Math.abs(b.h / a.h - 2) < 0.02 && Math.abs(c.h / a.h - 4) < 0.02, `${a.h} ${b.h} ${c.h}`);
  assert.ok(Math.abs(a.y + a.h - L.base.y) < 0.01);
  const H = chartLayout({ kind: 'hbar', values: [100, 300], w: 900, h: 300, labelH: 30, valueH: 30 });
  assert.ok(Math.abs(H.bars[1].w / H.bars[0].w - 3) < 0.02);
});

test('chartKindFor: the post\'s kind when the design draws it, else the first of the design\'s that fits the data', () => {
  assert.equal(chartKindFor(S([1, 2]), ['line', 'bar']), 'line');
  assert.equal(chartKindFor({ ...S([1, 2]), kind: 'bar' }, ['line', 'bar']), 'bar');
  assert.equal(chartKindFor({ ...S([1, 2]), kind: 'donut' }, ['line', 'bar']), null);
  assert.equal(chartKindFor({ series: [{ value: 1 }], total: 2 }, ['bar', 'progress']), 'progress');
  assert.equal(chartKindFor({ series: [{ value: 1 }], total: 2 }, ['bar']), null);
});

// ---------------------------------------------------------------- the look's element
const host = (chart, fields = {}) => {
  const swiss = structuredClone(shippedLooks().swiss);
  return { ...swiss, id: 'host', origin: 'copy:shipped:swiss', compositions: [{ kind: 'figure', name: 'Host', describe: 'A host for the chart tests.', ground: 'paper', fields: { big: { required: true }, chart: { ...fields } },
    elements: [{ type: 'text', field: 'big', style: 'display', size: 200, place: { px: { x: 64, y: 100, w: 900, h: 260 } } }, { type: 'chart', place: { px: { x: 64, y: 500, w: 900, h: 400 } }, ...chart }] }] };
};
test('the chart element: kinds, colours from roles, the axis, the trim only for line kinds; hostile values refused without echo', () => {
  assert.deepEqual(validateLook(host({}), 'l', {}), []);
  assert.deepEqual(validateLook(host({ kinds: ['line', 'spark'], trim: true, marks: 'minmax', stroke: 6, colours: { mark: 'primary', highlight: 'accent', track: 'rule-soft', grid: 'rule' }, axis: 'grid', radius: 8, thickness: 40, textSize: 24, valueSize: 32, valueFont: 'display', upper: true }), 'l', {}), []);
  const says = (el, re, what) => { const e = validateLook(host(el), 'l', {}); assert.ok(e.some((x) => re.test(x)), `${what}: ${e.join(' | ')}`); return e; };
  says({ kinds: ['bar', 'line'], trim: true }, /bar always starts at zero/, 'a bar never trims');
  says({ kinds: ['bar'], marks: 'end' }, /dots on a line/, 'dots need a line');
  says({ kinds: ['bar'], stroke: 3 }, /width of a line/, 'stroke needs a line');
  for (const v of ['#ff0000', 'red;background:url(x)', 'url(javascript:alert(1))', '</style>', NaN, 5]) {
    const e = says({ colours: { mark: v } }, /colours\.mark/, `colour ${String(v)}`);
    for (const x of e) assert.ok(!x.includes('javascript') && !x.includes('</style>'), x);
  }
  for (const v of [NaN, Infinity, -1, 41, '8', 1.5]) says({ radius: v }, /radius/, `radius ${String(v)}`);
  for (const v of [0, 17, NaN]) says({ kinds: ['line'], stroke: v }, /stroke/, `stroke ${String(v)}`);
  for (const v of [['pie'], [], ['bar', 'bar'], 'bar', Array(20).fill('bar')]) says({ kinds: v }, /kinds/, `kinds ${JSON.stringify(v)}`);
  says({ axis: 'both' }, /axis/, 'axis');
  says({ extra: 'x' }, /"extra" is not a setting/, 'free string');
  for (const v of [0, 13, 1.5, 'x']) assert.ok(validateLook(host({}, { min: v }), 'l', {}).some((x) => /chart\.min/.test(x)), `field min ${v}`);
  assert.ok(validateLook(host({}, { min: 6, max: 4 }), 'l', {}).some((x) => /min is more than max/.test(x)));
  assert.ok(validateLook(host({}, { chars: 4 }), 'l', {}).length, 'an unknown key of the chart field');
  // a quote has no chart
  const q = host({});
  q.compositions[0].kind = 'quote';
  assert.ok(validateLook(q, 'l', {}).some((x) => /chart is not a field of a quote post|is not a field of a quote/.test(x)));
});

test('the catalogue and the brief describe the chart for the editor, the AI and the post page', () => {
  const c = lookCatalogue();
  assert.equal(c.elements.chart.label, 'Chart');
  assert.deepEqual(c.elements.chart.properties.kinds.of.values, CHART_KINDS);
  assert.equal(c.fields.chart.type, 'chart');
  assert.deepEqual([c.fields.chart.min, c.fields.chart.max, c.fields.chart.chars], [POST_CHART.min, POST_CHART.max, POST_CHART.label]);
  for (const k of ['statement', 'figure', 'list', 'photo', 'event', 'offer']) assert.ok(c.kinds[k].fields.includes('chart'), k);
  assert.ok(!c.kinds.quote.fields.includes('chart'));
  const b = loadBrand();
  const kinds = postKinds({ ...b, looks: [{ ...structuredClone(shippedLooks().ledger), origin: 'copy:shipped:ledger' }], style: { ...b.style, direction: 'ledger' } });
  assert.deepEqual(kinds.figure.fields.chart, { kinds: ['bar', 'area', 'line'], min: 3, max: 8, chars: 14, units: ['number', 'currency', 'percent'] });
});

// ---------------------------------------------------------------- the markup
const ledgerCopy = { ...structuredClone(shippedLooks().ledger), origin: 'copy:shipped:ledger' };
const brandWith = (look, extra = {}) => { const b = loadBrand(); return { ...b, ...extra, looks: [look], style: { ...b.style, direction: look.id } }; };
const ctx = (brand) => ({ brand, size: { w: 1080, h: 1350 }, image: () => 'data:image/png;base64,AA==', imageSize: () => ({ w: 10, h: 10 }) });
test('the kit draws the chart from numbers and escaped words only: hostile labels reach the page as text', () => {
  const spec = { template: 'post', kind: 'figure', variant: 0, big: '€2,400', chart: { kind: 'bar', unit: 'currency', series: [{ label: 'a/b', value: 1 }, { label: '"&\'', value: 2 }, { label: '`x` = y', value: 3 }] } };
  const out = renderPost(spec, ctx(brandWith(ledgerCopy, { numbers: { currency: '€' } })));
  const body = out.body ?? out.html ?? '';
  assert.match(body, /data-chart/);
  assert.match(body, /&quot;&amp;&#39;/);
  assert.match(body, /&#96;x&#96; = y/);
  assert.match(body, /€3/);
  // a label with markup in it never reaches the page: the post is refused, and the kit draws no chart from it
  const tagged = { ...spec, chart: { ...spec.chart, series: [{ label: '<b>x</b>', value: 1 }, { label: 'a</div>', value: 2 }, { value: 3 }] } };
  assert.ok(postProblems(tagged, 'p').some((e) => /one line of plain words/.test(e)));
  const body2 = renderPost(tagged, ctx(brandWith(ledgerCopy))).body;
  assert.ok(!/data-chart/.test(body2) && !/<b>x/.test(body2) && !/a<\/div>/.test(body2));
  // every path is numbers and commands, every style a palette role or a number
  for (const m of body.matchAll(/<path d="([^"]*)" style="([^"]*)"/g)) {
    assert.match(m[1], /^[MLHVAZa0-9 .\-]+$/, m[1]);
    assert.match(m[2], /^fill:(?:none|var\(--c-[a-z-]+\))(?:;stroke:var\(--c-[a-z-]+\);stroke-width:[0-9.]+px;stroke-linecap:(?:round|butt);stroke-linejoin:round)?(?:;opacity:0\.\d+)?$/, m[2]);
  }
  // a chart whose data was not checked (it reaches the kit raw) is no chart at all
  for (const raw of [{ series: [{ value: NaN }, { value: 1 }] }, { series: [{ value: 1, label: 'a‮b' }, { value: 2 }] }, { kind: 'pie', series: [{ value: 1 }, { value: 2 }] }]) assert.equal(chartOf(raw), null);
  assert.deepEqual(chartOf({ series: [{ label: 'R&D', value: 1 }, { value: 2 }] }).labels, ['R&amp;D', '']);
  assert.equal(chartOf({ series: [{ label: '<i>', value: 1 }, { value: 2 }] }), null);
});

test('the kit refuses a chart builder call outside its bounds', () => {
  const brand = brandWith(ledgerCopy);
  const look = brand.looks[0];
  const c = makeContext({ spec: { chart: S([1, 2, 3]) }, brand, tokens: tokensFromLook(look, brand), direction: 'ledger', kind: 'figure', variant: 0, comp: {}, size: { w: 1080, h: 1350 } });
  const base = { kind: 'bar', x: 0, y: 0, w: 600, h: 300 };
  assert.match(String(c.chartSvg(base)), /data-chart/);
  for (const [o, re] of [[{ kind: 'pie' }, /chart kind/], [{ axis: 'x' }, /axis/], [{ marks: 'x' }, /marks/], [{ trim: true }, /only a line/], [{ w: 10 }, /40 to 1400/], [{ w: NaN }, /finite/], [{ stroke: 99 }, /stroke/], [{ radius: -1 }, /radius/],
    [{ colours: { mark: 'red;x' } }, /palette colour/], [{ labelFamily: 'serif', labels: true }, /chart font/], [{ extra: 'color:red' }, /takes no "extra"/], [{ labelSize: 1000 }, /labelSize/]]) {
    assert.throws(() => c.chartSvg({ ...base, ...o }), re, JSON.stringify(o));
  }
});

test('the shipped designs: a chart on the ledger Big number page, a sparkline under the clean Number', () => {
  const ledger = JSON.parse(fs.readFileSync(new URL('./lib/design/looks/ledger.look.json', import.meta.url), 'utf8'));
  const big = ledger.compositions.find((c) => c.name === 'Big number');
  const els = []; (function walk(l) { for (const e of l) { els.push(e); walk(e.children ?? []); } })(big.elements);
  const chart = els.find((e) => e.type === 'chart');
  assert.deepEqual(chart.kinds, ['bar', 'area', 'line']);
  assert.equal(chart.trim, undefined, 'the ledger bars start at zero');
  assert.deepEqual(chart.when, { present: 'chart' });
  const clean = JSON.parse(fs.readFileSync(new URL('./lib/design/looks/clean.look.json', import.meta.url), 'utf8'));
  const spark = []; (function walk(l) { for (const e of l) { if (e.type === 'chart') spark.push(e); walk(e.children ?? []); } })(clean.compositions.find((c) => c.name === 'Number').elements);
  assert.equal(spark.length, 1);
  assert.deepEqual(spark[0].kinds, ['spark']);
  assert.equal(spark[0].trim, true, 'the sparkline trims its axis, as the look explicitly allows a line');
});

test('the chart check: a mark or a word outside the chart\'s box is a problem, named and measured', async () => {
  const { findLayoutProblems, explainProblems, explainPostFit } = await import('./lib/design/checks.mjs');
  const m = (ink) => ({ W: 1080, H: 1350, roles: [], objs: [], charts: [{ box: { x0: 80, y0: 700, x1: 1000, y1: 1000 }, ink }] });
  const S0 = { pad: 0, top: 0, bottom: 0 };
  assert.deepEqual(findLayoutProblems(m({ x0: 80, y0: 700, x1: 1000, y1: 1000 }), S0), []);
  assert.deepEqual(findLayoutProblems(m({ x0: 80, y0: 700.5, x1: 1000.9, y1: 1000 }), S0), [], 'within a pixel');
  const p = findLayoutProblems(m({ x0: 80, y0: 690, x1: 1000, y1: 1000 }), S0);
  assert.deepEqual(p, [{ kind: 'chart', role: 'chart', text: 'chart', edge: 'top', px: 10 }]);
  assert.match(explainProblems(p, 'feed'), /the chart runs 10 px out of the top of its box/);
  assert.match(explainPostFit(p), /the chart runs 10 px out of the top of its box/);
  assert.deepEqual(findLayoutProblems(m(null), S0), []);
});
