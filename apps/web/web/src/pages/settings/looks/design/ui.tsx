// Small pieces of the design editor's right pane: chips chosen like radio buttons, toggle chips, a group with a "Fine-tune" disclosure,
// and an inline number. Quiet, compact and neutral: colour is for the chosen chip and for problems only.
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Hint } from '@/components/kit';
import { cn } from '@/lib/utils';
import { coerceProp } from '../design-model';
import type { Desc, LookCatalogue } from '../look-types';

export const Custom = () => <span className="rounded-full border px-2 py-px text-[11.5px] font-medium text-muted-foreground">Custom</span>;

const CHIP = 'inline-flex h-7 items-center rounded-full border bg-background px-2.5 text-[12.5px] font-medium outline-none transition-colors hover:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 max-sm:h-9';
const ON = 'border-primary bg-primary/10 text-foreground ring-1 ring-primary';

// One choice among a few. `value` null: none is chosen (when `custom`, a "Custom" mark says the values fit none). Writes nothing itself.
export function Chips<T extends string>({ label, value, options, onChange, disabled, custom }: {
  label: string; value: T | null; options: Array<{ value: T; label: ReactNode; title?: string; disabled?: boolean }>; onChange: (v: T) => void; disabled?: boolean; custom?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title} disabled={disabled || o.disabled}
          className={cn(CHIP, o.value === value && ON)} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
      {custom && value === null && <Custom />}
    </div>
  );
}

// A chip that is on or off.
export function ToggleChip({ on, onClick, disabled, children, title }: { on: boolean; onClick: () => void; disabled?: boolean; children: ReactNode; title?: string }) {
  return <button type="button" aria-pressed={on} title={title} disabled={disabled} className={cn(CHIP, on && ON)} onClick={onClick}>{children}</button>;
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return <div className="flex min-h-5 items-center gap-1 text-[12.5px] font-medium text-muted-foreground">{children}{hint && <Hint about={children}>{hint}</Hint>}</div>;
}

// A group of the pane: a small title, its choices, and a "Fine-tune" disclosure (closed) holding the exact values. `force` opens it (a problem on a hidden value).
export function Group({ title, hint, children, fine, force, summary }: { title: string; hint?: ReactNode; children?: ReactNode; fine?: ReactNode; force?: boolean; summary?: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (force) setOpen(true); }, [force]);
  return (
    <section aria-label={title} className="flex flex-col gap-1.5 border-t pt-2.5 first:border-t-0 first:pt-0">
      <div className="flex min-h-6 items-center gap-1">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {hint && <Hint about={title}>{hint}</Hint>}
        {fine && (
          <button type="button" aria-expanded={open} aria-label={`Fine-tune ${title.toLowerCase()}`} onClick={() => setOpen(!open)}
            className="ml-auto inline-flex h-6 items-center gap-0.5 rounded px-1 text-[12px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:h-9">
            Fine-tune <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
      {!children && summary && <p className="text-[12.5px] text-muted-foreground">{summary}</p>}
      {fine && open && <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-2.5">{fine}</div>}
    </section>
  );
}

// "More" style disclosures: a button with a one-line summary beside it, the content below when open.
export function Disclosure({ title, summary, children, force }: { title: string; summary?: ReactNode; children: ReactNode; force?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (force) setOpen(true); }, [force]);
  return (
    <section aria-label={title} className="flex flex-col gap-2 border-t pt-2.5">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-6 min-w-0 items-center gap-1 rounded text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-9">
        <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden="true" />
        <span className="text-[13px] font-semibold">{title}</span>
        {summary && !open && <span className="min-w-0 truncate text-[12px] text-muted-foreground">{summary}</span>}
      </button>
      {open && <div className="flex flex-col gap-3">{children}</div>}
    </section>
  );
}

// The span a fine-tune control takes in its two-column grid: short values share a row, everything with its own panel is full width.
export const spanOf = (d: Desc): string => (['number', 'enum', 'bool', 'text', 'field'].includes(d.kind) ? '' : 'col-span-2');

// A number written in place, without a label of its own (the column header names it). Never clamps: a value out of range is reported.
export function InlineNumber({ ariaLabel, value, desc, onChange, onError, disabled, className }: {
  ariaLabel: string; value: unknown; desc: Desc; onChange: (v: number) => string; onError: (m: string) => void; disabled?: boolean; className?: string;
}) {
  const shown = typeof value === 'number' ? String(value) : '';
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => { setText((cur) => (cur.trim() !== '' && Number(cur) === value ? cur : shown)); setBad(false); }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const range = typeof desc.min === 'number' && typeof desc.max === 'number' ? `${desc.min} to ${desc.max}` : undefined;
  return (
    <input type="number" inputMode="numeric" aria-label={ariaLabel} title={range} min={desc.min} max={desc.max} step={desc.step ?? 1} value={text} disabled={disabled} aria-invalid={bad || undefined}
      className={cn('h-7 w-16 rounded-md border bg-background px-1.5 text-right text-[13px] tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 max-sm:h-10 max-sm:text-base', bad && 'border-destructive', className)}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') { setBad(true); onError('Enter a number'); return; }
        const r = coerceProp({ ...desc, kind: 'number' }, t, { lists: {} } as unknown as LookCatalogue);
        if ('error' in r) { setBad(true); onError(r.error); return; }
        const why = onChange(r.value as number);
        setBad(!!why);
        onError(why);
      }} />
  );
}
