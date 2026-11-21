// Small pieces the batch pages share, all built from the shadcn components: a page header, status badges, states,
// a button that can show it is busy, labelled form fields, a confirm dialog and rows that turn into cards.
import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge as UiBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Notice } from '@/components/notice';
import { describedBy, FormField } from '@/components/text-field';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'quiet';

const VARIANT = { good: 'success', warn: 'warning', bad: 'destructive', info: 'info', quiet: 'quiet' } as const;
const DOT = { good: 'bg-success', warn: 'bg-warning', bad: 'bg-destructive', info: 'bg-info', quiet: 'bg-muted-foreground' } as const;

export function ToneBadge({ tone = 'quiet', dot = false, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <UiBadge variant={VARIANT[tone]} className={cn(tone === 'bad' && 'bg-destructive/12 text-destructive dark:bg-destructive/20', className)}>
      {dot && <span className={cn('size-1.5 rounded-full', DOT[tone])} aria-hidden="true" />}
      {children}
    </UiBadge>
  );
}

export function StatusBadge<S extends string>({ status, map }: { status: S; map: Record<S, { tone: Tone; label: string }> }) {
  const m = map[status] ?? { tone: 'quiet' as Tone, label: status };
  return <ToneBadge tone={m.tone} dot>{m.label}</ToneBadge>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-[72ch] flex-1 basis-80">
        <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] max-sm:text-[23px]">{title}</h1>
        {description && <div className="mt-1.5 text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </header>
  );
}

// A button that shows a spinner and is disabled while its work runs. Phones get a 44 px tap target.
type ButtonProps = ComponentProps<typeof Button>;
export function BusyButton({ loading = false, disabled, className, children, type = 'button', ...rest }: ButtonProps & { loading?: boolean }) {
  return (
    <Button {...rest} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cn('max-sm:min-h-11', className)}>
      {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  );
}

export function Spin({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-primary', className)} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-5" style={{ width: `${95 - ((i * 17) % 40)}%` }} />)}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-11 text-center text-muted-foreground">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {children && <p className="max-w-[46ch]">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, title = 'This could not be loaded' }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-11 text-center text-muted-foreground" role="alert">
      <h3 className="text-base font-semibold text-destructive">{title}</h3>
      <p className="max-w-[46ch]">{message}</p>
      {onRetry && <BusyButton variant="outline" onClick={onRetry}>Try again</BusyButton>}
    </div>
  );
}

// Lists of problem lines inside a notice.
export function Lines({ items, className }: { items: string[]; className?: string }) {
  return <ul className={cn('mt-1.5 list-disc space-y-1 pl-[18px]', className)}>{items.map((l, i) => <li key={i} className="[overflow-wrap:anywhere]">{l}</li>)}</ul>;
}

export function FormProblem({ error, lines }: { error: string; lines?: string[] }) {
  if (!error) return null;
  return (
    <Notice tone="bad">
      {error}
      {lines && lines.length > 0 && <Lines items={lines} className="max-h-64 overflow-y-auto" />}
    </Notice>
  );
}

// ---- Form fields -------------------------------------------------------------------------------------------------

export function TextAreaField({ label, hint, error, optional, className, mono, ...rest }: { label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; mono?: boolean } & ComponentProps<typeof Textarea>) {
  const id = useId();
  const d = describedBy(id, hint, error);
  return (
    <FormField id={id} label={label} hint={hint} error={error} optional={optional} hintId={d.hintId} errorId={d.errorId}>
      <Textarea {...rest} id={id} className={cn('max-sm:text-base', mono && 'font-mono text-[13px]', className)} aria-invalid={error ? true : undefined} aria-describedby={d.describedBy} />
    </FormField>
  );
}

// An empty string cannot be a Radix Select value, so it travels as this word.
const NONE = '__none__';
export interface Option { value: string; label: string }

export function SelectField({ label, hint, error, optional, value, onValueChange, options, disabled, className }: {
  label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; value: string; onValueChange: (v: string) => void;
  options: Option[]; disabled?: boolean; className?: string;
}) {
  const id = useId();
  const d = describedBy(id, hint, error);
  return (
    <FormField id={id} label={label} hint={hint} error={error} optional={optional} hintId={d.hintId} errorId={d.errorId} className={className}>
      <Select value={value === '' ? NONE : value} onValueChange={(v) => onValueChange(v === NONE ? '' : v)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full max-sm:h-11 max-sm:text-base" aria-invalid={error ? true : undefined} aria-describedby={d.describedBy}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((o) => <SelectItem key={o.value} value={o.value === '' ? NONE : o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </FormField>
  );
}

export function CheckField({ label, hint, checked, onCheckedChange, disabled, className }: {
  label: ReactNode; hint?: ReactNode; checked: boolean; onCheckedChange: (c: boolean) => void; disabled?: boolean; className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2.5 max-sm:min-h-11 max-sm:items-center', className)}>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(c) => onCheckedChange(c === true)} className="mt-0.5 max-sm:size-5" aria-describedby={hint ? `${id}-hint` : undefined} />
      <div className="min-w-0">
        <Label htmlFor={id} className="leading-snug">{label}</Label>
        {hint && <p id={`${id}-hint`} className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function FieldSet({ legend, error, children }: { legend: string; error?: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1">{children}</div>
      {error && <p className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
    </fieldset>
  );
}

// ---- Surfaces ----------------------------------------------------------------------------------------------------

// Runs onConfirm; if it throws, the reason is shown inside the dialog, which stays open so nothing is lost.
export function ConfirmAction({ open, title, message, confirmLabel, danger = false, confirmDisabled = false, onConfirm, onCancel }: {
  open: boolean; title: string; message: ReactNode; confirmLabel: string; danger?: boolean; confirmDisabled?: boolean;
  onConfirm: () => Promise<unknown> | unknown; onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const cancel = () => { setError(''); onCancel(); };
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) cancel(); }}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild><div className="[overflow-wrap:anywhere]">{message}</div></AlertDialogDescription>
        </AlertDialogHeader>
        {error && <Notice tone="bad">{error}</Notice>}
        <AlertDialogFooter className="max-sm:[&>*]:min-h-11">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {/* preventDefault keeps the dialog open so a failure can be shown in it; the caller closes it on success. */}
          <BusyButton variant={danger ? 'destructive' : 'default'} loading={busy} disabled={confirmDisabled} onClick={(e) => { e.preventDefault(); void go(); }}>{confirmLabel}</BusyButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---- Rows: a table when there is room, a stack of cards when there is not -----------------------------------------

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  // The first thing on a card, shown without its label.
  primary?: boolean;
  // Buttons: the header is only read out, and on a card they sit last.
  actions?: boolean;
}

// The container, not the screen, decides: inside a narrow column the rows stack even on a wide screen.
export function DataRows<T>({ columns, rows, rowKey, caption }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; caption: string }) {
  const primary = columns.find((c) => c.primary);
  const rest = columns.filter((c) => !c.primary && !c.actions);
  const actions = columns.find((c) => c.actions);
  return (
    <div className="@container min-w-0">
      <div className="hidden @[720px]:block">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              {columns.map((c) => (
                <TableHead key={c.key} scope="col" className="h-10 px-3.5 font-mono text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
                  {c.actions ? <span className="sr-only">{c.header}</span> : c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} className="align-top">
                {columns.map((c) => <TableCell key={c.key} className={cn('whitespace-normal px-3.5 py-3 align-top [overflow-wrap:anywhere]', c.actions && 'text-right')}>{c.cell(row)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="divide-y @[720px]:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className="flex flex-col gap-1.5 px-4 py-3.5">
            {primary && <div className="min-w-0 font-semibold [overflow-wrap:anywhere]">{primary.cell(row)}</div>}
            {rest.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3 text-right [overflow-wrap:anywhere]">
                <span className="max-w-[40%] flex-none pt-0.5 text-left font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{c.header}</span>
                <div className="min-w-0">{c.cell(row)}</div>
              </div>
            ))}
            {actions && <div className="pt-1">{actions.cell(row)}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// A small line of grey text under a name: ids, time zones, who made it.
export function Sub({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <span className={cn('block text-[13px] font-normal text-muted-foreground [overflow-wrap:anywhere]', mono && 'font-mono text-xs')}>{children}</span>;
}
