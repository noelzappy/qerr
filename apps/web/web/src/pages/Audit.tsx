import { useState } from 'react';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataList, EmptyBlock, ErrorBlock, Pager, RowsSkeleton, SelectField, TextField, type Column } from '@/components/kit';
import { useDebounced, useDocumentTitle, useLoad } from '../hooks';
import { formatDateTime } from '../lib/format';
import { actionLabel, AUDIT_GROUPS, entityLabel } from '../lib/labels';
import { SettingsPage } from './settings/section';

// Sentences for codes the shared label map does not know. A code in neither place shows as the shared map's softened code.
const SENTENCES: Record<string, string> = {
  'post.render.done': 'The image for a post was made', 'post.render.failed': 'The image for a post could not be made',
  'post.approval_revoked': 'A post lost its approval because it changed',
  'layout.create': 'Added a layout', 'layout.update': 'Changed a layout', 'layout.delete': 'Deleted a layout',
  'brand.reference.apply': 'Applied a design reference to the brand', 'brand.artwork.upload': 'Uploaded brand artwork', 'brand.artwork.remove': 'Removed brand artwork',
  'schedule.send_draft.done': 'Finished sending a batch to Buffer as drafts', 'schedule.send_live.done': 'Finished scheduling a batch on Buffer',
  'schedule.refresh.done': 'Finished refreshing delivery status',
  'seed.research_topics': 'Research topics were set up', 'seed.vault_import': 'Facts were imported at set-up',
};
const sentence = (code: string) => SENTENCES[code] ?? actionLabel(code);

interface AuditItem { id: string; at: string; actorId: string | null; actorEmail: string | null; action: string; entity: string | null; entityId: string | null; detail: Record<string, unknown> | null }
interface Page { items: AuditItem[]; page: number; pageSize: number; total: number }
const PAGE_SIZE = 25;

const ACTION_OPTIONS = [{ value: '', label: 'Everything' }, ...AUDIT_GROUPS.map((g) => ({ value: g.value, label: g.label }))];

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
        const has = !!i.detail && Object.keys(i.detail).length > 0;
        return (
          <div className="min-w-0 text-left">
            <span className="font-medium">{sentence(i.action)}</span>
            <details className="mt-1">
              <summary className="w-fit cursor-pointer rounded-sm text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11 max-sm:py-2">Details</summary>
              <dl className="mt-1.5 grid gap-x-3 gap-y-1 text-[13px] sm:grid-cols-[6rem_1fr]">
                <dt className="text-muted-foreground">Code</dt><dd className="font-mono text-xs [overflow-wrap:anywhere]">{i.action}</dd>
                {i.entityId && <><dt className="text-muted-foreground">Record id</dt><dd className="font-mono text-xs [overflow-wrap:anywhere]">{i.entityId}</dd></>}
              </dl>
              {has && <pre className="mt-1.5 max-h-60 overflow-auto rounded-md bg-muted p-2.5 font-mono text-xs">{JSON.stringify(i.detail, null, 2)}</pre>}
            </details>
          </div>
        );
      },
    },
    { key: 'about', header: 'About', cell: (i) => (i.entity ? <>{entityLabel(i.entity)}</> : <span className="text-muted-foreground">-</span>) },
  ];

  const data = list.data;
  const filtered = !!action || !!actorQuery;
  const clear = () => { setAction(''); setActor(''); setPage(1); };
  return (
    <SettingsPage title="Audit log" description="Every change that matters, with who made it and when. Secrets are never recorded here.">
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
    </SettingsPage>
  );
}
