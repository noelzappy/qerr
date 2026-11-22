// A strip of the seven kinds of post as small pictures of a look. While previews are not available it shows quiet placeholders
// named by kind (no error styling); when pictures arrive they replace them, and a click enlarges one.
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { kindName } from './look-model';
import type { PreviewSample } from './look-types';
import type { SampleState } from './use-look-samples';

export function SampleStrip({ state, kinds, lookName, compact = false, className }: { state: SampleState; kinds: string[]; lookName: string; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState<PreviewSample | null>(null);
  const bySample = new Map(state.samples.map((s) => [s.kind, s]));
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <ul className={cn('grid gap-1.5', compact ? 'grid-cols-7' : 'grid-cols-7 sm:gap-2')} aria-busy={state.status === 'loading'}>
        {kinds.map((kind) => {
          const s = bySample.get(kind);
          const name = kindName(kind);
          return (
            <li key={kind} className="min-w-0">
              {s?.ok && s.image ? (
                <button type="button" onClick={() => setOpen(s)} aria-label={`Enlarge: ${lookName}, ${name}`} className="block aspect-[4/5] w-full overflow-hidden rounded-sm border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  <img src={s.image} alt={`${lookName}: a ${name} post`} loading="lazy" className="size-full object-cover" />
                </button>
              ) : (
                <div className={cn('flex aspect-[4/5] w-full items-end justify-center overflow-hidden rounded-sm bg-muted/50 p-0.5 text-center text-[10px] leading-tight text-muted-foreground', s && !s.ok && 'ring-1 ring-inset ring-border')} title={s && !s.ok ? s.error : undefined}>
                  <span className="max-w-full truncate">{name}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {state.status === 'unavailable' && <p className="text-[12px] text-muted-foreground">Samples appear here once previews are switched on</p>}
      {state.status === 'error' && <p className="text-[12px] text-muted-foreground">{state.error}</p>}
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{lookName}: {kindName(open.kind)}</DialogTitle>
                <DialogDescription className="sr-only">A sample {kindName(open.kind)} post in this look.</DialogDescription>
              </DialogHeader>
              {open.image && <img src={open.image} alt={`${lookName}: a ${kindName(open.kind)} post`} className="w-full rounded-sm border" />}
              {open.warnings.length > 0 && <ul className="list-disc space-y-1 pl-[18px] text-[13px] text-muted-foreground">{open.warnings.map((w, i) => <li key={i} className="[overflow-wrap:anywhere]">{w}</li>)}</ul>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
