// One post on its own page: Create / <batch> / <post>. The form on the left (when and where, caption, design, sources), the
// live preview and the saved pictures on the right. Also the page that adds a post (/batches/:id/posts/new).
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { useDocumentTitle, useLoad } from '../../hooks';
import { FailureText } from '@/components/failure-text';
import { blockerKind, errorMessage, fieldErrors, tidyBlocker } from '../../lib/errors';
import { networkLabel } from '../../lib/labels';
import { splitNotes } from '../../lib/post-notes';
import { BusyButton, CheckField, EmptyBlock, FieldSet, FormProblem, Hint, LoadingBlock, MoreMenu, Notice, PageHeader, TextField, ToneBadge } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDiscard, useUnsavedGuard, withoutGuard } from '@/hooks/use-unsaved-guard';
import { cn } from '@/lib/utils';
import { DesignFields } from './DesignFields';
import { RewritePostDialog } from './RewritePostDialog';
import { CaptionFields, Counter } from './editor/CaptionFields';
import { PreviewPane } from './editor/PreviewPane';
import { usePreview } from './editor/usePreview';
import { postFlow } from './flow/status';
import { CAPTION_LIMIT, NETWORKS, type Network } from './labels';
import { buildNetworks, currentCaptions, currentFlags, goesTo, readNetworks } from './networks';
import { mediaLabel, PostChips, PostConfirms, postProblem, UploadInput, usePostActions } from './post-parts';
import type { AiDraftNotes, BatchView, DeliveryRow, DesignBlock, PostDetail, SourceView } from './types';
import { detailLines } from './util';

type BatchData = BatchView & { aiDraft?: AiDraftNotes | null };

export function PostPage() {
  const { id = '', postId } = useParams();
  const batch = useLoad(() => api.get<{ batch: BatchData }>(`/api/batches/${encodeURIComponent(id)}`).then((r) => r.batch), [id]);
  const detail = useLoad(() => (postId ? api.get<PostDetail>(`/api/posts/${encodeURIComponent(postId)}`) : Promise.resolve(null)), [postId]);
  const deliveries = useLoad(() => (postId ? api.get<{ deliveries: DeliveryRow[] }>(`/api/schedule/batches/${encodeURIComponent(id)}/deliveries`).then((r) => r.deliveries) : Promise.resolve([] as DeliveryRow[])), [id, postId]);
  useDocumentTitle(detail.data?.post.title ?? (postId ? 'Post' : 'New post'));

  const back = (
    <Button asChild variant="outline" className="max-sm:min-h-11"><Link to={batch.data ? `/batches/${id}` : '/create'}>{batch.data ? 'Back to the batch' : 'Back to Create'}</Link></Button>
  );
  if ((batch.loading && !batch.data) || (!!postId && detail.loading && !detail.data)) return <LoadingBlock label="Loading the post" />;
  if (batch.error || !batch.data) {
    return <EmptyBlock title="This batch was not found" action={<Button asChild variant="outline"><Link to="/create">Back to Create</Link></Button>}>{batch.error || 'It may have been deleted.'}</EmptyBlock>;
  }
  const missing = !!postId && (!detail.data || detail.data.post.id !== postId || detail.data.post.batchId !== id);
  if (missing) {
    return <EmptyBlock title="This post was not found" action={back}>{detail.error || 'It may have been removed, or it belongs to another batch.'}</EmptyBlock>;
  }
  return <PostEditor batch={batch.data} detail={postId ? detail.data : null} setDetail={(d) => detail.setData(d)} reload={detail.reload} deliveries={deliveries.data ?? []} />;
}

// A section of the form: a title (with an optional info icon), separated from the one before by a hairline and space.
function Section({ title, hint, children, className, id }: { title: string; hint?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} aria-label={title} className={cn('border-t pt-6 first:border-t-0 first:pt-0', className)}>
      <h2 className="mb-3 flex items-center gap-1 text-[14px] font-semibold">{title}{hint && <Hint about={title}>{hint}</Hint>}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function PostEditor({ batch, detail, setDetail, reload, deliveries }: { batch: BatchData; detail: PostDetail | null; setDetail: (d: PostDetail) => void; reload: () => Promise<void>; deliveries: DeliveryRow[] }) {
  const navigate = useNavigate();
  const post = detail?.post ?? null;
  // Goes up after a save, so the form starts again from what was saved.
  const [rev, setRev] = useState(0);
  const base = useMemo(() => readNetworks(post?.networks), [post]);
  const initial = useMemo(() => ({
    title: post?.title ?? '', caption: post?.caption ?? '', date: post?.date ?? '', time: post?.time ?? batch.defaultTime,
    on: post ? currentFlags(base, batch.defaultNetworks) : Object.fromEntries(NETWORKS.map((n) => [n, batch.defaultNetworks.includes(n)])) as Record<string, boolean>,
    caps: currentCaptions(base),
    design: post?.design ?? null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rev, post?.id, post?.updatedAt]);

  const [title, setTitle] = useState(initial.title);
  const [caption, setCaption] = useState(initial.caption);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [on, setOn] = useState(initial.on);
  const [caps, setCaps] = useState(initial.caps);
  const [design, setDesign] = useState<DesignBlock | null>(initial.design);
  const [jsonError, setJsonError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const preview = usePreview(design, !!jsonError);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});

  const dirty = !saved && (
    title !== initial.title || caption !== initial.caption || date !== initial.date || time !== initial.time
    || JSON.stringify(on) !== JSON.stringify(initial.on) || JSON.stringify(caps) !== JSON.stringify(initial.caps)
    || JSON.stringify(design) !== JSON.stringify(initial.design)
  );
  useUnsavedGuard(dirty);

  const batchTo = `/batches/${batch.id}`;
  const backTo = post ? `${batchTo}?post=${encodeURIComponent(post.id)}` : batchTo;
  const askClose = () => confirmDiscard(dirty, () => navigate(backTo));

  const apply = (next: PostDetail) => setDetail(next);
  const a = usePostActions({
    post: post ?? undefined,
    reload,
    apply,
    onChanged: () => {},
    onRemoved: () => withoutGuard(() => navigate(batchTo)),
  });

  // While the image is being made, ask again every few seconds so it shows up here.
  const render = post?.renderStatus ?? 'none';
  const working = render === 'queued' || render === 'rendering';
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => { void reload(); }, 3000);
    return () => clearInterval(t);
  }, [working, reload]);

  // Start again from a post as the server has it (after a save, or after the AI rewrote it).
  function adopt(next: PostDetail) {
    setDetail(next);
    setRev((r) => r + 1);
    setTitle(next.post.title);
    const savedBase = readNetworks(next.post.networks);
    setCaption(next.post.caption); setDate(next.post.date); setTime(next.post.time);
    setOn(currentFlags(savedBase, batch.defaultNetworks)); setCaps(currentCaptions(savedBase)); setDesign(next.post.design ?? null);
    setJsonError('');
  }
  const [rewriting, setRewriting] = useState(false);
  const rewriteInfo = detail?.rewrite;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    if (!title.trim()) problems.title = 'Give the post a title';
    if (!caption.trim()) problems.caption = 'Write the main caption';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.date = 'Choose a date';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) problems.time = 'Choose a time';
    if (!NETWORKS.some((n) => on[n])) problems.networks = 'Choose at least one network';
    if (jsonError) problems.design = 'Fix the advanced design JSON first';
    setFields(problems);
    setLines([]);
    if (Object.keys(problems).length) { setError('Check the highlighted fields and try again.'); return; }
    setBusy(true);
    setError('');
    const networks = buildNetworks(base, on, caps, batch.defaultNetworks);
    try {
      if (post) {
        const body: Record<string, unknown> = {};
        if (title.trim() !== initial.title) body.title = title.trim();
        if (caption !== initial.caption) body.caption = caption;
        if (date !== initial.date) body.date = date;
        if (time !== initial.time) body.time = time;
        if (JSON.stringify(networks) !== JSON.stringify(buildNetworks(base, initial.on, initial.caps, batch.defaultNetworks))) body.networks = networks;
        if (JSON.stringify(design) !== JSON.stringify(initial.design)) body.design = design;
        if (!Object.keys(body).length) { toast.success('Nothing was changed'); return; }
        const next = await api.patch<PostDetail>(`/api/posts/${post.id}`, body);
        const reset = post.status === 'approved' && next.post.status !== 'approved';
        toast.success(reset ? 'Saved. The approval was taken back: approve it again when you are happy' : 'Saved');
        adopt(next);
      } else {
        const r = await api.post<{ posts: Array<{ id: string }> }>(`/api/batches/${batch.id}/posts`, {
          posts: [{ title: title.trim(), caption, date, time, networks, ...(design ? { design } : {}) }],
        });
        toast.success('Saved. The new post starts as Writing');
        setSaved(true);
        const newId = r.posts[0]?.id;
        withoutGuard(() => navigate(newId ? `${batchTo}/posts/${newId}` : batchTo, { replace: true }));
      }
    } catch (err) {
      setFields(fieldErrors(err));
      setLines(detailLines(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Where the post stands, read the way the card reads it.
  const blockers = post?.status === 'removed' ? [] : (detail?.blockers ?? []).map(tidyBlocker);
  const { notes: aiNotes, warnings } = splitNotes(detail?.warnings ?? [], post?.warnings ?? []);
  const sources = detail?.sources ?? [];
  const flow = postFlow({
    status: post?.status ?? 'draft',
    renderStatus: render,
    warningCount: warnings.length,
    deliveries: deliveries.filter((d) => d.postId === post?.id),
    networks: post ? NETWORKS.filter((n) => goesTo(base, batch.defaultNetworks, n)) : undefined,
  });
  const problem = post ? postProblem(flow, { blockers, warnings, renderError: post.renderError, noSources: sources.length === 0 }) : null;
  const sourceFor = (text: string): SourceView[] => sources.filter((s) => (s.title && text.includes(`"${s.title}"`)) || text.includes(s.id));
  const approved = post?.status === 'approved';
  const imageReason = post ? batch.aiDraft?.imageReasons?.find((r) => r.postId === post.postKey)?.reason : undefined;
  const shownTitle = post?.title ?? 'New post';

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-5 border-b bg-background/95 px-4 pt-4 backdrop-blur md:-mx-6 md:px-6">
        <PageHeader
          className="mb-0 pb-3"
          crumbs={[{ label: 'Create', to: '/create' }, { label: batch.title, to: backTo }, { label: shownTitle }]}
          title={shownTitle}
          description={post ? <PostChips flow={flow} problem={problem} /> : undefined}
          actions={(
            <>
              {dirty && <span className="text-[12.5px] text-muted-foreground max-sm:hidden" role="status">Unsaved changes</span>}
              <BusyButton variant="outline" onClick={askClose} disabled={busy}>Cancel</BusyButton>
              <BusyButton type="submit" loading={busy}>Save</BusyButton>
              {post && (
                <MoreMenu
                  className="max-sm:flex-none"
                  items={[
                    approved
                      ? { label: 'Take approval off', onSelect: () => void a.unapprove(), disabled: !!a.busy || busy }
                      : { label: dirty ? 'Approve (save first)' : 'Approve', onSelect: () => void a.approve(), disabled: !!a.busy || busy || dirty || blockers.length > 0 },
                    { label: dirty ? 'Rewrite with AI (save first)' : 'Rewrite with AI', onSelect: () => setRewriting(true), disabled: !!a.busy || busy || dirty },
                    ...(post.design ? [{ label: post.renderStatus === 'none' ? 'Make the image' : 'Make the image again', onSelect: () => void a.rerender(), disabled: !!a.busy || working }] : []),
                    { label: 'Upload a file', onSelect: () => a.fileRef.current?.click(), disabled: !!a.busy },
                    { label: 'Remove', tone: 'danger' as const, onSelect: () => a.setRemoving(true), disabled: !!a.busy },
                  ]}
                />
              )}
            </>
          )}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 empty:hidden">
        {approved && (
          <Notice tone="warn">This post is approved. Changing its words, date, time, networks or design takes the approval back, so it goes back to Writing. Changing only the title does not.</Notice>
        )}
        {blockers.length > 0 && (
          <Notice tone="bad" title="Fix this before the post can be approved:">
            <ul className="mt-1.5 list-disc space-y-1 pl-[18px]">
              {blockers.map((b) => (
                <li key={b} className="[overflow-wrap:anywhere]">
                  {b}
                  {blockerKind(b) === 'post-type' && <div><a className="text-primary underline-offset-4 hover:underline" href="#post-design">Go to Design</a></div>}
                  {sourceFor(b).map((s) => <div key={s.id}><Link className="text-primary underline-offset-4 hover:underline" to={`/vault/${s.id}`}>Open "{s.title ?? 'the fact'}" in Facts</Link></div>)}
                </li>
              ))}
            </ul>
          </Notice>
        )}
        <FormProblem error={error} lines={lines} />
        <FormProblem error={a.error} lines={a.errorLines} />
      </div>

      <div className="grid grid-cols-1 gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 max-w-[720px] flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Section title="When and where">
            <TextField label="Title" hint="A label for the team. It is not published." value={title} maxLength={200} error={fields.title} onChange={(e) => setTitle(e.target.value)} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label="Date" type="date" value={date} error={fields.date} onChange={(e) => setDate(e.target.value)} />
              <TextField label="Time" type="time" value={time} error={fields.time} hint={`In ${batch.timezone}.`} onChange={(e) => setTime(e.target.value)} />
            </div>
            <FieldSet legend="Networks" error={fields.networks}>
              <div className="grid w-full grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
                {NETWORKS.map((n) => {
                  const text = caps[n]?.trim() ? caps[n]! : caption;
                  return (
                    <div key={n} className="flex items-center justify-between gap-3">
                      <CheckField label={networkLabel(n)} checked={!!on[n]} onCheckedChange={(c) => setOn({ ...on, [n]: c })} />
                      {on[n] && <Counter value={text} limit={CAPTION_LIMIT[n as Network]} />}
                    </div>
                  );
                })}
              </div>
            </FieldSet>
          </Section>

          <Section title="Caption">
            <CaptionFields caption={caption} onCaption={setCaption} caps={caps} onCaps={setCaps} on={on} error={fields.caption} />
          </Section>

          <Section title="Design" id="post-design" className="scroll-mt-28">
            <DesignFields design={design} jsonError={jsonError} onChange={(d, err) => { setDesign(d); setJsonError(err); }} />
            {fields.design && <p className="text-[13px] font-medium text-destructive" role="alert">{fields.design}</p>}
          </Section>

          {post && (
            <Section title="Sources and notes" hint="Every claim in a post should link to a fact.">
              {sources.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {sources.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2">
                      <Link to={`/vault/${s.id}`} className="text-[13.5px] font-medium text-primary underline-offset-4 hover:underline [overflow-wrap:anywhere]">{s.title ?? 'Missing fact'}</Link>
                      {s.deletedAt || s.status === 'missing' ? <ToneBadge tone="bad">{s.status === 'missing' ? 'Missing' : 'Deleted'}</ToneBadge>
                        : s.status === 'confirmed' ? <ToneBadge tone="good" dot>Confirmed</ToneBadge> : <ToneBadge tone="warn" dot>Unconfirmed</ToneBadge>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13px] text-muted-foreground">No sources linked. Every claim should link to a fact.</p>}
              {aiNotes.length > 0 && (
                <div>
                  <h3 className="mb-1 text-[13px] font-semibold">Notes from the AI</h3>
                  <ul className="list-disc space-y-1 pl-[18px] text-[13px] text-muted-foreground">{aiNotes.map((n, i) => <li key={i} className="[overflow-wrap:anywhere]">{n}</li>)}</ul>
                </div>
              )}
              {imageReason && <p className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">Why this picture: {imageReason}</p>}
            </Section>
          )}

          {post && (
            <details className="border-t pt-4 text-[13px] text-muted-foreground">
              <summary className="flex min-h-8 cursor-pointer items-center font-semibold text-foreground max-sm:min-h-11">Details</summary>
              <p className="pb-1">Post key: <span className="font-mono [overflow-wrap:anywhere]">{post.postKey}</span></p>
            </details>
          )}
        </div>

        <aside className="min-w-0 lg:sticky lg:top-28 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto max-lg:order-first" aria-label="Preview and pictures">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold">Preview</h2>
            <button
              type="button"
              aria-expanded={showPreview}
              aria-controls="post-preview"
              onClick={() => setShowPreview(!showPreview)}
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-[13px] font-medium outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11 lg:hidden"
            >
              {showPreview ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
              {showPreview ? 'Hide preview' : 'Show preview'}
            </button>
          </div>
          <div id="post-preview" className={cn('flex flex-col gap-4', !showPreview && 'max-lg:hidden')}>
            {post && render === 'failed' && (
              <Notice
                tone="bad"
                title="The image could not be made."
                actions={post.design ? <BusyButton size="sm" variant="outline" loading={a.busy === 'render'} disabled={!!a.busy || working} onClick={() => void a.rerender()}>Make the image again</BusyButton> : undefined}
              >
                <FailureText text={post.renderError} />
              </Notice>
            )}
            <PreviewPane design={design} preview={preview} />
            {post && <SavedPictures post={post} working={working} onDrop={a.setDropping} />}
            {warnings.length > 0 && <Notice tone="warn" title="Worth a look:"><ul className="mt-1.5 list-disc space-y-1 pl-[18px]">{warnings.map((w, i) => <li key={i} className="[overflow-wrap:anywhere]">{w}</li>)}</ul></Notice>}
          </div>
        </aside>
      </div>

      {post && (
        <RewritePostDialog
          open={rewriting}
          onClose={() => setRewriting(false)}
          postId={post.id}
          unavailable={rewriteInfo && !rewriteInfo.available ? rewriteInfo.reason : null}
          onRewritten={async () => { adopt(await api.get<PostDetail>(`/api/posts/${encodeURIComponent(post.id)}`)); }}
        />
      )}
      {post && <UploadInput a={a} title={post.title} />}
      {post && <PostConfirms a={a} title={post.title} />}
    </form>
  );
}

// The pictures saved with the post: the images made from its design and the files uploaded for it.
function SavedPictures({ post, working, onDrop }: { post: PostDetail['post']; working: boolean; onDrop: (m: PostDetail['post']['media'][number]) => void }) {
  if (!post.media.length && !working) return null;
  return (
    <section aria-label="Pictures saved with this post" className="border-t pt-4">
      <h3 className="mb-2 text-[13.5px] font-semibold">Saved pictures</h3>
      {working && <Skeleton className="mb-2 h-6 w-48" role="status" aria-label="Making the image" />}
      <ul className="grid grid-cols-2 gap-3">
        {post.media.map((m) => {
          const label = mediaLabel(m, post.media);
          return (
            <li key={m.rel} className="flex min-w-0 flex-col gap-1">
              {m.url && m.kind === 'image'
                ? <a href={m.url} target="_blank" rel="noreferrer" aria-label={`Open ${post.title}: ${label} in a new tab`}><img src={m.url} alt={`${post.title}: ${label}`} loading="lazy" className="h-28 w-full rounded-md bg-muted object-contain" /></a>
                : <div className="flex h-28 items-center justify-center rounded-md bg-muted text-[12.5px] text-muted-foreground">{m.kind === 'video' ? 'Video' : 'Not available'}</div>}
              <span className="text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">{label}</span>
              {m.source === 'upload' && <BusyButton size="sm" variant="ghost" className="w-fit text-destructive hover:text-destructive" onClick={() => onDrop(m)} aria-label={`Remove ${m.rel}`}>Remove</BusyButton>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
