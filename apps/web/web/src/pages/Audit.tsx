import { useState } from 'react';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataList, EmptyBlock, ErrorBlock, PageHeader, Pager, RowsSkeleton, SelectField, TextField, type Column } from '@/components/kit';
import { useDebounced, useDocumentTitle, useLoad } from '../hooks';
import { formatDateTime } from '../lib/format';
import { actionLabel, AUDIT_GROUPS, entityLabel } from '../lib/labels';

interface AuditItem { id: string; at: string; actorId: string | null; actorEmail: string | null; action: string; entity: string | null; entityId: string | null; detail: Record<string, unknown> | null }
interface Page { items: AuditItem[]; page: number; pageSize: number; total: number }
const PAGE_SIZE = 25;

const ACTION_OPTIONS = [{ value: '', label: 'Everything' }, ...AUDIT_GROUPS.map((g) => ({ value: g.value, label: g.label }))];

// "email: a@b.c, role: admin": the first few plain values, for a glance. The full record is under Details.
function glance(detail: AuditItem['detail']): string {
  if (!detail || typeof detail !== 'object') return '';
  return Object.entries(detail)
    .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v) && String(v).length <= 60)
    .slice(0, 3)
    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${String(v)}`)
    .join(', ');
}

export function Audit() {
  useDocumentTitle('Audit log');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [page, setPage] = useState(1);
  const actorQuery = useDebounced(actor.trim());
  const list = useLoad(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (action) q.set('action', action);
    if (actorQuery) q.set('actor', actorQuery);
    return api.get<Page>(`/api/audit?${q.toString()}`);
  }, [page, action, actorQuery]);

  const columns: Column<AuditItem>[] = [
    { key: 'at', header: 'When', primary: true, cell: (i) => <span className="whitespace-nowrap">{formatDateTime(i.at)}</span> },
    { key: 'who', header: 'Who', cell: (i) => (i.actorEmail ? <span className="[overflow-wrap:anywhere]">{i.actorEmail}</span> : <span className="text-muted-foreground">The system</span>) },
    {
      key: 'what', header: 'What happened',
      cell: (i) => {
        const g = glance(i.detail);
        const has = !!i.detail && Object.keys(i.detail).length > 0;
        return (
          <div className="min-w-0 text-left">
            {actionLabel(i.action)}
            <span className="block font-mono text-xs text-muted-foreground">{i.action}</span>
            {has && (
              <details className="mt-1">
                <summary className="cursor-pointer rounded-sm text-[13px] text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11 max-sm:py-2">{g || 'Show details'}</summary>
                <pre className="mt-1.5 max-h-60 overflow-auto rounded-md bg-muted p-2.5 font-mono text-xs">{JSON.stringify(i.detail, null, 2)}</pre>
              </details>
            )}
          </div>
        );
      },
    },
    { key: 'about', header: 'About', cell: (i) => (i.entity ? <>{entityLabel(i.entity)}{i.entityId && <span className="block font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{i.entityId.length > 14 ? `${i.entityId.slice(0, 8)}…` : i.entityId}</span>}</> : <span className="text-muted-foreground">-</span>) },
  ];

  const data = list.data;
  const filtered = !!action || !!actorQuery;
  const clear = () => { setAction(''); setActor(''); setPage(1); };
  return (
    <>
      <PageHeader title="Audit log" description="Every change that matters, with who made it and when. Secrets are never recorded here." />
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]" role="search" aria-label="Filter the audit log">
            <TextField label="Who" placeholder="Part of an email address" value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} />
            <SelectField label="What kind of change" value={action} onValueChange={(v) => { setAction(v); setPage(1); }} options={ACTION_OPTIONS} />
            <div className="flex items-end"><Button variant="outline" className="max-sm:min-h-11" disabled={!filtered} onClick={clear}>Clear filters</Button></div>
          </div>
        </Card>
        <Card className="gap-0 overflow-hidden p-0" aria-label="Audit entries">
          {list.loading && !data ? <RowsSkeleton rows={6} />
            : list.error ? <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
            : data && data.items.length === 0 ? <EmptyBlock title={filtered ? 'Nothing matches these filters' : 'Nothing recorded yet'}>{filtered ? 'Clear the filters to see everything.' : 'Changes will appear here as people use the app.'}</EmptyBlock>
            : data && (
              <div aria-busy={list.loading}>
                <DataList caption="Audit log, newest first" columns={columns} rows={data.items} rowKey={(i) => i.id} />
                <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
              </div>
            )}
        </Card>
      </div>
    </>
  );
}
