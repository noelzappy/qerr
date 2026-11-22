// "Rewrite with AI" on a post: one question ("What should change?"), then the run is shown here until it is done. The job saves
// the new words as an edit (approval is taken off), so when it is done the page loads the post again and this shows the
// caption before and after.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api } from '../../api';
import { FailureText } from '@/components/failure-text';
import { RunProgress, RunResult } from '@/components/activity-parts';
import { BusyButton, FormPanel, FormProblem, Notice, TextAreaField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { useActivityRun } from '@/hooks/use-activity';
import { useNow } from '@/hooks/use-now';
import { confirmDiscard, useUnsavedGuard, withoutGuard } from '@/hooks/use-unsaved-guard';
import { isActive } from '@/lib/activity';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { rewriteChangedText } from '../../lib/labels';

export const REWRITE_MAX = 500;

export function RewritePostDialog({ open, onClose, postId, unavailable, onRewritten }: {
  open: boolean;
  onClose: () => void;
  postId: string;
  // Why a rewrite cannot be started right now (no provider, no budget, ...), shown instead of the button.
  unavailable: string | null;
  // The run finished well: load the post again.
  onRewritten: () => Promise<void> | void;
}) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [runId, setRunId] = useState<string | null>(null);
  const live = useActivityRun(runId);
  const run = live.run;
  const now = useNow(!!run && isActive(run));
  const dirty = !runId && !!instruction.trim();
  useUnsavedGuard(dirty && !busy);

  // Once, when this run turns out well: load the post again and say so.
  const announced = useRef<string | null>(null);
  const reloaded = useRef(onRewritten);
  reloaded.current = onRewritten;
  useEffect(() => {
    if (!run || run.status !== 'done' || announced.current === run.id) return;
    announced.current = run.id;
    void Promise.resolve(reloaded.current()).then(() => toast.success('Rewritten'));
  }, [run]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = instruction.trim();
    if (!text) { setFields({ instruction: 'Say what should change' }); setError('Check the highlighted field and try again.'); return; }
    setBusy(true);
    setError('');
    setFields({});
    try {
      const r = await api.post<{ activityId: string | null }>(`/api/posts/${encodeURIComponent(postId)}/rewrite`, { instruction: text });
      if (r.activityId) setRunId(r.activityId);
      else { toast.success('Rewriting started. Activity shows how far it is'); withoutGuard(finish); }
    } catch (err) {
      setFields(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const finish = () => { setRunId(null); setInstruction(''); setError(''); setFields({}); onClose(); };
  const requestClose = () => confirmDiscard(dirty, finish);
  const working = !!runId && (!run || isActive(run));

  if (runId) {
    return (
      <FormPanel
        open={open}
        onClose={finish}
        variant="dialog"
        size="md"
        title="Rewrite with AI"
        footer={<Button className="max-sm:min-h-11" onClick={finish}>{working ? 'Keep working' : 'Close'}</Button>}
      >
        {!run ? (
          <p className="text-muted-foreground" role="status">{live.error || 'Starting'}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {isActive(run) && <RunProgress run={run} now={now} />}
            {run.status === 'failed' && <Notice tone="bad" title="The rewrite did not work."><FailureText text={run.error} /></Notice>}
            {run.status === 'done' && (
              <>
                {rewriteChangedText((run.result as { changed?: unknown } | null)?.changed) && <p><strong className="font-medium">Changed:</strong> {rewriteChangedText((run.result as { changed?: unknown } | null)?.changed)}</p>}
                <RunResult run={run} />
              </>
            )}
          </div>
        )}
      </FormPanel>
    );
  }

  return (
    <FormPanel
      open={open}
      onClose={requestClose}
      variant="dialog"
      size="md"
      busy={busy}
      title="Rewrite with AI"
      description="The AI rewrites this post's words from its linked facts. Approval is taken off."
      footer={(
        <>
          <BusyButton variant="outline" onClick={requestClose} disabled={busy}>Cancel</BusyButton>
          <BusyButton type="submit" form="rewrite-post-form" loading={busy} disabled={!!unavailable}>Rewrite</BusyButton>
        </>
      )}
    >
      <form id="rewrite-post-form" className="flex flex-col gap-3" onSubmit={(e) => void submit(e)} noValidate>
        {unavailable && <Notice tone="warn">{unavailable}.</Notice>}
        <FormProblem error={error} />
        <TextAreaField
          label="What should change?"
          rows={4}
          maxLength={REWRITE_MAX}
          value={instruction}
          error={fields.instruction}
          placeholder="Shorter, and lead with the free plan"
          onChange={(e) => setInstruction(e.target.value)}
          disabled={!!unavailable}
        />
        <p className="text-right text-[12.5px] text-muted-foreground" aria-live="polite">{instruction.length} / {REWRITE_MAX}</p>
      </form>
    </FormPanel>
  );
}
