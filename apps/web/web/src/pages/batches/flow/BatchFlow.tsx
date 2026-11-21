// The top of a batch: the four steps from writing to going live, each with a count, the one step the batch is at, and the
// one button for the next sensible action (with the reason shown when it cannot be used yet).
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { BusyButton } from '@/components/kit';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { FlowAction, FlowKey, FlowStepView } from './status';

const STATE_WORD = { done: 'done', current: 'you are here', todo: 'not started' } as const;

export function BatchFlow({ steps, viewed, onStep, action, onAct, busy, blockedBy }: {
  steps: FlowStepView[];
  // The step whose view is open.
  viewed: FlowKey;
  onStep: (key: FlowKey) => void;
  action: FlowAction;
  onAct: () => void;
  busy?: boolean;
  // Why the action cannot be used yet. Shown in place of the button's hint, and the button is off.
  blockedBy?: ReactNode;
}) {
  return (
    <Card role="region" aria-label="Where this batch is" className="mb-4 gap-4 p-4 sm:p-5">
      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {steps.map((s) => (
          <li key={s.key} className="min-w-0">
            <button
              type="button"
              onClick={() => onStep(s.key)}
              aria-current={s.key === viewed ? 'step' : undefined}
              className={cn(
                'flex w-full min-w-0 items-start gap-2.5 rounded-lg border p-2.5 text-left outline-none transition-colors hover:border-foreground/25 focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11',
                s.state === 'current' && 'border-primary bg-primary/5',
                s.key === viewed && 'ring-2 ring-foreground/15',
              )}
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  s.state === 'done' && 'border-primary bg-primary text-primary-foreground',
                  s.state === 'current' && 'border-primary text-primary',
                  s.state === 'todo' && 'text-muted-foreground',
                )}
                aria-hidden="true"
              >
                {s.state === 'done' ? <Check className="size-3.5" /> : s.number}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-snug">{s.label}</span>
                <span className="block text-[12.5px] text-muted-foreground">{s.count}</span>
                <span className="sr-only">Step {s.number} of {steps.length}, {STATE_WORD[s.state]}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {action.kind !== 'none' ? (
          <BusyButton onClick={onAct} loading={busy} disabled={!!blockedBy} aria-describedby={blockedBy ? 'flow-blocked' : undefined}>{action.label}</BusyButton>
        ) : (
          <p className="text-sm font-medium">{action.label}.</p>
        )}
        {blockedBy && <p id="flow-blocked" className="min-w-0 flex-1 text-[13px] text-muted-foreground">{blockedBy}</p>}
      </div>
    </Card>
  );
}
