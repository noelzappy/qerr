// The chart chips of the look editor (parts.tsx), as plain values and functions (tested in web-chart-editor.spec.ts).
import type { Json } from '../design-model';

// A chart's kinds as people say them; the first kind a design draws is the one a post gets when it names none (more kinds under Fine-tune).
export const CHART_WORDS: Record<string, string> = { bar: 'Bars', hbar: 'Bars across', line: 'Line', area: 'Area', spark: 'Sparkline', donut: 'Donut', progress: 'Progress bar' };
export const LINE_KINDS = ['line', 'area', 'spark'];
export const CHART_ROUNDING: Array<[number, string]> = [[0, 'Square'], [8, 'Soft'], [24, 'Round']];
// The values a kind chip writes: one kind; a kind that draws no line leaves no trim, dots or line width behind (the engine refuses them there).
export function chartKindPatch(_el: Json, kind: string): Record<string, unknown> {
  return { kinds: [kind], ...(LINE_KINDS.includes(kind) ? {} : { trim: undefined, marks: undefined, stroke: undefined }) };
}
