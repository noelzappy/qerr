import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BusyButton, DataList, ErrorBlock, FieldGroup, FormPanel, Notice, RowsSkeleton, TextField, ToneBadge, type Column } from '@/components/kit';
import { useLoad } from '../../hooks';
import { fieldErrors, formProblem } from '../../lib/errors';
import { dateInputValue } from '../../lib/format';
import { networkLabel } from '../../lib/labels';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/use-unsaved-guard';

export interface BufferAccount {
  id: string; name: string; keyLast4: string; keyExpiresAt: string | null; daysLeft: number | null; expired: boolean; expiryWarning: boolean;
  organizationId: string | null; captionLimits: Record<string, number>;
}
interface CheckResult {
  ok: boolean; error?: string; status?: number; allOrganizations?: boolean;
  organizations: Array<{ id: string; name: string }>;
  channels: Array<{ id: string; name: string; displayName: string | null; service: string; network: string | null; organizationId: string; isQueuePaused: boolean }>;
}

const NETWORKS = ['instagram', 'linkedin', 'facebook', 'x'] as const;
const NAME_RULE = /^[A-Za-z0-9_-]{1,32}$/;
const sm = 'max-sm:min-h-11';
// One bordered container; the list's rows are separated by hairlines.
const LIST = 'overflow-hidden rounded-lg border';

export function AccountDialog({ account, onClose, onSaved }: { account: BufferAccount | null; onClose: () => void; onSaved: (created: boolean) => void }) {
  const [name, setName] = useState(account?.name ?? '');
  const [apiKey, setApiKey] = useState('');
  const [expires, setExpires] = useState(dateInputValue(account?.keyExpiresAt));
  const [org, setOrg] = useState(account?.organizationId ?? '');
  const [limits, setLimits] = useState<Record<string, string>>(() => Object.fromEntries(NETWORKS.map((n) => [n, account?.captionLimits[n] ? String(account.captionLimits[n]) : ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  const initialLimits = (n: string) => (account?.captionLimits[n] ? String(account.captionLimits[n]) : '');
  const dirty = name !== (account?.name ?? '') || apiKey !== '' || expires !== dateInputValue(account?.keyExpiresAt) || org !== (account?.organizationId ?? '') || NETWORKS.some((n) => limits[n] !== initialLimits(n));
  useUnsavedGuard(dirty);
  const requestClose = () => confirmDiscard(dirty && !busy, onClose);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const problems: Record<string, string> = {};
    if (!NAME_RULE.test(name)) problems.name = 'Use letters, digits, _ and -, up to 32 characters, with no spaces';
    if (!account && apiKey.trim().length < 8) problems.apiKey = 'Paste the Buffer key';
    if (apiKey.trim() && /\s/.test(apiKey.trim())) problems.apiKey = 'The key cannot contain spaces';
    const captionLimits: Record<string, number> = {};
    for (const n of NETWORKS) {
      const raw = limits[n]!.trim();
      if (!raw) continue;
      const v = Number(raw);
      if (!Number.isInteger(v) || v < 1) problems[`captionLimits.${n}`] = 'Enter a whole number of characters, or leave blank';
      else captionLimits[n] = v;
    }
    setFields(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      const body = {
        name,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        keyExpiresAt: expires || null,
        organizationId: org.trim() || null,
        captionLimits,
      };
      if (account) await api.patch(`/api/buffer-accounts/${account.id}`, body);
      else await api.post('/api/buffer-accounts', body);
      onSaved(!account);
    } catch (err) {
      setFields(fieldErrors(err));
      setError(formProblem(err, ['name', 'apiKey', 'keyExpiresAt', 'organizationId', ...NETWORKS.map((n) => `captionLimits.${n}`)]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormPanel open variant="dialog" onClose={requestClose} busy={busy} title={account ? `Edit ${account.name}` : 'Add a Buffer account'}
      description="The key is stored encrypted and cannot be shown again."
      footer={<><Button variant="outline" className={sm} onClick={requestClose} disabled={busy}>Cancel</Button><BusyButton type="submit" form="account-form" loading={busy}>{account ? 'Save changes' : 'Add account'}</BusyButton></>}>
      <form id="account-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={fields.name} placeholder="main" hintMode="inline" hint="A name you will recognise. It cannot change once posts have been sent through it." mono required autoFocus />
        <TextField
          label={account ? 'New Buffer key' : 'Buffer key'} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} error={fields.apiKey} optional={!!account}
          placeholder={account ? `Leave blank to keep the key ending ${account.keyLast4}` : ''}
          hint="Made in Buffer under your API settings." mono
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Key expires on" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} error={fields.keyExpiresAt} optional hint="The app warns a week before this date." />
          <TextField label="Buffer organisation id" value={org} onChange={(e) => setOrg(e.target.value)} error={fields.organizationId} optional mono hint="Leave blank to use every organisation this key can reach. Use Check key to see the ids." />
        </div>
        <FieldGroup legend={<>Caption limits <span className="font-normal text-muted-foreground">(optional)</span></>} hint="The most characters a caption may have on each network. Leave blank to use the app's own limit.">
          <div className="grid gap-3 sm:grid-cols-2">
            {NETWORKS.map((n) => (
              <TextField key={n} label={networkLabel(n)} type="number" inputMode="numeric" min={1} value={limits[n]} onChange={(e) => setLimits({ ...limits, [n]: e.target.value })} error={fields[`captionLimits.${n}`]} />
            ))}
          </div>
        </FieldGroup>
        {error && <Notice tone="bad">{error}</Notice>}
      </form>
    </FormPanel>
  );
}

// Informational only: it asks Buffer what a key can reach and changes nothing.
export function CheckDialog({ account, onClose }: { account: BufferAccount; onClose: () => void }) {
  const state = useLoad(() => api.post<CheckResult>(`/api/buffer-accounts/${account.id}/check`), [account.id]);
  const r = state.data;
  const channelColumns: Column<CheckResult['channels'][number]>[] = [
    { key: 'name', header: 'Channel', primary: true, cell: (c) => <>{c.displayName || c.name}{c.displayName && c.displayName !== c.name && <span className="block text-[13px] font-normal text-muted-foreground">{c.name}</span>}</> },
    { key: 'net', header: 'Network', cell: (c) => (c.network ? networkLabel(c.network) : <span className="text-muted-foreground">{c.service || 'Unknown'}</span>) },
    { key: 'org', header: 'Organisation', cell: (c) => <span className="font-mono [overflow-wrap:anywhere]">{c.organizationId}</span> },
    { key: 'paused', header: 'Queue', cell: (c) => (c.isQueuePaused ? <ToneBadge tone="warn" dot>Paused</ToneBadge> : <ToneBadge tone="good" dot>Running</ToneBadge>) },
  ];
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Check {account.name}</DialogTitle>
          <DialogDescription>Asks Buffer what this key can reach.</DialogDescription>
        </DialogHeader>
        {state.loading ? <RowsSkeleton rows={4} />
          : state.error ? <ErrorBlock message={state.error} onRetry={() => void state.reload()} />
          : r && !r.ok ? <Notice tone="bad" title="Buffer did not accept this key.">{r.error ?? 'The check failed.'}{r.status ? ` (status ${r.status})` : ''} Edit the account and paste a new key.</Notice>
          : r && (
            <div className="flex flex-col gap-4">
              <Notice tone="good">The key works. It can reach {r.organizations.length} {r.organizations.length === 1 ? 'organisation' : 'organisations'} and {r.channels.length} {r.channels.length === 1 ? 'channel' : 'channels'}.</Notice>
              {r.allOrganizations && <Notice tone="info">This account has no organisation chosen, so channels from every organisation are listed. Set an organisation id on the account to limit it.</Notice>}
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold">Organisations</h3>
                {r.organizations.length === 0 ? <p className="text-muted-foreground">None found.</p> : (
                  <ul className="m-0 list-disc pl-[18px]">{r.organizations.map((o) => <li key={o.id}>{o.name || 'Unnamed'} <span className="font-mono text-muted-foreground [overflow-wrap:anywhere]">{o.id}</span></li>)}</ul>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold">Channels</h3>
                {r.channels.length === 0 ? <p className="text-muted-foreground">No channels found. Connect a channel in Buffer first.</p>
                  : <div className={LIST}><DataList caption="Channels this key can reach" columns={channelColumns} rows={r.channels} rowKey={(c) => c.id} /></div>}
              </div>
            </div>
          )}
        <DialogFooter className="max-sm:[&>*]:flex-1">
          <Button variant="outline" className={sm} disabled={state.loading} onClick={() => void state.reload()}>Check again</Button>
          <Button className={sm} onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
