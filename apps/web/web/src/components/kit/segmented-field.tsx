// A few choices side by side, the chosen one raised: the control for 2 to 4 options, in place of a dropdown, in forms and in
// filter rows. Real radio buttons underneath (one tab stop, the arrow keys move and choose), named by a legend.
//
//   <SegmentedField label="Status" value={status} onChange={setStatus}
//     options={[{ value: '', label: 'Any' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'unconfirmed', label: 'Unconfirmed' }]} />
//
// A value that matches no option leaves none chosen. `layout="inline"` puts a small label beside the buttons (a filter row);
// `hideLabel` keeps the legend for screen readers only. `marker` sits beside the label (an "Auto" tag). An option may carry a
// `count`, shown quietly after its words and read with them. `variant="chips"` draws the same radio group as separate chips
// that wrap (in the look of ChoiceRow), for a longer list such as the kinds of fact.
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Hint } from './hint';

export interface SegmentOption<T extends string> { value: T; label: ReactNode; count?: number; title?: string }

export function SegmentedField<T extends string>({ label, options, value, onChange, hint, error, disabled, layout = 'stacked', variant = 'segmented', hideLabel, marker, className }: {
  label: string;
  options: Array<SegmentOption<T>>;
  value: T | '' | null;
  onChange: (v: T) => void;
  hint?: ReactNode;
  error?: string;
  disabled?: boolean;
  layout?: 'stacked' | 'inline';
  variant?: 'segmented' | 'chips';
  hideLabel?: boolean;
  marker?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const inline = layout === 'inline';
  const chips = variant === 'chips';
  return (
    <fieldset
      className={cn('flex min-w-0', inline ? 'flex-row flex-wrap items-center gap-x-2 gap-y-1' : 'flex-col gap-1.5', className)}
      disabled={disabled}
      aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
    >
      <legend className={cn(hideLabel ? 'sr-only' : inline ? 'float-left mr-2 flex min-h-8 items-center text-[12.5px] text-muted-foreground max-sm:min-h-11' : 'mb-1.5 flex min-h-5 items-center gap-1 text-sm leading-none font-medium')}>
        {label}
        {!hideLabel && hint && <Hint about={label} id={hintId}>{hint}</Hint>}
        {!hideLabel && marker}
      </legend>
      {hideLabel && hint && <span id={hintId} className="sr-only">{hint}</span>}
      <div className={cn('max-w-full flex-wrap', chips ? 'flex gap-1.5' : 'inline-flex self-start rounded-md border bg-muted/40 p-0.5', !chips && options.length > 3 && 'max-sm:grid max-sm:w-full max-sm:grid-cols-2')} role="presentation">
        {options.map((o) => (
          <label
            key={o.value}
            title={o.title}
            className={cn(
              'relative flex cursor-pointer items-center justify-center gap-1.5 text-[13px] font-medium whitespace-nowrap transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
              chips
                ? 'h-8 rounded-md border px-3 hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground max-sm:h-11 [&:has(:checked)>span]:text-primary-foreground/80'
                : 'h-7 rounded-[5px] px-3 text-muted-foreground hover:text-foreground has-[:checked]:bg-background has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:checked]:ring-1 has-[:checked]:ring-foreground/15 max-sm:h-10',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input type="radio" name={id} value={o.value} className="sr-only" checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} />
            {o.label}
            {o.count !== undefined && <span className="font-normal text-muted-foreground tabular-nums">{o.count}</span>}
          </label>
        ))}
      </div>
      {error && <p className="w-full text-[12.5px] font-medium text-destructive" id={errorId} role="alert">{error}</p>}
    </fieldset>
  );
}
