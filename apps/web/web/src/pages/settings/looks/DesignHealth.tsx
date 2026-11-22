// "Design health": the guard rails of a design at a glance, under the canvas. Worked out in the browser while the design is edited; the server's
// sentences replace them when it has spoken. Checks that only the picture can judge (fit, contrast) come from the last image, listed below.
import { CircleAlert, CircleCheck, Minus, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Health, HealthStatus } from './design-health';

const ICON: Record<HealthStatus, { Icon: typeof CircleCheck; cls: string; word: string }> = {
  ok: { Icon: CircleCheck, cls: 'text-success', word: 'Fine' },
  unknown: { Icon: Minus, cls: 'text-muted-foreground', word: 'Checked when the image is made' },
  warn: { Icon: TriangleAlert, cls: 'text-warning-foreground', word: 'Take care' },
  bad: { Icon: CircleAlert, cls: 'text-destructive', word: 'Needs fixing' },
};

export function HealthPanel({ health, warnings }: { health: Health; warnings: string[] }) {
  const bad = health.items.filter((i) => i.status === 'bad').length;
  return (
    <details open={bad > 0} className="rounded-md border px-3 py-2 text-[13px]">
      <summary className="flex min-h-7 cursor-pointer list-none items-center gap-2 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">Design health</span>
        <span className={cn('font-normal', bad ? 'text-destructive' : 'text-muted-foreground')}>{bad ? `${bad} to fix` : warnings.length ? `${warnings.length} note${warnings.length === 1 ? '' : 's'} from the image` : 'All clear'}</span>
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5">
        {health.items.map((i) => {
          const { Icon, cls, word } = ICON[i.status];
          return (
            <li key={i.id} className="flex items-start gap-2">
              <Icon className={cn('mt-0.5 size-4 shrink-0', cls)} aria-label={word} role="img" />
              <div className="min-w-0"><span className="font-medium">{i.label}</span><span className="text-muted-foreground"> {'·'} {i.detail}</span></div>
            </li>
          );
        })}
      </ul>
      {warnings.length > 0 && (
        <div className="mt-2 border-t pt-2">
          <p className="mb-1 text-[12.5px] font-medium">From the last image</p>
          <ul className="list-disc space-y-0.5 pl-[18px] text-muted-foreground">{warnings.map((w, i) => <li key={i} className="[overflow-wrap:anywhere]">{w}</li>)}</ul>
        </div>
      )}
      <p className="mt-2 text-[12px] text-muted-foreground">Vesk makes the final check when you save and publish.</p>
    </details>
  );
}
