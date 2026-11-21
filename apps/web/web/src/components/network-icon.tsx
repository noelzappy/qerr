// A small square in each network's colour, with a plain glyph, to tell channels apart at a glance (always with a text label
// or an accessible name next to it: colour is never the only cue).
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { networkLabel } from '../lib/labels';

const STYLE: Record<string, string> = {
  instagram: 'bg-[linear-gradient(135deg,#f58529,#dd2a7b_55%,#8134af)] text-white',
  linkedin: 'bg-[#0a66c2] text-white',
  facebook: 'bg-[#1877f2] text-white',
  x: 'bg-black text-white dark:bg-white dark:text-black',
};

function Glyph({ network }: { network: string }) {
  if (network === 'instagram') return <Camera className="size-[62%]" strokeWidth={2.4} aria-hidden="true" />;
  if (network === 'x') {
    return (
      <svg viewBox="0 0 24 24" className="size-[56%]" aria-hidden="true" fill="currentColor">
        <path d="M18.9 1.2h3.7l-8 9.2L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9zm-1.3 19.4h2L6.5 3.2H4.3z" />
      </svg>
    );
  }
  const letters = network === 'linkedin' ? 'in' : network === 'facebook' ? 'f' : network.slice(0, 1).toUpperCase();
  return (
    <svg viewBox="0 0 20 20" className="size-full" aria-hidden="true">
      <text x="10" y={network === 'facebook' ? 15.5 : 14.5} textAnchor="middle" fontSize={network === 'facebook' ? 15 : 12} fontWeight="700" fill="currentColor" fontFamily="Inter, system-ui, sans-serif">{letters}</text>
    </svg>
  );
}

export function NetworkIcon({ network, className, label = false }: { network: string; className?: string; label?: boolean }) {
  return (
    <span
      className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-[13px]', STYLE[network] ?? 'bg-muted text-foreground', className)}
      role={label ? 'img' : undefined}
      aria-label={label ? networkLabel(network) : undefined}
      aria-hidden={label ? undefined : true}
    >
      <Glyph network={network} />
    </span>
  );
}
