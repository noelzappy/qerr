// Brand and look, Colours: "Contrast for large headlines" (contrast.display of the brand, 3 to 7; the standard is 4.5). Standard, High
// or a custom value. Below 4.5 it is fine for large headlines only, which the note says.
import { Hint } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { DISPLAY_HIGH, DISPLAY_MAX, DISPLAY_MIN, DISPLAY_STANDARD, type DisplayMode, displayMode, displayNote, displayProblem } from './contrast-logic';
import { useReportProblem } from './status';

const OPTIONS: Array<{ id: DisplayMode; label: string }> = [{ id: 'standard', label: 'Standard (4.5)' }, { id: 'high', label: 'High (7)' }, { id: 'custom', label: 'Custom' }];

export function ContrastDisplay({ value, onChange, error }: { value: number | null; onChange: (v: number | null) => void; error?: string }) {
  const mode = displayMode(value);
  const problem = error || displayProblem(value);
  const note = displayNote(value);
  // Saving waits until the ratio is one the engine takes.
  useReportProblem('contrast-display', displayProblem(value) ? 'Contrast for large headlines: use a ratio from 3 to 7.' : '');
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1 flex items-center gap-1 text-[13.5px] font-semibold">
        Contrast for large headlines
        <Hint about="Contrast for large headlines">How strongly large headlines must stand out from what is behind them. Standard meets the accessibility guideline for large text.</Hint>
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Contrast for large headlines" className="flex flex-wrap gap-1.5">
          {OPTIONS.map((o) => (
            <label key={o.id} className={cn('inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-[13px] font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 sm:min-h-8', mode === o.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
              <input type="radio" name="contrast-display" className="sr-only" checked={mode === o.id} onChange={() => onChange(o.id === 'standard' ? null : o.id === 'high' ? DISPLAY_HIGH : value !== null && value !== DISPLAY_STANDARD && value !== DISPLAY_HIGH ? value : 4)} />
              {o.label}
            </label>
          ))}
        </div>
        {mode === 'custom' && (
          <div className="flex items-center gap-1.5">
            <Label htmlFor="contrast-display-value" className="sr-only">Contrast ratio, {DISPLAY_MIN} to {DISPLAY_MAX}</Label>
            <Input id="contrast-display-value" type="number" inputMode="decimal" min={DISPLAY_MIN} max={DISPLAY_MAX} step={0.1} value={value === null || Number.isNaN(value) ? '' : value} aria-invalid={problem ? true : undefined}
              onChange={(e) => onChange(e.target.value.trim() === '' ? Number.NaN : Number(e.target.value))} className="w-24 tabular-nums max-sm:h-11 max-sm:text-base" />
            <span className="text-[12px] text-muted-foreground">{DISPLAY_MIN} to {DISPLAY_MAX}</span>
          </div>
        )}
      </div>
      {problem && <p className="text-[12.5px] font-medium text-destructive" role="alert">{problem}</p>}
      {!problem && note && <p className="text-[12.5px] text-muted-foreground" role="status">{note}</p>}
    </fieldset>
  );
}
