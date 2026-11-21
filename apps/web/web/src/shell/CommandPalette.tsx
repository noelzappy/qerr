// The search and command palette: Ctrl or Cmd plus K (or the Search button in the sidebar) opens a dialog with one box.
// It lists pages to go to and things to do, filtered as you type, and (from two letters) batches, facts and pictures whose
// title matches. It is a combobox over a listbox: arrows move, Enter chooses, Escape closes and focus goes back to where it was.
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, CornerDownLeft, Images, Lightbulb, PenLine, Search, Sparkles, Upload, UserPlus, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { api } from '../api';
import { useDebounced } from '../hooks';
import { useSession } from '../session';
import { kindLabel } from '../lib/labels';
import { MAIN, SETTINGS } from './nav';

type Group = 'Go to' | 'Actions' | 'Batches' | 'Facts' | 'Pictures';
const GROUPS: Group[] = ['Actions', 'Go to', 'Batches', 'Facts', 'Pictures'];
interface Entry { id: string; group: Group; label: string; hint?: string; icon: LucideIcon; to: string }

const PER_GROUP = 5;
const MIN_SEARCH = 2;

interface Remote { state: 'idle' | 'loading' | 'done'; failed: number; batches: Entry[]; facts: Entry[]; pictures: Entry[] }
const IDLE: Remote = { state: 'idle', failed: 0, batches: [], facts: [], pictures: [] };

interface PaletteApi { open: () => void }
const PaletteContext = createContext<PaletteApi | null>(null);
export const usePalette = () => useContext(PaletteContext);

export const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
export const shortcutLabel = () => (isMac() ? '⌘K' : 'Ctrl K');

const isTextEntry = (el: Element | null) => !!el && (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select') || (el as HTMLElement).isContentEditable);

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openIt = useCallback(() => setOpen(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.defaultPrevented) return;
      // Typing in a form inside a dialog or sheet keeps the keystroke.
      const t = e.target as Element | null;
      if (t && isTextEntry(t) && t.closest('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const value = useMemo(() => ({ open: openIt }), [openIt]);
  return (
    <PaletteContext.Provider value={value}>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </PaletteContext.Provider>
  );
}

function useStaticEntries(): Entry[] {
  const { me } = useSession();
  const isAdmin = me?.role === 'admin';
  return useMemo(() => {
    const out: Entry[] = [
      { id: 'a-ai', group: 'Actions', label: 'Draft posts with AI', icon: Sparkles, to: '/batches/ai-draft' },
      { id: 'a-batch', group: 'Actions', label: 'New batch by hand', icon: PenLine, to: '/batches/new' },
      { id: 'a-fact', group: 'Actions', label: 'Add a fact', icon: BookOpen, to: '/vault/new' },
      { id: 'a-pics', group: 'Actions', label: 'Upload pictures', icon: Upload, to: '/library?upload=1' },
    ];
    if (isAdmin) {
      out.push({ id: 'a-invite', group: 'Actions', label: 'Invite someone', icon: UserPlus, to: '/settings/team?invite=1' });
      out.push({ id: 'a-ref', group: 'Actions', label: 'Add a design reference', icon: Lightbulb, to: '/settings/references' });
    }
    for (const i of MAIN) out.push({ id: `p-${i.to}`, group: 'Go to', label: i.label, icon: i.icon, to: i.to });
    for (const s of SETTINGS) {
      if (s.adminOnly && !isAdmin) continue;
      for (const i of s.items) out.push({ id: `p-${i.to}`, group: 'Go to', label: i.label, hint: 'Settings', icon: i.icon, to: i.to });
    }
    return out;
  }, [isAdmin]);
}

const matches = (e: Entry, q: string) => {
  if (!q) return true;
  const hay = `${e.label} ${e.hint ?? ''}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};

interface BatchLite { id: string; title: string }
interface ItemLite { id: string; title: string; kind: string }

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const statics = useStaticEntries();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<Remote>(IDLE);
  const batchCache = useRef<BatchLite[] | null>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const needle = query.trim();
  const debounced = useDebounced(needle, 250);

  // Start clean each time it opens.
  useEffect(() => {
    if (open) { setQuery(''); setActive(0); setRemote(IDLE); batchCache.current = null; }
  }, [open]);

  // Search batches, facts and pictures by title once typing pauses.
  useEffect(() => {
    if (!open || debounced.length < MIN_SEARCH) { setRemote(IDLE); return; }
    let live = true;
    setRemote((r) => ({ ...r, state: 'loading' }));
    const enc = encodeURIComponent(debounced);
    const batches = batchCache.current
      ? Promise.resolve(batchCache.current)
      : api.get<{ batches: BatchLite[] }>('/api/batches').then((r) => { batchCache.current = r.batches; return r.batches; });
    void Promise.allSettled([
      batches,
      api.get<{ items: ItemLite[] }>(`/api/vault?q=${enc}&pageSize=${PER_GROUP}&page=1`),
      api.get<{ items: ItemLite[] }>(`/api/vault?q=${enc}&pageSize=${PER_GROUP}&page=1&images=true`),
    ]).then(([b, f, p]) => {
      if (!live) return;
      const low = debounced.toLowerCase();
      setRemote({
        state: 'done',
        failed: [b, f, p].filter((x) => x.status === 'rejected').length,
        batches: b.status === 'fulfilled' ? b.value.filter((x) => x.title.toLowerCase().includes(low)).slice(0, PER_GROUP).map((x) => ({ id: `b-${x.id}`, group: 'Batches' as const, label: x.title, icon: Lightbulb, to: `/batches/${x.id}` })) : [],
        facts: f.status === 'fulfilled' ? f.value.items.slice(0, PER_GROUP).map((x) => ({ id: `f-${x.id}`, group: 'Facts' as const, label: x.title, hint: kindLabel(x.kind), icon: BookOpen, to: `/vault/${x.id}` })) : [],
        pictures: p.status === 'fulfilled' ? p.value.items.slice(0, PER_GROUP).map((x) => ({ id: `i-${x.id}`, group: 'Pictures' as const, label: x.title, hint: kindLabel(x.kind), icon: Images, to: `/library?q=${encodeURIComponent(x.title)}` })) : [],
      });
    });
    return () => { live = false; };
  }, [open, debounced]);

  const searching = needle.length >= MIN_SEARCH;
  const waiting = searching && (needle !== debounced || remote.state === 'loading');
  const rows = useMemo(() => {
    const local = statics.filter((e) => matches(e, needle));
    const byGroup: Record<Group, Entry[]> = {
      Actions: local.filter((e) => e.group === 'Actions').slice(0, needle ? PER_GROUP : 6),
      'Go to': local.filter((e) => e.group === 'Go to').slice(0, needle ? 8 : 14),
      Batches: searching && !waiting ? remote.batches : [],
      Facts: searching && !waiting ? remote.facts : [],
      Pictures: searching && !waiting ? remote.pictures : [],
    };
    return GROUPS.flatMap((g) => byGroup[g]);
  }, [statics, needle, searching, waiting, remote]);

  useEffect(() => { setActive(0); }, [needle, rows.length]);
  useEffect(() => { document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' }); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (e: Entry) => { onOpenChange(false); navigate(e.to); };
  const onKeyDown = (ev: React.KeyboardEvent) => {
    const n = rows.length;
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); onOpenChange(false); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); if (n) setActive((a) => (a + 1) % n); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (n) setActive((a) => (a - 1 + n) % n); }
    else if (ev.key === 'Home' && n) { ev.preventDefault(); setActive(0); }
    else if (ev.key === 'End' && n) { ev.preventDefault(); setActive(n - 1); }
    else if (ev.key === 'Enter') { ev.preventDefault(); const row = rows[active]; if (row) choose(row); }
  };

  let index = -1;
  const statusText = searching
    ? waiting ? 'Searching batches, facts and pictures'
      : remote.failed === 3 ? 'Batches, facts and pictures could not be searched. Check your connection and try again.'
      : remote.failed > 0 ? 'Some results could not be loaded.'
      : !rows.length ? `Nothing matches "${needle}".`
      : ''
    : !rows.length ? `No page or action matches "${needle}".` : '';
  const isError = searching && !waiting && remote.failed > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" onKeyDown={onKeyDown}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Type to find a page, an action, a batch, a fact or a picture. Use the arrow keys and Enter.</DialogDescription>
        <div className="flex items-center gap-2.5 border-b px-3.5">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={rows.length ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-label="Search pages, actions, batches, facts and pictures"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or jump to"
            className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-[min(24rem,60dvh)] overflow-y-auto p-1.5">
          <div id={listId} role="listbox" aria-label="Results">
            {GROUPS.map((g) => {
              const items = rows.filter((r) => r.group === g);
              if (!items.length) return null;
              return (
                <div key={g} role="group" aria-labelledby={`${listId}-g-${g}`} className="pb-1">
                  <div id={`${listId}-g-${g}`} className="px-2.5 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">{g}</div>
                  {items.map((e) => {
                    index += 1;
                    const i = index;
                    const Icon = e.icon;
                    return (
                      <div
                        key={e.id}
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === active}
                        onMouseMove={() => setActive(i)}
                        onClick={() => choose(e)}
                        className={cn('flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] max-md:h-11', i === active && 'bg-accent text-accent-foreground')}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{e.label}</span>
                        {e.hint && <span className="shrink-0 text-[12px] text-muted-foreground">{e.hint}</span>}
                        {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground max-md:hidden" aria-hidden="true" />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div role="status" aria-live="polite" className={cn('px-3 py-2.5 text-[13px]', isError ? 'text-destructive' : 'text-muted-foreground', !statusText && 'sr-only')}>{statusText}</div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-3.5 py-2 text-[12px] text-muted-foreground max-md:hidden">
          <span>Arrow keys to move, Enter to open</span>
          <span>Esc to close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
