// One post in review, kept short: its picture, title, when it goes, where it stands (one status chip, and one problem chip only
// when there is a problem), the networks, and the few actions. Everything else is on the post's own page. Everything shown is
// untrusted text and is only ever rendered as text.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useLoad } from '../../hooks';
import { ChevronLeft, ChevronRight, ImageOff, Maximize2 } from 'lucide-react';
import { BusyButton, MoreMenu, Notice, SelectBox, Spin } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { postFlow } from './flow/status';
import { NETWORKS } from './labels';
import { goesTo, readNetworks } from './networks';
import { mediaLabel, NetworkRow, PostChips, PostConfirms, postProblem, UploadInput, usePostActions } from './post-parts';
import type { BatchView, DeliveryRow, MediaView, PostDetail, PostSummary } from './types';
import { dayLabel, useInView } from './util';

interface Props {
  summary: PostSummary;
  batch: BatchView;
  // Goes up when the whole batch changed (approve all), so every card fetches again.
  version: number;
  onChanged: () => void;
  // What Buffer holds for this post, so the chip can say how far it got.
  deliveries?: DeliveryRow[];
  // Scroll to this card and light it up for a moment (arriving from the calendar).
  highlight?: boolean;
  // Ticking the card for a bulk action; the box is left out when the card is shown on its own.
  select?: { selected: boolean; onToggle: (range: boolean) => void };
}

export function PostCard({ summary, batch, version, onChanged, deliveries, highlight, select }: Props) {
  const navigate = useNavigate();
  const [ref, seen] = useInView<HTMLDivElement>();
  const fetchNow = seen || !!highlight;
  const load = useLoad(() => (fetchNow ? api.get<PostDetail>(`/api/posts/${summary.id}`) : Promise.resolve(null)), [fetchNow, summary.id, version]);
  const detail = load.data;
  const [viewing, setViewing] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const lastRefresh = useRef(0);
  const lastRender = useRef(summary.renderStatus);

  const render = detail?.post.renderStatus ?? summary.renderStatus;
  const post = detail?.post;
  const apply = (next: PostDetail) => { load.setData(next); onChanged(); };
  const a = usePostActions({ post, reload: load.reload, apply, onChanged });

  // Arriving from the calendar: scroll here, and again once the card has its pictures, then fade the highlight.
  const scrolled = useRef(false);
  useEffect(() => {
    if (!highlight) return;
    ref.current?.scrollIntoView({ block: 'center' });
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 3500);
    return () => clearTimeout(t);
  }, [highlight, ref]);
  useEffect(() => {
    if (highlight && detail && !scrolled.current) { scrolled.current = true; ref.current?.scrollIntoView({ block: 'center' }); }
  }, [highlight, detail, ref]);
  // While images are being made, ask again every few seconds, and tell the page when it finishes.
  useEffect(() => {
    if (render !== 'queued' && render !== 'rendering') return;
    const t = setInterval(() => { void load.reload(); }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render]);
  useEffect(() => {
    if (lastRender.current !== render) {
      const was = lastRender.current;
      lastRender.current = render;
      if ((was === 'queued' || was === 'rendering') && (render === 'ok' || render === 'failed')) onChanged();
    }
  }, [render, onChanged]);

  // Signed picture links expire after a few minutes: if a picture will not load, fetch fresh links, at most once a minute.
  function pictureFailed() {
    if (Date.now() - lastRefresh.current < 60_000) return;
    lastRefresh.current = Date.now();
    void load.reload();
  }

  const state = readNetworks(post?.networks);
  const onNetwork = (n: string) => (post ? goesTo(state, batch.defaultNetworks, n) : batch.defaultNetworks.includes(n));
  const blockers = detail?.blockers ?? [];
  const warnings = detail?.warnings ?? [];
  const flow = postFlow({
    status: post?.status ?? summary.status,
    renderStatus: render,
    warningCount: detail ? warnings.length : summary.warningCount,
    deliveries,
    networks: post ? NETWORKS.filter((n) => goesTo(state, batch.defaultNetworks, n)) : undefined,
  });
  const problem = postProblem(flow, { blockers: post?.status === 'removed' ? [] : blockers, warnings, renderError: post?.renderError, noSources: !!detail && detail.sources.length === 0 });
  const title = post?.title ?? summary.title;
  const approved = (post?.status ?? summary.status) === 'approved';
  const working = render === 'queued' || render === 'rendering';
  const editTo = `/batches/${batch.id}/posts/${summary.id}`;
  const first = post?.media[0] ?? null;

  return (
    <div ref={ref} className="min-w-0">
      <Card role="article" aria-label={`Post: ${summary.title}`} className={cn('min-w-0 gap-2.5 p-3 shadow-none transition-shadow', select?.selected && 'border-primary ring-[3px] ring-primary', flash && 'ring-[3px] ring-primary/60')}>
        {!post ? (
          load.error
            ? <Notice tone="bad" actions={<BusyButton size="sm" variant="outline" onClick={() => void load.reload()}>Try again</BusyButton>}>{load.error}</Notice>
            : <Skeleton className="h-44 w-full" role="status" aria-label="Loading the post" />
        ) : (
          <Picture post={post} first={first} working={working} onFail={pictureFailed} onView={() => setViewing(0)} />
        )}

        <div className="flex items-start gap-2">
          {select && <SelectBox className="mt-0.5" checked={select.selected} label={`Select ${summary.title}`} onToggle={select.onToggle} />}
          <h3 className="min-w-0 flex-1 text-[14px] leading-snug font-semibold [overflow-wrap:anywhere] line-clamp-2">{title}</h3>
          {post && (
            <MoreMenu
              className="-my-1 -mr-1.5 size-7"
              items={[
                ...(post.design ? [{ label: post.renderStatus === 'none' ? 'Make the image' : 'Make the image again', onSelect: () => void a.rerender(), disabled: !!a.busy || working }] : []),
                { label: 'Upload a file', onSelect: () => a.fileRef.current?.click(), disabled: !!a.busy },
                { label: 'Remove', tone: 'danger' as const, onSelect: () => a.setRemoving(true), disabled: !!a.busy },
              ]}
            />
          )}
        </div>

        <When date={post?.date ?? summary.date} time={post?.time ?? summary.time} zone={batch.timezone} />

        <PostChips flow={flow} problem={problem} />
        {blockers.length > 0 && post?.status !== 'removed' && (
          <p className="line-clamp-1 text-[12.5px] text-destructive [overflow-wrap:anywhere]" title={blockers.join(' ')}>
            {blockers[0]}{blockers.length > 1 ? ` (and ${blockers.length - 1} more)` : ''}
          </p>
        )}
        {a.error && (
          <p className="text-[12.5px] font-medium text-destructive [overflow-wrap:anywhere]" role="alert">
            {a.error}{a.errorLines.length > 0 ? `: ${a.errorLines.join('; ')}` : ''}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <NetworkRow on={onNetwork} />
          {post && (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="max-sm:min-h-11" onClick={() => navigate(editTo)} disabled={!!a.busy}>Edit</Button>
              {approved
                ? <BusyButton size="sm" variant="outline" onClick={() => void a.unapprove()} loading={a.busy === 'approve'} disabled={!!a.busy}>Take approval off</BusyButton>
                : <BusyButton size="sm" onClick={() => void a.approve()} loading={a.busy === 'approve'} disabled={!!a.busy || blockers.length > 0}>Approve</BusyButton>}
            </div>
          )}
        </div>
        {post && <UploadInput a={a} title={post.title} />}
      </Card>

      <PostConfirms a={a} title={title} />
      <Viewer post={post} title={title} index={viewing} onIndex={setViewing} />
    </div>
  );
}

// The date and time on one line; the time zone is in a tooltip.
function When({ date, time, zone }: { date: string; time: string; zone: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p tabIndex={0} className="w-fit rounded-sm text-[13px] text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label={`${dayLabel(date)}, ${time}, ${zone}`}>
          {dayLabel(date)}, {time}
        </p>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">Time zone: {zone}</TooltipContent>
    </Tooltip>
  );
}

// The first picture, a fixed height so cards line up; a click opens the larger view.
function Picture({ post, first, working, onFail, onView }: { post: PostDetail['post']; first: MediaView | null; working: boolean; onFail: () => void; onView: () => void }) {
  const box = 'flex h-44 w-full items-center justify-center gap-2 rounded-md bg-muted text-center text-[13px] text-muted-foreground';
  if (!first) {
    if (working) return <div className={box} role="status"><Spin />{post.renderStatus === 'queued' ? 'Waiting to make the image' : 'Making the image'}</div>;
    return <div className={box}><ImageOff className="size-4" aria-hidden="true" />{post.design ? 'No image yet' : 'No picture yet'}</div>;
  }
  const label = mediaLabel(first, post.media);
  const alt = `${post.title}: ${label}`;
  const more = post.media.length - 1;
  return (
    <div className="relative">
      {!first.url ? <div className={box}>Picture not available</div>
        : first.kind === 'video' ? <video src={first.url} controls preload="none" aria-label={alt} onError={onFail} className="block h-44 w-full rounded-md bg-muted object-contain" />
        : (
          <button type="button" onClick={onView} aria-label={`View ${alt} larger`} className="group relative block h-44 w-full cursor-zoom-in rounded-md bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <img src={first.url} alt={alt} loading="lazy" decoding="async" onError={onFail} className={cn('block size-full rounded-md object-contain', working && 'opacity-50')} />
            <span className="absolute right-1.5 top-1.5 rounded-md bg-background/85 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100" aria-hidden="true"><Maximize2 className="size-3.5" /></span>
          </button>
        )}
      {more > 0 && <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-background/85 px-1.5 py-0.5 text-[11.5px] text-muted-foreground">+{more} more</span>}
      {working && <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center gap-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[11.5px] text-muted-foreground" role="status"><Spin className="size-3" />Making the image</span>}
    </div>
  );
}

// The larger view of a picture, with a way through the others when the post has several.
function Viewer({ post, title, index, onIndex }: { post: PostDetail['post'] | undefined; title: string; index: number | null; onIndex: (i: number | null) => void }) {
  const images = post?.media.filter((m) => m.kind === 'image' && m.url) ?? [];
  const m = index !== null ? images[Math.min(index, images.length - 1)] : undefined;
  const at = m ? images.indexOf(m) : 0;
  return (
    <Dialog open={index !== null} onOpenChange={(o) => { if (!o) onIndex(null); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-3 overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">{title}</DialogTitle>
          <DialogDescription>{m && post ? mediaLabel(m, post.media) : ''}</DialogDescription>
        </DialogHeader>
        {m?.url && <img src={m.url} alt={post ? `${post.title}: ${mediaLabel(m, post.media)}` : ''} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-md bg-muted object-contain" />}
        {images.length > 1 && (
          <div className="flex items-center justify-between gap-2" role="group" aria-label="Pictures of this post">
            <Button type="button" variant="outline" size="icon" aria-label="Previous picture" disabled={at === 0} onClick={() => onIndex(at - 1)} className="max-sm:size-11"><ChevronLeft aria-hidden="true" /></Button>
            <span className="text-[13px] text-muted-foreground" aria-live="polite">{at + 1} of {images.length}</span>
            <Button type="button" variant="outline" size="icon" aria-label="Next picture" disabled={at >= images.length - 1} onClick={() => onIndex(at + 1)} className="max-sm:size-11"><ChevronRight aria-hidden="true" /></Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
