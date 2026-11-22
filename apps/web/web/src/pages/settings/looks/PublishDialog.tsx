// Publish: checks every design that is switched on and marks the look Ready. The dialog lists each design's check; when one fails
// it says why and links to the design. Nothing changes what the brand draws until the look is used.
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../../api';
import { errorMessage } from '../../../lib/errors';
import { BusyButton, FormPanel, Notice } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { kindName } from './look-model';
import type { Composition, GateCheck, OwnDetail, Problem } from './look-types';
import { lookApi } from './looks-api';

// "statement/Stack" (the server's name for a design's check) as the design it is, when the look has it.
function designOf(name: string, comps: Composition[]): Composition | undefined {
  const [kind, ...rest] = name.split('/');
  return comps.find((c) => c.kind === kind && c.name === rest.join('/'));
}
const label = (name: string) => { const [k, ...r] = name.split('/'); return r.length ? `${kindName(k!)}: ${r.join('/')}` : name; };

export function PublishDialog({ look, onClose, onPublished }: { look: OwnDetail; onClose: () => void; onPublished: (l: OwnDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<GateCheck[] | null>(null);
  const [done, setDone] = useState(false);
  async function publish() {
    setBusy(true); setError(''); setRows(null);
    try {
      const next = await lookApi.publish(look.slug);
      setRows(next.gateRecord?.checks ?? []);
      setDone(true);
      onPublished(next);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && Array.isArray(e.details)) setRows((e.details as Problem[]).map((d) => ({ name: d.path, passed: false, message: d.message })));
    } finally { setBusy(false); }
  }
  return (
    <FormPanel open variant="dialog" size="md" title={`Publish ${look.name}`} onClose={onClose} busy={busy}
      footer={<>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{done ? 'Close' : 'Cancel'}</Button>
        {!done && <BusyButton loading={busy} onClick={() => void publish()}>Publish</BusyButton>}
      </>}>
      <div className="flex flex-col gap-3 text-[13.5px]">
        {!rows && !error && <p>Every design that is switched on is checked, then the look is marked Ready. It is not used for new images until you choose Use this look.</p>}
        {done && <Notice tone="good">The look is Ready.</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}
        {rows && rows.length > 0 && (
          <ul className="divide-y rounded-md border" aria-label="Checks by design">
            {rows.map((r, i) => {
              const comp = designOf(r.name, look.compositions);
              return (
                <li key={`${r.name}-${i}`} className="flex items-start gap-2.5 px-3 py-2">
                  {r.passed ? <Check className="mt-0.5 size-4 text-primary" aria-label="Passed" /> : <X className="mt-0.5 size-4 text-destructive" aria-label="Failed" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{comp ? <Link to={`/settings/looks/${look.slug}/designs/${comp.id}`} className="underline-offset-2 hover:underline">{label(r.name)}</Link> : label(r.name)}</div>
                    {!r.passed && r.message && <p className="text-[12.5px] text-destructive [overflow-wrap:anywhere]">{r.message}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </FormPanel>
  );
}
