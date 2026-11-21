// The live picture of a post's design: asks the server to draw it a moment after the design last changed, keeps the last
// good picture on screen meanwhile, and drops an answer that a newer request has overtaken. Nothing is stored by the server.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, isAbort } from '../../../api';
import { errorMessage } from '../../../lib/errors';
import type { DesignBlock } from '../types';
import { detailLines } from '../util';

export type PreviewState = 'idle' | 'updating' | 'ready' | 'problem';
export interface PreviewResult {
  state: PreviewState;
  image: string | null;
  images: string[];
  warnings: string[];
  // Field problems with the design, in the same words as saving.
  problems: string[];
  // The design was fine but could not be drawn, or the request failed.
  error: string;
  size: string;
  refresh: () => void;
  // The format being asked for, and a way to change it (the pane offers it when the design lists several sizes).
  requestedSize: string;
  setRequestedSize: (size: string) => void;
}

interface Answer { ok: boolean; image?: string; images?: string[]; size: string; error?: string; warnings?: string[]; notes?: string[] }

const DELAY_MS = 700;

export function usePreview(design: DesignBlock | null, blocked: boolean): PreviewResult {
  const [state, setState] = useState<PreviewState>('idle');
  const [images, setImages] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [size, setSize] = useState('');
  const [requestedSize, setRequestedSize] = useState('');
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  // Compared by content, so an edit to a caption or a date (not part of the design) never asks for a picture.
  const key = design && !blocked ? JSON.stringify(design) : null;
  const latest = useRef(design);
  latest.current = design;

  useEffect(() => {
    if (key === null) {
      // Anything in flight is now stale.
      seq.current++;
      setState('idle');
      setImages([]); setWarnings([]); setProblems([]); setError('');
      return;
    }
    const mine = ++seq.current;
    setState('updating');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const body: Record<string, unknown> = { design: JSON.parse(key) as unknown };
      if (requestedSize) body.size = requestedSize;
      api.post<Answer>('/api/posts/preview-design', body, controller.signal).then((res) => {
        if (mine !== seq.current) return;
        setWarnings(res.warnings ?? []);
        setProblems([]);
        setSize(res.size);
        if (res.ok) {
          const list = res.images?.length ? res.images : res.image ? [res.image] : [];
          setImages(list);
          setError('');
          setState('ready');
        } else {
          setError(res.error ?? 'The image could not be made.');
          setState('problem');
        }
      }).catch((err: unknown) => {
        if (isAbort(err) || mine !== seq.current) return;
        if (err instanceof ApiError && err.status === 422) {
          const lines = detailLines(err);
          setProblems(lines.length ? lines : [errorMessage(err)]);
          setError('');
        } else {
          setProblems([]);
          setError(errorMessage(err, 'The preview could not be made.'));
        }
        setState('problem');
      });
    }, DELAY_MS);
    // A newer design, a new size or closing the editor cancels the request still in flight.
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, requestedSize, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { state, image: images[0] ?? null, images, warnings, problems, error, size, refresh, requestedSize, setRequestedSize };
}
