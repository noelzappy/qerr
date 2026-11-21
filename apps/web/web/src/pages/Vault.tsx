import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../api';
import { Badge } from '@/components/ui/badge';
import { DataList, EmptyBlock, ErrorBlock, Pager, RowsSkeleton, SelectField, TextField, useSelection, type Column } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDebounced, useDocumentTitle, useLoad } from '../hooks';
import { formatDate } from '../lib/format';
import { kindLabel, KIND_LABEL, VAULT_KINDS } from '../lib/labels';
import { CreateHeader } from '../shell/CreateHeader';
import { VaultBulkBar } from './vault/VaultBulkBar';
import { VaultItemPanel } from './vault/VaultItemPanel';
import { isFileKind, type VaultItem } from './vault-types';

interface Page { items: VaultItem[]; total: number; page: number; pageSize: number }
const PAGE_SIZE = 25;

const KIND_OPTIONS = [{ value: '', label: 'All kinds' }, ...VAULT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))];
const STATUS_OPTIONS = [{ value: '', label: 'Any status' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'unconfirmed', label: 'Unconfirmed' }];
const STALE_OPTIONS = [{ value: '', label: 'Either' }, { value: 'true', label: 'Stale only' }, { value: 'false', label: 'Not stale' }];

// A small picture beside a photo or screen, so the list shows what the item is. Items without a picture get a quiet box.
function Thumb({ item }: { item: VaultItem }) {
  const [broken, setBroken] = useState(false);
  if (!isFileKind(item.kind)) return null;
  return (
    <div className="size-12 flex-none overflow-hidden rounded-md border bg-muted">
      {item.fileUrl && !broken ? <img src={item.fileUrl} alt="" loading="lazy" className="size-full object-cover" onError={() => setBroken(true)} /> : null}
    </div>
  );
}

export function Vault() {
  useDocumentTitle('Vault');
  const navigate = useNavigate();
  // /vault/new and /vault/:id are the same page with the item panel open over the list.
  const { id } = useParams();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [stale, setStale] = useState('');
  const [page, setPage] = useState(1);
  const query = useDebounced(q.trim());
  const tagQuery = useDebounced(tag.trim());

  const list = useLoad(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), withFileUrls: 'true' });
    if (query) p.set('q', query);
    if (kind) p.set('kind', kind);
    if (status) p.set('status', status);
    if (tagQuery) p.set('tag', tagQuery);
    if (stale) p.set('stale', stale);
    return api.get<Page>(`/api/vault?${p.toString()}`);
  }, [page, query, kind, status, tagQuery, stale]);

  const selection = useSelection((list.data?.items ?? []).map((i) => i.id));
  const filtered = !!(query || kind || status || tagQuery || stale);
  const reset = () => { setQ(''); setKind(''); setStatus(''); setTag(''); setStale(''); setPage(1); };
  const onFilter = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };

  const columns: Column<VaultItem>[] = [
    {
      key: 'title', header: 'Item', primary: true,
      cell: (i) => (
        <div className="flex items-center gap-3">
          <Thumb item={i} />
          <div className="min-w-0">
            <Link to={`/vault/${i.id}`} className="font-semibold text-foreground underline-offset-4 hover:underline [overflow-wrap:anywhere]">{i.title}</Link>
            {i.tags.length > 0 && <span className="block text-[13px] font-normal text-muted-foreground [overflow-wrap:anywhere]">{i.tags.map((t) => `#${t}`).join(' ')}</span>}
          </div>
        </div>
      ),
    },
    { key: 'kind', header: 'Kind', cell: (i) => kindLabel(i.kind) },
    {
      key: 'status', header: 'Status',
      cell: (i) => (
        <div className="flex flex-wrap gap-1.5 max-md:justify-end">
          {i.status === 'confirmed' ? <Badge variant="success">Confirmed</Badge> : <Badge variant="warning">Unconfirmed</Badge>}
          {i.stale && <Badge variant="destructive" title={i.staleReason ?? undefined}>Stale</Badge>}
          {isFileKind(i.kind) && i.problems.rights.length > 0 && <Badge variant="destructive" title={i.problems.rights.join('. ')}>Rights</Badge>}
        </div>
      ),
    },
    { key: 'updated', header: 'Changed', cell: (i) => <span className="whitespace-nowrap">{formatDate(i.updatedAt)}</span> },
  ];

  const data = list.data;
  const add = () => navigate('/vault/new');
  return (
    <>
      <CreateHeader
        description="The vault holds everything the AI may use: facts, figures, news, events, photos and screens. Only a person can mark an item confirmed."
        actions={<Button size="sm" className="max-sm:min-h-11" onClick={add}><Plus aria-hidden="true" />Add an item</Button>}
      />
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" role="search" aria-label="Filter the vault">
            <TextField label="Search" type="search" placeholder="Words in the title or text" value={q} onChange={(e) => onFilter(setQ)(e.target.value)} className="sm:col-span-2 lg:col-span-2" />
            <SelectField label="Kind" value={kind} onValueChange={onFilter(setKind)} options={KIND_OPTIONS} />
            <SelectField label="Status" value={status} onValueChange={onFilter(setStatus)} options={STATUS_OPTIONS} />
            <SelectField label="Out of date" value={stale} onValueChange={onFilter(setStale)} options={STALE_OPTIONS} />
            <TextField label="Tag" placeholder="For example news" value={tag} onChange={(e) => onFilter(setTag)(e.target.value)} className="lg:col-span-2" />
            {filtered && <div className="flex items-end"><Button variant="outline" className="max-sm:min-h-11" onClick={reset}>Clear filters</Button></div>}
          </div>
        </Card>
        <Card className="gap-0 overflow-hidden p-0" aria-label="Vault items">
          {list.loading && !data ? <RowsSkeleton rows={6} />
            : list.error ? <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
            : data && data.items.length === 0
              ? (
                <EmptyBlock
                  title={filtered ? 'Nothing matches these filters' : 'The vault is empty'}
                  action={filtered ? <Button variant="outline" className="max-sm:min-h-11" onClick={reset}>Clear filters</Button> : <Button className="max-sm:min-h-11" onClick={add}>Add the first item</Button>}
                >
                  {filtered ? 'Try fewer filters or different words.' : 'Add facts, figures and photos here. Posts are written only from what is in the vault.'}
                </EmptyBlock>
              )
            : data && (
              <div aria-busy={list.loading}>
                <DataList caption="Vault items, most recently changed first" columns={columns} rows={data.items} rowKey={(i) => i.id}
                  select={{ isSelected: (i) => selection.isSelected(i.id), onToggle: (i, range) => selection.toggle(i.id, range), allSelected: selection.allSelected, onToggleAll: selection.toggleAll, label: (i) => i.title }} />
                <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
              </div>
            )}
        </Card>
      </div>
      <VaultBulkBar selection={selection} items={data?.items ?? []} noun="item" reload={list.reload} />
      {id && <VaultItemPanel id={id} onClose={() => navigate('/vault')} onChanged={() => void list.reload()} />}
    </>
  );
}
