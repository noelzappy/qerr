// Brand and look, Voice and spelling, and Advanced.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../../api';
import { errorMessage } from '../../../lib/errors';
import { BusyButton, ConfirmAction, FormProblem, Hint, SwitchField, TextAreaField, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { BrandView } from '../brand-types';
import { Section } from '../section';
import { FileField } from './fields';
import { parseCurrencyPattern } from './currency';
import type { BrandCtx } from './model';
import { BrandSettingsSiteSuggest } from '@/components/suggest/BrandSiteSuggest';

const MAX_SPELLINGS = 30;

export function VoiceSection({ ctx }: { ctx: BrandCtx }) {
  const { s, set, fields } = ctx;
  const change = (i: number, patch: Partial<{ wrong: string; right: string }>) => ctx.update((cur) => ({ ...cur, spellings: cur.spellings.map((y, j) => (j === i ? { ...y, ...patch } : y)) }));
  function remove(i: number) {
    const gone = s.spellings[i]!;
    ctx.update((cur) => ({ ...cur, spellings: cur.spellings.filter((_, j) => j !== i) }));
    toast('Removed a spelling.', {
      duration: 10000,
      action: { label: 'Undo', onClick: () => ctx.update((cur) => ({ ...cur, spellings: [...cur.spellings.slice(0, i), gone, ...cur.spellings.slice(i)] })) },
    });
  }
  return (
    <Section id="voice" title="Voice and spelling" description="In your own words. The AI reads the voice and the visual direction every time it drafts or rewrites a post. Design references add to the visual direction.">
      <BrandSettingsSiteSuggest ctx={ctx} />
      <TextAreaField label="Voice" optional hint="Who you talk to, the tone, words you use and avoid. For example: Warm and plain. Short sentences. We say 'members', never 'customers'." rows={5} maxLength={4000} value={s.voice} onChange={(e) => set('voice', e.target.value)} error={fields.voice} />
      <SwitchField label="Emoji in post images" hint="Off: the words on post images are words only, and an emoji is refused. On: each text on an image may carry up to three standard emoji, and the AI may use them. Never in the brand name or a caption." checked={s.emoji} onCheckedChange={(v) => set('emoji', v)} />
      <TextAreaField label="Visual direction" optional hint="How the images should feel. For example: Calm pages with lots of space, one strong photo, numbers large; avoid busy collages." rows={5} maxLength={4000} value={s.visualDirection} onChange={(e) => set('visualDirection', e.target.value)} error={fields.visualDirection} />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Label>Names to spell exactly</Label>
            <Hint about="Names to spell exactly">A wrong form and how it should be written. The checks correct it in every post.</Hint>
          </div>
          <Button type="button" variant="ghost" size="sm" disabled={s.spellings.length >= MAX_SPELLINGS} onClick={() => set('spellings', [...s.spellings, { wrong: '', right: s.name }])}><Plus aria-hidden="true" /> Add a spelling</Button>
        </div>
        {s.spellings.length === 0 && <p className="text-[13px] text-muted-foreground">No spellings yet.</p>}
        {s.spellings.map((x, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
            <TextField label={<span className="sr-only">Written wrongly as</span>} placeholder="Written wrongly as" value={x.wrong} onChange={(e) => change(i, { wrong: e.target.value })} />
            <span className="hidden pb-2 text-muted-foreground sm:block" aria-hidden="true">→</span>
            <TextField label={<span className="sr-only">Should be written as</span>} placeholder="Should be written as" value={x.right} onChange={(e) => change(i, { right: e.target.value })} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove the spelling ${x.wrong || `number ${i + 1}`}`} onClick={() => remove(i)}><Trash2 aria-hidden="true" /></Button>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---- advanced ----

export function AdvancedSection({ ctx }: { ctx: BrandCtx }) {
  const { view, s, set, fields } = ctx;
  const oldPattern = !!s.money && parseCurrencyPattern(s.money.foreign) === null;
  return (
    <Section id="advanced" title="Advanced" description="For people who work with Qerr's brand files: brand.json (described in docs/design.md) and the dot map. Most teams never need this section.">
      <p className="text-[13px] text-muted-foreground">For people who work with Qerr's brand files. Everything here is saved straight away, not with the Save bar.</p>
      {oldPattern && s.money && (
        <div className="flex flex-col gap-2">
          <TextField
            label="Other currencies to flag, as a pattern" mono value={s.money.foreign} onChange={(e) => set('money', { ...s.money!, foreign: e.target.value })} error={fields['money.foreign']}
            hintMode="inline" hint="This brand's list is a more detailed rule than a list of words, so it is kept here as a pattern. Separate options with |. This field is saved with the Save bar, not straight away."
          />
        </div>
      )}
      <ImportPack key={`import-${view.updatedAt ?? ''}`} onSaved={ctx.applyView} />
      <AdvancedJson key={`json-${view.updatedAt ?? ''}`} view={view} onSaved={ctx.applyView} />
    </Section>
  );
}

function AdvancedJson({ view, onSaved }: { view: BrandView; onSaved: (v: BrandView) => void }) {
  const [advanced, setAdvanced] = useState(() => JSON.stringify(view.advanced ?? {}, null, 2));
  const [map, setMap] = useState(() => (view.map ? JSON.stringify(view.map) : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  async function save() {
    setBusy(true); setError(''); setLines([]);
    try {
      let a: unknown, m: unknown = null;
      try { a = JSON.parse(advanced || '{}'); } catch { throw new Error('The brand.json fragment is not valid JSON'); }
      try { m = map.trim() ? JSON.parse(map) : null; } catch { throw new Error('The map is not valid JSON'); }
      onSaved(await api.put<BrandView>('/api/settings/brand/advanced', { advanced: a, map: m }));
      toast.success('The Advanced settings are saved.');
    } catch (err) {
      setError(err instanceof ApiError ? errorMessage(err) : (err as Error).message);
      if (err instanceof ApiError && Array.isArray(err.details)) setLines((err.details as unknown[]).map((d) => (typeof d === 'string' ? d : JSON.stringify(d))));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="border-t pt-3">
      <summary className="cursor-pointer text-[13.5px] font-medium">Edit the brand.json fragment and the dot map</summary>
      <div className="mt-3 flex flex-col gap-3">
        <TextAreaField label="brand.json fragment" hint="Merged over what the other sections make; the logos and the fonts always come from uploads." mono rows={10} value={advanced} onChange={(e) => setAdvanced(e.target.value)} />
        <TextAreaField label="Dot map (map.json)" optional mono rows={4} value={map} onChange={(e) => setMap(e.target.value)} hint="Needed only for the map poster. Leave empty for none." />
        <FormProblem error={error} lines={lines} />
        <div><BusyButton variant="outline" loading={busy} onClick={() => void save()}>Save the Advanced settings</BusyButton></div>
      </div>
    </details>
  );
}

type PackKey = 'brand' | 'full' | 'mark' | 'map' | 'font';
const NO_FILES: Record<PackKey, File | null> = { brand: null, full: null, mark: null, map: null, font: null };

// A brand pack folder (brand.json, logos/logo-full.png, logos/logo-mark.png, optional map.json) moved in at once.
function ImportPack({ onSaved }: { onSaved: (v: BrandView) => void }) {
  const [files, setFiles] = useState<Record<PackKey, File | null>>(NO_FILES);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  async function go() {
    setBusy(true); setError(''); setLines([]);
    try {
      const form = new FormData();
      for (const [k, f] of Object.entries(files)) if (f) form.set(k, f, f.name);
      const next = await api.upload<BrandView & { notes?: string[] }>('/api/settings/brand/import', form);
      setConfirm(false);
      onSaved(next);
      toast.success('The brand pack is imported.', next.notes?.length ? { description: next.notes.join(' '), duration: 12000 } : undefined);
      setFiles(NO_FILES);
    } catch (err) {
      setConfirm(false);
      setError(errorMessage(err));
      if (err instanceof ApiError && Array.isArray(err.details)) setLines((err.details as unknown[]).map((d) => (typeof d === 'string' ? d : JSON.stringify(d))));
    } finally {
      setBusy(false);
    }
  }
  const row = (k: PackKey, label: string, accept: string, optional = false) => (
    <FileField key={k} label={<>{label}{optional && <span className="font-normal text-muted-foreground"> (optional)</span>}</>} accept={accept} buttonLabel={files[k] ? 'Choose another file' : 'Choose a file'} fileName={files[k]?.name} onFile={(f) => setFiles((cur) => ({ ...cur, [k]: f }))} />
  );
  return (
    <details className="border-t pt-3">
      <summary className="cursor-pointer text-[13.5px] font-medium">Import a brand pack</summary>
      <p className="mt-2 flex items-center gap-1 text-[13px] text-muted-foreground">
        Importing replaces the saved brand and logos.
        <Hint about="Import a brand pack">Choose the files of a brand pack folder (brand.json, its logos and an optional map.json, such as brands/demo in the repository). Its exact colours and rules are kept in the brand.json fragment, and the other sections are filled from it. Nothing is changed until you import.</Hint>
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {row('brand', 'brand.json', 'application/json,.json')}
        {row('map', 'map.json', 'application/json,.json', true)}
        {row('full', 'logos/logo-full.png', 'image/png')}
        {row('mark', 'logos/logo-mark.png', 'image/png')}
        {row('font', 'The headline and text font (.woff2)', '.woff2,font/woff2', true)}
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <FormProblem error={error} lines={lines} />
        <div><BusyButton variant="outline" disabled={!files.brand || !files.full || !files.mark} onClick={() => setConfirm(true)}>Import the pack</BusyButton></div>
      </div>
      <ConfirmAction
        open={confirm} title="Replace the saved brand?" confirmLabel="Import and replace" danger
        message="Importing replaces the saved brand and both logos with the ones in this pack, straight away. Changes on this page that are not saved are lost."
        onConfirm={go} onCancel={() => { if (!busy) setConfirm(false); }}
      />
    </details>
  );
}
