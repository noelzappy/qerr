// The image library: photos and screens in the vault, as a grid. The owner uploads pictures and describes them; the AI
// reads the description (and the licence and people flags) when it chooses pictures for posts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckSquare, ImagePlus, Images, Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../api';
import { EmptyBlock, ErrorBlock, SelectField, TextField, useSelection } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounced, useDocumentTitle } from '../hooks';
import { errorMessage } from '../lib/errors';
import { CreateHeader } from '../shell/CreateHeader';
import { VaultBulkBar } from './vault/VaultBulkBar';
import { ItemSheet } from './library/ItemSheet';
import { LibraryTile } from './library/LibraryTile';
import { UploadSheet } from './library/UploadSheet';
import type { VaultItem } from './vault-types';

interface Page { items: VaultItem[]; total: number; page: number; pageSize: number }
const PAGE_SIZE = 48;

const KIND_OPTIONS = [{ value: '', label: 'All' }, { value: 'photo', label: 'Photos' }, { value: 'screen', label: 'Screens' }];
const STATUS_OPTIONS = [{ value: '', label: 'All' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'unconfirmed', label: 'Unconfirmed' }];

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
  // /library?upload=1 opens the upload sheet and /library?q=words starts with a search (the New menu and the search box use them).
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const query = useDebounced(q.trim());
  const tagQuery = useDebounced(tag.trim());

  const [items, setItems] = useState<VaultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [uploading, setUploading] = useState(params.get('upload') === '1');
  const [open, setOpen] = useState<VaultItem | null>(null);
  const [selecting, setSelecting] = useState(false);
  const selection = useSelection(items.map((i) => i.id));
  useEffect(() => {
    if (!params.has('upload') && !params.has('q')) return;
    if (params.get('upload') === '1') setUploading(true);
    const qp = params.get('q');
    if (qp !== null) setQ(qp);
    setParams({}, { replace: true });
  }, [params, setParams]);
  const seq = useRef(0);
  const pagesLoaded = useRef(1);

  const fetchPage = useCallback((page: number) => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), withFileUrls: 'true' });
    if (kind) p.set('kind', kind); else p.set('images', 'true');
    if (status) p.set('status', status);
    if (query) p.set('q', query);
    if (tagQuery) p.set('tag', tagQuery);
    return api.get<Page>(`/api/vault?${p.toString()}`);
  }, [kind, status, query, tagQuery]);

  // Loads the first page again (filters changed, or something was added, changed or removed).
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

  const filtered = !!(kind || status || query || tagQuery);
  const reset = () => { setQ(''); setKind(''); setStatus(''); setTag(''); };

  function changed(next: VaultItem, imageChanged: boolean) {
    // The list answer carries a signed fileUrl that the single-item answer does not, so keep the tile's picture.
    setItems((cur) => cur.map((i) => (i.id === next.id ? { ...next, fileUrl: i.fileUrl } : i)));
    setOpen((cur) => (cur && cur.id === next.id ? { ...next, fileUrl: cur.fileUrl } : cur));
    if (imageChanged) void reload();
  }

  function removed(gone: VaultItem) {
    setOpen(null);
    setItems((cur) => cur.filter((i) => i.id !== gone.id));
    setTotal((t) => Math.max(0, t - 1));
    toast.success(`"${gone.title}" deleted`, {
      duration: 9000,
      action: {
        label: 'Undo',
        onClick: () => { api.post(`/api/vault/${gone.id}/restore`).then(() => { toast.success('Picture restored'); void reload(); }).catch((e: unknown) => toast.error(errorMessage(e))); },
      },
    });
  }

  const toggleSelecting = () => { if (selecting) selection.clear(); setSelecting(!selecting); };
  const selectButton = (
    <Button variant={selecting ? 'secondary' : 'outline'} className="max-sm:min-h-11" aria-pressed={selecting} onClick={toggleSelecting}>
      <CheckSquare aria-hidden="true" />{selecting ? 'Done selecting' : 'Select'}
    </Button>
  );
  const upload = <Button className="max-sm:min-h-11" onClick={() => setUploading(true)}><ImagePlus aria-hidden="true" />Upload pictures</Button>;
  return (
    <>
      <CreateHeader title="Pictures" icon={Images} description="Pictures holds the photos and screens the AI may choose for posts. Describe each one: the AI reads the description when it chooses." actions={<>{items.length > 0 && selectButton}{upload}</>} />
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]" role="search" aria-label="Filter your pictures">
            <TextField label="Search" type="search" placeholder="Words in the title or description" value={q} onChange={(e) => setQ(e.target.value)} />
            <SelectField label="Kind" value={kind} onValueChange={setKind} options={KIND_OPTIONS} />
            <SelectField label="Status" value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
            <TextField label="Tag" placeholder="For example news" value={tag} onChange={(e) => setTag(e.target.value)} />
            <div className="flex items-end"><Button variant="outline" className="max-sm:min-h-11" disabled={!filtered} onClick={reset}>Clear filters</Button></div>
          </div>
        </Card>

        {loading && items.length === 0 ? <GridSkeleton />
          : error ? <Card className="gap-0 p-0"><ErrorBlock message={error} onRetry={() => void reload()} /></Card>
          : items.length === 0
            ? (
              <Card className="gap-0 p-0">
                <EmptyBlock title={filtered ? 'No pictures match these filters' : 'No pictures yet'}
                  action={filtered ? <Button variant="outline" className="max-sm:min-h-11" onClick={reset}>Clear filters</Button> : upload}>
                  {filtered ? 'Try fewer filters or different words.' : 'Pictures holds the photos and screenshots the AI can use in posts. Upload an image and say what it shows, the mood, and what posts it suits. The AI reads that description to choose pictures.'}
                </EmptyBlock>
              </Card>
            )
            : (
              <div className="flex flex-col gap-4" aria-busy={loading}>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="text-[13px] text-muted-foreground" aria-live="polite">Showing {items.length} of {total} {total === 1 ? 'picture' : 'pictures'}</p>
                  {selecting && (
                    <Button variant="outline" size="sm" className="max-sm:min-h-11" onClick={selection.toggleAll}>
                      {selection.allSelected ? 'Deselect all shown' : `Select all shown (${items.length})`}
                    </Button>
                  )}
                </div>
                <ul className={GRID} aria-label="Pictures">
                  {items.map((i) => <LibraryTile key={i.id} item={i} onOpen={setOpen} selecting={selecting} selected={selection.isSelected(i.id)} onToggle={(range) => selection.toggle(i.id, range)} />)}
                </ul>
                {moreError && <p className="text-center text-sm text-destructive" role="alert">{moreError}</p>}
                {items.length < total && (
                  <div className="flex justify-center">
                    <Button variant="outline" className="max-sm:min-h-11" disabled={loadingMore} onClick={() => void loadMore()}>
                      {loadingMore && <Loader2 className="animate-spin" aria-hidden="true" />}Load more
                    </Button>
                  </div>
                )}
              </div>
            )}
      </div>

      {selecting && <VaultBulkBar selection={selection} items={items} noun="picture" reload={reload} />}
      {uploading && <UploadSheet onClose={() => setUploading(false)} onUploaded={(n) => { toast.success(`${n} ${n === 1 ? 'picture' : 'pictures'} added`); void reload(); }} />}
      {open && <ItemSheet key={open.id} item={open} onClose={() => setOpen(null)} onChanged={changed} onRemoved={removed} />}
    </>
  );
}
