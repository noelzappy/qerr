// Small data hooks: load something on mount (and on demand), with loading and error state.
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './lib/errors';
import { useAppInfo } from './app-info';

export interface Loaded<T> {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  setData: (next: T | null | ((prev: T | null) => T | null)) => void;
}

// `load` may change identity on every render; the effect re-runs only when `deps` change.
export function useLoad<T>(load: () => Promise<T>, deps: ReadonlyArray<unknown>): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latest = useRef(load);
  latest.current = load;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const next = await latest.current();
      if (mine === seq.current) setData(next);
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e, 'This could not be loaded.'));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); return () => { seq.current++; }; }, deps);
  return { data, loading, error, reload, setData };
}

// Waits a moment after typing stops, so a search box does not send a request per key.
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useDocumentTitle(title: string) {
  const { appName } = useAppInfo();
  useEffect(() => { document.title = `${title} - ${appName}`; }, [title, appName]);
}
