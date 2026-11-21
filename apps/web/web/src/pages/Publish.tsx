// Publish: every planned post across batches on a calendar (a week by the hour, or a month) or as a list by day, for all
// channels or one (?network=). Dates are the brand's calendar dates, as the posts store them.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAppInfo } from '../app-info';
import { useDocumentTitle, useLoad } from '../hooks';
import { NetworkIcon } from '@/components/network-icon';
import { dayLabel, PostRow } from '@/components/post-row';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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

const TONE_BAR: Record<string, string> = { good: 'border-l-primary', warn: 'border-l-warning', bad: 'border-l-destructive', info: 'border-l-info', quiet: 'border-l-muted-foreground/50' };

function Chip({ post, compact = false }: { post: OverviewPost; compact?: boolean }) {
  const flow = flowOfPost(post);
  const tone = STEP_TONE[flow.step];
  return (
    <Link
      to={`/batches/${post.batch.id}?post=${encodeURIComponent(post.id)}`}
      title={`${STEP_LABEL[flow.step]}${flow.flags.length ? ` (${flow.flags.map((f) => FLAG_LABEL[f]).join(', ')})` : ''}, ${post.time}: ${post.caption || post.title}`}
      className={cn('flex gap-2 rounded-md border border-l-[3px] bg-card p-1.5 text-left text-[12px] leading-snug outline-none transition-colors hover:border-foreground/25 focus-visible:ring-[3px] focus-visible:ring-ring/50', TONE_BAR[tone])}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
          <span className="flex -space-x-0.5">{post.networks.map((n) => <NetworkIcon key={n} network={n} className="size-3.5 rounded-[3px] text-[9px] ring-1 ring-card" />)}</span>
          <span className="tabular-nums">{post.time}</span>
          <span className="sr-only">{STEP_LABEL[flow.step]}{flow.flags.length ? `, ${flow.flags.map((f) => FLAG_LABEL[f]).join(', ')}` : ''}, {post.networks.map(networkLabel).join(', ')}</span>
        </span>
        {!compact && <span className="mt-0.5 line-clamp-2 [overflow-wrap:anywhere]">{post.caption || post.title}</span>}
        {compact && <span className="block truncate">{post.title}</span>}
      </span>
      {!compact && post.thumbnailUrl && <img src={post.thumbnailUrl} alt="" className="size-9 shrink-0 rounded object-cover" loading="lazy" />}
    </Link>
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
    <div ref={scroller} className="relative max-h-[calc(100dvh-15rem)] overflow-auto rounded-lg border">
      <div className="grid min-w-[880px] grid-cols-[4rem_repeat(7,minmax(0,1fr))]">
        <div className="sticky top-0 z-10 border-b bg-background" />
        {days.map((d) => (
          <div key={d} className={cn('sticky top-0 z-10 border-b border-l bg-background px-2 py-2 text-center text-[12.5px] font-medium', d === today ? 'text-primary' : 'text-muted-foreground')}>
            {parse(d).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })} <span className="tabular-nums">{parse(d).getUTCDate()}</span>
            {d === today && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" aria-hidden="true" />}
          </div>
        ))}
        {HOURS.map((h) => (
          <div key={h} className="contents">
            <div data-hour-label={h} className="border-b px-2 pt-1 text-right text-[11px] text-muted-foreground">{hourLabel(h)}</div>
            {days.map((d) => (
              <div key={d} className={cn('flex min-h-16 flex-col gap-1 border-b border-l p-1', d === today && 'bg-brand-soft/30')}>
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
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => <div key={d} className={cn('border-b px-2 py-2 text-[12px] font-medium text-muted-foreground', i && 'border-l')}>{d}</div>)}
        {days.map((d, i) => {
          const list = byDay.get(d) ?? [];
          const inMonth = d.slice(0, 7) === anchor.slice(0, 7);
          return (
            <div key={d} className={cn('flex min-h-28 flex-col gap-1 border-b p-1.5', i % 7 && 'border-l', !inMonth && 'bg-muted/40')}>
              <span className={cn('w-fit rounded-full px-1.5 text-[12px] tabular-nums', d === today ? 'bg-primary font-semibold text-primary-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground')}>{parse(d).getUTCDate()}</span>
              {list.slice(0, 3).map((p) => <Chip key={p.id} post={p} compact />)}
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
  if (!groups.length) return <p className="rounded-lg border border-dashed p-8 text-center text-[13.5px] text-muted-foreground">Nothing is planned in these weeks.</p>;
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

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {network ? <NetworkIcon network={network} className="size-10 rounded-lg text-[20px]" /> : <span className="flex size-10 items-center justify-center rounded-lg border bg-card" aria-hidden="true"><CalendarDays className="size-5" /></span>}
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{network ? networkLabel(network) : 'All channels'}</h1>
            <p className="text-[12.5px] text-muted-foreground">{data.loading && !data.data ? 'Loading' : `${posts.length} ${posts.length === 1 ? 'post' : 'posts'} in view, ${approved} approved`}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border p-0.5" role="group" aria-label="View">
            <Button size="sm" variant={view === 'list' ? 'secondary' : 'ghost'} aria-pressed={view === 'list'} onClick={() => set('view', 'list')}><List aria-hidden="true" /> List</Button>
            <Button size="sm" variant={view !== 'list' ? 'secondary' : 'ghost'} aria-pressed={view !== 'list'} onClick={() => set('view', view === 'list' ? 'week' : view)}><CalendarDays aria-hidden="true" /> Calendar</Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/batches/new')}><Plus aria-hidden="true" /> New batch</Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Earlier" onClick={() => step(-1)}><ChevronLeft aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Later" onClick={() => step(1)}><ChevronRight aria-hidden="true" /></Button>
        <h2 className="min-w-40 text-[15px] font-semibold" aria-live="polite">{title}</h2>
        <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>Today</Button>
        {view !== 'list' && (
          <Select value={view} onValueChange={(v) => set('view', v)}>
            <SelectTrigger size="sm" className="w-28" aria-label="Calendar range"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="week">Week</SelectItem><SelectItem value="month">Month</SelectItem></SelectContent>
          </Select>
        )}
        <div className="ml-auto">
          <Select value={network || 'all'} onValueChange={(v) => set('network', v === 'all' ? '' : v)}>
            <SelectTrigger size="sm" className="w-40" aria-label="Channel"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {['instagram', 'linkedin', 'facebook', 'x'].map((n) => <SelectItem key={n} value={n}>{networkLabel(n)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!data.loading && data.data && posts.length === 0 && next && next > range.to && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2.5 text-[13px]">
          <span>Nothing is planned here. The next post is on {dayLabel(next)}.</span>
          <Button size="sm" variant="outline" onClick={() => setAnchor(next)}>Go there</Button>
        </div>
      )}
      {data.error ? <ErrorBlock message={data.error} onRetry={() => void data.reload()} />
        : data.loading && !data.data ? <Skeleton className="h-[480px] rounded-lg" />
        : view === 'week' ? <WeekGrid start={weekStart(anchor)} today={today} posts={posts} />
        : view === 'month' ? <MonthGrid anchor={anchor} today={today} posts={posts} />
        : <ListView start={anchor} today={today} posts={posts} />}
    </div>
  );
}
