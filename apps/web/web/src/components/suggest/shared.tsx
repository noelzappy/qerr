// What the AI suggestion components share: whether suggestions can run (GET /api/suggest), and the mark that says a value
// came from the AI. A suggestion is never saved by itself: a person uses it (it then fills an editable field) or leaves it.
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '@/api';
import { cn } from '@/lib/utils';

export interface SuggestReady { available: boolean; reason: string | null }

// null while it is not known yet. A failed check reads as "unknown" too: the request itself will say what is wrong.
export function useSuggestReady(): SuggestReady | null {
  const [ready, setReady] = useState<SuggestReady | null>(null);
  useEffect(() => {
    let live = true;
    api.get<SuggestReady>('/api/suggest').then((r) => { if (live) setReady(r); }, () => { if (live) setReady(null); });
    return () => { live = false; };
  }, []);
  return ready;
}

// "Suggested by the AI", or another short label, with the sparkle icon. Muted, small.
export function AiMark({ children = 'Suggested by the AI', className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground', className)}>
      <Sparkles className="size-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}
