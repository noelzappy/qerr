// "Design" for a brand on classic layouts: the built-in layouts in groups, then the brand's own (the kit's select, with groups). A value is
// an engine template name or `layout:<id>`.
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { pageLayouts, PAGE_TEMPLATES } from '../design-model';
import { LAYOUT_CATALOGUE, LAYOUT_GROUPS } from './catalogue';
import type { LayoutBrief } from './types';

// page: the layout of one page of a carousel, so only what a page can be (the page layouts, and the brand's layouts that have the
// feed size, the only size of a carousel).
export function LayoutChooser({ value, onChange, brandLayouts, disabled, page = false, error }: {
  value: string;
  onChange: (next: string) => void;
  brandLayouts: LayoutBrief[];
  disabled?: boolean;
  page?: boolean;
  error?: string;
}) {
  const id = useId();
  const builtIn = LAYOUT_CATALOGUE.find((l) => l.value === value);
  const own = value.startsWith('layout:') ? brandLayouts.find((l) => `layout:${l.id}` === value) : undefined;
  const builtInChoices = page ? PAGE_TEMPLATES : LAYOUT_CATALOGUE;
  const ownChoices = page ? pageLayouts(brandLayouts) : brandLayouts;
  // A value no choice has (a layout since removed, or one a page cannot use) stays listed, under its id.
  const known = builtInChoices.some((l) => l.value === value) || ownChoices.some((l) => `layout:${l.id}` === value);
  const purpose = builtIn?.purpose ?? (own ? own.description || 'One of your own layouts' : '');
  const describedBy = [purpose ? `${id}-purpose` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>Design</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full min-w-0 max-sm:h-11 max-sm:text-base" aria-invalid={error ? true : undefined} aria-describedby={describedBy}>
          <SelectValue placeholder="Choose a design" />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-[min(24rem,var(--radix-select-content-available-height))]">
          {!known && value !== '' && <SelectItem value={value}>{value.replace('layout:', 'Your layout: ')}</SelectItem>}
          {LAYOUT_GROUPS.filter((g) => builtInChoices.some((l) => l.group === g)).map((g) => (
            <SelectGroup key={g}>
              <SelectLabel>{g}</SelectLabel>
              {builtInChoices.filter((l) => l.group === g).map((l) => <SelectItem key={l.value} value={l.value}>{l.name}</SelectItem>)}
            </SelectGroup>
          ))}
          {ownChoices.length > 0 && (
            <SelectGroup>
              <SelectLabel>Your layouts</SelectLabel>
              {ownChoices.map((l) => <SelectItem key={l.id} value={`layout:${l.id}`}>{l.description ? `${l.name}: ${l.description}` : l.name}</SelectItem>)}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      {purpose && <p id={`${id}-purpose`} className="text-[13px] text-muted-foreground">{purpose}</p>}
      {error && <p id={`${id}-error`} className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}
