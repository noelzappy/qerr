// Home: a greeting, three numbers that say how the month is going, the setup steps until they are done (admins), what goes
// out next, and the latest background work.
import { Check, CircleAlert, Sun, Moon, Sunrise } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useDocumentTitle, useLoad } from '../hooks';
import { useSession } from '../session';
import { useActivity } from '@/hooks/use-activity';
import { RunStatusBadge } from '@/components/activity-parts';
import { PostRow } from '@/components/post-row';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { HomeOverview } from '../lib/overview';
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

function FirstSteps({ steps }: { steps: HomeOverview['setup'] }) {
  const open = steps.filter((s) => !s.done);
  if (!steps.length || !open.length) return null;
  const shown = [...open.slice(0, 3)];
  return (
    <section aria-labelledby="first-steps" className="flex flex-col gap-2.5">
      <h2 id="first-steps" className="text-[13px] font-medium text-muted-foreground">First steps · {steps.length - open.length} of {steps.length} done</h2>
      <ol className="grid gap-3 md:grid-cols-3">
        {shown.map((s) => (
          <li key={s.key} className="flex flex-col gap-1 rounded-lg border bg-card p-3.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[13.5px] font-semibold">{steps.indexOf(s) + 1}. {s.title}</span>
              <span className="mt-0.5 size-4 shrink-0 rounded-full border" aria-hidden="true" />
            </div>
            <p className="text-[12.5px] text-muted-foreground">{s.detail}</p>
            <Button asChild variant="outline" size="sm" className="mt-2 w-fit"><Link to={s.to}>{s.title}</Link></Button>
          </li>
        ))}
      </ol>
      <details className="text-[12.5px] text-muted-foreground">
        <summary className="w-fit cursor-pointer select-none hover:text-foreground">All setup steps</summary>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              {s.done ? <Check className="size-4 text-primary" aria-label="Done" /> : <span className="size-4 rounded-full border" aria-label="To do" />}
              <Link to={s.to} className={cn('hover:underline', s.done && 'line-through')}>{s.title}</Link>
            </li>
          ))}
        </ul>
      </details>
    </section>
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
          : items.length === 0 ? <p className="m-auto p-6 text-center text-[13px] text-muted-foreground">Nothing has run yet. Drafts, renders and sends show up here.</p>
          : (
            <ul className="divide-y">
              {items.map((r) => (
                <li key={r.id}>
                  <Link to={`/activity/${r.id}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] hover:bg-muted">
                    <span className="min-w-0 truncate">{r.title}</span>
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
