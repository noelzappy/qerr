// The number fields of Brand and look as presets first (pattern 3): letter spacing, headline size, decoration strength, artwork
// opacity and photo strength. Each preset shows a tiny picture of its value; "Custom…" gives the exact number in the same range the
// server checks. A typed number out of range holds the Save bar (like the other brand fields) until it is fixed.
import { useId, useState, type ReactNode } from 'react';
import { PresetNumber, numberProblem, type NumberPreset } from '@/components/kit';
import { useReportProblem } from './status';
import { DotsVisual, SizeVisual, SolidVisual, SpacingVisual } from './pickers';

export function RangePreset({ label, hint, presets, value, onChange, min, max, step, unit, empty, error, note, className, tag, customStart }: {
  label: string; hint?: ReactNode; presets: NumberPreset[]; value: number | null; onChange: (v: number | null) => void;
  min: number; max: number; step: number; unit?: string; error?: string; note?: string; className?: string; tag?: ReactNode; customStart?: number;
  // a first choice for no number at all (null): the brand's own
  empty?: { label: string; visual?: ReactNode };
}) {
  const id = useId();
  const [bad, setBad] = useState<number | null>(null);
  useReportProblem(`preset-${id}`, bad !== null ? `${label}: ${numberProblem(bad, min, max)}` : '');
  return (
    <PresetNumber
      label={label} hint={hint} presets={presets} value={value} min={min} max={max} step={step} unit={unit} error={error} note={note} className={className} tag={tag} customStart={customStart}
      onChange={(v) => { setBad(null); onChange(v); }} onInvalid={(v) => setBad(v)}
      empty={empty ? { ...empty, onChoose: () => { setBad(null); onChange(null); } } : undefined}
    />
  );
}

const BRANDS_OWN = "Brand's own";

// Letter spacing of a type role, in em (-0.1 to 0.3); empty is the brand's own.
export const TRACKING_PRESETS: NumberPreset[] = [
  { value: -0.04, label: 'Tight' }, { value: -0.02, label: 'Snug' }, { value: 0, label: 'Normal' }, { value: 0.04, label: 'Airy' }, { value: 0.1, label: 'Wide' },
].map((p) => ({ ...p, visual: <SpacingVisual em={p.value} /> }));
export function TrackingField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <RangePreset label="Letter spacing" hint="Tighter or wider letters. Each choice is set in its own spacing." presets={TRACKING_PRESETS}
      value={value} onChange={onChange} min={-0.1} max={0.3} step={0.005} unit="em" empty={{ label: BRANDS_OWN }} />
  );
}

// Every headline bigger or smaller (0.8 to 1.25; 1 is as designed).
export const SCALE_PRESETS: NumberPreset[] = [
  { value: 0.9, label: 'Smaller' }, { value: 1, label: 'Normal' }, { value: 1.1, label: 'Larger' }, { value: 1.2, label: 'Largest' },
].map((p) => ({ ...p, visual: <SizeVisual scale={p.value} /> }));
export function HeadlineSizeField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <RangePreset label="Headline size" hint="Makes every headline bigger or smaller. Long headlines are still shrunk to fit." presets={SCALE_PRESETS}
      value={value} onChange={(v) => onChange(v ?? 1)} min={0.8} max={1.25} step={0.01} unit="times" />
  );
}

// How visible a pattern is (0.01 to 0.4); empty is the brand's own.
export const DECORATION_PRESETS: NumberPreset[] = [
  { value: 0.04, label: 'Faint' }, { value: 0.08, label: 'Light' }, { value: 0.15, label: 'Medium' }, { value: 0.3, label: 'Strong' },
].map((p) => ({ ...p, visual: <DotsVisual alpha={p.value} /> }));
export function DecorationStrengthField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <RangePreset label="Decoration strength" hint="How visible the pattern is." presets={DECORATION_PRESETS}
      value={value} onChange={onChange} min={0.01} max={0.4} step={0.01} empty={{ label: BRANDS_OWN }} customStart={0.12} />
  );
}

// How solid the artwork is (0.05 to 1).
export const OPACITY_PRESETS: NumberPreset[] = [
  { value: 0.25, label: 'Faint' }, { value: 0.5, label: 'Half' }, { value: 0.75, label: 'Strong' }, { value: 1, label: 'Solid' },
].map((p) => ({ ...p, visual: <SolidVisual opacity={p.value} /> }));
export function ArtworkOpacityField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <RangePreset label="Opacity" hint="How solid the artwork is." presets={OPACITY_PRESETS}
      value={value} onChange={(v) => onChange(v ?? 1)} min={0.05} max={1} step={0.05} />
  );
}

// How strong a tint or colour overlay is on photos (0 to 1), each preset drawn in the chosen colour.
export const STRENGTH_VALUES = [{ value: 0.25, label: 'Light' }, { value: 0.5, label: 'Medium' }, { value: 0.75, label: 'Strong' }, { value: 1, label: 'Full' }];
export function PhotoStrengthField({ value, onChange, colour, className }: { value: number; onChange: (v: number) => void; colour: string; className?: string }) {
  return (
    <RangePreset label="Strength" className={className} hint="How strongly the colour shows on photos." presets={STRENGTH_VALUES.map((p) => ({ ...p, visual: <SolidVisual opacity={p.value} colour={colour} /> }))}
      value={value} onChange={(v) => onChange(v ?? 0.5)} min={0} max={1} step={0.05} />
  );
}
