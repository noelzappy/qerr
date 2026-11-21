import { useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { BusyButton, CheckField, ConfirmAction, CopyBox, DataList, EmptyBlock, ErrorBlock, FormPanel, Notice, PageHeader, RowsSkeleton, SelectField, TextField, type Column } from '@/components/kit';
import { useLoad, useDocumentTitle } from '../hooks';
import { fieldErrors, formProblem } from '../lib/errors';
import { formatDate } from '../lib/format';
import { ROLE_LABEL } from '../lib/labels';
import { useSession } from '../session';

interface UserRow { id: string; email: string; name: string; role: 'admin' | 'editor'; disabled: boolean; createdAt: string }
interface InviteRow { id: string; email: string; role: 'admin' | 'editor'; state: 'open' | 'accepted' | 'revoked' | 'expired'; expiresAt: string; createdAt: string }
interface InviteResult { link: string; emailed: boolean; emailFailed: boolean; invite: InviteRow }
interface ResetResult { link: string; expiresAt: string; emailed: boolean; emailFailed: boolean }

const ROLE_OPTIONS = [{ value: 'editor', label: 'Editor' }, { value: 'admin', label: 'Admin' }];
const sm = 'max-sm:min-h-11';

export function Users() {
  useDocumentTitle('Users');
  const { me } = useSession();
  const users = useLoad(() => api.get<{ users: UserRow[] }>('/api/users').then((r) => r.users), []);
  const invites = useLoad(() => api.get<{ invites: InviteRow[] }>('/api/users/invites').then((r) => r.invites.filter((i) => i.state === 'open' || i.state === 'expired')), []);

  const [inviting, setInviting] = useState(false);
  const [roleFor, setRoleFor] = useState<UserRow | null>(null);
  const [toggleFor, setToggleFor] = useState<UserRow | null>(null);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [revokeFor, setRevokeFor] = useState<InviteRow | null>(null);

  const userColumns: Column<UserRow>[] = [
    { key: 'who', header: 'Person', primary: true, cell: (u) => <><span>{u.name || u.email}</span><span className="block text-[13px] font-normal text-muted-foreground [overflow-wrap:anywhere]">{u.email}</span></> },
    { key: 'role', header: 'Role', cell: (u) => <Badge variant={u.role === 'admin' ? 'info' : 'quiet'}>{ROLE_LABEL[u.role]}</Badge> },
    { key: 'status', header: 'Status', cell: (u) => (u.disabled ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="success">Active</Badge>) },
    { key: 'joined', header: 'Joined', cell: (u) => formatDate(u.createdAt) },
    {
      key: 'actions', header: 'Actions', actions: true,
      cell: (u) => (
        <div className="flex flex-wrap justify-end gap-2 max-md:justify-start">
          <Button variant="outline" size="sm" className={sm} onClick={() => setRoleFor(u)}>Change role</Button>
          <Button variant="outline" size="sm" className={sm} onClick={() => setResetFor(u)}>Reset link</Button>
          {u.disabled
            ? <Button variant="outline" size="sm" className={sm} onClick={() => setToggleFor(u)}>Enable</Button>
            : <Button variant="outline" size="sm" className={sm} disabled={u.id === me?.id} title={u.id === me?.id ? 'You cannot disable your own account' : undefined} onClick={() => setToggleFor(u)}>Disable</Button>}
        </div>
      ),
    },
  ];
  const inviteColumns: Column<InviteRow>[] = [
    { key: 'email', header: 'Email', primary: true, cell: (i) => <span className="[overflow-wrap:anywhere]">{i.email}</span> },
    { key: 'role', header: 'Role', cell: (i) => <Badge variant={i.role === 'admin' ? 'info' : 'quiet'}>{ROLE_LABEL[i.role]}</Badge> },
    { key: 'state', header: 'State', cell: (i) => (i.state === 'expired' ? <Badge variant="warning">Expired</Badge> : <Badge variant="info">Waiting</Badge>) },
    { key: 'expires', header: 'Expires', cell: (i) => formatDate(i.expiresAt) },
    { key: 'actions', header: 'Actions', actions: true, cell: (i) => <Button variant="outline" size="sm" className={sm} onClick={() => setRevokeFor(i)}>{i.state === 'open' ? 'Withdraw' : 'Remove'}</Button> },
  ];

  return (
    <>
      <PageHeader title="Users" description="Everyone who can sign in. People join by invitation only, and admins can change what each person can do."
        actions={<Button className={sm} onClick={() => setInviting(true)}><UserPlus aria-hidden="true" />Invite someone</Button>} />
      <div className="flex flex-col gap-6">
        <section aria-labelledby="people-heading" className="flex flex-col gap-2">
          <h2 id="people-heading" className="text-lg font-semibold tracking-tight">People</h2>
          <Card className="gap-0 overflow-hidden p-0">
            {users.loading && !users.data ? <RowsSkeleton rows={4} />
              : users.error ? <ErrorBlock message={users.error} onRetry={() => void users.reload()} />
              : users.data && users.data.length === 0 ? <EmptyBlock title="No one yet">Invite the first person to get started.</EmptyBlock>
              : users.data && <DataList caption="People who can sign in" columns={userColumns} rows={users.data} rowKey={(u) => u.id} />}
          </Card>
        </section>

        <section aria-labelledby="invites-heading" className="flex flex-col gap-2">
          <div>
            <h2 id="invites-heading" className="text-lg font-semibold tracking-tight">Invitations not yet used</h2>
            <p className="text-sm text-muted-foreground">A link works for seven days. Withdraw one to stop it being used.</p>
          </div>
          <Card className="gap-0 overflow-hidden p-0">
            {invites.loading && !invites.data ? <RowsSkeleton rows={2} />
              : invites.error ? <ErrorBlock message={invites.error} onRetry={() => void invites.reload()} />
              : invites.data && invites.data.length === 0 ? <EmptyBlock title="No open invitations">Invitations appear here until the person sets a password.</EmptyBlock>
              : invites.data && <DataList caption="Invitations not yet used" columns={inviteColumns} rows={invites.data} rowKey={(i) => i.id} />}
          </Card>
        </section>
      </div>

      <InviteSheet open={inviting} onClose={() => setInviting(false)} onDone={() => void invites.reload()} />

      {roleFor && <RoleSheet key={roleFor.id} user={roleFor} onClose={() => setRoleFor(null)} onDone={(u) => { setRoleFor(null); toast.success(`${u.email} is now ${ROLE_LABEL[u.role].toLowerCase()}`); void users.reload(); }} />}

      <ConfirmAction
        open={!!toggleFor}
        title={toggleFor?.disabled ? 'Enable this account?' : 'Disable this account?'}
        message={toggleFor?.disabled
          ? <>{toggleFor?.email} will be able to sign in again.</>
          : <>{toggleFor?.email} will be signed out everywhere at once and will not be able to sign in until you enable the account again. Their work stays in place.</>}
        confirmLabel={toggleFor?.disabled ? 'Enable account' : 'Disable account'}
        danger={!toggleFor?.disabled}
        onCancel={() => setToggleFor(null)}
        onConfirm={async () => {
          const u = toggleFor!;
          await api.post(`/api/users/${u.id}/${u.disabled ? 'enable' : 'disable'}`);
          setToggleFor(null);
          toast.success(`${u.email} ${u.disabled ? 'enabled' : 'disabled'}`);
          void users.reload();
        }}
      />

      <ConfirmAction
        open={!!revokeFor}
        title={revokeFor?.state === 'open' ? 'Withdraw this invitation?' : 'Remove this invitation?'}
        message={<>The link sent to {revokeFor?.email} will stop working. You can invite them again at any time.</>}
        confirmLabel={revokeFor?.state === 'open' ? 'Withdraw invitation' : 'Remove invitation'}
        danger
        onCancel={() => setRevokeFor(null)}
        onConfirm={async () => {
          const i = revokeFor!;
          await api.delete(`/api/users/invites/${i.id}`);
          setRevokeFor(null);
          toast.success(`Invitation for ${i.email} withdrawn`);
          void invites.reload();
        }}
      />

      {resetFor && <ResetSheet key={resetFor.id} user={resetFor} onClose={() => setResetFor(null)} />}
    </>
  );
}

// What happened to the email, in words. emailFailed means mail is set up but the send failed; neither means mail is not set up.
function MailOutcome({ emailed, emailFailed, to }: { emailed: boolean; emailFailed: boolean; to: string }) {
  if (emailed) return <Notice tone="good">An email with this link was sent to {to}. You can also pass the link on yourself.</Notice>;
  if (emailFailed) return <Notice tone="warn" title="Email not sent.">The email to {to} could not be sent. Copy the link below and send it to them yourself.</Notice>;
  return <Notice tone="info" title="No email is set up.">Nothing was sent. Copy the link below and send it to {to} yourself.</Notice>;
}

function InviteSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'admin'>('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<InviteResult | null>(null);

  const close = () => { setEmail(''); setRole('editor'); setError(''); setFields({}); setResult(null); onClose(); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setFields({});
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setFields({ email: 'Enter a full email address, such as name@example.com' }); return; }
    setBusy(true);
    try {
      setResult(await api.post<InviteResult>('/api/users/invites', { email: email.trim(), role }));
      onDone();
    } catch (err) {
      setFields(fieldErrors(err));
      setError(formProblem(err, ['email', 'role']));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormPanel
      open={open}
      size="sm"
      onClose={close}
      title={result ? 'Invitation made' : 'Invite someone'}
      description={result ? undefined : 'They get a link to choose a password. The link works for seven days and only once.'}
      busy={busy}
      footer={result
        ? <Button className={sm} onClick={close}>Done</Button>
        : <><Button variant="outline" className={sm} onClick={close} disabled={busy}>Cancel</Button><BusyButton type="submit" form="invite-form" loading={busy}>Make invitation</BusyButton></>}
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <MailOutcome emailed={result.emailed} emailFailed={result.emailFailed} to={result.invite.email} />
          <div className="flex flex-col gap-1.5">
            <Label>Invitation link</Label>
            <CopyBox value={result.link} label="Invitation link" />
            <p className="text-[13px] text-muted-foreground">This link is shown once. If you lose it, withdraw the invitation and make a new one. An older open invitation for the same email was withdrawn.</p>
          </div>
        </div>
      ) : (
        <form id="invite-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} required autoComplete="off" autoFocus />
          <SelectField label="Role" value={role} onValueChange={(v) => setRole(v as 'editor' | 'admin')} options={ROLE_OPTIONS} error={fields.role}
            hint={role === 'admin' ? 'Admins also manage users, Buffer accounts, routing, AI settings and the audit log.' : 'Editors work on the vault and on batches.'} />
          {error && <Notice tone="bad">{error}</Notice>}
        </form>
      )}
    </FormPanel>
  );
}

function RoleSheet({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: (u: UserRow) => void }) {
  const [role, setRole] = useState<'editor' | 'admin'>(user.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try {
      const r = await api.patch<{ user: UserRow }>(`/api/users/${user.id}/role`, { role });
      onDone(r.user);
    } catch (e) {
      setError(formProblem(e, []));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormPanel open size="sm" title="Change role" description={user.email} onClose={onClose} busy={busy}
      footer={<><Button variant="outline" className={sm} onClick={onClose} disabled={busy}>Cancel</Button><BusyButton loading={busy} disabled={role === user.role} onClick={() => void save()}>Save role</BusyButton></>}>
      <div className="flex flex-col gap-4">
        <SelectField label="Role" value={role} onValueChange={(v) => setRole(v as 'editor' | 'admin')} options={ROLE_OPTIONS} />
        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    </FormPanel>
  );
}

function ResetSheet({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [send, setSend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ResetResult | null>(null);
  const close = () => { setSend(false); setError(''); setResult(null); onClose(); };
  async function make() {
    setBusy(true); setError('');
    try {
      setResult(await api.post<ResetResult>(`/api/users/${user.id}/reset-link`, { send }));
    } catch (e) {
      setError(formProblem(e, []));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormPanel open size="sm" title="Password reset link" description={user.email} onClose={close} busy={busy}
      footer={result ? <Button className={sm} onClick={close}>Done</Button> : <><Button variant="outline" className={sm} onClick={close} disabled={busy}>Cancel</Button><BusyButton loading={busy} onClick={() => void make()}>Make link</BusyButton></>}>
      {result ? (
        <div className="flex flex-col gap-4">
          {send ? <MailOutcome emailed={result.emailed} emailFailed={result.emailFailed} to={user.email} /> : <Notice tone="info">The link was made and not emailed. Pass it on yourself.</Notice>}
          <div className="flex flex-col gap-1.5">
            <Label>Reset link</Label>
            <CopyBox value={result.link} label="Reset link" />
            <p className="text-[13px] text-muted-foreground">Works for 24 hours, then it expires. Anyone with the link can set a new password, so send it only to {user.name || user.email}.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p>This makes a link that lets {user.name || user.email} choose a new password.</p>
          <CheckField label="Also email the link to them" hint="Only works if email is set up. Otherwise you will see the link here to pass on." checked={send} onCheckedChange={setSend} />
          {error && <Notice tone="bad">{error}</Notice>}
        </div>
      )}
    </FormPanel>
  );
}
