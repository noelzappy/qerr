// The Activity indicator: an icon in the sidebar header (and the phone's top bar) with the number of runs in progress.
// It opens a popover with what is running and the last few runs that finished. The provider keeps one poll for every
// indicator on screen, tells a person with a toast when a run they started has ended, and keeps a hidden live region so a
// screen reader hears the changes.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '@/api';
import { RunProgress, RunStatusBadge, runSummary } from '@/components/activity-parts';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivity } from '@/hooks/use-activity';
import { useNow } from '@/hooks/use-now';
import { batchLink, isActive, runKindLabel, type ActivityRun } from '@/lib/activity';
import { cn } from '@/lib/utils';
import { useSession } from '../session';

interface ActivityState {
  // How many popovers are open: the list is polled fast and the finished runs are read while any is.
  open: boolean;
  watch: (on: boolean) => void;
  active: ActivityRun[];
  activeCount: number;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  finished: ActivityRun[];
  finishedLoading: boolean;
  finishedError: string;
  reloadFinished: () => Promise<void>;
  announcement: string;
}

const Ctx = createContext<ActivityState | null>(null);
const useActivityState = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('ActivityMenu needs an ActivityProvider above it');
  return v;
};

// Tells a person how a run they started ended. Only runs seen in progress in this tab are announced, so opening the app
// does not replay old results.
function useFinishNotices(active: ActivityRun[], meId: string | undefined, say: (text: string) => void) {
  const seen = useRef(new Map<string, ActivityRun>());
  useEffect(() => {
    const now = new Map(active.map((r) => [r.id, r]));
    for (const [id, run] of [...seen.current]) {
      if (now.has(id)) continue;
      seen.current.delete(id);
      void api.get<{ run: ActivityRun }>(`/api/activity/${encodeURIComponent(id)}`).then(({ run: ended }) => {
        const text = ended.status === 'done' ? `${ended.title} finished` : ended.status === 'failed' ? `${ended.title} failed` : '';
        if (!text) return;
        say(text);
        if (run.actorId !== meId || !meId) return;
        if (ended.status === 'done') toast.success(text);
        else toast.error(text, { description: ended.error ?? undefined });
      }).catch(() => undefined);
    }
    for (const [id, run] of now) seen.current.set(id, run);
  }, [active, meId, say]);
}

export function ActivityProvider({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const [watchers, setWatchers] = useState(0);
  const open = watchers > 0;
  const watch = useCallback((on: boolean) => setWatchers((n) => Math.max(0, n + (on ? 1 : -1))), []);
  const [announcement, setAnnouncement] = useState('');
  const current = useActivity({ status: 'active', system: 'hide', pageSize: 20 }, { fast: open });
  const finished = useActivity({ status: 'finished', system: 'hide', pageSize: 5 }, { enabled: open });

  // What finished changes whenever a run leaves the active list: read the finished list again while the popover is open.
  const activeKey = current.active.map((r) => r.id).join(',');
  const lastKey = useRef(activeKey);
  const { reload: reloadFinished } = finished;
  useEffect(() => {
    if (lastKey.current !== activeKey && open) void reloadFinished();
    lastKey.current = activeKey;
  }, [activeKey, open, reloadFinished]);

  useFinishNotices(current.active, me?.id, setAnnouncement);

  const value = useMemo<ActivityState>(() => ({
    open, watch, active: current.active, activeCount: current.total, loading: current.loading, error: current.error, reload: current.reload,
    finished: finished.items, finishedLoading: finished.loading, finishedError: finished.error, reloadFinished, announcement,
  }), [open, current.active, current.total, current.loading, current.error, current.reload, finished.items, finished.loading, finished.error, reloadFinished, announcement]);

  return (
    <Ctx.Provider value={value}>
      {/* Heard, not seen: what changed in the background. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      {children}
    </Ctx.Provider>
  );
}

function RunRow({ run, now, onNavigate }: { run: ActivityRun; now: number; onNavigate: () => void }) {
  const link = batchLink(run);
  const summary = runSummary(run);
  return (
    <li className="flex flex-col gap-1.5 px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/activity/${run.id}`} onClick={onNavigate} className="min-w-0 flex-1 rounded-sm text-sm font-medium [overflow-wrap:anywhere] outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50">{run.title}</Link>
        <RunStatusBadge run={run} />
      </div>
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{runKindLabel(run.kind)}</p>
      {isActive(run) ? <RunProgress run={run} now={now} /> : summary && <p className={cn('text-[13px] [overflow-wrap:anywhere]', run.status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>{summary}</p>}
      {link && <Link to={link} onClick={onNavigate} className="w-fit text-[13px] font-medium text-primary underline-offset-4 hover:underline">Open the batch</Link>}
    </li>
  );
}

function PopoverBody({ onNavigate }: { onNavigate: () => void }) {
  const s = useActivityState();
  const now = useNow(true);
  const first = s.loading && s.active.length === 0 && s.finished.length === 0;
  return (
    <div className="flex max-h-[min(70dvh,32rem)] flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-3.5 py-3">
        <h2 className="text-sm font-semibold">Activity</h2>
        <Link to="/activity" onClick={onNavigate} className="rounded-sm text-[13px] font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50">See all activity</Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {first ? (
          <div className="flex flex-col gap-3 p-3.5" role="status" aria-label="Loading">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : s.error && s.active.length === 0 ? (
          <div className="flex flex-col items-start gap-2 p-3.5" role="alert">
            <p className="text-sm text-destructive">{s.error}</p>
            <Button variant="outline" size="sm" className="max-sm:min-h-11" onClick={() => void s.reload()}>Try again</Button>
          </div>
        ) : (
          <>
            <section aria-label="In progress">
              {s.active.length === 0
                ? <p className="px-3.5 py-4 text-sm text-muted-foreground">Nothing is running right now.</p>
                : <ul className="divide-y">{s.active.map((r) => <RunRow key={r.id} run={r} now={now} onNavigate={onNavigate} />)}</ul>}
            </section>
            {s.finished.length > 0 && (
              <section aria-label="Finished recently" className="border-t">
                <h3 className="px-3.5 pb-1 pt-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Finished recently</h3>
                <ul className="divide-y">{s.finished.map((r) => <RunRow key={r.id} run={r} now={now} onNavigate={onNavigate} />)}</ul>
              </section>
            )}
            {s.finishedError && <p className="border-t px-3.5 py-3 text-[13px] text-muted-foreground">{s.finishedError}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export function ActivityMenu({ className }: { className?: string }) {
  const s = useActivityState();
  // Each indicator (sidebar, phone header) has its own open state; only the data is shared.
  const [open, setOpen] = useState(false);
  const { watch } = s;
  useEffect(() => { if (!open) return; watch(true); return () => watch(false); }, [open, watch]);
  const n = s.activeCount;
  const label = n > 0 ? `Activity, ${n} in progress` : 'Activity';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className={cn('relative size-9 max-md:size-11', className)}>
          {n > 0 ? <Loader2 className="animate-spin text-primary" aria-hidden="true" /> : <Activity aria-hidden="true" />}
          {n > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-[1.125rem] text-primary-foreground" aria-hidden="true">{n > 9 ? '9+' : n}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[24rem] max-w-[calc(100vw-1.5rem)] p-0">
        <PopoverBody onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
