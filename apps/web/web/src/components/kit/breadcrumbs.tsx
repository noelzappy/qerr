// The trail above a page title: Create / March posts / Edit post. Every item but the last is a link; the last is the
// current page. On a phone only a "back to the parent" link shows.
//
//   <Breadcrumbs items={[{ label: 'Create', to: '/create' }, { label: batch.title, to: `/create/${batch.id}` }, { label: 'Edit post' }]} />
import { ArrowLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface Crumb { label: string; to?: string }

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null;
  const parent = [...items.slice(0, -1)].reverse().find((i) => i.to);
  const link = 'rounded-sm outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50';
  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0 text-[12.5px] text-muted-foreground', className)}>
      <ol className="flex min-w-0 items-center gap-1 max-sm:hidden">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${i}-${item.label}`} className={cn('flex min-w-0 items-center gap-1', last && 'flex-1')}>
              {i > 0 && <ChevronRightIcon className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />}
              {last || !item.to
                ? <span title={item.label} aria-current={last ? 'page' : undefined} className={cn('max-w-[32ch] truncate', last && 'max-w-[48ch] text-foreground')}>{item.label}</span>
                : <Link to={item.to} title={item.label} className={cn('max-w-[24ch] truncate', link)}>{item.label}</Link>}
            </li>
          );
        })}
      </ol>
      {parent?.to && (
        <Link to={parent.to} title={parent.label} className={cn('hidden min-h-9 max-w-full items-center gap-1.5 max-sm:inline-flex', link)}>
          <ArrowLeftIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{parent.label}</span>
        </Link>
      )}
    </nav>
  );
}
