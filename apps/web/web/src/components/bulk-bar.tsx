// The bar that appears while rows are ticked: how many, what can be done to them, and Clear. On a phone it is fixed to
// the bottom of the screen; from md up it sticks to the bottom of the content. Escape clears the selection.
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export function BulkBar({ count, noun = 'selected', busy = false, onClear, children }: {
  count: number;
  noun?: string;
  busy?: boolean;
  onClear: () => void;
  // The action buttons. Give each a visible text label.
  children: ReactNode;
}) {
  useEffect(() => {
    if (count === 0) return;
    // A dialog or menu that is open has already used the key (and prevented its default), and so has a text field.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !isTyping(e.target)) onClear(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [count, onClear]);

  if (count === 0) return null;
  return (
    <>
      {/* Keeps the last row clear of the fixed bar on a phone. */}
      <div className="h-36 md:hidden" aria-hidden="true" />
      <div
        role="region"
        aria-label="Bulk actions"
        aria-busy={busy || undefined}
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-lg',
          'md:sticky md:inset-x-auto md:bottom-4 md:z-30 md:rounded-lg md:border md:px-4 md:pb-3',
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="order-1 mr-auto text-sm font-medium" aria-live="polite">{count} {noun}</p>
          <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-2 sm:w-auto max-sm:[&>*]:flex-1">{children}</div>
          <Button variant="ghost" className="order-2 max-sm:min-h-11 sm:order-3" disabled={busy} onClick={onClear}>
            <X aria-hidden="true" />Clear<span className="sr-only"> selection</span>
          </Button>
        </div>
      </div>
    </>
  );
}

// The tick box for one row (or, as the header box, for all rows). Shift-click ticks a range. The hit area is 44 px on a phone.
export function SelectBox({ checked, label, onToggle, className }: {
  checked: boolean;
  label: string;
  onToggle: (range: boolean) => void;
  className?: string;
}) {
  return (
    <Checkbox
      checked={checked}
      aria-label={label}
      // The click carries the shift key; the checked state is ours, so nothing else needs to change it.
      onClick={(e) => { e.stopPropagation(); onToggle(e.shiftKey); }}
      className={cn('relative size-[18px] max-sm:size-5 after:absolute after:-inset-3 after:content-[""]', className)}
    />
  );
}
