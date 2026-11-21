// Status, quietly. A status (`dot`, and StatusBadge always) is a coloured dot and plain text; without `dot` the tone is a
// small tinted pill. Neutral ('quiet') things have no border or tint to speak of. Always a text label, never colour alone.
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'quiet';

const VARIANT = { good: 'success', warn: 'warning', bad: 'destructive', info: 'info', quiet: 'quiet' } as const;
const DOT = { good: 'bg-success', warn: 'bg-warning', bad: 'bg-destructive', info: 'bg-info', quiet: 'bg-muted-foreground/70' } as const;
const TEXT = { good: 'text-foreground', warn: 'text-warning-foreground', bad: 'text-destructive', info: 'text-foreground', quiet: 'text-muted-foreground' } as const;

export function ToneBadge({ tone = 'quiet', dot = false, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  if (dot) {
    return (
      <Badge variant="ghost" className={cn('gap-1.5 bg-transparent px-0 font-normal', TEXT[tone], tone === 'bad' && 'font-medium', className)}>
        <span className={cn('size-1.5 rounded-full', DOT[tone])} aria-hidden="true" />
        {children}
      </Badge>
    );
  }
  return (
    <Badge variant={VARIANT[tone]} className={cn(tone === 'bad' && 'bg-destructive/12 text-destructive dark:bg-destructive/20', tone === 'quiet' && 'bg-muted/70 font-normal', className)}>
      {children}
    </Badge>
  );
}

// A status looked up in a map of tone and label; an unknown status shows as itself, quietly.
export function StatusBadge<S extends string>({ status, map }: { status: S; map: Record<S, { tone: Tone; label: string }> }) {
  const m = map[status] ?? { tone: 'quiet' as Tone, label: status };
  return <ToneBadge tone={m.tone} dot>{m.label}</ToneBadge>;
}
