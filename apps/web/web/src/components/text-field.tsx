// A labelled text input: label, optional hint and error text, all wired to the control for screen readers.
// Use this (not a bare <Input>) in forms. For a select, checkbox or switch put the control inside <FormField>.
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface FieldExtras {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
}

export function describedBy(base: string, hint: unknown, error: unknown) {
  const hintId = hint ? `${base}-hint` : undefined;
  const errorId = error ? `${base}-error` : undefined;
  return { hintId, errorId, describedBy: [hintId, errorId].filter(Boolean).join(' ') || undefined };
}

// The label, control slot, hint and error. `id` must be the id of the control placed in `children`.
export function FormField({ id, label, hint, error, optional, hintId, errorId, children, className }: FieldExtras & { id: string; hintId?: string; errorId?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}{optional && <span className="font-normal text-muted-foreground"> (optional)</span>}</Label>
      {children}
      {hint && <p className="text-[13px] text-muted-foreground" id={hintId}>{hint}</p>}
      {error && <p className="text-[13px] font-medium text-destructive" id={errorId} role="alert">{error}</p>}
    </div>
  );
}

export function TextField({ label, hint, error, optional, className, mono, ...rest }: FieldExtras & InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  const id = useId();
  const d = describedBy(id, hint, error);
  return (
    <FormField id={id} label={label} hint={hint} error={error} optional={optional} hintId={d.hintId} errorId={d.errorId} className={className}>
      <Input {...rest} id={id} className={cn('max-sm:h-11 max-sm:text-base', mono && 'font-mono text-sm')} aria-invalid={error ? true : undefined} aria-describedby={d.describedBy} />
    </FormField>
  );
}
