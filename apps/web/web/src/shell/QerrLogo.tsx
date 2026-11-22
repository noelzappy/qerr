// Qerr's own logo, drawn here from the owner's export (docs/brand/qerr-logo): a ring and a square, then the lowercase
// wordmark in Schibsted Grotesk ExtraBold, with the lockup's own geometry (343x118, the word at x 114 on the square's
// baseline, 113 units tall, tracking -0.055em). The ring and the word take the logo ink (paper in dark mode, see
// --logo-ink in index.css); the square is always the accent.
import { cn } from '@/lib/utils';

export function QerrLogo({ className, word = true }: { className?: string; word?: boolean }) {
  return (
    <svg viewBox={word ? '0 0 343 118' : '0 0 104 104'} role="img" aria-label="Qerr"
      className={cn('h-7 w-auto shrink-0 overflow-visible text-logo-ink', className)}>
      <circle cx="46" cy="46" r="31" fill="none" stroke="currentColor" strokeWidth="14" />
      <rect x="66" y="66" width="30" height="30" fill="var(--logo-accent)" />
      {word && (
        <text x="114" y="96" fill="currentColor" fontFamily="'Schibsted Grotesk', sans-serif" fontWeight="800" fontSize="113" letterSpacing="-6.21">qerr</text>
      )}
    </svg>
  );
}
