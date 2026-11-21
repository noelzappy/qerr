// One batch: the Review tab (a card per post) and the Schedule tab (the plan, sending and what happened in Buffer).
import { useState } from 'react';
import { Link, useLocation, useMatch, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useDocumentTitle, useLoad } from '../hooks';
import { errorMessage } from '../lib/errors';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SelectBox } from '@/components/bulk-bar';
import { Notice } from '@/components/notice';
import { useSelection } from '@/components/use-selection';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BatchActivityStrip } from './batches/ActivityStrip';
import { BATCH_STATUS, POST_FILTERS } from './batches/labels';
import { BusyButton, ConfirmAction, EmptyState, ErrorState, Lines, PageHeader, SelectField, StatusBadge, ToneBadge } from './batches/parts';
import { PostBulkBar } from './batches/PostBulkBar';
import { PostCard } from './batches/PostCard';
import { PostEditSheet } from './batches/PostEditSheet';
import { ScheduleView } from './batches/ScheduleView';
import type { AiDraftNotes, ApproveAllResult, BatchView, PostSummary } from './batches/types';
import { periodLabel } from './batches/util';

interface BatchData { batch: BatchView & { aiDraft?: AiDraftNotes | null }; posts: PostSummary[] }

export function BatchReview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const onSchedule = !!useMatch('/batches/:id/schedule');
  const state = useLoad(() => api.get<BatchData>(`/api/batches/${encodeURIComponent(id)}`), [id]);
  const [deleting, setDeleting] = useState(false);
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
        <PageHeader title="Batch" actions={<Button asChild variant="outline"><Link to="/create"><ArrowLeft aria-hidden="true" />Back to Create</Link></Button>} />
        <Card className="gap-0 p-0"><ErrorState message={state.error || 'This batch was not found.'} onRetry={() => void state.reload()} title="This batch could not be opened" /></Card>
      </>
    );
  }
  const { batch, posts } = state.data;
  const importWarnings = (location.state as { importWarnings?: string[] } | null)?.importWarnings ?? [];

  return (
    <>
      <PageHeader
        title={batch.title}
        description={(
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <StatusBadge status={batch.status} map={BATCH_STATUS} />
            <span>{periodLabel(batch.periodStart, batch.periodEnd)}</span>
            <span>{batch.timezone}, default {batch.defaultTime}</span>
            <span>Owner: {batch.owner?.name || batch.owner?.email || 'unknown'}</span>
            {batch.aiDrafted && <ToneBadge tone="info">AI draft</ToneBadge>}
          </span>
        )}
        actions={(
          <>
            <Button variant="outline" className="text-destructive hover:text-destructive max-sm:min-h-11" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden="true" />Delete batch
            </Button>
            <Button asChild variant="outline" className="max-sm:min-h-11"><Link to="/create">All batches</Link></Button>
          </>
        )}
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
      <Tabs
        value={onSchedule ? 'schedule' : 'review'}
        onValueChange={(t) => navigate(t === 'schedule' ? `/batches/${batch.id}/schedule` : `/batches/${batch.id}`, { state: location.state })}
        className="mb-5"
      >
        <TabsList aria-label="Batch views" className="h-auto max-w-full justify-start">
          <TabsTrigger value="review" className="max-sm:min-h-11">Review ({posts.length - (batch.counts.removed ?? 0)})</TabsTrigger>
          <TabsTrigger value="schedule" className="max-sm:min-h-11">Schedule</TabsTrigger>
        </TabsList>
      </Tabs>
      {importWarnings.length > 0 && !onSchedule && (
        <div className="mb-4">
          <Notice tone="warn" title={`The import raised ${importWarnings.length} ${importWarnings.length === 1 ? 'warning' : 'warnings'}:`}>
            <Lines items={importWarnings} />
          </Notice>
        </div>
      )}
      <BatchActivityStrip batchId={batch.id} onSettled={() => void state.reload()} />
      {batch.aiDraft && !onSchedule && <AiDraftCard notes={batch.aiDraft} />}
      {onSchedule ? <ScheduleView batch={batch} onChanged={() => void state.reload()} /> : <ReviewView data={state.data} reload={state.reload} />}
    </>
  );
}

function ReviewView({ data, reload }: { data: BatchData; reload: () => Promise<void> }) {
  const { batch, posts } = data;
  const [filter, setFilter] = useState('');
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
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
  const approved = live.filter((p) => p.status === 'approved').length;
  const pct = live.length ? Math.round((approved / live.length) * 100) : 0;

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
      toast.success(`"${p.title}" restored as a draft`);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const changed = () => { void reload(); };

  return (
    <div className="flex flex-col gap-4">
      <Card role="region" aria-label="Progress and batch actions" className="gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
          <div className="flex min-w-[min(320px,100%)] flex-1 basis-60 flex-col gap-1.5">
            <p><strong>{approved} of {live.length}</strong> {live.length === 1 ? 'post is' : 'posts are'} approved</p>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Posts approved" aria-valuemin={0} aria-valuemax={live.length} aria-valuenow={approved}>
              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <ToneBadge tone="warn">{batch.counts.draft ?? 0} draft</ToneBadge>
              <ToneBadge tone="good">{batch.counts.approved ?? 0} approved</ToneBadge>
              {(batch.counts.removed ?? 0) > 0 && <ToneBadge tone="quiet">{batch.counts.removed} removed</ToneBadge>}
              {(batch.counts.renderFailed ?? 0) > 0 && <ToneBadge tone="bad">{batch.counts.renderFailed} render failed</ToneBadge>}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2.5 max-sm:w-full">
            <SelectField className="w-full sm:w-56" label="Show" value={filter} onValueChange={setFilter} options={POST_FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
            <BusyButton variant="outline" onClick={() => setAdding(true)}>Add a post</BusyButton>
            <BusyButton onClick={() => void approveAll()} loading={busy} disabled={live.length === 0}>Approve all without warnings</BusyButton>
          </div>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
      </Card>

      {live.length === 0 ? (
        <Card className="gap-0 p-0"><EmptyState title="This batch has no posts yet" action={<BusyButton onClick={() => setAdding(true)}>Add the first post</BusyButton>}>Add posts by hand, or import a batch file from the batch list to start with a full set.</EmptyState></Card>
      ) : shown.length === 0 ? (
        <Card className="gap-0 p-0"><EmptyState title="No posts match this filter" action={<BusyButton variant="outline" onClick={() => setFilter('')}>Show all posts</BusyButton>}>Choose another filter to see the rest.</EmptyState></Card>
      ) : (
        <>
          <div className="flex items-center gap-3 text-sm">
            <SelectBox checked={allShownTicked} label="Select all shown" onToggle={() => (allShownTicked ? selection.deselect(shownIds) : selection.selectMany(shownIds))} />
            <span aria-hidden="true">Select all shown ({shown.length})</span>
          </div>
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {shown.map((p) => (
              <PostCard key={p.id} summary={p} batch={batch} version={version} onChanged={changed}
                imageReason={batch.aiDraft?.imageReasons?.find((r) => r.postId === p.postKey)?.reason}
                select={{ selected: selection.isSelected(p.id), onToggle: (range) => selection.toggle(p.id, range) }} />
            ))}
          </div>
        </>
      )}

      {removed.length > 0 && (
        <details className="rounded-lg border border-dashed bg-card">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium">Removed posts ({removed.length})</summary>
          <ul className="px-4 pb-2">
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
      <PostEditSheet open={adding} onClose={() => setAdding(false)} batch={batch} onSaved={() => { setVersion((v) => v + 1); changed(); }} />
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
      <Notice tone="info" title="Drafted by AI. Check every post and its sources before approving.">
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
