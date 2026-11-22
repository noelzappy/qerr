// The small tag that marks a value the panel filled in for you ("Auto", "From the provider"), beside a field's label. It is text, so a
// screen reader reads it with the label; the value stays editable, and the tag goes once a person changes it.
import { cn } from '@/lib/utils';

export function AutoTag({ children = 'Auto', className }: { children?: string; className?: string }) {
  return <span className={cn('ml-1 shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-medium leading-4 text-primary', className)}>{children}</span>;
}
