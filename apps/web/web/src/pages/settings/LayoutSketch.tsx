// A live sketch of a layout at one size: the grid, every block in its slot (running to the page edges it asks for) or at its pixel
// rectangle, the page's chrome roughly where the page puts it, with sample words, drawn in the browser as plain boxes. It shows
// where things go while the layout is edited; the real image always comes from Qerr (the preview button), which also runs the
// fit, contrast and enlargement checks.
//
// When `edit` is given the sketch is a canvas: press a block to select it, drag the selected block to move it and its edges and
// corners to resize it (snapped to grid cells, or to 4 px for a block placed in pixels). The arrow keys move the selected block by
// one cell (10 px), Shift with an arrow resizes it, Escape lets go of it and Delete removes it. Every change goes out as the new
// place, so the number fields and the check of the layout follow the drag; nothing here decides what is valid.
//
// A block with a condition is drawn as a post would draw it in the scenario given ("as if" sub were empty, on page 1 of a
// carousel ...; by default every field filled, a single post), and marked "if". A block the scenario leaves out is not drawn,
// unless it is the selected one: then it is drawn dashed and faded, so it can still be found and placed.
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { defaultScenario, dragPx, dragSlot, groundIn, holds, isBuiltPage, pxOn, pxWords, slotOn, slotWords, type Handle, type Scenario } from './layout-model';
import { BLOCK_LABEL, CHROME_RECT, cellOf, rectOf, type Block, type Catalogue, type Layout, type Px, type Slot } from './layout-types';

const SAMPLE: Record<string, string> = {
  headline: 'Every saving, on record.', sub: 'One clear line about the post.', line: 'saved by members this year', quote: 'We finally see where every euro goes.',
  myth: 'Group savings are hard to track.', factLead: 'Every payment is on the record.', fact: 'Each member sees the same ledger.', big: '14.8M+',
  label: 'Label', eyebrow: 'New this month', note: 'A short note', title: 'Window title', stats: '3,900+ members  ·  400+ groups', items: '✓ One  ✓ Two  ✓ Three',
};
const TINT: Record<string, string> = {
  headline: 'bg-sky-500/15 border-sky-600/50', sub: 'bg-sky-500/10 border-sky-600/40', label: 'bg-violet-500/10 border-violet-600/40', figure: 'bg-sky-500/15 border-sky-600/50',
  stats: 'bg-sky-500/10 border-sky-600/40', list: 'bg-sky-500/10 border-sky-600/40', photo: 'bg-amber-500/25 border-amber-700/50', screen: 'bg-emerald-500/20 border-emerald-700/50',
  logo: 'bg-zinc-500/15 border-zinc-600/50', website: 'bg-zinc-500/10 border-zinc-600/40', slab: 'bg-indigo-500/15 border-indigo-700/50', artefact: 'bg-orange-500/15 border-orange-700/50',
  decoration: 'bg-transparent border-dashed border-zinc-500/40', spacer: 'bg-transparent border-dashed border-zinc-400/40',
  bar: 'bg-zinc-500/15 border-zinc-600/50', runhead: 'bg-violet-500/10 border-violet-600/40', footer: 'bg-zinc-500/15 border-zinc-600/50', footlogo: 'bg-zinc-500/15 border-zinc-600/50',
  mark: 'bg-violet-500/10 border-violet-600/40', labelrow: 'bg-violet-500/10 border-violet-600/40', slabs: 'bg-indigo-500/15 border-indigo-700/50', halo: 'bg-transparent border-dashed border-emerald-600/40',
};

function words(b: Block, empty: string[]): string {
  if (b.type === 'label') return b.text ?? (b.field ? (empty.includes(b.field) ? '' : SAMPLE[b.field]) : b.source === 'series' ? 'Post type name' : b.source === 'brand' ? 'Brand name' : '02 / 05');
  if (b.type === 'website') return 'brand.example';
  if (b.type === 'logo') return 'Logo';
  if (b.type === 'bar') return 'Logo   brand.example';
  if (b.type === 'runhead') return 'Post type   Brand';
  if (b.type === 'footer' || b.type === 'footlogo') return 'Logo';
  if (b.type === 'mark' || b.type === 'labelrow') return 'Post type name';
  const f = b.field ?? ({ headline: 'headline', sub: 'sub', figure: 'big', stats: 'stats', list: 'items' } as Record<string, string>)[b.type];
  const main = f && !empty.includes(f) ? SAMPLE[f] ?? '' : '';
  const sub = typeof b.subField === 'string' && !empty.includes(b.subField) ? SAMPLE[b.subField] ?? '' : '';
  return [main, sub].filter(Boolean).join(' / ');
}

export interface SketchEdit {
  onPlace: (i: number, place: { slot: Slot } | { px: Px }) => void;
  onRemove: (i: number) => void;
  // a block the page runs the full width: it moves up and down only, and has nothing to resize
  fullWidth?: (i: number) => boolean;
}
const HANDLES: Array<{ h: Handle; cls: string; cursor: string }> = [
  { h: 'nw', cls: '-left-1.5 -top-1.5', cursor: 'cursor-nwse-resize' }, { h: 'n', cls: 'left-1/2 -top-1.5 -translate-x-1/2', cursor: 'cursor-ns-resize' },
  { h: 'ne', cls: '-right-1.5 -top-1.5', cursor: 'cursor-nesw-resize' }, { h: 'e', cls: '-right-1.5 top-1/2 -translate-y-1/2', cursor: 'cursor-ew-resize' },
  { h: 'se', cls: '-bottom-1.5 -right-1.5', cursor: 'cursor-nwse-resize' }, { h: 's', cls: 'left-1/2 -bottom-1.5 -translate-x-1/2', cursor: 'cursor-ns-resize' },
  { h: 'sw', cls: '-bottom-1.5 -left-1.5', cursor: 'cursor-nesw-resize' }, { h: 'w', cls: '-left-1.5 top-1/2 -translate-y-1/2', cursor: 'cursor-ew-resize' },
];
interface Drag { id: number; i: number; h: Handle; x0: number; y0: number; slot?: Slot; px?: Px; on: boolean; last: string }

export function LayoutSketch({ layout, size, catalogue, selected, onSelect, edit, showGrid = true, className, scenario }: {
  layout: Layout; size: string; catalogue: Catalogue; selected?: number | null; onSelect?: (i: number | null) => void;
  edit?: SketchEdit; showGrid?: boolean; className?: string; scenario?: Scenario;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [readout, setReadout] = useState('');
  const page = catalogue.sizes[size] ?? { w: 1080, h: 1350 };
  const g = layout.canvas?.[size];
  const built = isBuiltPage(layout), grid = showGrid && !built;
  if (!g || !(g.columns > 0) || !(g.rows > 0) || !Array.isArray(layout.blocks)) return <div className={cn('grid aspect-[4/5] place-items-center rounded-md border text-[12px] text-muted-foreground', className)}>No grid for this size</div>;
  const sc = scenario ?? defaultScenario(layout);
  const ground = groundIn(layout, sc, catalogue);
  const dark = catalogue.darkGrounds.includes(ground), photo = ground === 'photo';
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const box = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({ left: pct(r.x, page.w), top: pct(r.y, page.h), width: pct(r.w, page.w), height: pct(r.h, page.h) });
  const c = cellOf(g, page);
  const order = layout.blocks.map((b, i) => ({ b, i, on: holds(b.when, sc, layout, catalogue) }))
    .filter(({ i, on }) => on || i === selected)
    .sort((a, z) => Number(z.b.type === 'decoration') - Number(a.b.type === 'decoration'));

  // The place a block has on this size, for dragging: its pixels, else its cells (a block the page places itself has neither).
  const placeOf = (i: number) => { const b = layout.blocks[i]; const px = pxOn(b, size); const slot = px ? null : slotOn(b, size); return { slot, px }; };
  const begin = (e: PointerEvent, i: number, h: Handle) => {
    const { slot, px } = placeOf(i);
    if (!edit || (!slot && !px) || e.button !== 0) return;
    drag.current = { id: e.pointerId, i, h, x0: e.clientX, y0: e.clientY, slot: slot ?? undefined, px: px ?? undefined, on: false, last: '' };
    root.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !edit || !root.current) return;
    const rect = root.current.getBoundingClientRect();
    if (!d.on && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 3) return;
    d.on = true;
    const dx = ((e.clientX - d.x0) / rect.width) * page.w, dy = ((e.clientY - d.y0) / rect.height) * page.h;
    if (d.slot) {
      const next = dragSlot(d.slot, d.h, Math.round(dx / (c.w + c.gx || 1)), Math.round(dy / (c.h + c.gy || 1)), g);
      const key = JSON.stringify(next);
      if (key !== d.last) { d.last = key; edit.onPlace(d.i, { slot: next }); setReadout(slotWords(next)); }
    } else if (d.px) {
      const next = dragPx(d.px, d.h, dx, dy, page);
      const key = JSON.stringify(next);
      if (key !== d.last) { d.last = key; edit.onPlace(d.i, { px: next }); setReadout(pxWords(next)); }
    }
  };
  const end = (e: PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setReadout('');
    if (root.current?.hasPointerCapture(e.pointerId)) root.current.releasePointerCapture(e.pointerId);
  };
  const keys = (e: KeyboardEvent) => {
    if (!edit || selected == null || (e.target as HTMLElement).closest('input, textarea, select')) return;
    if (e.key === 'Escape') { e.preventDefault(); onSelect?.(null); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); edit.onRemove(selected); return; }
    const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key];
    if (!step) return;
    e.preventDefault();
    const { slot, px } = placeOf(selected);
    const full = edit.fullWidth?.(selected) ?? false;
    const resize = e.shiftKey && !full;
    const h: Handle = !resize ? 'move' : step[0] !== 0 ? 'e' : 's';
    if (slot) edit.onPlace(selected, { slot: dragSlot(slot, h, step[0], step[1], g) });
    else if (px) edit.onPlace(selected, { px: dragPx(px, h, step[0] * 10, step[1] * 10, page, 1) });
  };

  return (
    <div
      ref={root}
      className={cn('relative w-full overflow-hidden rounded-md border text-left', photo ? 'bg-amber-900/70 text-white' : dark ? 'bg-zinc-800 text-zinc-100' : 'bg-white text-zinc-900', edit && 'select-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', className)}
      style={{ aspectRatio: `${page.w} / ${page.h}`, containerType: 'inline-size' }}
      {...(edit
        ? {
          role: 'group', tabIndex: 0, 'aria-label': `Canvas for the ${size} size. Press a block to select it. Arrow keys move the selected block, Shift with an arrow resizes it, Escape lets go and Delete removes it.`,
          onPointerDown: (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('[data-block]')) onSelect?.(null); },
          onPointerMove: move, onPointerUp: end, onPointerCancel: end, onKeyDown: keys,
        }
        : { role: 'img', 'aria-label': `Sketch of the layout at ${size} size` })}
    >
      {photo && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[max(8px,1.4cqw)] uppercase tracking-wide opacity-60">Photo page colour</span>}
      {grid && Array.from({ length: g.columns }, (_, i) => (
        <div key={`c${i}`} aria-hidden="true" className="pointer-events-none absolute bg-sky-400/10" style={box({ x: c.m.left + i * (c.w + c.gx), y: c.m.top, w: c.w, h: page.h - c.m.top - c.m.bottom })} />
      ))}
      {grid && Array.from({ length: g.rows + 1 }, (_, i) => (
        <div key={`r${i}`} aria-hidden="true" className="pointer-events-none absolute h-px bg-sky-500/15" style={{ left: pct(c.m.left, page.w), right: pct(c.m.right, page.w), top: pct(c.m.top + i * (c.h + c.gy) - (i === g.rows ? c.gy : 0), page.h) }} />
      ))}
      {order.map(({ b, i, on }) => {
        const p = pxOn(b, size) ?? (built ? CHROME_RECT[b.type] ?? null : null), s = p ? null : slotOn(b, size);
        if (!s && !p) return null;
        const r = p ?? rectOf(g, page, s!, Array.isArray(b.bleed) ? b.bleed : []);
        const text = words(b, sc.empty);
        const big = ['headline', 'figure'].includes(b.type);
        const placed = !!edit && (!!pxOn(b, size) || !!slotOn(b, size));
        const isSel = selected === i;
        const full = edit?.fullWidth?.(i) ?? false;
        return (
          <div key={i} data-block className={cn('absolute', isSel && 'z-10')} style={box(r)}>
            <button
              type="button"
              onPointerDown={(e) => { if (!onSelect) return; if (edit) e.stopPropagation(); onSelect(i); if (placed) begin(e, i, 'move'); }}
              onClick={(e) => { e.stopPropagation(); if (e.detail === 0) onSelect?.(i); }}
              className={cn('absolute inset-0 flex flex-col overflow-hidden rounded-[2px] border p-[0.6cqw] text-left leading-tight', TINT[b.type] ?? 'border-zinc-500/40',
                !on && 'border-dashed opacity-45', isSel && 'ring-2 ring-primary ring-offset-1', placed && isSel && 'cursor-move touch-none')}
              style={{ justifyContent: b.valign === 'center' ? 'center' : b.valign === 'bottom' ? 'flex-end' : 'flex-start', textAlign: (b.align as CSSProperties['textAlign']) ?? 'left', fontSize: big ? '3.2cqw' : '1.8cqw' }}
              title={`${BLOCK_LABEL[b.type] ?? b.type}${b.when ? (on ? ' (shown in this case)' : ' (not drawn in this case)') : ''}`}
            >
              <span className="pointer-events-none flex items-center gap-1 truncate text-[max(8px,1.3cqw)] font-medium uppercase tracking-wide opacity-60">
                {BLOCK_LABEL[b.type] ?? b.type}
                {b.when !== undefined && <span className="rounded-sm bg-amber-400/80 px-[0.4cqw] text-[max(7px,1.1cqw)] text-zinc-950 normal-case">if</span>}
              </span>
              {b.type === 'slab' || b.type === 'slabs'
                ? (b.children ?? []).map((ch, k) => <span key={k} className={cn('pointer-events-none block', ['headline', 'figure'].includes(ch.type) && 'text-[2.6cqw] font-semibold')}>{words(ch, sc.empty)}</span>)
                : text && <span className={cn('pointer-events-none block', big && 'font-semibold')}>{text}</span>}
            </button>
            {isSel && placed && !full && HANDLES.map(({ h, cls, cursor }) => (
              <span key={h} aria-hidden="true" data-handle={h} onPointerDown={(e) => { e.stopPropagation(); begin(e, i, h); }}
                className={cn('absolute z-20 size-3 touch-none rounded-sm border-2 border-primary bg-background before:absolute before:-inset-2 before:content-[""] pointer-coarse:size-4 pointer-coarse:before:-inset-3', cls, cursor)} />
            ))}
          </div>
        );
      })}
      {readout && <div role="status" className="pointer-events-none absolute left-1 top-1 z-30 rounded bg-foreground px-2 py-0.5 text-[12px] font-medium text-background shadow">{readout}</div>}
    </div>
  );
}
