// Brand and look, the choices drawn as what they look like instead of named in a dropdown: photo treatments as a treated picture,
// decorations as pattern tiles, the logo's place as small page diagrams, the second half of a headline as a sample, a weight as an
// "Ag" strip. Each is a group of real radio buttons (arrow keys move, one tab stop) named by its label; the words stay beside each
// picture. The tiny pictures for the presets of the number fields (pattern 3) are here too.
import { useId, type ReactNode } from 'react';
import { ImageIcon } from 'lucide-react';
import { Hint } from '@/components/kit';
import { cn } from '@/lib/utils';
import { CardChoice, PictureThumb } from '../looks/settings/controls';
import { swatchOf, type Swatches } from '../looks/design-colours';
import { WEIGHT_NAME, type StyleSettings } from '../brand-types';

// A label with its hint, above a row of picture cards.
function PictureField({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex min-h-5 items-center gap-1 text-sm leading-none font-medium">{label}{hint && <Hint about={label}>{hint}</Hint>}</div>
      {children}
    </div>
  );
}

// ---- photos ----

export const PHOTO_WORDS: Record<string, string> = { none: 'As shot', tint: 'Tinted', duotone: 'Duotone', overlay: 'Colour overlay' };

export function PhotoTreatmentPicker({ value, onChange, photo, swatches, hint }: {
  value: string; onChange: (v: StyleSettings['photo']['treatment']) => void; photo: StyleSettings['photo']; swatches: Swatches; hint?: ReactNode;
}) {
  const colour = swatchOf(swatches, photo.colour);
  const duo: [string, string] = [swatchOf(swatches, photo.shadows), swatchOf(swatches, photo.highlights)];
  // Each treatment drawn at the strength set now (or a middling one, for a treatment not chosen yet).
  const strength = value === 'tint' || value === 'overlay' ? photo.strength : 0.5;
  return (
    <PictureField label="Photos" hint={hint}>
      <CardChoice legend="Photos" className="grid grid-cols-4 gap-2 sm:max-w-[26rem]" value={value} onChange={(v) => onChange(v as StyleSettings['photo']['treatment'])}
        options={(['none', 'tint', 'duotone', 'overlay'] as const).map((t) => ({
          id: t, label: PHOTO_WORDS[t]!, preview: <PictureThumb treat={t} tint={colour} grain={false} strength={strength} duo={duo} />,
        }))} />
    </PictureField>
  );
}

// ---- decoration ----

export const DECORATION_WORDS: Record<string, string> = { auto: 'Automatic', none: 'None', dots: 'Dots', grid: 'Grid', lines: 'Fine lines', artwork: 'Our artwork' };
const PAGE = 'h-auto w-full rounded-[3px] border';

// A dark page (decoration shows on dark pages first) with the pattern laid over at the given strength.
function DecorationTile({ kind, dark, light, alpha, artwork }: { kind: string; dark: string; light: string; alpha: number; artwork: string | null }) {
  const id = useId().replace(/:/g, '');
  if (kind === 'artwork') {
    return artwork
      ? <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[3px] border" style={{ background: dark }} aria-hidden="true"><img src={artwork} alt="" className="absolute inset-0 size-full object-cover" /></div>
      : <div className="flex aspect-[4/5] w-full items-center justify-center rounded-[3px] border border-dashed text-muted-foreground" aria-hidden="true"><ImageIcon className="size-5" /></div>;
  }
  const o = Math.min(1, Math.max(0.25, alpha * 4));
  const dots = <pattern id={`${id}d`} width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.1" fill={light} /></pattern>;
  const grid = <pattern id={`${id}g`} width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke={light} strokeWidth="0.6" /></pattern>;
  const lines = <pattern id={`${id}l`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke={light} strokeWidth="0.7" /></pattern>;
  return (
    <svg viewBox="0 0 80 100" className={PAGE} aria-hidden="true">
      <defs>{dots}{grid}{lines}</defs>
      <rect width="80" height="100" fill={dark} />
      {kind === 'dots' && <rect width="80" height="100" fill={`url(#${id}d)`} opacity={o} />}
      {kind === 'grid' && <rect width="80" height="100" fill={`url(#${id}g)`} opacity={o} />}
      {kind === 'lines' && <rect width="80" height="100" fill={`url(#${id}l)`} opacity={o} />}
      {kind === 'auto' && <><rect width="80" height="50" fill={`url(#${id}d)`} opacity={o} /><rect y="50" width="80" height="50" fill={`url(#${id}l)`} opacity={o} /><line x1="0" y1="50" x2="80" y2="50" stroke={light} strokeOpacity="0.5" strokeDasharray="2 2" strokeWidth="0.6" /></>}
      <rect x="8" y="64" width="44" height="4" rx="2" fill={light} opacity="0.9" />
      <rect x="8" y="72" width="30" height="4" rx="2" fill={light} opacity="0.6" />
    </svg>
  );
}

export function DecorationPicker({ value, onChange, dark, light, alpha, artwork }: { value: string; onChange: (v: StyleSettings['decoration']['kind']) => void; dark: string; light: string; alpha: number | null; artwork: string | null }) {
  return (
    <PictureField label="Decoration" hint="The texture behind pages. Automatic puts dots on dark pages and fine lines on dark posters.">
      <CardChoice legend="Decoration" className="grid grid-cols-3 gap-2 sm:grid-cols-6" value={value} onChange={(v) => onChange(v as StyleSettings['decoration']['kind'])}
        options={(['auto', 'none', 'dots', 'grid', 'lines', 'artwork'] as const).map((k) => ({
          id: k, label: DECORATION_WORDS[k]!, preview: <DecorationTile kind={k} dark={dark} light={light} alpha={alpha ?? 0.12} artwork={artwork} />,
        }))} />
    </PictureField>
  );
}

// ---- the logo's place ----

export const LOGO_WORDS: Record<string, string> = { auto: 'As laid out', 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right' };

// A page with its text lines and the logo (a mark and a name) in one corner; "as laid out" shows the logo where a page usually has
// it and the other corners as outlines.
function LogoPlaceDiagram({ place, colour }: { place: string; colour: string }) {
  const at = (p: string) => ({ x: p.endsWith('right') ? 46 : 8, y: p.startsWith('bottom') ? 84 : 8 });
  const logo = (p: string, faint = false) => {
    const { x, y } = at(p);
    return faint
      ? <rect key={p} x={x} y={y} width="26" height="8" rx="1.5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="2 1.5" strokeWidth="0.8" />
      : <g key={p}><rect x={x} y={y} width="8" height="8" rx="2" fill={colour} /><rect x={x + 10} y={y + 2.5} width="16" height="3" rx="1.5" fill="currentColor" opacity="0.7" /></g>;
  };
  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  return (
    <svg viewBox="0 0 80 100" className={cn(PAGE, 'text-foreground')} aria-hidden="true">
      <rect width="80" height="100" fill="var(--background)" />
      {[34, 41, 48].map((y, i) => <rect key={y} x="8" y={y} width={i === 2 ? 34 : 60} height="4" rx="2" fill="currentColor" opacity="0.2" />)}
      {place === 'auto' ? <>{corners.slice(1).map((c) => logo(c, true))}{logo('top-left')}</> : logo(place)}
    </svg>
  );
}

export function LogoPlacePicker({ value, onChange, colour, hint }: { value: string; onChange: (v: StyleSettings['logo']) => void; colour: string; hint?: ReactNode }) {
  return (
    <PictureField label="Logo" hint={hint}>
      <CardChoice legend="Logo" className="grid grid-cols-3 gap-2 sm:grid-cols-5" value={value} onChange={(v) => onChange(v as StyleSettings['logo'])}
        options={(['auto', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((p) => ({ id: p, label: LOGO_WORDS[p]!, preview: <LogoPlaceDiagram place={p} colour={colour} /> }))} />
    </PictureField>
  );
}

// ---- the second half of a headline ----

export const ACCENT_SAMPLE_WORDS: Record<string, string> = { series: 'Each post type decides', muted: 'In grey', colour: 'In the accent colour', weight: 'In a lighter weight', none: 'All the same' };

// "Save more, every week." with the second half set the way the choice sets it.
function AccentSample({ device, ink, muted, accent, small }: { device: string; ink: string; muted: string; accent: string; small?: boolean }) {
  const second = device === 'muted' ? { color: muted } : device === 'colour' ? { color: accent } : device === 'weight' ? { fontWeight: 300 } : {};
  return (
    <span className={cn('block font-bold leading-[1.1] tracking-tight', small ? 'text-[11px]' : 'text-[14px]')} style={{ color: ink }}>
      Save more, <span style={second}>every week.</span>
    </span>
  );
}

// The colours a sample is drawn in: the headline colour, the grey and the accent of a light page, and that page.
export interface SampleColours { ink: string; muted: string; accent: string; paper: string }
export const NEUTRAL_SAMPLE: SampleColours = { ink: '#1d2026', muted: '#8a8f98', accent: '#2f4b8f', paper: '#ffffff' };

export function AccentPicker({ value, onChange, colours = NEUTRAL_SAMPLE, hint }: { value: string; onChange: (v: StyleSettings['type']['accent']) => void; colours?: SampleColours; hint?: ReactNode }) {
  const { ink, muted, accent, paper } = colours;
  const box = (child: ReactNode) => <div className="flex min-h-14 flex-col justify-center gap-1 rounded-[3px] border px-2 py-1.5" style={{ background: paper }} aria-hidden="true">{child}</div>;
  return (
    <PictureField label="Second half of a headline" hint={hint}>
      <CardChoice legend="Second half of a headline" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" value={value} onChange={(v) => onChange(v as StyleSettings['type']['accent'])}
        options={(['series', 'muted', 'colour', 'weight', 'none'] as const).map((d) => ({
          id: d, label: ACCENT_SAMPLE_WORDS[d]!,
          preview: box(d === 'series'
            ? <><AccentSample small device="muted" ink={ink} muted={muted} accent={accent} /><AccentSample small device="colour" ink={ink} muted={muted} accent={accent} /></>
            : <AccentSample device={d} ink={ink} muted={muted} accent={accent} />),
        }))} />
    </PictureField>
  );
}

// ---- weight ----

export const ALL_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

// One weight of nine, each drawn as "Ag" in that weight with its number under it; `empty` adds a first choice for none (the brand's
// own). Real radio buttons, named "400 Regular" and so on.
export function WeightPicker({ label, hint, value, onChange, empty, fontFamily, disabled }: {
  label: string; hint?: ReactNode; value: number | null; onChange: (w: number | null) => void; empty?: string; fontFamily?: string; disabled?: boolean;
}) {
  const id = useId();
  const cell = 'relative flex h-12 w-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border bg-background text-foreground transition-colors hover:border-foreground/40 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 max-sm:h-14 max-sm:w-12';
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 flex min-h-5 items-center gap-1 text-sm leading-none font-medium">
        {label}{hint && <Hint about={label}>{hint}</Hint>}
        <span aria-hidden="true" className="ml-1 font-normal text-muted-foreground">{value === null ? empty : `${value} ${WEIGHT_NAME[value] ?? ''}`.trim()}</span>
      </legend>
      <div className="flex flex-wrap gap-1">
        {empty && (
          <label className={cn(cell, 'w-auto px-2 text-[12px] font-medium')}>
            <input type="radio" name={id} className="sr-only" checked={value === null} onChange={() => onChange(null)} />
            {empty}
          </label>
        )}
        {ALL_WEIGHTS.map((w) => (
          <label key={w} className={cell} title={`${w} ${WEIGHT_NAME[w] ?? ''}`.trim()}>
            <input type="radio" name={id} className="sr-only" value={w} checked={value === w} onChange={() => onChange(w)} aria-label={`${w} ${WEIGHT_NAME[w] ?? ''}`.trim()} />
            <span aria-hidden="true" className="text-[17px] leading-none" style={{ fontWeight: w, fontFamily }}>Ag</span>
            <span aria-hidden="true" className="font-mono text-[10px] leading-none text-muted-foreground tabular-nums">{w}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---- tiny pictures for the presets of the number fields ----

// Letters set in the spacing they stand for.
export const SpacingVisual = ({ em }: { em: number }) => <span className="text-[11px] leading-none font-semibold uppercase" style={{ letterSpacing: `${em}em` }}>Abc</span>;
// "Aa" at the size it stands for, on a fixed line so the row does not jump.
export const SizeVisual = ({ scale }: { scale: number }) => <span className="flex h-4 items-end text-foreground" style={{ fontSize: `${Math.round(13 * scale)}px`, lineHeight: 1 }}>Aa</span>;
// A small square of dots, as visible as the decoration would be.
export function DotsVisual({ alpha }: { alpha: number }) {
  return (
    <svg viewBox="0 0 22 12" className="h-3 w-[22px] rounded-[2px] bg-foreground" aria-hidden="true">
      {[3, 9, 15, 19].flatMap((x) => [3, 9].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" fill="var(--background)" opacity={Math.min(1, alpha * 3)} />))}
    </svg>
  );
}
// A bar as solid as the value: for opacity and strength.
export const SolidVisual = ({ opacity, colour }: { opacity: number; colour?: string }) => (
  <span className="relative block h-3 w-[22px] overflow-hidden rounded-[2px] border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:6px_6px]">
    <span className="absolute inset-0" style={{ background: colour ?? 'currentColor', opacity }} />
  </span>
);
// A part of a bar filled: how much of a budget this month's spending is.
export const ShareVisual = ({ share }: { share: number }) => (
  <span className="block h-1.5 w-[26px] overflow-hidden rounded-full bg-muted-foreground/25">
    <span className={cn('block h-full rounded-full', share >= 1 ? 'bg-destructive' : 'bg-foreground/70')} style={{ width: `${Math.round(Math.min(1, share) * 100)}%` }} />
  </span>
);
// A logo as a bar, the name part (from `at`, a share of the width) lighter than the mark.
export const LogoSplitVisual = ({ at }: { at: number }) => (
  <span className="flex h-2.5 w-[26px] overflow-hidden rounded-[2px] border border-foreground/30">
    <span className="h-full bg-foreground/80" style={{ width: `${Math.round(Math.min(1, Math.max(0, at)) * 100)}%` }} />
    <span className="h-full flex-1 bg-foreground/20" />
  </span>
);
// A mark, the gap after it and the name; the gap drawn wider as it grows (`share` of the logo's height, 0 to about 1).
export const GapVisual = ({ share }: { share: number }) => (
  <span className="flex h-2.5 items-center">
    <span className="size-2.5 rounded-[2px] bg-foreground/80" />
    <span style={{ width: `${Math.round(Math.min(1, Math.max(0, share)) * 10)}px` }} />
    <span className="h-1.5 w-3 rounded-full bg-foreground/40" />
  </span>
);
