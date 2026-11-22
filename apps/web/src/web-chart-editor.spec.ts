// The post editor's chart (web/src/pages/batches/editor/chart-model.ts): a table of points becomes the chart a post carries, in the shape the
// engine accepts; what is missing is said in plain words; the budgets of a look's designs narrow the kinds and counts offered. The look editor's
// chart chips (design/parts.tsx) write catalogue values only.
import { describe, expect, it } from 'vitest';
import { CHART_LIMITS, chartDraft, chartHints, chartOfDraft, readNumber } from '../web/src/pages/batches/editor/chart-model';
import { budgetsFor } from '../web/src/pages/batches/editor/look-brief';
import { POST_LIMITS, type PostKindInfo } from '../web/src/pages/batches/design-model';
import { chartKindPatch } from '../web/src/pages/settings/looks/design/chart-choices';
import { engineImport } from './server/engine/root.js';

const engine = () => engineImport<{ chartProblems(c: unknown, where: string): string[] }>('design/chart');

describe('the chart table', () => {
  it('turns typed rows into a chart the engine accepts, and back', async () => {
    const { chartProblems } = await engine();
    const draft = { kind: 'bar', unit: 'currency', highlight: 'last', total: '', rows: [{ label: 'Jan', value: '1,450' }, { label: ' Feb ', value: '1600' }, { label: '', value: '2400.5' }, { label: 'Empty', value: '' }] };
    const chart = chartOfDraft(draft);
    expect(chart).toEqual({ kind: 'bar', series: [{ label: 'Jan', value: 1450 }, { label: 'Feb', value: 1600 }, { value: 2400.5 }], unit: 'currency', highlight: 'last' });
    expect(chartProblems(chart, 'c')).toEqual([]);
    expect(chartDraft(chart)).toEqual({ kind: 'bar', unit: 'currency', highlight: 'last', total: '', rows: [{ label: 'Jan', value: '1450' }, { label: 'Feb', value: '1600' }, { label: '', value: '2400.5' }] });
    // a donut: one value and what it is out of
    const donut = chartOfDraft({ kind: 'donut', unit: 'percent', highlight: '', total: '', rows: [{ label: 'Reached', value: '72' }] });
    expect(donut).toEqual({ kind: 'donut', series: [{ label: 'Reached', value: 72 }], unit: 'percent' });
    expect(chartProblems(donut, 'c')).toEqual([]);
    expect(chartOfDraft({ kind: 'progress', unit: 'number', highlight: '', total: '2,000', rows: [{ label: 'Pot', value: '1250' }] })).toEqual({ kind: 'progress', series: [{ label: 'Pot', value: 1250 }], total: 2000 });
    // nothing to draw: no chart at all
    expect(chartOfDraft(chartDraft(undefined))).toBeUndefined();
    expect(chartOfDraft({ kind: '', unit: 'number', highlight: '', total: '', rows: [{ label: 'A', value: 'lots' }] })).toBeUndefined();
    expect(chartOfDraft({ kind: '', unit: 'number', highlight: '2', total: '', rows: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }, { label: 'C', value: '3' }] })?.highlight).toBe(2);
  });

  it('reads numbers as people type them, and nothing else', () => {
    expect([readNumber('1,450'), readNumber(' 12.5 '), readNumber('-3'), readNumber('−3'), readNumber('.5'), readNumber('1 000')]).toEqual([1450, 12.5, -3, -3, 0.5, 1000]);
    for (const t of ['', 'abc', '1e9', '12%', '€12', '0x10', 'Infinity', 'NaN', '1.2.3', '<b>1</b>']) expect(Number.isNaN(readNumber(t))).toBe(true);
  });

  it('says what is missing in plain words', () => {
    const d = (o: Partial<ReturnType<typeof chartDraft>>) => ({ ...chartDraft(undefined), ...o });
    expect(chartHints(d({ rows: [{ label: 'A', value: '1' }, { label: 'B', value: 'x' }] }))).toContain('Point 2 needs a number, such as 1450 or 12.5.');
    expect(chartHints(d({ kind: 'donut', rows: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }] })).some((h) => /one value out of a total/.test(h))).toBe(true);
    expect(chartHints(d({ rows: Array.from({ length: 13 }, (_, i) => ({ label: `P${i}`, value: String(i) })) })).some((h) => /2 to 12 points/.test(h))).toBe(true);
    expect(chartHints(d({ kind: 'progress', rows: [{ label: 'A', value: '1' }] })).some((h) => /out of \(the total\)/.test(h))).toBe(true);
    expect(chartHints(d({ kind: 'progress', unit: 'percent', rows: [{ label: 'A', value: '40' }] }))).toEqual([]);
    expect(chartHints(d({ rows: [{ label: 'A much longer label', value: '1' }, { label: 'B', value: '2' }] })).some((h) => /longer than 14/.test(h))).toBe(true);
    expect(chartHints(d({ kind: 'donut', rows: [{ label: 'A', value: '1' }] }), { ...CHART_LIMITS, kinds: ['bar'] }).some((h) => /This design draws Bars/.test(h))).toBe(true);
  });

  it('the budgets of a look\'s designs narrow the kinds and the counts the table offers', () => {
    const info: PostKindInfo = { kind: 'figure', fields: ['big', 'chart'], required: ['big'], variants: [
      { variant: 0, name: 'Big number', describe: '', budgets: { big: { required: true, max: 8 }, chart: { required: false, kinds: ['bar', 'area'], min: 3, max: 8 } } },
      { variant: 1, name: 'Card', describe: '', budgets: { big: { required: true, max: 8 } } },
      { variant: 2, name: 'Spark', describe: '', budgets: { big: { required: true, max: 8 }, chart: { required: false, kinds: ['spark'], min: 4, max: 12 } } },
    ] };
    expect(budgetsFor(POST_LIMITS, info, 0).chart).toEqual({ ...CHART_LIMITS, kinds: ['bar', 'area'], min: 3, max: 8 });
    expect(budgetsFor(POST_LIMITS, info, undefined).chart).toEqual({ ...CHART_LIMITS, kinds: ['bar', 'area', 'spark'], min: 3, max: 12 });
    expect(budgetsFor(POST_LIMITS, info, 1).chart).toEqual(CHART_LIMITS);
    expect(POST_LIMITS.chart).toEqual(CHART_LIMITS);
  });
});

describe('the look editor\'s chart chips', () => {
  it('choosing a kind keeps one and leaves no line setting on a kind that draws no line (the engine refuses those)', () => {
    expect(chartKindPatch({ type: 'chart', kinds: ['line'], trim: true, marks: 'end', stroke: 6 }, 'bar')).toEqual({ kinds: ['bar'], trim: undefined, marks: undefined, stroke: undefined });
    expect(chartKindPatch({ type: 'chart', kinds: ['bar'] }, 'area')).toEqual({ kinds: ['area'] });
  });
});
