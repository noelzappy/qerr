// The guided first setup: one screen per step (/setup/<step>), one main decision on each, a progress line, Back, and "Skip for
// later" where leaving a step open is safe. A new admin goes through it once; afterwards Settings is where things are changed.
// Each step saves through the routes Settings already uses; /api/setup keeps only what those cannot tell (see flow.ts).
import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useDocumentTitle } from '../../hooks';
import { useSession } from '../../session';
import { ErrorBlock, LoadingBlock } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { VeskLogo } from '../../shell/VeskLogo';
import { errorMessage } from '../../lib/errors';
import { isStep, nextStep, resumeStep, STEPS, stepIndex, stepOf, stepPath, stepStates, type SetupStatus, type StepKey } from './flow';
import type { StepProps } from './parts';
import { StepBrand } from './StepBrand';
import { StepLogo } from './StepLogo';
import { StepLook } from './StepLook';
import { StepChannels } from './StepChannels';
import { StepAi } from './StepAi';
import { StepBatch } from './StepBatch';

const SCREENS: Record<StepKey, (p: StepProps) => React.JSX.Element> = { brand: StepBrand, logo: StepLogo, look: StepLook, channels: StepChannels, ai: StepAi, batch: StepBatch };

function Progress({ status, current }: { status: SetupStatus; current: StepKey }) {
  const states = stepStates(status, current);
  const n = stepIndex(current) + 1;
  return (
    <nav aria-label="Setup steps" className="flex flex-col gap-2">
      <p className="text-[12.5px] text-muted-foreground md:hidden">Step {n} of {STEPS.length} · <span className="font-medium text-foreground">{stepOf(current).title}</span></p>
      <div className="h-1 overflow-hidden rounded-full bg-border md:hidden" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${(n / STEPS.length) * 100}%` }} /></div>
      <ol className="hidden items-center gap-1 md:flex">
        {STEPS.map((s, i) => {
          const st = states[s.key];
          const reachable = status.brandSaved || s.key === 'brand';
          const body = (
            <>
              <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] tabular-nums',
                st === 'current' ? 'border-primary bg-primary text-primary-foreground' : st === 'done' ? 'border-primary text-primary' : 'text-muted-foreground')} aria-hidden="true">
                {st === 'done' ? <Check className="size-3" /> : i + 1}
              </span>
              <span className={cn('whitespace-nowrap', st === 'current' ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{s.title}</span>
              <span className="sr-only">{st === 'done' ? ' (done)' : st === 'skipped' ? ' (skipped for later)' : ''}</span>
            </>
          );
          return (
            <li key={s.key} className="flex items-center gap-1" aria-current={st === 'current' ? 'step' : undefined}>
              {i > 0 && <span className="mx-1 h-px w-5 bg-border lg:w-8" aria-hidden="true" />}
              {reachable && st !== 'current'
                ? <Link to={stepPath(s.key)} className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-[12.5px] outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50">{body}</Link>
                : <span className="flex items-center gap-1.5 px-1 py-0.5 text-[12.5px]">{body}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function SetupPage() {
  const { step: param } = useParams();
  const { me, loading } = useSession();
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState('');
  const step: StepKey | null = isStep(param) ? param : null;
  useDocumentTitle(step ? `Setup: ${stepOf(step).title}` : 'Setup');

  const reload = useCallback(async () => {
    try { const s = await api.get<SetupStatus>('/api/setup'); setStatus(s); setError(''); return s; } catch (e) { setError(errorMessage(e)); return null; }
  }, []);
  useEffect(() => { if (me?.role === 'admin') void reload(); }, [me?.role, reload]);
  // Each screen starts at the top.
  useEffect(() => { window.scrollTo?.({ top: 0 }); }, [step]);

  if (loading) return <div className="flex min-h-dvh items-center justify-center"><LoadingBlock /></div>;
  if (!me) return <Navigate to="/login" replace state={{ from: `/setup${step ? `/${step}` : ''}` }} />;
  if (me.role !== 'admin') return <Navigate to="/home" replace />;
  if (status && !step) return <Navigate to={stepPath(resumeStep(status))} replace />;
  // Nothing after the first step can be saved before the brand is.
  if (status && step && step !== 'brand' && !status.brandSaved) return <Navigate to={stepPath('brand')} replace />;

  const mark = async (key: StepKey, state: 'done' | 'skipped') => { setStatus(await api.put<SetupStatus>('/api/setup/progress', { step: key, state })); };
  const goNext = (from: StepKey) => { const n = nextStep(from); navigate(n ? stepPath(n) : '/home'); };
  const leave = async () => {
    try { await api.put('/api/setup/progress', { left: true }); } catch { /* leaving still works; the setup only shows again */ }
    navigate('/home');
  };
  const Screen = step ? SCREENS[step] : null;

  return (
    <div className="flex min-h-dvh flex-col bg-frame">
      <header className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
        <VeskLogo />
        <Button variant="ghost" size="sm" className="max-sm:min-h-11" onClick={() => void leave()}>Finish later</Button>
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 pb-10 md:px-8">
        <div className={cn('flex w-full flex-col gap-5', step === 'look' ? 'max-w-5xl' : 'max-w-2xl')}>
          {status && step && <Progress status={status} current={step} />}
          <div className="rounded-xl border bg-card p-4 shadow-none sm:p-6">
            {error && !status ? <ErrorBlock message={error} onRetry={() => void reload()} />
              : !status || !Screen || !step ? <div className="flex flex-col gap-3"><Skeleton className="h-7 w-48" /><Skeleton className="h-40" /></div>
              : <Screen status={status} reload={reload} mark={mark} next={() => goNext(step)} />}
          </div>
        </div>
      </main>
    </div>
  );
}
