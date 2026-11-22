// The Designs tab of a look: one group per kind of post, each design a compact row (name, what it is for, the fields it uses with
// their budgets, a status dot, On/Off, reorder, Edit (opens the design editor page) and a menu). "Add a design" copies one from a look we ship or one of the brand's
// own. A look in use is read only (the page says so once); the server refuses what the rules refuse and its reason is shown.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useLoad } from '../../../hooks';
import { errorMessage } from '../../../lib/errors';
import { BusyButton, ConfirmAction, ErrorBlock, FormPanel, LoadingBlock, MoreMenu, ToneBadge } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { addOptions, budgetsText, DESIGN_STATUS, designIndex, designStatus, groupByKind, kindName, kindOrder, movedPosition, type AddOption } from './look-model';
import type { Composition, LookCatalogue, LooksAnswer, OwnDetail } from './look-types';
import { lookApi } from './looks-api';

interface Props { look: OwnDetail; list: LooksAnswer; locked: boolean; onLook: (l: OwnDetail) => void }

function AddDesign({ kind, look, list, onClose, onLook }: { kind: string; look: OwnDetail; list: LooksAnswer; onClose: () => void; onLook: (l: OwnDetail) => void }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const refs = [...list.shipped.map((l) => l.ref), ...list.own.map((l) => l.ref)];
  // The designs of every look, by name, so a person can choose one ("From Retail: Frame pop").
  const sources = useLoad(async () => Promise.all(refs.map(async (ref) => {
    const d = await lookApi.get(ref);
    const designs = d.source === 'shipped'
      ? (d.definition.compositions as Array<{ kind: string; name: string; describe?: string }>)
      : [...d.compositions].sort((a, b) => a.position - b.position).map((c) => ({ kind: c.kind, name: c.name, describe: String((c.definition as { describe?: unknown }).describe ?? '') }));
    return { ref, name: d.name, designs };
  })), [refs.join(',')]);
  const full = look.compositions.filter((c) => c.kind === kind).length >= list.limits.perKind;
  const options: AddOption[] = addOptions(kind, sources.data ?? []);
  async function add(o: AddOption) {
    const key = `${o.source}:${o.index}`;
    setBusy(key); setError('');
    try { onLook(await lookApi.addDesign(look.slug, o.source, o.kind, o.index)); toast.success(`Added ${o.name}.`); onClose(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(''); }
  }
  const bySource = options.reduce<Record<string, AddOption[]>>((m, o) => { (m[o.source] ??= []).push(o); return m; }, {});
  return (
    <FormPanel open variant="dialog" size="md" title={`Add a ${kindName(kind).toLowerCase()} design`} onClose={onClose} busy={!!busy}
      footer={<Button type="button" variant="outline" onClick={onClose}>Close</Button>}>
      <div className="flex flex-col gap-3">
        {full && <p className="text-[13px] text-muted-foreground" role="status">This look already has {list.limits.perKind} {kindName(kind).toLowerCase()} designs, the most it can have. Remove one to add another.</p>}
        {error && <p className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
        {sources.error ? <ErrorBlock message={sources.error} onRetry={() => void sources.reload()} />
          : sources.loading && !sources.data ? <LoadingBlock label="Loading designs" />
          : options.length === 0 ? <p className="text-[13px] text-muted-foreground">No other look has a {kindName(kind).toLowerCase()} design.</p>
          : Object.entries(bySource).map(([source, opts]) => (
            <section key={source} aria-label={`From ${opts[0]!.sourceName}`}>
              <h3 className="mb-1 text-[13px] font-semibold">From {opts[0]!.sourceName}</h3>
              <ul className="divide-y rounded-md border">
                {opts.map((o) => (
                  <li key={`${o.source}:${o.index}`} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-medium">{o.name}</div>{o.describe && <div className="line-clamp-2 text-[12.5px] text-muted-foreground">{o.describe}</div>}</div>
                    <BusyButton size="sm" variant="outline" loading={busy === `${o.source}:${o.index}`} disabled={full || !!busy} onClick={() => void add(o)}>Add</BusyButton>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </FormPanel>
  );
}

function Row({ c, index, designs, look, catalogue, locked, onLook, onEdit }: { c: Composition; index: number; designs: Composition[]; look: OwnDetail; catalogue: LookCatalogue; locked: boolean; onLook: (l: OwnDetail) => void; onEdit: () => void }) {
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const st = designStatus(c);
  const up = movedPosition(designs, c.id, -1), down = movedPosition(designs, c.id, 1);
  async function run(fn: () => Promise<OwnDetail>, ok?: string) {
    setBusy(true);
    try { onLook(await fn()); if (ok) toast.success(ok); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  const describe = String((c.definition as { describe?: unknown }).describe ?? '');
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
      <div className="flex flex-col">
        <Button type="button" variant="ghost" size="icon" className="size-6 max-sm:size-11" aria-label={`Move ${c.name} up`} disabled={locked || busy || up === null} onClick={() => void run(() => lookApi.moveDesign(look.slug, c.id, up!))}><ArrowUp aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" size="icon" className="size-6 max-sm:size-11" aria-label={`Move ${c.name} down`} disabled={locked || busy || down === null} onClick={() => void run(() => lookApi.moveDesign(look.slug, c.id, down!))}><ArrowDown aria-hidden="true" /></Button>
      </div>
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex items-center gap-2"><span className="min-w-0 truncate text-[14px] font-semibold">{c.name}</span><ToneBadge tone={DESIGN_STATUS[st].tone} dot>{DESIGN_STATUS[st].label}</ToneBadge></div>
        {describe && <p className="truncate text-[12.5px] text-muted-foreground" title={describe}>{describe}</p>}
        <p className="text-[12.5px] text-muted-foreground">{budgetsText(c.definition, catalogue)}</p>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[13px]">
          <Switch checked={c.enabled} disabled={locked || busy} aria-label={`${c.name}: ${c.enabled ? 'on' : 'off'}`} onCheckedChange={(v) => void run(() => lookApi.enableDesign(look.slug, c.id, v))} />
          <span className="w-6 text-muted-foreground">{c.enabled ? 'On' : 'Off'}</span>
        </label>
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>Edit</Button>
        <MoreMenu items={[
          { label: 'Duplicate within this look', disabled: locked, onSelect: () => void run(() => lookApi.addDesign(look.slug, look.ref, c.kind, index), `Duplicated ${c.name}.`) },
          { label: 'Remove', tone: 'danger', disabled: locked, onSelect: () => setRemoving(true) },
        ]} />
      </div>
      <ConfirmAction open={removing} danger title={`Remove ${c.name}?`} confirmLabel="Remove the design"
        message="The design is removed from this look. A look keeps at least one design of every kind it has, so the last of a kind cannot be removed: switch it off instead."
        onConfirm={async () => { onLook(await lookApi.removeDesign(look.slug, c.id)); setRemoving(false); }} onCancel={() => setRemoving(false)} />
    </li>
  );
}

export function DesignsTab({ look, list, locked, onLook }: Props) {
  const [adding, setAdding] = useState<string | null>(null);
  const navigate = useNavigate();
  const cat = list.catalogue;
  const groups = groupByKind(look.compositions, kindOrder(cat));
  const withDesigns = new Set(groups.map((g) => g.kind));
  const empty = kindOrder(cat).filter((k) => !withDesigns.has(k));
  return (
    <div className="flex flex-col gap-6">
      {[...groups.map((g) => g.kind), ...empty].map((kind) => {
        const designs = groups.find((g) => g.kind === kind)?.designs ?? [];
        const full = designs.length >= list.limits.perKind;
        return (
          <section key={kind} aria-labelledby={`kind-${kind}`} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 id={`kind-${kind}`} className="text-sm font-semibold">{kindName(kind)}</h2>
              <Button type="button" size="sm" variant="outline" disabled={locked || full} onClick={() => setAdding(kind)}><Plus aria-hidden="true" /> Add a design</Button>
            </div>
            {full && !locked && <p className="-mt-1 text-[12.5px] text-muted-foreground">Up to {list.limits.perKind} designs for each kind.</p>}
            {designs.length === 0 ? <p className="text-[13px] text-muted-foreground">No designs: posts of this kind cannot be made with this look.</p> : (
              <ul className="divide-y rounded-lg border">
                {designs.map((c) => <Row key={c.id} c={c} index={designIndex(look.compositions, c)} designs={designs} look={look} catalogue={cat} locked={locked} onLook={onLook} onEdit={() => navigate(`/settings/looks/${look.slug}/designs/${c.id}`)} />)}
              </ul>
            )}
          </section>
        );
      })}
      {adding && <AddDesign kind={adding} look={look} list={list} onClose={() => setAdding(null)} onLook={onLook} />}
    </div>
  );
}
