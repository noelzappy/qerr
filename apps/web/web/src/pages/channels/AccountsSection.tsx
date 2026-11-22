// The Buffer accounts half of the Channels page: one compact row per account, and the empty state that starts the setup.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { Button } from '@/components/ui/button';
import { ConfirmAction, DataList, EmptyBlock, ErrorBlock, MoreMenu, Notice, RowsSkeleton, ToneBadge, type Column } from '@/components/kit';
import type { Loaded } from '../../hooks';
import { formatDate } from '../../lib/format';
import { Section } from '../settings/section';
import { AccountDialog, CheckDialog, type BufferAccount } from './AccountDialogs';
import type { Organisation } from './channels-logic';

const sm = 'max-sm:min-h-11';

function ExpiryText({ account }: { account: BufferAccount }) {
  if (!account.keyExpiresAt) return <span className="text-muted-foreground">No expiry set</span>;
  return <span className="whitespace-nowrap">{formatDate(account.keyExpiresAt)}</span>;
}

// One chip, and only for a problem; a healthy key says so in plain text.
function KeyStatus({ account }: { account: BufferAccount }) {
  if (account.expired) return <ToneBadge tone="bad" dot>Expired</ToneBadge>;
  if (account.expiryWarning) return <ToneBadge tone="warn" dot>{(account.daysLeft ?? 0) <= 1 ? 'Expires within a day' : `${account.daysLeft} days left`}</ToneBadge>;
  return <span className="text-muted-foreground">Active</span>;
}

export function AccountsSection({ list, onChanged }: { list: Loaded<BufferAccount[]>; onChanged: () => void }) {
  const [editing, setEditing] = useState<BufferAccount | 'new' | null>(null);
  const [deleting, setDeleting] = useState<BufferAccount | null>(null);
  const [checking, setChecking] = useState<BufferAccount | null>(null);
  // The organisations each account's key reached, from a key check in this visit: Edit offers them as a choice.
  const [orgsOf, setOrgsOf] = useState<Record<string, Organisation[]>>({});
  const heard = (id: string) => (orgs: Organisation[]) => setOrgsOf((cur) => ({ ...cur, [id]: orgs }));

  const accounts = list.data ?? [];
  const expired = accounts.filter((a) => a.expired);
  const soon = accounts.filter((a) => !a.expired && a.expiryWarning);
  const empty = !list.loading && !list.error && accounts.length === 0;

  const columns: Column<BufferAccount>[] = [
    { key: 'name', header: 'Name', primary: true, cell: (a) => <span className="font-mono">{a.name}</span> },
    { key: 'key', header: 'Key ending', cell: (a) => <span className="whitespace-nowrap font-mono">{`•••• ${a.keyLast4}`}</span> },
    { key: 'expiry', header: 'Key expires', cell: (a) => <ExpiryText account={a} /> },
    { key: 'status', header: 'Status', cell: (a) => <KeyStatus account={a} /> },
    {
      key: 'actions', header: 'Actions', actions: true,
      cell: (a) => (
        <MoreMenu label={`Actions for ${a.name}`} items={[
          { label: 'Edit', onSelect: () => setEditing(a) },
          { label: 'Check key', onSelect: () => setChecking(a) },
          { label: 'Delete account', tone: 'danger', onSelect: () => setDeleting(a) },
        ]} />
      ),
    },
  ];

  return (
    <Section
      id="accounts" title="Buffer accounts"
      description="Keys are stored encrypted and cannot be shown again. Each account holds its own channels."
      aside={!empty && <Button variant="outline" className={sm} onClick={() => setEditing('new')}><Plus aria-hidden="true" />Add an account</Button>}
    >
      {expired.length > 0 && (
        <Notice tone="bad" title="A Buffer key has expired.">
          {expired.map((a) => a.name).join(', ')} can no longer send posts until you add a new key. Edit the account and paste the new key.
        </Notice>
      )}
      {soon.length > 0 && (
        <Notice tone="warn" title="A Buffer key expires within a week.">
          {soon.map((a) => `${a.name} (${a.daysLeft} ${a.daysLeft === 1 ? 'day' : 'days'})`).join(', ')}. Make a new key in Buffer and add it here before then.
        </Notice>
      )}
      {list.loading && !list.data ? <div className="overflow-hidden rounded-lg border"><RowsSkeleton rows={2} /></div>
        : list.error ? <ErrorBlock message={list.error} onRetry={() => void list.reload()} />
        : empty ? (
          <EmptyBlock title="No Buffer account yet" action={<Button className={sm} onClick={() => setEditing('new')}><Plus aria-hidden="true" />Connect Buffer</Button>}>
            Add the Buffer account that holds your channels.
          </EmptyBlock>
        )
        : <div className="overflow-hidden rounded-lg border" aria-label="Buffer accounts"><DataList caption="Buffer accounts" columns={columns} rows={accounts} rowKey={(a) => a.id} /></div>}

      {editing && <AccountDialog key={editing === 'new' ? 'new' : editing.id} account={editing === 'new' ? null : editing}
        knownOrgs={editing === 'new' ? null : orgsOf[editing.id] ?? null} onOrgs={editing === 'new' ? undefined : heard(editing.id)} onClose={() => setEditing(null)} onSaved={(created) => { setEditing(null); toast.success(created ? 'Buffer account added' : 'Buffer account saved'); onChanged(); }} />}
      {checking && <CheckDialog account={checking} onResult={heard(checking.id)} onClose={() => setChecking(null)} />}

      <ConfirmAction
        open={!!deleting}
        title="Delete this Buffer account?"
        message={<>The account <strong>{deleting?.name}</strong> and its stored key will be deleted. This cannot be undone. It is refused while the account is used for routing or has deliveries on record.</>}
        confirmLabel="Delete account"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const a = deleting!;
          await api.delete(`/api/buffer-accounts/${a.id}`);
          setDeleting(null);
          toast.success(`Account ${a.name} deleted`);
          onChanged();
        }}
      />
    </Section>
  );
}
