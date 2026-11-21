// A button that shows a spinner and is disabled while its work runs, so a second click does nothing. It is a plain
// button unless `type` says otherwise. Phones get a 44 px tap target.
import type { ComponentProps } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function BusyButton({ loading = false, disabled, className, children, type = 'button', ...rest }: ComponentProps<typeof Button> & { loading?: boolean }) {
  return (
    <Button {...rest} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cn('max-sm:min-h-11', className)}>
      {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  );
}

// The spinner on its own, for a small wait inside a card or a row.
export function Spin({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-primary', className)} aria-hidden="true" />;
}
