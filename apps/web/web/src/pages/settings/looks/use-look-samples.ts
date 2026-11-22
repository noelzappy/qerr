// Sample pictures of a look, one per kind of post, from POST /api/settings/looks/preview. Built to switch on by itself: while the
// server answers 501 ("not available yet") the hook says `unavailable` and the UI shows quiet placeholders; once previews exist the
// same call returns pictures and they appear. The target is a reference ({ ref, version }) or a whole look held in the panel
// ({ look }); asked after the target stops changing (debounced), a stale request is cancelled, and answers are kept by the look's
// hash from the server, so the same look is never drawn twice.
import { useEffect, useState } from 'react';
import { api, ApiError, isAbort } from '../../../api';
import { errorMessage } from '../../../lib/errors';
import type { Json, PreviewAnswer, PreviewSample } from './look-types';

export type SampleTarget = { ref: string; version?: string } | { look: Json };
export interface SampleState { status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'; samples: PreviewSample[]; hash: string; error: string }
const IDLE: SampleState = { status: 'idle', samples: [], hash: '', error: '' };

const byHash = new Map<string, PreviewSample[]>();
const hashOfTarget = new Map<string, string>();
// After a 501 nothing is asked for a minute: the answer will not change until the server is updated.
let unavailableUntil = 0;
export const resetSampleCache = (): void => { byHash.clear(); hashOfTarget.clear(); unavailableUntil = 0; };

export const targetKey = (t: SampleTarget): string => ('ref' in t ? `${t.ref}@${t.version ?? ''}` : JSON.stringify(t.look));

export function useLookSamples(target: SampleTarget | null, opts: { delay?: number; kinds?: string[] } = {}): SampleState {
  const [state, setState] = useState<SampleState>(IDLE);
  const key = target ? targetKey(target) : '';
  const kindsKey = (opts.kinds ?? []).join(',');
  const delay = opts.delay ?? 600;
  useEffect(() => {
    if (!target) { setState(IDLE); return; }
    const known = hashOfTarget.get(key + '|' + kindsKey);
    if (known && byHash.has(known)) { setState({ status: 'ready', samples: byHash.get(known)!, hash: known, error: '' }); return; }
    if (Date.now() < unavailableUntil) { setState({ ...IDLE, status: 'unavailable' }); return; }
    setState((cur) => ({ ...cur, status: 'loading', error: '' }));
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const body = 'ref' in target ? { ref: target.ref, ...(kindsKey ? { kinds: kindsKey.split(',') } : {}) } : { look: target.look, ...(kindsKey ? { kinds: kindsKey.split(',') } : {}) };
      api.post<PreviewAnswer>('/api/settings/looks/preview', body, controller.signal).then((answer) => {
        // replaced on the server by a newer request of ours (its answer is the one that counts)
        if (answer.superseded) return;
        byHash.set(answer.hash, answer.samples);
        hashOfTarget.set(key + '|' + kindsKey, answer.hash);
        setState({ status: 'ready', samples: answer.samples, hash: answer.hash, error: '' });
      }).catch((err) => {
        if (isAbort(err)) return;
        if (err instanceof ApiError && err.status === 501) { unavailableUntil = Date.now() + 60_000; setState({ ...IDLE, status: 'unavailable' }); return; }
        setState({ ...IDLE, status: 'error', error: errorMessage(err, 'The samples could not be made.') });
      });
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
    // `target` is read through its key: a new object with the same content asks for nothing.
  }, [key, kindsKey, delay]);
  return state;
}
