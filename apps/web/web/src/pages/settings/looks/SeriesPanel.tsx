// Settings, Looks, Series: the brand's named recurring series ("Myth vs fact", "Tip of the week"). A tab of Looks because a series is drawn
// by designs of the look in use: each says what kind of post it is, which of the look's designs draw it, an optional mark with its number
// ("Tip #{n}") and how often it comes back. The AI drafter plans the switched-on series into each batch and numbers them; the post editor
// puts a post in a series. Calls: routes/series.ts.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api';
import { useLoad } from '../../../hooks';
import { errorMessage } from '../../../lib/errors';
import { BusyButton, ConfirmAction, EmptyBlock, ErrorBlock, FormPanel, MoreMenu, Notice, SwitchField, TextField, ToneBadge } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FineTune } from '@/components/kit/fine-tune';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { MARK_PRESETS, markFor, markPreset, type MarkPreset } from './series-marks';
import { ChoiceRow } from '../../batches/editor/ChoiceRow';
import { POST_KIND_CATALOGUE } from '../../batches/editor/catalogue';
import { WEEKDAYS, seriesMark, seriesSummary, type SeriesInfo } from '../../batches/editor/series-model';

interface SeriesRow extends SeriesInfo { lookRef: string | null; firstNumber: number; posts: number; position: number }
interface SeriesAnswer {
  series: SeriesRow[];
  look: { ref: string; name: string; kinds: Record<string, Array<{ index: number; name: string; fields: string[] }>> } | null;
  limits: { perBrand: number; name: number; variants: number };
}
const B = '/api/settings/series';
export const seriesApi = {
  list: () => api.get<SeriesAnswer>(B),
  create: (body: Record<string, unknown>) => api.post<{ series: SeriesRow }>(B, body),
  update: (id: string, body: Record<string, unknown>) => api.patch<{ series: SeriesRow }>(`${B}/${id}`, body),
  remove: (id: string) => api.delete<{ ok: true }>(`${B}/${id}`),
};

interface Draft { name: string; kind: string; variants: number[]; mark: string; markField: 'label' | 'tag'; cadence: string; weekday: number | null; firstNumber: string }
const blank = (kind: string): Draft => ({ name: '', kind, variants: [], mark: '', markField: 'label', cadence: 'weekly', weekday: null, firstNumber: '1' });
const fromRow = (s: SeriesRow): Draft => ({ name: s.name, kind: s.kind, variants: s.designsInLook ? s.variants : [], mark: s.mark ?? '', markField: s.markField === 'tag' ? 'tag' : 'label', cadence: s.cadence, weekday: s.weekday, firstNumber: String(s.firstNumber) });
const CADENCES = [{ value: 'weekly', label: 'Every week' }, { value: 'fortnightly', label: 'Every two weeks' }, { value: 'monthly', label: 'Every month' }];

function SeriesForm({ id, look, draft, setDraft, onSubmit, error, lines }: {
  id: string; look: NonNullable<SeriesAnswer['look']>; draft: Draft; setDraft: (d: Draft) => void; onSubmit: (e: FormEvent) => void; error: string; lines: string[];
}) {
  // Custom stays chosen while a person edits a mark that happens to read like a preset
  const [custom, setCustom] = useState(() => markPreset(draft.mark) === 'custom');
  const preset: MarkPreset = custom ? 'custom' : markPreset(draft.mark);
  const designs = look.kinds[draft.kind] ?? [];
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const shows = (field: string) => (draft.variants.length ? designs.filter((d) => draft.variants.includes(d.index)) : designs).filter((d) => !d.fields.includes(field));
  const blind = draft.mark.trim() ? shows(draft.markField) : [];
  const first = Number(draft.firstNumber);
  return (
    <form id={id} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <TextField label="Name" value={draft.name} maxLength={40} placeholder="Tip of the week" onChange={(e) => set('name', e.target.value)} />
      <ChoiceRow legend="Kind of post" value={draft.kind}
        choices={POST_KIND_CATALOGUE.filter((k) => look.kinds[k.value]?.length).map((k) => ({ value: k.value, label: k.name }))}
        hint={POST_KIND_CATALOGUE.find((k) => k.value === draft.kind)?.purpose}
        onChange={(v) => setDraft({ ...draft, kind: String(v), variants: [] })} />
      {designs.length > 1 && (
        <ChoiceRow multiple legend="Designs" value={draft.variants}
          choices={designs.map((d) => ({ value: d.index, label: d.name }))}
          hint={draft.variants.length ? `Posts of this series take these ${look.name} designs in turn.` : `None chosen: any ${look.name} design of this kind. Choose up to 3 to keep the series recognisable.`}
          onChange={(v) => set('variants', (v as number[]).slice(0, 3).sort((a, b) => a - b))} />
      )}
      <div className="flex flex-col gap-2">
        <ChoiceRow legend="Mark" value={preset}
          choices={[...MARK_PRESETS.map((p) => ({ value: p.id as MarkPreset, label: p.label })), { value: 'custom' as MarkPreset, label: 'Custom' }]}
          onChange={(v) => { const id = v as MarkPreset; setCustom(id === 'custom'); set('mark', markFor(id, draft.mark)); }} />
        {preset === 'custom' && (
          <TextField label="Your mark" value={draft.mark} maxLength={40} placeholder="Myth vs fact {n}"
            hint="Shown on every post of the series. Write {n} where the number goes, or leave it out for a fixed line such as Myth vs fact."
            onChange={(e) => set('mark', e.target.value)} />
        )}
        {draft.mark.trim() && <p className="text-[13px]">Reads: <span className="font-medium">{seriesMark(draft.mark.trim(), Number.isInteger(first) && first > 0 ? first : 1)}</span></p>}
        {blind.length > 0 && <p className="text-[12.5px] text-warning-foreground">{blind.map((d) => d.name).join(', ')} {blind.length === 1 ? 'does' : 'do'} not show a {draft.markField === 'tag' ? 'sticker' : 'label'}; choose designs that show it, or put the mark in the other place under Fine-tune.</p>}
      </div>
      <ChoiceRow legend="How often" value={draft.cadence} choices={CADENCES} onChange={(v) => set('cadence', String(v))} />
      <ChoiceRow legend={draft.cadence === 'monthly' ? 'On the first' : 'On'} value={draft.weekday ?? -1}
        choices={[{ value: -1, label: 'Any day' }, ...WEEKDAYS.map((d, i) => ({ value: i, label: d.slice(0, 3), title: d }))]}
        hint={draft.weekday === null ? 'From the first day of each batch.' : undefined}
        onChange={(v) => set('weekday', v === -1 ? null : Number(v))} />
      <FineTune summary={`Mark in the ${draft.markField === 'tag' ? 'sticker' : 'label'}, numbers from ${draft.firstNumber || 1}`}>
        <ChoiceRow legend="Mark goes in" value={draft.markField} choices={[{ value: 'label', label: 'Label' }, { value: 'tag', label: 'Sticker text' }]} onChange={(v) => set('markField', v === 'tag' ? 'tag' : 'label')} />
        <TextField label="First number" type="number" min={1} max={9999} inputMode="numeric" value={draft.firstNumber}
          hint="For a series that ran before. Later numbers follow the posts that carry the series." onChange={(e) => set('firstNumber', e.target.value)} />
      </FineTune>
      {error && <Notice tone="warn">{error}{lines.length > 1 && <ul className="mt-1 list-disc pl-5">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}</Notice>}
    </form>
  );
}

export function SeriesPanel() {
  const data = useLoad(() => seriesApi.list(), []);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft; initial: Draft } | null>(null);
  const open = (id: string | null, draft: Draft) => { setError(''); setLines([]); setEditing({ id, draft, initial: draft }); };
  const dirty = !!editing && JSON.stringify(editing.draft) !== JSON.stringify(editing.initial);
  useUnsavedGuard(dirty);
  const requestClose = () => confirmDiscard(dirty && !busy, () => setEditing(null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<SeriesRow | null>(null);
  const d = data.data;

  if (data.error) return <ErrorBlock message={data.error} onRetry={() => void data.reload()} />;
  if (!d) return <div className="flex flex-col gap-3"><Skeleton className="h-16 rounded-lg" /><Skeleton className="h-16 rounded-lg" /></div>;
  if (!d.look) return <EmptyBlock title="Series need a look" action={<Button asChild variant="outline"><Link to="/settings/looks">Choose a look</Link></Button>}>A series is drawn by designs of the look in use. Choose a look first.</EmptyBlock>;
  const look = d.look;
  const firstKind = Object.keys(look.kinds).find((k) => look.kinds[k]!.length) ?? 'statement';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const x = editing.draft;
    const n = Number(x.firstNumber);
    if (!x.name.trim()) { setError('Give the series a name.'); setLines([]); return; }
    if (!Number.isInteger(n) || n < 1 || n > 9999) { setError('The first number is a whole number from 1 to 9999.'); setLines([]); return; }
    const body = { name: x.name.trim(), kind: x.kind, variants: x.variants, mark: x.mark.trim() || null, markField: x.markField, cadence: x.cadence, weekday: x.weekday, firstNumber: n };
    setBusy(true); setError(''); setLines([]);
    try {
      if (editing.id) await seriesApi.update(editing.id, body); else await seriesApi.create(body);
      toast.success(editing.id ? 'Series saved.' : 'Series added. New AI drafts plan it in.');
      setEditing(null);
      void data.reload();
    } catch (err) {
      setError(errorMessage(err));
      const det = (err as { details?: unknown }).details;
      setLines(Array.isArray(det) ? det.map(String) : []);
    } finally { setBusy(false); }
  }
  async function toggle(s: SeriesRow, enabled: boolean) {
    try { await seriesApi.update(s.id, { enabled }); void data.reload(); } catch (err) { toast.error(errorMessage(err)); }
  }

  return (
    <section aria-labelledby="series-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="series-title" className="text-sm font-semibold">Series</h2>
          <p className="text-[13px] text-muted-foreground">Formats that come back, such as Tip of the week. AI drafts plan the ones that are on into each batch and number them. Drawn with {look.name}.</p>
        </div>
        <Button size="sm" disabled={d.series.length >= d.limits.perBrand} onClick={() => open(null, blank(firstKind))}><Plus aria-hidden="true" />Add a series</Button>
      </div>
      {d.series.length === 0 ? <EmptyBlock title="No series yet">Add one to make a format come back at a steady pace, numbered.</EmptyBlock> : (
        <ul className="divide-y rounded-lg border">
          {d.series.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex items-center gap-2">
                  <button type="button" className="min-w-0 truncate text-left text-[14px] font-semibold underline-offset-2 hover:underline" onClick={() => open(s.id, fromRow(s))}>{s.name}</button>
                  {s.problems.length > 0 ? <ToneBadge tone="warn" dot>Needs a look</ToneBadge> : !s.designsInLook ? <ToneBadge tone="warn" dot>Designs from another look</ToneBadge> : null}
                </div>
                <p className="truncate text-[12.5px] text-muted-foreground">{[seriesSummary(s), s.posts ? `${s.posts} post${s.posts === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</p>
                {s.problems[0] && <p className="text-[12.5px] text-warning-foreground [overflow-wrap:anywhere]">{s.problems[0]}</p>}
              </div>
              <SwitchField label="On" checked={s.enabled} onCheckedChange={(c) => void toggle(s, c)} />
              <MoreMenu items={[
                { label: 'Edit', onSelect: () => open(s.id, fromRow(s)) },
                { label: 'Delete', tone: 'danger', onSelect: () => setDeleting(s) },
              ]} />
            </li>
          ))}
        </ul>
      )}

      <FormPanel open={!!editing} variant="dialog" size="md" onClose={requestClose} busy={busy} title={editing?.id ? 'Edit series' : 'Add a series'}
        footer={<><Button type="button" variant="outline" className="max-sm:min-h-11" onClick={requestClose} disabled={busy}>Cancel</Button><BusyButton type="submit" form="series-form" loading={busy}>Save</BusyButton></>}>
        {editing && <SeriesForm id="series-form" look={look} draft={editing.draft} setDraft={(draft) => setEditing({ ...editing, draft })} onSubmit={(e) => void save(e)} error={error} lines={lines} />}
      </FormPanel>
      <ConfirmAction
        open={!!deleting} danger title={deleting ? `Delete ${deleting.name}?` : ''} confirmLabel="Delete the series"
        message="Its posts keep their words and pictures; they are no longer part of a series. This cannot be undone."
        onConfirm={async () => { if (!deleting) return; await seriesApi.remove(deleting.id); setDeleting(null); toast.success('The series is deleted.'); void data.reload(); }}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
