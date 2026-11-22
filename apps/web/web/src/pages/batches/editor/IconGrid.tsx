// The headline's "Icon" button: a small grid of the engine's icons in a popover. A tap puts that icon's mark at the cursor. The
// glyphs here are close stand-ins drawn with the app's icon set (the engine draws its own); each button is named by the icon's
// name. Arrow keys move through the grid, Home and End go to the first and last.
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowRight, ArrowUpRight, Calendar, Check, Circle, Clock, Dot, Gift, Heart, Leaf, Lock, Mail, MapPin, Phone, Play, Plus, Shield, Shapes, Soup,
  Sparkle, Star, Tag, Ticket, User, Zap, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const GLYPH: Record<string, LucideIcon> = {
  'arrow-right': ArrowRight, 'arrow-up-right': ArrowUpRight, check: Check, plus: Plus, star: Star, spark: Sparkle, heart: Heart, bolt: Zap,
  leaf: Leaf, calendar: Calendar, clock: Clock, pin: MapPin, ticket: Ticket, tag: Tag, gift: Gift, phone: Phone, mail: Mail, user: User,
  play: Play, dot: Dot, lock: Lock, shield: Shield, bowl: Soup,
};
const COLS = 6;
export const iconWords = (name: string) => name.replace(/-/g, ' ');

export function IconGrid({ icons, onPick, disabled, keepSelection }: {
  icons: string[];
  onPick: (name: string) => void;
  disabled?: boolean;
  // Stops the headline box losing its selection when the button is pressed.
  keepSelection?: (e: React.MouseEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  function move(e: KeyboardEvent<HTMLDivElement>) {
    const buttons = [...(grid.current?.querySelectorAll('button') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, ArrowDown: at + COLS, ArrowUp: at - COLS, Home: 0, End: buttons.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, to))]?.focus();
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label="Put an icon at the cursor" onMouseDown={keepSelection} className="h-7 max-sm:min-h-9">
          <Shapes aria-hidden="true" /> Icon
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2" onCloseAutoFocus={(e) => e.preventDefault()}>
        <div ref={grid} role="group" aria-label="Icons" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }} onKeyDown={move}>
          {icons.map((name) => {
            const G = GLYPH[name] ?? Circle;
            return (
              <Button key={name} type="button" variant="ghost" size="icon" className="size-9 max-sm:size-11" aria-label={`${iconWords(name)} icon`}
                onClick={() => { setOpen(false); onPick(name); }}>
                <G className="size-[18px]" aria-hidden="true" />
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
