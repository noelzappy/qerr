// "Design": which of the look's designs draws this kind of post, as a row of cards (a radio group: one tab stop, arrow keys move). A card
// shows the design's sample picture when the server can draw one (use-design-samples), else its name on a quiet card. Automatic lets the
// app pick a design from the post, so a batch varies. What is stored is unchanged: the design's index as `variant`, left out for Automatic.
import { useId } from 'react';
import { LayoutTemplate, Shuffle } from 'lucide-react';
import { Hint } from '@/components/kit';
import { cn } from '@/lib/utils';

export interface DesignOption { variant: number; name: string; describe: string }

export function DesignChooser({ options, value, onChange, pictures = {}, disabled }: {
  options: DesignOption[];
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  pictures?: Record<number, string>;
  disabled?: boolean;
}) {
  const id = useId();
  const chosen = options.find((o) => o.variant === value);
  const tip = chosen?.describe || 'Automatic picks a design from the post, so a batch varies.';
  const card = (key: string, on: boolean, label: string, pick: () => void, body: React.ReactNode) => (
    <label key={key}
      className={cn(
        'group flex w-[5.5rem] shrink-0 cursor-pointer flex-col gap-1 rounded-md p-1 text-[12px] font-medium leading-tight transition-colors sm:w-24',
        'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
        on ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}>
      <input type="radio" name={id} checked={on} disabled={disabled} className="sr-only" onChange={pick} />
      <span className={cn('relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-[5px] border bg-muted/60', on && 'border-primary ring-2 ring-primary')}>{body}</span>
      <span className="line-clamp-2 px-0.5">{label}</span>
    </label>
  );
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" disabled={disabled} aria-describedby={`${id}-tip`}>
      <legend className="mb-1.5 flex items-center gap-1 text-sm font-medium"><span>Design</span><Hint about="Design" id={`${id}-tip`}>{tip}</Hint></legend>
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {card('auto', value === undefined, 'Automatic', () => onChange(undefined), <Shuffle className="size-5 text-muted-foreground" aria-hidden="true" />)}
        {options.map((o) => card(String(o.variant), o.variant === value, o.name, () => onChange(o.variant),
          pictures[o.variant]
            ? <img src={pictures[o.variant]} alt="" loading="lazy" className="size-full object-cover" />
            : <LayoutTemplate className="size-5 text-muted-foreground/70" aria-hidden="true" />))}
      </div>
    </fieldset>
  );
}
