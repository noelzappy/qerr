// The batch page's Show filter: which posts each choice keeps, and how many that is, so each choice can say its count.
import type { PostSummary } from './types';
import { POST_FILTERS } from './labels';

type Filterable = Pick<PostSummary, 'status' | 'renderStatus' | 'warningCount'>;

// '' shows every post; the rest are a step (Writing, Approved) or a problem (image could not be made, has warnings).
export function matchesPostFilter(p: Filterable, filter: string): boolean {
  if (!filter) return true;
  if (filter === 'render-failed') return p.renderStatus === 'failed';
  if (filter === 'warnings') return p.warningCount > 0;
  return p.status === filter;
}

// How many of these posts each choice of the filter shows, keyed by the choice's value.
export function postFilterCounts(posts: Filterable[]): Record<string, number> {
  return Object.fromEntries(POST_FILTERS.map((f) => [f.value, posts.filter((p) => matchesPostFilter(p, f.value)).length]));
}
