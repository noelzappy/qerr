// A post's chart as the post editor holds it: a kind, a unit, the point to highlight, a table of points (a label and a number each) and, for a
// donut or progress bar, the total. Pure, so it is tested without a browser (web-chart-editor.spec.ts). The engine (lib/design/chart.mjs)
// stays the authority: this only keeps what a person typed in the shape a post carries, and says plainly what is missing.

export interface ChartRow { label: string; value: string }
export interface ChartDraft { kind: string; unit: string; highlight: string; total: string; rows: ChartRow[] }
export interface ChartLimits { min: number; max: number; chars: number; kinds: string[]; units: string[] }
export const CHART_LIMITS: ChartLimits = { min: 2, max: 12, chars: 14, kinds: ['bar', 'hbar', 'line', 'area', 'spark', 'donut', 'progress'], units: ['number', 'currency', 'percent'] };
export const SHARE_KINDS = ['donut', 'progress'];
export const CHART_KIND_WORDS: Record<string, string> = { bar: 'Bars', hbar: 'Bars across', line: 'Line', area: 'Area', spark: 'Sparkline', donut: 'Donut', progress: 'Progress bar' };
export const CHART_UNIT_WORDS: Record<string, string> = { number: 'Number', currency: 'Money', percent: 'Percent' };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const numText = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

// What a post's chart says, as the editor's draft (an empty draft for none).
export function chartDraft(value: unknown): ChartDraft {
  if (!isObj(value)) return { kind: '', unit: 'number', highlight: '', total: '', rows: [] };
  const rows = Array.isArray(value.series) ? value.series.filter(isObj).map((p) => ({ label: typeof p.label === 'string' ? p.label : '', value: numText(p.value) })) : [];
  return {
    kind: typeof value.kind === 'string' ? value.kind : '', unit: typeof value.unit === 'string' ? value.unit : 'number',
    highlight: typeof value.highlight === 'number' ? String(value.highlight) : typeof value.highlight === 'string' ? value.highlight : '', total: numText(value.total), rows,
  };
}

// A number as a person types it: digits with an optional sign and decimal point; thousands separators and spaces are ignored. NaN otherwise.
export function readNumber(text: string): number {
  const t = text.replace(/[\s,  ]/g, '').replace(/^−/, '-');
  return /^-?(\d+(\.\d*)?|\.\d+)$/.test(t) ? Number(t) : NaN;
}

// The chart a post carries for a draft, or undefined when there is nothing to draw (no point with a number). Rows without a number are left
// out; a label is kept only when it has words. The kind, unit and highlight are written only when chosen.
export function chartOfDraft(d: ChartDraft): Record<string, unknown> | undefined {
  const series = d.rows.map((r) => ({ label: r.label.trim(), value: readNumber(r.value) })).filter((p) => Number.isFinite(p.value)).map((p) => (p.label ? { label: p.label, value: p.value } : { value: p.value }));
  if (!series.length) return undefined;
  const out: Record<string, unknown> = {};
  if (d.kind) out.kind = d.kind;
  out.series = series;
  if (d.unit && d.unit !== 'number') out.unit = d.unit;
  if (d.highlight !== '') out.highlight = /^\d+$/.test(d.highlight) ? Number(d.highlight) : d.highlight;
  const total = readNumber(d.total);
  if ((SHARE_KINDS.includes(d.kind) || series.length === 1) && Number.isFinite(total)) out.total = total;
  return out;
}

// What a person still has to do before the chart can be drawn, in plain words (empty when the draft looks drawable). The server says the rest.
export function chartHints(d: ChartDraft, lim: ChartLimits = CHART_LIMITS): string[] {
  const out: string[] = [];
  const share = SHARE_KINDS.includes(d.kind);
  const numbers = d.rows.filter((r) => r.value.trim());
  const bad = d.rows.findIndex((r) => r.value.trim() && !Number.isFinite(readNumber(r.value)));
  if (bad >= 0) out.push(`Point ${bad + 1} needs a number, such as 1450 or 12.5.`);
  if (share && numbers.length !== 1) out.push(`A ${CHART_KIND_WORDS[d.kind]!.toLowerCase()} shows one value out of a total: give one point.`);
  if (!share && numbers.length && (numbers.length < lim.min || numbers.length > lim.max)) out.push(`Give ${lim.min} to ${lim.max} points (or choose a donut or progress bar for one value out of a total).`);
  if ((share || numbers.length === 1) && d.unit !== 'percent' && !Number.isFinite(readNumber(d.total))) out.push('Say what the value is out of (the total), unless it is a percentage.');
  const long = d.rows.findIndex((r) => [...r.label.trim()].length > lim.chars);
  if (long >= 0) out.push(`The label of point ${long + 1} is longer than ${lim.chars} characters.`);
  if (d.kind && !lim.kinds.includes(d.kind)) out.push(`This design draws ${lim.kinds.map((k) => CHART_KIND_WORDS[k] ?? k).join(', ')}; choose one of those.`);
  return out;
}
