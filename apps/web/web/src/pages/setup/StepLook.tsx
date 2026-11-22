// Step 3, Your look: one of the looks Qerr ships, chosen from the gallery with live samples of the chosen one (the Looks
// gallery's own SampleStrip and sample hook, drawn in the brand just saved). Clean is chosen unless another look is in use.
// Saved with PUT /api/settings/looks/active; the step is recorded as done, since every saved brand already starts on a look.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useLoad } from '../../hooks';
import { useAppInfo } from '../../app-info';
import { errorMessage } from '../../lib/errors';
import { BusyButton, ErrorBlock, FormProblem } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { SampleStrip } from '../settings/looks/SampleStrip';
import { kindOrder } from '../settings/looks/look-model';
import { afterLookChange, lookApi } from '../settings/looks/looks-api';
import { useLookSamples } from '../settings/looks/use-look-samples';
import { DEFAULT_LOOK, initialLook } from './flow';
import { StepActions, StepHeader, type StepProps } from './parts';

export function StepLook({ status, mark, next }: StepProps) {
  const data = useLoad(() => lookApi.list(), []);
  const appInfo = useAppInfo();
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const d = data.data;
  useEffect(() => { if (d && chosen === null) setChosen(initialLook(d.activeRef ?? status.steps.look.activeRef, d.shipped)); }, [d, chosen, status.steps.look.activeRef]);
  const samples = useLookSamples(chosen ? { ref: chosen } : null);

  if (data.error) return <ErrorBlock message={data.error} onRetry={() => void data.reload()} />;
  if (!d) return <div className="flex flex-col gap-3"><Skeleton className="h-7 w-48" /><Skeleton className="h-40" /><Skeleton className="h-48" /></div>;
  const kinds = kindOrder(d.catalogue);
  // A look of the brand's own that is in use stays offered first, so continuing never switches it away by surprise.
  const own = d.own.filter((l) => l.ref === d.activeRef);
  const options = [...own, ...d.shipped];
  const current = options.find((l) => l.ref === chosen) ?? null;

  async function proceed() {
    if (!chosen) return;
    setBusy(true); setError('');
    try {
      if (chosen !== d!.activeRef) {
        await lookApi.use(chosen);
        afterLookChange();
        appInfo.reload();
        toast.success(`${current?.name ?? 'The look'} is now in use.`);
      }
      await mark('look', 'done');
      next();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <StepHeader title="Your look">How every post is drawn: typeface, layout and pictures. You can change it any time.</StepHeader>

      {current && (
        <section aria-label={`Samples of ${current.name}`} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="text-[14px] font-semibold">{current.name}</h2>
            <p className="text-[12.5px] text-muted-foreground">{current.description}</p>
          </div>
          <SampleStrip state={samples} kinds={kinds} lookName={current.name} />
        </section>
      )}

      <fieldset className="min-w-0">
        <legend className="mb-2 text-[14px] font-semibold">Looks</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((l) => (
            <label key={l.ref} className={cn('flex min-h-11 cursor-pointer flex-col gap-0.5 rounded-md border bg-background p-3 transition-colors hover:border-foreground/40 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
              chosen === l.ref && 'border-primary ring-1 ring-primary')}>
              <input type="radio" name="setup-look" className="sr-only" checked={chosen === l.ref} onChange={() => setChosen(l.ref)} />
              <span className="flex items-center gap-2 text-[13.5px] font-medium">
                {l.name}
                {l.ref === d.activeRef && <span className="text-[12px] font-normal text-muted-foreground">in use</span>}
                {!d.activeRef && l.ref === DEFAULT_LOOK && <span className="text-[12px] font-normal text-muted-foreground">recommended</span>}
              </span>
              <span className="line-clamp-1 text-[12.5px] text-muted-foreground" title={l.description}>{l.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <FormProblem error={error} />
      <StepActions step="look" busy={busy}
        primary={<BusyButton type="button" className="max-sm:min-h-11" loading={busy} disabled={!chosen} onClick={() => void proceed()}>{chosen && chosen !== d.activeRef ? `Use ${current?.name ?? 'this look'} and continue` : 'Continue'}</BusyButton>} />
    </div>
  );
}
