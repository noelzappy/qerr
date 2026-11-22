// The pieces every setup screen shares: what a screen receives, its heading, and its row of actions.
import type { ReactNode } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BusyButton } from '@/components/kit';
import { prevStep, stepPath, type SetupStatus, type StepKey } from './flow';

export interface StepProps {
  status: SetupStatus;
  reload: () => Promise<SetupStatus | null>;
  // Record a step as done or put off for later (PUT /api/setup/progress).
  mark: (key: StepKey, state: 'done' | 'skipped') => Promise<void>;
  // Go to the following step.
  next: () => void;
}

export function StepHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-[19px] font-semibold tracking-tight max-sm:text-lg">{title}</h1>
      {children && <p className="text-[13px] text-muted-foreground">{children}</p>}
    </div>
  );
}

// Back on the left; "Skip for later" and the main action on the right (stacked, main action first, on a phone).
export function StepActions({ step, onSkip, primary, busy, primaryLabel = 'Continue', onPrimary, form, disabled }: {
  step: StepKey; onSkip?: () => void; primary?: ReactNode; busy?: boolean; primaryLabel?: string; onPrimary?: () => void; form?: string; disabled?: boolean;
}) {
  const navigate = useNavigate();
  const back = prevStep(step);
  return (
    <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center">
      {back && <Button type="button" variant="ghost" className="max-sm:min-h-11 sm:mr-auto" onClick={() => navigate(stepPath(back))} disabled={busy}><ArrowLeft aria-hidden="true" />Back</Button>}
      {!back && <span className="sm:mr-auto" />}
      {onSkip && <Button type="button" variant="outline" className="max-sm:min-h-11" onClick={onSkip} disabled={busy}>Skip for later</Button>}
      {primary ?? <BusyButton type={form ? 'submit' : 'button'} form={form} className="max-sm:min-h-11" loading={!!busy} disabled={disabled} onClick={onPrimary}>{primaryLabel}</BusyButton>}
    </div>
  );
}

// Under a field the system filled in: it says so, and the field stays editable.
export function SuggestedNote({ children = 'Suggested from your website. Edit it as you like.' }: { children?: ReactNode }) {
  return <p className="flex items-center gap-1 text-[12px] text-muted-foreground"><Sparkles className="size-3.5 shrink-0" aria-hidden="true" />{children}</p>;
}
