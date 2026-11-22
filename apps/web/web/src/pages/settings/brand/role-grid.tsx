// Brand and look, Colours, Fine-tune: each colour role as one swatch in a grid instead of a row with a picker and a hex box. A swatch
// says whether it is Automatic (made from the four colours) or Set by you; opening it gives the picker, the exact hex code and
// "Reset to automatic".
import { RotateCcw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ColourControl } from './fields';

export function RoleTile({ label, value, set, onSet, onReset }: { label: string; value: string | undefined; set: boolean; onSet: (v: string) => void; onReset: () => void }) {
  const state = set ? 'Set by you' : 'Automatic';
  return (
    <li className="min-w-0">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`${label}: ${value ?? 'not known yet'}, ${state.toLowerCase()}. Change`}
            className={cn('flex w-full min-w-0 items-center gap-2 rounded-md border bg-background p-1.5 text-left outline-none transition-colors hover:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:p-2',
              set && 'border-foreground/40')}>
            <span aria-hidden="true" className={cn('size-8 shrink-0 rounded-[5px] border border-foreground/15', !value && 'bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:8px_8px]')} style={value ? { backgroundColor: value } : undefined} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[12.5px] leading-tight font-medium">{label}</span>
              <span aria-hidden="true" className={cn('truncate text-[11.5px] leading-tight', set ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {state}<span className="font-mono text-muted-foreground"> {value?.toUpperCase() ?? ''}</span>
              </span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-72 flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium">{label}</span>
            <span className={cn('text-[12px]', set ? 'font-medium' : 'text-muted-foreground')}>{state}</span>
          </div>
          <ColourControl label={label} value={value ?? ''} onChange={onSet} allowEmpty />
          {set
            ? <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onReset}><RotateCcw aria-hidden="true" /> Reset to automatic</Button>
            : <p className="text-[12px] text-muted-foreground">Made from the four colours. Pick a colour to set it yourself.</p>}
        </PopoverContent>
      </Popover>
    </li>
  );
}
