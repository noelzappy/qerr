// A post's chart: what it is drawn as (the kinds the design draws), what its numbers are (a number, money or a percentage, written the brand's
// way), which point stands out, and a small table of points, each a short label and a number; add, remove and move rows. A donut or progress
// bar takes one value and what it is out of. The engine draws the chart and the server and the preview stay the authority (chart-model.ts).
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { CHART_KIND_WORDS, CHART_LIMITS, CHART_UNIT_WORDS, SHARE_KINDS, chartDraft, chartHints, chartOfDraft, type ChartDraft, type ChartLimits } from './chart-model';

const SELECT = 'h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 max-sm:h-11';

export function ChartEditor({ value, onChange, limits = CHART_LIMITS, required, disabled }: {
  value: unknown; onChange: (next: Record<string, unknown> | undefined) => void; limits?: ChartLimits; required?: boolean; disabled?: boolean;
}) {
  const [d, setD] = useState<ChartDraft>(() => chartDraft(value));
  const emitted = useRef(JSON.stringify(chartOfDraft(chartDraft(value)) ?? null));
  useEffect(() => {
    const now = JSON.stringify(chartOfDraft(chartDraft(value)) ?? null);
    if (now !== emitted.current) { setD(chartDraft(value)); emitted.current = now; }
  }, [value]);
  function update(next: ChartDraft) {
    setD(next);
    const out = chartOfDraft(next);
    emitted.current = JSON.stringify(out ?? null);
    onChange(out);
  }
  const share = SHARE_KINDS.includes(d.kind);
  const rowsMax = share ? 1 : limits.max;
  const setRow = (i: number, patch: Partial<ChartDraft['rows'][number]>) => update({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const move = (i: number, by: -1 | 1) => { const rows = [...d.rows], j = i + by; if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j]!, rows[i]!]; update({ ...d, rows }); };
  const hints = d.rows.length ? chartHints(d, limits) : [];
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">Chart {!required && <span className="font-normal text-muted-foreground">(optional; {limits.min} to {limits.max} points, or one value out of a total)</span>}</legend>
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">Drawn as
          <select aria-label="Chart kind" className={SELECT} value={d.kind} onChange={(e) => update({ ...d, kind: e.target.value })}>
            <option value="">The design&apos;s choice</option>
            {limits.kinds.map((k) => <option key={k} value={k}>{CHART_KIND_WORDS[k] ?? k}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">The numbers are
          <select aria-label="Chart unit" className={SELECT} value={d.unit} onChange={(e) => update({ ...d, unit: e.target.value })}>
            {limits.units.map((u) => <option key={u} value={u}>{CHART_UNIT_WORDS[u] ?? u}</option>)}
          </select>
        </label>
        {!share && (
          <label className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">Stands out
            <select aria-label="Highlighted point" className={SELECT} value={d.highlight} onChange={(e) => update({ ...d, highlight: e.target.value })}>
              <option value="">None</option><option value="last">The last</option><option value="max">The highest</option><option value="min">The lowest</option>
              {d.rows.map((r, i) => <option key={i} value={String(i)}>{r.label.trim() || `Point ${i + 1}`}</option>)}
            </select>
          </label>
        )}
        {(share || d.rows.length === 1) && (
          <TextField className="w-36" label="Out of" inputMode="decimal" placeholder={d.unit === 'percent' ? '100' : '2000'} value={d.total} onChange={(e) => update({ ...d, total: e.target.value })} />
        )}
      </div>
      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead className="text-left text-[12.5px] text-muted-foreground"><tr><th className="font-normal">Label</th><th className="font-normal">Number</th><th><span className="sr-only">Move or remove</span></th></tr></thead>
        <tbody>
          {d.rows.map((r, i) => (
            <tr key={i}>
              <td className="pr-2"><TextField label={<span className="sr-only">Label of point {i + 1}</span>} value={r.label} maxLength={limits.chars} placeholder={['Jan', 'Feb', 'Mar'][i % 3]} onChange={(e) => setRow(i, { label: e.target.value })} /></td>
              <td className="w-32 pr-2"><TextField label={<span className="sr-only">Number of point {i + 1}</span>} value={r.value} inputMode="decimal" placeholder="0" onChange={(e) => setRow(i, { value: e.target.value })} /></td>
              <td className="w-28 whitespace-nowrap">
                <Button type="button" variant="ghost" size="icon" aria-label={`Move point ${i + 1} up`} disabled={i === 0} className="max-sm:size-11" onClick={() => move(i, -1)}><ArrowUp aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Move point ${i + 1} down`} disabled={i === d.rows.length - 1} className="max-sm:size-11" onClick={() => move(i, 1)}><ArrowDown aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove point ${i + 1}`} className="max-sm:size-11" onClick={() => update({ ...d, rows: d.rows.filter((_, j) => j !== i), highlight: d.highlight === String(i) ? '' : d.highlight })}><X aria-hidden="true" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={d.rows.length >= rowsMax} onClick={() => setD({ ...d, rows: [...d.rows, { label: '', value: '' }] })}>
          <Plus aria-hidden="true" /> Add a point
        </Button>
      </div>
      {hints.length > 0 && <ul className="list-disc pl-5 text-[12.5px] text-muted-foreground">{hints.map((h) => <li key={h}>{h}</li>)}</ul>}
    </fieldset>
  );
}
