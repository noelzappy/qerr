// "Kind of post": the seven kinds of a `post` design as one row of choices (a radio group), with what the chosen kind is for on one line.
import { useId } from 'react';
import { cn } from '@/lib/utils';
import { POST_KIND_CATALOGUE } from './catalogue';

export function KindChooser({ value, onChange, disabled }: { value: string; onChange: (kind: string) => void; disabled?: boolean }) {
  const id = useId();
  const chosen = POST_KIND_CATALOGUE.find((k) => k.value === value);
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" disabled={disabled} aria-describedby={chosen ? `${id}-purpose` : undefined}>
      <legend className="mb-1.5 text-sm font-medium">Kind of post</legend>
      <div className="flex flex-wrap gap-1.5">
        {POST_KIND_CATALOGUE.map((k) => {
          const on = k.value === value;
          return (
            <label
              key={k.value}
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-[13px] font-medium transition-colors sm:min-h-8',
                'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
                on ? 'border-primary bg-primary text-primary-foreground' : 'bg-transparent hover:bg-accent',
              )}
            >
              <input type="radio" name={id} value={k.value} checked={on} disabled={disabled} className="sr-only" onChange={() => onChange(k.value)} />
              {k.name}
            </label>
          );
        })}
      </div>
      {chosen && <p id={`${id}-purpose`} className="text-[12.5px] text-muted-foreground">{chosen.purpose}</p>}
    </fieldset>
  );
}
