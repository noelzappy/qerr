// The figures of a design: rows of a number and a label, stored the way the design block keeps them ("14.8M+|processed").
import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';

interface Row { n: string; l: string }

// spec.mjs MAX_STATS
const MAX_STATS = 3;

// Reads what the design holds: "number|label" strings or ["number", "label"] pairs. Anything else is skipped.
function parse(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  const rows: Row[] = [];
  for (const s of value) {
    if (typeof s === 'string') {
      const i = s.indexOf('|');
      rows.push(i < 0 ? { n: s.trim(), l: '' } : { n: s.slice(0, i).trim(), l: s.slice(i + 1).replace(/\|/g, '').trim() });
    } else if (Array.isArray(s) && s.length === 2) rows.push({ n: String(s[0] ?? '').replace(/\|/g, '').trim(), l: String(s[1] ?? '').replace(/\|/g, '').trim() });
  }
  return rows;
}

const complete = (r: Row) => r.n.trim() !== '' && r.l.trim() !== '';
const toStrings = (rows: Row[]) => rows.filter(complete).map((r) => `${r.n.trim()}|${r.l.trim()}`);

export function StatsEditor({ value, onChange, max = MAX_STATS, disabled, label = 'Figures' }: {
  value: unknown;
  onChange: (next: string[] | undefined) => void;
  max?: number;
  disabled?: boolean;
  label?: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => parse(value));
  const emitted = useRef(JSON.stringify(toStrings(parse(value))));

  // Take a value that changed from outside (another post opened, the design reset); ignore the echo of our own edit.
  useEffect(() => {
    if (JSON.stringify(toStrings(parse(value))) !== emitted.current) {
      setRows(parse(value));
      emitted.current = JSON.stringify(toStrings(parse(value)));
    }
  }, [value]);

  function update(next: Row[]) {
    setRows(next);
    const out = toStrings(next);
    emitted.current = JSON.stringify(out);
    onChange(out.length ? out : undefined);
  }
  const edit = (i: number, key: keyof Row, v: string) => update(rows.map((r, j) => (j === i ? { ...r, [key]: v.replace(/\|/g, '') } : r)));

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {rows.map((r, i) => {
        const half = (r.n.trim() !== '') !== (r.l.trim() !== '');
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-end gap-2">
              <TextField className="w-28 shrink-0 sm:w-36" label={<span className="sr-only">Number {i + 1}</span>} placeholder="Number, e.g. 14.8M+" aria-label={`Figure ${i + 1} number`}
                value={r.n} onChange={(e) => edit(i, 'n', e.target.value)} maxLength={40} />
              <TextField className="flex-1" label={<span className="sr-only">Label {i + 1}</span>} placeholder="Label, e.g. processed" aria-label={`Figure ${i + 1} label`}
                value={r.l} onChange={(e) => edit(i, 'l', e.target.value)} maxLength={60} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove figure ${i + 1}`} className="max-sm:size-11" onClick={() => update(rows.filter((_, j) => j !== i))}>
                <X aria-hidden="true" />
              </Button>
            </div>
            {half && <p className="text-[13px] text-muted-foreground">Fill in both the number and the label</p>}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={rows.length >= max} onClick={() => setRows([...rows, { n: '', l: '' }])}>
          <Plus aria-hidden="true" /> Add a figure
        </Button>
        <span className="text-[13px] text-muted-foreground">Up to three figures, shown side by side.</span>
      </div>
    </fieldset>
  );
}
