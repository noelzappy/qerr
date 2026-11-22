// The look's sample pictures, larger than the strip on the other tabs, in a few columns beside the choices. While previews are not
// available they are quiet placeholders named by kind; a click enlarges one. Collapsible on phones, where they come first.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { kindName } from '../look-model';
import type { PreviewSample } from '../look-types';
import type { SampleState } from '../use-look-samples';

export function LookSamples({ state, kinds, lookName, className }: { state: SampleState; kinds: string[]; lookName: string; className?: string }) {
  const [open, setOpen] = useState<PreviewSample | null>(null);
  const [shown, setShown] = useState(true);
  const bySample = new Map(state.samples.map((s) => [s.kind, s]));
  return (
    <section aria-label="Samples of the look" className={cn('flex flex-col gap-2', className)}>
      <button type="button" aria-expanded={shown} onClick={() => setShown((v) => !v)} className="flex min-h-11 items-center gap-1.5 text-left text-[13.5px] font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:hidden">
        Samples <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', !shown && '-rotate-90')} />
      </button>
      <div className={cn('flex flex-col gap-1.5', !shown && 'max-md:hidden')}>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3" aria-busy={state.status === 'loading'}>
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
                  <div className={cn('flex aspect-[4/5] w-full items-end justify-center overflow-hidden rounded-sm bg-muted/50 p-1 text-center text-[11px] leading-tight text-muted-foreground', s && !s.ok && 'ring-1 ring-inset ring-border')} title={s && !s.ok ? s.error : undefined}>
                    <span className="max-w-full truncate">{name}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {state.status === 'unavailable' && <p className="text-[12px] text-muted-foreground">Samples appear here once previews are switched on</p>}
        {state.status === 'error' && <p className="text-[12px] text-muted-foreground">{state.error}</p>}
      </div>
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
    </section>
  );
}
