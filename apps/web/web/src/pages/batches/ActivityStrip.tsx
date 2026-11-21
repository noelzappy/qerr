// A strip above a batch while its images are being made or it is being sent: "Rendering 4 of 10", "Sending 3 of 8",
// with the runs that failed listed under it. When the work settles it asks the page to load the posts again.
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { useActivity } from '@/hooks/use-activity';
import { isActive, percent, recentFailures, type ActivityRun } from '@/lib/activity';

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
    <section className="mb-4 flex flex-col gap-3 border-b pb-4" aria-label="Background work on this batch">
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
      {failures.length > 0 && <FailureList runs={failures} />}
    </section>
  );
}

function FailureList({ runs }: { runs: ActivityRun[] }) {
  return (
    <div role="alert" className="flex flex-col gap-1.5 text-[13px]">
      <p className="font-semibold text-destructive">{runs.length === 1 ? '1 job failed' : `${runs.length} jobs failed`}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 [overflow-wrap:anywhere]">
        {runs.map((r) => (
          <li key={r.id}><Link to={`/activity/${r.id}`} className="font-medium underline-offset-4 hover:underline">{r.title}</Link>: {r.error ?? 'it failed'}</li>
        ))}
      </ul>
    </div>
  );
}
