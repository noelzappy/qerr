// The pages of a carousel, 2 to 10. Each page is a card holding the same form as a single design.
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Notice } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { layoutName } from './catalogue';
import { MAX_PAGES, MIN_PAGES, chosenOf } from '../design-model';
import { PageFields, type SeriesOption } from './PageFields';
import type { Json, LayoutBrief } from './types';

const asObject = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

interface Props {
  pages: unknown;
  onChange: (next: Json[]) => void;
  brandLayouts: LayoutBrief[];
  series: SeriesOption[];
  disabled?: boolean;
}

export function PagesEditor({ pages, onChange, brandLayouts, series, disabled }: Props) {
  const list = Array.isArray(pages) ? pages.map(asObject) : [];
  // Each page keeps an id of its own so that an open card stays open when it moves.
  const nextId = useRef(0);
  const fresh = () => ++nextId.current;
  const [ids, setIds] = useState<number[]>(() => list.map(fresh));
  const [open, setOpen] = useState<Set<number>>(() => new Set(ids.slice(0, 1)));
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const [focusId, setFocusId] = useState<number | null>(null);

  // The pages were changed from outside (the advanced JSON): start the ids again.
  const same = ids.length === list.length;
  useEffect(() => { if (!same) setIds(list.map(fresh)); }, [same, list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownIds = same ? ids : list.map((_, i) => ids[i] ?? -1 - i);

  useEffect(() => {
    if (focusId === null) return;
    buttons.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId, ids]);

  function toggle(id: number) {
    setOpen((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function move(i: number, by: -1 | 1) {
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    const nextList = [...list];
    [nextList[i], nextList[j]] = [nextList[j]!, nextList[i]!];
    const nextIds = [...shownIds];
    [nextIds[i], nextIds[j]] = [nextIds[j]!, nextIds[i]!];
    setIds(nextIds);
    onChange(nextList);
    setFocusId(nextIds[j]!);
  }
  function remove(i: number) {
    if (list.length <= MIN_PAGES) return;
    setIds(shownIds.filter((_, k) => k !== i));
    onChange(list.filter((_, k) => k !== i));
  }
  function add() {
    if (list.length >= MAX_PAGES) return;
    const id = fresh();
    setIds([...shownIds, id]);
    setOpen((cur) => new Set(cur).add(id));
    onChange([...list, { template: 'closing' }]); // a closing page needs no words of its own
    setFocusId(id);
  }
  function edit(i: number, next: Json) {
    onChange(list.map((p, k) => (k === i ? next : p)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">Pages</h4>
        <span className="text-[13px] text-muted-foreground">{list.length} of {MAX_PAGES} pages. A carousel needs at least {MIN_PAGES}.</span>
      </div>
      {list.length < MIN_PAGES && <Notice tone="warn">A carousel needs at least {MIN_PAGES} pages. Add {MIN_PAGES - list.length === 1 ? 'one more' : 'some'} below.</Notice>}
      {list.map((page, i) => {
        const id = shownIds[i]!;
        const isOpen = open.has(id);
        const n = i + 1;
        const name = layoutName(chosenOf(page));
        return (
          <section key={id} className="rounded-lg border" aria-label={`Page ${n}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <button
                type="button"
                ref={(el) => { if (el) buttons.current.set(id, el); else buttons.current.delete(id); }}
                aria-expanded={isOpen}
                aria-controls={`page-body-${id}`}
                onClick={() => toggle(id)}
                className="inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-md px-1 text-left text-sm font-semibold outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11"
              >
                {isOpen ? <ChevronDown className="size-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="size-4 shrink-0" aria-hidden="true" />}
                <span>Page {n}</span>
                {name && <span className="truncate font-normal text-muted-foreground">{name}</span>}
              </button>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="max-sm:size-11" aria-label={`Move page ${n} up`} title="Move up" disabled={disabled || i === 0} onClick={() => move(i, -1)}><ArrowUp aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" className="max-sm:size-11" aria-label={`Move page ${n} down`} title="Move down" disabled={disabled || i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" className="max-sm:size-11" aria-label={`Remove page ${n}`} title={list.length <= MIN_PAGES ? 'A carousel needs at least 2 pages' : 'Remove page'} disabled={disabled || list.length <= MIN_PAGES} onClick={() => remove(i)}><Trash2 aria-hidden="true" /></Button>
              </div>
            </div>
            {isOpen && (
              <div id={`page-body-${id}`} className="border-t p-3">
                <PageFields inCarousel design={page} onChange={(next) => edit(i, next)} brandLayouts={brandLayouts} series={series} disabled={disabled} />
              </div>
            )}
          </section>
        );
      })}
      <div>
        <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={disabled || list.length >= MAX_PAGES} onClick={add}><Plus aria-hidden="true" />Add a page</Button>
        {list.length >= MAX_PAGES && <span className="ml-2 text-[13px] text-muted-foreground">A carousel has at most {MAX_PAGES} pages.</span>}
      </div>
    </div>
  );
}
