// The canvas of the design editor: the design at feed proportions, scaled to fit, in two layers.
//
//   picture      the real image when the server can make one (and "Real image" is chosen), else a schematic drawn here from the design's own
//                places: a box for each element with its plain name, text as its field's name at roughly its size, in the brand's colours.
//                The schematic makes the editor fully usable before the renderer exists.
//   interaction  one transparent target for each element (so a press selects it), the selected element's outline with eight handles and a
//                turning handle. Rectangles come from the page's own measurements when it has made the picture (correct for elements whose
//                size is only known when drawn), else from the design's places. While something is dragged the outline follows the new place
//                at once; the picture follows a moment later (the editor asks for it again about 400 ms after the last change).
//
// Dragging snaps to the page grid (cells), or to 4 px for an element placed in pixels or anchored; the readout says where it is
// ("Columns 5-12, rows 2-6"). The turning handle snaps to the look's named angles; "Advanced" lets it turn freely within -15 to 15 degrees.
// Keyboard (with the canvas focused): arrows move by a cell (4 px when placed free), Shift with an arrow resizes, [ and ] send the
// element back and forward, Escape lets go, Delete removes it (the editor offers Undo). An element with no place of its own (it flows in
// its box) is selected but not moved here: it moves by reordering, or by editing its box.
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import {
  angleDegrees, applyRect, dragBase, dragRect, elementAt, elementName, firstSize, gridOf, listTree, moveByCells, namedAngles, nearestAngle, PAGE, placeForm, placeReadout, resizeByCells, setRotation, sketchRect,
  type Handle, type Rect, type TreeRow,
} from './design-model';
import { roleWord, swatchOf, type Swatches } from './design-colours';
import type { DesignPreviewState } from './use-design-preview';
import type { Json, LookCatalogue } from './look-types';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const boxStyle = (r: Rect): CSSProperties => ({ left: pct(r.x, PAGE.w), top: pct(r.y, PAGE.h), width: pct(r.w, PAGE.w), height: pct(r.h, PAGE.h) });

const HANDLES: Array<{ h: Handle; cls: string; cursor: string }> = [
  { h: 'nw', cls: '-left-1.5 -top-1.5', cursor: 'cursor-nwse-resize' }, { h: 'n', cls: 'left-1/2 -top-1.5 -translate-x-1/2', cursor: 'cursor-ns-resize' },
  { h: 'ne', cls: '-right-1.5 -top-1.5', cursor: 'cursor-nesw-resize' }, { h: 'e', cls: '-right-1.5 top-1/2 -translate-y-1/2', cursor: 'cursor-ew-resize' },
  { h: 'se', cls: '-bottom-1.5 -right-1.5', cursor: 'cursor-nwse-resize' }, { h: 's', cls: 'left-1/2 -bottom-1.5 -translate-x-1/2', cursor: 'cursor-ns-resize' },
  { h: 'sw', cls: '-bottom-1.5 -left-1.5', cursor: 'cursor-nesw-resize' }, { h: 'w', cls: '-left-1.5 top-1/2 -translate-y-1/2', cursor: 'cursor-ew-resize' },
];
// A tint for each kind of piece, as the classic sketch does.
const TINT: Record<string, string> = {
  text: 'border-sky-600/50 bg-sky-500/10', 'fitted-stack': 'border-sky-600/50 bg-sky-500/15', numeral: 'border-sky-600/50 bg-sky-500/15', 'mantra-rows': 'border-sky-600/50 bg-sky-500/10', rows: 'border-sky-600/50 bg-sky-500/10',
  photo: 'border-amber-700/50 bg-amber-500/25', seam: 'border-amber-700/50 bg-amber-500/15', scrim: 'border-dashed border-zinc-600/50 bg-zinc-800/20',
  sticker: 'border-indigo-700/50 bg-indigo-500/15', box: 'border-zinc-500/50 bg-zinc-500/5', band: 'border-zinc-500/50 bg-zinc-500/10',
  block: 'border-emerald-700/50 bg-emerald-500/20', rule: 'border-emerald-700/50 bg-emerald-500/20', frame: 'border-dashed border-zinc-500/50 bg-transparent', keyline: 'border-dashed border-zinc-500/50 bg-transparent',
  glyph: 'border-violet-600/40 bg-violet-500/10', 'meta-row': 'border-violet-600/40 bg-violet-500/10', 'wordmark-pattern': 'border-dashed border-zinc-500/40 bg-transparent', 'punch-hole': 'border-zinc-600/50 bg-zinc-500/15',
};
const GROUND_ROLE: Record<string, string> = { paper: 'paper', field: 'field', dark: 'dark', accent: 'gold', soft: 'soft', tint: 'light-tint' };
const FILL_KEYS = ['fill', 'colour'] as const;

export interface CanvasProps {
  comp: Json; look: Json; cat: LookCatalogue; selected: string | null; onSelect: (path: string | null) => void;
  onChange: (next: Json) => void; onGestureEnd: () => void; onRemove: (path: string) => void; onReorder: (path: string, by: -1 | 1) => void; onNotice: (message: string) => void;
  preview: DesignPreviewState; view: 'sketch' | 'real'; showGrid: boolean; readOnly: boolean; advanced: boolean; swatches: Swatches; className?: string;
}
interface Drag { id: number; path: string; h: Handle | 'turn'; x0: number; y0: number; base: Rect | null; on: boolean; last: string; comp: Json; centre?: { x: number; y: number } }

export function DesignCanvas(p: CanvasProps) {
  const { comp, look, cat, selected, preview, view, readOnly } = p;
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [readout, setReadout] = useState('');
  const g = gridOf(look);
  const rows = useMemo(() => listTree(comp, cat), [comp, cat]);
  const serverRects = useMemo(() => new Map(preview.rects.map((r) => [r.el, r])), [preview.rects]);
  const real = view === 'real' && !!preview.image;
  const showServer = preview.fresh && preview.rects.length > 0;

  // The rectangle of an element for the picture schematic and for hit targets: its place, else (guessed) size.
  const sketchOf = (path: string) => sketchRect(comp, path, look);
  // The rectangle the interaction layer uses: the page's own measurement when it is current, else the place.
  const rectFor = (path: string): { rect: Rect; rot: number; approx: boolean; measured: boolean } | null => {
    const s = showServer ? serverRects.get(path) : undefined;
    const el = elementAt(comp, path);
    const own = sketchOf(path);
    if (s && !(drag.current?.on && drag.current.path === path)) return { rect: { x: s.x, y: s.y, w: s.w, h: s.h }, rot: s.rot, approx: false, measured: true };
    if (own) return { rect: own.rect, rot: el ? angleDegrees(el.rot, look) : 0, approx: own.approx, measured: false };
    return null;
  };
  // A flow child has no rectangle of its own: its box's.
  const rectOrBox = (row: TreeRow) => rectFor(row.path) ?? (row.parentPath ? rectFor(row.parentPath) : null);

  // Back to front as the page paints (by the layer of the top piece, then document order); for pressing, the smallest piece last so that
  // a page-sized background or frame never hides the pieces on it.
  const paint = useMemo(() => {
    const zOf = (r: TreeRow) => { const top = r.path.split('.')[0]!; const t = rows.find((x) => x.path === top); return typeof t?.el.z === 'number' ? t.el.z : 0; };
    return [...rows].sort((a, b) => zOf(a) - zOf(b));
  }, [rows]);
  const hitOrder = useMemo(() => {
    const area = (r: TreeRow) => { const s = sketchRect(comp, r.path, look); return s ? s.rect.w * s.rect.h : 0; };
    return [...rows].sort((a, b) => area(b) - area(a));
  }, [rows, comp, look]);

  const sel = selected ? rows.find((r) => r.path === selected) ?? null : null;
  const selRect = sel ? rectOrBox(sel) : null;
  const selOwn = sel ? rectFor(sel.path) : null;
  const form = sel ? placeForm(sel.el, cat) : 'none';
  const canDrag = !!sel && !readOnly && (form === 'grid' || form === 'px' || form === 'anchor' || form === 'inset') && !!selOwn;
  const canTurn = !!sel && !readOnly && !!cat.elements[sel.type]?.properties.rot && sel.el.vertical === undefined && !!selOwn;
  const step = form === 'grid' || form === 'inset' ? null : 4;

  const toPage = (e: { clientX: number; clientY: number }) => {
    const b = root.current!.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * PAGE.w, y: ((e.clientY - b.top) / b.height) * PAGE.h };
  };

  const begin = (e: PointerEvent, path: string, h: Handle | 'turn') => {
    if (readOnly || e.button !== 0 || !root.current) return;
    const own = rectFor(path);
    const base = dragBase(comp, path, look, own?.measured ? own.rect : null);
    const pt = toPage(e);
    drag.current = { id: e.pointerId, path, h, x0: pt.x, y0: pt.y, base, on: false, last: '', comp, centre: own ? { x: own.rect.x + own.rect.w / 2, y: own.rect.y + own.rect.h / 2 } : undefined };
    root.current.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !root.current) return;
    const pt = toPage(e);
    const bounds = root.current.getBoundingClientRect();
    if (!d.on && Math.hypot(((pt.x - d.x0) / PAGE.w) * bounds.width, ((pt.y - d.y0) / PAGE.h) * bounds.height) < 3) return;
    d.on = true;
    const el = elementAt(d.comp, d.path);
    if (!el) return;
    if (d.h === 'turn') {
      if (!d.centre) return;
      let deg = (Math.atan2(pt.x - d.centre.x, -(pt.y - d.centre.y)) * 180) / Math.PI;
      if (deg > 180) deg -= 360;
      const tilt = isObj(look.dials) && typeof look.dials.tilt === 'number' ? look.dials.tilt : 1;
      const named = namedAngles(look, cat);
      let value: string | number | undefined;
      if (p.advanced) {
        const snap = nearestAngle(deg, look, cat);
        value = snap ? snap.name : Math.abs(deg) < 1 ? undefined : Math.max(-15, Math.min(15, Math.round(deg * 2) / 2));
      } else {
        // the nearest of straight and the look's named angles
        let best: string | undefined, bd = Math.abs(deg);
        for (const a of named) { const dd = Math.abs(a.deg * tilt - deg); if (dd < bd) { bd = dd; best = a.name; } }
        value = best;
      }
      const key = JSON.stringify(value ?? null);
      if (key === d.last) return;
      d.last = key;
      const r = setRotation(d.comp, d.path, value, look, cat);
      if (r.error) { p.onNotice(r.error); return; }
      d.comp = r.comp;
      p.onChange(r.comp);
      setReadout(value === undefined ? 'Straight' : typeof value === 'string' ? `Turned by the ${value} angle` : `Turned ${value}°`);
      return;
    }
    if (!d.base) return;
    const rect = dragRect(d.base, d.h, pt.x - d.x0, pt.y - d.y0, step);
    const r = applyRect(d.comp, d.path, rect, look, cat, d.base);
    const place = JSON.stringify(elementAt(r.comp, d.path)?.place);
    if (place === d.last) return;
    d.last = place;
    if (r.error) { p.onNotice(r.error); return; }
    p.onChange(r.comp);
    const moved = elementAt(r.comp, d.path);
    if (moved) setReadout(placeReadout(moved));
  };
  const end = (e: PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setReadout('');
    p.onGestureEnd();
    if (root.current?.hasPointerCapture(e.pointerId)) root.current.releasePointerCapture(e.pointerId);
  };

  const keys = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select, [role="combobox"]')) return;
    if (e.key === 'Escape') { if (selected) { e.preventDefault(); p.onSelect(null); } return; }
    if (!selected || !sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { if (!readOnly) { e.preventDefault(); p.onRemove(selected); } return; }
    if (e.key === '[' || e.key === ']') { if (!readOnly) { e.preventDefault(); p.onReorder(selected, e.key === '[' ? -1 : 1); } return; }
    const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key];
    if (!dir || readOnly) return;
    e.preventDefault();
    if (!canDrag) { p.onNotice('It is positioned by its box. Move it with [ and ], or change its box.'); return; }
    const r = e.shiftKey ? resizeByCells(comp, selected, dir[0]!, dir[1]!, look, cat) : moveByCells(comp, selected, dir[0]!, dir[1]!, look, cat);
    if (r.error) p.onNotice(r.error);
    else if (r.comp !== comp) { p.onChange(r.comp); const el = elementAt(r.comp, selected); if (el) setReadout(placeReadout(el)); setTimeout(() => { setReadout(''); p.onGestureEnd(); }, 900); }
  };

  const ground = typeof comp.ground === 'string' ? comp.ground : Array.isArray(comp.ground) ? String((comp.ground as Json[])[0]?.ground ?? 'paper') : 'paper';
  const pageColour = swatchOf(p.swatches, GROUND_ROLE[ground] ?? 'paper');
  const hasColours = Object.keys(p.swatches).length > 0;
  const cell = (v: number, of: number) => pct(v, of);

  return (
    <div
      ref={root}
      role="group" tabIndex={0}
      aria-label="Canvas. Press a piece to select it. Arrow keys move the selected piece, Shift with an arrow resizes it, [ and ] send it back and forward, Escape lets go and Delete removes it."
      className={cn('relative w-full select-none overflow-hidden rounded-md border text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', p.className)}
      style={{ aspectRatio: `${PAGE.w} / ${PAGE.h}`, containerType: 'inline-size', backgroundColor: hasColours ? pageColour : undefined }}
      onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('[data-hit],[data-handle]')) p.onSelect(null); }}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={keys}
    >
      {/* ---- the picture ---- */}
      {real
        ? <img src={preview.image} alt="The design as the page draws it" draggable={false} className={cn('pointer-events-none absolute inset-0 size-full object-fill', !preview.fresh && 'opacity-60')} />
        : (
          <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0', !hasColours && 'bg-white')}>
            {p.showGrid && g && (
              <>
                {Array.from({ length: g.cols }, (_, i) => <div key={`c${i}`} className="absolute bg-sky-400/10" style={{ left: cell(g.m.left + i * (g.colW + g.gutter), PAGE.w), width: cell(g.colW, PAGE.w), top: cell(g.m.top, PAGE.h), height: cell(PAGE.h - g.m.top - g.m.bottom, PAGE.h) }} />)}
                {g.rows > 0 && Array.from({ length: g.rows }, (_, i) => { const [y0, y1] = rowBand(g, i + 1); return <div key={`r${i}`} className="absolute border-y border-sky-500/20" style={{ left: cell(g.m.left, PAGE.w), right: cell(g.m.right, PAGE.w), top: cell(y0, PAGE.h), height: cell(y1 - y0, PAGE.h) }} />; })}
              </>
            )}
            {paint.map((r) => <SketchPiece key={r.path} row={r} rect={sketchOf(r.path)} comp={comp} look={look} cat={cat} swatches={p.swatches} rows={rows} sketchOf={sketchOf} />)}
          </div>
        )}
      {real && p.showGrid && g && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {Array.from({ length: g.cols }, (_, i) => <div key={i} className="absolute border-x border-sky-500/25" style={{ left: cell(g.m.left + i * (g.colW + g.gutter), PAGE.w), width: cell(g.colW, PAGE.w), top: 0, bottom: 0 }} />)}
        </div>
      )}

      {/* ---- the interaction layer ---- */}
      {hitOrder.map((r) => {
        const rf = rectFor(r.path);
        if (!rf) return null;
        const isSel = r.path === selected;
        return (
          <button
            key={r.path} type="button" data-hit={r.path} tabIndex={-1} aria-label={r.name} title={r.name}
            onPointerDown={(e) => { e.stopPropagation(); p.onSelect(r.path); const f = placeForm(r.el, cat); if (!readOnly && f !== 'flow' && f !== 'none') begin(e, r.path, 'move'); }}
            onClick={(e) => { e.stopPropagation(); if (e.detail === 0) p.onSelect(r.path); }}
            className={cn('absolute rounded-[1px] bg-transparent p-0 outline-none hover:outline hover:outline-1 hover:outline-primary/40', isSel && canDrag && 'cursor-move touch-none')}
            style={{ ...boxStyle(rf.rect), transform: rf.rot ? `rotate(${rf.rot}deg)` : undefined }}
          />
        );
      })}

      {sel && selRect && (
        <div className="pointer-events-none absolute z-20" style={{ ...boxStyle(selRect.rect), transform: selRect.rot ? `rotate(${selRect.rot}deg)` : undefined }}>
          <div className={cn('absolute inset-0 border-2', selOwn ? 'border-primary' : 'border-dashed border-primary/70', selRect.approx && 'border-dashed')} />
          {canDrag && HANDLES.map(({ h, cls, cursor }) => (
            <span key={h} aria-hidden="true" data-handle={h} onPointerDown={(e) => { e.stopPropagation(); begin(e, sel.path, h); }}
              className={cn('pointer-events-auto absolute z-30 size-3 touch-none rounded-sm border-2 border-primary bg-background before:absolute before:-inset-2 before:content-[""] pointer-coarse:size-4 pointer-coarse:before:-inset-3', cls, cursor)} />
          ))}
          {canTurn && (
            <span aria-hidden="true" data-handle="turn" title="Turn" onPointerDown={(e) => { e.stopPropagation(); begin(e, sel.path, 'turn'); }}
              className="pointer-events-auto absolute left-1/2 -top-7 z-30 size-3.5 -translate-x-1/2 cursor-grab touch-none rounded-full border-2 border-primary bg-background before:absolute before:-inset-2.5 before:content-[''] pointer-coarse:size-5">
              <span className="absolute left-1/2 top-full h-3.5 w-px -translate-x-1/2 bg-primary" />
            </span>
          )}
          {!selOwn && <span className="absolute left-0 top-full mt-1 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[max(10px,1.3cqw)] text-background">Positioned by its box</span>}
        </div>
      )}
      {readout && <div role="status" className="pointer-events-none absolute left-1 top-1 z-40 rounded bg-foreground px-2 py-0.5 text-[12px] font-medium text-background shadow">{readout}</div>}
      {sel && <span className="sr-only" aria-live="polite">{`${elementName(sel.el, cat)} selected. ${placeReadout(sel.el)}`}</span>}
    </div>
  );
}

function rowBand(g: NonNullable<ReturnType<typeof gridOf>>, row: number): [number, number] {
  const top = g.head > 0 ? (row === 1 ? g.m.top : g.m.top + g.head + g.gutter + (row - 2) * (g.rowH + g.gutter)) : g.m.top + (row - 1) * (g.rowH + g.gutter);
  const bottom = g.head > 0 && row === 1 ? g.m.top + g.head : top + g.rowH;
  return [top, bottom];
}

// One element of the schematic: a box with its plain name, text as its field's name at about its size, in the brand's colours when known.
function SketchPiece({ row, rect, comp, look, cat, swatches, rows, sketchOf }: {
  row: TreeRow; rect: { rect: Rect; approx: boolean } | null; comp: Json; look: Json; cat: LookCatalogue; swatches: Swatches; rows: TreeRow[]; sketchOf: (path: string) => { rect: Rect; approx: boolean } | null;
}) {
  const el = row.el;
  // a flow child is drawn inside its box, below
  if (!rect) return null;
  const type = row.type;
  const name = elementName(el, cat);
  const size = firstSize(el, look);
  const fillRole = FILL_KEYS.map((k) => (typeof el[k] === 'string' ? (el[k] as string) : undefined)).find(Boolean);
  const hasColours = Object.keys(swatches).length > 0;
  const bg = hasColours && fillRole && ['box', 'band', 'sticker', 'block', 'rule', 'punch-hole'].includes(type) ? swatchOf(swatches, fillRole) : undefined;
  const ink = hasColours && typeof el.ink === 'string' ? swatchOf(swatches, el.ink) : undefined;
  const kids = rows.filter((r) => r.parentPath === row.path && !r.slot && !sketchOf(r.path));
  const textual = ['text', 'fitted-stack', 'numeral', 'mantra-rows', 'rows', 'sticker', 'meta-row', 'glyph'].includes(type);
  const rot = angleDegrees(el.rot, look);
  const fs = size ? Math.max(1.3, Math.min(14, (size / PAGE.w) * 100 * 0.9)) : type === 'sticker' ? 3 : 2;
  return (
    <div
      className={cn('absolute flex overflow-hidden rounded-[2px] border leading-none', TINT[type] ?? 'border-zinc-500/40', rect.approx && 'border-dashed', (type === 'frame' || type === 'keyline') && 'border-2', type === 'sticker' && el.shape !== 'tile' && 'rounded-full')}
      style={{ ...boxStyle(rect.rect), backgroundColor: bg, color: ink, transform: rot ? `rotate(${rot}deg)` : undefined, zIndex: typeof el.z === 'number' ? el.z : undefined }}
      data-sketch={row.path}
    >
      {textual && type !== 'glyph' && type !== 'meta-row' && (
        <span className="m-[0.6cqw] truncate font-semibold" style={{ fontSize: `${fs}cqw` }}>{name}</span>
      )}
      {type === 'glyph' && <span className="m-auto font-serif opacity-40" style={{ fontSize: `${Math.min(30, (Number(el.size) || 400) / 10.8 * 0.8)}cqw` }}>{String(el.glyph ?? '“')}</span>}
      {type === 'meta-row' && <span className="m-[0.6cqw] truncate text-[max(8px,1.3cqw)] uppercase tracking-wide opacity-70">Top label row</span>}
      {!textual && !['block', 'rule', 'frame', 'keyline', 'wordmark-pattern', 'punch-hole', 'scrim'].includes(type) && (
        <span className="m-[0.6cqw] truncate text-[max(8px,1.3cqw)] font-medium uppercase tracking-wide opacity-70">{name}</span>
      )}
      {kids.length > 0 && (
        <span className="m-[0.6cqw] flex min-w-0 flex-1 flex-col gap-[0.4cqw]">
          {kids.map((k) => (
            <span key={k.path} className="truncate rounded-[2px] border border-sky-600/40 bg-sky-500/10 px-[0.5cqw] py-[0.3cqw] font-semibold" style={{ fontSize: `${Math.max(1.3, Math.min(5, ((firstSize(k.el, look) ?? 44) / PAGE.w) * 100 * 0.9))}cqw` }}>{k.name}</span>
          ))}
        </span>
      )}
      {type === 'scrim' && <span className="m-[0.6cqw] truncate text-[max(8px,1.3cqw)] uppercase opacity-60">Dark fade</span>}
    </div>
  );
}

