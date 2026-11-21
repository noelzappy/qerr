// Bulk actions are the ordinary one-item requests sent one after another from the browser, a few at a time, so every
// rule the server applies to a single item (and the audit entry it writes) applies to each item here unchanged.
import { ApiError } from '../api';
import { errorMessage } from './errors';

export type BulkResult<V = unknown> =
  | { id: string; ok: true; value: V }
  | { id: string; ok: false; reasons: string[] };

const CONCURRENCY = 4;

// Why one item was refused: the server's list of blockers when it sent one, otherwise its message.
export function failureReasons(err: unknown): string[] {
  if (err instanceof ApiError && err.blockers?.length) return err.blockers;
  return [errorMessage(err)];
}

// Runs `work` for every id, at most four at once, and always resolves with one result per id in the order given.
export async function runBulk<V>(ids: readonly string[], work: (id: string) => Promise<V>, concurrency = CONCURRENCY): Promise<BulkResult<V>[]> {
  const results: BulkResult<V>[] = new Array(ids.length);
  let next = 0;
  async function lane() {
    while (next < ids.length) {
      const at = next++;
      const id = ids[at]!;
      try {
        results[at] = { id, ok: true, value: await work(id) };
      } catch (e) {
        results[at] = { id, ok: false, reasons: failureReasons(e) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, lane));
  return results;
}

export const succeededIds = (results: readonly BulkResult<unknown>[]) => results.filter((r) => r.ok).map((r) => r.id);
export const failedResults = (results: readonly BulkResult<unknown>[]) => results.filter((r): r is Extract<BulkResult<unknown>, { ok: false }> => !r.ok);

const trimStop = (s: string) => s.replace(/[.\s]+$/, '');

// "12 confirmed", or "11 confirmed, 1 not: The reason". Different reasons are listed (two at most) so the cause shows.
export function bulkSummary(results: readonly BulkResult<unknown>[], pastTense: string): string {
  const failed = failedResults(results);
  const done = results.length - failed.length;
  if (failed.length === 0) return `${done} ${pastTense}`;
  const reasons = [...new Set(failed.map((f) => trimStop(f.reasons[0] ?? 'It was refused')))];
  const shown = reasons.slice(0, 2).join('; ') + (reasons.length > 2 ? '; and other reasons' : '');
  return `${done} ${pastTense}, ${failed.length} not: ${shown}`;
}

// Tags to add to an item's existing tags, in order and without repeats.
export const mergeTags = (existing: readonly string[], added: readonly string[]) => [...new Set([...existing, ...added])];
