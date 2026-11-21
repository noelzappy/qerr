// The one panel for every create, edit and detail form. On a desktop it is a Sheet from the right; on a phone the same
// content is a Drawer from the bottom. Both have the same anatomy: a header (title and description), a body that scrolls,
// and a footer that stays pinned, so the buttons never scroll away with a long form.
//
// While `busy` the panel cannot be closed, and by default a click outside does not close it either, so a slip does not
// lose what was typed. Put the primary button in `footer` and tie it to the form with `form="<form id>"`.
import type { ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

export type PanelSize = 'sm' | 'md' | 'lg' | 'xl';

// Widths on a desktop. A phone always uses the full width.
const WIDTH: Record<PanelSize, string> = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

export interface FormPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  size?: PanelSize;
  // Saving or another action is running: the panel cannot be closed.
  busy?: boolean;
  // Off by default for forms.
  dismissOnOutside?: boolean;
  // The buttons, secondary first and the primary action last.
  footer?: ReactNode;
  children: ReactNode;
}

export function FormPanel({ open, onClose, title, description, size = 'md', busy = false, dismissOnOutside = false, footer, children }: FormPanelProps) {
  const isMobile = useIsMobile();
  const onOpenChange = (next: boolean) => { if (!next && !busy) onClose(); };
  const keepOpenOnOutside = dismissOnOutside ? undefined : (e: Event) => e.preventDefault();
  const noDescription = description ? {} : { 'aria-describedby': undefined };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} dismissible={!busy}>
        <DrawerContent {...noDescription} onInteractOutside={keepOpenOnOutside} className="data-[vaul-drawer-direction=bottom]:max-h-[90dvh]">
          <DrawerHeader className="relative pr-14 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle className="text-lg">{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
            <DrawerClose
              className="absolute top-1 right-2 flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
              aria-label="Close"
              disabled={busy}
            >
              <XIcon className="size-5" aria-hidden="true" />
            </DrawerClose>
          </DrawerHeader>
          {/* No drag-to-dismiss from the body: dragging there would fight with scrolling and text selection. */}
          <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-4 py-4">{children}</div>
          {footer && (
            <DrawerFooter className="flex-none flex-col-reverse gap-2 border-t pb-[max(1rem,env(safe-area-inset-bottom))] [&>*]:min-h-11 [&>*]:w-full">
              {footer}
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent {...noDescription} onInteractOutside={keepOpenOnOutside} className={cn('w-full gap-0 p-0', WIDTH[size])}>
        <SheetHeader className="gap-1.5 border-b px-6 py-5 pr-14">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <SheetFooter className="mt-0 flex-none flex-row flex-wrap justify-end gap-2 border-t px-6 py-4">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
