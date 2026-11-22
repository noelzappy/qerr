// One compact block of filters for the Facts and Pictures lists: a search box and a tag box on top, then each filter as one
// tap: segmented buttons for a few choices, chips for a longer list, each starting with "Any". Clear shows only while
// something is set. On a phone the choices fold away behind a Filters button, so the search box stays the only thing in the way.
import { useState } from 'react';
import { ListFilter, Search, X } from 'lucide-react';
import { SegmentedField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// A filter: '' is "any". `display` 'chips' for more than four choices.
export interface FilterChoice { key: string; label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; allLabel: string; display?: 'segmented' | 'chips' }

export function FilterBar({ ariaLabel, search, filters, tag, active, onClear }: {
  ariaLabel: string;
  search: { value: string; onChange: (v: string) => void; placeholder: string };
  filters: FilterChoice[];
  tag: { value: string; onChange: (v: string) => void };
  // Something is set: shows Clear.
  active: boolean;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const setCount = filters.filter((s) => s.value).length + (tag.value ? 1 : 0);
  return (
    <div role="search" aria-label={ariaLabel} className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label="Search" placeholder={search.placeholder} value={search.value} onChange={(e) => search.onChange(e.target.value)} className="pl-8 max-sm:h-11" />
        </div>
        <Input type="text" aria-label="Tag" placeholder="Tag" value={tag.value} onChange={(e) => tag.onChange(e.target.value)} className={cn('max-sm:h-11 max-sm:text-base sm:w-32', !open && 'max-sm:hidden')} />
        <Button type="button" variant="outline" className="sm:hidden max-sm:min-h-11" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ListFilter aria-hidden="true" />Filters{setCount > 0 ? ` (${setCount})` : ''}
        </Button>
        {active && <Button type="button" variant="ghost" className="max-sm:min-h-11" onClick={onClear}><X aria-hidden="true" />Clear</Button>}
      </div>
      <div className={cn('flex-col gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6', open ? 'flex' : 'hidden')}>
        {filters.map((f) => (
          <SegmentedField key={f.key} label={f.label} layout="inline" variant={f.display ?? 'segmented'} value={f.value} onValueChange={f.onChange}
            options={[{ value: '', label: f.allLabel }, ...f.options]} className={f.display === 'chips' ? 'sm:basis-full' : undefined} />
        ))}
      </div>
    </div>
  );
}
