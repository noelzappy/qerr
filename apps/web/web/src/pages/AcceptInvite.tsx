import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { fieldErrors, formProblem } from '../lib/errors';
import { useDocumentTitle } from '../hooks';
import { ROLE_LABEL } from '../lib/labels';
import { AuthLayout } from '../shell/AuthLayout';
import { PasswordFields, passwordProblems } from '../shell/PasswordFields';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingBlock, Notice, TextField } from '@/components/kit';
import { useAppInfo } from '../app-info';

// The link in an invitation email is /accept-invite?token=..., and /accept-invite/<token> works too.
export function AcceptInvite() {
  const { appName } = useAppInfo();
  useDocumentTitle('Set up your account');
  const params = useParams();
  const [query] = useSearchParams();
  const token = params.token ?? query.get('token') ?? '';
  const [info, setInfo] = useState<{ email: string; role: string } | null>(null);
  const [problem, setProblem] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) { setProblem('This invitation link is not complete. Open the whole link from your email, or ask an admin for a new one.'); return; }
    api.get<{ email: string; role: string }>(`/api/invites/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((e: unknown) => setProblem(e instanceof ApiError ? e.message : 'This invitation could not be checked. Try again in a moment.'));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setFields({});
    const local = passwordProblems(password, again);
    if (!name.trim()) { setFields({ name: 'Enter your name' }); return; }
    if (local.length) { setError(local[0]!); return; }
    setBusy(true);
    try {
      await api.post('/api/invites/accept', { token, name: name.trim(), password });
      setDone(true);
    } catch (err) {
      setFields(fieldErrors(err));
      setError(formProblem(err, ['name', 'password']));
    } finally {
      setBusy(false);
    }
  }

  if (problem) {
    return (
      <AuthLayout title="This invitation cannot be used">
        <Notice tone="bad">{problem}</Notice>
        <Link to="/login" className="text-sm font-medium text-primary underline underline-offset-4">Go to sign in</Link>
      </AuthLayout>
    );
  }
  if (done) {
    return (
      <AuthLayout title="Your account is ready">
        <p>You can sign in now with {info?.email}.</p>
        <Button asChild><Link to="/login">Sign in</Link></Button>
      </AuthLayout>
    );
  }
  if (!info) return <AuthLayout title="Checking your invitation"><LoadingBlock label="Checking your invitation" /></AuthLayout>;
  return (
    <AuthLayout title="Set up your account">
      <p className="text-[13px] text-muted-foreground">Joining {appName} as {(ROLE_LABEL[info.role] ?? info.role).toLowerCase()}: <span className="break-all font-medium text-foreground">{info.email}</span></p>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required error={fields.name} autoFocus />
        <PasswordFields password={password} again={again} onPassword={setPassword} onAgain={setAgain} error={fields.password} />
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" className="w-full max-sm:min-h-11" disabled={busy}>{busy && <Loader2 className="animate-spin" aria-hidden="true" />}Create account</Button>
      </form>
    </AuthLayout>
  );
}
