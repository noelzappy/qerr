// Labelled form controls: text input, textarea, select, checkbox and switch, and two ways to group them. Each wires its
// label, hint and error to the control for screen readers. Use these (not a bare <Input>) in forms.
//
// A hint is shown by an info icon beside the label (hintMode 'tip', the default) and is also in the page, visually hidden,
// for screen readers. Use hintMode="inline" only for a hint that must stay on screen: a warning, a consequence, or a
// "saved straight away" or safety statement. Errors are always inline.
import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { fromSelectValue, toSelectValue } from '@/lib/select-value';
import { cn } from '@/lib/utils';
import { Hint, textOf } from './hint';

interface FieldExtras {
  label: ReactNode;
  hint?: ReactNode;
  hintMode?: HintMode;
  error?: string;
  optional?: boolean;
}

export type HintMode = 'tip' | 'inline';

function describedBy(base: string, hint: unknown, error: unknown) {
  const hintId = hint ? `${base}-hint` : undefined;
  const errorId = error ? `${base}-error` : undefined;
  return { hintId, errorId, describedBy: [hintId, errorId].filter(Boolean).join(' ') || undefined };
}

// The hint beside a label (a tip) or under it (inline). Both give the control something to point aria-describedby at.
function HintTip({ about, hint, hintId, mode }: { about: ReactNode; hint: ReactNode; hintId?: string; mode: HintMode }) {
  if (!hint) return null;
  return mode === 'inline' ? null : <Hint about={about} id={hintId}>{hint}</Hint>;
}
function InlineHint({ hint, hintId, mode, className }: { hint: ReactNode; hintId?: string; mode: HintMode; className?: string }) {
  if (!hint || mode !== 'inline') return null;
  return <p className={cn('text-[12.5px] text-muted-foreground', className)} id={hintId}>{hint}</p>;
}

// The label, control slot, hint and error. `id` must be the id of the control placed in `children`.
function FormField({ id, label, hint, hintMode = 'tip', error, optional, hintId, errorId, children, className }: FieldExtras & { id: string; hintId?: string; errorId?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex min-h-5 items-center gap-1">
        <Label htmlFor={id}>{label}{optional && <span className="font-normal text-muted-foreground"> (optional)</span>}</Label>
        <HintTip about={label} hint={hint} hintId={hintId} mode={hintMode} />
      </div>
      {children}
      <InlineHint hint={hint} hintId={hintId} mode={hintMode} />
      {error && <p className="text-[12.5px] font-medium text-destructive" id={errorId} role="alert">{error}</p>}
    </div>
  );
}

export function TextField({ label, hint, hintMode, error, optional, className, mono, ...rest }: FieldExtras & InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  const id = useId();
  const d = describedBy(id, hint, error);
  return (
    <FormField id={id} label={label} hint={hint} hintMode={hintMode} error={error} optional={optional} hintId={d.hintId} errorId={d.errorId} className={className}>
      <Input {...rest} id={id} className={cn('max-sm:h-11 max-sm:text-base', mono && 'font-mono text-[13px]')} aria-invalid={error ? true : undefined} aria-describedby={d.describedBy} />
    </FormField>
  );
}

export function TextAreaField({ label, hint, hintMode, error, optional, className, mono, rows = 3, ...rest }: FieldExtras & TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  const id = useId();
  const d = describedBy(id, hint, error);
  return (
    <FormField id={id} label={label} hint={hint} hintMode={hintMode} error={error} optional={optional} hintId={d.hintId} errorId={d.errorId} className={className}>
      <Textarea {...rest} rows={rows} id={id} className={cn('max-sm:text-base', mono && 'font-mono text-[12.5px]')} aria-invalid={error ? true : undefined} aria-describedby={d.describedBy} />
    </FormField>
  );
}

interface Option { value: string; label: string }

export function SelectField({ label, value, onValueChange, options, placeholder, hint, hintMode, error, disabled, optional, className, hideLabel }: FieldExtras & {
  value: string;
  onValueChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  // A filter in a toolbar: the label is read out but not shown, so the row stays one line.
  hideLabel?: boolean;
}) {
  const id = useId();
  const d = describedBy(id, hint, error);
  if (hideLabel) {
    return (
      <div className={className}>
        <Select value={toSelectValue(value, options)} onValueChange={(v) => onValueChange(fromSelectValue(v))} disabled={disabled}>
          <SelectTrigger id={id} aria-label={textOf(label)} className="w-full max-sm:h-11 max-sm:text-base">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent position="popper">
            {options.map((o) => <SelectItem key={o.value} value={toSelectValue(o.value, [o])}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <FormField id={id} label={label} hint={hint} hintMode={hintMode} error={error} optional={optional} hintId={d.hintId} errorId={d.errorId} className={className}>
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

// A switch or checkbox with its label beside it, and an optional hint beside the label (a tip) or under it (inline).
function ToggleRow({ control, id, label, hint, hintMode = 'tip', hintId, className }: { control: ReactNode; id: string; label: ReactNode; hint?: ReactNode; hintMode?: HintMode; hintId?: string; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 max-sm:min-h-11 max-sm:items-center', className)}>
      <div className="pt-0.5 max-sm:pt-0">{control}</div>
      <div className="min-w-0">
        <div className="flex min-h-5 items-center gap-1">
          <Label htmlFor={id} className="leading-snug">{label}</Label>
          <HintTip about={label} hint={hint} hintId={hintId} mode={hintMode} />
        </div>
        <InlineHint hint={hint} hintId={hintId} mode={hintMode} className="mt-0.5" />
      </div>
    </div>
  );
}

// A checkbox with its label beside it. Compact enough to stack in a list of options (the networks on a post); on a phone
// the box grows and the row is a 44 px tap target.
export function CheckField({ label, hint, hintMode, checked, onCheckedChange, disabled, className }: { label: ReactNode; hint?: ReactNode; hintMode?: HintMode; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; className?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <ToggleRow id={id} label={label} hint={hint} hintMode={hintMode} hintId={hintId} className={className}
      control={<Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onCheckedChange(v === true)} className="max-sm:size-5" aria-describedby={hintId} />} />
  );
}

export function SwitchField({ label, hint, hintMode, checked, onCheckedChange, disabled, className }: { label: ReactNode; hint?: ReactNode; hintMode?: HintMode; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; className?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <ToggleRow id={id} label={label} hint={hint} hintMode={hintMode} hintId={hintId} className={className}
      control={<Switch id={id} checked={checked} disabled={disabled} aria-describedby={hintId} onCheckedChange={onCheckedChange} />} />
  );
}

// The legend of a group: a section title with the group's hint beside it. The fieldset is named by the legend text alone,
// so the hint button does not become part of its name.
function GroupLegend({ id, legend, hint, hintMode = 'tip', hintId }: { id: string; legend: ReactNode; hint?: ReactNode; hintMode?: HintMode; hintId?: string }) {
  return (
    <legend className="mb-2 flex items-center gap-1 text-[13.5px] font-semibold">
      <span id={id}>{legend}</span>
      <HintTip about={legend} hint={hint} hintId={hintId} mode={hintMode} />
    </legend>
  );
}

// Related fields under a legend styled as a section title: no border, space above.
export function FieldGroup({ legend, hint, hintMode = 'tip', error, children, className }: { legend: ReactNode; hint?: ReactNode; hintMode?: HintMode; error?: string; children: ReactNode; className?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <fieldset aria-labelledby={`${id}-legend`} aria-describedby={hintId} className={cn('mt-3 flex min-w-0 flex-col gap-3 first:mt-0', className)}>
      <GroupLegend id={`${id}-legend`} legend={legend} hint={hint} hintMode={hintMode} hintId={hintId} />
      <InlineHint hint={hint} hintId={hintId} mode={hintMode} className="-mt-1" />
      {children}
      {error && <p className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}
    </fieldset>
  );
}

// A few choices side by side (for example one CheckField per network) under a legend, with one error for the set.
export function FieldSet({ legend, hint, hintMode = 'tip', error, children }: { legend: string; hint?: ReactNode; hintMode?: HintMode; error?: string; children: ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <fieldset aria-labelledby={`${id}-legend`} aria-describedby={hintId} className="mt-3 flex min-w-0 flex-col gap-2 first:mt-0">
      <GroupLegend id={`${id}-legend`} legend={legend} hint={hint} hintMode={hintMode} hintId={hintId} />
      <InlineHint hint={hint} hintId={hintId} mode={hintMode} className="-mt-1" />
      <div className="flex flex-wrap gap-x-5 gap-y-1">{children}</div>
      {error && <p className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}
    </fieldset>
  );
}
