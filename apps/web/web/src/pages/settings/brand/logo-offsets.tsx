// Brand and look, Logos: where the name starts in the full logo and the gap before it, as presets first. "Measured" is read from the
// uploaded logo in the browser (logo-tools.ts measureLogo: the transparent columns between the mark and the name); "Measure from the
// logo" sets both at once. "Custom…" keeps the exact pixels for a logo the measuring gets wrong.
import { useEffect, useState } from 'react';
import { Ruler } from 'lucide-react';
import { type NumberPreset } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { measureLogo } from '../logo-tools';
import type { BrandSettings } from '../brand-types';
import { GapVisual, LogoSplitVisual } from './pickers';
import { RangePreset } from './preset-fields';

type Offsets = BrandSettings['logo'];

// The measured place of the name in the logo at `src`; null until read, or when it cannot be read.
export function useMeasuredLogo(src: string | null): Offsets | null {
  const [state, setState] = useState<{ src: string; at: Offsets | null } | null>(null);
  useEffect(() => {
    if (!src || typeof document === 'undefined') return;
    let live = true;
    fetch(src, { credentials: 'same-origin' }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error('not found')))).then(measureLogo)
      .then((m) => { if (live) setState({ src, at: { wordmarkFrom: m.wordmarkFrom, markGap: m.markGap } }); }, () => { if (live) setState({ src, at: null }); });
    return () => { live = false; };
  }, [src]);
  return state?.src === src ? state.at : null;
}

// Presets without repeats: the measured value first (when there is one), then the fixed ones.
export function offsetPresets(measured: number | null, fixed: NumberPreset[], visual: (v: number) => NumberPreset['visual']): NumberPreset[] {
  const list = [...(measured !== null && measured > 0 ? [{ value: measured, label: 'Measured' }] : []), ...fixed];
  return list.filter((p, i) => list.findIndex((q) => q.value === p.value) === i).map((p) => ({ ...p, visual: visual(p.value) }));
}

export function LogoOffsets({ src, size, value, onChange }: { src: string | null; size: [number, number]; value: Offsets; onChange: (v: Offsets) => void }) {
  const measured = useMeasuredLogo(src);
  const [w, h] = size;
  const differs = !!measured && (measured.wordmarkFrom !== value.wordmarkFrom || measured.markGap !== value.markGap);
  return (
    <div className="flex flex-col gap-3">
      <RangePreset
        label="Where the name starts in the full logo" unit="pixels" min={0} max={w - 1} step={1}
        hint={`In pixels from the left, out of ${w}. On dark pages the name is drawn in white from here. Whole logo treats it all as the name.`}
        presets={offsetPresets(measured?.wordmarkFrom ?? null, [{ value: 0, label: 'Whole logo' }], (v) => <LogoSplitVisual at={v / w} />)}
        value={value.wordmarkFrom} onChange={(v) => onChange({ ...value, wordmarkFrom: v ?? 0 })}
        note={measured ? `Measured from the logo: ${measured.wordmarkFrom} pixels.` : undefined}
      />
      <RangePreset
        label="Gap between the mark and the name" unit="pixels" min={0} max={5000} step={1} hint="In pixels."
        presets={offsetPresets(measured?.markGap ?? null, [{ value: 0, label: 'No gap' }], (v) => <GapVisual share={h ? v / h : 0} />)}
        value={value.markGap} onChange={(v) => onChange({ ...value, markGap: v ?? 0 })}
      />
      {differs && (
        <div><Button type="button" variant="outline" size="sm" onClick={() => onChange(measured!)}><Ruler aria-hidden="true" /> Measure from the logo</Button></div>
      )}
    </div>
  );
}
