// Pictures: the photos and screens in the vault, as a grid. A tile opens the picture's own page (/library/:id); uploads have
// a page too (/library/upload). The AI reads each picture's description (and its licence and people flags) when it chooses
// pictures for posts. The filters live in the address, and /library?q=words starts with a search.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckSquare, ImagePlus, Loader2 } from 'lucide-react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { EmptyBlock, ErrorBlock, Hint, PageHeader, useSelection } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounced, useDocumentTitle } from '../hooks';
import { errorMessage } from '../lib/errors';
import { FilterBar } from './vault/FilterBar';
import { VaultBulkBar } from './vault/VaultBulkBar';
import { LibraryTile } from './library/LibraryTile';
import { RoleSwitch } from './library/RoleSwitch';
import { asRole, ROLE_EMPTY, ROLE_NOUN, type PictureRole } from './library/util';
import type { VaultItem } from './vault-types';

interface Page { items: VaultItem[]; total: number; page: number; pageSize: number }
const PAGE_SIZE = 48;

const KIND_OPTIONS = [{ value: 'photo', label: 'Photos' }, { value: 'screen', label: 'Screens' }];
const STATUS_OPTIONS = [{ value: 'confirmed', label: 'Confirmed' }, { value: 'unconfirmed', label: 'Unconfirmed' }];

const GRID = 'm-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';

function GridSkeleton() {
  return (
    <ul className={GRID} role="status" aria-label="Loading your pictures">
      {Array.from({ length: 12 }, (_, i) => (
        <li key={i} className="flex flex-col gap-2"><Skeleton className="aspect-square w-full rounded-lg" /><Skeleton className="h-4 w-2/3" /></li>
      ))}
    </ul>
  );
}

export function Library() {
  useDocumentTitle('Pictures');
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const [q, setQ] = useState(urlQ);
  const [role, setRole] = useState<PictureRole>(asRole(params.get('role')));
  const [counts, setCounts] = useState<Partial<Record<PictureRole, number>>>({});
  const [kind, setKind] = useState(params.get('kind') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [tag, setTag] = useState(params.get('tag') ?? '');
  const query = useDebounced(q.trim());
  const tagQuery = useDebounced(tag.trim());

  // A search that arrives in the address while the page is open (the command palette) replaces the box; the address the page
  // writes itself does not.
  const written = useRef(urlQ);
  useEffect(() => { if (urlQ !== written.current) { written.current = urlQ; setQ(urlQ); } }, [urlQ]);
  const redirecting = params.get('upload') === '1';
  useEffect(() => {
    if (redirecting) return;
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (role !== 'photo') next.set('role', role);
    if (kind && role === 'photo') next.set('kind', kind);
    if (status) next.set('status', status);
    if (tagQuery) next.set('tag', tagQuery);
    written.current = query;
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [query, role, kind, status, tagQuery, params, setParams, redirecting]);

  const [items, setItems] = useState<VaultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const selection = useSelection(items.map((i) => i.id));
  const seq = useRef(0);
  const pagesLoaded = useRef(1);

  const fetchPage = useCallback((page: number) => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), withFileUrls: 'true' });
    p.set('role', role);
    if (kind && role === 'photo') p.set('kind', kind); else p.set('images', 'true');
    if (status) p.set('status', status);
    if (query) p.set('q', query);
    if (tagQuery) p.set('tag', tagQuery);
    return api.get<Page>(`/api/vault?${p.toString()}`);
  }, [role, kind, status, query, tagQuery]);

  // Loads the first page again (filters changed, or something was changed in bulk).
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError(''); setMoreError('');
    try {
      const r = await fetchPage(1);
      if (mine !== seq.current) return;
      setItems(r.items); setTotal(r.total); pagesLoaded.current = 1;
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e, 'This could not be loaded.'));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [fetchPage]);
  useEffect(() => { void reload(); return () => { seq.current++; }; }, [reload]);

  async function loadMore() {
    const mine = seq.current;
    setLoadingMore(true); setMoreError('');
    try {
      const r = await fetchPage(pagesLoaded.current + 1);
      if (mine !== seq.current) return;
      pagesLoaded.current += 1;
      setItems((cur) => [...cur, ...r.items.filter((n) => !cur.some((c) => c.id === n.id))]);
      setTotal(r.total);
    } catch (e) {
      if (mine === seq.current) setMoreError(errorMessage(e, 'More pictures could not be loaded.'));
    } finally {
      setLoadingMore(false);
    }
  }

  const loadCounts = useCallback(() => { api.get<Record<PictureRole, number>>('/api/vault/counts').then(setCounts).catch(() => undefined); }, []);
  useEffect(() => { loadCounts(); }, [loadCounts, total]);

  const filtered = !!(kind || status || q.trim() || tag.trim());
  const reset = () => { setQ(''); setKind(''); setStatus(''); setTag(''); };

  if (redirecting) return <Navigate to="/library/upload" replace />;

  const back = `${location.pathname}${location.search}`;
  const toggleSelecting = () => { if (selecting) selection.clear(); setSelecting(!selecting); };
  const noun = ROLE_NOUN[role];
  const upload = <Button asChild className="max-sm:min-h-11"><Link to={role === 'photo' ? '/library/upload' : `/library/upload?role=${role}`}><ImagePlus aria-hidden="true" />Upload {role === 'photo' ? 'pictures' : `${noun}s`}</Link></Button>;
  return (
    <>
      <PageHeader
        title="Pictures"
        actions={(
          <>
            <Hint about="Pictures" className="max-sm:flex-none!">Photos and screens are what the AI may choose for posts; describe each one. Cut-outs and graphics are for your designs.</Hint>
            {items.length > 0 && (
              <Button variant={selecting ? 'secondary' : 'outline'} className="max-sm:min-h-11" aria-pressed={selecting} onClick={toggleSelecting}>
                <CheckSquare aria-hidden="true" />{selecting ? 'Done selecting' : 'Select'}
              </Button>
            )}
            {upload}
          </>
        )}
      />
      <div className="mb-3"><RoleSwitch value={role} onChange={(r) => { setRole(r); setKind(''); selection.clear(); }} counts={counts} /></div>
      <FilterBar
        ariaLabel="Filter your pictures"
        search={{ value: q, onChange: setQ, placeholder: 'Search pictures' }}
        filters={[
          { key: 'status', label: 'Status', allLabel: 'Any', value: status, onChange: setStatus, options: STATUS_OPTIONS },
          ...(role === 'photo' ? [{ key: 'kind', label: 'Kind', allLabel: 'Any', value: kind, onChange: setKind, options: KIND_OPTIONS }] : []),
        ]}
        tag={{ value: tag, onChange: setTag }}
        active={filtered}
        onClear={reset}
      />

      {loading && items.length === 0 ? <GridSkeleton />
        : error ? <ErrorBlock message={error} onRetry={() => void reload()} />
        : items.length === 0
          ? (
            <EmptyBlock title={filtered ? 'No pictures match these filters.' : ROLE_EMPTY[role]}
              action={filtered ? <Button variant="outline" className="max-sm:min-h-11" onClick={reset}>Clear filters</Button> : upload} />
          )
          : (
            <div className="flex flex-col gap-4" aria-busy={loading}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="text-[12.5px] text-muted-foreground" aria-live="polite">Showing {items.length} of {total} {total === 1 ? 'picture' : 'pictures'}</p>
                {selecting && (
                  <Button variant="outline" size="sm" className="max-sm:min-h-11" onClick={selection.toggleAll}>
                    {selection.allSelected ? 'Deselect all shown' : `Select all shown (${items.length})`}
                  </Button>
                )}
              </div>
              <ul className={GRID} aria-label="Pictures">
                {items.map((i) => <LibraryTile key={i.id} item={i} to={`/library/${i.id}`} back={back} selecting={selecting} selected={selection.isSelected(i.id)} onToggle={(range) => selection.toggle(i.id, range)} />)}
              </ul>
              {moreError && <p className="text-center text-[13px] text-destructive" role="alert">{moreError}</p>}
              {items.length < total && (
                <div className="flex justify-center">
                  <Button variant="outline" className="max-sm:min-h-11" disabled={loadingMore} onClick={() => void loadMore()}>
                    {loadingMore && <Loader2 className="animate-spin" aria-hidden="true" />}Load more
                  </Button>
                </div>
              )}
            </div>
          )}

      {selecting && <VaultBulkBar selection={selection} items={items} noun="picture" reload={reload} />}
    </>
  );
}
