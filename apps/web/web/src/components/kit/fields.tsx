// Labelled form controls: text input, textarea, select, checkbox and switch, and two ways to group them. Each wires its
// label, hint and error to the control for screen readers. Use these (not a bare <Input>) in forms.
import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { fromSelectValue, toSelectValue } from '@/lib/select-value';
import { cn } from '@/lib/utils';

interface FieldExtras {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
}

function describedBy(base: string, hint: unknown, error: unknown) {
  const hintId = hint ? `${base}-hint` : undefined;
  const errorId = error ? `${base}-error` : undefined;
  return { hintId, errorId, describedBy: [hintId, errorId].filter(Boolean).join(' ') || undefined };
}

// The label, control slot, hint and error. `id` must be the id of the control placed in `children`.
function FormField({ id, label, hint, error, optional, hintId, errorId, children, className }: FieldExtras & { id: string; hintId?: string; errorId?: string; children: ReactNode; className?: string }) {
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

export function TextAreaField({ label, hint, error, optional, className, mono, ...rest }: FieldExtras & TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  const id = useId();
  const d = describedBy(id, hint, error);
  return (
    <FormField id={id} label={label} hint={hint} error={error} optional={optional} hintId={d.hintId} errorId={d.errorId} className={className}>
      <Textarea {...rest} id={id} className={cn('max-sm:text-base', mono && 'font-mono text-[13px]')} aria-invalid={error ? true : undefined} aria-describedby={d.describedBy} />
    </FormField>
  );
}

interface Option { value: string; label: string }

export function SelectField({ label, value, onValueChange, options, placeholder, hint, error, disabled, optional, className }: FieldExtras & {
  value: string;
  onValueChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const d = describedBy(id, hint, error);
  return (
    <FormField id={id} label={label} hint={hint} error={error} optional={optional} hintId={d.hintId} errorId={d.errorId} className={className}>
      <Select value={toSelectValue(value, options)} onValueChange={(v) => onValueChange(fromSelectValue(v))} disabled={disabled}>
        <SelectTrigger id={id} className="w-full max-sm:h-11 max-sm:text-base" aria-invalid={error ? true : undefined} aria-describedby={d.describedBy}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((o) => <SelectItem key={o.value} value={toSelectValue(o.value, [o])}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </FormField>
  );
}

// A switch with its label beside it, and an optional hint under the label. The whole row is the tap target.
function ToggleRow({ control, id, label, hint, hintId, className }: { control: ReactNode; id: string; label: ReactNode; hint?: ReactNode; hintId?: string; className?: string }) {
  return (
    <div className={cn('flex items-start gap-3 max-sm:min-h-11', className)}>
      <div className="pt-0.5">{control}</div>
      <div className="min-w-0">
        <Label htmlFor={id} className="leading-5">{label}</Label>
        {hint && <p className="mt-0.5 text-[13px] text-muted-foreground" id={hintId}>{hint}</p>}
      </div>
    </div>
  );
}

// A checkbox with its label beside it and an optional hint under the label. Compact enough to stack in a list of options
// (the networks on a post); on a phone the box grows and the row is a 44 px tap target.
export function CheckField({ label, hint, checked, onCheckedChange, disabled, className }: { label: ReactNode; hint?: ReactNode; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; className?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex items-start gap-2.5 max-sm:min-h-11 max-sm:items-center', className)}>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onCheckedChange(v === true)} className="mt-0.5 max-sm:size-5" aria-describedby={hintId} />
      <div className="min-w-0">
        <Label htmlFor={id} className="leading-snug">{label}</Label>
        {hint && <p id={hintId} className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function SwitchField({ label, hint, checked, onCheckedChange, disabled, className }: { label: ReactNode; hint?: ReactNode; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; className?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <ToggleRow id={id} label={label} hint={hint} hintId={hintId} className={className}
      control={<Switch id={id} checked={checked} disabled={disabled} aria-describedby={hintId} onCheckedChange={onCheckedChange} />} />
  );
}

// A bordered section of related fields under a legend.
export function FieldGroup({ legend, hint, error, children, className }: { legend: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-3 rounded-lg border p-4', className)}>
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      {hint && <p className="-mt-1 text-[13px] text-muted-foreground">{hint}</p>}
      {children}
      {error && <p className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
    </fieldset>
  );
}

// A few choices side by side (for example one CheckField per network) under a legend, with one error for the set.
export function FieldSet({ legend, error, children }: { legend: string; error?: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1">{children}</div>
      {error && <p className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
    </fieldset>
  );
}
