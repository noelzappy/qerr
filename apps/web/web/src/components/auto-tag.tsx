// A small tag beside a label that says the value was filled in for the person ("Auto", "From the headline"). It stays while the
// value follows its source and goes away once the person changes the value, so nothing is ever filled in silently.
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AutoTag({ children = 'Auto', className }: { children?: string; className?: string }) {
  return (
    <span data-auto-tag className={cn('ml-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-px align-middle text-[11px] leading-4 font-medium text-muted-foreground', className)}>
      <Sparkles className="size-3" aria-hidden="true" />
      {children}
    </span>
  );
}
