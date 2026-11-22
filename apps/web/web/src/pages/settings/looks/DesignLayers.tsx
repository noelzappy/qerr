// The left pane of the design editor: the layers (the elements in document order, back to front, as a tree: a box shows the pieces in it), each with
// its icon, plain name, an eye when it is shown only under a condition, buttons to send it back or forward, and a menu (copy, remove, move into or out of
// a box). Below, the library of pieces from the engine's catalogue, grouped; adding respects the limits and says why when it cannot.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, Frame, Hash, Image, Layers, LayoutGrid, Minus, PanelTop, Plus, Quote, Square, Circle, Type, Sparkles, SeparatorHorizontal, Scissors, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { CheckField, MoreMenu, type MoreMenuItem } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  addEdgeSticker, addElement, duplicateElement, elementName, libraryGroups, listTree, moveInto, moveOut, moveToIndex, oneLine, readWhen, reorderElement, whenText, whyNotAdd,
  type Edit, type Json, type TreeRow,
} from './design-model';
import type { LookCatalogue } from './look-types';

const ICON: Record<string, typeof Type> = {
  text: Type, 'fitted-stack': Type, numeral: Hash, 'mantra-rows': Repeat, rows: LayoutGrid, photo: Image, seam: Scissors, scrim: Layers, sticker: Circle, box: Square, band: SeparatorHorizontal,
  block: Square, rule: Minus, frame: Frame, keyline: Square, glyph: Quote, 'meta-row': PanelTop, 'wordmark-pattern': Sparkles, 'punch-hole': Circle,
};
export const iconOf = (type: string) => ICON[type] ?? Square;

export interface LayersProps {
  comp: Json; look: Json; cat: LookCatalogue; selected: string | null; onSelect: (path: string | null) => void; readOnly: boolean;
  apply: (fn: (c: Json) => Edit, key?: string) => string;
  // takes an element out of the design, with Undo
  onRemove: (path: string) => void;
}

export function DesignLayers({ comp, look, cat, selected, onSelect, readOnly, apply, onRemove }: LayersProps) {
  const rows = listTree(comp, cat);
  const [dragging, setDragging] = useState<string | null>(null);
  const [into, setInto] = useState(false);
  const sel = selected ? rows.find((r) => r.path === selected) ?? null : null;
  const selInfo = sel ? cat.elements[sel.type] : null;
  const container = sel && selInfo?.container && !sel.slot ? sel : null;
  const parentPath = into && container ? container.path : '';

  const run = (fn: (c: Json) => Edit, then?: (e: Edit) => void): string => {
    let last: Edit | null = null;
    const why = apply((c) => { last = fn(c); return last; });
    if (why) toast.error(why); else if (last && then) then(last);
    return why;
  };
  const add = (type: string) => {
    const why = whyNotAdd(comp, type, cat, parentPath, look);
    if (why) { toast.error(why); return; }
    run((c) => addElement(c, type, look, cat, parentPath), (e) => { if (e.path) onSelect(e.path); });
  };

  const menu = (r: TreeRow): MoreMenuItem[] => {
    const info = cat.elements[r.type];
    const boxes = rows.filter((x) => !x.slot && cat.elements[x.type]?.container && x.path !== r.path && !x.path.startsWith(`${r.path}.`) && x.path !== r.parentPath).slice(0, 4);
    return [
      { label: 'Duplicate', disabled: readOnly || r.slot, onSelect: () => run((c) => duplicateElement(c, r.path, look, cat), (e) => e.path && onSelect(e.path)) },
      ...(r.type === 'seam' ? [{ label: 'Add a sticker on the edge', disabled: readOnly || !!(r.el.sticker), onSelect: () => run((c) => addEdgeSticker(c, r.path, look, cat), (e) => e.path && onSelect(e.path)) }] : []),
      ...(r.parentPath && !r.slot ? [{ label: 'Move out of its box', disabled: readOnly, onSelect: () => run((c) => moveOut(c, r.path, look, cat), (e) => e.path && onSelect(e.path)) }] : []),
      ...(info?.flow || info?.placement === 'required' ? boxes.map((b) => ({ label: `Move into ${elementName(b.el, cat)}${b.parentPath ? '' : ''}`, disabled: readOnly || r.slot, onSelect: () => run((c) => moveInto(c, r.path, b.path, cat), (e) => e.path && onSelect(e.path)) })) : []),
      { label: 'Remove', tone: 'danger' as const, disabled: readOnly, onSelect: () => onRemove(r.path) },
    ];
  };

  const siblings = (r: TreeRow) => rows.filter((x) => x.parentPath === r.parentPath && !x.slot);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section aria-label="Layers" className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[13.5px] font-semibold">Layers</h2>
          <span className="text-[12px] text-muted-foreground">Back to front</span>
        </div>
        <TooltipProvider delayDuration={150}>
          <ul className="flex flex-col gap-0.5">
            {rows.map((r) => {
              const Icon = iconOf(r.type);
              const w = readWhen(r.el);
              const hasWhen = !!(w.present || w.absent);
              const sibs = siblings(r);
              const idx = sibs.findIndex((x) => x.path === r.path);
              const isSel = r.path === selected;
              return (
                <li key={r.path}
                  draggable={!readOnly && !r.slot} onDragStart={(e) => { setDragging(r.path); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.path); }} onDragEnd={() => setDragging(null)}
                  onDragOver={(e) => { if (dragging && dragging !== r.path && dragging.split('.').slice(0, -1).join('.') === r.parentPath && !r.slot) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); const from = dragging; setDragging(null); if (from && from !== r.path && idx >= 0) { const to = Number(r.path.split('.').pop()); run((c) => moveToIndex(c, from, to), (x) => x.path && onSelect(x.path)); } }}
                  className={cn('flex items-center gap-0.5 rounded-md', isSel && 'bg-accent', dragging === r.path && 'opacity-50')} style={{ paddingLeft: `${(r.depth - 1) * 14}px` }}>
                  <button type="button" aria-pressed={isSel} onClick={() => onSelect(isSel ? null : r.path)}
                    className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-[13px] outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11">
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 truncate">{r.name}</span>
                    {r.flows && <span className="shrink-0 text-[11.5px] text-muted-foreground">flows</span>}
                  </button>
                  {hasWhen && (
                    <Tooltip>
                      <TooltipTrigger asChild><button type="button" aria-label={whenText(w, cat)} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:size-11"><Eye className="size-3.5" aria-hidden="true" /></button></TooltipTrigger>
                      <TooltipContent>{whenText(w, cat)}</TooltipContent>
                    </Tooltip>
                  )}
                  {!r.slot && (
                    <>
                      <Button type="button" size="icon-sm" variant="ghost" className="max-sm:size-11" aria-label={`Send ${r.name} back`} disabled={readOnly || idx <= 0} onClick={() => run((c) => reorderElement(c, r.path, -1), (e) => e.path && onSelect(e.path))}><ArrowUp /></Button>
                      <Button type="button" size="icon-sm" variant="ghost" className="max-sm:size-11" aria-label={`Bring ${r.name} forward`} disabled={readOnly || idx >= sibs.length - 1} onClick={() => run((c) => reorderElement(c, r.path, 1), (e) => e.path && onSelect(e.path))}><ArrowDown /></Button>
                    </>
                  )}
                  <MoreMenu label={`More actions for ${r.name}`} items={menu(r)} className="size-7" />
                </li>
              );
            })}
          </ul>
        </TooltipProvider>
      </section>

      <section aria-label="Add a piece" className="flex flex-col gap-3">
        <h2 className="text-[13.5px] font-semibold">Add a piece</h2>
        {container && <CheckField label={`Inside ${elementName(container.el, cat)}`} checked={into} disabled={readOnly} onCheckedChange={setInto} />}
        <TooltipProvider delayDuration={150}>
          {libraryGroups(cat).map((g) => (
            <div key={g.title}>
              <h3 className="mb-1 text-[12px] font-medium text-muted-foreground">{g.title}</h3>
              <ul className="grid grid-cols-2 gap-1">
                {g.types.map((t) => {
                  const info = cat.elements[t]!;
                  const why = readOnly ? 'This look is in use and cannot be changed' : whyNotAdd(comp, t, cat, parentPath, look);
                  const Icon = iconOf(t);
                  return (
                    <li key={t}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" aria-disabled={why ? true : undefined} onClick={() => (why ? toast.error(why) : add(t))}
                            className={cn('flex min-h-8 w-full items-center gap-1.5 rounded-md border px-2 text-left text-[12.5px] outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11', why && 'opacity-50')}>
                            <Plus className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" /><Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 truncate">{info.label}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64">{why || oneLine(info.help)}</TooltipContent>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </TooltipProvider>
      </section>
    </div>
  );
}
