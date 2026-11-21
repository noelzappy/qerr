// Activity: everything the app does in the background (AI drafts, research, image renders, sends to Buffer, status
// checks), what it is doing now and what happened. A table on a desktop, cards on a phone; a run opens in a read-only panel.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataList, EmptyBlock, ErrorBlock, FormPanel, Notice, PageHeader, Pager, RowsSkeleton, SelectField, SwitchField, type Column } from '@/components/kit';
import { RunProgress, RunResult, RunStatusBadge, runSummary } from '@/components/activity-parts';
import { useActivity, useActivityRun } from '@/hooks/use-activity';
import { useNow } from '@/hooks/use-now';
import { batchLink, elapsedMs, formatElapsed, isActive, KIND_LABEL, runKindLabel, runTitle, type ActivityRun } from '@/lib/activity';
import { useDocumentTitle } from '../hooks';
import { formatDateTime } from '../lib/format';

const PAGE_SIZE = 25;
const STATUS_OPTIONS = [
  { value: 'all', label: 'Everything' }, { value: 'active', label: 'In progress' }, { value: 'done', label: 'Done' }, { value: 'failed', label: 'Failed' },
];
const KIND_OPTIONS = [{ value: '', label: 'All kinds' }, ...Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))];

export function Activity() {
  useDocumentTitle('Activity');
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('');
  const [showSystem, setShowSystem] = useState(false);
  const [page, setPage] = useState(1);
  const list = useActivity({ status: status as 'all', kind: kind || undefined, system: showSystem ? 'include' : 'hide', page, pageSize: PAGE_SIZE, withResult: true });
  const now = useNow(list.active.length > 0);
  const filtered = status !== 'all' || !!kind || showSystem;

  const columns: Column<ActivityRun>[] = [
    { key: 'title', header: 'What', primary: true, cell: (r) => (
      <div className="min-w-0 md:min-w-[8rem]">
        <Link to={`/activity/${r.id}`} className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50">{runTitle(r.title)}</Link>
        <span className="block text-[13px] font-normal text-muted-foreground">{runKindLabel(r.kind)}</span>
      </div>
    ) },
    { key: 'status', header: 'Status', cell: (r) => <RunStatusBadge run={r} /> },
    { key: 'progress', header: 'Progress', cell: (r) => (isActive(r)
      ? <RunProgress run={r} now={now} className="min-w-[7rem]" />
      : <span className={r.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{runSummary(r) || '-'}</span>) },
    { key: 'when', header: 'Started', cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}{!isActive(r) && <span className="block text-[13px] text-muted-foreground">Took {formatElapsed(elapsedMs(r, now))}</span>}</span> },
    { key: 'open', header: 'Open', actions: true, cell: (r) => <Button asChild variant="outline" size="sm" className="max-sm:min-h-11"><Link to={`/activity/${r.id}`}>Details<span className="sr-only"> of {runTitle(r.title)}</span></Link></Button> },
  ];

  return (
    <>
      <PageHeader title="Activity" description="What the app is doing in the background and what it did: AI drafts, research, images, and sends to Buffer. It updates by itself." />
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]" role="search" aria-label="Filter the activity">
            <SelectField label="Status" value={status} onValueChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTIONS} />
            <SelectField label="Kind of work" value={kind} onValueChange={(v) => { setKind(v); setPage(1); }} options={KIND_OPTIONS} />
            <SwitchField className="self-end pb-2" label="Show automatic status checks" checked={showSystem} onCheckedChange={(v) => { setShowSystem(v); setPage(1); }} />
          </div>
        </Card>
        <Card className="gap-0 overflow-hidden p-0" aria-label="Activity">
          {list.loading && list.items.length === 0 && !list.error ? <RowsSkeleton rows={6} />
            : list.error && list.items.length === 0 ? <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
            : list.items.length === 0 ? (
              <EmptyBlock
                title={filtered ? 'Nothing matches these filters' : 'No background work yet'}
                action={filtered ? <Button variant="outline" className="max-sm:min-h-11" onClick={() => { setStatus('all'); setKind(''); setShowSystem(false); setPage(1); }}>Clear filters</Button> : undefined}
              >
                {filtered ? 'Clear the filters to see everything.' : 'Drafts, research, images and sends will appear here while they run, and stay after.'}
              </EmptyBlock>
            ) : (
              <div aria-busy={list.loading}>
                {list.error && <div className="p-3"><Notice tone="warn">{list.error}</Notice></div>}
                <DataList caption="Background work, newest first" columns={columns} rows={list.items} rowKey={(r) => r.id} />
                <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} />
              </div>
            )}
        </Card>
      </div>
      {id && <RunPanel id={id} onClose={() => navigate('/activity')} />}
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="[overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

// One run, read only: when it started and ended, how far it got, what it did, and why it failed.
function RunPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { run, loading, error, reload } = useActivityRun(id);
  const now = useNow(!!run && isActive(run));
  const link = run ? batchLink(run) : null;
  return (
    <FormPanel
      open
      onClose={onClose}
      size="lg"
      title={run ? runTitle(run.title) : 'Activity'}
      description={run ? runKindLabel(run.kind) : 'Details of one piece of background work'}
      footer={(
        <>
          {link && <Button asChild variant="outline" className="max-sm:min-h-11"><Link to={link}>Open the batch</Link></Button>}
          <Button onClick={onClose} className="max-sm:min-h-11">Close</Button>
        </>
      )}
    >
      {loading && !run ? <RowsSkeleton rows={4} />
        : error && !run ? <ErrorBlock message={error} onRetry={() => void reload()} title="This could not be opened" />
        : run && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3"><RunStatusBadge run={run} />{run.system && <span className="text-[13px] text-muted-foreground">Automatic status check</span>}</div>
            {isActive(run) && <RunProgress run={run} now={now} />}
            {run.error && <Notice tone="bad" title="It failed.">{run.error}</Notice>}
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Queued">{formatDateTime(run.createdAt)}</Fact>
              <Fact label="Started">{run.startedAt ? formatDateTime(run.startedAt) : 'Not started yet'}</Fact>
              <Fact label="Finished">{run.finishedAt ? formatDateTime(run.finishedAt) : isActive(run) ? 'Still going' : '-'}</Fact>
              <Fact label={isActive(run) ? 'Taken so far' : 'Took'}>{formatElapsed(elapsedMs(run, now))}</Fact>
              {run.progress && !isActive(run) && <Fact label="Last step">{run.progress.step}</Fact>}
            </dl>
            <RunResult run={run} />
          </div>
        )}
    </FormPanel>
  );
}
