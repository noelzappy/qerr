// The time zone field: a button that shows the zone chosen ("London · GMT+1", and its time now) and opens a short list of likely zones
// (the one chosen, this browser's, other places on the same clock, UTC) with a search over every zone by city. The list of zones is the one in
// lib/time-zones.ts. The value is always an IANA name (Europe/London), as the server stores it.
//
//   <TimeZonePicker label="Time zone" hint="Posts are planned in this time zone" value={tz} onChange={setTz} />
//
// Keyboard: the button opens the list (Enter, Space or Down); in the search box Up and Down move through the zones, Enter chooses one and
// Escape closes the list without a change. The search box is a combobox that points at the highlighted zone, so screen readers read it.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ALL_TIME_ZONES, browserTimeZone, likelyZones, searchZones, zoneCity, zoneOffset, zoneTime } from '@/lib/time-zones';
import { cn } from '@/lib/utils';
import { Hint } from './hint';

// The small tag beside the label when the zone is the one this browser is in.
export const BROWSER_TAG = 'From this browser';

export function TimeZonePicker({ label = 'Time zone', value, onChange, hint, error, optional, disabled, className, zones = ALL_TIME_ZONES }: {
  label?: ReactNode; value: string; onChange: (zone: string) => void; hint?: ReactNode; error?: string; optional?: boolean; disabled?: boolean; className?: string;
  zones?: readonly string[];
}) {
  const id = useId();
  const listId = `${id}-list`, hintId = hint ? `${id}-hint` : undefined, errorId = error ? `${id}-error` : undefined;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const detected = useMemo(() => browserTimeZone(), []);
  // The clock the times are read from: set when the list opens, so the times are right without ticking.
  const [at, setAt] = useState(() => new Date());
  const shown = useMemo(
    () => (query.trim() ? searchZones(query, { all: zones, at }) : likelyZones({ current: value, detected, all: zones, at })),
    [query, zones, at, value, detected],
  );
  useEffect(() => { setActive(Math.max(0, shown.indexOf(value))); }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const choose = (z: string) => { onChange(z); setOpen(false); setQuery(''); };
  const fromBrowser = !!value && value === detected;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex min-h-5 items-center gap-1">
        <Label htmlFor={id}>{label}{optional && <span className="font-normal text-muted-foreground"> (optional)</span>}</Label>
        {hint && <Hint about={label} id={hintId}>{hint}</Hint>}
        {fromBrowser && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-medium text-primary">{BROWSER_TAG}</span>}
      </div>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { setAt(new Date()); setQuery(''); } }}>
        <PopoverTrigger asChild>
          <button
            id={id} type="button" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined} disabled={disabled}
            aria-invalid={error ? true : undefined} aria-describedby={describedBy}
            className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-left text-[13px] shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30 max-sm:h-11 max-sm:text-base"
          >
            <span className="min-w-0 flex-1 truncate">{value ? <>{zoneCity(value)}<span className="text-muted-foreground"> · {zoneOffset(value) || value}</span></> : <span className="text-muted-foreground">Choose a time zone</span>}</span>
            {value && <span className="shrink-0 font-mono text-[12px] text-muted-foreground tabular-nums">{zoneTime(value)}</span>}
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).querySelector('input')?.focus(); }}>
          <div className="border-b p-1.5">
            <input
              type="text" role="combobox" aria-label="Search time zones by city" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
              aria-activedescendant={shown[active] ? `${id}-opt-${active}` : undefined} autoComplete="off" spellCheck={false}
              placeholder="Lisbon, Lagos or GMT+1" value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
                else if (e.key === 'Home' && !query) { e.preventDefault(); setActive(0); }
                else if (e.key === 'End' && !query) { e.preventDefault(); setActive(Math.max(0, shown.length - 1)); }
                else if (e.key === 'Enter') { e.preventDefault(); const z = shown[active]; if (z) choose(z); }
              }}
              className="h-8 w-full rounded-sm bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground max-sm:h-10 max-sm:text-base"
            />
          </div>
          <p className="px-3 pt-2 pb-1 text-[11.5px] font-medium text-muted-foreground" aria-hidden="true">{query.trim() ? `${shown.length === 50 ? 'First 50 matches' : `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}`}` : 'Likely'}</p>
          <ul ref={listRef} id={listId} role="listbox" aria-label={query.trim() ? 'Matching time zones' : 'Likely time zones'} className="max-h-64 overflow-y-auto px-1 pb-1">
            {shown.map((z, i) => (
              <li
                key={z} id={`${id}-opt-${i}`} data-index={i} role="option" aria-selected={z === value}
                onMouseDown={(e) => e.preventDefault()} onClick={() => choose(z)} onMouseMove={() => setActive(i)}
                className={cn('flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] max-sm:min-h-11', i === active && 'bg-accent text-accent-foreground', z === value && 'font-semibold')}
              >
                <span className="min-w-0 flex-1 truncate">{zoneCity(z)}<span className="font-normal text-muted-foreground"> · {zoneOffset(z, at) || z}</span>
                  {z === detected && <span className="ml-1.5 text-[11px] font-medium text-primary">This browser</span>}
                  {query.trim() && z.includes('/') && <span className="block truncate text-[11.5px] font-normal text-muted-foreground">{z.replace(/_/g, ' ')}</span>}
                </span>
                <span className="shrink-0 font-mono text-[12px] font-normal text-muted-foreground tabular-nums">{zoneTime(z, at)}</span>
              </li>
            ))}
          </ul>
          {query.trim() && shown.length === 0 && <p className="px-3 pb-3 text-[13px] text-muted-foreground" role="status">No time zone matches “{query.trim()}”.</p>}
          {!query.trim() && <p className="border-t px-3 py-2 text-[12px] text-muted-foreground">Type a city to search all {zones.length} time zones.</p>}
        </PopoverContent>
      </Popover>
      {error && <p className="text-[12.5px] font-medium text-destructive" id={errorId} role="alert">{error}</p>}
    </div>
  );
}
