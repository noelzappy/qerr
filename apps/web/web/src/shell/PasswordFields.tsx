// New-password input with a live checklist, used by accepting an invite and by resetting a password.
import type { ReactNode } from 'react';
import { Check, Dot } from 'lucide-react';
import { TextField } from '@/components/kit';

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 128;

export function passwordProblems(password: string, again: string): string[] {
  const out: string[] = [];
  if (password.length < MIN_PASSWORD) out.push(`Use at least ${MIN_PASSWORD} characters`);
  if (password.length > MAX_PASSWORD) out.push(`Use at most ${MAX_PASSWORD} characters`);
  if (again !== password) out.push('The two passwords must match');
  return out;
}

function Rule({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={ok ? 'flex items-center gap-2 text-success' : 'flex items-center gap-2 text-muted-foreground'}>
      {ok ? <Check className="size-4" aria-hidden="true" /> : <Dot className="size-4" aria-hidden="true" />}
      <span>{children}<span className="sr-only">{ok ? ', done' : ', not yet'}</span></span>
    </li>
  );
}

export function PasswordFields({ password, again, onPassword, onAgain, error }: { password: string; again: string; onPassword: (v: string) => void; onAgain: (v: string) => void; error?: string }) {
  const long = password.length >= MIN_PASSWORD;
  const match = again.length > 0 && again === password;
  return (
    <>
      <TextField label="Password" type="password" value={password} onChange={(e) => onPassword(e.target.value)} autoComplete="new-password" required error={error} />
      <TextField label="Type the password again" type="password" value={again} onChange={(e) => onAgain(e.target.value)} autoComplete="new-password" required />
      <ul className="flex flex-col gap-1 text-[13px]" aria-live="polite">
        <Rule ok={long}>At least {MIN_PASSWORD} characters ({password.length} so far)</Rule>
        <Rule ok={match}>Both entries match</Rule>
      </ul>
    </>
  );
}
