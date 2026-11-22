// "Rights" for a bulk action on pictures: the licence, whether people can be recognised and whether their consent is recorded,
// each left as it is unless changed. Applied through the same PATCH as the item page (bulk-rights.ts says what is sent).
import { useState, type FormEvent } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { SegmentedField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { choiceIsEmpty, KEEP_ALL, type RightsChoice } from './bulk-rights';

const LICENCE_OPTIONS: Array<{ value: RightsChoice['licence']; label: string; title?: string }> = [
  { value: 'keep', label: 'No change' },
  { value: 'own', label: 'Our own' },
  { value: 'licensed', label: 'Licensed', title: 'Licensed stock, with credit' },
  { value: 'rights_to_confirm', label: 'To confirm', title: 'Rights still to confirm' },
  { value: 'none', label: 'Not recorded' },
];
const YES_NO = [{ value: 'keep', label: 'No change' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] as const;

export function BulkRightsPopover({ disabled, count, onApply }: { disabled?: boolean; count: number; onApply: (choice: RightsChoice) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<RightsChoice>(KEEP_ALL);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof RightsChoice>(k: K, v: RightsChoice[K]) => { setChoice((c) => ({ ...c, [k]: v })); setError(''); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (choiceIsEmpty(choice)) { setError('Choose at least one change.'); return; }
    setBusy(true);
    try {
      await onApply(choice);
      setOpen(false);
      setChoice(KEEP_ALL);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={(o) => { if (!busy) { setOpen(o); if (!o) { setError(''); setChoice(KEEP_ALL); } } }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="max-sm:min-h-11" disabled={disabled}><ShieldCheck aria-hidden="true" />Rights</Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[min(26rem,calc(100vw-2rem))]">
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" aria-label="Set rights and consent">
          <p className="text-[12.5px] text-muted-foreground">Applied to the pictures among the {count} selected. Anything left on No change stays as it is.</p>
          <SegmentedField label="Licence or permission" options={LICENCE_OPTIONS} value={choice.licence} onValueChange={(v) => set('licence', v)} />
          <SegmentedField label="People can be recognised" options={[...YES_NO]} value={choice.people} onValueChange={(v) => set('people', v)} />
          <SegmentedField label="Their consent is recorded" options={[...YES_NO]} value={choice.consent} onValueChange={(v) => set('consent', v)}
            hintMode="inline" hint="Only when you hold written or recorded permission to use their image. Yes also marks people as shown." error={error} />
          <Button type="submit" className="max-sm:min-h-11" disabled={busy} aria-busy={busy || undefined}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}Apply
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
