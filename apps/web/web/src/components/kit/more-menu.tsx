// A "more actions" icon button that opens a menu. Use it for the actions beyond the first two or three on a page or row;
// destructive ones get `tone: 'danger'` (red text) and should still open their usual confirmation.
//
//   <MoreMenu items={[{ label: 'Duplicate', onSelect: duplicate }, { label: 'Delete', tone: 'danger', onSelect: () => setConfirm(true) }]} />
import type { ReactNode } from 'react';
import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface MoreMenuItem { label: string; onSelect: () => void; tone?: 'danger'; disabled?: boolean; icon?: ReactNode }

export function MoreMenu({ items, label = 'More actions', align = 'end', className, disabled }: { items: MoreMenuItem[]; label?: string; align?: 'start' | 'center' | 'end'; className?: string; disabled?: boolean }) {
  const firstDanger = items.findIndex((i) => i.tone === 'danger');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} disabled={disabled} className={cn('text-muted-foreground max-sm:size-11', className)}>
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-44">
        {items.map((item, i) => (
          <div key={`${i}-${item.label}`} className="contents">
            {i === firstDanger && i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem variant={item.tone === 'danger' ? 'destructive' : 'default'} disabled={item.disabled} onSelect={item.onSelect} className="max-sm:min-h-11">
              {item.icon}{item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
