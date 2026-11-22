// "Kind of post": the kinds of a `post` design as one row of choices (a radio group), with what the chosen kind is for on one line. The
// brand's named series (Settings, Looks, Series) are kinds of post too: "Tip of the week" sets the kind, the design and the number in turn,
// and writes its mark. A series is a link the server keeps (post.series); choosing a plain kind takes the post out of its series.
import { useId } from 'react';
import { Repeat } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { POST_KIND_CATALOGUE } from './catalogue';
import { seriesSummary, type SeriesInfo, type SeriesRef } from './series-model';

// The series of the brand as kinds of post, and what choosing one does (series-kind.ts).
export interface SeriesSlot {
  list: SeriesInfo[];
  value: SeriesRef | null;
  pick: (id: string) => void;
  // a plain kind chosen while the post is in a series: out of the series, and that kind
  leave: (kind: string) => void;
  renumber: (n: number) => void;
}

const chip = (on: boolean) => cn(
  'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors sm:min-h-8',
  'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
  on ? 'border-primary bg-primary text-primary-foreground' : 'bg-transparent hover:bg-accent',
);

// `offered`: the kinds the brand's look draws; the kind the post already has stays in the row so it is never lost.
export function KindChooser({ value, onChange, offered, disabled, series }: {
  value: string;
  onChange: (kind: string) => void;
  offered?: string[] | null;
  disabled?: boolean;
  series?: SeriesSlot | null;
}) {
  const id = useId();
  const inSeries = series?.value ? series.list.find((s) => s.id === series.value!.id) : undefined;
  const chosen = inSeries ? undefined : POST_KIND_CATALOGUE.find((k) => k.value === value);
  // a series that is switched off, or that the look in use cannot draw, stays on a post that has it but is not offered to others
  const seriesList = (series?.list ?? []).filter((s) => (s.enabled && !s.problems.length) || s.id === series?.value?.id);
  const purpose = inSeries ? seriesSummary(inSeries) : chosen?.purpose;
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" disabled={disabled} aria-describedby={purpose ? `${id}-purpose` : undefined}>
      <legend className="mb-1.5 text-sm font-medium">Kind of post</legend>
      <div className="flex flex-wrap gap-1.5">
        {POST_KIND_CATALOGUE.filter((k) => !offered || offered.includes(k.value) || k.value === value).map((k) => {
          const on = !inSeries && k.value === value;
          return (
            <label key={k.value} className={chip(on)}>
              <input type="radio" name={id} value={k.value} checked={on} disabled={disabled} className="sr-only"
                onChange={() => (series?.value ? series.leave(k.value) : onChange(k.value))} />
              {k.name}
            </label>
          );
        })}
        {seriesList.map((s) => {
          const on = inSeries?.id === s.id;
          return (
            <label key={s.id} className={chip(on)}>
              <input type="radio" name={id} value={`series:${s.id}`} checked={on} disabled={disabled} className="sr-only" onChange={() => series!.pick(s.id)} />
              <Repeat className="size-3.5 opacity-70" aria-hidden="true" />
              <span><span className="sr-only">Series: </span>{s.name}</span>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {purpose && <p id={`${id}-purpose`} className="text-[12.5px] text-muted-foreground">{purpose}</p>}
        {inSeries && series?.value && (
          <span className="flex items-center gap-1.5">
            <Label htmlFor={`${id}-n`} className="text-[12.5px] font-normal text-muted-foreground">Number</Label>
            <Input id={`${id}-n`} type="number" min={1} max={9999} inputMode="numeric" value={String(series.value.number)} disabled={disabled}
              className="h-7 w-20 max-sm:h-11 max-sm:text-base" onChange={(e) => series.renumber(Number(e.target.value))} />
          </span>
        )}
      </div>
    </fieldset>
  );
}
