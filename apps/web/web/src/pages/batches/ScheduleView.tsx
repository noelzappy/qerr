// The Schedule tab: what would be sent to Buffer (the plan), sending drafts or going live behind an explicit confirmation,
// and what has happened to each post and channel since (the deliveries), with the ways to settle or delete one.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../api';
import { useLoad } from '../../hooks';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { networkLabel } from '../../lib/labels';
import { useSession } from '../../session';
import { toast } from 'sonner';
import { BusyButton, ConfirmAction, DataList, EmptyBlock, ErrorBlock, Lines, Notice, RowsSkeleton, Spin, Sub, TextField, ToneBadge, type Column } from '@/components/kit';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { deliveryState } from './labels';
import type { BatchView, DeliveriesResponse, DeliveryRow, Plan, PlanRow } from './types';
import { detailLines, localLabel, utcLabel } from './util';

interface Plans {
  draft: Plan | null;
  live: Plan | null;
  draftError: ApiError | null;
  liveError: ApiError | null;
}

const asApiError = (e: unknown): ApiError => (e instanceof ApiError ? e : new ApiError(0, errorMessage(e)));

async function loadPlans(id: string): Promise<Plans> {
  const [d, l] = await Promise.allSettled([
    api.get<{ plan: Plan }>(`/api/schedule/batches/${id}/plan?mode=draft`),
    api.get<{ plan: Plan }>(`/api/schedule/batches/${id}/plan?mode=live`),
  ]);
  return {
    draft: d.status === 'fulfilled' ? d.value.plan : null,
    live: l.status === 'fulfilled' ? l.value.plan : null,
    draftError: d.status === 'rejected' ? asApiError(d.reason) : null,
    liveError: l.status === 'rejected' ? asApiError(l.reason) : null,
  };
}

function actionPill(r: PlanRow, mode: 'draft' | 'live') {
  if (r.action === 'skip') return { tone: 'quiet' as const, label: 'Skip: already in Buffer' };
  if (r.action === 'refuse') return { tone: 'bad' as const, label: 'Refused' };
  if (!r.willSend) return { tone: 'warn' as const, label: 'Cannot send yet' };
  if (mode === 'live') return { tone: 'good' as const, label: r.promote ? 'Will move the draft live' : 'Will go live' };
  return { tone: 'good' as const, label: 'Will create a draft' };
}

export function ScheduleView({ batch, onChanged }: { batch: BatchView; onChanged: () => void }) {
  const { me } = useSession();
  const isAdmin = me?.role === 'admin';
  const isOwner = !!me && me.id === batch.ownerId;
  const canGoLive = isAdmin || isOwner;

  const plans = useLoad(() => loadPlans(batch.id), [batch.id]);
  const deliveries = useLoad(() => api.get<DeliveriesResponse>(`/api/schedule/batches/${batch.id}/deliveries`), [batch.id]);
  const [mode, setMode] = useState<'draft' | 'live'>('draft');
  const [confirming, setConfirming] = useState<'draft' | 'live' | null>(null);
  const [resolving, setResolving] = useState<DeliveryRow | null>(null);
  const [deleting, setDeleting] = useState<DeliveryRow | null>(null);
  const [watchSince, setWatchSince] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [staleNote, setStaleNote] = useState('');

  const run = deliveries.data?.lastRun ?? null;
  const running = run?.state === 'queued' || run?.state === 'running';

  // While a send job runs, or a status check was asked for, look again every few seconds.
  const latest = useRef(deliveries.data);
  latest.current = deliveries.data;
  useEffect(() => {
    if (!running && watchSince === null) return;
    const t = setInterval(() => {
      void deliveries.reload();
      if (watchSince !== null) {
        const checked = latest.current?.deliveries.some((d) => d.lastCheckedAt && Date.parse(d.lastCheckedAt) >= watchSince);
        if (checked || Date.now() - watchSince > 45_000) setWatchSince(null);
      }
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, watchSince]);

  // When a run finishes, what the plan says has changed too.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) { void plans.reload(); onChanged(); }
    wasRunning.current = running;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const plan = mode === 'draft' ? plans.data?.draft : plans.data?.live;
  const planError = mode === 'draft' ? plans.data?.draftError : plans.data?.liveError;
  const draftPlan = plans.data?.draft ?? null;
  const livePlan = plans.data?.live ?? null;

  const refreshAll = () => { void plans.reload(); void deliveries.reload(); onChanged(); };

  async function refreshStatus() {
    setRefreshing(true);
    try {
      await api.post(`/api/schedule/batches/${batch.id}/refresh`);
      setWatchSince(Date.now());
      toast.success('Checking Buffer. The table updates as the answers come in');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }

  async function send(which: 'draft' | 'live') {
    const p = which === 'draft' ? draftPlan : livePlan;
    if (!p) return;
    try {
      await api.post(`/api/schedule/batches/${batch.id}/send`, { mode: which, confirm: { postsXChannels: p.count, token: p.token } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // The plan moved under the person: show the new one and make them look again.
        await plans.reload();
        setStaleNote('The plan changed since you opened it, so nothing was sent. The plan below is up to date: check it and confirm again.');
        throw new ApiError(409, `${e.message}. The list here is now up to date: check it and confirm again.`.replace('..', '.'), e.details);
      }
      throw e;
    }
    setConfirming(null);
    setStaleNote('');
    toast.success(which === 'live' ? 'Scheduling started. This page updates as Buffer answers' : 'Sending the drafts. This page updates as Buffer answers');
    await deliveries.reload();
    void plans.reload();
    onChanged();
  }

  const draftReason = !draftPlan ? 'The plan could not be built. The message above says why.'
    : draftPlan.approvedPosts === 0 ? 'Approve at least one post first.'
    : draftPlan.willSend === 0 ? 'Nothing in the plan can be sent. The table says why for each post and channel.'
    : running ? 'A send is already running.' : '';
  const liveReason = !canGoLive ? 'Only an admin or the person who made this batch can schedule live.'
    : !livePlan ? 'The plan could not be built. The message above says why.'
    : livePlan.approvedPosts === 0 ? 'Approve at least one post first.'
    : livePlan.willSend === 0
      ? (livePlan.rows.some((r) => r.needsDraftFirst) ? 'Send the drafts first. A post goes live only after its draft is in Buffer.' : 'Nothing in the live plan can be sent yet. The table says why for each post and channel.')
    : running ? 'A send is already running.' : '';

  const planColumns: Column<PlanRow>[] = [
    { key: 'post', header: 'Post and network', primary: true, cell: (r) => <><span className="font-semibold [overflow-wrap:anywhere]">{r.title}</span><Sub>{networkLabel(r.network)}</Sub><Sub mono>{r.postKey}</Sub></> },
    {
      key: 'account', header: 'Account and channel',
      cell: (r) => (r.account ? <><span>{r.account}</span><Sub mono>{r.channelId ?? 'No channel set'}</Sub></> : <ToneBadge tone="bad">No route</ToneBadge>),
    },
    {
      key: 'due', header: `Due (${batch.timezone})`,
      cell: (r) => <><span>{localLabel(r.dueAtLocal)}</span><Sub mono>{utcLabel(r.dueAtUtc)}</Sub></>,
    },
    { key: 'action', header: 'What happens', cell: (r) => { const a = actionPill(r, mode); return <ToneBadge tone={a.tone} dot>{a.label}</ToneBadge>; } },
    {
      key: 'notes', header: 'Notes',
      cell: (r) => {
        const notes = [r.explanation, ...r.problems].filter((x): x is string => !!x);
        if (!notes.length && !r.warnings.length) return <span className="text-muted-foreground">None</span>;
        return (
          <ul className="list-disc space-y-1 pl-[18px] text-left">
            {notes.map((n) => <li key={n}>{n}</li>)}
            {r.warnings.map((w) => <li key={w} className="text-muted-foreground">Warning: {w}</li>)}
          </ul>
        );
      },
    },
  ];

  const delColumns: Column<DeliveryRow>[] = [
    { key: 'post', header: 'Post and network', primary: true, cell: (d) => <><span className="font-semibold [overflow-wrap:anywhere]">{d.title}</span><Sub>{networkLabel(d.network)}</Sub><Sub mono>{d.postKey}</Sub></> },
    { key: 'account', header: 'Account and channel', cell: (d) => <><span>{d.account}</span><Sub mono>{d.channelId}</Sub></> },
    { key: 'due', header: 'Due', cell: (d) => utcLabel(d.dueAt) },
    {
      key: 'status', header: 'Status',
      cell: (d) => {
        const s = deliveryState(d);
        const note = d.error ?? d.statusNote;
        return (
          <div className="flex flex-col items-end gap-1.5 @[720px]:items-start">
            <ToneBadge tone={s.tone} dot>{s.label}</ToneBadge>
            {(s.unknown || s.tone === 'bad') && <span className="text-[13px] [overflow-wrap:anywhere]">{s.help}</span>}
            {note && <span className="text-[13px] [overflow-wrap:anywhere]">{note}</span>}
            <span className="text-[13px] text-muted-foreground">{d.lastCheckedAt ? `Checked ${formatDateTime(d.lastCheckedAt)}` : 'Not checked yet'}</span>
          </div>
        );
      },
    },
    {
      key: 'actions', header: 'Actions', actions: true,
      cell: (d) => {
        const s = deliveryState(d);
        const deletable = d.status === 'created' && (d.bufferStatus === 'draft' || d.bufferStatus === 'scheduled');
        return (
          <div className="flex flex-wrap items-center gap-2 @[720px]:justify-end">
            {s.unknown && (isAdmin ? <BusyButton size="sm" variant="outline" onClick={() => setResolving(d)}>Resolve</BusyButton> : <span className="text-[13px] text-muted-foreground">An admin can resolve this once they have looked in Buffer.</span>)}
            {deletable && canGoLive && <BusyButton size="sm" variant="destructive" onClick={() => setDeleting(d)}>Delete from Buffer</BusyButton>}
          </div>
        );
      },
    },
  ];

  const counts = deliveries.data?.counts ?? {};
  const COUNT_LABEL: Record<string, string> = { draft: 'Draft in Buffer', scheduled: 'Scheduled', sent: 'Sent', failed: 'Failed', unknown: 'Unknown, check Buffer', created: 'Created', deleted: 'Deleted' };
  const flush = '-mx-6 border-t';

  return (
    <div className="flex flex-col gap-4">
      <Card role="region" aria-label="The plan" className="min-w-0">
        <CardHeader>
          <CardTitle className="text-lg">What would go to Buffer</CardTitle>
          <CardDescription>Only approved posts are planned. Each post goes to Buffer first as a draft. Once the draft is there, it can be scheduled live.</CardDescription>
          <CardAction>
            <Tabs value={mode} onValueChange={(v) => setMode(v === 'live' ? 'live' : 'draft')}>
              <TabsList aria-label="Show the plan for">
                <TabsTrigger value="draft" className="max-sm:min-h-11">Drafts</TabsTrigger>
                <TabsTrigger value="live" className="max-sm:min-h-11">Live</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          {staleNote && <Notice tone="warn">{staleNote}</Notice>}
          {plans.loading && !plans.data ? <RowsSkeleton rows={5} shape="lines" />
            : plans.error ? <ErrorBlock message={plans.error} onRetry={() => void plans.reload()} />
            : planError ? (
              <Notice tone="bad" title={planError.message}>
                {detailLines(planError).length > 0 && <Lines items={detailLines(planError)} className="max-h-64 overflow-y-auto" />}
                <div className="mt-2"><BusyButton size="sm" variant="outline" onClick={() => void plans.reload()}>Check again</BusyButton></div>
              </Notice>
            ) : plan && (
              <>
                {(plan.stale || plan.staleReason) && <Notice tone="warn">{plan.staleReason || 'An approval no longer matches the post as it is now. Approve the post again before it can be sent.'}</Notice>}
                <p className="text-sm">
                  <strong>{plan.willSend}</strong> of {plan.count} post and channel {plan.count === 1 ? 'pair' : 'pairs'} can be sent now.{' '}
                  {plan.approvedPosts} {plan.approvedPosts === 1 ? 'post is' : 'posts are'} approved{plan.notApproved > 0 ? `, and ${plan.notApproved} ${plan.notApproved === 1 ? 'is' : 'are'} still draft and not planned` : ''}.
                </p>
                {plan.rows.length === 0
                  ? <EmptyBlock title="Nothing is planned yet">Approve posts on the Review tab. Approved posts appear here with the channel and time each one goes to.</EmptyBlock>
                  : <div className={flush}><DataList fit="container" caption={`Plan for ${mode === 'draft' ? 'sending drafts' : 'going live'}, one row for each post and channel`} columns={planColumns} rows={plan.rows} rowKey={(r) => `${r.postKey}/${r.network}`} /></div>}
              </>
            )}
        </CardContent>
      </Card>

      <Card role="region" aria-label="Send">
        <CardHeader>
          <CardTitle className="text-lg">Send to Buffer</CardTitle>
          <CardDescription>You confirm the exact list before anything is sent.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2.5">
            <BusyButton onClick={() => setConfirming('draft')} disabled={!!draftReason} aria-describedby="draft-reason" loading={running && run?.mode === 'draft'}>Send approved to Buffer as drafts</BusyButton>
            <BusyButton variant="destructive" onClick={() => setConfirming('live')} disabled={!!liveReason} aria-describedby="live-reason" loading={running && run?.mode === 'live'}>Schedule live</BusyButton>
          </div>
          <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
            <p id="draft-reason">{draftReason || 'Drafts are safe: nothing is published until a post is scheduled live.'}</p>
            <p id="live-reason">{liveReason || 'Schedule live puts real posts on real accounts at their due times.'}</p>
          </div>
        </CardContent>
      </Card>

      <Card role="region" aria-label="In Buffer" className="min-w-0">
        <CardHeader>
          <CardTitle className="text-lg">In Buffer</CardTitle>
          <CardDescription>What happened to each post and channel after it was sent.</CardDescription>
          <CardAction><BusyButton variant="outline" onClick={() => void refreshStatus()} loading={refreshing || watchSince !== null}>Refresh status</BusyButton></CardAction>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          {run && <RunSummary run={run} />}
          {Object.keys(counts).length > 0 && (
            <div className="flex flex-wrap gap-1.5">{Object.entries(counts).map(([k, v]) => <ToneBadge key={k} tone={k === 'unknown' ? 'warn' : k === 'failed' ? 'bad' : 'quiet'}>{COUNT_LABEL[k] ?? k}: {v}</ToneBadge>)}</div>
          )}
          {deliveries.loading && !deliveries.data ? <RowsSkeleton rows={4} shape="lines" />
            : deliveries.error ? <ErrorBlock message={deliveries.error} onRetry={() => void deliveries.reload()} />
            : deliveries.data && deliveries.data.deliveries.length === 0
              ? <EmptyBlock title="Nothing has been sent yet">When you send drafts, each post and channel appears here with its status in Buffer.</EmptyBlock>
              : deliveries.data && <div className={flush}><DataList fit="container" caption="Deliveries to Buffer, one row for each post and channel" columns={delColumns} rows={deliveries.data.deliveries} rowKey={(d) => d.id} /></div>}
        </CardContent>
      </Card>

      <SendConfirm which={confirming} plan={confirming === 'draft' ? draftPlan : livePlan} timezone={batch.timezone} onCancel={() => setConfirming(null)} onConfirm={send} />
      <ResolveDialog delivery={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); toast.success('Status updated'); refreshAll(); }} />
      <ConfirmAction
        open={!!deleting}
        title="Delete this post from Buffer?"
        danger
        confirmLabel="Delete from Buffer"
        message={deleting && (
          <>
            This deletes "{deleting.title}" for {networkLabel(deleting.network)} from the Buffer account "{deleting.account}" (channel {deleting.channelId}).
            Buffer will not publish it. This cannot be undone from here, though the post stays in this batch.
          </>
        )}
        onConfirm={async () => {
          await api.post(`/api/schedule/deliveries/${deleting!.id}/delete-from-buffer`, { confirm: true });
          setDeleting(null);
          toast.success('Deleted from Buffer');
          refreshAll();
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function RunSummary({ run }: { run: NonNullable<DeliveriesResponse['lastRun']> }) {
  const live = run.mode === 'live';
  const what = live ? 'Scheduling live' : 'Sending drafts';
  if (run.state === 'queued' || run.state === 'running') {
    return <Notice tone="info"><span className="inline-flex items-center gap-2"><Spin /> <span><strong>{what}</strong> {run.state === 'queued' ? 'is waiting to start.' : 'is running.'} This page updates by itself.</span></span></Notice>;
  }
  if (run.state === 'refused') return <Notice tone="bad" title={`${what} was refused.`}>{run.message ?? 'The server would not run it.'} Nothing was sent.</Notice>;
  const s = run.summary;
  const stopped = s?.stopped;
  const notTried = s?.notAttempted ?? [];
  return (
    <div className="flex flex-col gap-2">
      <Notice tone={stopped || (s?.failed ?? 0) > 0 || (s?.unknown ?? 0) > 0 ? 'warn' : 'good'} title={`${what} finished ${formatDateTime(run.at)}.`}>
        {s ? `${s.created} created, ${s.skipped} skipped, ${s.refused} refused, ${s.failed} failed, ${s.unknown} unknown.` : run.message ?? ''}
        {stopped && <> The run stopped early: {stopped}.</>}
      </Notice>
      {notTried.length > 0 && (
        <Notice tone="warn" title={`${notTried.length} ${notTried.length === 1 ? 'was' : 'were'} not attempted.`}>
          The run stopped before reaching these, so nothing was sent for them. Fix the cause, then send again.
          <Lines items={notTried.map((n) => `${n.postId}, ${networkLabel(n.network)}${n.account ? ` (account ${n.account})` : ''}`)} />
        </Notice>
      )}
      {run.log && run.log.length > 0 && (
        <details><summary className="flex min-h-8 cursor-pointer items-center text-[13px] max-sm:min-h-11">What the run reported</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">{run.log.join('\n')}</pre></details>
      )}
    </div>
  );
}

function SendConfirm({ which, plan, timezone, onCancel, onConfirm }: { which: 'draft' | 'live' | null; plan: Plan | null; timezone: string; onCancel: () => void; onConfirm: (m: 'draft' | 'live') => Promise<void> }) {
  const live = which === 'live';
  const rows = plan?.rows.filter((r) => r.willSend) ?? [];
  const posts = new Set(rows.map((r) => r.postKey)).size;
  return (
    <ConfirmAction
      open={!!which && !!plan}
      title={live ? 'Schedule live on real accounts?' : 'Send these to Buffer as drafts?'}
      danger={live}
      confirmDisabled={rows.length === 0}
      confirmLabel={live ? `Schedule ${rows.length} live` : `Send ${rows.length} as drafts`}
      message={plan && (
        <div className="flex flex-col gap-2.5">
          {live
            ? <Notice tone="bad" title="This schedules real posts on real accounts.">Buffer will publish each one at its due time. You can delete a scheduled post from Buffer before then, but a post that has been published cannot be taken back from here.</Notice>
            : <span>These go into Buffer as drafts. Nothing is published. You can check each one in Buffer and schedule it live later.</span>}
          <span><strong>{posts}</strong> {posts === 1 ? 'post' : 'posts'} across <strong>{rows.length}</strong> {rows.length === 1 ? 'channel' : 'channels'} will be {live ? 'scheduled' : 'sent'}
            {plan.count > rows.length ? `. The other ${plan.count - rows.length} of the ${plan.count} in the plan are skipped or cannot be sent` : ''}.</span>
          <ul className="max-h-64 list-disc space-y-1 overflow-y-auto pl-[18px] text-sm">
            {rows.map((r) => (
              <li key={`${r.postKey}/${r.network}`}>
                <strong>{r.title}</strong>: {networkLabel(r.network)} via {r.account}, {localLabel(r.dueAtLocal)} ({timezone}), {utcLabel(r.dueAtUtc)}
              </li>
            ))}
          </ul>
        </div>
      )}
      onConfirm={() => onConfirm(which!)}
      onCancel={onCancel}
    />
  );
}

function ResolveDialog({ delivery, onClose, onDone }: { delivery: DeliveryRow | null; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={!!delivery} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Resolve an unclear status</DialogTitle>
          <DialogDescription className="sr-only">Say what you found in Buffer so this post and channel can be settled.</DialogDescription>
        </DialogHeader>
        {delivery && <ResolveBody delivery={delivery} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function ResolveBody({ delivery: d, onClose, onDone }: { delivery: DeliveryRow; onClose: () => void; onDone: () => void }) {
  const unsent = d.status === 'unknown';
  const [choice, setChoice] = useState<'' | 'mark-sent' | 'mark-absent'>('');
  const [bufferId, setBufferId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!choice) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/schedule/deliveries/${d.id}/resolve`, { action: choice, ...(choice === 'mark-sent' && bufferId.trim() ? { bufferId: bufferId.trim() } : {}) });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="[overflow-wrap:anywhere]">
        We could not tell what happened to "{d.title}" for {networkLabel(d.network)}. Its status is unknown, check Buffer. It is not counted as sent or as failed, and nothing is sent again for it until you say what you found.
      </p>
      <Notice tone="info" title="Look in Buffer first.">
        Open the Buffer account "{d.account}", channel {d.channelId}, and look for this post, due {utcLabel(d.dueAt)}. Check the drafts, the scheduled posts and the sent posts.
      </Notice>
      {error && <Notice tone="bad">{error}</Notice>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">What did you find?</legend>
        <RadioGroup value={choice} onValueChange={(v) => setChoice(v === 'mark-sent' || v === 'mark-absent' ? v : '')} aria-label="What did you find?" className="gap-1">
          <div className="flex min-h-9 items-start gap-2.5 max-sm:min-h-11 max-sm:items-center">
            <RadioGroupItem id="resolve-sent" value="mark-sent" className="mt-0.5 max-sm:size-5" />
            <Label htmlFor="resolve-sent" className="leading-snug">{unsent ? 'It is in Buffer' : 'It was published'}</Label>
          </div>
          <div className="flex min-h-9 items-start gap-2.5 max-sm:min-h-11 max-sm:items-center">
            <RadioGroupItem id="resolve-absent" value="mark-absent" className="mt-0.5 max-sm:size-5" />
            <Label htmlFor="resolve-absent" className="leading-snug">{unsent ? 'It is not in Buffer, so it can be sent again' : 'It is gone from Buffer'}</Label>
          </div>
        </RadioGroup>
      </fieldset>
      {choice === 'mark-sent' && unsent && <TextField label="Buffer id" optional mono value={bufferId} onChange={(e) => setBufferId(e.target.value)} hint="If Buffer shows an id for the post, enter it so later checks can find it." />}
      <div className="flex flex-wrap gap-2.5">
        <BusyButton onClick={() => void save()} loading={busy} disabled={!choice}>Save what I found</BusyButton>
        <BusyButton variant="outline" onClick={onClose} disabled={busy}>Cancel</BusyButton>
      </div>
    </div>
  );
}
