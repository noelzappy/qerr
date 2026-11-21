// An inline message with an icon: info, success (good), caution (warn) or problem (bad). Not a toast: it stays in the page.
// Also a list of problem lines for inside one, and the problem notice a form shows above its buttons.
import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const TONE = {
  info: { cls: 'border-info/30 bg-info/10 [&>svg]:text-info', Icon: Info },
  good: { cls: 'border-success/30 bg-success/10 [&>svg]:text-success', Icon: CircleCheck },
  warn: { cls: 'border-warning/50 bg-warning/15 [&>svg]:text-warning-foreground', Icon: TriangleAlert },
  bad: { cls: 'border-destructive/30 bg-destructive/10 [&>svg]:text-destructive', Icon: CircleAlert },
} as const;

export function Notice({ tone = 'info', title, children, actions }: { tone?: keyof typeof TONE; title?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  const { cls, Icon } = TONE[tone];
  return (
    <Alert role={tone === 'bad' ? 'alert' : 'status'} className={`text-foreground ${cls}`}>
      <Icon aria-hidden="true" />
      <div className="col-start-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">{title && <strong className="font-semibold">{title}</strong>}{title && children ? ' ' : null}{children}</div>
        {actions}
      </div>
    </Alert>
  );
}

// Lists of problem lines inside a notice.
export function Lines({ items, className }: { items: string[]; className?: string }) {
  return <ul className={cn('mt-1.5 list-disc space-y-1 pl-[18px]', className)}>{items.map((l, i) => <li key={i} className="[overflow-wrap:anywhere]">{l}</li>)}</ul>;
}

// What went wrong with a form, and the lines that explain it. Nothing while there is no error.
export function FormProblem({ error, lines }: { error: string; lines?: string[] }) {
  if (!error) return null;
  return (
    <Notice tone="bad">
      {error}
      {lines && lines.length > 0 && <Lines items={lines} className="max-h-64 overflow-y-auto" />}
    </Notice>
  );
}
