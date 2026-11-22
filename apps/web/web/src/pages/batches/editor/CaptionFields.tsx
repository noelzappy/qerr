// The caption as tabs: "Same for all" (the main caption) and one tab for each network that is switched on, where the post can
// say something different on that network. A network that is off has no tab. Wording already typed for a network that is then
// switched off is kept (and saved with the post, never sent), and a note says so. Each tab keeps its character counters.
import { useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Notice, TextAreaField } from '@/components/kit';
import { NetworkIcon } from '@/components/network-icon';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { networkLabel } from '../../../lib/labels';
import { cn } from '@/lib/utils';
import { CAPTION_LIMIT, NETWORKS, type Network } from '../labels';
import { charCount } from '../util';

export function Counter({ value, limit, name }: { value: string; limit: number; name?: string }) {
  const n = charCount(value);
  const over = n > limit;
  return (
    <span className={cn('whitespace-nowrap font-mono text-xs text-muted-foreground', over && 'font-semibold text-destructive', !over && n > limit * 0.9 && 'text-warning-foreground')}>
      {name && <span className="font-sans font-medium">{name} </span>}{n} / {limit}{over ? `, ${n - limit} over` : ''}
    </span>
  );
}

const own = (caps: Record<string, string>, n: string) => (caps[n] ?? '').trim() !== '';

// Which tabs show and which wording is kept out of sight. Pure, for the spec.
export function captionTabs(on: Record<string, boolean>, caps: Record<string, string>) {
  return {
    tabs: NETWORKS.filter((n) => on[n]),
    kept: NETWORKS.filter((n) => !on[n] && own(caps, n)),
  };
}

// The text a network will get, and whether it is over that network's limit.
export const textFor = (caption: string, caps: Record<string, string>, n: Network) => (own(caps, n) ? caps[n]! : caption);
export const overLimit = (caption: string, caps: Record<string, string>, n: Network) => charCount(textFor(caption, caps, n)) > CAPTION_LIMIT[n];

const listWords = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

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
  const { tabs, kept } = captionTabs(on, caps);
  const [chosen, setChosen] = useState<string>('all');
  // A problem with the shared caption must be seen.
  useEffect(() => { if (error) setChosen('all'); }, [error]);
  // A tab whose network was switched off falls back to "Same for all".
  const tab = chosen === 'all' || tabs.includes(chosen as Network) ? chosen : 'all';
  const shared = tabs.filter((n) => !own(caps, n));
  const keptNames = kept.map(networkLabel);

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={tab} onValueChange={setChosen} className="gap-3">
        <TabsList aria-label="Caption for" className="h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="all" className="flex-none max-sm:min-h-11">Same for all</TabsTrigger>
          {tabs.map((n) => (
            <TabsTrigger key={n} value={n} className="flex-none max-sm:min-h-11" data-network={n}>
              <NetworkIcon network={n} className="size-4" />
              <span className="max-sm:sr-only">{networkLabel(n)}</span>
              {own(caps, n) && <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />}
              {own(caps, n) && <span className="sr-only">, own wording</span>}
              {overLimit(caption, caps, n) && <><CircleAlert className="size-3.5 text-destructive" aria-hidden="true" /><span className="sr-only">, too long</span></>}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="flex flex-col gap-1.5">
          <TextAreaField
            label="Caption for every network" rows={6} value={caption} error={error} onChange={(e) => onCaption(e.target.value)}
            hint="Used on every network that has no wording of its own. Choose a network's tab to write something different there."
          />
          {shared.length > 0 && (
            <p className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Characters for each network">
              {shared.map((n) => <Counter key={n} name={networkLabel(n)} value={caption} limit={CAPTION_LIMIT[n]} />)}
            </p>
          )}
        </TabsContent>

        {tabs.map((n) => (
          <TabsContent key={n} value={n} className="flex flex-col gap-1.5">
            <TextAreaField
              label={`${networkLabel(n)} caption`} optional rows={6} value={caps[n] ?? ''}
              hint={`Left empty, ${networkLabel(n)} gets the caption from Same for all.`}
              onChange={(e) => onCaps({ ...caps, [n]: e.target.value })}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <Counter value={textFor(caption, caps, n)} limit={CAPTION_LIMIT[n]} />
                {!own(caps, n) && <span className="ml-2 text-[12.5px] text-muted-foreground">Same for all is used</span>}
              </span>
              {!own(caps, n) && caption.trim() && (
                <Button type="button" variant="ghost" size="sm" className="max-sm:min-h-11" onClick={() => onCaps({ ...caps, [n]: caption })}>Start from Same for all</Button>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {kept.length > 0 && (
        <Notice
          tone="info"
          actions={<Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" onClick={() => onCaps({ ...caps, ...Object.fromEntries(kept.map((n) => [n, ''])) })}>Remove that wording</Button>}
        >
          Your {listWords(keptNames)} wording is kept while {kept.length === 1 ? 'that network is' : 'those networks are'} off. It is saved with the post but not sent. Switch {kept.length === 1 ? 'it' : 'them'} on to see it.
        </Notice>
      )}
    </div>
  );
}
