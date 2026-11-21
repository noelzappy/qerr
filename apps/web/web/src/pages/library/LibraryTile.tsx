// One picture in the grid: a square thumbnail, its title and the badges that need a person's eye.
import { useState } from 'react';
import { Check, ImageOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { kindLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { VaultItem } from '../vault-types';
import { needsRights } from './util';

// In select mode the whole tile is a toggle (shift-click ticks a range) instead of opening the picture.
export function LibraryTile({ item, onOpen, selecting = false, selected = false, onToggle }: {
  item: VaultItem;
  onOpen: (item: VaultItem) => void;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: (range: boolean) => void;
}) {
  const [broken, setBroken] = useState(false);
  const rights = needsRights(item);
  return (
    <li className="min-w-0">
      <button type="button" onClick={(e) => (selecting ? onToggle?.(e.shiftKey) : onOpen(item))} aria-pressed={selecting ? selected : undefined}
        className="group flex w-full min-w-0 flex-col gap-2 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className={cn('relative block aspect-square w-full overflow-hidden rounded-lg border bg-muted', selected && 'border-primary ring-[3px] ring-primary')}>
          {item.fileUrl && !broken
            ? <img src={item.fileUrl} alt={item.title} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.02]" onError={() => setBroken(true)} />
            : (
              <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
                <ImageOff className="size-6" aria-hidden="true" />
                {item.hasFile ? 'Preview not available' : 'No image yet'}
              </span>
            )}
          {selecting && (
            <span aria-hidden="true" className={cn('absolute left-2 top-2 flex size-6 items-center justify-center rounded-[5px] border-2 shadow-xs', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-white bg-black/30')}>
              {selected && <Check className="size-4" />}
            </span>
          )}
        </span>
        <span className="block min-w-0">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            <Badge variant="secondary">{kindLabel(item.kind)}</Badge>
            {item.status === 'unconfirmed' && <Badge variant="warning">Unconfirmed</Badge>}
            {rights && <Badge variant="destructive">Rights</Badge>}
          </span>
        </span>
      </button>
    </li>
  );
}
