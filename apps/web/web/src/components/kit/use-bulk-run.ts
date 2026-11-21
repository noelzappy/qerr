// Runs one action over the selected ids and does what every bulk action does afterwards: says what happened in a toast,
// unticks what worked, leaves what failed ticked, and loads the list again.
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { bulkSummary, failedResults, runBulk, succeededIds, type BulkResult } from '@/lib/bulk';
import type { Selection } from './use-selection';

export function useBulkRun(selection: Selection, afterRun: () => Promise<unknown> | unknown) {
  const [busy, setBusy] = useState(false);
  const { deselect } = selection;
  const run = useCallback(async <V,>(ids: readonly string[], pastTense: string, work: (id: string) => Promise<V>, concurrency?: number): Promise<BulkResult<V>[]> => {
    setBusy(true);
    try {
      const results = await runBulk(ids, work, concurrency);
      const text = bulkSummary(results, pastTense);
      const failed = failedResults(results).length;
      if (failed === 0) toast.success(text); else if (failed === results.length) toast.error(text); else toast.warning(text);
      deselect(succeededIds(results));
      await afterRun();
      return results;
    } finally {
      setBusy(false);
    }
  }, [afterRun, deselect]);
  return { busy, run };
}
