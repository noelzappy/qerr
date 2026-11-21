// The top of a batch, as one slim bar: the four steps from writing to going live, each with a small count, the one step the batch
// is at, and the one button for the next sensible action at the right (with the reason shown below when it cannot be used yet).
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { BusyButton } from '@/components/kit';
import { cn } from '@/lib/utils';
import type { FlowAction, FlowKey, FlowStepView } from './status';

// The step the batch has reached is marked "Current"; the step whose view is open is the selected tab. They can differ.
const STATE_WORD = { done: 'done', current: 'the step this batch has reached', todo: 'not started' } as const;

export function BatchFlow({ steps, viewed, onStep, action, onAct, busy, blockedBy, summary }: {
  steps: FlowStepView[];
  // The step whose view is open.
  viewed: FlowKey;
  onStep: (key: FlowKey) => void;
  action: FlowAction;
  onAct: () => void;
  busy?: boolean;
  // Why the action cannot be used yet. Shown below the bar, and the button is off.
  blockedBy?: ReactNode;
  // "13 writing, 0 approved", as small text beside the action.
  summary?: string;
}) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  // Arrow keys move between the steps; Enter or Space opens the one in focus.
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? steps.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    tabs.current[(to + steps.length) % steps.length]?.focus();
  }
  return (
    <div role="region" aria-label="Where this batch is" className="mb-4 border-y">
      <div className="flex flex-col gap-1.5 py-1 md:flex-row md:items-center md:justify-between md:gap-4">
        <ol className="grid min-w-0 grid-cols-2 gap-x-1 md:flex md:flex-1" role="tablist" aria-label="Steps of this batch">
          {steps.map((s, i) => (
            <li key={s.key} className="min-w-0" role="presentation">
              <button
                type="button"
                role="tab"
                ref={(el) => { tabs.current[i] = el; }}
                aria-selected={s.key === viewed}
                tabIndex={s.key === viewed ? 0 : -1}
                onClick={() => onStep(s.key)}
                onKeyDown={(e) => onKey(e, i)}
                className={cn(
                  'flex h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 md:h-11',
                  s.key === viewed && 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                    s.state === 'done' && 'border-primary bg-primary text-primary-foreground',
                    s.state === 'current' && 'border-primary text-primary',
                    s.state === 'todo' && 'text-muted-foreground',
                  )}
                  aria-hidden="true"
                >
                  {s.state === 'done' ? <Check className="size-3" /> : s.number}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className={cn('block truncate text-[13px]', s.state === 'current' || s.key === viewed ? 'font-semibold' : 'font-medium')}>{s.label}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">{s.count}</span>
                  <span className="sr-only">Step {s.number} of {steps.length}, {STATE_WORD[s.state]}{s.key === viewed ? ', open below' : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:shrink-0 md:justify-end">
          {summary && <span className="text-[12px] text-muted-foreground max-md:hidden">{summary}</span>}
          {action.kind !== 'none' ? (
            <BusyButton size="sm" onClick={onAct} loading={busy} disabled={!!blockedBy} aria-describedby={blockedBy ? 'flow-blocked' : undefined}>{action.label}</BusyButton>
          ) : (
            <p className="text-[13px] font-medium">{action.label}.</p>
          )}
        </div>
      </div>
      {blockedBy && <p id="flow-blocked" className="pb-2 text-[12.5px] text-muted-foreground">{blockedBy}</p>}
    </div>
  );
}
