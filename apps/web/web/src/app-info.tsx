// The app's name and the brand it works for (GET /api/app: the brand saved in Settings, or the brand pack). Loaded once; until it
// arrives, or if it cannot be read, neutral defaults are shown so no page waits on it.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';

export interface AppInfo {
  appName: string;
  brand: { name: string; website: string; timezone: string; series: Array<{ key: string; name: string }>; logo: string | null };
}

const DEFAULT_APP_INFO: AppInfo = { appName: 'Vesk', brand: { name: 'Vesk', website: '', timezone: 'UTC', series: [], logo: null } };

const Ctx = createContext<AppInfo & { reload: () => void }>({ ...DEFAULT_APP_INFO, reload: () => {} });
export const useAppInfo = () => useContext(Ctx);

export function AppInfoProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<AppInfo>(DEFAULT_APP_INFO);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    api.get<AppInfo>('/api/app').then((v) => { if (live) setInfo(v); }).catch(() => { /* keep the defaults */ });
    return () => { live = false; };
  }, [n]);
  // Settings, Brand calls reload after a save, so the name and the logo in the frame follow at once.
  const value = useMemo(() => ({ ...info, reload: () => setN((x) => x + 1) }), [info]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
