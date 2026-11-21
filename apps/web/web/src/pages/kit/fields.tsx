// Labelled controls for forms: select, textarea, checkbox, switch and a fieldset. Each wires its label, hint and error to
// the control. Text inputs use components/text-field.
import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { describedBy, FormField, type FieldExtras } from '@/components/text-field';
import { cn } from '@/lib/utils';

export interface Option { value: string; label: string }
// Radix Select cannot hold an item whose value is the empty string, so "none" travels as this word.
const EMPTY = '__none__';

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
      <Select value={value === '' ? EMPTY : value} onValueChange={(v) => onValueChange(v === EMPTY ? '' : v)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full max-sm:h-11 max-sm:text-base" aria-invalid={error ? true : undefined} aria-describedby={d.describedBy}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value === '' ? EMPTY : o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </FormField>
  );
}

export function TextAreaField({ label, hint, error, optional, className, ...rest }: FieldExtras & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const d = describedBy(id, hint, error);
  return (
    <FormField id={id} label={label} hint={hint} error={error} optional={optional} hintId={d.hintId} errorId={d.errorId} className={className}>
      <Textarea {...rest} id={id} className="max-sm:text-base" aria-invalid={error ? true : undefined} aria-describedby={d.describedBy} />
    </FormField>
  );
}

// A checkbox or switch with its label beside it, and an optional hint under the label. The whole row is the tap target.
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

export function CheckField({ label, hint, checked, onCheckedChange, disabled, className }: { label: ReactNode; hint?: ReactNode; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; className?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <ToggleRow id={id} label={label} hint={hint} hintId={hintId} className={className}
      control={<Checkbox id={id} checked={checked} disabled={disabled} aria-describedby={hintId} onCheckedChange={(v) => onCheckedChange(v === true)} />} />
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
