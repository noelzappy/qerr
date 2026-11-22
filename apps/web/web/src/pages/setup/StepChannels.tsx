// Step 4, Channels: connect Buffer with the dialog and the key check of Settings, Channels, then choose where each network
// posts (the same table). Nothing is sent to Buffer here except the account's own check, which only reads. It can wait.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { useLoad } from '../../hooks';
import { ErrorBlock, RowsSkeleton } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { AccountDialog, CheckDialog, type BufferAccount } from '../channels/AccountDialogs';
import { RoutesSection, type AccountChannels, type RoutingRow } from '../channels/RoutesSection';
import { StepActions, StepHeader, type StepProps } from './parts';

// Only asked once an account exists: listing channels asks Buffer.
function Routes({ count, onRefreshed }: { count: number; onRefreshed: () => void }) {
  const routing = useLoad(() => api.get<{ routing: RoutingRow[] }>('/api/routing').then((r) => r.routing), [count]);
  const channels = useLoad(() => api.get<{ accounts: AccountChannels[] }>('/api/routing/channels').then((r) => r.accounts), [count]);
  return <RoutesSection routing={routing} channels={channels} accountCount={count} onRefreshed={onRefreshed} />;
}

export function StepChannels({ reload, mark, next }: StepProps) {
  const accounts = useLoad(() => api.get<{ accounts: BufferAccount[] }>('/api/buffer-accounts').then((r) => r.accounts), []);
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState<BufferAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const list = accounts.data ?? [];

  async function proceed() { setBusy(true); try { await reload(); next(); } finally { setBusy(false); } }
  async function skip() { setBusy(true); try { await mark('channels', 'skipped'); next(); } finally { setBusy(false); } }

  return (
    <div className="flex flex-col gap-5">
      <StepHeader title="Channels">Qerr posts through Buffer. Add the API key of the Buffer account that holds your channels.</StepHeader>

      {accounts.error ? <ErrorBlock message={accounts.error} onRetry={() => void accounts.reload()} />
        : !accounts.data ? <div className="overflow-hidden rounded-lg border"><RowsSkeleton rows={1} /></div>
        : list.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4">
            <p className="text-[13px] text-muted-foreground">No Buffer account yet. The key is stored encrypted and cannot be shown again.</p>
            <Button className="max-sm:min-h-11" onClick={() => setAdding(true)}><Plus aria-hidden="true" />Connect Buffer</Button>
          </div>
        ) : (
          <>
            <ul className="divide-y overflow-hidden rounded-lg border" aria-label="Buffer accounts">
              {list.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate font-mono">{a.name}</span>
                  <span className="font-mono text-muted-foreground">•••• {a.keyLast4}</span>
                  <Button size="sm" variant="outline" className="max-sm:min-h-11" onClick={() => setChecking(a)}>Check key</Button>
                </li>
              ))}
            </ul>
            <div><Button size="sm" variant="ghost" className="max-sm:min-h-11" onClick={() => setAdding(true)}><Plus aria-hidden="true" />Add another account</Button></div>
            <Routes count={list.length} onRefreshed={() => void accounts.reload()} />
          </>
        )}

      {adding && <AccountDialog account={null} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast.success('Buffer account added'); void accounts.reload(); void reload(); }} />}
      {checking && <CheckDialog account={checking} onClose={() => setChecking(null)} />}

      {/* With no account yet, "Connect Buffer" is the one main action; the footer only offers to leave it for later. */}
      <StepActions step="channels" busy={busy} onSkip={list.length ? undefined : () => void skip()} onPrimary={() => void proceed()} primary={list.length ? undefined : <></>} />
    </div>
  );
}
