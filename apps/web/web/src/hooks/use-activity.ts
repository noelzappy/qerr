// Loads activity runs and keeps them fresh: every 3 seconds while something is queued or running (or `fast` is set),
// every 30 seconds otherwise, and not at all while the tab is hidden (it loads again as soon as the tab is shown).
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/api';
import { errorMessage } from '@/lib/errors';
import { isActive, type ActivityPage, type ActivityRun } from '@/lib/activity';

export interface ActivityFilter {
  status?: 'active' | 'finished' | 'all' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  kind?: string;
  batchId?: string;
  system?: 'include' | 'hide' | 'only';
  page?: number;
  pageSize?: number;
  withResult?: boolean;
}

export interface UseActivityOptions {
  // Poll every 3 seconds even when nothing is active (an open popover).
  fast?: boolean;
  // Do not load or poll (a closed popover, a panel that is not open).
  enabled?: boolean;
}

const FAST_MS = 3000;
const SLOW_MS = 30_000;

function activityUrl(f: ActivityFilter): string {
  const q = new URLSearchParams();
  if (f.status) q.set('status', f.status);
  if (f.kind) q.set('kind', f.kind);
  if (f.batchId) q.set('batchId', f.batchId);
  if (f.system) q.set('system', f.system);
  if (f.page) q.set('page', String(f.page));
  if (f.pageSize) q.set('pageSize', String(f.pageSize));
  if (f.withResult) q.set('withResult', 'true');
  const s = q.toString();
  return `/api/activity${s ? `?${s}` : ''}`;
}

// A loop that calls `tick`, waits `delay()` ms, and repeats; paused while the tab is hidden.
function useLoop(tick: () => Promise<void>, delay: () => number, enabled: boolean, key: string) {
  const latest = useRef({ tick, delay });
  latest.current = { tick, delay };
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (stopped) return;
      if (!document.hidden) await latest.current.tick();
      if (stopped) return;
      timer = setTimeout(() => void run(), latest.current.delay());
    };
    const onVisible = () => {
      if (document.hidden || stopped) return;
      clearTimeout(timer);
      void run();
    };
    document.addEventListener('visibilitychange', onVisible);
    void run();
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled, key]);
}

export function useActivity(filter: ActivityFilter, options: UseActivityOptions = {}) {
  const { fast = false, enabled = true } = options;
  const url = activityUrl(filter);
  const [data, setData] = useState<ActivityPage | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const dataRef = useRef<ActivityPage | null>(null);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const next = await api.get<ActivityPage>(url);
      if (mine !== seq.current) return;
      dataRef.current = next;
      setData(next);
      setError('');
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e, 'The activity could not be loaded.'));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => { dataRef.current = null; setData(null); setLoading(enabled); setError(''); }, [url, enabled]);
  useLoop(load, () => (fast || dataRef.current?.items.some(isActive) ? FAST_MS : SLOW_MS), enabled, url);

  const reload = useCallback(async () => { setLoading(true); await load(); }, [load]);
  const items: ActivityRun[] = data?.items ?? [];
  return { items, total: data?.total ?? 0, page: data?.page ?? 1, pageSize: data?.pageSize ?? filter.pageSize ?? 50, active: items.filter(isActive), loading, error, reload };
}

// One run, polled every 2 seconds until it ends (and not again after).
export function useActivityRun(id: string | null) {
  const [run, setRun] = useState<ActivityRun | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!id);
  const ended = useRef(false);
  const runRef = useRef<ActivityRun | null>(null);

  useEffect(() => { ended.current = false; runRef.current = null; setRun(null); setError(''); setLoading(!!id); }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { run: next } = await api.get<{ run: ActivityRun }>(`/api/activity/${encodeURIComponent(id)}`);
      runRef.current = next;
      ended.current = !isActive(next);
      setRun(next);
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'This could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useLoop(load, () => (ended.current ? SLOW_MS * 20 : 2000), !!id, id ?? '');
  return { run, loading, error, reload: load };
}
