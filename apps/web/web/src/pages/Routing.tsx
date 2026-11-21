import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Notice } from '@/components/notice';
import { useDocumentTitle, useLoad } from '../hooks';
import { formProblem } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { networkLabel } from '../lib/labels';
import { ConfirmAction } from './kit/confirm-action';
import { SelectField } from './kit/fields';
import { PageHeader } from './kit/page-header';
import { BusyButton, ErrorBlock } from './kit/states';

interface Route {
  accountId: string; accountName: string; channelId: string; channelName: string | null; updatedAt: string;
  stale: { keyExpired: boolean; expiryWarning: boolean; daysLeft: number | null; channelMissing: boolean | null };
}
interface RoutingRow { network: string; route: Route | null }
interface Channel { id: string; name: string; displayName: string | null; service: string; network: string | null; organizationId: string; isQueuePaused: boolean }
interface AccountChannels { accountId: string; accountName: string; ok: boolean; error?: string; organizations: Array<{ id: string; name: string }>; channels: Channel[] }

const channelText = (c: Channel) => `${c.displayName || c.name}${c.isQueuePaused ? ' (queue paused)' : ''}`;

function CardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Asking Buffer for channels">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="gap-3 p-5"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></Card>
      ))}
    </div>
  );
}

export function Routing() {
  useDocumentTitle('Channel routing');
  const routing = useLoad(() => api.get<{ routing: RoutingRow[] }>('/api/routing').then((r) => r.routing), []);
  const [refreshing, setRefreshing] = useState(false);
  const channels = useLoad(() => api.get<{ accounts: AccountChannels[] }>('/api/routing/channels').then((r) => r.accounts), []);

  async function refreshAll() {
    setRefreshing(true);
    try {
      channels.setData((await api.get<{ accounts: AccountChannels[] }>('/api/routing/channels?refresh=1')).accounts);
      await routing.reload();
      toast.success('Channels refreshed from Buffer');
    } catch (e) {
      toast.error(formProblem(e, []));
    } finally {
      setRefreshing(false);
    }
  }

  const loading = (routing.loading && !routing.data) || (channels.loading && !channels.data);
  return (
    <>
      <PageHeader
        title="Channel routing"
        description="For each network, choose the Buffer account and the channel its posts go to. A batch cannot be sent to a network that has no route."
        actions={<BusyButton variant="outline" busy={refreshing || channels.loading} onClick={() => void refreshAll()}><RefreshCw aria-hidden="true" />Refresh from Buffer</BusyButton>}
      />
      {loading ? <CardsSkeleton />
        : routing.error ? <Card className="gap-0 p-0"><ErrorBlock message={routing.error} onRetry={() => void routing.reload()} /></Card>
        : channels.error ? <Card className="gap-0 p-0"><ErrorBlock message={channels.error} onRetry={() => void channels.reload()} /></Card>
        : (
          <div className="flex flex-col gap-4">
            {(channels.data ?? []).length === 0 && <Notice tone="info" title="No Buffer accounts yet.">Add an account under Buffer accounts first, then come back to choose channels.</Notice>}
            {(channels.data ?? []).filter((a) => !a.ok).map((a) => (
              <Notice key={a.accountId} tone="warn" title={`Could not list channels for ${a.accountName}.`}>{a.error ?? 'Buffer did not answer.'} Check the account's key.</Notice>
            ))}
            <div className="grid gap-4 md:grid-cols-2">
              {(routing.data ?? []).map((row) => (
                <NetworkCard key={row.network} row={row} accounts={channels.data ?? []} onChanged={() => void routing.reload()} />
              ))}
            </div>
          </div>
        )}
    </>
  );
}

function NetworkCard({ row, accounts, onChanged }: { row: RoutingRow; accounts: AccountChannels[]; onChanged: () => void }) {
  const { network, route } = row;
  const [accountId, setAccountId] = useState(route?.accountId ?? '');
  const [channelId, setChannelId] = useState(route?.channelId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clearing, setClearing] = useState(false);

  const account = accounts.find((a) => a.accountId === accountId);
  const matching = (account?.channels ?? []).filter((c) => c.network === network);
  const options = matching.length ? matching : (account?.channels ?? []);
  const unchanged = !!route && route.accountId === accountId && route.channelId === channelId;
  // The saved channel may no longer be in the account's list; keep it selectable so the form does not silently drop it.
  const savedMissing = !!route && accountId === route.accountId && !options.some((c) => c.id === route.channelId);

  async function save() {
    setError('');
    if (!accountId || !channelId) { setError('Choose an account and a channel.'); return; }
    setBusy(true);
    try {
      const picked = (account?.channels ?? []).find((c) => c.id === channelId);
      const res = await api.put<{ route: { verified: boolean | null } }>('/api/routing', { network, accountId, channelId, channelName: picked ? picked.displayName || picked.name : route?.channelName ?? null });
      if (res.route.verified === false) toast.error(`${networkLabel(network)} route saved, but Buffer does not list that channel for this account`);
      else toast.success(`${networkLabel(network)} route saved`);
      onChanged();
    } catch (e) {
      setError(formProblem(e, ['network', 'accountId', 'channelId']));
    } finally {
      setBusy(false);
    }
  }

  const warnings: Array<{ tone: 'bad' | 'warn'; text: string }> = [];
  if (route?.stale.keyExpired) warnings.push({ tone: 'bad', text: `The key for ${route.accountName} has expired. Posts for ${networkLabel(network)} cannot be sent until it is replaced.` });
  else if (route?.stale.expiryWarning) warnings.push({ tone: 'warn', text: `The key for ${route.accountName} expires in ${route.stale.daysLeft} ${route.stale.daysLeft === 1 ? 'day' : 'days'}.` });
  if (route?.stale.channelMissing) warnings.push({ tone: 'bad', text: 'Buffer no longer lists this channel for the account. Choose another channel.' });
  const needsAttention = warnings.some((w) => w.tone === 'bad');

  const accountOptions = [{ value: '', label: 'Choose an account' }, ...accounts.map((a) => ({ value: a.accountId, label: `${a.accountName}${a.ok ? '' : ' (could not be checked)'}` }))];
  const channelOptions = [
    { value: '', label: account ? 'Choose a channel' : 'Choose an account first' },
    ...(savedMissing && route ? [{ value: route.channelId, label: `${route.channelName || route.channelId} (no longer listed)` }] : []),
    ...options.map((c) => ({ value: c.id, label: channelText(c) })),
  ];

  return (
    <Card className="gap-3 p-5 max-sm:p-4" aria-label={networkLabel(network)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{networkLabel(network)}</h2>
        {route ? <Badge variant={needsAttention ? 'destructive' : 'success'}>{needsAttention ? 'Needs attention' : 'Routed'}</Badge> : <Badge variant="quiet">Not set</Badge>}
      </div>
      {route ? (
        <p className="text-sm text-muted-foreground">Now sending to <strong className="text-foreground">{route.channelName || route.channelId}</strong> through <span className="font-mono">{route.accountName}</span>. Changed {formatDateTime(route.updatedAt)}.</p>
      ) : <p className="text-sm text-muted-foreground">No channel chosen yet.</p>}
      {warnings.map((w) => <Notice key={w.text} tone={w.tone}>{w.text}</Notice>)}
      <SelectField label="Buffer account" value={accountId} onValueChange={(v) => { setAccountId(v); setChannelId(''); setError(''); }} options={accountOptions} />
      <SelectField label="Channel" value={channelId} onValueChange={setChannelId} options={channelOptions} disabled={!account}
        hint={account && account.ok && matching.length === 0 ? `No ${networkLabel(network)} channels found for this account, so every channel is listed.` : undefined} />
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex flex-wrap gap-2.5">
        <BusyButton busy={busy} disabled={unchanged || !accountId || !channelId} onClick={() => void save()}>Save route</BusyButton>
        {route && <Button variant="outline" className="max-sm:min-h-11" onClick={() => setClearing(true)}>Clear route</Button>}
      </div>
      <ConfirmAction
        open={clearing}
        title={`Clear the ${networkLabel(network)} route?`}
        message={<>Posts for {networkLabel(network)} cannot be sent until you choose a channel again. Posts already sent are not affected.</>}
        confirmLabel="Clear route"
        destructive
        onCancel={() => setClearing(false)}
        onConfirm={async () => {
          await api.delete(`/api/routing/${network}`);
          setClearing(false);
          setAccountId(''); setChannelId('');
          toast.success(`${networkLabel(network)} route cleared`);
          onChanged();
        }}
      />
    </Card>
  );
}
