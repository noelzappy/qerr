// A list as a Table from the md breakpoint up and as cards on a phone. Columns are described once; the card shows the
// primary cell as its heading, every other cell with its column name, and the actions cell last.
import type { ReactNode } from 'react';
import { SelectBox } from '@/components/bulk-bar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface Col<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  // The card heading on a phone, shown without its column name.
  primary?: boolean;
  // Buttons: right aligned, header hidden from view but still read out.
  actions?: boolean;
}

// Optional tick boxes: a column on the table, a box on each card, and "Select all shown" above the cards on a phone.
export interface RowSelect<T> {
  isSelected: (row: T) => boolean;
  onToggle: (row: T, range: boolean) => void;
  allSelected: boolean;
  onToggleAll: () => void;
  // Names the row for a screen reader, for example its title.
  label: (row: T) => string;
}

export function DataList<T>({ columns, rows, rowKey, caption, select }: { columns: Col<T>[]; rows: T[]; rowKey: (row: T) => string; caption: string; select?: RowSelect<T> }) {
  const primary = columns.find((c) => c.primary) ?? columns[0]!;
  const actions = columns.find((c) => c.actions);
  const rest = columns.filter((c) => c !== primary && c !== actions);
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              {select && (
                <TableHead scope="col" className="w-10 px-3.5">
                  <SelectBox checked={select.allSelected} label="Select all shown" onToggle={select.onToggleAll} />
                </TableHead>
              )}
              {columns.map((c) => (
                <TableHead key={c.key} scope="col" className="h-10 px-3.5 font-mono text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
                  {c.actions ? <span className="sr-only">{c.header}</span> : c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} data-state={select?.isSelected(row) ? 'selected' : undefined}>
                {select && (
                  <TableCell className="w-10 px-3.5 py-3 align-top">
                    <SelectBox checked={select.isSelected(row)} label={`Select ${select.label(row)}`} onToggle={(range) => select.onToggle(row, range)} />
                  </TableCell>
                )}
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.actions ? 'whitespace-nowrap px-3.5 py-3 text-right' : 'whitespace-normal px-3.5 py-3 align-top [overflow-wrap:anywhere]'}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {select && (
        <div className="flex items-center gap-3 border-b bg-muted/60 px-4 py-3 md:hidden">
          <SelectBox checked={select.allSelected} label="Select all shown" onToggle={select.onToggleAll} />
          <span className="text-sm font-medium" aria-hidden="true">Select all shown</span>
        </div>
      )}
      <ul className="divide-y md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className={`flex flex-col gap-2 px-4 py-3.5 ${select?.isSelected(row) ? 'bg-muted/50' : ''}`}>
            <div className="flex min-w-0 items-start gap-3">
              {select && <SelectBox className="mt-1.5" checked={select.isSelected(row)} label={`Select ${select.label(row)}`} onToggle={(range) => select.onToggle(row, range)} />}
              <div className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">{primary.cell(row)}</div>
            </div>
            <dl className="flex flex-col gap-1.5">
              {rest.map((c) => (
                <div key={c.key} className="flex items-start justify-between gap-3">
                  <dt className="flex-none pt-0.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{c.header}</dt>
                  <dd className="min-w-0 text-right [overflow-wrap:anywhere]">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
            {actions && <div className="flex flex-wrap gap-2 pt-1">{actions.cell(row)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
