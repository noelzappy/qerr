// "New look" on the Looks page: a name (its address is derived from it) and where to start: from a look (a copy of a shipped look or one of
// the brand's own) or blank (the engine's starter: one plain design of every kind in the brand's own fonts and colours). The new look opens
// on its page, a draft until it is published.
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BusyButton, FormPanel, FormProblem, SegmentedField, SelectField, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { confirmDiscard, useUnsavedGuard, withoutGuard } from '@/hooks/use-unsaved-guard';
import { errorMessage } from '../../../lib/errors';
import type { LooksAnswer } from './look-types';
import { lookApi } from './looks-api';

// The address a name gives a look (the server makes it unique by adding -2, -3... when it is taken), as the server derives it.
export const slugOfName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34).replace(/-+$/g, '');

type Start = 'look' | 'blank';

export function NewLookDialog({ data, onClose }: { data: LooksAnswer; onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [start, setStart] = useState<Start>('blank');
  const looks = [...data.shipped, ...data.own];
  const [source, setSource] = useState(data.activeRef ?? looks[0]?.ref ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const max = data.catalogue.limits.name ?? 40;
  const dirty = name.trim() !== '';
  useUnsavedGuard(dirty);
  const slug = slugOfName(name);
  const nameProblem = name.length > max ? `A name is at most ${max} characters` : '';
  const full = data.own.length >= data.limits.looks;

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || nameProblem || full) return;
    setBusy(true); setError('');
    try {
      const look = start === 'blank' ? await lookApi.blank(name.trim()) : await lookApi.duplicate(source, name.trim());
      withoutGuard(() => navigate(`/settings/looks/${look.slug}`));
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  }

  return (
    <FormPanel open variant="dialog" size="sm" title="New look" busy={busy} onClose={() => confirmDiscard(dirty, onClose)}
      footer={<>
        <Button type="button" variant="outline" onClick={() => confirmDiscard(dirty, onClose)} disabled={busy}>Cancel</Button>
        <BusyButton type="submit" form="new-look" loading={busy} disabled={!name.trim() || !!nameProblem || full || (start === 'look' && !source)}>Create the look</BusyButton>
      </>}>
      <form id="new-look" onSubmit={(e) => void create(e)} className="flex flex-col gap-3" noValidate>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring campaign" maxLength={max + 10} required autoFocus error={nameProblem} />
        <p className="-mt-1.5 text-[12.5px] text-muted-foreground" aria-live="polite">{slug ? <>Its address: <span className="font-mono">/settings/looks/{slug}</span></> : 'Its address comes from the name.'}</p>
        <SegmentedField<Start> label="Start" value={start} onValueChange={setStart} fill
          options={[{ value: 'blank', label: 'Blank' }, { value: 'look', label: 'From a look' }]} />
        {start === 'blank'
          ? <p className="text-[13px] text-muted-foreground">One plain design of every kind in your brand&apos;s fonts and colours. Build it up in the design editor, or add designs from other looks.</p>
          : <SelectField label="Look to start from" value={source} onValueChange={setSource} options={looks.map((l) => ({ value: l.ref, label: l.source === 'shipped' ? `${l.name} (we ship it)` : l.name }))} />}
        {full && <p className="text-[13px] font-medium text-destructive" role="alert">You have {data.limits.looks} looks, the most you can keep. Delete one first.</p>}
        <FormProblem error={error} />
      </form>
    </FormPanel>
  );
}
