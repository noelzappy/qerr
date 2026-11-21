import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../api';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BusyButton, ConfirmAction, ErrorBlock, Hint, MoreMenu, Notice, ToneBadge } from '@/components/kit';
import { fromSelectValue, toSelectValue } from '@/lib/select-value';
import { useDocumentTitle, useLoad } from '../hooks';
import { formProblem } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { networkLabel } from '../lib/labels';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { SettingsPage } from './settings/section';

// One row per network; on phones each row stacks.
const ROW = 'grid gap-x-3 gap-y-2 px-3.5 md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_9.5rem_5.5rem] md:items-center';

interface Route {
  accountId: string; accountName: string; channelId: string; channelName: string | null; updatedAt: string;
  stale: { keyExpired: boolean; expiryWarning: boolean; daysLeft: number | null; channelMissing: boolean | null };
}
interface RoutingRow { network: string; route: Route | null }
interface Channel { id: string; name: string; displayName: string | null; service: string; network: string | null; organizationId: string; isQueuePaused: boolean }
interface AccountChannels { accountId: string; accountName: string; ok: boolean; error?: string; organizations: Array<{ id: string; name: string }>; channels: Channel[] }

const channelText = (c: Channel) => `${c.displayName || c.name}${c.isQueuePaused ? ' (queue paused)' : ''}`;

function RowsSkeleton() {
  return (
    <Card className="gap-0 divide-y overflow-hidden p-0" role="status" aria-label="Asking Buffer for channels">
      {[0, 1, 2, 3].map((i) => <div key={i} className={`${ROW} py-3`}><Skeleton className="h-5 w-20" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>)}
    </Card>
  );
}

function RouteSelect({ label, value, onValueChange, options, disabled, className }: { label: string; value: string; onValueChange: (v: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean; className?: string }) {
  return (
    <Select value={toSelectValue(value, options)} onValueChange={(v) => onValueChange(fromSelectValue(v))} disabled={disabled}>
      <SelectTrigger aria-label={label} className={`w-full max-sm:h-11 max-sm:text-base ${className ?? ''}`}><SelectValue /></SelectTrigger>
      <SelectContent position="popper">
        {options.map((o) => <SelectItem key={o.value} value={toSelectValue(o.value, [o])}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function Routing() {
  useDocumentTitle('Channels');
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
    <SettingsPage
      title="Channels"
      description="A batch cannot be sent to a network that has no route."
      actions={<BusyButton variant="outline" loading={refreshing || channels.loading} onClick={() => void refreshAll()}><RefreshCw aria-hidden="true" />Refresh from Buffer</BusyButton>}
    >
      {loading ? <RowsSkeleton />
        : routing.error ? <Card className="gap-0 p-0"><ErrorBlock message={routing.error} onRetry={() => void routing.reload()} /></Card>
        : channels.error ? <Card className="gap-0 p-0"><ErrorBlock message={channels.error} onRetry={() => void channels.reload()} /></Card>
        : (
          <div className="flex flex-col gap-3">
            {(channels.data ?? []).length === 0 && <Notice tone="info" title="No Buffer accounts yet.">Add one under <Link to="/settings/accounts" className="font-medium underline underline-offset-2">Buffer accounts</Link>, then come back to choose channels.</Notice>}
            {(channels.data ?? []).filter((a) => !a.ok).map((a) => (
              <Notice key={a.accountId} tone="warn" title={`Could not list channels for ${a.accountName}.`}>{a.error ?? 'Buffer did not answer.'} Check the account's key.</Notice>
            ))}
            <Card className="gap-0 divide-y overflow-hidden p-0" role="table" aria-label="Channel routes">
              <div role="row" className={`${ROW} hidden h-9 bg-muted/60 font-mono text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground md:grid`}>
                <span role="columnheader">Network</span><span role="columnheader">Buffer account</span><span role="columnheader">Channel</span><span role="columnheader">Status</span><span role="columnheader" className="sr-only">Actions</span>
              </div>
              {(routing.data ?? []).map((row) => (
                <NetworkRow key={row.network} row={row} accounts={channels.data ?? []} onChanged={() => void routing.reload()} />
              ))}
            </Card>
          </div>
        )}
    </SettingsPage>
  );
}

function NetworkRow({ row, accounts, onChanged }: { row: RoutingRow; accounts: AccountChannels[]; onChanged: () => void }) {
  const { network, route } = row;
  const [accountId, setAccountId] = useState(route?.accountId ?? '');
  const [channelId, setChannelId] = useState(route?.channelId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clearing, setClearing] = useState(false);
  const dirty = accountId !== (route?.accountId ?? '') || channelId !== (route?.channelId ?? '');
  useUnsavedGuard(dirty);

  const account = accounts.find((a) => a.accountId === accountId);
  const matching = (account?.channels ?? []).filter((c) => c.network === network);
  const options = matching.length ? matching : (account?.channels ?? []);
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
  const noMatch = !!account && account.ok && matching.length === 0;
  const name = networkLabel(network);

  return (
    <div role="row" aria-label={name} className="py-2.5">
      <div className={ROW}>
        <h2 role="rowheader" className="text-[13.5px] font-medium">{name}</h2>
        <div role="cell" className="min-w-0">
          <RouteSelect label={`${name}: Buffer account`} value={accountId} onValueChange={(v) => { setAccountId(v); setChannelId(''); setError(''); }} options={accountOptions} />
        </div>
        <div role="cell" className="flex min-w-0 items-center gap-1">
          <RouteSelect label={`${name}: channel`} value={channelId} onValueChange={setChannelId} options={channelOptions} disabled={!account} />
          {noMatch && <Hint about={`${name} channels`}>{`No ${name} channels found for this account, so every channel is listed.`}</Hint>}
        </div>
        <div role="cell" className="flex items-center gap-1.5 text-[13px]">
          {route ? <ToneBadge dot tone={needsAttention ? 'bad' : 'good'}>{needsAttention ? 'Needs attention' : 'Routed'}</ToneBadge> : <ToneBadge dot tone="quiet">Not set</ToneBadge>}
          {route && <Hint about={`${name} route`}>{`Sending to ${route.channelName || route.channelId} through ${route.accountName}. Changed ${formatDateTime(route.updatedAt)}.`}</Hint>}
        </div>
        <div role="cell" className="flex items-center justify-end gap-1">
          {dirty && <BusyButton size="sm" loading={busy} disabled={!accountId || !channelId} onClick={() => void save()}>Save</BusyButton>}
          {route && <MoreMenu label={`More actions for ${name}`} items={[{ label: 'Clear route', tone: 'danger', onSelect: () => setClearing(true) }]} />}
        </div>
      </div>
      {(warnings.length > 0 || error) && (
        <div className="mt-2 flex flex-col gap-1.5 px-3.5">
          {warnings.map((w) => <Notice key={w.text} tone={w.tone}>{w.text}</Notice>)}
          {error && <Notice tone="bad">{error}</Notice>}
        </div>
      )}
      <ConfirmAction
        open={clearing}
        title={`Clear the ${name} route?`}
        message={<>Posts for {name} cannot be sent until you choose a channel again. Posts already sent are not affected.</>}
        confirmLabel="Clear route"
        danger
        onCancel={() => setClearing(false)}
        onConfirm={async () => {
          await api.delete(`/api/routing/${network}`);
          setClearing(false);
          setAccountId(''); setChannelId('');
          toast.success(`${name} route cleared`);
          onChanged();
        }}
      />
    </div>
  );
}
