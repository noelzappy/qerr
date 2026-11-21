// Create, Batches: every batch on a board by where it stands (writing, in review, scheduled, done), or as a list, and the way
// in to a new one (by hand or drafted by the AI). A batch is a month or a campaign of posts.
import { useState } from 'react';
import { Kanban, List } from 'lucide-react';
import { Link, useMatch, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useDocumentTitle, useLoad } from '../hooks';
import { formatDate } from '../lib/format';
import { networkLabel } from '../lib/labels';
import { NetworkIcon } from '@/components/network-icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AiDraftSheet } from './batches/AiDraftSheet';
import { batchCountBadges } from './batches/flow/status';
import { BATCH_STATUS } from './batches/labels';
import { NewBatchSheet } from './batches/NewBatchSheet';
import { DataList, EmptyBlock, ErrorBlock, Hint, PageHeader, RowsSkeleton, StatusBadge, Sub, type Column } from '@/components/kit';
import type { BatchStatus, BatchView } from './batches/types';
import { periodLabel } from './batches/util';

const COLUMNS: Array<{ status: BatchStatus; hint: string }> = [
  { status: 'draft', hint: 'Being written and checked' },
  { status: 'in_review', hint: 'Waiting for approval' },
  { status: 'scheduled', hint: 'In Buffer, waiting to go out' },
  { status: 'done', hint: 'Finished' },
];

function BatchCard({ b }: { b: BatchView }) {
  const draft = b.counts.draft ?? 0, approved = b.counts.approved ?? 0, total = draft + approved;
  return (
    <Link to={`/batches/${b.id}`} className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 outline-none transition-colors hover:border-foreground/25 focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <span className="text-[13.5px] font-semibold leading-snug [overflow-wrap:anywhere]">{b.title}</span>
      <span className="text-[12.5px] text-muted-foreground">{periodLabel(b.periodStart, b.periodEnd)}</span>
      {total > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[12.5px] text-muted-foreground">{approved} of {total} approved</span>
          <div className="h-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
            <span className="block h-full bg-primary" style={{ width: `${(approved / total) * 100}%` }} />
          </div>
        </div>
      )}
      <span className="flex -space-x-1" aria-label={b.defaultNetworks.map(networkLabel).join(', ')}>
        {b.defaultNetworks.map((n) => <NetworkIcon key={n} network={n} className="size-4 rounded text-[10px] ring-2 ring-card" />)}
      </span>
    </Link>
  );
}

function Board({ rows, onNew }: { rows: BatchView[]; onNew: () => void }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {COLUMNS.map(({ status, hint }) => {
        const list = rows.filter((b) => b.status === status);
        return (
          <section key={status} aria-label={BATCH_STATUS[status].label} className="flex w-72 shrink-0 flex-col gap-2">
            <div className="flex items-center gap-1.5 border-b px-0.5 pb-1.5">
              <h2 className="text-[13px] font-semibold">{BATCH_STATUS[status].label}</h2>
              <Hint about={BATCH_STATUS[status].label}>{hint}</Hint>
              <span className="text-[12px] tabular-nums text-muted-foreground" aria-label={`${list.length} ${list.length === 1 ? 'batch' : 'batches'}`}>{list.length}</span>
            </div>
            {list.map((b) => <BatchCard key={b.id} b={b} />)}
            {status === 'draft' && (
              <button type="button" onClick={onNew} className="rounded-md px-2 py-2 text-left text-[13px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">+ New batch</button>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function Batches() {
  useDocumentTitle('Create');
  const navigate = useNavigate();
  const creating = !!useMatch('/batches/new');
  const drafting = !!useMatch('/batches/ai-draft');
  const [view, setView] = useState<'board' | 'list'>(() => { try { return localStorage.getItem('create.view') === 'list' ? 'list' : 'board'; } catch { return 'board'; } });
  const list = useLoad(() => api.get<{ batches: BatchView[] }>('/api/batches').then((r) => r.batches), []);
  const pick = (v: 'board' | 'list') => { setView(v); try { localStorage.setItem('create.view', v); } catch { /* private mode */ } };

  const columns: Column<BatchView>[] = [
    {
      key: 'title', header: 'Batch', primary: true,
      cell: (b) => (
        <>
          <Link to={`/batches/${b.id}`} className="font-semibold text-foreground underline-offset-4 hover:underline [overflow-wrap:anywhere]">{b.title}</Link>
          <Sub mono>{b.name}{b.aiDrafted ? ' · Written by AI' : ''}</Sub>
        </>
      ),
    },
    { key: 'period', header: 'Period', cell: (b) => <span>{periodLabel(b.periodStart, b.periodEnd)}<Sub>{b.timezone}</Sub></span> },
    { key: 'status', header: 'Status', cell: (b) => <StatusBadge status={b.status} map={BATCH_STATUS} /> },
    {
      key: 'posts', header: 'Posts',
      cell: (b) => (
        <span className="text-[13px] text-muted-foreground">{batchCountBadges(b.counts).filter((x) => x.key !== 'removed').map((x) => x.label).join(', ')}</span>
      ),
    },
    { key: 'owner', header: 'Owner', cell: (b) => <span>{b.owner?.name || b.owner?.email || 'Unknown'}<Sub>Made {formatDate(b.createdAt)}</Sub></span> },
  ];

  const data = list.data;
  const closeSheet = () => navigate('/create', { replace: true });
  return (
    <>
      <PageHeader
        title="Create"
        actions={(
          <>
            <Hint about="Create">A batch is a month or a campaign of posts. Review each post, approve it, then send the approved ones to Buffer.</Hint>
            <div className="flex rounded-md border p-0.5" role="group" aria-label="View">
              <Button size="sm" variant={view === 'board' ? 'secondary' : 'ghost'} aria-pressed={view === 'board'} onClick={() => pick('board')}><Kanban aria-hidden="true" /> Board</Button>
              <Button size="sm" variant={view === 'list' ? 'secondary' : 'ghost'} aria-pressed={view === 'list'} onClick={() => pick('list')}><List aria-hidden="true" /> List</Button>
            </div>
            <Button onClick={() => navigate('/batches/ai-draft')}>Draft with AI</Button>
            <Button variant="outline" onClick={() => navigate('/batches/new')}>New batch</Button>
          </>
        )}
      />
      {list.loading && !data ? (view === 'board' ? <div className="flex gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 w-72 shrink-0 rounded-lg" />)}</div> : <RowsSkeleton rows={5} shape="lines" />)
        : list.error ? <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
        : data && data.length === 0 ? (
          <Card className="p-0">
            <EmptyBlock title="There are no batches yet" action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => navigate('/batches/ai-draft')}>Draft with AI</Button><Button variant="outline" onClick={() => navigate('/batches/new')}>Start a batch by hand</Button></div>}>
              Draft a month of posts from your confirmed facts, or start a batch by hand.
            </EmptyBlock>
          </Card>
        )
        : data && (view === 'board'
          ? <Board rows={data} onNew={() => navigate('/batches/new')} />
          : <Card className={cn('gap-0 overflow-hidden p-0')} role="region" aria-label="Batches"><DataList fit="container" caption="Batches, newest first" columns={columns} rows={data} rowKey={(b) => b.id} /></Card>)}
      <NewBatchSheet open={creating} onClose={closeSheet} />
      <AiDraftSheet open={drafting} onClose={closeSheet} />
    </>
  );
}
