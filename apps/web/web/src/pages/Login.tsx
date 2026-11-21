import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { errorMessage } from '../lib/errors';
import { useDocumentTitle } from '../hooks';
import { useSession } from '../session';
import { AuthLayout } from '../shell/AuthLayout';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice, TextField } from '@/components/kit';

export function Login() {
  useDocumentTitle('Sign in');
  const { me, refresh, notice, clearNotice } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState(false);

  if (me) return <Navigate to={from && from.startsWith('/') ? from : '/home'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    clearNotice();
    try {
      if (forgot) {
        await api.post('/api/auth/request-password-reset', { email: email.trim(), redirectTo: '/reset-password' });
        setSent(true);
      } else {
        await api.post('/api/auth/sign-in/email', { email: email.trim(), password });
        await refresh();
        navigate(from && from.startsWith('/') ? from : '/home', { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError(errorMessage(err));
      else if (err instanceof ApiError && err.status === 403) setError(err.message);
      else if (err instanceof ApiError && err.status === 0) setError(err.message);
      else setError(forgot ? 'That did not work. Check the email address and try again.' : 'The email or password is not right. Check both and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={forgot ? 'Reset your password' : 'Sign in'}>
      {notice && !error && <Notice tone="warn">{notice}</Notice>}
      {sent ? (
        <>
          <Notice tone="good">If that email has an account and email is set up, a reset link is on its way. If nothing arrives within a few minutes, ask an admin to make you a link.</Notice>
          <Button variant="outline" onClick={() => { setForgot(false); setSent(false); }}>Back to sign in</Button>
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required data-autofocus autoFocus hint={forgot ? 'We will send a link that works for one hour.' : undefined} />
          {!forgot && <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />}
          {error && <Notice tone="bad">{error}</Notice>}
          <Button type="submit" className="w-full max-sm:min-h-11" disabled={busy}>{busy && <Loader2 className="animate-spin" aria-hidden="true" />}{forgot ? 'Send reset link' : 'Sign in'}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setForgot(!forgot); setError(''); setSent(false); }}>{forgot ? 'Back to sign in' : 'Forgot your password?'}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
