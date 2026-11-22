// The real picture of one design, from POST /api/settings/looks/preview-design, with the rectangle of every element so the editor's
// handles sit where the page put them. Built to switch on by itself: while the server answers 501 ("not available yet") the hook says
// `unavailable` and the editor draws a sketch; once the renderer is connected the same call returns pictures. Asked after the design stops
// changing (about 400 ms), an older request is cancelled when a newer one starts, and the last picture stays (dimmed) until the new one
// arrives. After a 501 nothing is asked for a minute: the answer will not change until the server is updated.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, isAbort } from '../../../api';
import { errorMessage } from '../../../lib/errors';
import type { Json, Problem } from './look-types';

export type Scenario = 'sample' | 'stress' | 'minimal';
export interface ElementRect { el: string; x: number; y: number; w: number; h: number; rot: number }
export interface DesignPreviewAnswer { hash: string; image?: string; rects: ElementRect[]; warnings: string[]; problems: Problem[]; superseded?: boolean }
export interface DesignPreviewState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
  // the last picture drawn (kept while the next is made); `fresh` says whether it is of the design as it is now
  image: string; rects: ElementRect[]; warnings: string[]; problems: Problem[]; fresh: boolean; error: string;
}
const IDLE: DesignPreviewState = { status: 'idle', image: '', rects: [], warnings: [], problems: [], fresh: false, error: '' };

let unavailableUntil = 0;
export const resetDesignPreview = (): void => { unavailableUntil = 0; };

export interface DesignPreviewTarget { ref: string; kind: string; index: number; draft: Json; scenario: Scenario }

export function useDesignPreview(target: DesignPreviewTarget | null, opts: { delay?: number } = {}): DesignPreviewState {
  const [state, setState] = useState<DesignPreviewState>(IDLE);
  const delay = opts.delay ?? 400;
  const key = target ? JSON.stringify([target.ref, target.kind, target.index, target.scenario, target.draft]) : '';
  const latest = useRef(target);
  latest.current = target;
  useEffect(() => {
    const t = latest.current;
    if (!t) { setState(IDLE); return; }
    if (Date.now() < unavailableUntil) { setState({ ...IDLE, status: 'unavailable' }); return; }
    setState((cur) => ({ ...cur, status: 'loading', fresh: false, error: '' }));
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.post<DesignPreviewAnswer>('/api/settings/looks/preview-design', { ref: t.ref, kind: t.kind, index: t.index, draft: t.draft, scenario: t.scenario, withRects: true }, controller.signal).then((a) => {
        if (a.superseded) return; // replaced on the server by a newer request of ours
        setState({ status: 'ready', image: a.image ?? '', rects: a.rects ?? [], warnings: a.warnings ?? [], problems: a.problems ?? [], fresh: !!a.image, error: '' });
      }).catch((err) => {
        if (isAbort(err)) return;
        if (err instanceof ApiError && err.status === 501) { unavailableUntil = Date.now() + 60_000; setState({ ...IDLE, status: 'unavailable' }); return; }
        setState((cur) => ({ ...cur, status: 'error', fresh: false, error: errorMessage(err, 'The picture could not be made.') }));
      });
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, delay]);
  return state;
}
