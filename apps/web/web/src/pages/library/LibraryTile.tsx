// One picture in the grid: a square thumbnail and its title on one line. A single chip shows only when the picture needs a
// person's eye (a rights problem first, otherwise not yet confirmed). A tile opens the picture's own page; in select mode
// the whole tile is a toggle instead (shift-click ticks a range).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ImageOff } from 'lucide-react';
import { ToneBadge } from '@/components/kit';
import { cn } from '@/lib/utils';
import type { VaultItem } from '../vault-types';
import { CHECKER } from './RoleSwitch';
import { needsRights } from './util';

export function LibraryTile({ item, to, back, selecting = false, selected = false, onToggle }: {
  item: VaultItem;
  // The picture's page, and the list address to come back to.
  to: string;
  back: string;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: (range: boolean) => void;
}) {
  const [broken, setBroken] = useState(false);
  const rights = needsRights(item);
  const frame = 'group flex w-full min-w-0 flex-col gap-1.5 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
  const inner = (
    <>
      <span className={cn('relative block aspect-square w-full overflow-hidden rounded-lg', item.role === 'photo' ? 'bg-muted' : CHECKER, selected && 'ring-[3px] ring-primary')}>
        {item.fileUrl && !broken
          ? <img src={item.fileUrl} alt={item.title} loading="lazy" className={cn('size-full transition-transform group-hover:scale-[1.02]', item.role === 'photo' ? 'object-cover' : 'object-contain p-2')} onError={() => setBroken(true)} />
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
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-medium">{item.title}</span>
        {rights ? <ToneBadge tone="bad" dot className="flex-none">Rights</ToneBadge>
          : item.status === 'unconfirmed' ? <ToneBadge tone="warn" dot className="flex-none">Unconfirmed</ToneBadge> : null}
      </span>
    </>
  );
  return (
    <li className="min-w-0">
      {selecting
        ? <button type="button" onClick={(e) => onToggle?.(e.shiftKey)} aria-pressed={selected} className={frame}>{inner}</button>
        : <Link to={to} state={{ back }} className={frame}>{inner}</Link>}
    </li>
  );
}
