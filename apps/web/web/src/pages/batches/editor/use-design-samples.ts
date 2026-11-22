// A picture of each design of one kind of the brand's look, for the Design choice (GET /api/looks/designs/:kind). Kept for the page's life
// by look and kind, so a kind is asked for once; after a 501 (no renderer on this server) nothing is asked again for a minute, and the
// choice names the designs instead.
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../../api';

export interface DesignPicture { index: number; ok: boolean; image?: string; error?: string }
type Answer = { ref: string | null; designs: DesignPicture[]; superseded?: boolean };
const kept = new Map<string, DesignPicture[]>();
let unavailableUntil = 0;

export function useDesignSamples(kind: string | undefined, lookRef: string | null | undefined): Record<number, string> {
  const key = kind && lookRef ? `${lookRef}|${kind}` : '';
  const [pictures, setPictures] = useState<DesignPicture[]>(() => kept.get(key) ?? []);
  useEffect(() => {
    if (!key || !kind) { setPictures([]); return; }
    const hit = kept.get(key);
    if (hit) { setPictures(hit); return; }
    setPictures([]);
    if (Date.now() < unavailableUntil) return;
    let live = true;
    api.get<Answer>(`/api/looks/designs/${encodeURIComponent(kind)}`).then((a) => {
      if (a.superseded) return;
      kept.set(key, a.designs);
      if (live) setPictures(a.designs);
    }).catch((err) => {
      if (err instanceof ApiError && err.status === 501) unavailableUntil = Date.now() + 60_000;
    });
    return () => { live = false; };
  }, [key, kind]);
  return Object.fromEntries(pictures.filter((p) => p.ok && p.image).map((p) => [p.index, p.image!]));
}
