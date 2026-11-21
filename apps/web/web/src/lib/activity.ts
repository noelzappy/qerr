// What the server calls an activity run (a piece of background work), and the words and numbers the screens show for it.
export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type RunKind = 'draft-batch' | 'research-run' | 'render-post' | 'rewrite-post' | 'send-batch' | 'refresh-delivery' | 'refresh-sweep' | 'analyse-reference';

export interface RunProgress { step: string; done?: number; total?: number }

export interface ActivityRun {
  id: string;
  kind: RunKind;
  status: RunStatus;
  title: string;
  // True for the timer-driven Buffer status checks
  system: boolean;
  actorId: string | null;
  batchId: string | null;
  postId: string | null;
  progress: RunProgress | null;
  // Only on one run, or on a list asked for with results
  result?: unknown;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface ActivityPage { items: ActivityRun[]; page: number; pageSize: number; total: number }

export const KIND_LABEL: Record<RunKind, string> = {
  'draft-batch': 'AI draft',
  'research-run': 'Research',
  'render-post': 'Make images',
  'rewrite-post': 'Rewrite a post',
  'send-batch': 'Send to Buffer',
  'analyse-reference': 'Design reference',
  'refresh-delivery': 'Status check',
  'refresh-sweep': 'Status check sweep',
};
// A run's title as people read it. The server stores image runs as "Render: <post>"; they are shown as "Image: <post>".
export const runTitle = (title: string) => title.replace(/^Render: /, 'Image: ');
export const runKindLabel = (k: string) => KIND_LABEL[k as RunKind] ?? k;

const STATUS_LABEL: Record<RunStatus, string> = { queued: 'Waiting', running: 'Running', done: 'Done', failed: 'Failed', cancelled: 'Cancelled' };
export const runStatusLabel = (s: string) => STATUS_LABEL[s as RunStatus] ?? s;
export const STATUS_VARIANT = { queued: 'quiet', running: 'info', done: 'success', failed: 'destructive', cancelled: 'quiet' } as const;

export const isActive = (r: Pick<ActivityRun, 'status'>) => r.status === 'queued' || r.status === 'running';

// 0 to 100 when the run knows how much there is to do, otherwise null (the bar then shows as indeterminate).
export function percent(p: RunProgress | null | undefined): number | null {
  if (!p || typeof p.total !== 'number' || p.total <= 0 || typeof p.done !== 'number') return null;
  return Math.max(0, Math.min(100, Math.round((p.done / p.total) * 100)));
}

// "Checking posts, 3 of 10" for a screen, "Checking posts" when there is no count.
export function progressText(p: RunProgress | null | undefined, status: RunStatus): string {
  if (status === 'queued') return 'Waiting for its turn';
  if (!p) return status === 'running' ? 'Starting' : '';
  return typeof p.total === 'number' && typeof p.done === 'number' ? `${p.step}: ${p.done} of ${p.total}` : p.step;
}

// "12 s", "3 min 04 s", "1 h 02 min".
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

// How long a run has taken so far (or took). A waiting run counts from when it was queued.
export function elapsedMs(r: Pick<ActivityRun, 'status' | 'createdAt' | 'startedAt' | 'finishedAt'>, now: number): number {
  const from = Date.parse(r.startedAt ?? r.createdAt);
  const to = r.finishedAt ? Date.parse(r.finishedAt) : now;
  return to - from;
}

// Where a run's batch is, when it has one that still exists.
export const batchLink = (r: Pick<ActivityRun, 'batchId'>) => (r.batchId ? `/batches/${r.batchId}` : null);

// The render and send runs of a batch that failed in the last ten minutes and were not started again since (the same post
// rendered again, the batch sent again): what the batch page lists as "jobs failed".
const FAILURE_WINDOW_MS = 10 * 60_000;
export function recentFailures(items: ActivityRun[], now: number): ActivityRun[] {
  const retried = (r: ActivityRun) => items.some((x) => x.id !== r.id && x.kind === r.kind && (r.kind !== 'render-post' || x.postId === r.postId) && Date.parse(x.createdAt) > Date.parse(r.createdAt));
  return items.filter((r) => r.status === 'failed' && (r.kind === 'render-post' || r.kind === 'send-batch') && Date.parse(r.finishedAt ?? r.createdAt) >= now - FAILURE_WINDOW_MS && !retried(r));
}
