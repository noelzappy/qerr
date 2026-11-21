// One batch as a guided flow: write, review, send drafts to Buffer, go live. Steps 1 and 2 show a card per post; steps 3 and 4
// show the plan, the sending and what happened in Buffer.
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useMatch, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useDocumentTitle, useLoad } from '../hooks';
import { errorMessage } from '../lib/errors';
import type { ChannelsOverview } from '../lib/overview';
import { useSession } from '../session';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { BusyButton, ConfirmAction, EmptyBlock, ErrorBlock, Lines, MoreMenu, Notice, PageHeader, SelectBox, SelectField, StatusBadge, useSelection } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BatchActivityStrip } from './batches/ActivityStrip';
import { BatchFlow } from './batches/flow/BatchFlow';
import { batchCountBadges, flowCounts, flowSteps, nextAction, postFlow, type FlowCommand, type FlowKey } from './batches/flow/status';
import { BATCH_STATUS, POST_FILTERS } from './batches/labels';
import { PostBulkBar } from './batches/PostBulkBar';
import { PostCard } from './batches/PostCard';
import { ScheduleView } from './batches/ScheduleView';
import type { AiDraftNotes, ApproveAllResult, BatchView, DeliveriesResponse, DeliveryRow, PostSummary } from './batches/types';
import { periodLabel } from './batches/util';

interface BatchData { batch: BatchView & { aiDraft?: AiDraftNotes | null }; posts: PostSummary[] }


export function BatchReview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const onSchedule = !!useMatch('/batches/:id/schedule');
  const [params] = useSearchParams();
  const { me } = useSession();
  const state = useLoad(() => api.get<BatchData>(`/api/batches/${encodeURIComponent(id)}`), [id]);
  const deliveries = useLoad(() => api.get<DeliveriesResponse>(`/api/schedule/batches/${encodeURIComponent(id)}/deliveries`), [id]);
  const channels = useLoad(() => api.get<ChannelsOverview>('/api/overview/channels'), []);
  const [deleting, setDeleting] = useState(false);
  const [command, setCommand] = useState<FlowCommand | null>(null);
  const flows = useMemo(() => {
    const byPost = new Map<string, DeliveriesResponse['deliveries']>();
    for (const d of deliveries.data?.deliveries ?? []) byPost.set(d.postId, [...(byPost.get(d.postId) ?? []), d]);
    return { byPost, of: (p: PostSummary) => postFlow({ status: p.status, renderStatus: p.renderStatus, warningCount: p.warningCount, deliveries: byPost.get(p.id) }) };
  }, [deliveries.data]);
  useDocumentTitle(state.data?.batch.title ?? 'Batch');

  if (state.loading && !state.data) {
    return (
      <div className="flex items-center justify-center gap-3 px-5 py-12 text-muted-foreground" role="status">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
        <span>Loading the batch</span>
      </div>
    );
  }
  if (state.error || !state.data) {
    return (
      <>
        <PageHeader crumbs={[{ label: 'Create', to: '/create' }, { label: 'Batch' }]} title="Batch" actions={<Button asChild variant="outline"><Link to="/create"><ArrowLeft aria-hidden="true" />Back to Create</Link></Button>} />
        <Card className="gap-0 p-0"><ErrorBlock message={state.error || 'This batch was not found.'} onRetry={() => void state.reload()} title="This batch could not be opened" /></Card>
      </>
    );
  }
  const { batch, posts } = state.data;
  const importWarnings = (location.state as { importWarnings?: string[] } | null)?.importWarnings ?? [];

  const livePosts = posts.filter((p) => p.status !== 'removed');
  const counts = flowCounts(livePosts.map(flows.of));
  const { steps } = flowSteps(counts);
  const action = nextAction(counts);
  const viewed: FlowKey = onSchedule ? (params.get('step') === 'live' ? 'live' : 'send') : (params.get('step') === 'write' ? 'write' : 'review');
  const lastRun = deliveries.data?.lastRun ?? null;
  const sending = lastRun?.state === 'queued' || lastRun?.state === 'running';
  const canGoLive = me?.role === 'admin' || (!!me && me.id === batch.ownerId);
  const noChannel = !!channels.data && !channels.data.channels.some((c) => c.connected);
  const blockedBy = action.kind === 'send-drafts'
    ? (noChannel ? <>No channel is connected yet. <Link to="/settings/channels" className="font-medium text-primary underline-offset-4 hover:underline">Choose your channels</Link></> : sending ? 'A send is already running.' : null)
    : action.kind === 'go-live'
      ? (!canGoLive ? 'Only an admin or the person who made this batch can schedule live.' : sending ? 'A send is already running.' : null)
      : null;
  const base = `/batches/${batch.id}`;
  const go = (path: string) => navigate(path, { state: location.state });
  const openStep = (k: FlowKey) => go(k === 'send' ? `${base}/schedule` : k === 'live' ? `${base}/schedule?step=live` : k === 'write' ? `${base}?step=write` : base);
  function act() {
    if (action.kind === 'add-post' || action.kind === 'approve-all') { if (onSchedule) go(base); setCommand(action.kind); }
    else if (action.kind === 'send-drafts') { go(`${base}/schedule`); setCommand('ask-draft'); }
    else if (action.kind === 'go-live') { go(`${base}/schedule?step=live`); setCommand('ask-live'); }
  }
  const reloadAll = () => { void state.reload(); void deliveries.reload(); };

  return (
    <>
      <PageHeader
        className="mb-3"
        crumbs={[{ label: 'Create', to: '/create' }, { label: batch.title }]}
        title={batch.title}
        description={(
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12.5px] max-md:whitespace-normal">
            <StatusBadge status={batch.status} map={BATCH_STATUS} />
            <span aria-hidden="true">·</span>
            <span>{periodLabel(batch.periodStart, batch.periodEnd)}</span>
            <span aria-hidden="true">·</span>
            <span>{batch.timezone}, default {batch.defaultTime}</span>
            <span aria-hidden="true">·</span>
            <span>{batch.owner?.name || batch.owner?.email || 'Unknown owner'}</span>
            {batch.aiDrafted && <><span aria-hidden="true">·</span><span>Written by AI</span></>}
          </span>
        )}
        actions={<MoreMenu items={[{ label: 'Delete batch', tone: 'danger', onSelect: () => setDeleting(true) }]} />}
      />
      {/* The server refuses once any post has gone to Buffer; that reason then shows inside the dialog. */}
      <ConfirmAction
        open={deleting}
        danger
        title="Delete this batch?"
        message={<>"{batch.title}" and its {posts.length} {posts.length === 1 ? 'post' : 'posts'} are deleted with their images. This cannot be undone. Posts already sent to Buffer are not affected, and a batch with such posts cannot be deleted here.</>}
        confirmLabel="Delete batch"
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          await api.delete(`/api/batches/${encodeURIComponent(batch.id)}`);
          toast.success(`Deleted "${batch.title}"`);
          navigate('/create');
        }}
      />
      <BatchFlow steps={steps} viewed={viewed} onStep={openStep} action={action} onAct={act} blockedBy={blockedBy} summary={batchCountBadges(batch.counts).map((b) => b.label).join(', ')} />
      {importWarnings.length > 0 && !onSchedule && (
        <div className="mb-4">
          <Notice tone="warn" title={`The import raised ${importWarnings.length} ${importWarnings.length === 1 ? 'warning' : 'warnings'}:`}>
            <Lines items={importWarnings} />
          </Notice>
        </div>
      )}
      <BatchActivityStrip batchId={batch.id} onSettled={reloadAll} />
      {batch.aiDraft && !onSchedule && <AiDraftCard notes={batch.aiDraft} />}
      {onSchedule
        ? <ScheduleView batch={batch} deliveries={deliveries} mode={params.get('step') === 'live' ? 'live' : 'draft'} command={command} onCommandDone={() => setCommand(null)} onChanged={() => void state.reload()} />
        : <ReviewView data={state.data} reload={state.reload} deliveriesByPost={flows.byPost} focusPost={params.get('post')} command={command} onCommandDone={() => setCommand(null)} primaryIsApproveAll={action.kind === 'approve-all'} />}
    </>
  );
}

function ReviewView({ data, reload, deliveriesByPost, focusPost, command, onCommandDone, primaryIsApproveAll }: {
  // The flow's main button is already "Approve all without warnings", so it is not offered a second time here.
  primaryIsApproveAll: boolean;
  data: BatchData;
  reload: () => Promise<void>;
  deliveriesByPost: Map<string, DeliveryRow[]>;
  // A post to scroll to and light up, from the calendar.
  focusPost: string | null;
  command: FlowCommand | null;
  onCommandDone: () => void;
}) {
  const { batch, posts } = data;
  const [filter, setFilter] = useState('');
  const [version, setVersion] = useState(0);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApproveAllResult | null>(null);
  const [error, setError] = useState('');

  const live = posts.filter((p) => p.status !== 'removed');
  const removed = posts.filter((p) => p.status === 'removed');
  const shown = live.filter((p) => !filter
    || (filter === 'render-failed' ? p.renderStatus === 'failed' : filter === 'warnings' ? p.warningCount > 0 : p.status === filter));
  const shownIds = shown.map((p) => p.id);
  const selection = useSelection([...shownIds, ...removed.map((p) => p.id)]);
  const allShownTicked = shownIds.length > 0 && shownIds.every((pid) => selection.isSelected(pid));
  // After a bulk action every card fetches again, as after "Approve all".
  const afterBulk = async () => { setVersion((v) => v + 1); await reload(); };

  async function approveAll() {
    setBusy(true);
    setError('');
    try {
      const r = await api.post<ApproveAllResult>(`/api/posts/batches/${batch.id}/approve-all`);
      setResult(r);
      setVersion((v) => v + 1);
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function restore(p: PostSummary) {
    try {
      await api.post(`/api/posts/${p.id}/restore`);
      toast.success(`"${p.title}" restored. It is back to Writing`);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const changed = () => { void reload(); };

  // The buttons at the top of the page can ask this view to act.
  useEffect(() => {
    if (command === 'add-post') navigate(`/batches/${batch.id}/posts/new`);
    else if (command === 'approve-all') void approveAll();
    else return;
    onCommandDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command]);

  const addPost = () => navigate(`/batches/${batch.id}/posts/new`);

  return (
    <div className="flex flex-col gap-4">
      <div role="region" aria-label="Filter and batch actions" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex items-end gap-2">
            <SelectField className="w-44 sm:w-52" label="Show" value={filter} onValueChange={setFilter} options={POST_FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
            <BusyButton variant="outline" onClick={addPost}>Add a post</BusyButton>
            {!primaryIsApproveAll && (
              <MoreMenu label="More batch actions" items={[{ label: 'Approve all without warnings', onSelect: () => void approveAll(), disabled: busy || live.length === 0 }]} />
            )}
          </div>
          {shown.length > 0 && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <SelectBox checked={allShownTicked} label="Select all shown" onToggle={() => (allShownTicked ? selection.deselect(shownIds) : selection.selectMany(shownIds))} />
              <span aria-hidden="true">Select all shown ({shown.length})</span>
            </div>
          )}
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
      </div>

      {live.length === 0 ? (
        <Card className="gap-0 p-0"><EmptyBlock title="This batch has no posts yet" action={<BusyButton variant="outline" onClick={addPost}>Add the first post</BusyButton>}>Add posts by hand, or import a batch file from the batch list to start with a full set.</EmptyBlock></Card>
      ) : shown.length === 0 ? (
        <Card className="gap-0 p-0"><EmptyBlock title="No posts match this filter" action={<BusyButton variant="outline" onClick={() => setFilter('')}>Show all posts</BusyButton>}>Choose another filter to see the rest.</EmptyBlock></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {shown.map((p) => (
              <PostCard key={p.id} summary={p} batch={batch} version={version} onChanged={changed}
                deliveries={deliveriesByPost.get(p.id)} highlight={p.id === focusPost}
                select={{ selected: selection.isSelected(p.id), onToggle: (range) => selection.toggle(p.id, range) }} />
            ))}
          </div>
        </>
      )}

      {removed.length > 0 && (
        <details className="border-t pt-2">
          <summary className="flex min-h-9 cursor-pointer items-center text-[13px] font-medium text-muted-foreground max-sm:min-h-11">Removed posts ({removed.length})</summary>
          <ul>
            {removed.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-2">
                <SelectBox checked={selection.isSelected(p.id)} label={`Select ${p.title}`} onToggle={(range) => selection.toggle(p.id, range)} />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]"><strong>{p.title}</strong> <span className="block font-mono text-xs text-muted-foreground">{p.postKey}</span></span>
                <BusyButton size="sm" variant="outline" onClick={() => void restore(p)}>Restore</BusyButton>
              </li>
            ))}
          </ul>
        </details>
      )}

      <PostBulkBar selection={selection} posts={posts} afterRun={afterBulk} />
      <Dialog open={!!result} onOpenChange={(o) => { if (!o) setResult(null); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve all: the result</DialogTitle>
            <DialogDescription>Only posts with no blockers and no warnings are approved. Open a skipped post to see and fix what stopped it.</DialogDescription>
          </DialogHeader>
          {result && (
            <div className="flex flex-col gap-3">
              <Notice tone={result.approved.length ? 'good' : 'info'} title={`${result.approved.length} approved.`}>
                {result.approved.length ? <Lines items={result.approved.map((p) => p.postKey)} /> : 'No post was ready to approve.'}
              </Notice>
              {result.skipped.length > 0 && (
                <Notice tone="warn" title={`${result.skipped.length} skipped.`}>
                  <ul className="mt-1.5 list-disc space-y-1 pl-[18px]">
                    {result.skipped.map((p) => <li key={p.id}><strong>{p.postKey}</strong><Lines items={p.reasons} /></li>)}
                  </ul>
                </Notice>
              )}
            </div>
          )}
          <DialogFooter className="max-sm:[&>*]:min-h-11"><Button onClick={() => setResult(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// What the AI reported when it drafted this batch: how it was made, what it threw away and the pictures it wished for.
function AiDraftCard({ notes }: { notes: AiDraftNotes }) {
  const rejected = notes.rejected ?? [];
  const suggestions = notes.imageSuggestions ?? [];
  const messages = notes.messages ?? [];
  return (
    <div className="mb-4">
      <Notice tone="info" title="Written by AI. Check every post and its sources before approving.">
        <ul className="mt-1.5 list-disc space-y-1 pl-[18px] [overflow-wrap:anywhere]">
          <li>
            {notes.delivered ?? '?'} of {notes.requested ?? '?'} requested posts passed the automatic checks
            {notes.promptVersion ? `, prompt ${notes.promptVersion}` : ''}{notes.model ? `, model ${notes.model}` : ''}.
          </li>
          {notes.plan && <li>Plan: {notes.plan}</li>}
          {messages.map((m, i) => <li key={`m${i}`}>{m}</li>)}
          {suggestions.map((s, i) => <li key={`s${i}`}>Picture wanted for {s.postId}: {s.suggestion}</li>)}
          {rejected.map((r, i) => <li key={`r${i}`}>Left out {r.id ?? 'a post'}: {r.reasons.join('; ')}</li>)}
        </ul>
      </Notice>
    </div>
  );
}
