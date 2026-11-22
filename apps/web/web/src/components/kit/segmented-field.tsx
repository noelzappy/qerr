// A small choice (two to four options) as one row of segments instead of a dropdown: every option visible, one tap to choose. It takes the
// same props as SelectField, so a swap is a rename. Real radio buttons underneath: one tab stop, the arrow keys move the choice, the legend
// names the group, and the hint and error are wired to it like the other kit fields.
//
//   <SegmentedField label="Corners" value={corners} onValueChange={setCorners}
//     options={[{ value: 'square', label: 'Square' }, { value: 'soft', label: 'Soft' }, { value: 'round', label: 'Round' }]} />
//
// `tag` sits beside the label (for example the AutoTag of a value filled in for you). Long labels wrap onto a second row rather than overflow.
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SelectField } from './fields';
import { Hint } from './hint';

export interface SegmentOption<T extends string = string> { value: T; label: ReactNode; title?: string; disabled?: boolean }

export function SegmentedField<T extends string = string>({ label, value, onValueChange, options, hint, hintMode = 'tip', error, disabled, optional, className, tag, hideLabel, fill }: {
  label: ReactNode; value: T | null; onValueChange: (v: T) => void; options: Array<SegmentOption<T>>;
  hint?: ReactNode; hintMode?: 'tip' | 'inline'; error?: string; disabled?: boolean; optional?: boolean; className?: string; tag?: ReactNode;
  // read out but not shown (a choice in a table cell whose column header names it)
  hideLabel?: boolean;
  // the segments share the full width
  fill?: boolean;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined, errorId = error ? `${id}-error` : undefined;
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-1.5', className)} disabled={disabled} aria-labelledby={`${id}-label`} aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}>
      <legend className={cn('mb-1.5 flex min-h-5 items-center gap-1 text-sm leading-none font-medium', hideLabel && 'sr-only')}>
        <span id={`${id}-label`}>{label}{optional && <span className="font-normal text-muted-foreground"> (optional)</span>}</span>
        {hint && hintMode === 'tip' && <Hint about={label} id={hintId}>{hint}</Hint>}
        {tag}
      </legend>
      <div className={cn('flex max-w-full flex-wrap gap-0.5 rounded-md border bg-muted/40 p-0.5', fill ? 'w-full' : 'w-fit')}>
        {options.map((o) => (
          <label key={o.value} title={o.title}
            className={cn(
              'relative flex min-h-7 min-w-12 cursor-pointer items-center justify-center rounded-[5px] px-2.5 py-0.5 text-center text-[13px] leading-tight font-medium text-muted-foreground transition-colors max-sm:min-h-10',
              'hover:text-foreground has-[:checked]:bg-background has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:checked]:ring-1 has-[:checked]:ring-foreground/10 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
              'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
              fill && 'flex-1',
            )}>
            <input type="radio" name={id} value={o.value} className="sr-only" checked={value === o.value} disabled={disabled || o.disabled} onChange={() => onValueChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
      {hint && hintMode === 'inline' && <p className="text-[12.5px] text-muted-foreground" id={hintId}>{hint}</p>}
      {error && <p className="text-[12.5px] font-medium text-destructive" id={errorId} role="alert">{error}</p>}
    </fieldset>
  );
}

// Whether a list of options reads well as segments: two to four short options. Longer lists, or words that would not fit on a row of a
// form column, stay a dropdown.
export const SEGMENT_MAX = 4;
export function fitsSegments(options: ReadonlyArray<{ label: string }>, maxChars = 44): boolean {
  return options.length >= 2 && options.length <= SEGMENT_MAX && options.reduce((n, o) => n + o.label.length, 0) <= maxChars;
}

// A choice whose options are only known at run time (a catalogue's list): segments when they fit (fitsSegments), else the SelectField.
// Same props as SelectField.
export function ChoiceField(props: Parameters<typeof SelectField>[0]) {
  if (!fitsSegments(props.options)) return <SelectField {...props} />;
  const { label, value, onValueChange, options, hint, hintMode, error, disabled, optional, className, hideLabel } = props;
  return <SegmentedField label={label} value={value} onValueChange={onValueChange} options={options} hint={hint} hintMode={hintMode} error={error} disabled={disabled} optional={optional} className={className} hideLabel={hideLabel} />;
}
