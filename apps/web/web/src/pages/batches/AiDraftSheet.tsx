// "Draft with AI": says what to draft (period, the occasions of the period, how many posts, optional title and networks) and queues the job. The period and
// the number of posts are one tap each (next month and 10 to start; Custom opens the exact fields). Once it is queued the panel
// shows the run live (the step and how far it is) and, when it is done, a button to open the batch.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { RunProgress, RunResult, RunStatusBadge } from '@/components/activity-parts';
import { Button } from '@/components/ui/button';
import { BusyButton, FormPanel, FormProblem, Notice, TextField } from '@/components/kit';
import { NetworkToggles } from '@/components/network-toggles';
import { confirmDiscard, useUnsavedGuard, withoutGuard } from '@/hooks/use-unsaved-guard';
import { useActivityRun } from '@/hooks/use-activity';
import { useNow } from '@/hooks/use-now';
import { isActive } from '@/lib/activity';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { toast } from 'sonner';
import { NETWORKS } from './labels';
import { useAppInfo } from '../../app-info';
import { ChoiceRow } from './editor/ChoiceRow';
import { PeriodChips } from './PeriodChips';
import { PeriodOccasions } from './PeriodOccasions';
import { chosenOccasions, type OccasionChip } from './period-occasions';
import { periodFor, todayIn } from './periods';
import { useSession } from '../../session';

// `search`: a search provider is set up, so "Look for events this month" can run.
type Readiness = { ready: boolean; missing: 'provider' | 'budget' | null; search?: boolean };

// How many posts, as one tap; Custom opens a number field (1 to 30).
export const POST_COUNTS = ['5', '10', '15', '20', '30'] as const;

export function AiDraftSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { brand } = useAppInfo();
  const today = todayIn(brand.timezone);
  // Next month: the form's starting point.
  const [initial] = useState(() => periodFor('month', today));
  const [period, setPeriod] = useState(initial);
  const periodStart = period.from;
  const periodEnd = period.to;
  const [count, setCount] = useState('10');
  const [customCount, setCustomCount] = useState(false);
  const [title, setTitle] = useState('');
  // Design: the look's own designs (the default), or each post composed by the AI (the look's design kept to switch back per post)
  const [design, setDesign] = useState<'look' | 'ai'>('look');
  const [networks, setNetworks] = useState<string[]>([...NETWORKS]);
  // "This period": the occasions of the dates, as chips (the calendar's ticked; the person's own and web finds added)
  const [occasions, setOccasions] = useState<OccasionChip[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  // The run that was started from this panel; while set, the panel shows it instead of the form.
  const [runId, setRunId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { me } = useSession();
  // Whether drafting can run at all (a provider ticked for drafting and a monthly budget), asked each time the panel opens.
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  useEffect(() => {
    if (!open) return;
    let current = true;
    api.get<Readiness>('/api/batches/ai-draft').then((r) => { if (current) setReadiness(r); }).catch(() => { if (current) setReadiness(null); });
    return () => { current = false; };
  }, [open]);
  const blocked = readiness?.ready === false;
  const isAdmin = me?.role === 'admin';
  const live = useActivityRun(runId);
  const now = useNow(!!live.run && isActive(live.run));
  const dirty = !runId && (periodStart !== initial.from || periodEnd !== initial.to || count !== '10' || !!title.trim() || networks.length !== NETWORKS.length || design !== 'look');
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
      const chosen = chosenOccasions(occasions);
      const r = await api.post<{ activityId: string | null }>('/api/batches/ai-draft', { periodStart, periodEnd, count: n, channels: networks, ...(title.trim() ? { title: title.trim() } : {}), ...(chosen.length ? { occasions: chosen } : {}), ...(design === 'ai' ? { design } : {}) });
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
          <BusyButton type="submit" form="ai-draft-form" loading={busy} disabled={blocked}>Start drafting</BusyButton>
        </>
      )}
    >
      <form id="ai-draft-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
        {blocked && (
          <Notice
            tone="warn"
            title={readiness?.missing === 'provider' ? 'No AI provider is set up for drafting.' : 'No monthly AI budget is set.'}
            actions={isAdmin ? <Button asChild size="sm" variant="outline"><Link to="/settings/ai" onClick={() => withoutGuard(onClose)}>Open AI and search</Link></Button> : undefined}
          >
            {readiness?.missing === 'provider'
              ? 'The AI cannot draft until a provider with its key is added and ticked for drafting'
              : 'The AI does not run until a monthly budget above zero is set'}
            {isAdmin ? ' in Settings, AI and search.' : '. Ask an admin to set it up in Settings, AI and search.'} You can still start a batch by hand.
          </Notice>
        )}
        <FormProblem error={error} />
        <PeriodChips today={today} value={period} onChange={setPeriod} errors={{ from: fields.periodStart, to: fields.periodEnd }} />
        <PeriodOccasions period={period} search={readiness?.search === true && !blocked} chips={occasions} onChange={setOccasions} />
        {fields.occasions && <p className="text-[12.5px] font-medium text-destructive" role="alert">{fields.occasions}</p>}
        <ChoiceRow<string>
          legend="Number of posts" tip="Drafting takes a few minutes."
          value={customCount ? 'custom' : count}
          onChange={(v) => { if (v === 'custom') { setCustomCount(true); } else { setCustomCount(false); setCount(String(v)); } }}
          choices={[...POST_COUNTS.map((n) => ({ value: n, label: n })), { value: 'custom', label: 'Custom' }]}
        />
        {customCount && (
          <TextField label="Exact number of posts" type="number" inputMode="numeric" min={1} max={30} value={count} error={fields.count} onChange={(e) => setCount(e.target.value)} hint="From 1 to 30." className="sm:max-w-[calc(50%-0.375rem)]" />
        )}
        {!customCount && fields.count && <p className="text-[12.5px] font-medium text-destructive" role="alert">{fields.count}</p>}
        <ChoiceRow<'look' | 'ai'>
          legend="Design" tip={design === 'ai' ? 'The AI composes each post\'s design around its words and picture, in your look\'s fonts and colours, and the checks run on every image. A post keeps the look\'s design to switch back to. This takes a little longer and uses more of the AI budget.' : 'Each post is drawn with one of your look\'s own designs.'}
          value={design} onChange={(v) => setDesign(v === 'ai' ? 'ai' : 'look')}
          choices={[{ value: 'look', label: 'The look\'s designs' }, { value: 'ai', label: 'AI-designed' }]}
        />
        <NetworkToggles value={networks} onChange={setNetworks} error={fields.channels} />
        <TextField label="Title" optional value={title} maxLength={200} placeholder="AI draft for the month" onChange={(e) => setTitle(e.target.value)} hint="Left empty, the batch is called AI draft for the month." />
      </form>
    </FormPanel>
  );
}
