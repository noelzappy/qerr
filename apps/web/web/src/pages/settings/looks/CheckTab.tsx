// The Check tab: what the checks said about each design (from the stored gate records), and "Run the checks". Drawing the pictures
// the full checks need comes with previews; until then the server says so and this page shows its words without any error styling.
import { useState } from 'react';
import { Check, Minus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../../api';
import { errorMessage } from '../../../lib/errors';
import { BusyButton, Notice } from '@/components/kit';
import { designStatus, groupByKind, kindName, kindOrder, whenText } from './look-model';
import type { LookCatalogue, OwnDetail } from './look-types';
import { lookApi } from './looks-api';

export function CheckTab({ look, catalogue, locked, onReload }: { look: OwnDetail; catalogue: LookCatalogue; locked: boolean; onReload: () => void }) {
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<{ tone: 'info' | 'bad'; text: string } | null>(null);
  async function run() {
    setRunning(true); setNote(null);
    try { await lookApi.gate(look.slug); onReload(); setNote({ tone: 'info', text: 'The checks ran.' }); }
    catch (e) { setNote({ tone: e instanceof ApiError && e.status === 501 ? 'info' : 'bad', text: errorMessage(e) }); }
    finally { setRunning(false); }
  }
  const groups = groupByKind(look.compositions, kindOrder(catalogue));
  const g = look.gateRecord;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground" role="status">
          {g ? `Last look check: ${g.passed ? 'passed' : 'failed'}${g.at ? `, ${whenText(g.at)}` : ''}${look.gate?.stale ? '. The look has changed since' : ''}.` : 'The look has not been checked yet.'}
        </p>
        <BusyButton variant="outline" size="sm" loading={running} disabled={locked} onClick={() => void run()}>Run the checks</BusyButton>
      </div>
      {note && <Notice tone={note.tone}>{note.text}</Notice>}
      {groups.map(({ kind, designs }) => (
        <section key={kind} aria-label={kindName(kind)} className="flex flex-col gap-1.5">
          <h2 className="text-sm font-semibold">{kindName(kind)}</h2>
          <ul className="divide-y rounded-lg border">
            {designs.map((c) => {
              const failed = c.gate && !c.gate.passed ? c.gate.checks.filter((k) => !k.passed) : [];
              const state = !c.gate ? 'none' : c.gate.passed ? 'passed' : 'failed';
              return (
                <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
                  {state === 'passed' ? <Check className="mt-0.5 size-4 text-primary" aria-label="Passed" /> : state === 'failed' ? <X className="mt-0.5 size-4 text-destructive" aria-label="Failed" /> : <Minus className="mt-0.5 size-4 text-muted-foreground" aria-label="Not checked yet" />}
                  <div className="min-w-0 flex-1">
                    <Link to={`/settings/looks/${look.slug}/designs/${c.id}`} className="text-[14px] font-medium underline-offset-2 hover:underline">{c.name}</Link>
                    <p className="text-[12.5px] text-muted-foreground">
                      {state === 'none' ? 'Not checked yet' : state === 'passed' ? `Passed${c.gate?.at ? `, ${whenText(c.gate.at)}` : ''}` : 'Failed'}
                      {designStatus(c) === 'draft-pending' ? ' · a draft is waiting' : ''}{!c.enabled ? ' · switched off' : ''}
                    </p>
                    {failed.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-[18px] text-[13px] text-destructive">{failed.map((k, i) => <li key={i} className="[overflow-wrap:anywhere]">{k.message ?? k.name}</li>)}</ul>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
