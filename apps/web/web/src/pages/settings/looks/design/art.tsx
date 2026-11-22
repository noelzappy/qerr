// The design editor's choices for the art layer (an `art` element: decorative shapes in the brand's colours behind or around the words).
// Visual first: the shapes as chips (pick one), then for the picked shape its colour as brand swatches, its strength, moves and a size step, and
// Delete; a new shape from a short list. The exact numbers of the shape (centre, radius, line width, turn, blend ...) are behind "Fine-tune",
// read from the catalogue. Every change goes through ctx.set('shapes', ...), so the model checks the list against the catalogue.
import { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Plus, Trash2 } from 'lucide-react';
import { NumberInput, RolePicker, ValueControl, type Ctx } from '../design-controls';
import type { Desc, Json } from '../look-types';
import { Chips, Group, Label } from './ui';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const SHAPE_WORDS: Record<string, string> = { circle: 'Circle', ellipse: 'Oval', rect: 'Rectangle', ring: 'Ring', arc: 'Arc', line: 'Line', path: 'Path', dots: 'Dots', stripes: 'Stripes' };
// What a new shape starts as: quiet, in the middle of the box, in a soft brand colour (thousandths of the box, pixels for widths).
export const NEW_SHAPE: Record<string, Json> = {
  circle: { shape: 'circle', cx: 500, cy: 500, r: 200, colour: 'soft' },
  ring: { shape: 'ring', cx: 500, cy: 500, r: 220, stroke: 6, colour: 'accent', opacity: 0.6 },
  rect: { shape: 'rect', x: 300, y: 300, w: 400, h: 300, radius: 60, colour: 'soft' },
  line: { shape: 'line', x1: 200, y1: 500, x2: 800, y2: 500, stroke: 4, colour: 'accent' },
  arc: { shape: 'arc', cx: 500, cy: 500, r: 300, from: 270, sweep: 120, stroke: 8, colour: 'accent' },
  dots: { shape: 'dots', x: 600, y: 600, w: 300, h: 300, gap: 28, size: 4, colour: 'dark', opacity: 0.25 },
};
// the numbers a move and a size step change, by shape (thousandths of the box)
const MOVE: Record<string, Array<[string, 'x' | 'y']>> = {
  circle: [['cx', 'x'], ['cy', 'y']], ellipse: [['cx', 'x'], ['cy', 'y']], ring: [['cx', 'x'], ['cy', 'y']], arc: [['cx', 'x'], ['cy', 'y']],
  rect: [['x', 'x'], ['y', 'y']], dots: [['x', 'x'], ['y', 'y']], stripes: [['x', 'x'], ['y', 'y']], line: [['x1', 'x'], ['y1', 'y'], ['x2', 'x'], ['y2', 'y']],
};
const SIZE: Record<string, string[]> = { circle: ['r'], ring: ['r'], arc: ['r'], ellipse: ['rx', 'ry'], rect: ['w', 'h'], dots: ['w', 'h'], stripes: ['w', 'h'] };
const STEP = 25;
const clampPos = (v: number) => Math.max(-1000, Math.min(2000, Math.round(v)));
const clampSize = (v: number) => Math.max(1, Math.min(3000, Math.round(v)));

export function ArtChoices({ ctx }: { ctx: Ctx }) {
  const shapes = Array.isArray(ctx.el.shapes) ? (ctx.el.shapes as Json[]).filter(isObj) : [];
  const [at, setAt] = useState(0);
  const [error, setError] = useState('');
  const i = Math.min(at, Math.max(0, shapes.length - 1));
  const s = shapes[i] ?? null;
  const forms = ((ctx.cat.elements.art?.properties.shapes as unknown as { of?: { forms?: Record<string, Desc & { props?: Record<string, Desc> }> } })?.of?.forms) ?? {};
  const write = (next: Json[]): string => { const m = ctx.set('shapes', next); setError(m); return m; };
  const change = (patch: (x: Json) => Json): string => (s ? write(shapes.map((x, k) => (k === i ? patch({ ...x }) : x))) : '');
  const setKey = (k: string, v: unknown): string => change((x) => { if (v === undefined) delete x[k]; else x[k] = v; return x; });
  const move = (dx: number, dy: number) => change((x) => { for (const [k, axis] of MOVE[String(x.shape)] ?? []) if (typeof x[k] === 'number') x[k] = clampPos((x[k] as number) + (axis === 'x' ? dx : dy)); if (Array.isArray(x.d)) x.d = (x.d as unknown[][]).map((c) => c.map((v, n) => (typeof v === 'number' ? clampPos(v + (n % 2 === 1 ? dx : dy)) : v))); return x; });
  const grow = (k: number) => change((x) => { for (const key of SIZE[String(x.shape)] ?? []) if (typeof x[key] === 'number') x[key] = clampSize((x[key] as number) * k); return x; });
  const add = (shape: string) => { if (!NEW_SHAPE[shape]) return; if (!write([...shapes, { ...NEW_SHAPE[shape] }])) setAt(shapes.length); };
  const remove = () => { if (shapes.length <= 1) { setError('Art needs at least one shape; remove the art itself to have none.'); return; } if (!write(shapes.filter((_, k) => k !== i))) setAt(Math.max(0, i - 1)); };
  const form = s ? forms[String(s.shape)] : undefined;
  const fine = form?.props ? Object.entries(form.props).filter(([k]) => !['shape', 'colour'].includes(k)) : [];
  const fillRoles = (ctx.cat.lists.fillRoles as string[]) ?? [];
  return (
    <>
      <Group title="Shapes" hint="Decoration behind or around the words. The page checks that no shape covers a letter, and measures the words on it.">
        <Label>Shape</Label>
        <Chips label="Shape" value={s ? String(i) : null} options={shapes.map((x, k) => ({ value: String(k), label: `${k + 1} ${SHAPE_WORDS[String(x.shape)] ?? String(x.shape)}` }))} onChange={(v) => { setAt(Number(v)); setError(''); }} disabled={ctx.disabled} />
        <Label>Add a shape</Label>
        <Chips label="Add a shape" value={null} options={Object.keys(NEW_SHAPE).map((k) => ({ value: k, label: <><Plus className="mr-1 size-3" aria-hidden="true" />{SHAPE_WORDS[k]}</> }))} onChange={add} disabled={ctx.disabled} />
        {error && <p className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}
      </Group>
      {s && (
        <Group title={`${SHAPE_WORDS[String(s.shape)] ?? 'Shape'} ${i + 1}`}
          fine={<>{fine.map(([k, d]) => (
            <div key={k} className="col-span-2">
              {d.kind === 'number' ? <NumberInput label={d.label ?? k} value={s[k]} desc={d} optional={!(form?.required ?? []).includes(k)} disabled={ctx.disabled} onChange={(v) => setKey(k, v)} />
                : <ValueControl name={k} desc={d} value={s[k]} ctx={ctx} optional={!(form?.required ?? []).includes(k)} onChange={(v) => setKey(k, v)} />}
            </div>
          ))}</>}>
          {s.gradient === undefined && <RolePicker label="Colour" value={typeof s.colour === 'string' ? s.colour : 'accent'} roles={fillRoles} swatches={ctx.swatches} disabled={ctx.disabled} onChange={(v) => setKey('colour', v)} />}
          <Label>Strength</Label>
          <input type="range" min={5} max={100} step={5} aria-label="Strength" disabled={ctx.disabled} value={Math.round((typeof s.opacity === 'number' ? s.opacity : 1) * 100)}
            onChange={(e) => setKey('opacity', Number(e.target.value) >= 100 ? undefined : Number(e.target.value) / 100)} className="w-full accent-primary" />
          <Label>Move and size</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {[[<ArrowLeft key="l" className="size-3.5" />, -STEP, 0, 'Move left'], [<ArrowRight key="r" className="size-3.5" />, STEP, 0, 'Move right'], [<ArrowUp key="u" className="size-3.5" />, 0, -STEP, 'Move up'], [<ArrowDown key="d" className="size-3.5" />, 0, STEP, 'Move down']].map(([icon, dx, dy, label]) => (
              <button key={String(label)} type="button" aria-label={String(label)} title={String(label)} disabled={ctx.disabled} onClick={() => move(dx as number, dy as number)} className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-accent">{icon}</button>
            ))}
            {SIZE[String(s.shape)] && <>
              <button type="button" aria-label="Smaller" title="Smaller" disabled={ctx.disabled} onClick={() => grow(0.9)} className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-accent"><Minus className="size-3.5" /></button>
              <button type="button" aria-label="Larger" title="Larger" disabled={ctx.disabled} onClick={() => grow(1.1)} className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-accent"><Plus className="size-3.5" /></button>
            </>}
            <button type="button" disabled={ctx.disabled} onClick={remove} className="ml-auto inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[12.5px] font-medium text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5" aria-hidden="true" />Delete shape</button>
          </div>
        </Group>
      )}
    </>
  );
}
