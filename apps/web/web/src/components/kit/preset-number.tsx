// A number chosen from a few named presets, with the exact number only when asked for. The presets are a segmented row (real radio
// buttons: arrow keys move, one tab stop); each can carry a tiny picture of its value (text set in its own letter spacing, a weight
// sample, a strength bar). "Custom…" shows the exact number with its range and step. The control works out which preset the value
// is (the nearest one, within `tolerance`) or shows Custom; it never snaps a value that fits no preset.
//
//   <PresetNumber label="Letter spacing" min={-0.06} max={0.02} step={0.005} unit="em" value={track} onChange={setTrack}
//     presets={[{ value: -0.04, label: 'Tight' }, { value: -0.02, label: 'Snug' }, { value: 0, label: 'Normal' }]} />
//
// `empty` adds a first choice that means no number at all (for example "The brand's own"): it is chosen while the value is null,
// and choosing it calls `empty.onChoose`.
//
// `onChange` gets a preset's value or a typed number inside the range. A typed number outside it (or nothing) is not passed on: the
// control says what range to use, and `onInvalid` hears it for a form that must refuse to save meanwhile.
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Hint } from './hint';

export interface NumberPreset { value: number; label: string; visual?: ReactNode }

// The index of the preset nearest to `value` when it is within `tolerance` of it; null when none is (Custom), or for no number.
export function presetIndex(value: number | null | undefined, presets: ReadonlyArray<{ value: number }>, tolerance = 0): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  let best: number | null = null, gap = Infinity;
  presets.forEach((p, i) => { const d = Math.abs(p.value - value); if (d < gap) { gap = d; best = i; } });
  // A hair of slack for decimals that do not add up exactly (0.1 + 0.2).
  return best !== null && gap <= tolerance + 1e-9 * Math.max(1, Math.abs(value)) ? best : null;
}

// What is selected: a preset's index, or 'custom' (the value fits none, the owner forced it, or the person chose Custom).
export function presetChoice(value: number | null | undefined, presets: ReadonlyArray<{ value: number }>, opts: { tolerance?: number; custom?: boolean; customOpen?: boolean } = {}): number | 'custom' {
  if (opts.custom || opts.customOpen) return 'custom';
  return presetIndex(value, presets, opts.tolerance) ?? 'custom';
}

// The problem with a typed number, in plain words; '' when it is one the control passes on.
export function numberProblem(n: number, min: number, max: number): string {
  return Number.isFinite(n) && n >= min && n <= max ? '' : `Use a number from ${fmtNumber(min)} to ${fmtNumber(max)}.`;
}
export const fmtNumber = (n: number): string => String(Number(n.toFixed(4))).replace('-', '−');

export interface PresetNumberProps {
  label: ReactNode;
  hint?: ReactNode;
  presets: NumberPreset[];
  value: number | null;
  onChange: (value: number) => void;
  min: number; max: number; step: number;
  unit?: string;
  tolerance?: number;
  // Show Custom even when the value equals a preset (the values this one number stands for do not follow it).
  custom?: boolean;
  // The number the custom box starts at when Custom is chosen while a preset is on; without it the value stays as it is.
  customStart?: number;
  // Every typed number that is not passed on (outside the range, or nothing typed: NaN).
  onInvalid?: (value: number) => void;
  error?: string;
  // A remark shown below while there is no problem (a consequence, not help).
  note?: string;
  disabled?: boolean;
  className?: string;
  // A first choice for no number (null), with its own words and picture.
  empty?: { label: string; visual?: ReactNode; onChoose: () => void };
  // Shown after the legend's words (an AutoTag, a "Measure" button).
  tag?: ReactNode;
}

export function PresetNumber({ label, hint, presets, value, onChange, min, max, step, unit, tolerance, custom, customStart, onInvalid, error, note, disabled, className, empty, tag }: PresetNumberProps) {
  const id = useId();
  const [customOpen, setCustomOpen] = useState(false);
  const [text, setText] = useState(value === null || !Number.isFinite(value) ? '' : String(value));
  const [typedProblem, setTypedProblem] = useState('');
  // A value set from outside (a preset, a reset) replaces what was typed; the text being typed is kept while it parses to the value.
  useEffect(() => {
    if (value !== null && Number.isFinite(value) && Number(text) !== value) { setText(String(value)); setTypedProblem(''); }
  }, [value]);
  const isEmpty = !!empty && value === null && !customOpen;
  const choice = isEmpty ? 'empty' : presetChoice(value, presets, { tolerance, custom, customOpen });
  const problem = error || typedProblem;
  const name = typeof label === 'string' ? label : 'Value';
  const chooseEmpty = () => { setCustomOpen(false); setTypedProblem(''); setText(''); empty?.onChoose(); };
  const pick = (i: number) => { setCustomOpen(false); setTypedProblem(''); setText(String(presets[i]!.value)); onChange(presets[i]!.value); };
  const openCustom = () => {
    setCustomOpen(true);
    if (customStart !== undefined && (value === null || presetIndex(value, presets, tolerance) !== null)) onChange(customStart);
  };
  const type = (t: string) => {
    setText(t);
    const n = t.trim() === '' ? Number.NaN : Number(t.replace('−', '-'));
    const p = numberProblem(n, min, max);
    setTypedProblem(p);
    if (p) onInvalid?.(n); else onChange(n);
  };
  const seg = 'relative flex min-h-8 min-w-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[5px] px-2.5 py-1 text-[13px] font-medium text-muted-foreground transition-colors max-sm:min-h-11 has-[:checked]:bg-background has-[:checked]:text-foreground has-[:checked]:shadow-xs has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50';
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-1.5', className)} disabled={disabled} aria-describedby={problem ? `${id}-err` : undefined}>
      <legend className="mb-1 flex items-center gap-1 text-[13px] font-medium">
        {label}
        {hint && <Hint about={label}>{hint}</Hint>}
        {tag}
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex max-w-full flex-wrap rounded-md border bg-muted/40 p-0.5">
          {empty && (
            <label className={cn(seg, disabled && 'cursor-not-allowed opacity-60')}>
              <input type="radio" name={id} className="sr-only" checked={choice === 'empty'} disabled={disabled} onChange={chooseEmpty} />
              {empty.visual && <span aria-hidden="true" className="flex items-center justify-center">{empty.visual}</span>}
              <span>{empty.label}</span>
            </label>
          )}
          {presets.map((p, i) => (
            <label key={`${p.value}-${p.label}`} className={cn(seg, disabled && 'cursor-not-allowed opacity-60')}>
              <input type="radio" name={id} className="sr-only" checked={choice === i} disabled={disabled} onChange={() => pick(i)} />
              {p.visual && <span aria-hidden="true" className="flex items-center justify-center">{p.visual}</span>}
              <span>{p.label}</span>
            </label>
          ))}
          <label className={cn(seg, disabled && 'cursor-not-allowed opacity-60')}>
            <input type="radio" name={id} className="sr-only" checked={choice === 'custom'} disabled={disabled} onChange={openCustom} />
            <span>Custom…</span>
          </label>
        </div>
        {choice === 'custom' && (
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`${id}-n`} className="sr-only">{name}, {fmtNumber(min)} to {fmtNumber(max)}{unit ? ` ${unit}` : ''}</Label>
            <Input id={`${id}-n`} type="number" inputMode="decimal" min={min} max={max} step={step} value={text} disabled={disabled} aria-invalid={problem ? true : undefined}
              onChange={(e) => type(e.target.value)} className="w-24 tabular-nums max-sm:h-11 max-sm:text-base" />
            <span className="text-[12px] text-muted-foreground">{fmtNumber(min)} to {fmtNumber(max)}{unit ? ` ${unit}` : ''}</span>
          </div>
        )}
      </div>
      {problem && <p id={`${id}-err`} className="text-[12.5px] font-medium text-destructive" role="alert">{problem}</p>}
      {!problem && note && <p className="text-[12.5px] text-muted-foreground" role="status">{note}</p>}
    </fieldset>
  );
}
