// Status in a small badge: a tone (its colour and, with `dot`, a dot before the words) and always a text label.
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'quiet';

const VARIANT = { good: 'success', warn: 'warning', bad: 'destructive', info: 'info', quiet: 'quiet' } as const;
const DOT = { good: 'bg-success', warn: 'bg-warning', bad: 'bg-destructive', info: 'bg-info', quiet: 'bg-muted-foreground' } as const;

export function ToneBadge({ tone = 'quiet', dot = false, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <Badge variant={VARIANT[tone]} className={cn(tone === 'bad' && 'bg-destructive/12 text-destructive dark:bg-destructive/20', className)}>
      {dot && <span className={cn('size-1.5 rounded-full', DOT[tone])} aria-hidden="true" />}
      {children}
    </Badge>
  );
}

// A status looked up in a map of tone and label; an unknown status shows as itself, quietly.
export function StatusBadge<S extends string>({ status, map }: { status: S; map: Record<S, { tone: Tone; label: string }> }) {
  const m = map[status] ?? { tone: 'quiet' as Tone, label: status };
  return <ToneBadge tone={m.tone} dot>{m.label}</ToneBadge>;
}
