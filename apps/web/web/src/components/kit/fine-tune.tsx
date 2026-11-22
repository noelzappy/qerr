// "Fine-tune": the exact values behind a form's choices, closed until asked for. A button that says whether it is open (aria-expanded), with
// a one-line summary of what is inside while closed. `force` opens it (a problem on a value inside, a value the choices above cannot show).
//
//   <FineTune summary="Instagram 2,200 · X 280" force={!!fields.limits}>…exact fields…</FineTune>
import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FineTune({ children, summary, force = false, label = 'Fine-tune', className }: { children: ReactNode; summary?: ReactNode; force?: boolean; label?: string; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(force);
  useEffect(() => { if (force) setOpen(true); }, [force]);
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        className="-ml-1 inline-flex min-h-8 w-fit max-w-full items-center gap-1.5 rounded-md px-1 text-left text-[13px] font-medium outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11">
        <ChevronRight className={cn('size-4 shrink-0 transition-transform', open && 'rotate-90')} aria-hidden="true" />
        <span className="shrink-0">{label}</span>
        {summary && !open && <span className="min-w-0 truncate font-normal text-muted-foreground">{summary}</span>}
      </button>
      <div id={id} hidden={!open} className="mt-2 flex flex-col gap-3">{open && children}</div>
    </div>
  );
}
