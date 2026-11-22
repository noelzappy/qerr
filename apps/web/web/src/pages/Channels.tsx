// Channels: the Buffer accounts and the channel each network posts to, on one page. Accounts come first; with none, the
// page asks to connect Buffer and the networks table below stays off.
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useDocumentTitle, useLoad } from '../hooks';
import { SettingsPage } from './settings/section';
import { AccountsSection } from './channels/AccountsSection';
import { RoutesSection, type AccountChannels, type RoutingRow } from './channels/RoutesSection';
import type { BufferAccount } from './channels/AccountDialogs';

export function ChannelsPage() {
  useDocumentTitle('Channels');
  const accounts = useLoad(() => api.get<{ accounts: BufferAccount[] }>('/api/buffer-accounts').then((r) => r.accounts), []);
  const routing = useLoad(() => api.get<{ routing: RoutingRow[] }>('/api/routing').then((r) => r.routing), []);
  const channels = useLoad(() => api.get<{ accounts: AccountChannels[] }>('/api/routing/channels').then((r) => r.accounts), []);

  // The router does not scroll to a #hash on its own when the page was already open.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  // An account was added, edited or deleted: the lists of channels and routes depend on it.
  const accountsChanged = () => { void accounts.reload(); void channels.reload(); void routing.reload(); };

  return (
    <SettingsPage title="Channels" crumbs={[{ label: 'Settings', to: '/settings/preferences' }, { label: 'Channels' }]}>
      <AccountsSection list={accounts} onChanged={accountsChanged} />
      <RoutesSection routing={routing} channels={channels} accountCount={accounts.data ? accounts.data.length : null} onRefreshed={() => void accounts.reload()} />
    </SettingsPage>
  );
}
