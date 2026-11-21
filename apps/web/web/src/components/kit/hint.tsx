// A small info icon beside a label or title that shows a short explanation. It opens on hover, on keyboard focus and on
// click or tap (a tooltip alone does not work on touch), and closes on Escape, on blur and on a tap outside.
//
// Pass `id` to also render the text visually hidden under that id, so a control can point `aria-describedby` at it: the
// kit fields do this, so assistive technology gets the hint without opening anything.
//
//   <Hint about="Time zone" id={hintId}>Posts are planned in this time zone.</Hint>
import { useRef, useState, type ReactNode } from 'react';
import { InfoIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// The plain text of a node, for aria-labels and length checks.
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object' && 'props' in node) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

export function Hint({ about, id, children, className }: { about: ReactNode; id?: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  // Pinned: opened by a click or tap, so leaving with the pointer does not close it.
  const pinned = useRef(false);
  const close = () => { pinned.current = false; setOpen(false); };
  const name = textOf(about).trim();
  return (
    <TooltipProvider delayDuration={150}>
      <span className={cn('inline-flex shrink-0 items-center', className)}>
        <Tooltip open={open} onOpenChange={(next) => { if (next) setOpen(true); else if (!pinned.current) setOpen(false); }}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={name ? `About ${name}` : 'More information'}
              // Without this the tooltip closes on press, and a tap would close what the click then reopens.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => { if (open && pinned.current) close(); else { pinned.current = true; setOpen(true); } }}
              onBlur={close}
              className="relative inline-flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:size-7"
            >
              <InfoIcon className="size-3.5 max-sm:size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" sideOffset={4} onEscapeKeyDown={close} onPointerDownOutside={close} className="max-w-72 text-[12.5px] leading-snug font-normal text-pretty">
            {children}
          </TooltipContent>
        </Tooltip>
        {id && <span id={id} className="sr-only">{children}</span>}
      </span>
    </TooltipProvider>
  );
}
