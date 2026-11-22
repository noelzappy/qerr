// The networks as a row of icon chips. NetworkToggles: any number switched on (real checkboxes underneath, one per network), used
// wherever a post or a batch says where it goes. NetworkFilter: one network or all of them (real radio buttons, arrow keys move),
// used by a list that shows one channel at a time. The network's name is always the accessible name; on a phone the chip shows
// only the icon and the names that are on are listed beside the row, so colour is never the only cue.
import { useId, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { networkLabel } from '../lib/labels';
import { Hint } from './kit/hint';
import { NetworkIcon } from './network-icon';

export const ALL_NETWORKS = ['instagram', 'linkedin', 'facebook', 'x'] as const;

const CHIP = cn(
  'relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors sm:min-h-8 max-sm:min-w-11 max-sm:justify-center',
  'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
);
const ON = 'border-primary bg-primary/10 text-foreground';
const OFF = 'border-input bg-transparent text-muted-foreground hover:bg-accent [&_[data-icon]]:opacity-45 [&_[data-icon]]:grayscale';

// "Instagram and LinkedIn", "3 networks", "No network".
export function networksSummary(on: readonly string[]): string {
  if (on.length === 0) return 'No network';
  if (on.length <= 2) return on.map(networkLabel).join(' and ');
  return `${on.length} networks`;
}

export function NetworkToggles({ legend = 'Networks', value, onChange, networks = ALL_NETWORKS, error, hint, disabled, extra }: {
  legend?: string;
  value: readonly string[];
  onChange: (next: string[]) => void;
  networks?: readonly string[];
  error?: string;
  hint?: ReactNode;
  disabled?: boolean;
  // Beside a chip, inside the label (a caption counter, say).
  extra?: (network: string) => ReactNode;
}) {
  const id = useId();
  const toggle = (n: string, on: boolean) => {
    const next = on ? [...value, n] : value.filter((x) => x !== n);
    // Keep the networks in their usual order.
    onChange(networks.filter((x) => next.includes(x)));
  };
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" disabled={disabled} aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}>
      <legend className="mb-1.5 flex items-center gap-1 text-sm font-medium">
        <span>{legend}</span>
        {hint && <Hint about={legend} id={`${id}-hint`}>{hint}</Hint>}
      </legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {networks.map((n) => {
          const on = value.includes(n);
          return (
            <label key={n} className={cn(CHIP, on ? ON : OFF)} data-network={n} data-on={on ? 'true' : 'false'}>
              <input type="checkbox" className="sr-only" checked={on} disabled={disabled} onChange={(e) => toggle(n, e.target.checked)} />
              <span data-icon className="inline-flex"><NetworkIcon network={n} className="size-[18px]" /></span>
              <span className="max-sm:sr-only">{networkLabel(n)}</span>
              {extra?.(n)}
              {on && <Check className="size-3.5 text-primary max-sm:absolute max-sm:-top-1.5 max-sm:-right-1.5 max-sm:size-4 max-sm:rounded-full max-sm:bg-primary max-sm:p-0.5 max-sm:text-primary-foreground" strokeWidth={3} aria-hidden="true" />}
            </label>
          );
        })}
        <span className="text-[12.5px] text-muted-foreground sm:hidden" aria-hidden="true">{networksSummary(networks.filter((n) => value.includes(n)))}</span>
      </div>
      {error && <p id={`${id}-error`} className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}
    </fieldset>
  );
}

// One network or all: '' is all.
export function NetworkFilter({ label = 'Channel', value, onChange, networks = ALL_NETWORKS, className }: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  networks?: readonly string[];
  className?: string;
}) {
  const name = useId();
  const chip = (v: string, body: ReactNode) => {
    const on = value === v;
    return (
      <label key={v || 'all'} className={cn(CHIP, 'sm:min-h-7 sm:px-2', on ? ON : OFF)} data-network={v || 'all'}>
        <input type="radio" name={name} className="sr-only" value={v} checked={on} onChange={() => onChange(v)} />
        {body}
      </label>
    );
  };
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-wrap items-center gap-1">
        {chip('', <span>All<span className="sr-only"> channels</span></span>)}
        {networks.map((n) => chip(n, <><span data-icon className="inline-flex"><NetworkIcon network={n} className="size-[18px]" /></span><span className="max-xl:sr-only">{networkLabel(n)}</span></>))}
      </div>
    </fieldset>
  );
}
