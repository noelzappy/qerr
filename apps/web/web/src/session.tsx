import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, UNAUTHORISED_EVENT, type Me } from './api';

interface SessionValue {
  me: Me | null;
  loading: boolean;
  // Why the person is signed out when it was not their choice, for the sign-in page to show once.
  notice: string;
  clearNotice: () => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue>({ me: null, loading: true, notice: '', clearNotice: () => {}, refresh: async () => {}, signOut: async () => {} });
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      setMe((await api.get<{ user: Me }>('/api/me')).user);
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 401 || e.status === 403))) {
        // The server is down or broken: stay signed out rather than crash.
        setMe(null);
        if (e instanceof ApiError && e.status === 0) setNotice('The server could not be reached. Check your connection and reload.');
      } else {
        setMe(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try { await api.post('/api/auth/sign-out'); } finally { setMe(null); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Any request answered 401 means the session is gone (expired, or the account was disabled): go to sign in.
  useEffect(() => {
    const onLost = () => {
      setMe((current) => {
        if (current) setNotice('Your session ended. Sign in again to carry on.');
        return null;
      });
    };
    window.addEventListener(UNAUTHORISED_EVENT, onLost);
    return () => window.removeEventListener(UNAUTHORISED_EVENT, onLost);
  }, []);

  const value = useMemo(() => ({ me, loading, notice, clearNotice: () => setNotice(''), refresh, signOut }), [me, loading, notice, refresh, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
