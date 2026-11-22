// Brand and look, Colours: "Contrast for large headlines" (contrast.display of the brand, 3 to 7; the standard is 4.5). Standard, High
// or a custom value, through the kit's PresetNumber. Below 4.5 it is fine for large headlines only, which the note says.
import { PresetNumber } from '@/components/kit';
import { DISPLAY_HIGH, DISPLAY_MAX, DISPLAY_MIN, DISPLAY_STANDARD, displayNote, displayProblem } from './contrast-logic';
import { useReportProblem } from './status';

const PRESETS = [{ value: DISPLAY_STANDARD, label: 'Standard (4.5)' }, { value: DISPLAY_HIGH, label: 'High (7)' }];

export function ContrastDisplay({ value, onChange, error }: { value: number | null; onChange: (v: number | null) => void; error?: string }) {
  const problem = error || displayProblem(value);
  // Saving waits until the ratio is one the engine takes.
  useReportProblem('contrast-display', displayProblem(value) ? 'Contrast for large headlines: use a ratio from 3 to 7.' : '');
  // The standard is stored as no value at all.
  const set = (v: number) => onChange(v === DISPLAY_STANDARD ? null : v);
  return (
    <PresetNumber label="Contrast for large headlines" className="[&>legend]:text-[13.5px] [&>legend]:font-semibold"
      hint="How strongly large headlines must stand out from what is behind them. Standard meets the accessibility guideline for large text."
      presets={PRESETS} value={value ?? DISPLAY_STANDARD} min={DISPLAY_MIN} max={DISPLAY_MAX} step={0.1} customStart={4}
      onChange={set} onInvalid={onChange} error={problem || undefined} note={displayNote(value) || undefined} />
  );
}
