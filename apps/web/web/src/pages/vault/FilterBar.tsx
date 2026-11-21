// One compact row of filters for the Facts and Pictures lists: a search box and a few selects, each named by its placeholder
// and aria-label instead of a label above it, and Clear only while something is set. On a phone the selects fold away
// behind a Filters button, so the search box stays the only thing in the way.
import { useState } from 'react';
import { ListFilter, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const ALL = '__all__';

export interface FilterSelect { key: string; label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; allLabel: string }

export function FilterBar({ ariaLabel, search, selects, tag, active, onClear }: {
  ariaLabel: string;
  search: { value: string; onChange: (v: string) => void; placeholder: string };
  selects: FilterSelect[];
  tag: { value: string; onChange: (v: string) => void };
  // Something is set: shows Clear.
  active: boolean;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const setCount = selects.filter((s) => s.value).length + (tag.value ? 1 : 0);
  return (
    <div role="search" aria-label={ariaLabel} className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex items-center gap-2 sm:w-72">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label="Search" placeholder={search.placeholder} value={search.value} onChange={(e) => search.onChange(e.target.value)} className="pl-8 max-sm:h-11" />
        </div>
        <Button type="button" variant="outline" className="sm:hidden max-sm:min-h-11" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ListFilter aria-hidden="true" />Filters{setCount > 0 ? ` (${setCount})` : ''}
        </Button>
      </div>
      <div className={cn('flex-col gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center', open ? 'flex' : 'hidden')}>
        {selects.map((s) => (
          <Select key={s.key} value={s.value} onValueChange={(v) => s.onChange(v === ALL ? '' : v)}>
            <SelectTrigger aria-label={s.label} className="w-full max-sm:h-11 max-sm:text-base sm:w-auto sm:min-w-32">
              <SelectValue placeholder={s.label} />
            </SelectTrigger>
            <SelectContent position="popper">
              {s.value && <SelectItem value={ALL}>{s.allLabel}</SelectItem>}
              {s.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        <Input type="text" aria-label="Tag" placeholder="Tag" value={tag.value} onChange={(e) => tag.onChange(e.target.value)} className="max-sm:h-11 max-sm:text-base sm:w-28" />
      </div>
      {active && <Button type="button" variant="ghost" className="max-sm:min-h-11" onClick={onClear}><X aria-hidden="true" />Clear</Button>}
    </div>
  );
}
