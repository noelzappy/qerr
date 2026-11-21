// Facts: everything the AI may use, as one list. A row opens the item's own page (/vault/:id); the filters and the page
// number live in the address, so coming back from an item lands on the same list.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../api';
import { EmptyBlock, ErrorBlock, Hint, PageHeader, Pager, RowsSkeleton, SelectBox, ToneBadge, useSelection } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDebounced, useDocumentTitle, useLoad } from '../hooks';
import { formatDate } from '../lib/format';
import { kindLabel, KIND_LABEL, VAULT_KINDS } from '../lib/labels';
import { FilterBar } from './vault/FilterBar';
import { VaultBulkBar } from './vault/VaultBulkBar';
import { isFileKind, type VaultItem } from './vault-types';

interface Page { items: VaultItem[]; total: number; page: number; pageSize: number }
const PAGE_SIZE = 25;

const KIND_OPTIONS = VAULT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }));
const STATUS_OPTIONS = [{ value: 'confirmed', label: 'Confirmed' }, { value: 'unconfirmed', label: 'Unconfirmed' }];
const STALE_OPTIONS = [{ value: 'true', label: 'Stale only' }, { value: 'false', label: 'Not stale' }];

// A small picture beside a photo or screen, so the list shows what the item is.
function Thumb({ item }: { item: VaultItem }) {
  const [broken, setBroken] = useState(false);
  if (!isFileKind(item.kind)) return null;
  return (
    <div className="size-9 flex-none overflow-hidden rounded-md bg-muted">
      {item.fileUrl && !broken ? <img src={item.fileUrl} alt="" loading="lazy" className="size-full object-cover" onError={() => setBroken(true)} /> : null}
    </div>
  );
}

// One status chip, and one more only when something is wrong.
function StatusChips({ item }: { item: VaultItem }) {
  const problems = [item.stale && 'Stale', isFileKind(item.kind) && item.problems.rights.length > 0 && 'Rights'].filter(Boolean) as string[];
  const why = [item.stale ? item.staleReason : null, ...(isFileKind(item.kind) ? item.problems.rights : [])].filter(Boolean).join('. ');
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
      <ToneBadge tone={item.status === 'confirmed' ? 'good' : 'warn'} dot>{item.status === 'confirmed' ? 'Confirmed' : 'Unconfirmed'}</ToneBadge>
      {problems.length > 0 && <span title={why || undefined}><ToneBadge tone="bad" dot>{problems.join(' and ')}</ToneBadge></span>}
    </div>
  );
}

export function Vault() {
  useDocumentTitle('Facts');
  const navigate = useNavigate();
  const location = useLocation();
  // The filters and the page are kept in the address (q, kind, status, tag, stale, page).
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [kind, setKind] = useState(params.get('kind') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [tag, setTag] = useState(params.get('tag') ?? '');
  const [stale, setStale] = useState(params.get('stale') ?? '');
  const [page, setPage] = useState(Math.max(1, Number(params.get('page')) || 1));
  const query = useDebounced(q.trim());
  const tagQuery = useDebounced(tag.trim());

  useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (kind) next.set('kind', kind);
    if (status) next.set('status', status);
    if (tagQuery) next.set('tag', tagQuery);
    if (stale) next.set('stale', stale);
    if (page > 1) next.set('page', String(page));
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [query, kind, status, tagQuery, stale, page, params, setParams]);

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
  const filtered = !!(q.trim() || kind || status || tag.trim() || stale);
  const reset = () => { setQ(''); setKind(''); setStatus(''); setTag(''); setStale(''); setPage(1); };
  const onFilter = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };

  const data = list.data;
  const add = () => navigate('/vault/new', { state: { back: `${location.pathname}${location.search}` } });
  const open = (id: string) => navigate(`/vault/${id}`, { state: { back: `${location.pathname}${location.search}` } });
  const back = { back: `${location.pathname}${location.search}` };
  const select = (i: VaultItem) => ({ checked: selection.isSelected(i.id), label: `Select ${i.title}`, onToggle: (range: boolean) => selection.toggle(i.id, range) });

  return (
    <>
      <PageHeader
        title="Facts"
        actions={(
          <>
            <Hint about="Facts" className="max-sm:flex-none!">Everything the AI may use: facts, figures, news, events, photos and screens. Only a person can mark an item confirmed.</Hint>
            <Button className="max-sm:min-h-11" onClick={add}><Plus aria-hidden="true" />Add a fact</Button>
          </>
        )}
      />
      <FilterBar
        ariaLabel="Filter your facts"
        search={{ value: q, onChange: onFilter(setQ), placeholder: 'Search facts' }}
        selects={[
          { key: 'kind', label: 'Kind', allLabel: 'All kinds', value: kind, onChange: onFilter(setKind), options: KIND_OPTIONS },
          { key: 'status', label: 'Status', allLabel: 'Any status', value: status, onChange: onFilter(setStatus), options: STATUS_OPTIONS },
          { key: 'stale', label: 'Out of date', allLabel: 'Either', value: stale, onChange: onFilter(setStale), options: STALE_OPTIONS },
        ]}
        tag={{ value: tag, onChange: onFilter(setTag) }}
        active={filtered}
        onClear={reset}
      />
      <div className="overflow-hidden rounded-lg border bg-card" aria-label="Facts">
        {list.loading && !data ? <RowsSkeleton rows={6} />
          : list.error ? <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
          : data && data.items.length === 0
            ? (
              <EmptyBlock
                title={filtered ? 'Nothing matches these filters.' : 'No facts yet.'}
                action={filtered ? <Button variant="outline" className="max-sm:min-h-11" onClick={reset}>Clear filters</Button> : <Button className="max-sm:min-h-11" onClick={add}>Add the first fact</Button>}
              />
            )
          : data && (
            <div aria-busy={list.loading}>
              <div className="hidden md:block">
                <Table>
                  <caption className="sr-only">Facts, most recently changed first</caption>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead scope="col" className="w-10 px-3.5"><SelectBox checked={selection.allSelected} label="Select all shown" onToggle={selection.toggleAll} /></TableHead>
                      <TableHead scope="col" className="h-9 px-3.5 text-[12px] font-medium text-muted-foreground">Title</TableHead>
                      <TableHead scope="col" className="h-9 px-3.5 text-[12px] font-medium text-muted-foreground">Kind</TableHead>
                      <TableHead scope="col" className="h-9 px-3.5 text-[12px] font-medium text-muted-foreground">Status</TableHead>
                      <TableHead scope="col" className="h-9 px-3.5 text-[12px] font-medium text-muted-foreground">Changed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((i) => (
                      <TableRow key={i.id} data-state={selection.isSelected(i.id) ? 'selected' : undefined} className="cursor-pointer" onClick={() => open(i.id)}>
                        <TableCell className="w-10 px-3.5 py-2 align-middle" onClick={(e) => e.stopPropagation()}><SelectBox {...select(i)} /></TableCell>
                        <TableCell className="px-3.5 py-2 align-middle whitespace-normal [overflow-wrap:anywhere]">
                          <div className="flex items-center gap-3">
                            <Thumb item={i} />
                            <div className="min-w-0">
                              <Link to={`/vault/${i.id}`} state={back} onClick={(e) => e.stopPropagation()} className="font-medium text-foreground underline-offset-4 hover:underline">{i.title}</Link>
                              {i.tags.length > 0 && <span className="block text-[12px] font-normal text-muted-foreground">{i.tags.map((t) => `#${t}`).join(' ')}</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-3.5 py-2 align-middle text-muted-foreground">{kindLabel(i.kind)}</TableCell>
                        <TableCell className="px-3.5 py-2 align-middle"><StatusChips item={i} /></TableCell>
                        <TableCell className="px-3.5 py-2 align-middle whitespace-nowrap text-muted-foreground">{formatDate(i.updatedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center gap-3 border-b px-4 py-2.5 md:hidden">
                <SelectBox checked={selection.allSelected} label="Select all shown" onToggle={selection.toggleAll} />
                <span className="text-[12.5px] text-muted-foreground" aria-hidden="true">Select all shown</span>
              </div>
              <ul className="divide-y md:hidden" aria-label="Facts, most recently changed first">
                {data.items.map((i) => (
                  <li key={i.id} className={`flex items-start gap-3 px-4 py-3 ${selection.isSelected(i.id) ? 'bg-muted/50' : ''}`}>
                    <SelectBox className="mt-1" {...select(i)} />
                    <Thumb item={i} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <Link to={`/vault/${i.id}`} state={back} className="font-medium text-foreground [overflow-wrap:anywhere]">{i.title}</Link>
                      {i.tags.length > 0 && <span className="text-[12px] text-muted-foreground [overflow-wrap:anywhere]">{i.tags.map((t) => `#${t}`).join(' ')}</span>}
                      <span className="text-[12.5px] text-muted-foreground">{kindLabel(i.kind)} · {formatDate(i.updatedAt)}</span>
                      <StatusChips item={i} />
                    </div>
                  </li>
                ))}
              </ul>
              <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </div>
          )}
      </div>
      <VaultBulkBar selection={selection} items={data?.items ?? []} noun="fact" reload={list.reload} />
    </>
  );
}
