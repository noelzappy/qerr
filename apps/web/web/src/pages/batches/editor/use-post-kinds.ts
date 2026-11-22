// What the server says about the `post` design: the brand's look or design direction (null when it has none), each kind's fields and
// looks, and the limits. When a look is active (GET /api/looks/brief) its kinds, variants and budgets win: a kind without an
// enabled design is not offered. One request is shared by every editor on the page and kept for a short while, so a look chosen in
// Settings is seen soon (resetPostKindsCache makes it immediate). When the requests fail the editor behaves as for a brand with no
// direction.
import { useEffect, useState } from 'react';
import { api } from '../../../api';
import { loadActiveBrief } from '@/hooks/use-active-look';
import type { PostKindInfo, PostLimits } from '../design-model';
import { applyLookBrief } from './look-brief';

export interface PostKinds { direction: string | null; kinds: PostKindInfo[]; limits: PostLimits | null; /** kinds the brand's look draws; null: all */ offered: string[] | null }
const NONE: PostKinds = { direction: null, kinds: [], limits: null, offered: null };
const KEEP_MS = 15_000;

let cached: { at: number; promise: Promise<PostKinds> } | null = null;
export const resetPostKindsCache = (): void => { cached = null; };

function load(): Promise<PostKinds> {
  if (cached && Date.now() - cached.at < KEEP_MS) return cached.promise;
  const promise = Promise.all([
    api.get<{ direction: unknown; kinds: PostKindInfo[]; limits: PostLimits | null }>('/api/posts/post-kinds'),
    loadActiveBrief(),
  ])
    .then(([r, brief]) => applyLookBrief({ direction: typeof r.direction === 'string' ? r.direction : null, kinds: Array.isArray(r.kinds) ? r.kinds : [], limits: r.limits ?? null, offered: null }, brief ?? null))
    .catch(() => NONE);
  cached = { at: Date.now(), promise };
  return promise;
}

// `loading` is true until the first answer; `direction` is then the brand's look or direction, or null.
export function usePostKinds(): PostKinds & { loading: boolean } {
  const [data, setData] = useState<PostKinds | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((r) => { if (live) setData(r); });
    return () => { live = false; };
  }, []);
  return { ...(data ?? NONE), loading: data === null };
}
