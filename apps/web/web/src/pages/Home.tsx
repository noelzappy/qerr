// Home: a greeting, three numbers that say how the month is going, the setup steps until they are done (admins), what goes
// out next, and the latest background work.
import { useEffect, useState } from 'react';
import { Check, ChevronRight, CircleAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useDocumentTitle, useLoad } from '../hooks';
import { useSession } from '../session';
import { useActivity } from '@/hooks/use-activity';
import { runTitle } from '@/lib/activity';
import { RunStatusBadge } from '@/components/activity-parts';
import { PostRow, PostRows } from '@/components/post-row';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ChannelsOverview, HomeOverview, SetupStep } from '../lib/overview';
import { ErrorBlock } from '@/components/kit';
import { resumeStep, setupLinkForHomeStep, shouldLandOnSetup, stepPath, type SetupStatus } from './setup/flow';

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// One figure with its label, a link to where it leads. No ring, no border.
function Stat({ value, label, to }: { value: string | number; label: string; to: string }) {
  return (
    <Link to={to} className="flex min-w-0 flex-col rounded-md px-2 py-1 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <span className="text-xl font-semibold tabular-nums leading-7">{value}</span>
      <span className="text-[12.5px] leading-snug text-muted-foreground sm:truncate">{label}</span>
    </Link>
  );
}

// What to say under a step: usually the server's line, but the AI step says which half is still open.
function stepDetail(s: SetupStep): string {
  if (s.key === 'ai' && s.missing === 'budget') return 'Provider added. Now set a monthly budget: the AI does not run without one.';
  return s.detail;
}
const stepTitle = (s: SetupStep) => (s.key === 'ai' && s.missing === 'budget' ? 'Set a monthly budget' : s.title);

// The setup checklist: one row until opened, then the whole list. Hidden when everything is done.
function FirstSteps({ steps }: { steps: SetupStep[] }) {
  const [open, setOpen] = useState(false);
  const next = steps.find((s) => !s.done);
  if (!steps.length || !next) return null;
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <section aria-label="Setup" className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
        <button type="button" aria-expanded={open} aria-controls="setup-list" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 basis-60 items-center gap-1.5 rounded-sm text-left text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden="true" />
          <span className="min-w-0 truncate"><span className="font-medium">Setup: {doneCount} of {steps.length} done</span><span className="text-muted-foreground"> · next: {stepTitle(next)}</span></span>
        </button>
        <Button asChild size="sm" variant="outline"><Link to={setupLinkForHomeStep(next.key, next.to)}>{stepTitle(next)}</Link></Button>
      </div>
      {open && (
        <ol id="setup-list" className="divide-y border-t">
          {steps.map((s, i) => {
            const state = s.done ? 'done' : s === next ? 'next' : 'later';
            return (
              <li key={s.key} className="flex items-start gap-2.5 px-3 py-2" aria-current={state === 'next' ? 'step' : undefined}>
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                  {state === 'done' ? <Check className="size-4 text-primary" />
                    : <span className={cn('flex size-5 items-center justify-center rounded-full border text-[11px] tabular-nums', state === 'next' ? 'border-primary text-primary' : 'text-muted-foreground')}>{i + 1}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn('text-[13px]', state === 'next' ? 'font-semibold' : 'font-medium', state === 'done' && 'text-muted-foreground')}>
                    <span className="sr-only">{state === 'done' ? 'Done: ' : state === 'next' ? 'Next: ' : 'Later: '}</span>
                    <Link to={setupLinkForHomeStep(s.key, s.to)} className="hover:underline">{stepTitle(s)}</Link>
                  </div>
                  {state === 'next' && <p className="text-[12.5px] text-muted-foreground">{stepDetail(s)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// Editors see no setup list. They do see, in one line, when nothing can be posted yet.
function EditorNote() {
  const channels = useLoad(() => api.get<ChannelsOverview>('/api/overview/channels'), []);
  if (!channels.data || channels.data.channels.some((c) => c.connected)) return null;
  return (
    <p className="text-[13px] text-muted-foreground">An admin still has to connect Buffer before anything can be posted.</p>
  );
}

function RecentActivity() {
  const { items, loading, error } = useActivity({ pageSize: 5, system: 'hide' });
  return (
    <section aria-labelledby="recent-activity" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="recent-activity" className="text-[13px] font-semibold">Activity</h2>
        <Link to="/activity" className="rounded-sm text-[12.5px] text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50">See all</Link>
      </div>
      <div className="flex flex-col rounded-lg border">
        {loading && !items.length ? <div className="flex flex-col gap-3 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
          : error ? <p className="p-3 text-[13px] text-muted-foreground">{error}</p>
          : items.length === 0 ? <p className="p-3 text-[13px] text-muted-foreground">Nothing has run yet.</p>
          : (
            <ul className="divide-y">
              {items.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <Link to={`/activity/${r.id}`} className="flex h-10 items-center justify-between gap-3 px-3 text-[13px] hover:bg-muted/50 max-sm:min-h-11">
                    <span className="min-w-0 truncate">{runTitle(r.title)}</span>
                    <RunStatusBadge run={r} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  );
}

// After the first sign-in, an admin whose brand was never saved goes to the guided setup (unless they left it for later).
function useSetupLanding(role: string | undefined) {
  const navigate = useNavigate();
  useEffect(() => {
    if (role !== 'admin') return;
    let live = true;
    api.get<SetupStatus>('/api/setup').then((s) => { if (live && shouldLandOnSetup(role, s)) navigate(stepPath(resumeStep(s)), { replace: true }); }).catch(() => undefined);
    return () => { live = false; };
  }, [role, navigate]);
}

export function Home() {
  useDocumentTitle('Home');
  const { me } = useSession();
  useSetupLanding(me?.role);
  const home = useLoad(() => api.get<HomeOverview>('/api/overview/home'), []);
  const now = new Date();
  const text = greeting(now.getHours());
  const first = (me?.name || '').split(/\s+/)[0] || '';
  const h = home.data;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h1 className="text-[19px] leading-7 font-semibold tracking-tight max-sm:text-lg">{text}{first ? `, ${first}` : ''}</h1>
        <p className="text-[12.5px] text-muted-foreground">{now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </header>

      {home.error ? <ErrorBlock message={home.error} onRetry={() => void home.reload()} /> : (
        <>
          <div className="grid grid-cols-3 gap-1 border-b pb-4">
            {!h ? [0, 1, 2].map((i) => <Skeleton key={i} className="m-1 h-10" />) : (
              <>
                <Stat value={h.counts.thisWeek} label="Going out this week" to="/publish" />
                <Stat value={h.counts.awaitingApproval} label="Waiting for approval" to="/create" />
                {h.spend
                  ? <Stat value={`$${h.spend.spentUsd.toFixed(h.spend.spentUsd < 10 ? 2 : 0)}`} label={h.spend.monthlyBudgetUsd ? `AI this month, of $${h.spend.monthlyBudgetUsd}` : 'AI this month'} to="/settings/ai" />
                  : <Stat value={h.counts.upcoming} label="Planned from today" to="/publish" />}
              </>
            )}
          </div>

          {h && h.counts.deliveryProblems > 0 && (
            <Link to="/activity" className="flex items-center gap-2 text-[13px] text-destructive hover:underline">
              <CircleAlert className="size-4" aria-hidden="true" />
              {h.counts.deliveryProblems === 1 ? 'One post' : `${h.counts.deliveryProblems} posts`} did not reach Buffer cleanly. Open the batch to see what happened.
            </Link>
          )}

          {h && <FirstSteps steps={h.setup} />}
          {h && me?.role === 'editor' && <EditorNote />}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section aria-labelledby="up-next" className="flex min-w-0 flex-col gap-2">
              <h2 id="up-next" className="text-[13px] font-semibold">Up next{h && h.counts.upcoming > 0 ? <span className="font-normal text-muted-foreground"> · {h.counts.upcoming} planned</span> : null}</h2>
              {!h ? <Skeleton className="h-24 rounded-lg" />
                : h.upNext.length === 0
                  ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-3">
                      <p className="text-[13px] text-muted-foreground">Nothing is planned yet.</p>
                      <Button asChild size="sm" variant="outline"><Link to="/batches/ai-draft">Draft posts with AI</Link></Button>
                    </div>
                  )
                  : <PostRows>{h.upNext.map((p) => <PostRow key={p.id} post={p} />)}</PostRows>}
            </section>
            <RecentActivity />
          </div>
        </>
      )}
    </div>
  );
}
