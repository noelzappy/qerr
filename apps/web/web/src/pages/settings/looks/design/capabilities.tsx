// The design editor's choices for the three look capabilities of step 5 part A, visual first, exact values behind "Fine-tune":
//   Gradient            kind (linear, radial), its two or three brand colours as swatches, a direction or a point; angle and middle in Fine-tune
//   Colour over picture where it is strongest (even, foot, top) and its colour; the contrast and strength range in Fine-tune
//   Brand graphic       which of the brand's graphics or cut-outs (thumbnails), where (a 3 x 3 pad), how big, mirrored, on the edge, a colour
//                       for a recolourable one; the moves, exact width and turn in Fine-tune
// Every change goes through ctx.set, so the model checks it against the catalogue and says why it will not take it. The swatches and the
// thumbnails are for looking at only: the design stores colour roles and the vault id, never a colour value or an address.
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, FlipHorizontal2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AngleControl, NumberInput, RolePicker, Segmented, ValueControl, type Ctx } from '../design-controls';
import { swatchOf } from '../design-colours';
import type { Desc, Json } from '../look-types';
import { useBrandGraphics } from '../useBrandGraphics';
import { Chips, Group, Label, ToggleChip } from './ui';
import { BackdropChoices } from './surfaces';
import { ArtChoices } from './art';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const Err = ({ m }: { m: string }) => (m ? <p className="text-[12.5px] font-medium text-destructive" role="alert">{m}</p> : null);

// The props each capability's own group shows (the pane leaves them out of its generic groups).
export const CAPABILITY_PROPS: Record<string, string[]> = {
  gradient: ['gradient'],
  overlay: ['colour', 'from', 'need', 'floor', 'cap', 'fade'],
  graphic: ['ref', 'at', 'size', 'edge', 'dx', 'dy', 'flip', 'tint', 'rot'],
  // a pattern (design/surfaces.tsx) and the words that cross a shape's edge (their own group under Style)
  backdrop: ['pattern', 'colour', 'second', 'scale', 'density', 'opacity', 'angle', 'seed', 'mask', 'at'],
  art: ['shapes'],
  text: ['overlap'],
  'fitted-stack': ['overlap'],
};

// ---- a 3 x 3 pad of nine named points ----
const NINE = [['left top', 'top', 'right top'], ['left', 'center', 'right'], ['left bottom', 'bottom', 'right bottom']];
const SLOTS = [['top-left', 'top', 'top-right'], ['left', 'center', 'right'], ['bottom-left', 'bottom', 'bottom-right']];
const NAMES = [['Top left', 'Top', 'Top right'], ['Left', 'Middle', 'Right'], ['Bottom left', 'Bottom', 'Bottom right']];
function NinePad({ label, value, values, onPick, disabled }: { label: string; value: string | undefined; values: string[][]; onPick: (v: string) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid size-[72px] shrink-0 grid-cols-3 grid-rows-3 rounded-md border bg-muted/40 p-0.5 max-sm:size-24">
      {values.map((row, r) => row.map((v, c) => {
        const on = v === value;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} aria-label={NAMES[r]![c]!} title={NAMES[r]![c]} disabled={disabled} onClick={() => onPick(v)}
            className="grid place-items-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60">
            <span className={cn('size-2 rounded-full border border-foreground/30 transition-colors', on ? 'size-3 border-primary bg-primary' : 'bg-background')} />
          </button>
        );
      }))}
    </div>
  );
}

// ================================================================== gradient
const DIRECTIONS: Array<[number, ReactNode, string]> = [
  [180, <ArrowDown key="d" className="size-3.5" aria-hidden="true" />, 'Down'], [90, <ArrowRight key="r" className="size-3.5" aria-hidden="true" />, 'To the right'],
  [135, <ArrowDownRight key="dr" className="size-3.5" aria-hidden="true" />, 'Down to the right'], [45, <ArrowUpRight key="ur" className="size-3.5" aria-hidden="true" />, 'Up to the right'],
  [0, <ArrowUp key="u" className="size-3.5" aria-hidden="true" />, 'Up'], [270, <ArrowLeft key="l" className="size-3.5" aria-hidden="true" />, 'To the left'],
];
// A preview of the gradient in the brand's colours (the panel only; the page is drawn by the engine from the roles).
export function gradientPreview(g: Json, swatches: Record<string, string>): string {
  const stops = Array.isArray(g.stops) ? (g.stops as string[]) : [];
  const pos = stops.length === 3 ? [0, typeof g.mid === 'number' ? g.mid : 50, 100] : [0, 100];
  const list = stops.map((s, i) => `${swatchOf(swatches, s)} ${pos[i]}%`).join(',');
  return g.kind === 'radial' ? `radial-gradient(${g.shape === 'circle' ? 'circle' : 'ellipse'} at ${typeof g.at === 'string' ? g.at : 'center'},${list})` : `linear-gradient(${typeof g.angle === 'number' ? g.angle : 180}deg,${list})`;
}

// The gradient of an element (`name`: the property that holds it): a gradient area's own, or a box's gradient fill.
export function GradientChoices({ ctx, name = 'gradient' }: { ctx: Ctx; name?: string }) {
  const [error, setError] = useState('');
  const g: Json = isObj(ctx.el[name]) ? (ctx.el[name] as Json) : { kind: 'linear', stops: ['field', 'dark'] };
  const desc = ctx.cat.elements[String(ctx.el.type)]?.properties[name] as Desc | undefined;
  const props = desc?.props ?? {};
  const stops = Array.isArray(g.stops) ? [...(g.stops as string[])] : ['field', 'dark'];
  const fills = ctx.cat.lists.fillRoles as string[];
  const write = (next: Json) => setError(ctx.set(name, next));
  const patch = (o: Json) => { const next: Json = { ...g, ...o }; for (const [k, v] of Object.entries(o)) if (v === undefined) delete next[k]; write(next); };
  const setKind = (kind: string) => patch(kind === 'radial' ? { kind, angle: undefined } : { kind, at: undefined, shape: undefined });
  const setStop = (i: number, v: string | undefined) => { if (!v) return ''; const s = [...stops]; s[i] = v; const m = ctx.set(name, { ...g, stops: s }); setError(m); return m; };
  const addMiddle = () => patch({ stops: [stops[0]!, stops[0]!, stops[stops.length - 1]!] });
  const dropMiddle = () => patch({ stops: [stops[0]!, stops[stops.length - 1]!], mid: undefined });
  const angle = typeof g.angle === 'number' ? g.angle : 180;
  return (
    <Group title="Gradient" hint="A blend of two or three of the brand's colours. Words on it must read on every one of its colours."
      fine={<>
        {g.kind !== 'radial' && props.angle && <NumberInput label="Direction (degrees)" value={g.angle} desc={props.angle} optional disabled={ctx.disabled} onChange={(v) => { const m = ctx.set(name, v === undefined ? (() => { const n = { ...g }; delete n.angle; return n; })() : { ...g, angle: v }); setError(m); return m; }} />}
        {g.kind === 'radial' && props.shape && <ValueControl name={`${name}.shape`} desc={props.shape} value={g.shape} ctx={ctx} optional onChange={(v) => { const m = ctx.set(name, v === undefined ? (() => { const n = { ...g }; delete n.shape; return n; })() : { ...g, shape: v }); setError(m); return m; }} />}
        {stops.length === 3 && props.mid && <NumberInput label="Middle colour at (%)" value={g.mid} desc={props.mid} optional disabled={ctx.disabled} onChange={(v) => { const n = { ...g, mid: v }; if (v === undefined) delete n.mid; const m = ctx.set(name, n); setError(m); return m; }} />}
      </>}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-7 w-16 shrink-0 rounded-md border border-foreground/15" style={{ backgroundImage: gradientPreview({ ...g, stops }, ctx.swatches) }} />
        <Segmented label="Kind" value={g.kind === 'radial' ? 'radial' : 'linear'} disabled={ctx.disabled} onChange={setKind}
          options={[{ value: 'linear', label: 'Linear', title: 'Along a direction' }, { value: 'radial', label: 'Radial', title: 'Out from a point' }]} />
      </div>
      <div className="flex flex-col gap-2">
        {stops.map((s, i) => (
          <div key={i} className="flex items-end gap-1">
            <div className="min-w-0 flex-1"><RolePicker label={i === 0 ? 'From' : i === stops.length - 1 ? 'To' : 'Middle'} value={s} roles={fills} swatches={ctx.swatches} disabled={ctx.disabled} onChange={(v) => setStop(i, v)} /></div>
            {stops.length === 3 && i === 1 && <button type="button" aria-label="Remove the middle colour" title="Remove the middle colour" disabled={ctx.disabled} onClick={dropMiddle} className="mb-0.5 grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"><X className="size-3.5" aria-hidden="true" /></button>}
          </div>
        ))}
        {stops.length === 2 && <button type="button" disabled={ctx.disabled} onClick={addMiddle} className="inline-flex w-fit items-center gap-1 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"><Plus className="size-3.5" aria-hidden="true" />Add a middle colour</button>}
      </div>
      {g.kind === 'radial' ? (
        <div className="flex items-center gap-3">
          <NinePad label="Spreads from" value={typeof g.at === 'string' ? g.at : 'center'} values={NINE} disabled={ctx.disabled} onPick={(at) => patch({ at: at === 'center' ? undefined : at })} />
          <p className="text-[12.5px] text-muted-foreground">Where the first colour sits; it spreads out from there.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Label>Direction</Label>
          <Chips label="Direction" value={DIRECTIONS.some(([a]) => a === angle) ? String(angle) : null} custom disabled={ctx.disabled}
            options={DIRECTIONS.map(([a, icon, title]) => ({ value: String(a), label: icon, title }))} onChange={(v) => patch({ angle: Number(v) === 180 ? undefined : Number(v) })} />
        </div>
      )}
      <Err m={error} />
    </Group>
  );
}

// A box's fill: one colour or a gradient (the toggle swaps one for the other in a single step each).
export function BoxFillToggle({ ctx }: { ctx: Ctx }) {
  const [error, setError] = useState('');
  const on = isObj(ctx.el.gradient);
  const toggle = () => {
    if (on) { const m = ctx.set('gradient', undefined); setError(m); return; }
    const from = typeof ctx.el.fill === 'string' ? ctx.el.fill : 'field';
    const m = (ctx.el.fill !== undefined ? ctx.set('fill', undefined) : '') || ctx.set('gradient', { kind: 'linear', stops: [from, from === 'dark' ? 'field' : 'dark'] });
    setError(m);
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1.5"><ToggleChip on={on} disabled={ctx.disabled} onClick={toggle} title="Fill it with a blend of brand colours instead of one">Gradient fill</ToggleChip></div>
      <Err m={error} />
    </div>
  );
}

// ================================================================== colour over a picture
const FROM: Array<{ value: string; label: string; title: string }> = [
  { value: 'bottom', label: 'From the foot', title: 'Strongest at the foot, fading upwards' }, { value: 'top', label: 'From the top', title: 'Strongest at the top, fading downwards' },
  { value: 'flat', label: 'Even', title: 'The same strength all over' },
];
export function OverlayChoices({ ctx }: { ctx: Ctx }) {
  const [error, setError] = useState('');
  const props = ctx.cat.elements.overlay?.properties ?? {};
  const from = typeof ctx.el.from === 'string' ? ctx.el.from : 'bottom';
  const pick = (v: string) => setError((v === 'flat' && ctx.el.fade !== undefined ? ctx.set('fade', undefined) : '') || ctx.set('from', v));
  const fine = (['need', 'floor', 'cap', ...(from === 'flat' ? [] : ['fade'])] as const).filter((n) => props[n]).map((n) => (
    <ValueControl key={n} name={n} desc={props[n]!} value={ctx.el[n]} ctx={ctx} optional onChange={(v) => ctx.set(n, v)} />
  ));
  return (
    <Group title="Colour over the picture" hint="Laid over the picture so the words on it read. When the post is drawn it is made just strong enough for the words to reach their contrast on this picture." fine={fine}>
      <Chips label="Strongest" value={from} disabled={ctx.disabled} options={FROM.map((o) => ({ value: o.value, label: <><OverlayIcon from={o.value} />{o.label}</>, title: o.title }))} onChange={pick} />
      <RolePicker label="Colour" value={typeof ctx.el.colour === 'string' ? ctx.el.colour : 'ink'} roles={ctx.cat.lists.fillRoles as string[]} swatches={ctx.swatches} disabled={ctx.disabled}
        hint="The words on it must read on this colour." onChange={(v) => ctx.set('colour', v)} />
      <Err m={error} />
    </Group>
  );
}
function OverlayIcon({ from }: { from: string }) {
  const bg = from === 'flat' ? 'rgb(0 0 0 / .55)' : `linear-gradient(to ${from === 'bottom' ? 'top' : 'bottom'},rgb(0 0 0 / .75),transparent)`;
  return <span aria-hidden="true" className="mr-1 inline-block h-3.5 w-3 rounded-sm border border-foreground/20" style={{ background: bg }} />;
}

// ================================================================== brand graphics and cut-outs
const SIZES: Array<[string, string]> = [['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']];
export function GraphicChoices({ ctx }: { ctx: Ctx }) {
  const { graphics, loading, error: loadError } = useBrandGraphics();
  const [error, setError] = useState('');
  const props = ctx.cat.elements.graphic?.properties ?? {};
  const ref = typeof ctx.el.ref === 'string' ? ctx.el.ref : undefined;
  const chosen = graphics.find((g) => g.id === ref);
  const say = (m: string) => setError(m);
  const size = ctx.el.size === undefined ? 'm' : ctx.el.size;
  const sizeDesc = props.size as (Desc & { forms?: Array<{ is: string; desc: Desc }> }) | undefined;
  const pxDesc = sizeDesc?.forms?.find((f) => f.is === 'number')?.desc;
  return (
    <>
      <Group title="Graphic" hint="One of the brand's cut-outs or graphics (Pictures, Cut-outs and Graphics). Only pictures with a transparent background are offered.">
        {loading && <p className="text-[12.5px] text-muted-foreground">Loading the brand's graphics…</p>}
        {loadError && <p className="text-[12.5px] text-destructive" role="alert">The brand's graphics could not be loaded.</p>}
        {!loading && !graphics.length && <p className="text-[12.5px] text-muted-foreground">The brand has no cut-outs or graphics yet. Upload one under Pictures, then choose it here.</p>}
        {graphics.length > 0 && (
          <div role="radiogroup" aria-label="Which graphic" className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto pr-0.5">
            {graphics.map((g) => (
              <button key={g.id} type="button" role="radio" aria-checked={g.id === ref} title={`${g.name}${g.role === 'cutout' ? ' (cut-out)' : g.tintable ? ' (recolourable)' : ''}`} disabled={ctx.disabled}
                onClick={() => say(ctx.set('ref', g.id))}
                className={cn('relative grid aspect-square place-items-center overflow-hidden rounded-md border bg-[repeating-conic-gradient(#0000000d_0_25%,transparent_0_50%)] bg-[length:12px_12px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', g.id === ref && 'ring-2 ring-primary')}>
                {g.thumbnailUrl ? <img src={g.thumbnailUrl} alt={g.name} className="max-h-full max-w-full object-contain" /> : <span className="px-1 text-[11px] text-muted-foreground">{g.name}</span>}
              </button>
            ))}
          </div>
        )}
        {ref && !chosen && !loading && <p className="text-[12.5px] font-medium text-destructive" role="alert">The graphic this piece names is not among the brand's graphics any more; choose another.</p>}
        <Err m={error} />
      </Group>
      <Group title="Place and size" fine={<>
        {props.dx && <ValueControl name="dx" desc={props.dx} value={ctx.el.dx} ctx={ctx} optional onChange={(v) => ctx.set('dx', v)} />}
        {props.dy && <ValueControl name="dy" desc={props.dy} value={ctx.el.dy} ctx={ctx} optional onChange={(v) => ctx.set('dy', v)} />}
        {pxDesc && <NumberInput label="Width (pixels)" value={typeof size === 'number' ? size : undefined} desc={pxDesc} optional disabled={ctx.disabled} onChange={(v) => ctx.set('size', v ?? 'm')} />}
        {props.rot && <div className="col-span-2"><AngleControl label="Turn" value={ctx.el.rot} ctx={ctx} disabled={ctx.disabled} onChange={(v) => ctx.rotate(v)} /></div>}
      </>}>
        <div className="flex items-start gap-3">
          <NinePad label="Where on the page" value={typeof ctx.el.at === 'string' ? ctx.el.at : 'bottom-right'} values={SLOTS} disabled={ctx.disabled} onPick={(v) => say(ctx.set('at', v))} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <Chips label="Size" value={typeof size === 'string' ? size : null} custom disabled={ctx.disabled} options={SIZES.map(([v, l]) => ({ value: v, label: l, title: `${l === 'S' ? 'Small' : l === 'M' ? 'Medium' : l === 'L' ? 'Large' : 'Extra large'}` }))} onChange={(v) => say(ctx.set('size', v))} />
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip on={ctx.el.flip === true} disabled={ctx.disabled} onClick={() => say(ctx.set('flip', ctx.el.flip === true ? undefined : true))} title="Mirror it left to right"><FlipHorizontal2 className="mr-1 size-3.5" aria-hidden="true" />Mirror</ToggleChip>
              <ToggleChip on={ctx.el.edge === true} disabled={ctx.disabled} onClick={() => say(ctx.set('edge', ctx.el.edge === true ? undefined : true))} title="Against the page edge instead of inside the margins">On the edge</ToggleChip>
            </div>
          </div>
        </div>
      </Group>
      {(chosen?.tintable || ctx.el.tint !== undefined) && (
        <Group title="Colour">
          <RolePicker label="Recolour" value={typeof ctx.el.tint === 'string' ? ctx.el.tint : undefined} roles={ctx.cat.lists.fillRoles as string[]} swatches={ctx.swatches} optional disabled={ctx.disabled}
            hint={chosen?.tintable ? 'Leave it unset to keep its own colours.' : 'This graphic is not marked as recolourable, so it keeps its own colours.'} onChange={(v) => ctx.set('tint', v)} />
        </Group>
      )}
    </>
  );
}

// The capability group of an element, or null for any other type.
export function CapabilityGroups({ ctx }: { ctx: Ctx }) {
  switch (String(ctx.el.type)) {
    case 'gradient': return <GradientChoices ctx={ctx} />;
    case 'overlay': return <OverlayChoices ctx={ctx} />;
    case 'graphic': return <GraphicChoices ctx={ctx} />;
    case 'backdrop': return <BackdropChoices ctx={ctx} />;
    case 'art': return <ArtChoices ctx={ctx} />;
    default: return null;
  }
}
