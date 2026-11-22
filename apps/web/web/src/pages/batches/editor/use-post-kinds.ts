// What the server says about the `post` design: the brand's design direction (null when it has none), each kind's fields and looks,
// and the limits. One request is shared by every editor on the page and kept for a short while, so a direction chosen in Settings is
// seen soon. When the request fails the editor behaves as for a brand with no direction.
import { useEffect, useState } from 'react';
import { api } from '../../../api';
import type { PostKindInfo, PostLimits } from '../design-model';

export interface PostKinds { direction: string | null; kinds: PostKindInfo[]; limits: PostLimits | null }
const NONE: PostKinds = { direction: null, kinds: [], limits: null };
const KEEP_MS = 15_000;

let cached: { at: number; promise: Promise<PostKinds> } | null = null;

function load(): Promise<PostKinds> {
  if (cached && Date.now() - cached.at < KEEP_MS) return cached.promise;
  const promise = api.get<PostKinds>('/api/posts/post-kinds')
    .then((r) => ({ direction: typeof r.direction === 'string' ? r.direction : null, kinds: Array.isArray(r.kinds) ? r.kinds : [], limits: r.limits ?? null }))
    .catch(() => NONE);
  cached = { at: Date.now(), promise };
  return promise;
}

// `loading` is true until the first answer; `direction` is then the brand's direction or null.
export function usePostKinds(): PostKinds & { loading: boolean } {
  const [data, setData] = useState<PostKinds | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((r) => { if (live) setData(r); });
    return () => { live = false; };
  }, []);
  return { ...(data ?? NONE), loading: data === null };
}
