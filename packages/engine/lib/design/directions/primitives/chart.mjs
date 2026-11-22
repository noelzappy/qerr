// Primitive: a chart of the post's numbers (post field `chart`, lib/design/chart.mjs): vertical or horizontal bars, a line with an optional
// area, a sparkline with an end dot and min and max marks, a donut for a share, a progress bar for one value out of a total (kit c.chartSvg).
// The look decides how it is drawn: which kinds this design draws (the post's own kind when it is one of them, else the first that fits the
// data), the colours (palette roles, one highlight colour), the axis (none, a baseline or a light grid), whether values and labels show, the
// corner rounding, the stroke, the thickness, and whether a line may trim its axis (never a bar). The marks are built from validated numbers
// and nothing else; the labels and values are words of the post set as text in cells, so the fit and contrast checks read them.
import { bool, en, int, list, obj, role } from '../../look-desc.mjs';
import { CHART_KINDS, LINE_KINDS, POST_CHART, chartKindFor } from '../../chart.mjs';

export const CHART_AXES = ['none', 'baseline', 'grid'];
export const CHART_MARKS = ['none', 'end', 'minmax', 'all'];
export const CHART_FONTS = ['label', 'display', 'text', 'mono'];
export const SPEC = {
  label: 'Chart', group: 'Shapes', help: 'The post\'s numbers drawn as bars, a line, a sparkline, a donut or a progress bar, in the brand\'s colours.',
  placement: 'required', flow: true, container: null, text: true,
  own: {
    kinds: list(en(CHART_KINDS, 'Kind', 'bar, hbar (bars across), line, area (a line with its area filled), spark (a small line), donut or progress.'), CHART_KINDS.length, 'Kinds', 'The kinds of chart this design draws, the first the default: a post that names another of them gets it; one that names none gets the first that fits its numbers.', { min: 1, unique: true, def: ['bar'] }),
    colours: obj({
      mark: role('Marks', 'The colour of the bars or the line.', 'primary'),
      highlight: role('Highlight', 'The one colour of the highlighted point, a donut\'s share and a progress bar\'s fill.', 'accent'),
      track: role('Track', 'The rest of a donut or progress bar.', 'rule-soft'),
      grid: role('Lines', 'The baseline and the grid.', 'rule'),
    }, 'Colours', 'The brand colours the chart is drawn in.'),
    axis: en(CHART_AXES, 'Axis', 'No axis, a baseline, or a light grid at round values behind the marks.', 'baseline'),
    values: bool('Values', 'Writes the values (on bars, at a line\'s highlighted or last point, in a donut, beside a progress bar).', true),
    labels: bool('Labels', 'Writes each point\'s label (under bars and lines, beside horizontal bars, over a progress bar).', true),
    radius: int(0, 40, 'Rounding', 'Rounds the ends of bars and progress bars, in pixels (a donut\'s ends are round when above 0).', 0),
    stroke: int(1, 16, 'Line width', 'The width of a line or sparkline, in pixels.', 4),
    thickness: int(2, 200, 'Thickness', 'The thickness of bars, a donut\'s ring or a progress bar, in pixels (bars take about two thirds of their slot when left out).'),
    trim: bool('Start the axis near the data', 'A line, area or sparkline may start its axis just below its lowest value, so a small change shows (never a bar: bars always start at zero).', false),
    marks: en(CHART_MARKS, 'Dots', 'Dots on a line: none, the last point, the lowest, highest and last, or every point.', 'none'),
    textSize: int(14, 60, 'Label size', 'Pixels; leave out for the look\'s label size.'),
    valueSize: int(14, 200, 'Value size', 'Pixels; leave out for the label size (a donut\'s middle takes a larger one).'),
    valueFont: en(CHART_FONTS, 'Value font', 'Which of the look\'s fonts the values are set in.', 'label'),
    upper: bool('Labels in capitals', 'Sets the labels in capitals.', false),
  },
  common: ['place', 'z', 'when', 'ink', 'w', 'h', 'before', 'nudgeX', 'alignSelf'],
  required: [],
};

// For the static checks (look-static.mjs): what it shows, the type sizes it sets, the inks it puts on its ground, the fonts it uses.
export const bindings = () => [{ field: 'chart', sig: 'chart|chart' }];
const labelSizeOf = (el, look) => el.textSize ?? look.type?.label?.size;
export function sizes(el, look) {
  const kinds = el.kinds ?? ['bar'], out = [];
  if ((el.labels ?? true) && kinds.some((k) => k !== 'spark' && k !== 'donut')) out.push(labelSizeOf(el, look));
  if ((el.values ?? true) && kinds.some((k) => k !== 'spark')) out.push(el.valueSize ?? labelSizeOf(el, look));
  return out.filter(Number.isFinite);
}
// the labels stand on the ground in the element's ink (else muted), the values in the element's ink (else ink): checked like every ink
export const inks = (el) => (el.ink === undefined ? ['muted', 'ink'] : []);
export function fonts(el, look) {
  const T = look.type, labelRole = T.label.role === 'mono' ? 'mono' : 'label', vf = el.valueFont ?? 'label';
  const vRole = vf === 'label' ? labelRole : vf;
  return [[labelRole, T.label.weight], [vRole, vf === 'display' ? T.display.weight : vf === 'text' ? T.body.weight : T.label.weight]];
}
export function rules(el, bad) {
  const kinds = el.kinds ?? ['bar'];
  if (el.trim && !kinds.every((k) => LINE_KINDS.includes(k))) bad('lets only a line, area or sparkline start its axis near the data; a bar always starts at zero, so a design that trims draws only line kinds', 'trim');
  if (el.marks !== undefined && el.marks !== 'none' && !kinds.some((k) => LINE_KINDS.includes(k))) bad('are dots on a line; this design draws no line', 'marks');
  if (el.stroke !== undefined && !kinds.some((k) => LINE_KINDS.includes(k))) bad('is the width of a line; this design draws no line', 'stroke');
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export function render(c, p, env) {
  const raw = c.chart();
  if (!raw) return '';
  const kinds = p.kinds ?? ['bar'];
  const kind = chartKindFor({ kind: raw.kind, series: raw.values.map((value) => ({ value })) }, kinds);
  if (!kind) throw new Error(`look: this chart draws ${kinds.join(', ')}; the post's chart is ${raw.kind ?? (raw.values.length === 1 ? 'one value out of a total' : `${raw.values.length} points`)}`);
  if (raw.values.length > POST_CHART.max) return '';
  const T = env.look.type, L = T.label, b = env.box;
  const w = b.w ?? env.innerW, h = b.h;
  if (!Number.isFinite(w) || !Number.isFinite(h)) throw new Error('look: a chart needs a width and a height (a place with both, or w and h in a box)');
  const labelSize = p.textSize ?? L.size, valueSize = p.valueSize ?? labelSize;
  const vf = p.valueFont ?? 'label', labelFamily = L.role === 'mono' ? 'mono' : 'label';
  const o = clean({
    kind, w, h, colours: p.colours, axis: p.axis ?? 'baseline', values: p.values ?? true, labels: p.labels ?? true, radius: p.radius ?? 0, stroke: p.stroke, thickness: p.thickness,
    trim: p.trim && LINE_KINDS.includes(kind) ? true : undefined, marks: p.marks, labelSize, valueSize, labelFamily, valueFamily: vf === 'label' ? labelFamily : vf,
    labelWeight: L.weight, valueWeight: vf === 'display' ? T.display.weight : vf === 'text' ? T.body.weight : L.weight, track: L.track, valueTrack: vf === 'label' ? L.track : undefined, upper: p.upper || undefined,
    labelInk: env.ink ?? 'muted', valueInk: env.ink ?? 'ink',
  });
  if (b.flow) return c.chartSvg({ ...o, flow: true, alignSelf: b.alignSelf, nudge: env.nudge });
  return c.chartSvg({ ...o, x: b.x, y: b.y, right: b.right, bottom: b.bottom, z: env.z });
}
