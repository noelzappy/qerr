// The pieces every place that shows a background run uses: its status badge, its progress bar and step, and a readable
// summary of what it did (by kind), so the popover, the Activity page and the in-place strips all say the same things.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { Notice, ToneBadge, type Tone } from '@/components/kit';
import { elapsedMs, formatElapsed, isActive, percent, progressText, runStatusLabel, runTitle, type ActivityRun } from '@/lib/activity';
import { failureLine } from '@/lib/errors';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<string, Tone> = { queued: 'quiet', running: 'info', done: 'good', failed: 'bad', cancelled: 'quiet' };

// A dot and the status word.
export function RunStatusBadge({ run }: { run: Pick<ActivityRun, 'status'> }) {
  return <ToneBadge dot tone={STATUS_TONE[run.status] ?? 'quiet'}>{runStatusLabel(run.status)}</ToneBadge>;
}

// The step in words, with a bar when the run says how far it is. The bar is a real progressbar for assistive tech.
export function RunProgress({ run, now, className }: { run: ActivityRun; now: number; className?: string }) {
  const pct = percent(run.progress);
  const text = isActive(run) ? progressText(run.progress, run.status) : '';
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {text && <p className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">{text}</p>}
      {run.status === 'running' && (
        <Progress
          value={pct}
          aria-label={`${runTitle(run.title)}: ${run.progress?.step ?? 'working'}`}
          aria-valuetext={text}
          className="h-1.5"
        />
      )}
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{formatElapsed(elapsedMs(run, now))}{run.status === 'queued' ? ' waiting' : ''}</p>
    </div>
  );
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const list = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);
const lines = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return <ul className="flex list-disc flex-col gap-1 pl-5 text-sm [overflow-wrap:anywhere]">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

// A short sentence for the run's outcome, used in lists. Empty when there is nothing useful to add to the title.
export function runSummary(run: ActivityRun): string {
  const r = (run.result ?? {}) as Record<string, unknown>;
  if (run.status === 'failed') return run.error ? failureLine(run.error) : 'It failed';
  if (run.status !== 'done') return '';
  switch (run.kind) {
    case 'draft-batch': return typeof r.delivered === 'number' ? `${r.delivered} of ${num(r.requested)} posts drafted` : '';
    case 'research-run': return typeof r.created === 'number' ? `${r.created} new, ${num(r.checked)} checked` : '';
    case 'send-batch': return typeof r.created === 'number' ? `${r.created} sent, ${num(r.failed) + num(r.unknown)} did not go` : '';
    case 'render-post': return typeof r.files === 'number' ? `${r.files} images` : '';
    case 'refresh-delivery': return typeof r.checked === 'number' ? `${r.checked} checked` : '';
    case 'redesign-batch': return typeof r.designed === 'number' ? `${r.designed} of ${num(r.of)} posts designed` : '';
    default: return '';
  }
}

// A rewrite: what was asked and, when the words were saved, the caption before and after.
function RewriteResult({ r }: { r: Record<string, unknown> }) {
  const before = str((r.before as { caption?: unknown } | undefined)?.caption);
  const after = str((r.after as { caption?: unknown } | undefined)?.caption);
  return (
    <div className="flex flex-col gap-3">
      <p>{r.applied === true ? 'The post was rewritten' : 'The AI rewrote the post'} as asked{str(r.instruction) && <>: {str(r.instruction)}</>}.{r.approvalWithdrawn === true && ' Approval was taken off.'}</p>
      {before && after && before !== after && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Section title="Caption before"><p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{before}</p></Section>
          <Section title="Caption after"><p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{after}</p></Section>
        </div>
      )}
    </div>
  );
}

// What a finished run did, in words. Everything comes from the run's stored result; nothing here fetches.
export function RunResult({ run }: { run: ActivityRun }) {
  const r = (run.result ?? null) as Record<string, unknown> | null;
  if (!r) return null;

  if (run.kind === 'research-run') {
    const topics = list(r.topics);
    const dropped = list(r.dropped);
    return (
      <div className="flex flex-col gap-4">
        <p>
          <strong>{num(r.created)}</strong> new {num(r.created) === 1 ? 'item was' : 'items were'} added to Facts as unconfirmed, and <strong>{num(r.checked)}</strong> existing {num(r.checked) === 1 ? 'item was' : 'items were'} checked.
          {str(r.windowStart) && <> It looked at pages published since {str(r.windowStart)}.</>}
        </p>
        {str(r.stoppedEarly) && <Notice tone="warn" title="It stopped early.">{str(r.stoppedEarly)}</Notice>}
        {topics.length > 0 && (
          <Section title="Topics searched">
            <ul className="flex flex-col divide-y rounded-md border">
              {topics.map((t, i) => (
                <li key={i} className="flex flex-col gap-1.5 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <strong className="[overflow-wrap:anywhere]">{str(t.topic)}</strong>
                    <span className="text-[13px] text-muted-foreground">{num(t.results)} {num(t.results) === 1 ? 'result' : 'results'}, {num(t.pagesRead)} {num(t.pagesRead) === 1 ? 'page' : 'pages'} read</span>
                  </div>
                  {lines(t.skipped).length > 0 && (
                    <div>
                      <p className="text-[13px] text-muted-foreground">Skipped:</p>
                      <Bullets items={lines(t.skipped)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {dropped.length > 0 && (
          <Section title="Findings it dropped">
            <Bullets items={dropped.map((d) => <span key={str(d.title)}><strong>{str(d.title)}</strong>: {str(d.reason)}</span>)} />
          </Section>
        )}
      </div>
    );
  }

  if (run.kind === 'draft-batch') {
    const batchId = str(r.batchId);
    return (
      <div className="flex flex-col gap-3">
        <p>
          <strong>{num(r.delivered)} of {num(r.requested)}</strong> requested posts were drafted{str(r.title) && <> as <strong>{str(r.title)}</strong></>}.
          {num(r.delivered) < num(r.requested) && ' The rest did not pass the checks; the batch page lists why.'}
        </p>
        {batchId && <Link className="w-fit font-medium text-primary underline-offset-4 hover:underline" to={`/batches/${batchId}`}>Open the batch</Link>}
      </div>
    );
  }

  if (run.kind === 'send-batch') {
    const sent = list(r.sent);
    const notSent = list(r.failedPosts);
    return (
      <div className="flex flex-col gap-4">
        <p>
          <strong>{num(r.created)}</strong> sent to Buffer{num(r.skipped) > 0 && <>, {num(r.skipped)} already there</>}{num(r.failed) + num(r.unknown) + num(r.refused) > 0 && <>, {num(r.failed) + num(r.unknown) + num(r.refused)} did not go</>}.
        </p>
        {str(r.stopped) && <Notice tone="warn" title="The send stopped.">{str(r.stopped)}</Notice>}
        {notSent.length > 0 && (
          <Section title="Not sent">
            <Bullets items={notSent.map((p) => <span key={`${str(p.title)}${str(p.network)}`}><strong>{str(p.title)}</strong> ({str(p.network)}): {str(p.reason)}</span>)} />
          </Section>
        )}
        {sent.length > 0 && (
          <Section title="Sent">
            <Bullets items={sent.map((p) => <span key={`${str(p.title)}${str(p.network)}`}>{str(p.title)} ({str(p.network)})</span>)} />
          </Section>
        )}
      </div>
    );
  }

  if (run.kind === 'render-post') {
    const sizes = lines(r.sizes);
    return <p><strong>{num(r.files)}</strong> {num(r.files) === 1 ? 'image' : 'images'} made{sizes.length > 0 && <> in {sizes.join(', ')}</>}{num(r.warnings) > 0 && <>, with {num(r.warnings)} {num(r.warnings) === 1 ? 'warning' : 'warnings'} on the post</>}.</p>;
  }

  if (run.kind === 'refresh-delivery') {
    return <p><strong>{num(r.checked)}</strong> {num(r.checked) === 1 ? 'delivery' : 'deliveries'} checked in Buffer{num(r.unknown) > 0 && <>, <strong>{num(r.unknown)}</strong> could not be found there</>}.</p>;
  }
  if (run.kind === 'refresh-sweep') return <p>{num(r.batches)} {num(r.batches) === 1 ? 'batch was' : 'batches were'} queued for a status check.</p>;
  if (run.kind === 'rewrite-post') return <RewriteResult r={r} />;
  return null;
}
