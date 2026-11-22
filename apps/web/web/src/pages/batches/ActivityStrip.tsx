// A strip above a batch while its images are being made or it is being sent: "Rendering 4 of 10", "Sending 3 of 8",
// with the runs that failed listed under it. When the work settles it asks the page to load the posts again.
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { failureLine } from '@/lib/errors';
import { Progress } from '@/components/ui/progress';
import { useActivity } from '@/hooks/use-activity';
import { FailureText } from '@/components/failure-text';
import { isActive, percent, recentFailures, runTitle, type ActivityRun } from '@/lib/activity';

export function BatchActivityStrip({ batchId, onSettled }: { batchId: string; onSettled: () => void }) {
  const { items, active } = useActivity({ batchId, status: 'all', pageSize: 100 });
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const wasActive = useRef(false);
  const busyNow = active.some((r) => r.kind === 'render-post' || r.kind === 'send-batch');
  useEffect(() => {
    if (wasActive.current && !busyNow) settled.current();
    wasActive.current = busyNow;
  }, [busyNow]);

  const renders = items.filter((r) => r.kind === 'render-post');
  const activeRenders = renders.filter(isActive);
  // The renders that belong to the same wave as the ones still going: queued since the first of them was queued.
  const waveStart = activeRenders.length ? Math.min(...activeRenders.map((r) => Date.parse(r.createdAt))) - 1000 : null;
  const wave = waveStart === null ? [] : renders.filter((r) => Date.parse(r.createdAt) >= waveStart);
  const renderDone = wave.filter((r) => !isActive(r)).length;
  const send = items.find((r) => r.kind === 'send-batch' && isActive(r));

  const failures = recentFailures(items, Date.now());

  if (!wave.length && !send && !failures.length) return null;

  const sendPct = send ? percent(send.progress) : null;
  return (
    <section className="mb-4 flex flex-col gap-2.5 border-b pb-3" aria-label="Background work on this batch">
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        {wave.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[13.5px]"><strong className="font-medium">Making images: {renderDone} of {wave.length}</strong> {wave.length === 1 ? 'post' : 'posts'}</p>
            <Progress value={Math.round((renderDone / wave.length) * 100)} aria-label={`Making images, ${renderDone} of ${wave.length}`} />
          </div>
        )}
        {send && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[13.5px]"><strong className="font-medium">{send.progress && typeof send.progress.done === 'number' && typeof send.progress.total === 'number' ? `Sending ${send.progress.done} of ${send.progress.total}` : send.status === 'queued' ? 'Waiting to send' : send.progress?.step ?? 'Sending'}</strong></p>
            <Progress value={sendPct} aria-label={`Sending to Buffer: ${send.progress?.step ?? 'working'}`} />
          </div>
        )}
      </div>
      {failures.length > 0 && <FailureList runs={failures} batchId={batchId} />}
    </section>
  );
}

// One line that says what failed (with the reason when every run failed for the same one), and the runs, one line each,
// behind a disclosure. A single failure is shown in full.
function FailureList({ runs, batchId }: { runs: ActivityRun[]; batchId: string }) {
  const reasons = new Set(runs.map((r) => failureLine(r.error ?? 'It failed.')));
  const same = reasons.size === 1 ? [...reasons][0] : null;
  const head = runs.length === 1 ? '1 job failed' : `${runs.length} jobs failed`;
  if (runs.length === 1) {
    const r = runs[0]!;
    return (
      <div role="alert" className="flex flex-wrap items-baseline gap-x-2 text-[13px] [overflow-wrap:anywhere]">
        <span className="font-semibold text-destructive">{runTitle(r.title)}:</span>
        <FailureText text={r.error ?? 'It failed.'} className="min-w-0" />
        <RunLinks run={r} batchId={batchId} />
      </div>
    );
  }
  return (
    <details role="alert" className="group text-[13px]">
      <summary className="flex w-fit cursor-pointer list-none items-start gap-1.5 [overflow-wrap:anywhere] max-sm:min-h-11 max-sm:items-center [&::-webkit-details-marker]:hidden">
        <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 max-sm:mt-0" aria-hidden="true" />
        <span><span className="font-semibold text-destructive">{head}</span>{same && <span className="text-muted-foreground"> · {same}</span>}</span>
      </summary>
      <ul className="mt-2 flex flex-col divide-y rounded-md border">
        {runs.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5 [overflow-wrap:anywhere]">
            <span className="min-w-0 flex-1 font-medium">{runTitle(r.title)}</span>
            {!same && <span className="min-w-0 basis-full text-muted-foreground sm:order-none sm:basis-auto">{failureLine(r.error ?? 'It failed.')}</span>}
            <RunLinks run={r} batchId={batchId} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function RunLinks({ run, batchId }: { run: ActivityRun; batchId: string }) {
  return (
    <span className="flex shrink-0 gap-3 whitespace-nowrap">
      {run.postId && <Link to={`/batches/${batchId}/posts/${run.postId}`} className="font-medium text-primary underline-offset-4 hover:underline">Open the post</Link>}
      <Link to={`/activity/${run.id}`} className="text-muted-foreground underline-offset-4 hover:underline">Details</Link>
    </span>
  );
}
