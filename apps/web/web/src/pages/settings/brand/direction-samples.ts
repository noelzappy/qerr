// Real sample pictures of each design direction, made by the server from the form's current (unsaved) settings. Asked after
// the settings stop changing, one direction at a time (the server draws one at a time), and kept per direction so cards fill
// in as they arrive and the state survives moving between sections. Never throws: a failure becomes that direction's error.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, isAbort } from '../../../api';
import { errorMessage } from '../../../lib/errors';
import type { BrandSettings, Direction, DirectionSample, DirectionSamplesAnswer } from '../brand-types';

export interface DirectionState { status: 'loading' | 'ready' | 'error'; samples: DirectionSample[]; logosMissing: boolean; error: string }
export type DirectionStates = Partial<Record<Direction, DirectionState>>;

const DELAY_MS = 900;

export function useDirectionSamples(settings: BrandSettings | null, wanted: Direction[], enabled: boolean): { states: DirectionStates; retry: () => void } {
  const [states, setStates] = useState<DirectionStates>({});
  const [nonce, setNonce] = useState(0);
  // The chosen direction does not change what the samples show, so choosing one asks for nothing new.
  const settingsKey = settings ? JSON.stringify({ ...settings, style: { ...settings.style, direction: null } }) : '';
  const wantedKey = wanted.join(',');
  // The latest settings, read when the timer fires.
  const latest = useRef(settings);
  latest.current = settings;
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || !settingsKey || !wantedKey) return;
    const mine = ++seq.current;
    const list = wantedKey.split(',') as Direction[];
    // Keep what is on screen while the new pictures are made; only a direction never seen shows skeletons.
    setStates((cur) => {
      const next: DirectionStates = { ...cur };
      for (const d of list) next[d] = cur[d] ? { ...cur[d]!, status: 'loading', error: '' } : { status: 'loading', samples: [], logosMissing: false, error: '' };
      return next;
    });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        const body = latest.current;
        if (!body) return;
        for (const direction of list) {
          if (mine !== seq.current) return;
          try {
            const res = await api.post<DirectionSamplesAnswer>('/api/settings/brand/direction-samples', { settings: body, direction }, controller.signal);
            if (mine !== seq.current) return;
            setStates((cur) => ({ ...cur, [direction]: { status: 'ready', samples: res.samples ?? [], logosMissing: !!res.logosMissing, error: '' } }));
          } catch (err) {
            if (isAbort(err) || mine !== seq.current) return;
            setStates((cur) => ({ ...cur, [direction]: { status: 'error', samples: [], logosMissing: false, error: errorMessage(err, 'The samples could not be made.') } }));
          }
        }
      })();
    }, DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [settingsKey, wantedKey, enabled, nonce]);

  return useMemo(() => ({ states, retry: () => setNonce((n) => n + 1) }), [states]);
}
