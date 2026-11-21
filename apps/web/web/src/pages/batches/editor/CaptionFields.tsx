// The main caption with a character counter for each network that is on, and the optional wording for one network.
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TextAreaField } from '@/components/kit';
import { networkLabel } from '../../../lib/labels';
import { cn } from '@/lib/utils';
import { CAPTION_LIMIT, NETWORKS, type Network } from '../labels';
import { charCount } from '../util';

export function Counter({ value, limit }: { value: string; limit: number }) {
  const n = charCount(value);
  const over = n > limit;
  return <span className={cn('whitespace-nowrap font-mono text-xs text-muted-foreground', over && 'font-semibold text-destructive', !over && n > limit * 0.9 && 'text-warning-foreground')}>{n} / {limit}{over ? `, ${n - limit} over` : ''}</span>;
}

interface Props {
  caption: string;
  onCaption: (next: string) => void;
  caps: Record<string, string>;
  onCaps: (next: Record<string, string>) => void;
  // The networks that are switched on.
  on: Record<string, boolean>;
  error?: string;
}

export function CaptionFields({ caption, onCaption, caps, onCaps, on, error }: Props) {
  const anyFilled = NETWORKS.some((n) => (caps[n] ?? '').trim() !== '');
  // Open by choice, and held open for as long as any network has wording of its own.
  const [chosen, setChosen] = useState(false);
  const open = chosen || anyFilled;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <TextAreaField label="Main caption" rows={6} value={caption} error={error} onChange={(e) => onCaption(e.target.value)} hint="Used on every network that has no wording of its own." />
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {NETWORKS.filter((n) => on[n]).map((n) => (
            <span key={n} className="text-sm">{networkLabel(n)} <Counter value={caps[n]?.trim() ? caps[n]! : caption} limit={CAPTION_LIMIT[n as Network]} /></span>
          ))}
        </div>
      </div>
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="network-captions"
          onClick={() => { if (!anyFilled) setChosen(!chosen); }}
          className="-ml-1 inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-foreground outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11"
        >
          {open ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
          Different wording for one network
        </button>
        {open && (
          <div id="network-captions" className="mt-2 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Leave a box empty to use the main caption.</p>
            {NETWORKS.map((n) => (
              <div key={n} className="flex flex-col gap-1.5">
                <TextAreaField
                  label={<>{networkLabel(n)}{!on[n] && <span className="font-normal text-muted-foreground"> (not sent here)</span>}</>} optional rows={3} value={caps[n] ?? ''}
                  onChange={(e) => onCaps({ ...caps, [n]: e.target.value })}
                />
                {(caps[n] ?? '').trim() !== '' && <Counter value={caps[n]!} limit={CAPTION_LIMIT[n]} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
