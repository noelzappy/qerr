// A post's chart: the data (post-spec.mjs `chart`), the brand's number format, and the geometry of the marks. Pure: no Chrome, no files, no
// markup. The kit (directions/kit.mjs c.chartSvg) draws what chartLayout() returns; the look's `chart` element (directions/primitives/chart.mjs)
// says which kinds a design draws and how (colours, axis, labels, rounding, stroke).
//
// The data is untrusted (the AI fills it from research, a person types it): every value is a finite number in a fixed range, every label one
// short line of plain words, every name one of a fixed list. A problem never repeats what it was given.
//
//   chart: { kind?: one of CHART_KINDS, series: [{ label?: up to 14 characters, value: a number }], unit?: number | currency | percent,
//            highlight?: a point's index | last | max | min | none, total?: (donut and progress) what the one value is a share of }
// bar, hbar, line, area and spark take 2 to 12 points; donut and progress take one point and its total (100 when the unit is percent).

export const CHART_KINDS = Object.freeze(['bar', 'hbar', 'line', 'area', 'spark', 'donut', 'progress']);
// the kinds that draw one value out of a total, and the kinds that draw a series
export const SHARE_KINDS = Object.freeze(['donut', 'progress']);
export const SERIES_KINDS = Object.freeze(CHART_KINDS.filter((k) => !SHARE_KINDS.includes(k)));
// the kinds whose scale always starts at zero (a bar's length is its value); a line may trim its axis only when its look says so
export const ZERO_KINDS = Object.freeze(['bar', 'hbar', 'donut', 'progress']);
export const LINE_KINDS = Object.freeze(['line', 'area', 'spark']);
export const CHART_UNITS = Object.freeze(['number', 'currency', 'percent']);
export const CHART_HIGHLIGHTS = Object.freeze(['none', 'last', 'max', 'min']);
export const CHART_KEYS = Object.freeze(['kind', 'series', 'unit', 'highlight', 'total']);
export const POINT_KEYS = Object.freeze(['label', 'value']);
// min/max points of a series, label length, the largest size of a value, the most decimal places
export const POST_CHART = Object.freeze({ min: 2, max: 12, label: 14, value: 1e9, decimals: 2 });

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// decimal places of a number as written (0.1 + 0.2 style noise is not a decimal place: 12 significant digits at most)
export const decimalsOf = (v) => { const s = String(Number(v.toPrecision(12))); const i = s.indexOf('.'); return s.includes('e') ? 99 : i < 0 ? 0 : s.length - i - 1; };
// One line of plain words: no control character, no line break, no inline mark, no angle bracket (they would be escaped, but a label never needs one)
const LINE_BAD = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069<>*[\]{}\\]/u;
const chars = (s) => [...s].length;

// The kind a chart is drawn as when it names none: one of `allowed` (the design's kinds, in its order) that fits the data's shape, or null.
export function chartKindFor(chart, allowed = CHART_KINDS) {
  if (!isObj(chart)) return null;
  const share = Array.isArray(chart.series) && chart.series.length === 1;
  if (typeof chart.kind === 'string') return allowed.includes(chart.kind) ? chart.kind : null;
  return allowed.find((k) => SHARE_KINDS.includes(k) === share) ?? null;
}
// The total a share chart is out of (its own, or 100 for a percentage), or null.
export const totalOf = (chart) => (finite(chart?.total) ? chart.total : chart?.unit === 'percent' ? 100 : null);

// Problems of a post's chart (a list of texts, empty when fine). Never echoes what it was given.
export function chartProblems(chart, where = 'design') {
  if (chart === undefined) return [];
  const at = `${where}: chart`;
  if (!isObj(chart)) return [`${at} must be an object like { "series": [{ "label": "Jan", "value": 120 }, { "label": "Feb", "value": 140 }] }`];
  const e = [];
  for (const k of Object.keys(chart)) if (!CHART_KEYS.includes(k)) { e.push(`${at} has a setting that is not part of a chart (it takes ${CHART_KEYS.join(', ')})`); break; }
  if (chart.kind !== undefined && !CHART_KINDS.includes(chart.kind)) e.push(`${at}.kind must be one of ${CHART_KINDS.join(', ')}`);
  if (chart.unit !== undefined && !CHART_UNITS.includes(chart.unit)) e.push(`${at}.unit must be one of ${CHART_UNITS.join(', ')}`);
  const s = chart.series;
  const share = SHARE_KINDS.includes(chart.kind) || (chart.kind === undefined && Array.isArray(s) && s.length === 1);
  if (!Array.isArray(s)) return [...e, `${at}.series must be a list of points like { "label": "Jan", "value": 120 }`];
  if (share && s.length !== 1) e.push(`${at}: a ${chart.kind} chart shows one value out of a total; give series one point and total`);
  if (!share && (s.length < POST_CHART.min || s.length > POST_CHART.max)) e.push(`${at}.series must have ${POST_CHART.min} to ${POST_CHART.max} points (or one point and a total, for a donut or progress bar)`);
  let dec = 0;
  s.slice(0, POST_CHART.max + 1).forEach((p, i) => {
    const pw = `${at}.series[${i}]`;
    if (!isObj(p)) { e.push(`${pw} must be an object like { "label": "Jan", "value": 120 }`); return; }
    if (Object.keys(p).some((k) => !POINT_KEYS.includes(k))) e.push(`${pw} has a setting that is not part of a point (label, value)`);
    if (!finite(p.value)) e.push(`${pw}.value must be a number`);
    else if (Math.abs(p.value) > POST_CHART.value) e.push(`${pw}.value must be from -${POST_CHART.value.toLocaleString('en')} to ${POST_CHART.value.toLocaleString('en')}`);
    else if (decimalsOf(p.value) > POST_CHART.decimals) e.push(`${pw}.value has more than ${POST_CHART.decimals} decimal places`);
    else dec = Math.max(dec, decimalsOf(p.value));
    if (finite(p.value) && p.value < 0 && share) e.push(`${pw}.value must not be below zero in a ${chart.kind ?? 'share'} chart`);
    if (p.label !== undefined) {
      if (typeof p.label !== 'string' || !p.label.trim()) e.push(`${pw}.label must be a non-empty text`);
      else if (LINE_BAD.test(p.label)) e.push(`${pw}.label must be one line of plain words (no line break, control character, mark or bracket)`);
      else if (chars(p.label) > POST_CHART.label) e.push(`${pw}.label is ${chars(p.label)} characters; the most is ${POST_CHART.label}`);
    }
  });
  if (chart.total !== undefined) {
    if (!share) e.push(`${at}.total is only for a donut or progress bar (one value out of a total)`);
    else if (!finite(chart.total) || chart.total <= 0 || chart.total > POST_CHART.value) e.push(`${at}.total must be a number above zero, at most ${POST_CHART.value.toLocaleString('en')}`);
    else if (decimalsOf(chart.total) > POST_CHART.decimals) e.push(`${at}.total has more than ${POST_CHART.decimals} decimal places`);
  }
  if (share && totalOf(chart) === null) e.push(`${at}: a ${chart.kind ?? 'share'} chart needs total (what the value is a share of), unless its unit is percent`);
  if (share && finite(s[0]?.value) && totalOf(chart) !== null && s[0].value > totalOf(chart)) e.push(`${at}: the value is more than its total`);
  const h = chart.highlight;
  if (h !== undefined) {
    if (typeof h === 'number') { if (!(Number.isInteger(h) && h >= 0 && h < Math.max(1, s.length))) e.push(`${at}.highlight must be the index of a point (0 to ${Math.max(0, s.length - 1)}) or one of ${CHART_HIGHLIGHTS.join(', ')}`); }
    else if (!CHART_HIGHLIGHTS.includes(h)) e.push(`${at}.highlight must be the index of a point or one of ${CHART_HIGHLIGHTS.join(', ')}`);
  }
  return e;
}

// ---- the brand's number format (brand.json `numbers`) ----
export const DECIMAL_MARKS = Object.freeze(['.', ',']);
export const GROUP_MARKS = Object.freeze([',', '.', ' ', 'thin', 'none']);
export const CURRENCY_AT = Object.freeze(['before', 'after']);
export const NUMBERS_KEYS = Object.freeze(['decimal', 'group', 'currency', 'currencyAt', 'currencySpace', 'percentSpace']);
// A currency is one to four letters or currency signs (€, £, kr, CHF, GH₵): never a digit, a space, a mark or a bracket.
export const CURRENCY = /^[\p{Sc}\p{L}]{1,4}$/u;
export const NUMBERS_DEFAULT = Object.freeze({ decimal: '.', group: ',', currency: '', currencyAt: 'before', currencySpace: false, percentSpace: false });

export function numbersProblems(v, where = 'brand.json: numbers') {
  if (v === undefined) return [];
  if (!isObj(v)) return [`${where} must be an object like { "decimal": ".", "group": ",", "currency": "€", "currencyAt": "before" }`];
  const e = [];
  for (const k of Object.keys(v)) if (!NUMBERS_KEYS.includes(k)) { e.push(`${where} has a setting it does not take (${NUMBERS_KEYS.join(', ')})`); break; }
  if (v.decimal !== undefined && !DECIMAL_MARKS.includes(v.decimal)) e.push(`${where}.decimal must be "." or ","`);
  if (v.group !== undefined && !GROUP_MARKS.includes(v.group)) e.push(`${where}.group must be one of ${GROUP_MARKS.map((g) => `"${g}"`).join(', ')}`);
  if (v.currency !== undefined && !(typeof v.currency === 'string' && (v.currency === '' || CURRENCY.test(v.currency)))) e.push(`${where}.currency must be one to four letters or currency signs, such as € or kr`);
  if (v.currencyAt !== undefined && !CURRENCY_AT.includes(v.currencyAt)) e.push(`${where}.currencyAt must be "before" or "after"`);
  for (const k of ['currencySpace', 'percentSpace']) if (v[k] !== undefined && typeof v[k] !== 'boolean') e.push(`${where}.${k} must be true or false`);
  const d = v.decimal ?? NUMBERS_DEFAULT.decimal, g = v.group ?? NUMBERS_DEFAULT.group;
  if (d === g) e.push(`${where}: the decimal mark and the thousands separator must differ`);
  return e;
}
// The number format to draw with: the brand's own where every setting is valid, the default for any that is not (defence in depth).
export function numberFormat(v) {
  const out = { ...NUMBERS_DEFAULT };
  if (!isObj(v) || numbersProblems(v).length) return out;
  for (const k of NUMBERS_KEYS) if (v[k] !== undefined) out[k] = v[k];
  return out;
}
const GROUP_CHAR = { ',': ',', '.': '.', ' ': '\u00a0', thin: '\u202f', none: '' };
// One value as the brand writes it: grouped thousands, the decimal mark, the currency before or after, a percent sign; `dec` decimal places;
// compact: 'k' or 'M' (the value is divided by a thousand or a million and the letter written after it). A minus is the true minus sign.
export function formatValue(v, { unit = 'number', numbers, dec = 0, compact } = {}) {
  if (!finite(v)) return '';
  const f = numberFormat(numbers), div = compact === 'M' ? 1e6 : compact === 'k' ? 1e3 : 1;
  const places = compact ? (Math.abs(v / div) < 10 ? 1 : 0) : Math.min(POST_CHART.decimals, Math.max(0, dec));
  const fixed = Math.abs(v / div).toFixed(places);
  let [int, frac] = fixed.split('.');
  if (compact && frac && /^0+$/.test(frac)) frac = undefined;
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_CHAR[f.group]);
  let num = `${int}${frac ? `${f.decimal}${frac}` : ''}${compact ?? ''}`;
  if (unit === 'percent') num = `${num}${f.percentSpace ? '\u00a0' : ''}%`;
  else if (unit === 'currency' && f.currency) num = f.currencyAt === 'after' ? `${num}${f.currencySpace ? '\u00a0' : ''}${f.currency}` : `${f.currency}${f.currencySpace ? '\u00a0' : ''}${num}`;
  return `${v < 0 && Number(fixed) !== 0 ? '\u2212' : ''}${num}`;
}
// The values of a chart written alike: the same decimal places for every one (the most any has), compact (k, M) when the largest is a
// hundred thousand or more.
export function formatAll(values, opts = {}) {
  const vs = values.filter(finite), big = Math.max(0, ...vs.map(Math.abs));
  const compact = big >= 1e7 ? 'M' : big >= 1e5 ? 'k' : undefined;
  const dec = Math.max(0, ...vs.map((x) => Math.min(POST_CHART.decimals, decimalsOf(x))));
  return (v) => formatValue(v, { ...opts, dec, compact });
}

// ---- the scale ----
// A "nice" step for ticks (1, 2, 2.5, 5 times a power of ten) that splits span into about n parts.
export function niceStep(span, n = 4) {
  if (!(span > 0)) return 1;
  const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
// The domain of a chart's values: from zero for bars, donuts and progress bars (always), and for lines unless `trim` (the look's explicit
// choice) lets the axis start near the data. Returns { lo, hi, ticks, zero, trimmed }; lo < hi always.
export function chartDomain(values, kind, { trim = false, total } = {}) {
  if (SHARE_KINDS.includes(kind)) return { lo: 0, hi: total > 0 ? total : 1, ticks: [], zero: true, trimmed: false };
  const vs = values.filter(finite);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  const trimmed = !!trim && LINE_KINDS.includes(kind) && lo > 0;
  if (!trimmed) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  if (lo === hi) { if (trimmed) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; } else hi = lo + 1; }
  const step = niceStep(hi - lo);
  if (trimmed) { lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step; if (lo < 0) lo = 0; }
  else { lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step; }
  if (lo === hi) hi = lo + step;
  const ticks = [];
  for (let t = lo; t <= hi + step * 1e-9 && ticks.length < 12; t += step) ticks.push(+t.toPrecision(12));
  return { lo, hi, ticks, zero: lo <= 0 && hi >= 0, trimmed };
}
// The index of the point to set in the highlight colour, or -1.
export function highlightIndex(values, h) {
  if (!values.length || h === undefined || h === 'none') return -1;
  if (Number.isInteger(h)) return h >= 0 && h < values.length ? h : -1;
  if (h === 'last') return values.length - 1;
  if (h === 'max') return values.indexOf(Math.max(...values));
  if (h === 'min') return values.indexOf(Math.min(...values));
  return -1;
}

// ---- the geometry: every mark of a chart in its own box (0,0)-(w,h), in pixels ----
// o: { kind, values, total, w, h, trim, stroke, thickness, radius, labelH (height of a category label row; 0 for none), valueH (height of a
// value label above a bar; 0 for none), labelW (the left column of an hbar's labels), valueW (the right column of an hbar's values),
// marks: none | end | minmax | all (a line's dots) }. Returns { kind, domain, bars|points|ring|track, labels: [{ x, y, w, h, i, what }] }:
// rectangles for the words (category labels and value labels) the kit sets as text in cells of those sizes, so the fit check holds each to it.
// Everything stays inside the box, the stroke and the dots included (chartBounds() checks it).
const round = (v) => Math.round(v * 100) / 100;
export function chartLayout(o) {
  const { kind, values, w, h } = o;
  if (!(w > 0 && h > 0)) throw new Error('chart: the box needs a width and a height');
  const stroke = o.stroke ?? 4, labelH = o.labelH ?? 0, valueH = o.valueH ?? 0;
  const out = { kind, w, h, labels: [] };
  if (kind === 'donut') {
    const t = Math.max(2, o.thickness ?? 24), d = Math.min(w, h), r = d / 2 - t / 2, share = Math.max(0, Math.min(1, values[0] / (o.total || 1)));
    out.ring = { cx: round(w / 2), cy: round(h / 2), r: round(r), t: round(t), share };
    out.domain = chartDomain(values, kind, { total: o.total });
    // the value in the middle of the ring: a cell inside the hole
    const hole = Math.max(0, 2 * (r - t / 2)) * 0.82;
    if (valueH) out.labels.push({ x: round(w / 2 - hole / 2), y: round(h / 2 - valueH / 2), w: round(hole), h: round(valueH), i: 0, what: 'value' });
    return out;
  }
  if (kind === 'progress') {
    // the words over the bar, the bar under them, the two together in the middle of the box
    const row = Math.max(labelH, valueH), t = Math.max(2, Math.min(o.thickness ?? 24, h - (row ? row + 12 : 0)));
    const top = row ? row + 12 : 0, y0 = Math.max(0, (h - top - t) / 2), y = y0 + top;
    const share = Math.max(0, Math.min(1, values[0] / (o.total || 1)));
    out.track = { x: 0, y: round(y), w: round(w), h: round(t), r: Math.min(o.radius ?? 0, t / 2) };
    out.bar = { x: 0, y: round(y), w: round(w * share), h: round(t), r: Math.min(o.radius ?? 0, t / 2) };
    out.domain = chartDomain(values, kind, { total: o.total });
    if (labelH) out.labels.push({ x: 0, y: round(y0 + row - labelH), w: round(w * 0.5), h: round(labelH), i: 0, what: 'label' });
    if (valueH) out.labels.push({ x: round(w * 0.5), y: round(y0 + row - valueH), w: round(w * 0.5), h: round(valueH), i: 0, what: 'value', align: 'right' });
    return out;
  }
  const dom = chartDomain(values, kind, { trim: o.trim });
  out.domain = dom;
  const n = values.length;
  if (kind === 'hbar') {
    const lw = labelH ? Math.round(o.labelW ?? w * 0.3) : 0, vw = valueH ? Math.round(o.valueW ?? w * 0.2) : 0, gap = 16;
    const x0 = lw ? lw + gap : 0, x1 = w - (vw ? vw + gap : 0), span = x1 - x0;
    if (span < 40) throw new Error('chart: the box is too narrow for its bars beside their labels');
    const slot = h / n;
    if (Math.max(labelH, valueH) > slot) throw new Error('chart: the box is too short for its bars and their labels');
    const bh = Math.max(2, Math.min(slot * 0.64, o.thickness ?? slot * 0.64)), at = (v) => x0 + ((v - dom.lo) / (dom.hi - dom.lo)) * span, base = at(Math.max(dom.lo, Math.min(dom.hi, 0)));
    out.base = { x: round(base), y0: 0, y1: round(h), vertical: true };
    out.bars = values.map((v, i) => { const y = slot * i + (slot - bh) / 2, a = at(v); return { i, x: round(Math.min(a, base)), y: round(y), w: round(Math.abs(a - base)), h: round(bh), r: Math.min(o.radius ?? 0, bh / 2), neg: v < 0 }; });
    out.grid = dom.ticks.map((t) => ({ x: round(at(t)), y0: 0, y1: round(h), vertical: true }));
    values.forEach((v, i) => {
      const y = slot * i + (slot - Math.max(labelH, valueH)) / 2;
      if (lw) out.labels.push({ x: 0, y: round(Math.max(0, y)), w: lw, h: round(labelH), i, what: 'label' });
      if (vw) out.labels.push({ x: round(w - vw), y: round(Math.max(0, y)), w: vw, h: round(valueH), i, what: 'value', align: 'right' });
    });
    return out;
  }
  // vertical: a value row on top (bars), the plot, a label row at the foot
  // (bars under zero write their values under them: a row is kept for those too)
  const neg = kind === 'bar' && valueH && values.some((v) => v < 0);
  const top = kind === 'bar' ? (values.some((v) => v >= 0) ? valueH + 4 : 0) : LINE_KINDS.includes(kind) && valueH ? valueH + 6 : 0, foot = (labelH ? labelH + 10 : 0) + (neg ? valueH + 4 : 0);
  const plotH = h - top - foot;
  if (plotH < 40) throw new Error('chart: the box is too short for its marks and labels');
  const y = (v) => top + plotH - ((v - dom.lo) / (dom.hi - dom.lo)) * plotH;
  out.grid = dom.ticks.map((t) => ({ y: round(y(t)), x0: 0, x1: round(w) }));
  if (kind === 'bar') {
    const slot = w / n, bw = Math.max(2, Math.min(slot * 0.62, o.thickness ?? slot * 0.62)), base = y(Math.max(dom.lo, Math.min(dom.hi, 0)));
    out.base = { y: round(base), x0: 0, x1: round(w) };
    out.bars = values.map((v, i) => { const a = y(v), x = slot * i + (slot - bw) / 2; return { i, x: round(x), y: round(Math.min(a, base)), w: round(bw), h: round(Math.abs(base - a)), r: Math.min(o.radius ?? 0, bw / 2), neg: v < 0 }; });
    values.forEach((v, i) => {
      const x = slot * i;
      if (labelH) out.labels.push({ x: round(x), y: round(h - labelH), w: round(slot), h: round(labelH), i, what: 'label', align: 'center' });
      // a value sits above its bar (below a bar under zero), inside the plot's top row
      if (valueH) { const b = out.bars[i], vy = v < 0 ? b.y + b.h + 4 : Math.max(0, b.y - valueH - 4); out.labels.push({ x: round(x), y: round(vy), w: round(slot), h: round(valueH), i, what: 'value', align: 'center' }); }
    });
    return out;
  }
  // a line: points across the width, the plot inset by half the stroke and the dots so nothing runs out of the box (the scale is
  // squeezed into the inset plot, never clipped: every point stands at its value)
  const dot = (o.marks && o.marks !== 'none') || valueH || o.highlight >= 0 ? Math.max(stroke * 1.6, 6) : 0, inset = Math.max(stroke / 2, dot) + 1;
  const xs = (i) => inset + (n === 1 ? 0 : (i / (n - 1)) * (w - 2 * inset));
  const yL = (v) => top + inset + (1 - (v - dom.lo) / (dom.hi - dom.lo)) * (plotH - 2 * inset);
  out.points = values.map((v, i) => ({ i, x: round(xs(i)), y: round(yL(v)) }));
  out.grid = dom.ticks.map((t) => ({ y: round(yL(t)), x0: 0, x1: round(w) }));
  const zeroY = dom.trimmed ? top + plotH - inset : yL(Math.max(dom.lo, Math.min(dom.hi, 0)));
  out.floor = round(zeroY);
  out.dot = round(dot);
  out.base = { y: round(zeroY), x0: 0, x1: round(w) };
  // the labels under their points: the first set from the left edge, the last to the right edge, the others centred under their point
  if (labelH) {
    const cellW = Math.min(n > 1 ? (w - 2 * inset) / (n - 1) : w, 160);
    values.forEach((v, i) => {
      const cx = xs(i), first = i === 0, last = i === n - 1 && n > 1;
      const x = first ? 0 : last ? w - cellW : Math.max(0, Math.min(w - cellW, cx - cellW / 2));
      out.labels.push({ x: round(x), y: round(h - labelH), w: round(cellW), h: round(labelH), i, what: 'label', align: first ? 'left' : last ? 'right' : 'center' });
    });
  }
  // one value, of the highlighted point (else the last), above it (below it when the point is near the top), inside the box
  if (valueH) {
    const k = o.highlight >= 0 && o.highlight < n ? o.highlight : n - 1, p = out.points[k], cw = Math.min(w, o.valueW ?? 220);
    const above = p.y - dot - 8 - valueH, vy = above >= 0 ? above : Math.min(top + plotH - valueH, p.y + dot + 8);
    const vx = Math.max(0, Math.min(w - cw, k === n - 1 ? p.x - cw + Math.max(dot, stroke) : k === 0 ? p.x - Math.max(dot, stroke) : p.x - cw / 2));
    out.labels.push({ x: round(vx), y: round(vy), w: round(cw), h: round(valueH), i: k, what: 'value', align: k === n - 1 ? 'right' : k === 0 ? 'left' : 'center' });
    out.valueAt = k;
  }
  return out;
}
// The smallest box round every mark of a layout, its stroke and dots included: { x0, y0, x1, y1 }.
export function chartBounds(L, stroke = 0) {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (x0, y0, x1, y1) => { b.x0 = Math.min(b.x0, x0); b.y0 = Math.min(b.y0, y0); b.x1 = Math.max(b.x1, x1); b.y1 = Math.max(b.y1, y1); };
  for (const r of L.bars ?? []) add(r.x, r.y, r.x + r.w, r.y + r.h);
  if (L.track) add(L.track.x, L.track.y, L.track.x + L.track.w, L.track.y + L.track.h);
  if (L.ring) add(L.ring.cx - L.ring.r - L.ring.t / 2, L.ring.cy - L.ring.r - L.ring.t / 2, L.ring.cx + L.ring.r + L.ring.t / 2, L.ring.cy + L.ring.r + L.ring.t / 2);
  const pad = Math.max(stroke / 2, L.dot ?? 0);
  for (const p of L.points ?? []) add(p.x - pad, p.y - pad, p.x + pad, p.y + pad);
  for (const l of L.labels ?? []) add(l.x, l.y, l.x + l.w, l.y + l.h);
  return b;
}
