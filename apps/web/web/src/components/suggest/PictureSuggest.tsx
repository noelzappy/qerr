// Picture descriptions suggested by the AI (POST /api/suggest/picture-description), for the upload page's picture cards and any
// page that shows one picture.
//
//   <PictureSuggestProvider>           around the list: checks once whether suggestions can run, and lets
//     <DescribeAllButton />            describe every card that has no description yet, one at a time;
//     <PictureSuggest ... />           per card: "Describe with AI", then "Suggested by the AI · Use · Edit".
//   </PictureSuggestProvider>
//
// A suggestion is only shown. "Use" hands it to the page (`onUse`), which puts it in the card's editable fields; "Edit" does the
// same and asks the page to open the fields. `peopleVisible` is shown as a hint to check consent and is never turned into a
// consent or a "people can be recognised" setting. A picture from the person's disk is scaled down in the browser first (at
// most 1568 px on the long side, JPEG), so it stays under the 5 MB the AI reads and costs less.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2, Sparkles, TriangleAlert, X } from 'lucide-react';
import { api } from '@/api';
import { BusyButton } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { AiMark, useSuggestReady, type SuggestReady } from './shared';

export interface PictureSuggestion { title?: string; description: string; tags?: string[]; peopleVisible: boolean }
export type PictureSource = { file: File; title?: string; role?: string } | { vaultItemId: string };

const MAX_EDGE = 1568;
const MAX_BYTES = 4.5 * 1024 * 1024;

// The picture as the AI should get it: scaled down when it is large. Falls back to the file itself when the browser cannot
// decode it (the server then checks the type and the size).
export async function pictureForAi(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file;
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { return file; }
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= MAX_BYTES) { bmp.close(); return file; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const g = canvas.getContext('2d');
  if (!g) { bmp.close(); return file; }
  g.fillStyle = '#ffffff'; // a transparent cut-out on white, since JPEG has no transparency
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((ok) => canvas.toBlob((b) => ok(b ?? file), 'image/jpeg', 0.85));
}

// The one call, for any page that wants a description without this component.
export async function describePicture(source: PictureSource): Promise<PictureSuggestion> {
  if ('vaultItemId' in source) return api.post<PictureSuggestion>('/api/suggest/picture-description', { vaultItemId: source.vaultItemId });
  const form = new FormData();
  const blob = await pictureForAi(source.file);
  form.append('file', blob, blob === source.file ? source.file.name : source.file.name.replace(/\.[^.]*$/, '') + '.jpg');
  if (source.title?.trim()) form.append('title', source.title.trim());
  if (source.role) form.append('role', source.role);
  return api.upload<PictureSuggestion>('/api/suggest/picture-description', form);
}

// A suggestion merged into a card's fields: the description; the title only while it is still the one made from the file name
// (`autoTitle`), so a title someone typed is kept; the tags added to the ones there. Tags are a comma-separated text, as the
// upload page holds them. Never touches people or consent.
export function pictureSuggestionPatch(current: { title: string; tags: string }, s: PictureSuggestion, autoTitle: string): { title: string; body: string; tags: string } {
  const have = current.tags.split(',').map((t) => t.trim()).filter(Boolean);
  const tags = [...new Set([...have, ...(s.tags ?? [])])].slice(0, 30);
  const keepTitle = current.title.trim() && current.title.trim() !== autoTitle.trim();
  return { title: keepTitle || !s.title ? current.title : s.title, body: s.description, tags: tags.join(', ') };
}

// ---- the list: availability and "Describe all" ----

interface Entry { wanted: () => boolean; run: () => Promise<void> }
interface Group { ready: SuggestReady | null; register: (id: string, e: Entry) => () => void; entries: () => Entry[] }
const GroupCtx = createContext<Group | null>(null);

export function PictureSuggestProvider({ children }: { children: ReactNode }) {
  const ready = useSuggestReady();
  const map = useRef(new Map<string, Entry>());
  const register = useCallback((id: string, e: Entry) => { map.current.set(id, e); return () => { map.current.delete(id); }; }, []);
  const value = useMemo<Group>(() => ({ ready, register, entries: () => [...map.current.values()] }), [ready, register]);
  return <GroupCtx.Provider value={value}>{children}</GroupCtx.Provider>;
}

// Describes, one after another, every picture in the group that has no description and no suggestion yet.
export function DescribeAllButton({ disabled = false, className }: { disabled?: boolean; className?: string }) {
  const group = useContext(GroupCtx);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  if (!group) return null;
  const blocked = group.ready && !group.ready.available ? group.ready.reason : null;
  async function run() {
    const todo = group!.entries().filter((e) => e.wanted());
    setProgress({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      await todo[i]!.run();
      setProgress({ done: i + 1, total: todo.length });
    }
    setProgress(null);
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <BusyButton variant="outline" size="sm" loading={!!progress} disabled={disabled || !!blocked} onClick={() => void run()}>
        {!progress && <Sparkles aria-hidden="true" />}
        {progress ? `Describing ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : 'Describe all with AI'}
      </BusyButton>
      {blocked
        ? <span className="text-[12.5px] text-muted-foreground">{blocked}</span>
        : <span className="text-[12.5px] text-muted-foreground">For pictures without a description. You check each one.</span>}
    </div>
  );
}

// ---- one picture ----

// 'dismissed' looks like 'idle' but "Describe all" leaves it alone: the person has seen a suggestion and said no.
type State = { phase: 'idle' } | { phase: 'dismissed' } | { phase: 'working' } | { phase: 'error'; message: string } | { phase: 'shown'; s: PictureSuggestion } | { phase: 'used' };

export function PictureSuggest({ id, source, hasDescription, disabled = false, onUse, className }: {
  id: string;
  source: PictureSource;
  // Whether the card already has a description; "Describe all" leaves those alone.
  hasDescription: boolean;
  disabled?: boolean;
  // mode 'edit': the page should also open the fields so the person can change the words.
  onUse: (s: PictureSuggestion, mode: 'use' | 'edit') => void;
  className?: string;
}) {
  const group = useContext(GroupCtx);
  const [state, setState] = useState<State>({ phase: 'idle' });
  const live = useRef({ source, state, hasDescription });
  live.current = { source, state, hasDescription };

  const run = useCallback(async () => {
    setState({ phase: 'working' });
    try {
      setState({ phase: 'shown', s: await describePicture(live.current.source) });
    } catch (err) {
      setState({ phase: 'error', message: errorMessage(err) });
    }
  }, []);

  useEffect(() => group?.register(id, {
    wanted: () => !live.current.hasDescription && ['idle', 'error'].includes(live.current.state.phase),
    run,
  }), [group, id, run]);

  const blocked = group?.ready && !group.ready.available;
  const use = (s: PictureSuggestion, mode: 'use' | 'edit') => { onUse(s, mode); setState({ phase: 'used' }); };

  if (state.phase === 'idle' || state.phase === 'dismissed') {
    // When suggestions cannot run the reason is said once, by DescribeAllButton, not on every card.
    if (blocked) return null;
    return (
      <button type="button" disabled={disabled} onClick={() => void run()}
        className={cn('inline-flex min-h-6 items-center gap-1 rounded-sm font-medium text-foreground outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 max-sm:min-h-11', className)}>
        <Sparkles className="size-3.5" aria-hidden="true" />Describe with AI
      </button>
    );
  }
  if (state.phase === 'working') {
    return <span role="status" className={cn('inline-flex items-center gap-1.5', className)}><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />Describing the picture</span>;
  }
  if (state.phase === 'used') return <AiMark className={className}>Filled in by the AI</AiMark>;
  if (state.phase === 'error') {
    return (
      <span role="alert" className={cn('inline-flex flex-wrap items-center gap-x-2 text-destructive', className)}>
        {state.message}
        <button type="button" disabled={disabled} onClick={() => void run()} className="rounded-sm font-medium text-foreground underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11">Try again</button>
      </span>
    );
  }
  const { s } = state;
  const name = s.title ?? 'this picture';
  return (
    <section aria-label={`Suggested description for ${name}`} className={cn('order-last basis-full rounded-md border bg-muted/40 px-3 py-2 text-[13px] text-foreground', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <AiMark />
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={disabled} aria-label={`Use the suggestion for ${name}`} onClick={() => use(s, 'use')}>Use</Button>
          <Button type="button" variant="ghost" size="sm" className="max-sm:min-h-11" disabled={disabled} aria-label={`Use and edit the suggestion for ${name}`} onClick={() => use(s, 'edit')}>Edit</Button>
          <Button type="button" variant="ghost" size="icon-sm" className="max-sm:size-11" aria-label={`Dismiss the suggestion for ${name}`} onClick={() => setState({ phase: 'dismissed' })}><X aria-hidden="true" /></Button>
        </div>
      </div>
      {s.title && <p className="m-0 mt-1 font-medium [overflow-wrap:anywhere]">{s.title}</p>}
      <p className="m-0 mt-0.5 [overflow-wrap:anywhere]">{s.description}</p>
      {s.tags && s.tags.length > 0 && (
        <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-1 p-0" aria-label="Suggested tags">
          {s.tags.map((t) => <li key={t} className="rounded-full bg-background px-2 py-0.5 text-[12px] text-muted-foreground">{t}</li>)}
        </ul>
      )}
      {s.peopleVisible && (
        <p className="m-0 mt-1.5 flex items-center gap-1 text-[12.5px] text-warning-foreground">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />People may be in this picture. Check it, and record consent if they can be recognised.
        </p>
      )}
    </section>
  );
}
