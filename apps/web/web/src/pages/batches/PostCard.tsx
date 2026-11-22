// One post in review, kept short: its picture, title, when it goes, where it stands (one status chip, and one problem chip only
// when there is a problem), the networks, and the few actions. Everything else is on the post's own page. Everything shown is
// untrusted text and is only ever rendered as text.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useLoad } from '../../hooks';
import { ChevronLeft, ChevronRight, GalleryHorizontalEnd, ImageOff, Maximize2 } from 'lucide-react';
import { BusyButton, MoreMenu, SelectBox, Spin } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { blockerKind, tidyBlocker } from '../../lib/errors';
import { splitNotes } from '../../lib/post-notes';
import { postFlow } from './flow/status';
import { NETWORKS } from './labels';
import { carouselPages } from './media-groups';
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
  const blockers = (detail?.blockers ?? []).map(tidyBlocker);
  // What the AI only noted does not raise the chip; the post page lists it under "Notes from the AI".
  const warnings = splitNotes(detail?.warnings ?? [], post?.warnings ?? []).warnings;
  const flow = postFlow({
    status: post?.status ?? summary.status,
    renderStatus: render,
    warningCount: detail ? warnings.length : summary.warningCount,
    deliveries,
    networks: post ? NETWORKS.filter((n) => goesTo(state, batch.defaultNetworks, n)) : undefined,
  });
  const problem = postProblem(flow, { blockers: post?.status === 'removed' ? [] : blockers, warnings, renderError: post?.renderError, noSources: !!detail && detail.sources.length === 0 });
  const title = post?.title ?? summary.title;
  // Where the first blocker is fixed: the post (its design) for an unknown post type, the fact for an unconfirmed fact.
  const kind = blockers[0] ? blockerKind(blockers[0]) : null;
  const factHit = kind === 'fact' ? detail?.sources.find((s) => s.title && blockers[0]!.includes(`"${s.title}"`)) : undefined;
  const fixLink = kind === 'post-type' ? { to: `/batches/${batch.id}/posts/${summary.id}`, label: 'Open the post' }
    : factHit ? { to: `/vault/${factHit.id}`, label: 'Open the fact' } : null;
  const approved = (post?.status ?? summary.status) === 'approved';
  const working = render === 'queued' || render === 'rendering';
  const editTo = `/batches/${batch.id}/posts/${summary.id}`;
  const first = post?.media[0] ?? null;
  const pages = post ? carouselPages(post.design, post.media) : null;

  const blocked = blockers.length > 0 && post?.status !== 'removed';
  const caption = (post?.caption ?? summary.caption ?? '').trim();
  const goes = NETWORKS.filter(onNetwork);

  return (
    <div ref={ref} className="min-w-0">
      <Card role="article" aria-label={`Post: ${summary.title}`} className={cn('min-w-0 flex-row gap-0 overflow-hidden p-0 shadow-none transition-shadow', select?.selected && 'border-primary ring-[3px] ring-primary', flash && 'ring-[3px] ring-primary/60')}>
        <div className="relative min-h-28 w-20 shrink-0 self-stretch bg-muted sm:w-28">
          {!post
            ? (load.error ? <div className="flex size-full items-center justify-center"><ImageOff className="size-4 text-muted-foreground" aria-hidden="true" /></div> : <Skeleton className="size-full rounded-none" role="status" aria-label="Loading the post" />)
            : <Picture post={post} first={first} carousel={pages !== null} working={working} onFail={pictureFailed} onView={() => setViewing(0)} />}
          {pages !== null && <CarouselBadge pages={pages} />}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
          <div className="flex items-start gap-1.5">
            <h3 className="min-w-0 flex-1 text-[13.5px] leading-snug font-semibold [overflow-wrap:anywhere] line-clamp-1">
              <Link to={editTo} className="rounded-sm outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 underline-offset-4">{title}</Link>
            </h3>
            {/* The selection box sits with the card's actions, never over its picture. */}
            {select && <SelectBox className="mt-px shrink-0" checked={select.selected} label={`Select ${summary.title}`} onToggle={select.onToggle} />}
            {post && (
              <MoreMenu
                className="-my-1 -mr-1.5 size-7"
                items={[
                  { label: 'Edit', onSelect: () => navigate(editTo) },
                  ...(approved ? [{ label: 'Take approval off', onSelect: () => void a.unapprove(), disabled: !!a.busy }] : []),
                  ...(post.design ? [{ label: post.renderStatus === 'none' ? 'Make the image' : 'Make the image again', onSelect: () => void a.rerender(), disabled: !!a.busy || working }] : []),
                  { label: 'Upload a file', onSelect: () => a.fileRef.current?.click(), disabled: !!a.busy },
                  { label: 'Remove', tone: 'danger' as const, onSelect: () => a.setRemoving(true), disabled: !!a.busy },
                ]}
              />
            )}
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <When date={post?.date ?? summary.date} time={post?.time ?? summary.time} zone={batch.timezone} />
            <NetworkRow on={onNetwork} only={goes} />
          </div>

          {caption
            ? <p className="text-[12.5px] leading-snug text-muted-foreground [overflow-wrap:anywhere] line-clamp-2">{caption}</p>
            : <p className="text-[12.5px] italic text-muted-foreground">No caption yet</p>}

          {load.error && !post && <p className="text-[12.5px] text-destructive" role="alert">{load.error} <button type="button" className="font-medium underline underline-offset-4" onClick={() => void load.reload()}>Try again</button></p>}
          {a.error && (
            <p className="text-[12.5px] font-medium text-destructive [overflow-wrap:anywhere]" role="alert">
              {a.error}{a.errorLines.length > 0 ? `: ${a.errorLines.join('; ')}` : ''}
            </p>
          )}

          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <PostChips flow={flow} problem={problem} className="min-w-0 gap-x-2" />
            {post && !approved && (blocked
              ? <Button size="sm" variant="outline" className="h-7 shrink-0 px-2.5 max-sm:min-h-11" onClick={() => navigate(fixLink?.to ?? editTo)}>Fix</Button>
              : <BusyButton size="sm" className="h-7 shrink-0 px-2.5" onClick={() => void a.approve()} loading={a.busy === 'approve'} disabled={!!a.busy}>Approve</BusyButton>)}
          </div>
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
        <p tabIndex={0} className="w-fit shrink-0 whitespace-nowrap rounded-sm text-[12.5px] text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label={`${dayLabel(date)}, ${time}, ${zone}`}>
          {dayLabel(date)}, {time}
        </p>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">Time zone: {zone}</TooltipContent>
    </Tooltip>
  );
}

// "Carousel, 4 pages" on the thumbnail: an icon and the page count, the words for screen readers.
function CarouselBadge({ pages }: { pages: number }) {
  return (
    <span className="pointer-events-none absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded bg-background/90 px-1 py-px text-[11px] leading-4 font-medium text-foreground tabular-nums">
      <GalleryHorizontalEnd className="size-3" aria-hidden="true" />
      <span aria-hidden="true">{pages}</span>
      <span className="sr-only">Carousel, {pages} pages</span>
    </span>
  );
}

// The first picture as a thumbnail that fills the left of the card; a click opens the larger view.
function Picture({ post, first, carousel, working, onFail, onView }: { post: PostDetail['post']; first: MediaView | null; carousel: boolean; working: boolean; onFail: () => void; onView: () => void }) {
  const box = 'flex size-full min-h-28 flex-col items-center justify-center gap-1 px-1 text-center text-[11.5px] leading-tight text-muted-foreground';
  if (!first) {
    if (working) return <div className={box} role="status"><Spin className="size-4" /><span className="sr-only">{post.renderStatus === 'queued' ? 'Waiting to make the image' : 'Making the image'}</span></div>;
    return <div className={box}><ImageOff className="size-4" aria-hidden="true" /><span>{post.design ? 'No image yet' : 'No picture yet'}</span></div>;
  }
  const label = mediaLabel(first, post.media);
  const alt = `${post.title}: ${label}`;
  const more = post.media.length - 1;
  return (
    <div className="absolute inset-0">
      {!first.url ? <div className={box}>Picture not available</div>
        : first.kind === 'video' ? <video src={first.url} controls preload="none" aria-label={alt} onError={onFail} className="block size-full bg-muted object-cover" />
        : (
          <button type="button" onClick={onView} aria-label={`View ${alt} larger`} className="group relative block size-full cursor-zoom-in outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50">
            <img src={first.url} alt={alt} loading="lazy" decoding="async" onError={onFail} className={cn('block size-full object-cover', working && 'opacity-50')} />
            <span className="absolute right-1 top-1 rounded-md bg-background/85 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true"><Maximize2 className="size-3" /></span>
          </button>
        )}
      {more > 0 && !carousel && <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-background/85 px-1 text-[11px] text-muted-foreground">+{more}</span>}
      {working && <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-background/90 p-1" role="status"><Spin className="size-3" /><span className="sr-only">Making the image</span></span>}
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
