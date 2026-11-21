// One post in review: pictures, render state, captions per network with their limits, when and where it goes, its
// sources, what blocks approval, and the actions. Everything shown is untrusted text and is only ever rendered as text.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useLoad } from '../../hooks';
import { errorMessage } from '../../lib/errors';
import { networkLabel } from '../../lib/labels';
import { Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import { SelectBox } from '@/components/bulk-bar';
import { Notice } from '@/components/notice';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { BusyButton, CheckField, ConfirmAction, Lines, Spin, StatusBadge, ToneBadge } from './parts';
import { CAPTION_LIMIT, NETWORKS, POST_STATUS, RENDER_STATUS, type Network } from './labels';
import { buildNetworks, captionFor, currentCaptions, currentFlags, goesTo, readNetworks } from './networks';
import { PostEditSheet } from './PostEditSheet';
import type { BatchView, MediaView, PostDetail, PostSummary, SourceView } from './types';
import { charCount, dayLabel, detailLines, MAX_UPLOAD, useInView } from './util';

interface Props {
  summary: PostSummary;
  batch: BatchView;
  // Goes up when the whole batch changed (approve all), so every card fetches again.
  version: number;
  // The AI's own note on why it chose this post's picture (only on AI-drafted batches).
  imageReason?: string;
  onChanged: () => void;
  // Ticking the card for a bulk action; the box is left out when the card is shown on its own.
  select?: { selected: boolean; onToggle: (range: boolean) => void };
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime';

function mediaLabel(m: MediaView, all: MediaView[]): string {
  const sameSize = all.filter((x) => x.source === m.source && x.renderSize === m.renderSize);
  if (m.source === 'upload') return `Uploaded: ${m.rel}`;
  const where = m.renderSize ? `${m.renderSize}` : 'image';
  return sameSize.length > 1 && typeof m.slide === 'number' ? `${where}, page ${m.slide + 1} of ${sameSize.length}` : where;
}

export function PostCard({ summary, batch, version, imageReason, onChanged, select }: Props) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const load = useLoad(() => (seen ? api.get<PostDetail>(`/api/posts/${summary.id}`) : Promise.resolve(null)), [seen, summary.id, version]);
  const detail = load.data;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [errorLines, setErrorLines] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dropping, setDropping] = useState<MediaView | null>(null);
  const [viewing, setViewing] = useState<MediaView | null>(null);
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastRefresh = useRef(0);
  const lastRender = useRef(summary.renderStatus);

  const render = detail?.post.renderStatus ?? summary.renderStatus;
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

  async function run<T>(name: string, work: () => Promise<T>): Promise<T | undefined> {
    setBusy(name);
    setError('');
    setErrorLines([]);
    try {
      return await work();
    } catch (err) {
      setError(errorMessage(err));
      setErrorLines(detailLines(err));
      // A refused approval carries its reasons in the post; read them again so they show.
      void load.reload();
      return undefined;
    } finally {
      setBusy('');
    }
  }

  const apply = (next: PostDetail) => { load.setData(next); onChanged(); };

  const post = detail?.post;
  const state = readNetworks(post?.networks);
  const flags = post ? currentFlags(state, batch.defaultNetworks) : {};
  const caps = post ? currentCaptions(state) : {};

  async function toggleNetwork(n: string, checked: boolean) {
    if (!post) return;
    const on = { ...flags, [n]: checked };
    if (!NETWORKS.some((x) => on[x])) { setError('A post must go to at least one network. To drop the post, remove it instead.'); return; }
    const r = await run('network', () => api.patch<PostDetail>(`/api/posts/${post.id}`, { networks: buildNetworks(state, on, caps, batch.defaultNetworks) }));
    if (r) {
      apply(r);
      toast.success(`${networkLabel(n)} ${checked ? 'switched on' : 'switched off'} for this post${post.status === 'approved' ? '. Approval was taken back' : ''}`);
    }
  }

  async function approve() {
    if (!post) return;
    const r = await run('approve', () => api.post<PostDetail>(`/api/posts/${post.id}/approve`));
    if (r) { apply(r); toast.success('Post approved'); }
  }
  async function unapprove() {
    if (!post) return;
    const r = await run('approve', () => api.post<PostDetail>(`/api/posts/${post.id}/unapprove`));
    if (r) { apply(r); toast.success('Approval taken off'); }
  }
  async function rerender() {
    if (!post) return;
    const r = await run('render', () => api.post<{ post: PostDetail['post'] }>(`/api/posts/${post.id}/render`));
    if (r) { toast.success('Rendering started'); await load.reload(); onChanged(); }
  }
  async function upload(file: File | undefined) {
    if (!post || !file) return;
    if (fileRef.current) fileRef.current.value = '';
    if (file.size > MAX_UPLOAD) { setError('That file is larger than 25 MB.'); return; }
    const form = new FormData();
    form.append('file', file);
    const r = await run('upload', () => api.upload<PostDetail>(`/api/posts/${post.id}/media`, form));
    if (r) { apply(r); toast.success('File uploaded'); }
  }

  async function confirmRemove() {
    if (!post) return;
    const r = await api.delete<{ inBuffer?: boolean }>(`/api/posts/${post.id}`);
    setRemoving(false);
    if (r.inBuffer) toast.error('Removed here, but this post is already in Buffer. Delete it there from the Schedule tab');
    else toast.success('Post removed. You can restore it from the list of removed posts');
    onChanged();
  }
  async function confirmDropMedia() {
    if (!post || !dropping) return;
    const next = await api.delete<PostDetail>(`/api/posts/${post.id}/media/${encodeURIComponent(dropping.rel)}`);
    setDropping(null);
    apply(next);
    toast.success('File removed');
  }

  const blockers = detail?.blockers ?? [];
  const warnings = detail?.warnings ?? [];
  const sources = detail?.sources ?? [];
  const sourceFor = (text: string): SourceView[] => sources.filter((s) => (s.title && text.includes(`"${s.title}"`)) || text.includes(s.id));

  return (
    <div ref={ref} className="min-w-0">
      <Card role="article" aria-label={`Post: ${summary.title}`} className={cn('min-w-0 gap-3.5 p-4 sm:p-5', select?.selected && 'border-primary ring-[3px] ring-primary')}>
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          {select && <SelectBox className="mt-1" checked={select.selected} label={`Select ${summary.title}`} onToggle={select.onToggle} />}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-snug [overflow-wrap:anywhere]">{post?.title ?? summary.title}</h3>
            <span className="block font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{summary.postKey}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={post?.status ?? summary.status} map={POST_STATUS} />
            {(post?.design || summary.hasDesign) && <StatusBadge status={render} map={RENDER_STATUS} />}
          </div>
        </div>

        {!post ? (
          load.error
            ? <Notice tone="bad" actions={<BusyButton size="sm" variant="outline" onClick={() => void load.reload()}>Try again</BusyButton>}>{load.error}</Notice>
            : <div className="flex flex-col gap-2.5" role="status" aria-label="Loading the post"><Skeleton className="h-40 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" /></div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              <strong className="font-semibold text-foreground">{dayLabel(post.date)}, {post.time}</strong> <span className="text-[13px]">({batch.timezone})</span>
            </p>

            <Pictures post={post} render={render} onFail={pictureFailed} onDrop={setDropping} onView={setViewing} />
            {imageReason && <p className="-mt-1 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">Why this picture: {imageReason}</p>}
            {post.renderStatus === 'failed' && (
              <Notice tone="bad" title="The images could not be made.">{post.renderError ?? 'No reason was given.'} Fix the design or render again.</Notice>
            )}

            <div>
              <p className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Caption</p>
              <p className={cn('whitespace-pre-wrap text-sm [overflow-wrap:anywhere]', !expanded && 'line-clamp-4')}>{post.caption}</p>
              <BusyButton size="sm" variant="ghost" className="-ml-2 mt-1" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show the full caption'}</BusyButton>
            </div>
            <div className="flex flex-col divide-y rounded-md border" role="group" aria-label="Networks and caption lengths">
              {NETWORKS.map((n) => {
                const on = goesTo(state, batch.defaultNetworks, n);
                const own = state.overrides[n]?.caption;
                const len = charCount(captionFor(post.caption, state, n));
                const limit = CAPTION_LIMIT[n as Network];
                const over = len > limit;
                return (
                  <div className="flex flex-col gap-1.5 px-3 py-1.5" key={n} data-off={!on}>
                    <div className="flex flex-wrap items-center justify-between gap-x-3">
                      <CheckField
                        label={`${networkLabel(n)}${on ? '' : ' (skipped)'}`}
                        checked={on}
                        disabled={!!busy}
                        onCheckedChange={(c) => void toggleNetwork(n, c)}
                      />
                      <span
                        className={cn('whitespace-nowrap font-mono text-xs text-muted-foreground', over && 'font-semibold text-destructive', !over && len > limit * 0.9 && 'text-warning-foreground')}
                        aria-label={`${len} of ${limit} characters${over ? `, ${len - limit} over the limit` : ''}`}
                      >
                        {len} / {limit}{over ? `, ${len - limit} over` : ''}
                      </span>
                    </div>
                    {own && <p className={cn('whitespace-pre-wrap pb-1 text-sm [overflow-wrap:anywhere]', !expanded && 'line-clamp-4', !on && 'text-muted-foreground')}><span className="text-[13px] text-muted-foreground">Own caption: </span>{own}</p>}
                  </div>
                );
              })}
            </div>

            {sources.length > 0 ? (
              <div>
                <p className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sources</p>
                <ul className="flex flex-col gap-1.5">
                  {sources.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2">
                      <Link to={`/vault/${s.id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline [overflow-wrap:anywhere]">{s.title ?? 'Missing vault item'}</Link>
                      {s.deletedAt || s.status === 'missing' ? <ToneBadge tone="bad">{s.status === 'missing' ? 'Missing' : 'Deleted'}</ToneBadge>
                        : s.status === 'confirmed' ? <ToneBadge tone="good" dot>Confirmed</ToneBadge> : <ToneBadge tone="warn" dot>Unconfirmed</ToneBadge>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="text-[13px] text-muted-foreground">No sources linked. Every claim should link to a vault item.</p>}

            {blockers.length > 0 && post.status !== 'removed' && (
              <Notice tone="bad" title="This post cannot be approved yet:">
                <ul className="mt-1.5 list-disc space-y-1 pl-[18px]">
                  {blockers.map((b) => (
                    <li key={b} className="[overflow-wrap:anywhere]">
                      {b}
                      {sourceFor(b).map((s) => <div key={s.id}><Link className="text-primary underline-offset-4 hover:underline" to={`/vault/${s.id}`}>Open "{s.title ?? 'the item'}" in the vault</Link></div>)}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
            {warnings.length > 0 && (
              <Notice tone="warn" title="Worth a look:">
                <Lines items={warnings} />
              </Notice>
            )}
            {error && (
              <Notice tone="bad">
                {error}
                {errorLines.length > 0 && <Lines items={errorLines} />}
              </Notice>
            )}

            <div className="flex flex-wrap gap-2">
              {post.status === 'approved'
                ? <BusyButton size="sm" variant="outline" onClick={() => void unapprove()} loading={busy === 'approve'} disabled={!!busy}>Take approval off</BusyButton>
                : <BusyButton size="sm" onClick={() => void approve()} loading={busy === 'approve'} disabled={!!busy || blockers.length > 0} title={blockers.length ? 'Fix the points above first' : undefined}>Approve</BusyButton>}
              <BusyButton size="sm" variant="outline" onClick={() => setEditing(true)} disabled={!!busy}>Edit</BusyButton>
              {post.design && <BusyButton size="sm" variant="outline" onClick={() => void rerender()} loading={busy === 'render'} disabled={!!busy || render === 'queued' || render === 'rendering'}>{post.renderStatus === 'none' ? 'Render' : 'Re-render'}</BusyButton>}
              <BusyButton size="sm" variant="outline" onClick={() => fileRef.current?.click()} loading={busy === 'upload'} disabled={!!busy}>Upload a file</BusyButton>
              <input ref={fileRef} type="file" accept={ACCEPT} tabIndex={-1} aria-label={`Upload a picture or video for ${post.title}`} className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
              <BusyButton size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setRemoving(true)} disabled={!!busy}>Remove</BusyButton>
            </div>
          </>
        )}
      </Card>

      {detail && (
        <PostEditSheet open={editing} onClose={() => setEditing(false)} batch={batch} detail={detail} onSaved={(next) => { if (next) apply(next); else onChanged(); }} />
      )}
      <ConfirmAction
        open={removing}
        title="Remove this post?"
        message={<>"{post?.title ?? summary.title}" leaves the batch's review list and is not sent. It stays in the batch under removed posts, and you can restore it.</>}
        confirmLabel="Remove post"
        danger
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(false)}
      />
      <ConfirmAction
        open={!!dropping}
        title="Remove this file?"
        message={<>{dropping?.rel} will no longer go out with "{post?.title}". The post goes back to draft if it was approved.</>}
        confirmLabel="Remove file"
        danger
        onConfirm={confirmDropMedia}
        onCancel={() => setDropping(null)}
      />
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-3 overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="[overflow-wrap:anywhere]">{post?.title ?? summary.title}</DialogTitle>
            <DialogDescription>{viewing && post ? mediaLabel(viewing, post.media) : ''}</DialogDescription>
          </DialogHeader>
          {viewing?.url && <img src={viewing.url} alt={post ? `${post.title}: ${mediaLabel(viewing, post.media)}` : ''} className="mx-auto max-h-[75dvh] w-auto max-w-full rounded-md bg-muted object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Pictures({ post, render, onFail, onDrop, onView }: { post: PostDetail['post']; render: string; onFail: () => void; onDrop: (m: MediaView) => void; onView: (m: MediaView) => void }) {
  const working = render === 'queued' || render === 'rendering';
  // One picture fills the card so it can be judged at a glance; several (a carousel, or feed and wide) scroll sideways.
  const single = post.media.length === 1;
  const placeholder = 'flex min-h-30 items-center justify-center gap-2.5 rounded-md bg-muted p-4 text-center text-sm text-muted-foreground';
  if (!post.media.length) {
    if (working) return <div className={placeholder} role="status"><Spin />{render === 'queued' ? 'Waiting for its turn to render' : 'Making the images'}</div>;
    return <div className={placeholder}>{post.design ? 'No images yet. Render this post to make them.' : 'No pictures yet. Upload a file for this post.'}</div>;
  }
  return (
    <div>
      {working && <p className="mb-1.5 flex items-center gap-2 text-[13px] text-muted-foreground" role="status"><Spin /> Making new images. These are the earlier ones.</p>}
      <div className="flex snap-x snap-proximity gap-2.5 overflow-x-auto pb-1.5 focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0} role="group" aria-label={`Pictures for ${post.title}`}>
        {post.media.map((m) => {
          const label = mediaLabel(m, post.media);
          const alt = `${post.title}: ${label}`;
          return (
            <figure key={m.rel} className={cn('m-0 flex snap-start flex-col gap-1', single ? 'w-full flex-auto' : 'flex-none')}>
              {!m.url ? <div className={cn(placeholder, 'h-55 w-44')}>Picture not available</div>
                : m.kind === 'video' ? <video src={m.url} controls preload="none" aria-label={alt} onError={onFail} className="block h-55 w-auto max-w-[78vw] rounded-md bg-muted object-contain ring-1 ring-border" />
                : (
                  <button type="button" onClick={() => onView(m)} aria-label={`View ${alt} larger`} className="group relative block w-full cursor-zoom-in rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                    <img src={m.url} alt={alt} loading="lazy" decoding="async" onError={onFail} className={cn('block rounded-md bg-muted object-contain ring-1 ring-border', single ? 'h-auto w-full' : 'h-80 w-auto max-w-[78vw]')} />
                    <span className="absolute right-1.5 top-1.5 rounded-md bg-background/85 p-1 opacity-0 shadow-xs transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100" aria-hidden="true"><Maximize2 className="size-3.5" /></span>
                  </button>
                )}
              <figcaption className="flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
                <span className="[overflow-wrap:anywhere]">{label}</span>
                {m.source === 'upload' && <BusyButton size="sm" variant="ghost" onClick={() => onDrop(m)} aria-label={`Remove ${m.rel}`}>Remove</BusyButton>}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
