// The pages of a carousel of post pages: a cover, body pages and a closing page, 2 to 10. Each page is a card holding the post form
// (a kind and its words); pages move, are added before the closing page and are removed. The look draws each page as its own image.
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Notice } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { postKindName } from './catalogue';
import { PostFields } from './PostFields';
import { MAX_PAGES, MIN_PAGES, addBodyPage, imageLimitProblems, movePostPage, pageTitle, postPagesOf, removePostPage, withPostPage } from './post-carousel';
import type { PostKindInfo, PostLimits } from '../design-model';
import type { Json } from './types';

interface Props {
  design: Json;
  onChange: (next: Json) => void;
  direction: string | null | undefined;
  kinds?: PostKindInfo[];
  limits?: PostLimits | null;
  offered?: string[] | null;
  // where the post goes, to say when a network takes fewer images than the carousel has
  networks?: readonly string[];
  disabled?: boolean;
}

export function PostPagesEditor({ design, onChange, direction, kinds, limits, offered, networks = [], disabled }: Props) {
  const pages = postPagesOf(design);
  // Each page keeps an id of its own so that an open card stays open when it moves.
  const nextId = useRef(0);
  const fresh = () => ++nextId.current;
  const [ids, setIds] = useState<number[]>(() => pages.map(fresh));
  const [open, setOpen] = useState<Set<number>>(() => new Set(ids.slice(0, 1)));
  const [focusId, setFocusId] = useState<number | null>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const same = ids.length === pages.length;
  useEffect(() => { if (!same) setIds(pages.map(fresh)); }, [same, pages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = same ? ids : pages.map((_, i) => ids[i] ?? -1 - i);
  useEffect(() => { if (focusId === null) return; buttons.current.get(focusId)?.focus(); setFocusId(null); }, [focusId, ids]);

  const toggle = (id: number) => setOpen((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  function move(i: number, by: -1 | 1) {
    const j = i + by;
    if (j < 0 || j >= pages.length) return;
    const nextIds = [...shown];
    [nextIds[i], nextIds[j]] = [nextIds[j]!, nextIds[i]!];
    setIds(nextIds);
    onChange(movePostPage(design, i, by));
    setFocusId(nextIds[j]!);
  }
  function remove(i: number) {
    if (pages.length <= MIN_PAGES) return;
    setIds(shown.filter((_, k) => k !== i));
    onChange(removePostPage(design, i));
  }
  function add() {
    if (pages.length >= MAX_PAGES) return;
    const id = fresh(), at = pages.length >= 2 ? pages.length - 1 : pages.length;
    setIds([...shown.slice(0, at), id, ...shown.slice(at)]);
    setOpen((cur) => new Set(cur).add(id));
    onChange(addBodyPage(design));
    setFocusId(id);
  }
  const tooMany = imageLimitProblems(pages.length, networks);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">Pages</h4>
        <span className="text-[13px] text-muted-foreground">{pages.length} of {MAX_PAGES}. The first page is the cover, the last the closing page.</span>
      </div>
      {tooMany.map((m) => <Notice key={m} tone="warn">{m}</Notice>)}
      {pages.map((page, i) => {
        const id = shown[i]!, isOpen = open.has(id), n = i + 1, kind = typeof page.kind === 'string' ? page.kind : '';
        return (
          <section key={id} className="rounded-lg border" aria-label={pageTitle(i, pages.length)}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <button
                type="button" aria-expanded={isOpen} aria-controls={`post-page-${id}`} onClick={() => toggle(id)}
                ref={(el) => { if (el) buttons.current.set(id, el); else buttons.current.delete(id); }}
                className="inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-md px-1 text-left text-sm font-semibold outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11"
              >
                {isOpen ? <ChevronDown className="size-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="size-4 shrink-0" aria-hidden="true" />}
                <span>{pageTitle(i, pages.length)}</span>
                {kind && <span className="truncate font-normal text-muted-foreground">{postKindName(kind)}</span>}
              </button>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="max-sm:size-11" aria-label={`Move page ${n} up`} title="Move up" disabled={disabled || i === 0} onClick={() => move(i, -1)}><ArrowUp aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" className="max-sm:size-11" aria-label={`Move page ${n} down`} title="Move down" disabled={disabled || i === pages.length - 1} onClick={() => move(i, 1)}><ArrowDown aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" className="max-sm:size-11" aria-label={`Remove page ${n}`} title={pages.length <= MIN_PAGES ? `A carousel needs at least ${MIN_PAGES} pages` : 'Remove page'} disabled={disabled || pages.length <= MIN_PAGES} onClick={() => remove(i)}><Trash2 aria-hidden="true" /></Button>
              </div>
            </div>
            {isOpen && (
              <div id={`post-page-${id}`} className="border-t p-3">
                <PostFields design={page} onChange={(next) => onChange(withPostPage(design, i, next))} direction={direction} kinds={kinds} limits={limits} offered={offered} disabled={disabled} />
              </div>
            )}
          </section>
        );
      })}
      <div>
        <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={disabled || pages.length >= MAX_PAGES} onClick={add}><Plus aria-hidden="true" />Add a page</Button>
        {pages.length >= MAX_PAGES && <span className="ml-2 text-[13px] text-muted-foreground">A carousel has at most {MAX_PAGES} pages.</span>}
      </div>
    </div>
  );
}
