// The rows of an info block (When / Where / Book on ...): each row a label from the engine's fixed list and one short line, add and remove.
// A row is added by tapping its label in the row of chips below (each label is offered once); a row's label stays as added, and
// removing the row gives the label back. Rows without words are left out of what is stored. The server and the preview stay the
// authority.
import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';

export interface InfoRow { key: string; value: string }
const parse = (value: unknown): InfoRow[] => (Array.isArray(value) ? value.filter((r): r is InfoRow => !!r && typeof r === 'object' && typeof (r as InfoRow).key === 'string').map((r) => ({ key: r.key, value: typeof r.value === 'string' ? r.value : '' })) : []);
const written = (rows: InfoRow[]) => rows.filter((r) => r.value.trim()).map((r) => ({ key: r.key, value: r.value.trim() }));
const LABEL = 'flex h-9 w-[7.5rem] shrink-0 items-center truncate rounded-md bg-muted px-2.5 text-[13px] font-medium max-sm:h-11 max-sm:w-[6.5rem]';

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
  const box = useRef<HTMLFieldSetElement>(null);
  // The new row's words are typed next, so the cursor goes there.
  function add(key: string) {
    setRows([...rows, { key, value: '' }]);
    requestAnimationFrame(() => { const inputs = box.current?.querySelectorAll('input'); inputs?.[inputs.length - 1]?.focus(); });
  }
  const free = (except?: string) => keys.filter((k) => k === except || !rows.some((r) => r.key === k));
  return (
    <fieldset ref={box} className="flex min-w-0 flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">Info rows <span className="font-normal text-muted-foreground">({min} to {max}, such as When and Where)</span></legend>
      {rows.map((r, i) => (
        <div key={i} className="flex items-end gap-2">
          <span className={LABEL} aria-hidden="true">{r.key}</span>
          <TextField className="flex-1" label={<span className="sr-only">{r.key} (row {i + 1})</span>} value={r.value} maxLength={maxChars}
            onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove the ${r.key} row`} className="max-sm:size-11" onClick={() => update(rows.filter((_, j) => j !== i))}><X aria-hidden="true" /></Button>
        </div>
      ))}
      {rows.length < max && free().length > 0 && (
        <div role="group" aria-label="Add a row" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[12.5px] text-muted-foreground" aria-hidden="true">Add</span>
          {free().map((k) => (
            <Button key={k} type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[12.5px] max-sm:min-h-11" aria-label={`Add a ${k} row`} onClick={() => add(k)}>
              <Plus className="size-3.5" aria-hidden="true" />{k}
            </Button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
