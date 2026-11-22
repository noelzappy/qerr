// The design editor's choices for the two surface capabilities, visual first, exact values behind "Fine-tune":
//   Pattern (backdrop)   a picker of thumbnails, one per pattern, and a row of ready-made settings (the quiet ones keep words readable); its
//                        colours as swatches, how strongly it shows and how it fades as chips; scale, density, strength, angle, seed and centre
//                        in Fine-tune
//   Crosses a shape      for a text or a fitted headline: none, any shape, or one of the composition's filled shapes picked by name; choosing a
//                        shape names it (its key, a to f) in the same step. An outline for words that must read on two grounds in Fine-tune.
// Every change goes through the model (setProp), which checks it against the catalogue and says why it will not take it. The thumbnails are
// drawn here for looking at only, in the brand's swatches: the design stores pattern names, colour roles and numbers, never a picture.
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { RolePicker, ValueControl, type Ctx } from '../design-controls';
import { swatchOf } from '../design-colours';
import { elementName, joinEl, setProp, type Edit, type Json } from '../design-model';
import type { Desc } from '../look-types';
import { Chips, Group, Label, ToggleChip } from './ui';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const Err = ({ m }: { m: string }) => (m ? <p className="text-[12.5px] font-medium text-destructive" role="alert">{m}</p> : null);

// ================================================================== the pattern (backdrop)
export const PATTERN_NAMES: Record<string, string> = {
  dots: 'Dots', halftone: 'Halftone', grid: 'Grid', stripes: 'Stripes', rings: 'Rings', waves: 'Waves', blobs: 'Soft blobs', confetti: 'Confetti', plus: 'Plus marks', checker: 'Checker', grain: 'Grain',
};
// ready-made settings (the engine's primitives/backdrop.mjs PRESETS, as the panel shows them)
export const PATTERN_PRESETS: Array<{ id: string; label: string; quiet?: boolean; set: Json }> = [
  { id: 'quiet-dots', label: 'Quiet dots', quiet: true, set: { pattern: 'dots', scale: 36, density: 0.35, opacity: 0.1 } },
  { id: 'quiet-grid', label: 'Quiet grid', quiet: true, set: { pattern: 'grid', scale: 54, density: 0.3, opacity: 0.08 } },
  { id: 'quiet-rings', label: 'Quiet rings', quiet: true, set: { pattern: 'rings', scale: 64, density: 0.25, opacity: 0.08, at: 'right top' } },
  { id: 'quiet-waves', label: 'Quiet waves', quiet: true, set: { pattern: 'waves', scale: 60, density: 0.3, opacity: 0.08 } },
  { id: 'quiet-stripes', label: 'Quiet stripes', quiet: true, set: { pattern: 'stripes', scale: 48, density: 0.3, opacity: 0.06, angle: 135 } },
  { id: 'quiet-grain', label: 'Paper grain', quiet: true, set: { pattern: 'grain', opacity: 0.25 } },
  { id: 'halftone', label: 'Halftone fade', set: { pattern: 'halftone', scale: 28, density: 0.8, opacity: 0.22, at: 'left top', mask: 'fade-down' } },
  { id: 'bold-dots', label: 'Bold dots', set: { pattern: 'dots', scale: 44, density: 0.55, opacity: 0.3 } },
  { id: 'confetti', label: 'Confetti', set: { pattern: 'confetti', scale: 70, density: 0.35, opacity: 0.5, seed: 7 } },
  { id: 'plus-marks', label: 'Plus marks', set: { pattern: 'plus', scale: 80, density: 0.5, opacity: 0.18 } },
  { id: 'checker', label: 'Checker', set: { pattern: 'checker', scale: 90, density: 1, opacity: 0.06 } },
  { id: 'blob-mesh', label: 'Blob mesh', set: { pattern: 'blobs', scale: 160, density: 0.5, opacity: 0.5, seed: 3 } },
];
const OWN = ['pattern', 'colour', 'second', 'scale', 'density', 'opacity', 'angle', 'seed', 'mask', 'at'];
// which settings a pattern takes (the engine refuses the others: primitives/backdrop.mjs rules)
const TAKES: Record<string, string[]> = {
  dots: ['colour', 'scale', 'density', 'opacity', 'angle', 'mask'], halftone: ['colour', 'scale', 'density', 'opacity', 'angle', 'mask', 'at'], grid: ['colour', 'scale', 'density', 'opacity', 'angle', 'mask'],
  stripes: ['colour', 'scale', 'density', 'opacity', 'angle', 'mask'], rings: ['colour', 'scale', 'density', 'opacity', 'mask', 'at'], waves: ['colour', 'scale', 'density', 'opacity', 'angle', 'mask'],
  blobs: ['colour', 'second', 'scale', 'density', 'opacity', 'seed', 'mask'], confetti: ['colour', 'second', 'scale', 'density', 'opacity', 'seed', 'mask'], plus: ['colour', 'scale', 'density', 'opacity', 'angle', 'mask'],
  checker: ['colour', 'scale', 'density', 'opacity', 'angle', 'mask'], grain: ['scale', 'opacity', 'mask'],
};
export const takes = (pattern: string, name: string) => name === 'pattern' || (TAKES[pattern] ?? []).includes(name);
const STRENGTHS: Array<[number, string, string]> = [[0.08, 'Quiet', 'Faint, so words on it read easily'], [0.16, 'Soft', 'Clearly there, still calm'], [0.32, 'Bold', 'A strong texture; check the words on it']];
const MASKS: Array<[string, string, string]> = [['none', 'Even', 'The same all over'], ['fade-down', 'Fade down', 'Strong at the top, gone at the foot'], ['fade-up', 'Fade up', 'Strong at the foot, gone at the top'],
  ['fade-left', 'Fade left', 'Strong at the right, gone at the left'], ['fade-right', 'Fade right', 'Strong at the left, gone at the right'], ['vignette', 'Middle', 'Strong in the middle, gone at the edges'], ['edges', 'Edges', 'Clear in the middle, strong at the edges']];

// A thumbnail of a pattern in a colour (the panel only; the page is drawn by the engine).
export function PatternThumb({ pattern, colour, second, className }: { pattern: string; colour: string; second?: string; className?: string }) {
  const c2 = second ?? colour;
  const cells = (n: number, f: (x: number, y: number, i: number) => ReactNode) => Array.from({ length: n * n }, (_, i) => f((i % n) + 0.5, Math.floor(i / n) + 0.5, i));
  let body: ReactNode = null;
  switch (pattern) {
    case 'dots': body = cells(5, (x, y, i) => <circle key={i} cx={x * 8} cy={y * 8} r={1.8} fill={colour} />); break;
    case 'halftone': body = cells(6, (x, y, i) => <circle key={i} cx={x * 6.67} cy={y * 6.67} r={Math.max(0, 3.2 * (1 - Math.hypot(x, y) / 8.5))} fill={colour} />); break;
    case 'grid': body = [1, 2, 3, 4].flatMap((k) => [<rect key={`v${k}`} x={k * 8 - 0.4} y={0} width={0.8} height={40} fill={colour} />, <rect key={`h${k}`} x={0} y={k * 8 - 0.4} width={40} height={0.8} fill={colour} />]); break;
    case 'stripes': body = [-2, -1, 0, 1, 2, 3, 4].map((k) => <polygon key={k} points={`${k * 10},0 ${k * 10 + 4},0 ${k * 10 + 44},40 ${k * 10 + 40},40`} fill={colour} />); break;
    case 'rings': body = [6, 12, 18, 24, 30, 36].map((r) => <circle key={r} cx={40} cy={0} r={r} fill="none" stroke={colour} strokeWidth={1.1} />); break;
    case 'waves': body = [6, 15, 24, 33].map((y) => <path key={y} d={`M-2 ${y}Q3 ${y - 3} 8 ${y}T18 ${y}T28 ${y}T38 ${y}T48 ${y}`} fill="none" stroke={colour} strokeWidth={1.2} />); break;
    case 'blobs': body = <><circle cx={12} cy={14} r={13} fill={colour} opacity={0.7} /><circle cx={30} cy={28} r={12} fill={c2} opacity={0.7} /></>; break;
    case 'confetti': body = <><rect x={5} y={6} width={5} height={5} fill={colour} transform="rotate(20 7 8)" /><circle cx={28} cy={9} r={2.6} fill={c2} /><polygon points="16,30 20,22 24,30" fill={colour} /><rect x={28} y={28} width={9} height={2.4} fill={c2} transform="rotate(-30 32 29)" /><circle cx={10} cy={26} r={2} fill={c2} /></>; break;
    case 'plus': body = cells(3, (x, y, i) => <path key={i} d={`M${x * 13.3 - 3} ${y * 13.3}h6M${x * 13.3} ${y * 13.3 - 3}v6`} stroke={colour} strokeWidth={1.6} />); break;
    case 'checker': body = cells(4, (x, y, i) => ((Math.floor(x) + Math.floor(y)) % 2 ? null : <rect key={i} x={(x - 0.5) * 10} y={(y - 0.5) * 10} width={10} height={10} fill={colour} />)); break;
    case 'grain': body = cells(10, (x, y, i) => <rect key={i} x={x * 4 - 2} y={y * 4 - 2} width={1.2} height={1.2} fill={colour} opacity={((i * 37) % 10) / 14} />); break;
    default: body = null;
  }
  return <svg viewBox="0 0 40 40" aria-hidden="true" className={cn('size-full', className)}>{body}</svg>;
}

export function BackdropChoices({ ctx }: { ctx: Ctx }) {
  const apply = ctx.apply ?? (() => 'This setting cannot be changed here');
  const [error, setError] = useState('');
  const props = ctx.cat.elements.backdrop?.properties ?? {};
  const el = ctx.el, pattern = typeof el.pattern === 'string' ? el.pattern : 'dots';
  const colour = typeof el.colour === 'string' ? el.colour : 'accent';
  const fills = ctx.cat.lists.fillRoles as string[];
  const ink = swatchOf(ctx.swatches, colour), ink2 = typeof el.second === 'string' ? swatchOf(ctx.swatches, el.second) : undefined;
  // several settings in one step: drop what the new pattern does not take, then write the given values
  const write = (values: Json) => setError(apply((c) => {
    const next = String(values.pattern ?? pattern);
    let e: Edit = { comp: c };
    for (const k of OWN) if (k !== 'pattern' && ctx.el[k] !== undefined && (!takes(next, k) || (k in values && values[k] === undefined))) { e = setProp(e.comp, ctx.path, k, undefined, ctx.cat, ctx.look); if (e.error) return e; }
    for (const [k, v] of Object.entries(values)) if (v !== undefined) { e = setProp(e.comp, ctx.path, k, v, ctx.cat, ctx.look); if (e.error) return e; }
    return e;
  }));
  const preset = PATTERN_PRESETS.find((p) => Object.entries(p.set).every(([k, v]) => el[k] === v) && OWN.every((k) => k in p.set || k === 'colour' || k === 'second' || el[k] === undefined || (k === 'mask' && el[k] === 'none')));
  const opacity = typeof el.opacity === 'number' ? el.opacity : 0.1;
  const fine = (['scale', 'density', 'opacity', 'angle', 'seed', 'at'] as const).filter((n) => props[n] && takes(pattern, n)).map((n) => (
    <ValueControl key={n} name={n} desc={props[n] as Desc} value={el[n]} ctx={ctx} optional onChange={(v) => ctx.set(n, v)} />
  ));
  return (
    <Group title="Pattern" hint="A background drawn in the brand's colours. Words on it are measured on the finished picture; a quiet pattern keeps them easy to read." fine={fine}>
      <div className="flex flex-col gap-1">
        <Label>Ready-made</Label>
        <div role="radiogroup" aria-label="Ready-made patterns" className="grid grid-cols-4 gap-1.5 max-sm:grid-cols-3">
          {PATTERN_PRESETS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={preset?.id === p.id} title={`${p.label}${p.quiet ? ' (quiet: words on it read easily)' : ''}`} disabled={ctx.disabled}
              onClick={() => write({ ...p.set, mask: p.set.mask ?? undefined })}
              className={cn('flex flex-col items-center gap-0.5 rounded-md border bg-background p-1 text-[11px] leading-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60', preset?.id === p.id && 'ring-2 ring-primary')}>
              <span className="aspect-square w-full overflow-hidden rounded-sm border border-foreground/10" style={{ background: swatchOf(ctx.swatches, 'paper') }}>
                <span className="block size-full" style={{ opacity: Math.min(1, Number(p.set.opacity ?? 0.2) * 3) }}><PatternThumb pattern={String(p.set.pattern)} colour={ink} second={ink2} /></span>
              </span>
              <span className="w-full truncate text-center">{p.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Pattern</Label>
        <div role="radiogroup" aria-label="Pattern" className="grid grid-cols-6 gap-1 max-sm:grid-cols-4">
          {Object.entries(PATTERN_NAMES).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={pattern === v} aria-label={label} title={label} disabled={ctx.disabled} onClick={() => write({ pattern: v })}
              className={cn('aspect-square overflow-hidden rounded-md border bg-background p-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60', pattern === v && 'ring-2 ring-primary')}>
              <PatternThumb pattern={v} colour={ink} second={ink2} />
            </button>
          ))}
        </div>
      </div>
      {takes(pattern, 'colour') && <RolePicker label="Colour" value={colour} roles={fills} swatches={ctx.swatches} disabled={ctx.disabled} onChange={(v) => ctx.set('colour', v)} />}
      {takes(pattern, 'second') && <RolePicker label="Second colour" value={typeof el.second === 'string' ? el.second : undefined} roles={fills} swatches={ctx.swatches} optional disabled={ctx.disabled} hint="Confetti and blobs take turns between the two colours." onChange={(v) => ctx.set('second', v)} />}
      <div className="flex flex-col gap-1">
        <Label hint="How strongly it shows. Words on it must still reach their contrast on the finished picture.">Strength</Label>
        <Chips label="Strength" value={STRENGTHS.find(([v]) => v === opacity)?.[1] ?? null} custom disabled={ctx.disabled}
          options={STRENGTHS.map(([, l, title]) => ({ value: l, label: l, title }))} onChange={(l) => setError(ctx.set('opacity', STRENGTHS.find(([, x]) => x === l)![0]))} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Fade</Label>
        <Chips label="Fade" value={typeof el.mask === 'string' ? el.mask : 'none'} disabled={ctx.disabled} options={MASKS.map(([v, l, title]) => ({ value: v, label: l, title }))} onChange={(v) => setError(ctx.set('mask', v === 'none' ? undefined : v))} />
      </div>
      <Err m={error} />
    </Group>
  );
}

// ================================================================== words that cross a shape's edge on purpose
const KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];
// the composition's filled shapes a text may cross, with their paths, outside the text's own boxes
export function crossableShapes(comp: Json, path: string): Array<{ path: string; el: Json }> {
  const out: Array<{ path: string; el: Json }> = [];
  const filled = (e: Json) => {
    const t = String(e.type);
    if (t === 'box') return e.fill !== undefined || isObj(e.gradient);
    if (t === 'sticker') return e.shape !== 'seal';
    if (t === 'icon-badge') return e.shape !== 'none';
    return t === 'block' || t === 'gradient';
  };
  const walk = (list: unknown, base: string) => {
    if (!Array.isArray(list)) return;
    list.forEach((e, i) => {
      if (!isObj(e)) return;
      const p = joinEl(base, i);
      if (filled(e) && !(path === p || path.startsWith(`${p}.`))) out.push({ path: p, el: e });
      walk(e.children, p);
    });
  };
  walk(comp.elements, '');
  return out;
}

export function CrossingGroup({ ctx }: { ctx: Ctx }) {
  const apply = ctx.apply ?? (() => 'This setting cannot be changed here');
  const [error, setError] = useState('');
  const desc = ctx.cat.elements[String(ctx.el.type)]?.properties.overlap as (Desc & { props?: Record<string, Desc> }) | undefined;
  if (!desc) return null;
  const o = isObj(ctx.el.overlap) ? ctx.el.overlap : null;
  const shapes = crossableShapes(ctx.comp, ctx.path);
  const used = new Set(shapes.map((s) => s.el.key).filter((k): k is string => typeof k === 'string'));
  const value = !o ? 'none' : o.with === 'any-shape' ? 'any' : shapes.find((s) => s.el.key === o.with)?.path ?? null;
  const choose = (v: string) => setError(apply((c) => {
    if (v === 'none') return setProp(c, ctx.path, 'overlap', undefined, ctx.cat, ctx.look);
    const keep = o && isObj(o.outline) ? { outline: o.outline } : {};
    if (v === 'any') return setProp(c, ctx.path, 'overlap', { with: 'any-shape', allow: true, ...keep }, ctx.cat, ctx.look);
    const shape = shapes.find((s) => s.path === v);
    if (!shape) return { comp: c, error: 'That shape is not there any more' };
    let key = typeof shape.el.key === 'string' ? shape.el.key : KEYS.find((k) => !used.has(k));
    if (!key) return { comp: c, error: 'Six shapes of this design are named already; leave one out first' };
    let e: Edit = { comp: c };
    if (shape.el.key !== key) { e = setProp(c, shape.path, 'key', key, ctx.cat, ctx.look); if (e.error) return e; }
    return setProp(e.comp, ctx.path, 'overlap', { with: key, allow: true, ...keep }, ctx.cat, ctx.look);
  }));
  const outline = o && isObj(o.outline) ? o.outline : null;
  const setOutline = (next: Json | null) => { const v: Json = { ...o }; if (next) v.outline = next; else delete v.outline; setError(ctx.set('overlap', v)); };
  const fine = o ? (
    <div className="col-span-2 flex flex-col gap-2">
      <ToggleChip on={!!outline} disabled={ctx.disabled} onClick={() => setOutline(outline ? null : { colour: 'ink', w: 4 })} title="An outline round the letters, for words that must read on two different grounds">Outline the letters</ToggleChip>
      {outline && <RolePicker label="Outline colour" value={typeof outline.colour === 'string' ? outline.colour : 'ink'} roles={ctx.inks.length ? [...new Set([...ctx.inks, 'ink', 'paper', 'dark', 'white'])] : ['ink', 'paper', 'dark', 'white']} swatches={ctx.swatches} disabled={ctx.disabled}
        hint="The outline must read on every ground the words cross, and the letters on the outline." onChange={(v) => { if (!v) return ''; const m = ctx.set('overlap', { ...o, outline: { ...outline, colour: v } }); setError(m); return m; }} />}
      {outline && desc.props?.outline && <ValueControl name="overlap.outline.w" desc={(desc.props.outline as Desc & { props: Record<string, Desc> }).props.w!} value={outline.w} ctx={ctx} label="Outline width (pixels)" onChange={(v) => ctx.set('overlap', { ...o, outline: { ...outline, w: v } })} />}
    </div>
  ) : undefined;
  return (
    <Group title="Crosses a shape" hint="Lets the words cross the edge of one shape on purpose, such as a headline breaking out of its panel. Every other shape is still kept clear, and every part of the words must read on what is under it." fine={fine}>
      <Chips label="Crosses" value={value} disabled={ctx.disabled} onChange={choose}
        options={[{ value: 'none', label: 'No', title: 'Keep clear of every shape' }, ...shapes.map((s) => ({ value: s.path, label: `${elementName(s.el, ctx.cat)}${typeof s.el.key === 'string' ? ` (${s.el.key})` : ''}`, title: 'Cross this shape\'s edge' })), { value: 'any', label: 'Any shape', title: 'Cross the edge of any shape of this design' }]} />
      <Err m={error} />
    </Group>
  );
}
