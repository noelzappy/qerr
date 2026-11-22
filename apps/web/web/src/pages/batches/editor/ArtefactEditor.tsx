// The forms for a table or card of a Text layout (ledger table, passbook page, member card), and for the same pieces when they
// are a page of their own. Every limit is the design checker's own (spec.mjs, figures.mjs); an unknown key is kept as it is.
import type { ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { SelectField, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ChoiceRow } from './ChoiceRow';
import { ListEditor } from './ListEditor';
import type { Json } from './types';

// The same numbers as LIMITS in packages/engine/lib/design/figures.mjs (the web app cannot import the engine).
const LEDGER = { minCols: 2, maxCols: 5, minRows: 1, maxRows: 10, maxCell: 16, maxLabel: 16, maxNotes: 2, maxNote: 60, maxMarks: 10 };
const REGISTER = { minRows: 1, maxRows: 6, maxTitle: 26, maxLabel: 17, maxValue: 8 };
const PASSBOOK = { minDays: 28, maxDays: 31 };

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
const int = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isInteger(v) ? v : fallback);
// A copy of an object without one key, or with it set.
const without = (o: Json, key: string): Json => { const { [key]: _gone, ...rest } = o; return rest; };

// A small select with no visible label, for places where a labelled field is too heavy (one per cell). The kit's select, named
// by `label` for screen readers. Every value here is a non-empty word or number.
function MiniSelect({ label, value, onChange, options, disabled, className }: {
  label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean; className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className={cn('w-full min-w-0 max-sm:h-11', className)}><SelectValue /></SelectTrigger>
      <SelectContent position="popper">
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function RemoveButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} disabled={disabled} className="shrink-0 max-sm:size-11" onClick={onClick}><X aria-hidden="true" /></Button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      {hint && <p className="-mt-1 text-[13px] text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

// ---- Ledger table ----

interface Column { label: string; align: 'start' | 'end' }
interface Mark { row: number; col: number }

const readColumns = (v: unknown): Column[] => (Array.isArray(v) ? v : []).map((c) => ({ label: text(isObj(c) ? c.label : ''), align: isObj(c) && c.align === 'end' ? 'end' : 'start' }));
const readRows = (v: unknown, cols: number): string[][] => (Array.isArray(v) ? v : []).map((r) => Array.from({ length: cols }, (_, j) => text(Array.isArray(r) ? r[j] : '')));
const readMarks = (v: unknown): Mark[] => (Array.isArray(v) ? v : []).filter(isObj).map((m) => ({ row: int(m.row, 0), col: int(m.col, 0) }));

export function LedgerFields({ value, onChange, disabled }: { value: Json; onChange: (next: Json) => void; disabled?: boolean }) {
  const columns = readColumns(value.columns);
  const rows = readRows(value.rows, columns.length);
  const marks = readMarks(value.mark);
  const rowOptions = range(0, rows.length - 1).map((i) => ({ value: String(i), label: `Row ${i + 1}` }));
  const colOptions = columns.map((c, j) => ({ value: String(j), label: c.label.trim() ? `Column ${j + 1}: ${c.label}` : `Column ${j + 1}` }));

  // Writes the table back: marks outside it are dropped, and the keys that are empty are left out.
  function emit(next: { columns?: Column[]; rows?: string[][]; mark?: Mark[] }) {
    const cols = next.columns ?? columns, rws = next.rows ?? rows;
    const mark = (next.mark ?? marks).filter((m) => m.row >= 0 && m.row < rws.length && m.col >= 0 && m.col < cols.length);
    const out: Json = { ...value, columns: cols, rows: rws };
    if (mark.length) out.mark = mark; else delete out.mark;
    onChange(out);
  }
  const setCell = (i: number, j: number, v: string) => emit({ rows: rows.map((r, a) => (a === i ? r.map((c, b) => (b === j ? v : c)) : r)) });
  const setColumn = (j: number, patch: Partial<Column>) => emit({ columns: columns.map((c, b) => (b === j ? { ...c, ...patch } : c)) });
  const addColumn = () => emit({ columns: [...columns, { label: `Column ${columns.length + 1}`, align: 'end' }], rows: rows.map((r) => [...r, '']) });
  const removeColumn = (j: number) => emit({
    columns: columns.filter((_, b) => b !== j),
    rows: rows.map((r) => r.filter((_, b) => b !== j)),
    mark: marks.filter((m) => m.col !== j).map((m) => (m.col > j ? { ...m, col: m.col - 1 } : m)),
  });
  const addRow = () => emit({ rows: [...rows, columns.map(() => '')] });
  const removeRow = (i: number) => emit({
    rows: rows.filter((_, a) => a !== i),
    mark: marks.filter((m) => m.row !== i).map((m) => (m.row > i ? { ...m, row: m.row - 1 } : m)),
  });
  const setMark = (k: number, patch: Partial<Mark>) => emit({ mark: marks.map((m, a) => (a === k ? { ...m, ...patch } : m)) });

  const grid = { gridTemplateColumns: `repeat(${columns.length}, minmax(7.5rem, 1fr)) 2.75rem` };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Section title="Table" hint="Keep cells short; the preview says if the table is too wide.">
        <div className="overflow-x-auto pb-1">
          <div className="grid min-w-max items-center gap-2" style={grid}>
            {columns.map((c, j) => <Input key={`l${j}`} aria-label={`Column ${j + 1} label`} placeholder="Column label" value={c.label} maxLength={LEDGER.maxLabel} disabled={disabled} className="font-medium max-sm:h-11" onChange={(e) => setColumn(j, { label: e.target.value })} />)}
            <span aria-hidden="true" />
            {columns.map((c, j) => (
              <div key={`a${j}`} className="flex items-center gap-1">
                <MiniSelect label={`Column ${j + 1} alignment`} value={c.align} disabled={disabled} onChange={(v) => setColumn(j, { align: v === 'end' ? 'end' : 'start' })} options={[{ value: 'start', label: 'Left' }, { value: 'end', label: 'Right' }]} />
                <RemoveButton label={`Remove column ${j + 1}`} disabled={disabled || columns.length <= LEDGER.minCols} onClick={() => removeColumn(j)} />
              </div>
            ))}
            <span aria-hidden="true" />
            {rows.map((r, i) => [
              ...r.map((cell, j) => <Input key={`c${i}-${j}`} aria-label={`Row ${i + 1}, column ${j + 1}`} value={cell} maxLength={LEDGER.maxCell} disabled={disabled} className="max-sm:h-11" onChange={(e) => setCell(i, j, e.target.value)} />),
              <RemoveButton key={`x${i}`} label={`Remove row ${i + 1}`} disabled={disabled || rows.length <= LEDGER.minRows} onClick={() => removeRow(i)} />,
            ])}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={disabled || rows.length >= LEDGER.maxRows} onClick={addRow}><Plus aria-hidden="true" /> Add a row</Button>
          <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={disabled || columns.length >= LEDGER.maxCols} onClick={addColumn}><Plus aria-hidden="true" /> Add a column</Button>
        </div>
        <p className="text-[13px] text-muted-foreground">{LEDGER.minCols} to {LEDGER.maxCols} columns, {LEDGER.minRows} to {LEDGER.maxRows} rows, up to {LEDGER.maxCell} characters in a cell.</p>
      </Section>

      <Section title="Highlight cells" hint={`Cells that are circled, up to ${LEDGER.maxMarks}.`}>
        {marks.map((m, k) => (
          <div key={k} className="flex items-center gap-2">
            <MiniSelect label={`Highlighted cell ${k + 1}: row`} value={String(m.row)} disabled={disabled} onChange={(v) => setMark(k, { row: Number(v) })} options={rowOptions} />
            <MiniSelect label={`Highlighted cell ${k + 1}: column`} value={String(m.col)} disabled={disabled} onChange={(v) => setMark(k, { col: Number(v) })} options={colOptions} />
            <RemoveButton label={`Remove highlighted cell ${k + 1}`} disabled={disabled} onClick={() => emit({ mark: marks.filter((_, a) => a !== k) })} />
          </div>
        ))}
        <div><Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={disabled || marks.length >= LEDGER.maxMarks} onClick={() => emit({ mark: [...marks, { row: 0, col: 0 }] })}><Plus aria-hidden="true" /> Highlight a cell</Button></div>
      </Section>

      <ListEditor label="Notes" value={value.notes} max={LEDGER.maxNotes} maxChars={LEDGER.maxNote} addLabel="Add a note" hint="Up to two short lines under the table." disabled={disabled}
        onChange={(n) => onChange(n ? { ...value, notes: n } : without(value, 'notes'))} />
    </div>
  );
}

// ---- Member card ----

export function RegisterFields({ value, onChange, disabled }: { value: Json; onChange: (next: Json) => void; disabled?: boolean }) {
  const rows: Array<[string, string]> = (Array.isArray(value.rows) ? value.rows : []).map((r) => [text(Array.isArray(r) ? r[0] : ''), text(Array.isArray(r) ? r[1] : '')]);
  const mark = typeof value.mark === 'number' && Number.isInteger(value.mark) && value.mark >= 0 && value.mark < rows.length ? value.mark : undefined;

  function emit(nextRows: Array<[string, string]>, nextMark: number | undefined) {
    const out: Json = { ...value, rows: nextRows };
    if (nextMark !== undefined && nextMark >= 0 && nextMark < nextRows.length) out.mark = nextMark; else delete out.mark;
    onChange(out);
  }
  const setCell = (i: number, k: 0 | 1, v: string) => emit(rows.map((r, a) => (a === i ? (k === 0 ? [v, r[1]] : [r[0], v]) as [string, string] : r)), mark);
  const removeRow = (i: number) => emit(rows.filter((_, a) => a !== i), mark === undefined || mark === i ? undefined : mark > i ? mark - 1 : mark);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <TextField label="Card title" value={text(value.title)} maxLength={REGISTER.maxTitle} disabled={disabled}
        onChange={(e) => onChange(e.target.value ? { ...value, title: e.target.value } : without(value, 'title'))} />
      <Section title="Card rows" hint={`${REGISTER.minRows} to ${REGISTER.maxRows} rows. A label of up to ${REGISTER.maxLabel} characters and a short value of up to ${REGISTER.maxValue}.`}>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input aria-label={`Row ${i + 1} label`} placeholder="Label" value={r[0]} maxLength={REGISTER.maxLabel} disabled={disabled} className="min-w-0 flex-[2] max-sm:h-11" onChange={(e) => setCell(i, 0, e.target.value)} />
            <Input aria-label={`Row ${i + 1} value`} placeholder="Value" value={r[1]} maxLength={REGISTER.maxValue} disabled={disabled} className="min-w-0 flex-1 max-sm:h-11" onChange={(e) => setCell(i, 1, e.target.value)} />
            <RemoveButton label={`Remove card row ${i + 1}`} disabled={disabled || rows.length <= REGISTER.minRows} onClick={() => removeRow(i)} />
          </div>
        ))}
        <div><Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={disabled || rows.length >= REGISTER.maxRows} onClick={() => emit([...rows, ['', '']], mark)}><Plus aria-hidden="true" /> Add a row</Button></div>
      </Section>
      <SelectField label="Marked row" hint="The value of this row is underlined in gold." disabled={disabled} value={mark === undefined ? '' : String(mark)}
        onValueChange={(v) => emit(rows, v === '' ? undefined : Number(v))}
        options={[{ value: '', label: 'No marked row' }, ...rows.map((r, i) => ({ value: String(i), label: `Row ${i + 1}${r[0] ? `: ${r[0]}` : ''}` }))]} />
    </div>
  );
}

// ---- Passbook page ----

const newRegister = (): Json => ({ title: 'Where this record exists', rows: [['Member passbook', '1'], ['Office copy', '-']], mark: 0 });

export function PassbookFields({ value, onChange, disabled }: { value: Json; onChange: (next: Json) => void; disabled?: boolean }) {
  const days = Math.min(PASSBOOK.maxDays, Math.max(PASSBOOK.minDays, int(value.days, PASSBOOK.maxDays)));
  const ticked = Math.min(days, Math.max(0, int(value.ticked, 0)));
  const today = typeof value.today === 'number' && Number.isInteger(value.today) ? Math.min(days, Math.max(1, value.today)) : undefined;
  const tick = value.tick === 'gold' ? 'gold' : 'ink';

  function setDays(d: number) {
    const out: Json = { ...value, days: d };
    if (typeof value.ticked === 'number') out.ticked = Math.min(d, value.ticked);
    if (typeof value.today === 'number') out.today = Math.min(d, Math.max(1, value.today));
    onChange(out);
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceRow<number> legend="Days in the month" disabled={disabled} value={days} onChange={(v) => setDays(Number(v))} choices={range(PASSBOOK.minDays, PASSBOOK.maxDays).map((d) => ({ value: d, label: String(d) }))} />
        <SelectField label="Ticked days" hint="Days 1 to this number get a tick." disabled={disabled} value={String(ticked)} onValueChange={(v) => onChange({ ...value, ticked: Number(v) })} options={range(0, days).map((d) => ({ value: String(d), label: String(d) }))} />
        <SelectField label="Today" hint="The day that gets a heavy box." disabled={disabled} value={today === undefined ? '' : String(today)} onValueChange={(v) => onChange(v === '' ? without(value, 'today') : { ...value, today: Number(v) })}
          options={[{ value: '', label: 'No day marked' }, ...range(1, days).map((d) => ({ value: String(d), label: String(d) }))]} />
        <ChoiceRow<string> legend="Tick colour" disabled={disabled} value={tick} onChange={(v) => onChange({ ...value, tick: v })} choices={[{ value: 'ink', label: 'Dark ink' }, { value: 'gold', label: 'Gold' }]} />
      </div>
      {isObj(value.register) ? (
        <Section title="Member card">
          <RegisterFields value={value.register} disabled={disabled} onChange={(r) => onChange({ ...value, register: r })} />
          <div><Button type="button" variant="ghost" size="sm" className="max-sm:min-h-11" disabled={disabled} onClick={() => onChange(without(value, 'register'))}>Remove member card</Button></div>
        </Section>
      ) : (
        <div><Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={disabled} onClick={() => onChange({ ...value, register: newRegister() })}><Plus aria-hidden="true" /> Add a member card</Button></div>
      )}
    </div>
  );
}

// ---- The table or card of a Text layout ----

type ArtefactType = '' | 'ledger' | 'passbook' | 'register';

const START: Record<Exclude<ArtefactType, ''>, () => Json> = {
  ledger: () => ({ type: 'ledger', columns: [{ label: 'Day', align: 'start' }, { label: 'Amount', align: 'end' }], rows: [['Mon', '£10'], ['Tue', '£10']] }),
  passbook: () => ({ type: 'passbook', days: 31, ticked: 12, today: 13, tick: 'ink' }),
  register: () => ({ type: 'register', title: 'Where this record exists', rows: [["Member's passbook", '1'], ['Office copy', '-']], mark: 0 }),
};

export function ArtefactEditor({ value, onChange, disabled }: { value: unknown; onChange: (next: Json | undefined) => void; disabled?: boolean }) {
  const obj = isObj(value) ? value : undefined;
  const type: ArtefactType = obj && (obj.type === 'ledger' || obj.type === 'passbook' || obj.type === 'register') ? obj.type : '';
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ChoiceRow<ArtefactType> legend="Table or card" tip="Shown under the headline." disabled={disabled} value={type}
        onChange={(v) => { if (v !== type) onChange(v === '' ? undefined : START[v as Exclude<ArtefactType, ''>]()); }}
        choices={[{ value: '', label: 'None' }, { value: 'ledger', label: 'Ledger table' }, { value: 'passbook', label: 'Passbook page' }, { value: 'register', label: 'Member card' }]} />
      {obj && type === 'ledger' && <LedgerFields value={obj} onChange={onChange} disabled={disabled} />}
      {obj && type === 'passbook' && <PassbookFields value={obj} onChange={onChange} disabled={disabled} />}
      {obj && type === 'register' && <RegisterFields value={obj} onChange={onChange} disabled={disabled} />}
    </div>
  );
}
