// Bulk actions for the posts of a batch: Approve, Take approval off, Remove and Restore. Each one calls the single-post
// endpoint once per post, so a post the server refuses (a blocker, a removed post) is refused here too, and the reasons
// are listed in a dialog instead of being lost in a toast.
import { useState } from 'react';
import { Check, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { BulkBar, ConfirmAction, Lines, MoreMenu, Notice, useBulkRun, type Selection } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { failedResults, type BulkResult } from '@/lib/bulk';
import type { PostSummary } from './types';

interface Refusal { postKey: string; title: string; reasons: string[] }

export function PostBulkBar({ selection, posts, afterRun }: {
  selection: Selection;
  // Every post of the batch, removed ones included.
  posts: readonly PostSummary[];
  afterRun: () => Promise<unknown> | unknown;
}) {
  const { busy, run: runWith } = useBulkRun(selection, afterRun);
  // One post at a time: they share a batch, and the server updates the batch's counts after each change.
  const run = <V,>(ids: readonly string[], pastTense: string, work: (id: string) => Promise<V>) => runWith(ids, pastTense, work, 1);
  // Fixed when the dialog opens: the selection shrinks while the posts are being approved.
  const [confirmApprove, setConfirmApprove] = useState<{ ids: string[]; warned: number } | null>(null);
  const [removing, setRemoving] = useState<string[] | null>(null);
  const [refusals, setRefusals] = useState<Refusal[] | null>(null);

  const picked = posts.filter((p) => selection.isSelected(p.id));
  const drafts = picked.filter((p) => p.status === 'draft');
  const approved = picked.filter((p) => p.status === 'approved');
  const removed = picked.filter((p) => p.status === 'removed');
  const live = picked.filter((p) => p.status !== 'removed');
  const withWarnings = drafts.filter((p) => p.warningCount > 0);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const n = (count: number) => `${count} ${count === 1 ? 'post' : 'posts'}`;

  function report(results: BulkResult<unknown>[]) {
    const failed = failedResults(results).map((f) => ({ postKey: byId.get(f.id)?.postKey ?? f.id, title: byId.get(f.id)?.title ?? '', reasons: f.reasons }));
    if (failed.length) setRefusals(failed);
  }

  async function approve(ids: string[]) {
    const results = await run(ids, 'approved', (id) => api.post(`/api/posts/${id}/approve`));
    setConfirmApprove(null);
    report(results);
  }
  async function unapprove() {
    report(await run(approved.map((p) => p.id), 'taken off approval', (id) => api.post(`/api/posts/${id}/unapprove`)));
  }
  async function restore() {
    report(await run(removed.map((p) => p.id), 'restored, back to Writing', (id) => api.post(`/api/posts/${id}/restore`)));
  }
  async function remove() {
    const results = await run(removing ?? [], 'removed', (id) => api.delete<{ inBuffer?: boolean }>(`/api/posts/${id}`));
    setRemoving(null);
    report(results);
    const inBuffer = results.filter((r) => r.ok && (r.value as { inBuffer?: boolean }).inBuffer).length;
    if (inBuffer) toast.error(`${n(inBuffer)} already in Buffer. Delete ${inBuffer === 1 ? 'it' : 'them'} there from step 3 or 4 of the batch`);
  }

  return (
    <>
      <BulkBar count={selection.count} noun={selection.count === 1 ? 'post selected' : 'posts selected'} busy={busy} onClear={selection.clear}>
        {drafts.length > 0 && (
          <Button className="max-sm:min-h-11" disabled={busy} onClick={() => (withWarnings.length ? setConfirmApprove({ ids: drafts.map((p) => p.id), warned: withWarnings.length }) : void approve(drafts.map((p) => p.id)))}>
            <Check aria-hidden="true" />Approve{drafts.length !== picked.length ? ` ${drafts.length}` : ''}
          </Button>
        )}
        {approved.length > 0 && (
          <Button variant="outline" className="max-sm:min-h-11" disabled={busy} onClick={() => void unapprove()}>
            <Undo2 aria-hidden="true" />Take approval off{approved.length !== picked.length ? ` (${approved.length})` : ''}
          </Button>
        )}
        {removed.length > 0 && (
          <Button variant="outline" className="max-sm:min-h-11" disabled={busy} onClick={() => void restore()}>
            <RotateCcw aria-hidden="true" />Restore{removed.length !== picked.length ? ` (${removed.length})` : ''}
          </Button>
        )}
        {live.length > 0 && (
          <MoreMenu label="More bulk actions" items={[{ label: `Remove${live.length !== picked.length ? ` (${live.length})` : ''}`, tone: 'danger', icon: <Trash2 aria-hidden="true" />, onSelect: () => setRemoving(live.map((p) => p.id)) }]} />
        )}
      </BulkBar>

      <ConfirmAction
        open={confirmApprove !== null}
        title={`Approve ${n(confirmApprove?.ids.length ?? 0)}?`}
        message={<>{n(confirmApprove?.warned ?? 0)} of these {confirmApprove?.warned === 1 ? 'has' : 'have'} warnings. Warnings do not stop approval, but check {confirmApprove?.warned === 1 ? 'it' : 'them'} first. Posts the server refuses are listed afterwards.</>}
        confirmLabel={`Approve ${n(confirmApprove?.ids.length ?? 0)}`}
        onConfirm={() => approve(confirmApprove?.ids ?? [])}
        onCancel={() => setConfirmApprove(null)}
      />
      <ConfirmAction
        open={removing !== null}
        danger
        title={`Remove ${n(removing?.length ?? 0)}?`}
        message={<>{removing?.length === 1 ? 'This post leaves' : 'These posts leave'} the review list and {removing?.length === 1 ? 'is' : 'are'} not sent. {removing?.length === 1 ? 'It stays' : 'They stay'} in the batch under removed posts, and you can restore {removing?.length === 1 ? 'it' : 'them'}.</>}
        confirmLabel={`Remove ${n(removing?.length ?? 0)}`}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
      <Dialog open={refusals !== null} onOpenChange={(o) => { if (!o) setRefusals(null); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{refusals?.length === 1 ? '1 post was not changed' : `${refusals?.length ?? 0} posts were not changed`}</DialogTitle>
            <DialogDescription>They stay selected. Fix what stopped each one, then try again.</DialogDescription>
          </DialogHeader>
          <Notice tone="warn">
            <ul className="list-disc space-y-1 pl-[18px]">
              {refusals?.map((r) => <li key={r.postKey}><strong>{r.postKey}</strong>{r.title ? ` ${r.title}` : ''}<Lines items={r.reasons} /></li>)}
            </ul>
          </Notice>
          <DialogFooter className="max-sm:[&>*]:min-h-11"><Button onClick={() => setRefusals(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
