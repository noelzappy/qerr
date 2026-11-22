// The small controls of the Settings tab: cards chosen like radio buttons, a segmented switch and the page diagrams the cards draw.
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const CustomChip = () => <span className="rounded-full border px-2 py-px text-[11.5px] font-medium text-muted-foreground">Custom</span>;

// Cards that are one choice: real radio buttons (arrow keys, one tab stop), the card is the label. `value` null: none chosen (Custom).
export function CardChoice({ legend, options, value, onChange, disabled, className }: {
  legend: string; options: Array<{ id: string; label: string; caption?: string; preview: ReactNode }>; value: string | null; onChange: (id: string) => void; disabled?: boolean; className?: string;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      <div className={cn('grid gap-2.5', className ?? 'grid-cols-2 sm:grid-cols-3')}>
        {options.map((o) => (
          <label key={o.id} className={cn('group relative flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-md border bg-background p-2 transition-colors hover:border-foreground/40 has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50', disabled && 'cursor-not-allowed opacity-60')}>
            <input type="radio" name={name} className="sr-only" checked={value === o.id} disabled={disabled} onChange={() => onChange(o.id)} />
            {o.preview}
            <span className="text-[12.5px] font-medium leading-tight">{o.label}</span>
            {o.caption && <span className="text-[12px] leading-tight text-muted-foreground">{o.caption}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// A few choices in one row; the chosen one is filled. Radio buttons underneath.
export function Segmented({ legend, options, value, onChange, disabled }: { legend: string; options: Array<{ id: string; label: string }>; value: string | null; onChange: (id: string) => void; disabled?: boolean }) {
  const name = useId();
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      <div className="inline-flex max-w-full rounded-md border bg-muted/40 p-0.5">
        {options.map((o) => (
          <label key={o.id} className={cn('relative flex h-7 min-w-14 cursor-pointer items-center justify-center rounded-[5px] px-3 text-[13px] font-medium text-muted-foreground transition-colors max-sm:h-10 has-[:checked]:bg-background has-[:checked]:text-foreground has-[:checked]:shadow-xs has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50', disabled && 'cursor-not-allowed opacity-60')}>
            <input type="radio" name={name} className="sr-only" checked={value === o.id} disabled={disabled} onChange={() => onChange(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---- diagrams: a page is 80 by 100, drawn with the brand's colours ----

export interface BrandColours { primary: string; accent: string; dark: string; light: string }
export const NEUTRAL_COLOURS: BrandColours = { primary: '#2f4b8f', accent: '#d9822b', dark: '#1d2026', light: '#f3f1ec' };

const PAGE = 'h-auto w-full rounded-[3px] border';
export function ColourDiagram({ kind, c, mix }: { kind: string; c: BrandColours; mix: (a: string, b: string, w: number) => string }) {
  const lines = (x: number, y: number, w: number, fill: string, n = 3) => Array.from({ length: n }, (_, i) => <rect key={i} x={x} y={y + i * 7} width={i === n - 1 ? w * 0.6 : w} height="3" rx="1.5" fill={fill} />);
  if (kind === 'field') return (
    <svg viewBox="0 0 80 100" className={PAGE} aria-hidden="true"><rect width="80" height="100" fill={c.primary} />{lines(8, 20, 56, c.light)}<rect x="8" y="50" width="30" height="9" rx="4.5" fill={c.accent} /><circle cx="64" cy="82" r="8" fill={c.accent} /></svg>
  );
  if (kind === 'tonal') return (
    <svg viewBox="0 0 80 100" className={PAGE} aria-hidden="true"><rect width="80" height="100" fill={mix(c.primary, '#ffffff', 0.14)} />{lines(8, 20, 56, c.primary)}<rect x="8" y="50" width="64" height="30" rx="2" fill={mix(c.primary, '#ffffff', 0.4)} /><rect x="8" y="86" width="26" height="5" rx="2.5" fill={mix(c.primary, '#ffffff', 0.7)} /></svg>
  );
  return (
    <svg viewBox="0 0 80 100" className={PAGE} aria-hidden="true"><rect width="80" height="100" fill={c.light} />{lines(8, 20, 56, c.dark)}<rect x="8" y="50" width="30" height="9" rx="4.5" fill={c.accent} /><rect x="8" y="70" width="64" height="2" fill={c.dark} opacity="0.5" /></svg>
  );
}

// Margins and the gap between three columns, as a page: tight, standard, airy.
export function SpaceDiagram({ kind }: { kind: string }) {
  const m = kind === 'tight' ? 5 : kind === 'airy' ? 15 : 9;
  const g = kind === 'tight' ? 1.5 : kind === 'airy' ? 5 : 3;
  const w = (80 - 2 * m - 2 * g) / 3;
  return (
    <svg viewBox="0 0 80 100" className={PAGE} aria-hidden="true">
      <rect width="80" height="100" fill="var(--background)" />
      {[0, 1, 2].map((i) => <rect key={i} x={m + i * (w + g)} y={m} width={w} height={100 - 2 * m} fill="currentColor" opacity="0.16" className="text-foreground" />)}
    </svg>
  );
}

export function LogoDiagram({ on, size }: { on: boolean; size?: string }) {
  const r = size === 'small' ? 4 : size === 'large' ? 9 : 6.5;
  return (
    <svg viewBox="0 0 80 100" className={PAGE} aria-hidden="true">
      <rect width="80" height="100" fill="var(--background)" />
      {[28, 35, 42].map((y, i) => <rect key={y} x="8" y={y + 30} width={i === 2 ? 34 : 56} height="3" rx="1.5" fill="currentColor" opacity="0.25" className="text-foreground" />)}
      {on ? <circle cx={8 + r} cy={8 + r} r={r} fill="currentColor" className="text-foreground" /> : <line x1="8" y1="8" x2="22" y2="22" stroke="currentColor" opacity="0.35" strokeWidth="1.5" className="text-foreground" />}
    </svg>
  );
}

// One neutral picture drawn in CSS (no photograph, nobody in it), treated the way the engine treats photographs.
const SCENE = 'linear-gradient(180deg, #8fb4d9 0%, #cfe0ec 46%, #d9c28f 46%, #a37a43 100%)';
const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='100'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2'/></filter><rect width='80' height='100' filter='url(%23n)' opacity='0.9'/></svg>\")";
export function PictureThumb({ treat, tint, grain }: { treat: string; tint: string; grain: boolean }) {
  const filter = treat === 'grey' ? 'grayscale(1)' : treat === 'punchy' ? 'contrast(1.4) saturate(1.5)' : undefined;
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[3px] border" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: SCENE, filter }}>
        <div className="absolute left-[22%] top-[18%] size-[26%] rounded-full bg-[#f3d36b]" />
        <div className="absolute bottom-[10%] left-[14%] h-[26%] w-[44%] rounded-t-[40%] bg-[#4f7a4c]" />
        <div className="absolute bottom-[10%] right-[10%] h-[34%] w-[26%] bg-[#b4553c]" />
      </div>
      {treat === 'tint' && <div className="absolute inset-0 mix-blend-multiply" style={{ background: tint }} />}
      {grain && <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{ backgroundImage: GRAIN }} />}
    </div>
  );
}
