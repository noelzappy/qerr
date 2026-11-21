// Settings, Layouts: the brand's own compositions. A layout is blocks (a headline, a photo, a colour panel ...) placed in slots on a
// grid or at pixel rectangles, with options from fixed lists; the engine draws it with the brand's look and checks every image like
// the built-in pages. People start from a blank layout or a starting point, edit it in the layout editor (LayoutEditor.tsx: every
// setting a layout can have, conditions and page-colour cases included, with a sketch, the engine's verdict and a real preview) or
// in its JSON view, and save. The server checks every layout with the engine's own validator.
// The built-in layouts (the templates' own) are listed read only; an admin may copy one into a layout of the brand's own, on the
// built-in poster or editorial page, where blocks sit at pixel rectangles and the page places its chrome.
import { useMemo, useState } from 'react';
import { Braces, Copy, LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { useDocumentTitle, useLoad } from '../../hooks';
import { errorMessage } from '../../lib/errors';
import { BusyButton, ConfirmAction, EmptyBlock, ErrorBlock, SelectField, ToneBadge } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { LayoutEditor, PAGE_WORD } from './LayoutEditor';
import { LayoutSketch } from './LayoutSketch';
import { isBuiltPage } from './layout-model';
import { blankLayout, type BuiltinLayout, type Catalogue, type Layout, type LayoutsResponse, type StoredLayout } from './layout-types';
import { SettingsPage } from './section';

// ---- the page ----

function LayoutCard({ item, catalogue, onEdit, onToggle, onCopy, onRemove }: { item: StoredLayout; catalogue: Catalogue; onEdit: () => void; onToggle: (v: boolean) => Promise<void>; onCopy: () => Promise<void>; onRemove: () => void }) {
  const [busy, setBusy] = useState('');
  const sizes = Object.keys(item.definition.canvas ?? {});
  const run = (what: string, fn: () => Promise<void>) => async () => { setBusy(what); try { await fn(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(''); } };
  return (
    <li className="grid gap-4 rounded-lg border bg-card p-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <LayoutSketch layout={item.definition} size={sizes.includes('feed') ? 'feed' : sizes[0]} catalogue={catalogue} showGrid={false} />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-medium">{item.name}</h3>
            <p className="font-mono text-[12px] text-muted-foreground">{item.slug}</p>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={item.enabled} disabled={busy === 'toggle'} onCheckedChange={(v) => void run('toggle', () => onToggle(v))()} aria-label={`Posts and the AI can use ${item.name}`} />
            {item.enabled ? 'In use' : 'Off'}
          </label>
        </div>
        {item.definition.description && <p className="text-[13px] text-muted-foreground">{item.definition.description}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          {sizes.map((z) => <ToneBadge key={z} tone="quiet">{z}</ToneBadge>)}
          {isBuiltPage(item.definition) && <ToneBadge tone="quiet">{PAGE_WORD[item.definition.page!] ?? item.definition.page}</ToneBadge>}
          <span className="text-[12px] text-muted-foreground">Fields: {Object.keys(item.definition.fields ?? {}).join(', ')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}><Pencil aria-hidden="true" /> Edit</Button>
          <BusyButton size="sm" variant="ghost" loading={busy === 'copy'} onClick={() => void run('copy', onCopy)()}><Copy aria-hidden="true" /> Duplicate</BusyButton>
          <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 aria-hidden="true" /> Remove</Button>
        </div>
      </div>
    </li>
  );
}

// A built-in layout: read only. Its sketch, what it is for, the variant of its template it draws, its fields; a copy to change, when a
// brand's layout may use what it uses (else why not); and its JSON to read.
function BuiltinCard({ item, catalogue, canCopy, onCopy }: { item: BuiltinLayout; catalogue: Catalogue; canCopy: boolean; onCopy: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [json, setJson] = useState(false);
  const l = item.definition, sizes = Object.keys(l.canvas ?? {});
  return (
    <li className="grid gap-4 rounded-lg border bg-card p-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <LayoutSketch layout={l} size={sizes.includes('feed') ? 'feed' : sizes[0]} catalogue={catalogue} showGrid={false} />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-medium">{l.name}</h3>
            <p className="font-mono text-[12px] text-muted-foreground">{'{ "template": "'}{item.template}{'" }'}{item.variant ? `, when ${item.variant}` : ''}</p>
          </div>
          <ToneBadge tone="info">Built-in</ToneBadge>
        </div>
        {l.description && <p className="text-[13px] text-muted-foreground">{l.description}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          {sizes.map((z) => <ToneBadge key={z} tone="quiet">{z}</ToneBadge>)}
          <ToneBadge tone="quiet">{PAGE_WORD[l.page ?? 'grid'] ?? l.page}</ToneBadge>
          <span className="text-[12px] text-muted-foreground">Fields: {Object.keys(l.fields ?? {}).join(', ')}</span>
        </div>
        {!item.copyable && item.why && <p className="text-[12.5px] text-muted-foreground">Not copied into a layout of your own: {item.why}.</p>}
        <div className="flex flex-wrap gap-2">
          {item.copyable && (
            <BusyButton size="sm" variant="outline" loading={busy} disabled={!canCopy}
              onClick={async () => { setBusy(true); try { await onCopy(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>
              <Copy aria-hidden="true" /> Duplicate to edit
            </BusyButton>
          )}
          <Button size="sm" variant="ghost" aria-expanded={json} onClick={() => setJson(!json)}><Braces aria-hidden="true" /> {json ? 'Hide' : 'Show'} JSON</Button>
        </div>
        {json && <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11.5px] leading-snug">{JSON.stringify(l, null, 2)}</pre>}
      </div>
    </li>
  );
}

export function LayoutsPage() {
  useDocumentTitle('Layouts');
  const list = useLoad(() => api.get<LayoutsResponse>('/api/settings/layouts'), []);
  const [editing, setEditing] = useState<{ layout: Layout; stored: StoredLayout | null } | null>(null);
  const [start, setStart] = useState('blank');
  const [removing, setRemoving] = useState<StoredLayout | null>(null);
  const data = list.data;
  const items = data?.layouts ?? [];
  const starter = useMemo(() => data?.starters.find((s) => s.id === start) ?? null, [data, start]);

  const replace = (l: StoredLayout) => list.setData((d) => (d ? { ...d, layouts: d.layouts.some((x) => x.id === l.id) ? d.layouts.map((x) => (x.id === l.id ? l : x)) : [...d.layouts, l] } : d));
  async function copyBuiltin(b: BuiltinLayout) {
    const { layout } = await api.post<{ layout: StoredLayout }>('/api/settings/layouts', { builtin: b.id });
    replace(layout);
    toast.success(`Copied as ${layout.slug}; it is off until you switch it on`);
    setEditing({ layout: structuredClone(layout.definition), stored: layout });
  }
  const freeId = (base: string) => { let id = base, n = 2; while (items.some((x) => x.slug === id)) id = `${base}-${n++}`; return id; };
  function begin() {
    const base = starter ? structuredClone(starter) : blankLayout();
    setEditing({ layout: { ...base, id: freeId(base.id) }, stored: null });
  }

  return (
    <SettingsPage
      title="Layouts"
      description="Your own page compositions: blocks placed on a grid, drawn in your brand's look and checked like the built-in pages. A post uses one by its id; the AI is told about the layouts that are in use."
    >
      {list.error && <ErrorBlock message={list.error} onRetry={() => void list.reload()} />}
      {list.loading && !data && <div className="flex flex-col gap-3"><Skeleton className="h-16" /><Skeleton className="h-40" /></div>}
      {data && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-4">
            <SelectField className="min-w-60 flex-1" label="Start from" value={start} onValueChange={setStart}
              options={[{ value: 'blank', label: 'A blank layout' }, ...data.starters.map((s) => ({ value: s.id, label: `${s.name} (like the built-in ${s.id} page)` }))]}
              hint={starter?.description} />
            <Button disabled={items.length >= data.max} onClick={begin}><Plus aria-hidden="true" /> New layout</Button>
          </div>
          {items.length === 0
            ? <EmptyBlock title="No layouts yet">Start from a blank layout or one like a built-in page, change it, preview it with your brand and add it.</EmptyBlock>
            : <ul className="flex flex-col gap-3">{items.map((item) => (
              <LayoutCard key={item.id} item={item} catalogue={data.catalogue}
                onEdit={() => setEditing({ layout: structuredClone(item.definition), stored: item })}
                onToggle={async (v) => replace((await api.patch<{ layout: StoredLayout }>(`/api/settings/layouts/${item.id}`, { enabled: v })).layout)}
                onCopy={async () => { replace((await api.post<{ layout: StoredLayout }>(`/api/settings/layouts/${item.id}/duplicate`)).layout); toast.success('Copied; the copy is off until you switch it on'); }}
                onRemove={() => setRemoving(item)} />
            ))}</ul>}
          <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><LayoutTemplate className="size-4" aria-hidden="true" /> {items.length} of {data.max} layouts. A design block uses one as {'{ "template": "layout", "layout": "<id>" }'} with the layout's fields.</p>
          <section className="flex flex-col gap-3" aria-labelledby="builtin-layouts">
            <div>
              <h2 id="builtin-layouts" className="text-base font-semibold">Built-in layouts</h2>
              <p className="text-[13px] text-muted-foreground">
                The templates' own layouts, as a design names them ({'{ "template": "number" }'}): read only. Duplicate one to start a layout of
                your own from it, on the same page, with the same blocks and pixel positions. A copy leaves out what reads a template's own
                settings (the headline size and alignment a design gives, the phone's and photo's positions, the pills, a desktop window's
                frame and tilt): set those in the copy itself. Page covers are not post images and are not listed.
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {data.builtins.map((b) => <BuiltinCard key={b.id} item={b} catalogue={data.catalogue} canCopy={items.length < data.max} onCopy={() => copyBuiltin(b)} />)}
            </ul>
          </section>
          {editing && (
            <LayoutEditor initial={editing.layout} stored={editing.stored} catalogue={data.catalogue} onClose={() => setEditing(null)}
              onSaved={(l) => { replace(l); setEditing(null); }} />
          )}
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
