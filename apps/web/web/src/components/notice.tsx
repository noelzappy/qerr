// An inline message with an icon: info, success (good), caution (warn) or problem (bad). Not a toast: it stays in the page.
import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { Alert } from '@/components/ui/alert';

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
