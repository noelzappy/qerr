import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { errorMessage } from '../lib/errors';
import { useDocumentTitle } from '../hooks';
import { AuthLayout } from '../shell/AuthLayout';
import { PasswordFields, passwordProblems } from '../shell/PasswordFields';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/kit';

// A reset link is /reset-password?token=... (from the sign-in page or an admin) and /reset-password/<token> works too.
export function ResetPassword() {
  useDocumentTitle('Choose a new password');
  const params = useParams();
  const [query] = useSearchParams();
  const token = params.token ?? query.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const local = passwordProblems(password, again);
    if (local.length) { setError(local[0]!); return; }
    setBusy(true);
    try {
      await api.post('/api/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, 'The password was not changed. The link may have expired: ask an admin for a new one.'));
    } finally {
      setBusy(false);
    }
  }

  if (!token || query.get('error')) {
    return (
      <AuthLayout title="This link cannot be used">
        <Notice tone="bad">The reset link is not valid or has expired. Ask an admin for a new one, or request one from the sign-in page.</Notice>
        <Link to="/login" className="text-sm font-medium text-primary underline underline-offset-4">Go to sign in</Link>
      </AuthLayout>
    );
  }
  if (done) {
    return (
      <AuthLayout title="Password changed">
        <p>Sign in with your new password. Any other devices you were signed in on have been signed out.</p>
        <Button asChild><Link to="/login">Sign in</Link></Button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <PasswordFields password={password} again={again} onPassword={setPassword} onAgain={setAgain} />
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" className="w-full max-sm:min-h-11" disabled={busy}>{busy && <Loader2 className="animate-spin" aria-hidden="true" />}Change password</Button>
      </form>
    </AuthLayout>
  );
}
