// A carousel of post pages (the engine's postCarouselProblems, packages/engine/lib/design/post-spec.mjs), as plain functions the post
// editor uses: page 1 is the cover, the last page the closing page, the pages between the body. Every page is a post design of its own
// kind. The engine checks the result again when the post is saved.
import { MAX_PAGES, MIN_PAGES } from '../design-model';
import type { Json } from './types';

export { MAX_PAGES, MIN_PAGES };
// What the carousel keeps for every page: its file name stem, sizes and network sizes. A page never carries them.
const CAROUSEL_OWN = ['name', 'sizes', 'networkSizes'] as const;
// The most images a network takes in one post (the engine's MEDIA_LIMITS in lib/networks.mjs). LinkedIn and Facebook limits through
// Buffer are not known, so none is set for them.
export const IMAGE_LIMITS: Record<string, number> = { instagram: 10, x: 4 };
const NAMES: Record<string, string> = { instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn', facebook: 'Facebook' };

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
export const isPostPage = (p: unknown): boolean => isObj(p) && p.template === 'post';
export const isPostCarousel = (d: Json | null | undefined): boolean => !!d && d.template === 'carousel' && Array.isArray(d.pages) && d.pages.some(isPostPage);
export const postPagesOf = (d: Json): Json[] => (Array.isArray(d.pages) ? d.pages.map((p) => (isObj(p) ? p : {})) : []);

// What a page is for, by its place.
export function pageRole(i: number, count: number): 'cover' | 'body' | 'closing' {
  if (i === 0) return 'cover';
  return i === count - 1 ? 'closing' : 'body';
}
export const ROLE_NAMES = { cover: 'Cover', body: 'Body', closing: 'Closing' } as const;
export const pageTitle = (i: number, count: number): string => `Page ${i + 1} · ${ROLE_NAMES[pageRole(i, count)]}`;

const pageOf = (d: Json): Json => Object.fromEntries(Object.entries(d).filter(([k]) => !(CAROUSEL_OWN as readonly string[]).includes(k)));

// A single post made into a carousel: its words become the cover, and a closing page follows. Name and sizes move to the carousel.
export function toPostCarousel(d: Json): Json {
  const out: Json = { template: 'carousel', pages: [pageOf({ ...d, template: 'post', kind: d.kind ?? 'statement' }), { template: 'post', kind: 'statement' }] };
  for (const k of CAROUSEL_OWN) if (d[k] !== undefined) out[k] = d[k];
  return out;
}

// A carousel made back into one post: its cover, with the carousel's name and sizes.
export function toSinglePost(d: Json): Json {
  const cover = postPagesOf(d)[0] ?? { template: 'post', kind: 'statement' };
  const out: Json = { ...pageOf(cover), template: 'post' };
  for (const k of CAROUSEL_OWN) if (d[k] !== undefined) out[k] = d[k];
  return out;
}

export const withPostPage = (d: Json, i: number, page: Json): Json => ({ ...d, pages: postPagesOf(d).map((p, j) => (j === i ? pageOf({ ...page, template: 'post' }) : p)) });
// A new body page, just before the closing page (a carousel of one cover only gets it at the end).
export function addBodyPage(d: Json, kind = 'statement'): Json {
  const pages = postPagesOf(d);
  if (pages.length >= MAX_PAGES) return d;
  const at = pages.length >= 2 ? pages.length - 1 : pages.length;
  return { ...d, pages: [...pages.slice(0, at), { template: 'post', kind }, ...pages.slice(at)] };
}
export const removePostPage = (d: Json, i: number): Json => (postPagesOf(d).length <= MIN_PAGES ? d : { ...d, pages: postPagesOf(d).filter((_, j) => j !== i) });
export function movePostPage(d: Json, i: number, by: -1 | 1): Json {
  const pages = postPagesOf(d), j = i + by;
  if (j < 0 || j >= pages.length) return d;
  [pages[i], pages[j]] = [pages[j]!, pages[i]!];
  return { ...d, pages };
}

// The networks a carousel of `count` images is too long for, as messages to show. `networks`: where the post goes.
export function imageLimitProblems(count: number, networks: readonly string[]): string[] {
  return networks.filter((n) => IMAGE_LIMITS[n] !== undefined && count > IMAGE_LIMITS[n]!)
    .map((n) => `${NAMES[n] ?? n} takes ${IMAGE_LIMITS[n]} images in one post and this carousel has ${count}. Remove ${count - IMAGE_LIMITS[n]!} page${count - IMAGE_LIMITS[n]! === 1 ? '' : 's'}, or leave ${NAMES[n] ?? n} out under Networks.`);
}
