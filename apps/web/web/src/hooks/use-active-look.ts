// The brand's look in force, for the places that depend on it: whether Classic layouts shows in the settings menu and the post
// editor's kinds and budgets. One request to GET /api/looks/brief (any signed-in person may read it) is shared by every user of
// the hook and kept for a short while; refreshActiveLook() forgets it, and every user of the hook asks again. A failed request
// reads as "no look" for the editor and as "not known" here, so a menu never hides something on a guess.
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Brief } from '@/pages/settings/looks/look-types';

export type ActiveBrief = ({ ref: string } & Brief) | null;
const KEEP_MS = 15_000;
let cached: { at: number; promise: Promise<ActiveBrief | undefined> } | null = null;
const listeners = new Set<() => void>();

export function loadActiveBrief(): Promise<ActiveBrief | undefined> {
  if (cached && Date.now() - cached.at < KEEP_MS) return cached.promise;
  const promise = api.get<{ look: ActiveBrief }>('/api/looks/brief').then((r) => r.look ?? null).catch(() => undefined);
  cached = { at: Date.now(), promise };
  return promise;
}

// Call after anything that changes which look is in force (Use this look, Back to classic layouts, deleting the look).
export function refreshActiveLook(): void {
  cached = null;
  listeners.forEach((l) => l());
}

export function useActiveLook(): { active: boolean | undefined; ref: string | null | undefined; brief: ActiveBrief | undefined } {
  const [brief, setBrief] = useState<ActiveBrief | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => { const l = () => setTick((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  useEffect(() => {
    let live = true;
    void loadActiveBrief().then((b) => { if (live) setBrief(b); });
    return () => { live = false; };
  }, [tick]);
  return { active: brief === undefined ? undefined : brief !== null, ref: brief === undefined ? undefined : brief?.ref ?? null, brief };
}
