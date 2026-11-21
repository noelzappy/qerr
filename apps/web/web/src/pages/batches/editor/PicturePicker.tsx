// The picture of a design: shows the current one, lets a person choose another from the Pictures page, or remove it.
// The Pictures page and Facts share one store (photo and screen items of /api/vault), so this list is the Pictures page's list.
// A picture from that store is named in the design by a file path of a fixed shape plus the item's id; both are written together.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, Search } from 'lucide-react';
import { TextField } from '@/components/kit';
import { ErrorBlock } from '@/components/kit/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { api, ApiError } from '../../../api';
import { errorMessage } from '../../../lib/errors';
import { useDebounced } from '../../../hooks';
import { needsRights } from '../../library/util';
import type { VaultItem } from '../../vault-types';

export interface PictureValue { image?: string; vaultItemId?: string }

const PAGE_SIZE = 24;
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const KINDS = [{ value: '', label: 'All' }, { value: 'photo', label: 'Photos' }, { value: 'screen', label: 'Screens' }];
const VAULT_PATH = /^design\/assets\/photos\/vault-[0-9a-f-]{36}\.(?:jpe?g|png|webp|gif)$/i;

// The exact reference the server accepts for a picture held in Facts (see the vault picture rules in the server).
export function vaultImagePath(item: Pick<VaultItem, 'id' | 'fileName' | 'contentType'>): string {
  const name = (item.fileName ?? '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const fromName = dot >= 0 ? name.slice(dot) : '';
  const ext = IMAGE_EXT.includes(fromName)
    ? fromName
    : ({ 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' } as Record<string, string>)[item.contentType ?? ''] ?? '.jpg';
  return `design/assets/photos/vault-${item.id}${ext}`;
}

const fileNameOf = (p: string) => p.split('/').filter(Boolean).pop() ?? p;

// What the design's current picture is, as far as it can be shown.
type Current =
  | { state: 'none' }
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'error'; message: string }
  | { state: 'ready'; item: VaultItem; url: string | null };

function useCurrentPicture(vaultItemId: string | undefined): Current {
  const [current, setCurrent] = useState<Current>(vaultItemId ? { state: 'loading' } : { state: 'none' });
  useEffect(() => {
    if (!vaultItemId) { setCurrent({ state: 'none' }); return; }
    let live = true;
    setCurrent({ state: 'loading' });
    (async () => {
      try {
        const { item } = await api.get<{ item: VaultItem }>(`/api/vault/${encodeURIComponent(vaultItemId)}`);
        if (!live) return;
        let url: string | null = null;
        try { url = (await api.get<{ url: string }>(`/api/vault/${encodeURIComponent(vaultItemId)}/file-url`)).url; } catch { url = null; }
        if (live) setCurrent({ state: 'ready', item, url });
      } catch (e) {
        if (!live) return;
        setCurrent(e instanceof ApiError && (e.status === 404 || e.status === 410) ? { state: 'missing' } : { state: 'error', message: errorMessage(e, 'The picture could not be loaded.') });
      }
    })();
    return () => { live = false; };
  }, [vaultItemId]);
  return current;
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
      {src && !broken
        ? <img src={src} alt={alt} className="size-full object-cover" onError={() => setBroken(true)} />
        : <ImageOff className="size-6" aria-label={broken ? 'The picture could not be shown' : 'No preview'} role="img" />}
    </span>
  );
}

export function PicturePicker({ label = 'Picture', value, onChange, disabled, required, error }: {
  label?: string;
  value: PictureValue;
  onChange: (next: PictureValue) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = useCurrentPicture(value.vaultItemId);
  const hasPicture = Boolean(value.image || value.vaultItemId);
  const foreignFile = Boolean(value.image && !VAULT_PATH.test(value.image));
  const [advanced, setAdvanced] = useState(foreignFile);
  useEffect(() => { if (foreignFile) setAdvanced(true); }, [foreignFile]);

  function choose(item: VaultItem) {
    onChange({ image: vaultImagePath(item), vaultItemId: item.id });
    setOpen(false);
  }

  function setField(key: keyof PictureValue, v: string) {
    const next: PictureValue = { ...value, [key]: v };
    if (!next.image) delete next.image;
    if (!next.vaultItemId) delete next.vaultItemId;
    onChange(next);
  }

  let preview: React.ReactNode;
  if (current.state === 'loading') {
    preview = (
      <div className="flex items-center gap-3" role="status" aria-label="Loading the picture">
        <Skeleton className="size-20 rounded-md" /><Skeleton className="h-4 w-40" />
      </div>
    );
  } else if (current.state === 'ready') {
    preview = (
      <div className="flex items-center gap-3">
        <Thumb src={current.url} alt={current.item.title} />
        <div className="min-w-0"><p className="truncate text-sm font-medium">{current.item.title}</p><p className="text-[13px] text-muted-foreground">From the Pictures page</p></div>
      </div>
    );
  } else if (current.state === 'missing') {
    preview = (
      <div className="flex items-center gap-3"><Thumb src={null} alt="" /><p className="text-sm text-destructive" role="alert">This picture is no longer on the Pictures page</p></div>
    );
  } else if (current.state === 'error') {
    preview = (
      <div className="flex items-center gap-3"><Thumb src={null} alt="" /><p className="text-sm text-destructive" role="alert">{current.message}</p></div>
    );
  } else if (value.image) {
    preview = (
      <div className="flex items-center gap-3">
        <Thumb src={null} alt="" />
        <div className="min-w-0"><p className="truncate text-sm font-medium">{fileNameOf(value.image)}</p><p className="text-[13px] text-muted-foreground">Picture file: {fileNameOf(value.image)}</p></div>
      </div>
    );
  } else {
    preview = <p className="text-sm text-muted-foreground">No picture chosen yet.</p>;
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled} aria-describedby={error ? 'picture-error' : undefined}>
      <legend className="mb-1 text-sm font-medium">{label}{required && <span aria-hidden="true"> *</span>}</legend>
      {preview}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" onClick={() => setOpen(true)}>{hasPicture ? 'Change picture' : 'Choose a picture'}</Button>
        {hasPicture && <Button type="button" variant="ghost" size="sm" className="max-sm:min-h-11" onClick={() => onChange({})}>Remove picture</Button>}
      </div>
      {error && <p id="picture-error" className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
      <details className="rounded-md border px-3 py-2" open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
        <summary className="cursor-pointer rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-9">Advanced: type a file path or id</summary>
        <div className="mt-3 flex flex-col gap-3">
          <TextField mono label="Picture file" hint="A file under design/assets/, for example design/assets/photos/cocoa-pods.jpg" value={value.image ?? ''} onChange={(e) => setField('image', e.target.value)} />
          <TextField mono label="Picture id" hint="The id of a picture on the Pictures page; it is used instead of the file" value={value.vaultItemId ?? ''} onChange={(e) => setField('vaultItemId', e.target.value)} />
        </div>
      </details>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1rem)] flex-col gap-3 p-4 sm:max-w-3xl sm:p-6">
          <DialogHeader>
            <DialogTitle>Choose a picture</DialogTitle>
            <DialogDescription>Photos and screens from the Pictures page. The picture is used as it is, so check its rights first.</DialogDescription>
          </DialogHeader>
          <PickerList selectedId={value.vaultItemId} onPick={choose} />
        </DialogContent>
      </Dialog>
    </fieldset>
  );
}

interface Page { items: VaultItem[]; total: number }

function PickerList({ selectedId, onPick }: { selectedId?: string; onPick: (item: VaultItem) => void }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const query = useDebounced(q.trim());
  const [items, setItems] = useState<VaultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const seq = useRef(0);
  const pages = useRef(1);

  const fetchPage = useCallback((page: number) => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), withFileUrls: 'true' });
    if (kind) p.set('kind', kind); else p.set('images', 'true');
    if (query) p.set('q', query);
    return api.get<Page>(`/api/vault?${p.toString()}`);
  }, [kind, query]);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError(''); setMoreError('');
    try {
      const r = await fetchPage(1);
      if (mine !== seq.current) return;
      setItems(r.items); setTotal(r.total); pages.current = 1;
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e, 'The pictures could not be loaded.'));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [fetchPage]);
  useEffect(() => { void reload(); return () => { seq.current++; }; }, [reload]);

  async function loadMore() {
    const mine = seq.current;
    setLoadingMore(true); setMoreError('');
    try {
      const r = await fetchPage(pages.current + 1);
      if (mine !== seq.current) return;
      pages.current += 1;
      setItems((cur) => [...cur, ...r.items.filter((n) => !cur.some((c) => c.id === n.id))]);
      setTotal(r.total);
    } catch (e) {
      if (mine === seq.current) setMoreError(errorMessage(e, 'More pictures could not be loaded.'));
    } finally {
      if (mine === seq.current) setLoadingMore(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pictures" aria-label="Search pictures" className="pl-8 max-sm:h-11" />
        </div>
        <div className="flex gap-1" role="group" aria-label="Kind of picture">
          {KINDS.map((k) => (
            <Button key={k.value} type="button" size="sm" variant={kind === k.value ? 'default' : 'outline'} aria-pressed={kind === k.value} className="max-sm:min-h-11 max-sm:flex-1" onClick={() => setKind(k.value)}>{k.label}</Button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" role="status" aria-label="Loading the pictures">
            {Array.from({ length: 8 }, (_, i) => <li key={i} className="flex flex-col gap-2"><Skeleton className="aspect-square w-full rounded-lg" /><Skeleton className="h-4 w-2/3" /></li>)}
          </ul>
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => void reload()} />
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted-foreground">No pictures match. Add pictures on the <Link to="/library" className="font-medium text-primary underline-offset-4 hover:underline">Pictures page</Link>.</p>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map((item) => <PickTile key={item.id} item={item} current={item.id === selectedId} onPick={onPick} />)}
            </ul>
            <div className="flex flex-col items-center gap-2 py-3">
              <span className="text-[13px] text-muted-foreground">{items.length} of {total}</span>
              {moreError && <p className="text-[13px] font-medium text-destructive" role="alert">{moreError}</p>}
              {items.length < total && <Button type="button" variant="outline" className="max-sm:min-h-11" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading' : 'Load more'}</Button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PickTile({ item, current, onPick }: { item: VaultItem; current: boolean; onPick: (item: VaultItem) => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <li className="min-w-0">
      <button type="button" aria-pressed={current} onClick={() => onPick(item)}
        className="group flex w-full min-w-0 flex-col gap-2 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className={cn('block aspect-square w-full overflow-hidden rounded-lg border bg-muted', current && 'border-primary ring-[3px] ring-primary')}>
          {item.fileUrl && !broken
            ? <img src={item.fileUrl} alt="" loading="lazy" className="size-full object-cover" onError={() => setBroken(true)} />
            : <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground"><ImageOff className="size-6" aria-hidden="true" />No preview</span>}
        </span>
        <span className="block min-w-0">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          {needsRights(item) && <Badge variant="destructive" className="mt-1">Rights need attention</Badge>}
        </span>
      </button>
    </li>
  );
}
