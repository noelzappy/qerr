// Vesk's own mark and word, drawn here (no image file): a rounded square with a check-like stroke, then the name.
import { cn } from '@/lib/utils';

export function VeskLogo({ className, word = true }: { className?: string; word?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight text-foreground', className)}>
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true">
        <rect width="24" height="24" rx="7" className="fill-primary" />
        <path d="M6.5 8.5 11 16l6.5-9" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary-foreground" />
      </svg>
      {word && <span className="text-[17px]">Vesk</span>}
    </span>
  );
}
