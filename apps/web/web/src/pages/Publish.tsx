// Publish: every planned post across batches on a calendar (a week by the hour, or a month) or as a list by day, for all
// channels or one (?network=). Dates are the brand's calendar dates, as the posts store them.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAppInfo } from '../app-info';
import { useDocumentTitle, useLoad } from '../hooks';
import { NetworkIcon } from '@/components/network-icon';
import { dayLabel, PostRow } from '@/components/post-row';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { networkLabel } from '../lib/labels';
import { flowOfPost, type OverviewPost } from '../lib/overview';
import { FLAG_LABEL, STEP_LABEL, STEP_TONE } from './batches/flow/status';
import { ErrorBlock } from '@/components/kit';

type View = 'week' | 'month' | 'list';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
// Weeks start on Monday.
const weekStart = (s: string) => { const d = parse(s); return addDays(s, -((d.getUTCDay() + 6) % 7)); };
const monthStart = (s: string) => `${s.slice(0, 7)}-01`;
const monthEnd = (s: string) => { const d = parse(monthStart(s)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return iso(d); };

function todayIn(tz: string): string {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const g = (t: string) => p.find((x) => x.type === t)?.value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  } catch {
    return iso(new Date());
  }
}

const monthTitle = (s: string) => parse(s).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

const TONE_DOT: Record<string, string> = { good: 'bg-success', warn: 'bg-warning', bad: 'bg-destructive', info: 'bg-info', quiet: 'bg-muted-foreground/60' };

// One line: time, title, and a dot for the step. The step word, the flags and the channels are in the tooltip.
function Chip({ post }: { post: OverviewPost }) {
  const flow = flowOfPost(post);
  const tone = STEP_TONE[flow.step];
  const status = `${STEP_LABEL[flow.step]}${flow.flags.length ? `, ${flow.flags.map((f) => FLAG_LABEL[f]).join(', ')}` : ''}`;
  const where = post.networks.map(networkLabel).join(', ');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={`/batches/${post.batch.id}?post=${encodeURIComponent(post.id)}`}
          className="flex h-6 items-center gap-1.5 rounded-md bg-muted/50 px-1.5 text-left text-[12px] outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:h-8"
        >
          <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">{post.time}</span>
          <span className="min-w-0 flex-1 truncate">{post.title || post.caption}</span>
          <span className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[tone], flow.flags.length > 0 && 'ring-2 ring-destructive/40')} aria-hidden="true" />
          <span className="sr-only">{status}, {where}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <span className="block font-medium">{status}</span>
        <span className="block opacity-80">{where}, {post.time}</span>
        <span className="block [overflow-wrap:anywhere] opacity-80">{post.caption || post.title}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function WeekGrid({ start, today, posts }: { start: string; today: string; posts: OverviewPost[] }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const scroller = useRef<HTMLDivElement>(null);
  const byCell = useMemo(() => {
    const m = new Map<string, OverviewPost[]>();
    for (const p of posts) { const k = `${p.date}|${Number(p.time.slice(0, 2))}`; m.set(k, [...(m.get(k) ?? []), p]); }
    return m;
  }, [posts]);
  const firstHour = Math.min(8, ...posts.map((p) => Number(p.time.slice(0, 2))));
  useEffect(() => {
    const row = scroller.current?.querySelector<HTMLElement>(`[data-hour-label="${firstHour}"]`);
    if (row && scroller.current) scroller.current.scrollTop = row.offsetTop - 40;
  }, [start, firstHour]);
  return (
    <div ref={scroller} className="relative max-h-[calc(100dvh-10rem)] overflow-auto rounded-lg border">
      <div className="grid min-w-[880px] grid-cols-[4rem_repeat(7,minmax(0,1fr))]">
        <div className="sticky top-0 z-10 border-b border-border/60 bg-background" />
        {days.map((d) => (
          <div key={d} className={cn('sticky top-0 z-10 flex items-center justify-center gap-1.5 border-b border-l border-border/60 bg-background px-2 py-1.5 text-center text-[12.5px] font-medium', d === today ? 'text-foreground' : 'text-muted-foreground')}>
            {d === today && <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />}
            {parse(d).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} <span className="tabular-nums">{parse(d).getUTCDate()}</span>
            {d === today && <span className="sr-only"> (today)</span>}
          </div>
        ))}
        {HOURS.map((h) => (
          <div key={h} className="contents">
            <div data-hour-label={h} className="border-b border-border/50 px-2 pt-1 text-right text-[11px] text-muted-foreground/70">{hourLabel(h)}</div>
            {days.map((d) => (
              <div key={d} className={cn('flex min-h-12 flex-col gap-0.5 border-b border-l border-border/50 p-0.5', d === today && 'bg-primary/[0.04]')}>
                {(byCell.get(`${d}|${h}`) ?? []).map((p) => <Chip key={p.id} post={p} />)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({ anchor, today, posts }: { anchor: string; today: string; posts: OverviewPost[] }) {
  const first = weekStart(monthStart(anchor));
  const last = monthEnd(anchor);
  const weeks = Math.ceil(((parse(last).getTime() - parse(first).getTime()) / 86_400_000 + 1) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(first, i));
  const byDay = useMemo(() => {
    const m = new Map<string, OverviewPost[]>();
    for (const p of posts) m.set(p.date, [...(m.get(p.date) ?? []), p]);
    return m;
  }, [posts]);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="grid min-w-[760px] grid-cols-7">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => <div key={d} className={cn('border-b border-border/60 px-2 py-1.5 text-[12px] font-medium text-muted-foreground', i && 'border-l')}>{d}</div>)}
        {days.map((d, i) => {
          const list = byDay.get(d) ?? [];
          const inMonth = d.slice(0, 7) === anchor.slice(0, 7);
          return (
            <div key={d} className={cn('flex min-h-24 flex-col gap-0.5 border-b border-border/50 p-1', i % 7 && 'border-l', !inMonth && 'bg-muted/30', d === today && 'bg-primary/[0.04]')}>
              <span className={cn('flex w-fit items-center gap-1 px-1 text-[12px] tabular-nums', d === today ? 'font-semibold text-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground/70')}>
                {d === today && <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />}{parse(d).getUTCDate()}{d === today && <span className="sr-only"> (today)</span>}
              </span>
              {list.slice(0, 3).map((p) => <Chip key={p.id} post={p} />)}
              {list.length > 3 && <span className="px-1 text-[11.5px] text-muted-foreground">+{list.length - 3} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ start, today, posts }: { start: string; today: string; posts: OverviewPost[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, OverviewPost[]>();
    for (const p of posts) if (p.date >= start) m.set(p.date, [...(m.get(p.date) ?? []), p]);
    return [...m.entries()];
  }, [posts, start]);
  if (!groups.length) return <p className="py-6 text-[13px] text-muted-foreground">Nothing is planned in these weeks.</p>;
  return (
    <div className="flex flex-col gap-6">
      {groups.map(([day, list]) => (
        <section key={day} aria-label={dayLabel(day)} className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold">{day === today ? 'Today' : day === addDays(today, 1) ? 'Tomorrow' : dayLabel(day)}{(day === today || day === addDays(today, 1)) && <span className="ml-1.5 font-normal text-muted-foreground">{dayLabel(day)}</span>}</h2>
          {list.map((p) => <PostRow key={p.id} post={p} showDate={false} />)}
        </section>
      ))}
    </div>
  );
}

export function Publish() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { brand } = useAppInfo();
  const network = params.get('network') ?? '';
  const view = (['week', 'month', 'list'].includes(params.get('view') ?? '') ? params.get('view') : 'week') as View;
  const today = todayIn(brand.timezone);
  const [anchor, setAnchor] = useState(today);
  useDocumentTitle(network ? `Publish: ${networkLabel(network)}` : 'Publish');

  const range = view === 'month' ? { from: weekStart(monthStart(anchor)), to: addDays(weekStart(monthStart(anchor)), 41) }
    : view === 'list' ? { from: anchor, to: addDays(anchor, 27) }
    : { from: weekStart(anchor), to: addDays(weekStart(anchor), 6) };
  const data = useLoad(() => api.get<{ posts: OverviewPost[] }>(`/api/overview/calendar?from=${range.from}&to=${range.to}${network ? `&network=${network}` : ''}`).then((r) => r.posts), [range.from, range.to, network]);
  const posts = data.data ?? [];
  const nextLoad = useLoad(() => api.get<{ next: string | null }>('/api/overview/channels').then((r) => r.next), [network]);
  const next = nextLoad.data ?? null;

  const set = (k: string, v: string) => { const next = new URLSearchParams(params); if (v) next.set(k, v); else next.delete(k); setParams(next, { replace: true }); };
  const step = (dir: 1 | -1) => {
    if (view === 'month') { const d = parse(monthStart(anchor)); d.setUTCMonth(d.getUTCMonth() + dir); setAnchor(iso(d)); }
    else setAnchor(addDays(anchor, dir * (view === 'list' ? 28 : 7)));
  };
  const title = view === 'week'
    ? (() => { const s = weekStart(anchor), e = addDays(s, 6); return s.slice(0, 7) === e.slice(0, 7) ? monthTitle(s) : `${parse(s).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })} – ${parse(e).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`; })()
    : view === 'month' ? monthTitle(anchor) : `From ${dayLabel(anchor)}`;
  const approved = posts.filter((p) => flowOfPost(p).stepIndex >= 1).length;

  const count = data.loading && !data.data ? '' : `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}, ${approved} approved`;
  const VIEWS: Array<[View, string]> = [['week', 'Week'], ['month', 'Month'], ['list', 'List']];

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-1 min-w-0 text-[19px] leading-7 font-semibold tracking-tight max-sm:w-full max-sm:text-lg">Publish</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Earlier" className="max-sm:size-11" onClick={() => step(-1)}><ChevronLeft aria-hidden="true" /></Button>
          <Button variant="outline" size="sm" className="max-sm:h-11" onClick={() => setAnchor(today)}>Today</Button>
          <Button variant="ghost" size="icon-sm" aria-label="Later" className="max-sm:size-11" onClick={() => step(1)}><ChevronRight aria-hidden="true" /></Button>
        </div>
        <div className="flex rounded-md border p-0.5" role="group" aria-label="View">
          {VIEWS.map(([v, label]) => (
            <Button key={v} size="sm" variant={view === v ? 'secondary' : 'ghost'} aria-pressed={view === v} className="h-7 px-2.5 max-sm:h-10" onClick={() => set('view', v)}>{label}</Button>
          ))}
        </div>
        <Select value={network || 'all'} onValueChange={(v) => set('network', v === 'all' ? '' : v)}>
          <SelectTrigger size="sm" className="w-36" aria-label="Channel"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            {['instagram', 'linkedin', 'facebook', 'x'].map((n) => <SelectItem key={n} value={n}>{networkLabel(n)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="ml-auto max-sm:h-11" onClick={() => navigate('/batches/new')}><Plus aria-hidden="true" /> New batch</Button>
      </header>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[14px] font-semibold" aria-live="polite">{title}</h2>
        {!data.loading && data.data && posts.length === 0 && next && next > range.to && (
          <span className="text-[12.5px] text-muted-foreground">Nothing here. Next post: {dayLabel(next)}. <button type="button" className="rounded-sm font-medium text-foreground underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" onClick={() => setAnchor(next)}>Go there</button></span>
        )}
        <span className="ml-auto text-[12px] text-muted-foreground">{count}</span>
      </div>
      {data.error ? <ErrorBlock message={data.error} onRetry={() => void data.reload()} />
        : data.loading && !data.data ? <Skeleton className="h-[480px] rounded-lg" />
        : view === 'week' ? <WeekGrid start={weekStart(anchor)} today={today} posts={posts} />
        : view === 'month' ? <MonthGrid anchor={anchor} today={today} posts={posts} />
        : <ListView start={anchor} today={today} posts={posts} />}
    </div>
  );
}
