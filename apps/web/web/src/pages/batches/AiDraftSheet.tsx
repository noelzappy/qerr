// "Draft with AI": says what to draft (period, how many posts, optional title and networks) and queues the job. Once it
// is queued the panel shows the run live (the step and how far it is) and, when it is done, a button to open the batch.
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { RunProgress, RunResult, RunStatusBadge } from '@/components/activity-parts';
import { Button } from '@/components/ui/button';
import { BusyButton, CheckField, FieldSet, FormPanel, FormProblem, Notice, TextField } from '@/components/kit';
import { confirmDiscard, useUnsavedGuard, withoutGuard } from '@/hooks/use-unsaved-guard';
import { useActivityRun } from '@/hooks/use-activity';
import { useNow } from '@/hooks/use-now';
import { isActive } from '@/lib/activity';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { networkLabel } from '../../lib/labels';
import { toast } from 'sonner';
import { NETWORKS } from './labels';

// The first and last day of next month, as the form's starting point.
function nextMonth(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function AiDraftSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [initial] = useState(nextMonth);
  const [periodStart, setPeriodStart] = useState(initial.from);
  const [periodEnd, setPeriodEnd] = useState(initial.to);
  const [count, setCount] = useState('10');
  const [title, setTitle] = useState('');
  const [networks, setNetworks] = useState<string[]>([...NETWORKS]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  // The run that was started from this panel; while set, the panel shows it instead of the form.
  const [runId, setRunId] = useState<string | null>(null);
  const navigate = useNavigate();
  const live = useActivityRun(runId);
  const now = useNow(!!live.run && isActive(live.run));
  const dirty = !runId && (periodStart !== initial.from || periodEnd !== initial.to || count !== '10' || !!title.trim() || networks.length !== NETWORKS.length);
  useUnsavedGuard(dirty && !busy);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    const n = Number(count);
    if (!periodStart || !periodEnd) problems.periodStart = 'Choose the first and last day';
    else if (periodEnd < periodStart) problems.periodEnd = 'The end must be on or after the start';
    if (!Number.isInteger(n) || n < 1 || n > 30) problems.count = 'Enter a whole number from 1 to 30';
    if (!networks.length) problems.channels = 'Choose at least one network';
    setFields(problems);
    if (Object.keys(problems).length) { setError('Check the highlighted fields and try again.'); return; }
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ activityId: string | null }>('/api/batches/ai-draft', { periodStart, periodEnd, count: n, channels: networks, ...(title.trim() ? { title: title.trim() } : {}) });
      if (r.activityId) setRunId(r.activityId);
      else { toast.success('Drafting started. The batch appears in the list when it is ready'); withoutGuard(onClose); }
    } catch (err) {
      setFields(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const run = live.run;
  const batchId = run?.status === 'done' ? ((run.result as { batchId?: string } | null)?.batchId ?? null) : null;
  const close = () => { setRunId(null); withoutGuard(onClose); };
  const requestClose = () => confirmDiscard(dirty, onClose);
  if (runId) {
    return (
      <FormPanel
        open={open}
        onClose={close}
        variant="dialog"
        size="md"
        title="Drafting with AI"
        description="You can close this: the draft keeps going, and Activity shows how far it is."
        footer={(
          <>
            <Button variant="outline" className="max-sm:min-h-11" onClick={close}>{run && !isActive(run) ? 'Close' : 'Keep working'}</Button>
            {batchId && <Button className="max-sm:min-h-11" onClick={() => { close(); navigate(`/batches/${batchId}`); }}>Open the batch</Button>}
          </>
        )}
      >
        {!run ? (
          <p className="text-muted-foreground" role="status">{live.error || 'Starting'}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><strong className="[overflow-wrap:anywhere]">{run.title}</strong><RunStatusBadge run={run} /></div>
            <RunProgress run={run} now={now} />
            {run.error && <Notice tone="bad" title="Drafting did not work.">{run.error}</Notice>}
            <RunResult run={run} />
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
      title="Draft posts with AI"
      description="The AI drafts from confirmed facts, and you review every post before anything is scheduled."
      footer={(
        <>
          <BusyButton variant="outline" onClick={requestClose} disabled={busy}>Cancel</BusyButton>
          <BusyButton type="submit" form="ai-draft-form" loading={busy}>Start drafting</BusyButton>
        </>
      )}
    >
      <form id="ai-draft-form" className="flex flex-col gap-3" onSubmit={(e) => void submit(e)} noValidate>
        <FormProblem error={error} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="First day" type="date" value={periodStart} error={fields.periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          <TextField label="Last day" type="date" value={periodEnd} error={fields.periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          <TextField label="Number of posts" type="number" inputMode="numeric" min={1} max={30} value={count} error={fields.count} onChange={(e) => setCount(e.target.value)} hint="From 1 to 30. Drafting takes a few minutes." />
          <TextField label="Title" optional value={title} maxLength={200} placeholder="AI draft for the month" onChange={(e) => setTitle(e.target.value)} hint="Left empty, the batch is called AI draft for the month." />
        </div>
        <FieldSet legend="Networks" error={fields.channels}>
          {NETWORKS.map((n) => (
            <CheckField key={n} label={networkLabel(n)} checked={networks.includes(n)} onCheckedChange={(c) => setNetworks(c ? [...networks, n] : networks.filter((x) => x !== n))} />
          ))}
        </FieldSet>
      </form>
    </FormPanel>
  );
}
