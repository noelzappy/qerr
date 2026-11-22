// Brand and look, Design direction: pick one of three whole looks for posts made as a kind of post, judged from real sample
// pictures made from the form's current settings (nothing is saved until the Save bar).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff } from 'lucide-react';
import { Notice } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { DIRECTIONS, DIRECTION_FEEL, DIRECTION_LABEL, type Direction, type DirectionSample } from '../brand-types';
import { Section } from '../section';
import type { DirectionState } from './direction-samples';
import { sectionPath, type BrandCtx } from './model';

const NAME = 'design-direction';

function Thumb({ direction, sample, onOpen }: { direction: Direction; sample: DirectionSample; onOpen: () => void }) {
  const label = `${DIRECTION_LABEL[direction]} sample: ${sample.name}`;
  if (!sample.ok || !sample.image) {
    return (
      <div title={sample.error || 'Could not be made'} className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-sm border border-dashed p-1 text-center text-[11.5px] text-muted-foreground">
        <ImageOff className="size-4" aria-hidden="true" />
        Could not be made
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen} aria-label={`Enlarge: ${label}`} className="block aspect-[4/5] overflow-hidden rounded-sm border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <img src={sample.image} alt={label} loading="lazy" className="size-full object-cover" />
    </button>
  );
}

function Thumbs({ direction, state, onOpen }: { direction: Direction; state: DirectionState | undefined; onOpen: (s: DirectionSample) => void }) {
  if (!state || (state.status === 'loading' && !state.samples.length)) {
    return <div className="grid grid-cols-4 gap-2 max-sm:grid-cols-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/5] rounded-sm" />)}</div>;
  }
  if (state.status === 'error') return null;
  const shown = state.samples.slice(0, 4);
  return (
    <div className={cn('grid grid-cols-4 gap-2 max-sm:grid-cols-2', state.status === 'loading' && 'opacity-60')} aria-busy={state.status === 'loading'}>
      {shown.map((x) => <Thumb key={x.id} direction={direction} sample={x} onOpen={() => onOpen(x)} />)}
    </div>
  );
}

export function DirectionSection({ ctx }: { ctx: BrandCtx }) {
  const { s, directions } = ctx;
  const chosen = s.style.direction ?? null;
  const [open, setOpen] = useState<{ direction: Direction; sample: DirectionSample } | null>(null);
  const choose = (d: Direction | null) => ctx.update((cur) => ({ ...cur, style: { ...cur.style, direction: d } }));
  const states = directions.states;
  const missing = DIRECTIONS.some((d) => states[d]?.logosMissing);
  const failed = DIRECTIONS.filter((d) => states[d]?.status === 'error');

  return (
    <Section id="direction" title="Design direction" description="A direction is a whole look for posts made as a kind of post (a statement, a figure, a list, a quote, a photo). Each shows real samples drawn with your colours and logo, and updates as you change them. Nothing changes until you save.">
      {fields(ctx)}
      {missing && (
        <Notice tone="warn" title="Images wait for your logo" actions={<Button asChild variant="outline" size="sm"><Link to={sectionPath('logos')}>Go to Logos</Link></Button>}>
          Samples appear once you have a logo. You can still choose a direction.
        </Notice>
      )}
      {failed.length > 0 && (
        <Notice tone="bad" title="The samples could not be made." actions={<Button type="button" variant="outline" size="sm" onClick={directions.retry}>Retry</Button>}>
          {states[failed[0]!]?.error}
        </Notice>
      )}
      <div role="radiogroup" aria-label="Design direction" className="flex flex-col gap-3">
        <div className="grid gap-3 lg:grid-cols-3">
          {DIRECTIONS.map((d) => {
            const st = states[d];
            const warnings = st?.samples.reduce((n, x) => n + x.warnings.length, 0) ?? 0;
            return (
              <div key={d} className={cn('flex flex-col gap-2.5 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50')}>
                <label className="flex min-h-11 cursor-pointer items-start gap-2.5 sm:min-h-0">
                  <input type="radio" name={NAME} value={d} checked={chosen === d} onChange={() => choose(d)} className="mt-1 size-4 accent-[var(--primary)]" />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold">{DIRECTION_LABEL[d]}</span>
                    <span className="block text-[12.5px] text-muted-foreground">{DIRECTION_FEEL[d]}</span>
                  </span>
                </label>
                {!st?.logosMissing && <Thumbs direction={d} state={st} onOpen={(sample) => setOpen({ direction: d, sample })} />}
                {warnings > 0 && <p className="text-[12.5px] text-muted-foreground">{warnings} {warnings === 1 ? 'check' : 'checks'} to look at</p>}
              </div>
            );
          })}
        </div>
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2.5 rounded-md border px-3 has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 sm:min-h-9">
          <input type="radio" name={NAME} value="none" checked={chosen === null} onChange={() => choose(null)} className="size-4 accent-[var(--primary)]" />
          <span className="text-[13.5px] font-medium">None: classic layouts</span>
        </label>
      </div>
      {chosen && <p className="text-[13px] text-muted-foreground">Typeface, layout of posts, picture treatment and emphasis are decided by the direction.</p>}

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{DIRECTION_LABEL[open.direction]}: {open.sample.name}</DialogTitle>
                <DialogDescription className="sr-only">A sample post in the {DIRECTION_LABEL[open.direction]} direction.</DialogDescription>
              </DialogHeader>
              {open.sample.image && <img src={open.sample.image} alt={`${DIRECTION_LABEL[open.direction]} sample: ${open.sample.name}`} className="w-full rounded-sm border" />}
              {open.sample.warnings.length > 0 && (
                <ul className="list-disc space-y-1 pl-[18px] text-[13px] text-muted-foreground">
                  {open.sample.warnings.map((w, i) => <li key={i} className="[overflow-wrap:anywhere]">{w}</li>)}
                </ul>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Section>
  );
}

// Field problems the server names under style.direction.
function fields(ctx: BrandCtx) {
  const msg = ctx.fields['style.direction'];
  return msg ? <p className="text-[13px] font-medium text-destructive" role="alert">{msg}</p> : null;
}
