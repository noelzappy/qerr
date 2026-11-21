// Home: a greeting, three numbers that say how the month is going, the setup steps until they are done (admins), what goes
// out next, and the latest background work.
import { Check, CircleAlert, Sun, Moon, Sunrise } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useDocumentTitle, useLoad } from '../hooks';
import { useSession } from '../session';
import { useActivity } from '@/hooks/use-activity';
import { runTitle } from '@/lib/activity';
import { RunStatusBadge } from '@/components/activity-parts';
import { PostRow } from '@/components/post-row';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ChannelsOverview, HomeOverview, SetupStep } from '../lib/overview';
import { ErrorBlock } from '@/components/kit';

function greeting(hour: number) {
  if (hour < 12) return { text: 'Good morning', Icon: Sunrise };
  if (hour < 18) return { text: 'Good afternoon', Icon: Sun };
  return { text: 'Good evening', Icon: Moon };
}

function Stat({ value, label, detail, tone = 'neutral', to }: { value: string | number; label: string; detail: string; tone?: 'neutral' | 'good' | 'warn'; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-3.5 rounded-lg p-2 outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-full border-[3px] text-[15px] font-semibold tabular-nums',
        tone === 'good' ? 'border-primary/70' : tone === 'warn' ? 'border-warning/80' : 'border-border')}>{value}</span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold">{label}</span>
        <span className="block text-[12.5px] text-muted-foreground">{detail}</span>
      </span>
    </Link>
  );
}


// What to say under a step: usually the server's line, but the AI step says which half is still open.
function stepDetail(s: SetupStep): string {
  if (s.key === 'ai' && s.missing === 'budget') return 'Provider added. Now set a monthly budget: the AI does not run without one.';
  return s.detail;
}
const stepTitle = (s: SetupStep) => (s.key === 'ai' && s.missing === 'budget' ? 'Set a monthly budget' : s.title);

// One checklist for the whole setup, in order: finished steps are ticked, the next one is open with its button, the rest
// are one line each.
function FirstSteps({ steps }: { steps: SetupStep[] }) {
  const next = steps.find((s) => !s.done);
  if (!steps.length || !next) return null;
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <section aria-labelledby="first-steps" className="flex flex-col gap-2.5">
      <h2 id="first-steps" className="text-[13px] font-medium text-muted-foreground">Setup · {doneCount} of {steps.length} done</h2>
      <ol className="divide-y rounded-lg border bg-card">
        {steps.map((s, i) => {
          const state = s.done ? 'done' : s === next ? 'next' : 'later';
          return (
            <li key={s.key} className={cn('flex gap-3 px-4 py-3', state === 'next' && 'bg-muted/40')} aria-current={state === 'next' ? 'step' : undefined}>
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
                {state === 'done' ? <Check className="size-4 text-primary" />
                  : <span className={cn('flex size-5 items-center justify-center rounded-full border text-[11px] tabular-nums', state === 'next' ? 'border-primary text-primary' : 'text-muted-foreground')}>{i + 1}</span>}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn('text-[13.5px]', state === 'next' ? 'font-semibold' : 'font-medium', state === 'done' && 'text-muted-foreground')}>
                  {state === 'done' ? <><span className="sr-only">Done: </span><Link to={s.to} className="hover:underline">{stepTitle(s)}</Link></>
                    : state === 'later' ? <><span className="sr-only">Later: </span><Link to={s.to} className="hover:underline">{stepTitle(s)}</Link></>
                    : <><span className="sr-only">Next: </span>{stepTitle(s)}</>}
                </div>
                {state === 'next' && (
                  <div className="mt-1 flex flex-col items-start gap-2">
                    <p className="text-[12.5px] text-muted-foreground">{stepDetail(s)}</p>
                    <Button asChild size="sm"><Link to={s.to}>{stepTitle(s)}</Link></Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Editors see no setup list. They do see, in one line, when nothing can be posted yet.
function EditorNote() {
  const channels = useLoad(() => api.get<ChannelsOverview>('/api/overview/channels'), []);
  if (!channels.data || channels.data.channels.some((c) => c.connected)) return null;
  return (
    <p className="rounded-lg border border-dashed px-4 py-3 text-[13.5px] text-muted-foreground">An admin still has to connect Buffer before anything can be posted.</p>
  );
}

function RecentActivity() {
  const { items, loading, error } = useActivity({ pageSize: 8, system: 'hide' });
  return (
    <section aria-labelledby="recent-activity" className="flex min-w-0 flex-col gap-2.5">
      <h2 id="recent-activity" className="text-[13px] font-medium text-muted-foreground"><Link to="/activity" className="hover:underline">Activity</Link></h2>
      <div className="flex min-h-48 flex-col rounded-lg border bg-card">
        {loading && !items.length ? <div className="flex flex-col gap-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
          : error ? <p className="p-4 text-[13px] text-muted-foreground">{error}</p>
          : items.length === 0 ? <p className="m-auto p-6 text-center text-[13px] text-muted-foreground">Nothing has run yet. Drafts, images and sends show up here.</p>
          : (
            <ul className="divide-y">
              {items.map((r) => (
                <li key={r.id}>
                  <Link to={`/activity/${r.id}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] hover:bg-muted">
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

export function Home() {
  useDocumentTitle('Home');
  const { me } = useSession();
  const home = useLoad(() => api.get<HomeOverview>('/api/overview/home'), []);
  const now = new Date();
  const { text, Icon } = greeting(now.getHours());
  const first = (me?.name || '').split(/\s+/)[0] || '';
  const h = home.data;
  return (
    <div className="flex flex-col gap-7">
      <header className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg border bg-card" aria-hidden="true"><Icon className="size-5 text-warning" /></span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{text}{first ? `, ${first}` : ''}!</h1>
          <p className="text-[13px] text-muted-foreground">{now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
      </header>

      {home.error ? <ErrorBlock message={home.error} onRetry={() => void home.reload()} /> : (
        <>
          <div className="grid gap-1 rounded-lg border bg-card p-2 sm:grid-cols-3">
            {!h ? [0, 1, 2].map((i) => <Skeleton key={i} className="m-2 h-12" />) : (
              <>
                <Stat value={h.counts.thisWeek} label="This week" detail={h.counts.thisWeek === 1 ? 'post going out' : 'posts going out'} tone={h.counts.thisWeek ? 'good' : 'neutral'} to="/publish" />
                <Stat value={h.counts.awaitingApproval} label="Waiting for approval" detail="posts to review" tone={h.counts.awaitingApproval ? 'warn' : 'neutral'} to="/create" />
                {h.spend
                  ? <Stat value={`$${h.spend.spentUsd.toFixed(h.spend.spentUsd < 10 ? 2 : 0)}`} label="AI this month" detail={h.spend.monthlyBudgetUsd ? `of a $${h.spend.monthlyBudgetUsd} budget` : 'no budget set yet'} to="/settings/ai" />
                  : <Stat value={h.counts.upcoming} label="Coming up" detail="posts planned from today" to="/publish" />}
              </>
            )}
          </div>

          {h && h.counts.deliveryProblems > 0 && (
            <Link to="/activity" className="flex items-center gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-[13.5px]">
              <CircleAlert className="size-4 text-destructive" aria-hidden="true" />
              {h.counts.deliveryProblems === 1 ? 'One post' : `${h.counts.deliveryProblems} posts`} did not reach Buffer cleanly. Open the batch to see what happened.
            </Link>
          )}

          {h && <FirstSteps steps={h.setup} />}
          {h && me?.role === 'editor' && <EditorNote />}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section aria-labelledby="up-next" className="flex min-w-0 flex-col gap-2.5">
              <h2 id="up-next" className="text-[13px] font-medium text-muted-foreground">Up next{h ? ` · ${h.counts.upcoming} planned` : ''}</h2>
              {!h ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)
                : h.upNext.length === 0
                  ? (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
                      <p className="text-[13.5px] text-muted-foreground">Nothing is planned yet.</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button asChild><Link to="/batches/ai-draft">Draft posts with AI</Link></Button>
                        <Button asChild variant="outline"><Link to="/batches/new">New batch</Link></Button>
                      </div>
                    </div>
                  )
                  : h.upNext.map((p) => <PostRow key={p.id} post={p} />)}
            </section>
            <RecentActivity />
          </div>
        </>
      )}
    </div>
  );
}
