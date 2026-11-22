// Step 6, First batch: draft the first month with the AI, or start an empty batch. Either one closes the setup and opens the
// dialog Create already has (/batches/ai-draft, /batches/new); nothing is drafted or sent from here.
import { useState } from 'react';
import { FilePlus2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { errorMessage } from '../../lib/errors';
import { FormProblem } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { aiDraftBlocker, stepPath } from './flow';
import { StepActions, StepHeader, type StepProps } from './parts';

export function StepBatch({ status }: StepProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const blocker = aiDraftBlocker(status.steps.ai.missing);

  async function finish(to: string, key: string) {
    setBusy(key); setError('');
    try {
      await api.put('/api/setup/progress', { finished: true });
      navigate(to);
    } catch (err) {
      setError(errorMessage(err));
      setBusy('');
    }
  }

  const card = 'flex min-h-11 w-full flex-col items-start gap-1 rounded-lg border bg-background p-4 text-left outline-none transition-colors hover:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60';
  return (
    <div className="flex flex-col gap-5">
      <StepHeader title="Your first batch">A batch is a set of posts for a period, such as a month.</StepHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <button type="button" className={cn(card, 'border-primary')} disabled={!!blocker || !!busy} onClick={() => void finish('/batches/ai-draft', 'ai')} aria-describedby={blocker ? 'ai-blocker' : undefined}>
            <Sparkles className="size-5 text-primary" aria-hidden="true" />
            <span className="text-[14px] font-semibold">Draft my first month with AI</span>
            <span className="text-[12.5px] text-muted-foreground">From your facts. You review every post before anything is sent.</span>
          </button>
          {blocker && (
            <p id="ai-blocker" className="text-[12.5px] text-muted-foreground">
              {blocker} <Button variant="link" size="sm" className="h-auto p-0" onClick={() => navigate(stepPath('ai'))}>Go to the AI step</Button>
            </p>
          )}
        </div>
        <button type="button" className={card} disabled={!!busy} onClick={() => void finish('/batches/new', 'empty')}>
          <FilePlus2 className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="text-[14px] font-semibold">Start empty</span>
          <span className="text-[12.5px] text-muted-foreground">Write the posts yourself.</span>
        </button>
      </div>
      <FormProblem error={error} />
      <StepActions step="batch" busy={!!busy}
        primary={<Button type="button" variant="ghost" className="max-sm:min-h-11" disabled={!!busy} onClick={() => void finish('/home', 'home')}>Go to Home</Button>} />
    </div>
  );
}
