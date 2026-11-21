// Where a post stands, in the five steps (Writing, Approved, Draft in Buffer, Scheduled, Sent), with problems as small
// chips on top. The current step is written out, so it never depends on colour alone.
import { Check } from 'lucide-react';
import { ToneBadge } from '@/components/kit';
import { networkLabel } from '../../../lib/labels';
import { cn } from '@/lib/utils';
import { breakdownText, FLAG_LABEL, FLAG_TONE, POST_STEPS, STEP_HELP, STEP_LABEL, STEP_TONE, type PostFlow } from './status';

const BAR: Record<string, string> = { good: 'bg-primary', warn: 'bg-warning', bad: 'bg-destructive', info: 'bg-info', quiet: 'bg-muted-foreground' };

export function PostStepper({ flow, compact = false, className }: { flow: PostFlow; compact?: boolean; className?: string }) {
  const label = STEP_LABEL[flow.step];
  const breakdown = flow.mixed ? breakdownText(flow, networkLabel) : '';
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <ol className="flex items-center gap-1" aria-hidden="true">
          {POST_STEPS.map((s, i) => {
            const done = i < flow.stepIndex;
            const current = i === flow.stepIndex;
            return (
              <li key={s} className="flex items-center">
                <span
                  className={cn('block rounded-full', compact ? 'h-1.5 w-4' : 'h-1.5 w-6', done || current ? BAR[current ? STEP_TONE[s] : 'good'] : 'bg-border')}
                />
              </li>
            );
          })}
        </ol>
        <ToneBadge tone={STEP_TONE[flow.step]} dot>
          <span className="sr-only">Step {flow.stepIndex + 1} of {POST_STEPS.length}: </span>
          {label}
        </ToneBadge>
        {flow.flags.map((f) => (
          <ToneBadge key={f} tone={FLAG_TONE[f]} className="whitespace-nowrap">{FLAG_LABEL[f]}</ToneBadge>
        ))}
        {flow.step === 'sent' && <Check className="size-3.5 text-primary" aria-hidden="true" />}
      </div>
      {!compact && <p className="text-[12.5px] text-muted-foreground">{STEP_HELP[flow.step]}</p>}
      {breakdown && <p className="text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]" title={breakdown}>Differs by network, so this shows the least advanced. {breakdown}.</p>}
    </div>
  );
}
