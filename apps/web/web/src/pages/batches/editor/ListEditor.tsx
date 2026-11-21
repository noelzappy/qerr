// A short list of one-line texts (pills, tick list): one box per entry, add and remove, empty entries left out of what is stored.
import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';

const parse = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
const written = (rows: string[]) => rows.map((r) => r.trim()).filter(Boolean);

export function ListEditor({ label, value, onChange, max, maxChars, hint, addLabel, disabled }: {
  label: string;
  value: unknown;
  onChange: (next: string[] | undefined) => void;
  max: number;
  maxChars: number;
  hint?: string;
  addLabel: string;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<string[]>(() => parse(value));
  const emitted = useRef(JSON.stringify(written(parse(value))));

  // Take a value that changed from outside; ignore the echo of our own edit.
  useEffect(() => {
    if (JSON.stringify(written(parse(value))) !== emitted.current) {
      setRows(parse(value));
      emitted.current = JSON.stringify(written(parse(value)));
    }
  }, [value]);

  function update(next: string[]) {
    setRows(next);
    const out = written(next);
    emitted.current = JSON.stringify(out);
    onChange(out.length ? out : undefined);
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {rows.map((r, i) => (
        <div key={i} className="flex items-end gap-2">
          <TextField className="flex-1" label={<span className="sr-only">{label} {i + 1}</span>} value={r} maxLength={maxChars}
            onChange={(e) => update(rows.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} className="max-sm:size-11" onClick={() => update(rows.filter((_, j) => j !== i))}>
            <X aria-hidden="true" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={rows.length >= max} onClick={() => setRows([...rows, ''])}>
          <Plus aria-hidden="true" /> {addLabel}
        </Button>
        {hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}
      </div>
    </fieldset>
  );
}
