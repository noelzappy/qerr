// The rows of an info block (When / Where / Book on ...): each row a label from the engine's fixed list and one short line, add and remove.
// Rows without words are left out of what is stored; a label is offered once. The server and the preview stay the authority.
import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';

export interface InfoRow { key: string; value: string }
const parse = (value: unknown): InfoRow[] => (Array.isArray(value) ? value.filter((r): r is InfoRow => !!r && typeof r === 'object' && typeof (r as InfoRow).key === 'string').map((r) => ({ key: r.key, value: typeof r.value === 'string' ? r.value : '' })) : []);
const written = (rows: InfoRow[]) => rows.filter((r) => r.value.trim()).map((r) => ({ key: r.key, value: r.value.trim() }));
const SELECT = 'h-9 w-[8.5rem] shrink-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 max-sm:h-11';

export function InfoEditor({ value, onChange, keys, min, max, maxChars, disabled }: {
  value: unknown; onChange: (next: InfoRow[] | undefined) => void; keys: string[]; min: number; max: number; maxChars: number; disabled?: boolean;
}) {
  const [rows, setRows] = useState<InfoRow[]>(() => parse(value));
  const emitted = useRef(JSON.stringify(written(parse(value))));
  useEffect(() => {
    if (JSON.stringify(written(parse(value))) !== emitted.current) { setRows(parse(value)); emitted.current = JSON.stringify(written(parse(value))); }
  }, [value]);
  function update(next: InfoRow[]) {
    setRows(next);
    const out = written(next);
    emitted.current = JSON.stringify(out);
    onChange(out.length ? out : undefined);
  }
  const free = (except?: string) => keys.filter((k) => k === except || !rows.some((r) => r.key === k));
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">Info rows <span className="font-normal text-muted-foreground">({min} to {max}, such as When and Where)</span></legend>
      {rows.map((r, i) => (
        <div key={i} className="flex items-end gap-2">
          <select aria-label={`Label of row ${i + 1}`} className={SELECT} value={r.key} onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}>
            {free(r.key).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <TextField className="flex-1" label={<span className="sr-only">Words of row {i + 1}</span>} value={r.value} maxLength={maxChars}
            onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove row ${i + 1}`} className="max-sm:size-11" onClick={() => update(rows.filter((_, j) => j !== i))}><X aria-hidden="true" /></Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={rows.length >= max || !free().length} onClick={() => setRows([...rows, { key: free()[0]!, value: '' }])}>
          <Plus aria-hidden="true" /> Add a row
        </Button>
      </div>
    </fieldset>
  );
}
