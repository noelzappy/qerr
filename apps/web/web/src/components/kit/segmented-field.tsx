// A small choice (two to four options) as one row of segments instead of a dropdown: every option visible, one tap to choose. It takes the
// same props as SelectField, so a swap is a rename. Real radio buttons underneath: one tab stop, the arrow keys move the choice, the legend
// names the group, and the hint and error are wired to it like the other kit fields.
//
//   <SegmentedField label="Corners" value={corners} onValueChange={setCorners}
//     options={[{ value: 'square', label: 'Square' }, { value: 'soft', label: 'Soft' }, { value: 'round', label: 'Round' }]} />
//
// `tag` (or `marker`) sits beside the label (for example the AutoTag of a value filled in for you). Long labels wrap onto a second row
// rather than overflow. A value that matches no option leaves none chosen. `layout="inline"` puts a small label beside the buttons (a
// filter row). An option may carry a `count`, shown quietly after its words and read with them. `variant="chips"` draws the same radio
// group as separate chips that wrap, for a longer list such as the kinds of fact. `onChange` is accepted as another name for
// `onValueChange`.
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SelectField } from './fields';
import { Hint } from './hint';

export interface SegmentOption<T extends string = string> { value: T; label: ReactNode; title?: string; disabled?: boolean; count?: number }

export function SegmentedField<T extends string = string>({ label, value, onValueChange, onChange, options, hint, hintMode = 'tip', error, disabled, optional, className, tag, marker, hideLabel, fill, layout = 'stacked', variant = 'segmented' }: {
  label: ReactNode; value: T | '' | null; options: Array<SegmentOption<T>>;
  onValueChange?: (v: T) => void; onChange?: (v: T) => void;
  hint?: ReactNode; hintMode?: 'tip' | 'inline'; error?: string; disabled?: boolean; optional?: boolean; className?: string; tag?: ReactNode; marker?: ReactNode;
  // read out but not shown (a choice in a table cell whose column header names it)
  hideLabel?: boolean;
  // the segments share the full width
  fill?: boolean;
  layout?: 'stacked' | 'inline';
  variant?: 'segmented' | 'chips';
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined, errorId = error ? `${id}-error` : undefined;
  const choose = onValueChange ?? onChange ?? (() => {});
  const inline = layout === 'inline', chips = variant === 'chips';
  const beside = tag ?? marker;
  return (
    <fieldset className={cn('flex min-w-0', inline ? 'flex-row flex-wrap items-center gap-x-2 gap-y-1' : 'flex-col gap-1.5', className)} disabled={disabled} aria-labelledby={`${id}-label`} aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}>
      <legend className={cn(hideLabel ? 'sr-only' : inline ? 'float-left mr-2 flex min-h-8 items-center text-[12.5px] text-muted-foreground max-sm:min-h-11' : 'mb-1.5 flex min-h-5 items-center gap-1 text-sm leading-none font-medium')}>
        <span id={`${id}-label`}>{label}{optional && <span className="font-normal text-muted-foreground"> (optional)</span>}</span>
        {!hideLabel && hint && hintMode === 'tip' && <Hint about={label} id={hintId}>{hint}</Hint>}
        {!hideLabel && beside}
      </legend>
      {hideLabel && hint && <span id={hintId} className="sr-only">{hint}</span>}
      <div className={cn('flex max-w-full flex-wrap', chips ? 'gap-1.5' : 'gap-0.5 rounded-md border bg-muted/40 p-0.5', !chips && (fill ? 'w-full' : 'w-fit'))}>
        {options.map((o) => (
          <label key={o.value} title={o.title}
            className={cn(
              'relative flex cursor-pointer items-center justify-center gap-1.5 text-center text-[13px] leading-tight font-medium transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
              chips
                ? 'h-8 rounded-md border px-3 whitespace-nowrap hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground max-sm:h-11 [&:has(:checked)>span]:text-primary-foreground/80'
                : 'min-h-7 min-w-12 rounded-[5px] px-2.5 py-0.5 text-muted-foreground hover:text-foreground has-[:checked]:bg-background has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:checked]:ring-1 has-[:checked]:ring-foreground/10 max-sm:min-h-10',
              'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
              fill && !chips && 'flex-1',
            )}>
            <input type="radio" name={id} value={o.value} className="sr-only" checked={value === o.value} disabled={disabled || o.disabled} onChange={() => choose(o.value)} />
            {o.label}
            {o.count !== undefined && <span className="font-normal text-muted-foreground tabular-nums">{o.count}</span>}
          </label>
        ))}
      </div>
      {hint && hintMode === 'inline' && !hideLabel && <p className="w-full text-[12.5px] text-muted-foreground" id={hintId}>{hint}</p>}
      {error && <p className="w-full text-[12.5px] font-medium text-destructive" id={errorId} role="alert">{error}</p>}
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
