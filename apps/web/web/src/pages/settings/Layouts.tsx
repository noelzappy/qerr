// Settings, Layouts: the brand's own page designs. A layout is blocks (a headline, a photo, a colour panel ...) placed in slots on a
// grid or at pixel rectangles, with options from fixed lists; Vesk draws it with the brand's look and checks every image like the
// built-in layouts. People start from a blank layout or a starting point and edit it on its own page (layouts/EditorRoute.tsx, the
// editor in LayoutEditor.tsx); this page lists them. The server checks every layout with the engine's own validator.
// The built-in layouts (the templates' own) are listed read only; an admin may copy one into a layout of the brand's own, on the
// built-in poster or editorial page, where blocks sit at pixel rectangles and the page places its own logo and footer.
import { useMemo, useState } from 'react';
import { Braces, ChevronDown, ChevronRight, Copy, Pencil, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../api';
import { useDocumentTitle, useLoad } from '../../hooks';
import { errorMessage } from '../../lib/errors';
import { BusyButton, ConfirmAction, EmptyBlock, ErrorBlock, Hint, MoreMenu, SelectField, SwitchField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { LayoutSketch } from './LayoutSketch';
import { isBuiltPage } from './layout-model';
import { type BuiltinLayout, type Catalogue, type LayoutsResponse, type StoredLayout } from './layout-types';
import { PAGE_WORD, sizeName } from './layouts/words';
import { SettingsPage } from './section';

// ---- the page ----

const SKETCH = 'mx-auto w-full max-w-40';
const sizesText = (sizes: string[]) => sizes.map(sizeName).join(', ');

function LayoutCard({ item, catalogue, onEdit, onToggle, onCopy, onRemove }: { item: StoredLayout; catalogue: Catalogue; onEdit: () => void; onToggle: (v: boolean) => Promise<void>; onCopy: () => void; onRemove: () => void }) {
  const [busy, setBusy] = useState(false);
  const sizes = Object.keys(item.definition.canvas ?? {});
  const toggle = async (v: boolean) => { setBusy(true); try { await onToggle(v); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } };
  const about = [item.definition.description, `Fields: ${Object.keys(item.definition.fields ?? {}).join(', ')}`, `Id: ${item.slug}`].filter(Boolean).join(' ');
  return (
    <li className="flex min-w-0 flex-col gap-2.5 rounded-lg border bg-card p-3">
      <div className={SKETCH}><LayoutSketch layout={item.definition} size={sizes.includes('feed') ? 'feed' : sizes[0]} catalogue={catalogue} showGrid={false} /></div>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1"><h3 className="truncate text-[13.5px] font-medium">{item.name}</h3><Hint about={item.name}>{about}</Hint></div>
          <p className="truncate text-[12.5px] text-muted-foreground">{[sizesText(sizes), isBuiltPage(item.definition) ? PAGE_WORD[item.definition.page!] ?? item.definition.page : ''].filter(Boolean).join(' · ')}</p>
        </div>
        <MoreMenu items={[{ label: 'Duplicate', onSelect: onCopy }, { label: 'Remove', tone: 'danger', onSelect: onRemove }]} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <SwitchField label={item.enabled ? 'In use' : 'Not in use'} hint="The AI may use layouts that are in use" checked={item.enabled} disabled={busy} onCheckedChange={(v) => void toggle(v)} />
        <Button size="sm" variant="outline" onClick={onEdit}><Pencil aria-hidden="true" /> Edit</Button>
      </div>
    </li>
  );
}

// A built-in layout: read only. Its sketch, what it is for, and a copy to change when a brand's layout may use what it uses (else
// why not). How a post names it, and its JSON, are under Advanced.
function BuiltinCard({ item, catalogue, canCopy, onCopy }: { item: BuiltinLayout; catalogue: Catalogue; canCopy: boolean; onCopy: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [json, setJson] = useState(false);
  const l = item.definition, sizes = Object.keys(l.canvas ?? {});
  const about = [l.description, `Fields: ${Object.keys(l.fields ?? {}).join(', ')}`, !item.copyable && item.why ? `This layout cannot be copied into one of your own: ${item.why}.` : ''].filter(Boolean).join(' ');
  return (
    <li className="flex min-w-0 flex-col gap-2.5 rounded-lg border bg-card p-3">
      <div className={SKETCH}><LayoutSketch layout={l} size={sizes.includes('feed') ? 'feed' : sizes[0]} catalogue={catalogue} showGrid={false} /></div>
      <div className="min-w-0">
        <div className="flex items-center gap-1"><h3 className="truncate text-[13.5px] font-medium">{l.name}</h3><Hint about={l.name}>{about}</Hint></div>
        <p className="truncate text-[12.5px] text-muted-foreground">{[sizesText(sizes), PAGE_WORD[l.page ?? 'grid'] ?? l.page].filter(Boolean).join(' · ')}</p>
      </div>
      {item.copyable && (
        <div>
          <BusyButton size="sm" variant="outline" loading={busy} disabled={!canCopy}
            onClick={async () => { setBusy(true); try { await onCopy(); } catch (e) { toast.error(errorMessage(e)); setBusy(false); } }}>
            <Copy aria-hidden="true" /> Duplicate to edit
          </BusyButton>
        </div>
      )}
      <details className="mt-auto text-[13px]" onToggle={(e) => { if (!e.currentTarget.open) setJson(false); }}>
        <summary className="cursor-pointer text-muted-foreground">Advanced</summary>
        <div className="mt-2 flex flex-col gap-2">
          <p className="font-mono text-[12px] text-muted-foreground">{'{ "template": "'}{item.template}{'" }'}{item.variant ? `, when ${item.variant}` : ''}</p>
          <div><Button size="sm" variant="ghost" aria-expanded={json} onClick={() => setJson(!json)}><Braces aria-hidden="true" /> {json ? 'Hide' : 'Show'} JSON</Button></div>
          {json && <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11.5px] leading-snug">{JSON.stringify(l, null, 2)}</pre>}
        </div>
      </details>
    </li>
  );
}

export function LayoutsPage() {
  useDocumentTitle('Layouts');
  const navigate = useNavigate();
  const list = useLoad(() => api.get<LayoutsResponse>('/api/settings/layouts'), []);
  const [start, setStart] = useState('blank');
  const [removing, setRemoving] = useState<StoredLayout | null>(null);
  const [showBuiltins, setShowBuiltins] = useState(false);
  const [search, setSearch] = useState('');
  const data = list.data;
  const items = data?.layouts ?? [];
  const starter = useMemo(() => data?.starters.find((s) => s.id === start) ?? null, [data, start]);
  const builtins = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.builtins ?? []).filter((b) => !q || [b.definition.name, b.definition.description ?? '', b.id, b.template].some((t) => t.toLowerCase().includes(q)));
  }, [data, search]);

  const replace = (l: StoredLayout) => list.setData((d) => (d ? { ...d, layouts: d.layouts.some((x) => x.id === l.id) ? d.layouts.map((x) => (x.id === l.id ? l : x)) : [...d.layouts, l] } : d));
  async function copyBuiltin(b: BuiltinLayout) {
    const { layout } = await api.post<{ layout: StoredLayout }>('/api/settings/layouts', { builtin: b.id });
    toast.success(`Copied as ${layout.slug}; it is not in use until you switch it on`);
    navigate(`/settings/layouts/${layout.id}`);
  }
  const room = !!data && items.length < data.max;

  return (
    <SettingsPage title="Layouts">
      {list.error && <ErrorBlock message={list.error} onRetry={() => void list.reload()} />}
      {list.loading && !data && <div className="flex flex-col gap-3"><Skeleton className="h-16" /><Skeleton className="h-40" /></div>}
      {data && (
        <>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <SelectField className="min-w-60 flex-1 sm:max-w-md" label="Start from" value={start} onValueChange={setStart}
              options={[{ value: 'blank', label: 'A blank layout' }, ...data.starters.map((s) => ({ value: s.id, label: `${s.name} (like the built-in ${s.id} page)` }))]}
              hint={starter?.description} />
            <Button disabled={!room} onClick={() => navigate(start === 'blank' ? '/settings/layouts/new' : `/settings/layouts/new?from=${encodeURIComponent(start)}`)}><Plus aria-hidden="true" /> New layout</Button>
            <span className="flex h-8 items-center gap-1 text-[12.5px] text-muted-foreground">
              {items.length} of {data.max} layouts
              <Hint about="Layouts">Your own page designs: blocks placed on a grid, made in your brand's look and checked like the built-in layouts. The AI may use the layouts that are in use. A design uses one as {'{ "template": "layout", "layout": "<id>" }'} with the layout's fields.</Hint>
            </span>
          </div>
          {items.length === 0
            ? <EmptyBlock title="No layouts yet">Start from a blank layout or one like a built-in page, change it, preview it with your brand and add it.</EmptyBlock>
            : <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((item) => (
              <LayoutCard key={item.id} item={item} catalogue={data.catalogue}
                onEdit={() => navigate(`/settings/layouts/${item.id}`)}
                onToggle={async (v) => replace((await api.patch<{ layout: StoredLayout }>(`/api/settings/layouts/${item.id}`, { enabled: v })).layout)}
                onCopy={() => navigate(`/settings/layouts/new?duplicate=${encodeURIComponent(item.id)}`)}
                onRemove={() => setRemoving(item)} />
            ))}</ul>}
          <section className="flex flex-col gap-3 border-t pt-4" aria-labelledby="builtin-layouts">
            <div className="flex items-center gap-1.5">
              <button type="button" aria-expanded={showBuiltins} onClick={() => setShowBuiltins(!showBuiltins)}
                className="flex items-center gap-2 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                {showBuiltins ? <ChevronDown className="size-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="size-4 shrink-0" aria-hidden="true" />}
                <span id="builtin-layouts" className="text-sm font-semibold">Built-in layouts <span className="font-normal text-muted-foreground">({data.builtins.length}, read only)</span></span>
              </button>
              <Hint about="Built-in layouts">The layouts Vesk comes with. Duplicate one to start a layout of your own from it, with the same blocks in the same places. A copy leaves out what reads a built-in layout's own settings (the headline size and alignment a design gives, the phone's and photo's positions, the pills, a desktop window's frame and tilt): set those in the copy itself. Page covers are not post images and are not listed.</Hint>
            </div>
            {showBuiltins && (
              <>
                <div className="relative max-w-sm">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input aria-label="Search the built-in layouts" type="search" placeholder="Search by name or what it is for" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                {builtins.length === 0
                  ? <p className="text-[13px] text-muted-foreground">No built-in layout matches that.</p>
                  : <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{builtins.map((b) => <BuiltinCard key={b.id} item={b} catalogue={data.catalogue} canCopy={room} onCopy={() => copyBuiltin(b)} />)}</ul>}
              </>
            )}
          </section>
        </>
      )}
      <ConfirmAction open={!!removing} danger title="Remove this layout?" confirmLabel="Remove"
        message={<>The layout <strong>{removing?.name}</strong> ({removing?.slug}) is removed. Posts that use it keep it: it cannot be removed while one does.</>}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          await api.delete(`/api/settings/layouts/${removing!.id}`);
          list.setData((d) => (d ? { ...d, layouts: d.layouts.filter((x) => x.id !== removing!.id) } : d));
          setRemoving(null);
          toast.success('Layout removed');
        }} />
    </SettingsPage>
  );
}
