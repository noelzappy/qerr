// Chooses a layout: the built-in ones in groups, then the brand's own. A value is an engine template name or `layout:<id>`.
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { LAYOUT_CATALOGUE, LAYOUT_GROUPS } from './catalogue';
import type { LayoutBrief } from './types';

export function LayoutChooser({ value, onChange, brandLayouts, disabled, allowCarousel = true, error }: {
  value: string;
  onChange: (next: string) => void;
  brandLayouts: LayoutBrief[];
  disabled?: boolean;
  allowCarousel?: boolean;
  error?: string;
}) {
  const id = useId();
  const builtIn = LAYOUT_CATALOGUE.find((l) => l.value === value);
  const own = value.startsWith('layout:') ? brandLayouts.find((l) => `layout:${l.id}` === value) : undefined;
  const known = Boolean(builtIn) || Boolean(own);
  const purpose = builtIn?.purpose ?? (own ? own.description || 'One of your own layouts' : '');
  const describedBy = [purpose ? `${id}-purpose` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>Layout</Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 max-sm:h-11',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        )}
      >
        {!known && value !== '' && <option value={value}>{value}</option>}
        {value === '' && <option value="" disabled>Choose a layout</option>}
        {LAYOUT_GROUPS.filter((g) => g !== 'Carousel' || allowCarousel || value === 'carousel').map((g) => (
          <optgroup key={g} label={g}>
            {LAYOUT_CATALOGUE.filter((l) => l.group === g).map((l) => <option key={l.value} value={l.value}>{l.name}</option>)}
          </optgroup>
        ))}
        {brandLayouts.length > 0 && (
          <optgroup label="Your layouts">
            {brandLayouts.map((l) => <option key={l.id} value={`layout:${l.id}`}>{l.description ? `${l.name}: ${l.description}` : l.name}</option>)}
          </optgroup>
        )}
      </select>
      {purpose && <p id={`${id}-purpose`} className="text-[13px] text-muted-foreground">{purpose}</p>}
      {error && <p id={`${id}-error`} className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}
