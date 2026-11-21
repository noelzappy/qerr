// Activity: everything the app does in the background (AI drafts, research, image renders, sends to Buffer, status
// checks), what it is doing now and what happened. A table on a desktop, cards on a phone; a run opens in a read-only panel.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyBlock, ErrorBlock, FormPanel, Notice, PageHeader, Pager, RowsSkeleton, SelectField, SwitchField } from '@/components/kit';
import { FailureText } from '@/components/failure-text';
import { RunProgress, RunResult, RunStatusBadge, runSummary } from '@/components/activity-parts';
import { useActivity, useActivityRun } from '@/hooks/use-activity';
import { useNow } from '@/hooks/use-now';
import { batchLink, elapsedMs, formatElapsed, isActive, KIND_LABEL, runKindLabel, runStatusLabel, runTitle, type ActivityRun } from '@/lib/activity';
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

  const open = (r: ActivityRun) => navigate(`/activity/${r.id}`);
  const rowKeys = (r: ActivityRun) => (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r); } };
  const progressCell = (r: ActivityRun) => (isActive(r)
    ? <RunProgress run={r} now={now} className="min-w-[7rem]" />
    : <span className={r.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{runSummary(r) || '-'}</span>);
  const started = (r: ActivityRun) => (
    <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}{!isActive(r) && <span className="text-muted-foreground"> · {formatElapsed(elapsedMs(r, now))}</span>}</span>
  );

  return (
    <>
      <PageHeader title="Activity" description="What the app is doing in the background and what it did. It updates by itself." />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2" role="search" aria-label="Filter the activity">
          <SelectField className="w-40 max-sm:w-[calc(50%-0.375rem)]" label="Status" value={status} onValueChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTIONS} />
          <SelectField className="w-44 max-sm:w-[calc(50%-0.375rem)]" label="Kind of work" value={kind} onValueChange={(v) => { setKind(v); setPage(1); }} options={KIND_OPTIONS} />
          <SwitchField className="pb-1.5" label="Show automatic status checks" checked={showSystem} onCheckedChange={(v) => { setShowSystem(v); setPage(1); }} />
        </div>
        <div className="overflow-hidden rounded-lg border" aria-label="Activity">
          {list.loading && list.items.length === 0 && !list.error ? <RowsSkeleton rows={6} />
            : list.error && list.items.length === 0 ? <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
            : list.items.length === 0 ? (
              <EmptyBlock
                title={filtered ? 'Nothing matches these filters' : 'No background work yet'}
                action={filtered ? <Button variant="outline" className="max-sm:min-h-11" onClick={() => { setStatus('all'); setKind(''); setShowSystem(false); setPage(1); }}>Clear filters</Button> : undefined}
              >
                {filtered ? 'Clear the filters to see everything.' : 'Drafts, images and sends appear here.'}
              </EmptyBlock>
            ) : (
              <div aria-busy={list.loading}>
                {list.error && <div className="p-3"><Notice tone="warn">{list.error}</Notice></div>}
                <div className="hidden md:block">
                  <Table>
                    <caption className="sr-only">Background work, newest first. Select a row to open it.</caption>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {['What', 'Status', 'Progress', 'Started'].map((h) => <TableHead key={h} scope="col" className="h-8 px-3 text-[12px] font-medium text-muted-foreground">{h}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.items.map((r) => (
                        <TableRow key={r.id} tabIndex={0} role="link" aria-label={`${runTitle(r.title)}, ${runKindLabel(r.kind)}, ${runStatusLabel(r.status)}. Open`} onClick={() => open(r)} onKeyDown={rowKeys(r)} className="h-10 cursor-pointer outline-none focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50">
                          <TableCell className="max-w-[22rem] truncate px-3 py-0 font-medium" title={runKindLabel(r.kind)}>{runTitle(r.title)}</TableCell>
                          <TableCell className="px-3 py-0"><RunStatusBadge run={r} /></TableCell>
                          <TableCell className="max-w-[18rem] truncate px-3 py-0 text-[13px]">{progressCell(r)}</TableCell>
                          <TableCell className="px-3 py-0 text-[13px]">{started(r)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="divide-y md:hidden" aria-label="Background work, newest first">
                  {list.items.map((r) => (
                    <li key={r.id}>
                      <Link to={`/activity/${r.id}`} className="flex min-h-11 flex-col gap-0.5 px-3 py-2 outline-none hover:bg-muted/50 focus-visible:bg-muted/60">
                        <span className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[13.5px] font-medium">{runTitle(r.title)}</span><RunStatusBadge run={r} /></span>
                        <span className="text-[12.5px]">{progressCell(r)}</span>
                        <span className="text-[12px] text-muted-foreground">{runKindLabel(r.kind)} · {started(r)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={setPage} />
              </div>
            )}
        </div>
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
            {run.error && <Notice tone="bad" title="It failed."><FailureText text={run.error} /></Notice>}
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
