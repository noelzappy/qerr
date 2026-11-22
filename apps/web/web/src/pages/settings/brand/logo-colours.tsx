// Brand and look, Colours: "Colours from your logo". With a logo uploaded, its main colours are read in the browser (logo-palette.ts)
// and offered as swatches: pick which of the four colours to set, then a swatch. Nothing changes until a swatch is chosen, and the
// change goes through the Save bar like any other.
import { useEffect, useId, useState } from 'react';
import { Check } from 'lucide-react';
import { SegmentedField } from '@/components/kit/segmented-field';
import { cn } from '@/lib/utils';
import type { BrandSettings } from '../brand-types';
import { logoPalette } from './logo-palette';

type Key = keyof BrandSettings['colours'];
const KEYS: Array<{ value: Key; label: string }> = [{ value: 'primary', label: 'Primary' }, { value: 'accent', label: 'Accent' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }];

// The palette of the logo at `src`, read once per address; [] while reading, or when it cannot be read.
export function useLogoPalette(src: string | null): { colours: string[]; ready: boolean } {
  const [state, setState] = useState<{ src: string | null; colours: string[] }>({ src: null, colours: [] });
  useEffect(() => {
    if (!src || typeof document === 'undefined') return;
    let live = true;
    logoPalette(src).then((colours) => { if (live) setState({ src, colours }); }, () => { if (live) setState({ src, colours: [] }); });
    return () => { live = false; };
  }, [src]);
  return { colours: state.src === src ? state.colours : [], ready: state.src === src };
}

export function LogoColours({ src, colours: current, onUse }: { src: string | null; colours: BrandSettings['colours']; onUse: (key: Key, hex: string) => void }) {
  const { colours, ready } = useLogoPalette(src);
  const [target, setTarget] = useState<Key>('primary');
  const titleId = useId();
  if (!src || !ready || !colours.length) return null;
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3" role="group" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span id={titleId} className="text-[13.5px] font-semibold">Colours from your logo</span>
        <span className="text-[12.5px] text-muted-foreground">Found {colours.length}</span>
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <SegmentedField label="Use for" value={target} onValueChange={setTarget} options={KEYS} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Colours found in the logo">
          {colours.map((hex) => {
            const inUse = current[target].toUpperCase() === hex;
            return (
              <button key={hex} type="button" onClick={() => onUse(target, hex)} aria-label={`Use ${hex} as the ${target} colour`} aria-pressed={inUse} title={hex}
                className={cn('grid size-8 place-items-center rounded-md border border-foreground/20 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:size-11', inUse && 'ring-2 ring-primary ring-offset-1')}
                style={{ backgroundColor: hex }}>
                {inUse && <Check className="size-4 text-white mix-blend-difference" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
