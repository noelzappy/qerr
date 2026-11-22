// How a post's pictures are shown in short: whether it is a carousel and how many pages it has (the badge on a card's thumbnail),
// and its saved pictures grouped by size, each group in page order (the strip on the post page). Pure functions.
import type { MediaView } from './types';

type Design = Record<string, unknown> | null | undefined;

// The pages of a carousel post, or null for a post that is not one. The design says so first (a post not yet drawn is still a
// carousel); without one, the pictures made from it do: two or more pages of one size.
export function carouselPages(design: Design, media: MediaView[]): number | null {
  if (design && design.template === 'carousel' && Array.isArray(design.pages)) return design.pages.length >= 2 ? design.pages.length : null;
  const first = media.find((m) => m.source === 'render' && typeof m.slide === 'number');
  if (!first) return null;
  const pages = media.filter((m) => m.source === 'render' && m.renderSize === first.renderSize && typeof m.slide === 'number').length;
  return pages >= 2 ? pages : null;
}

export interface MediaGroup {
  // 'render:<size>' or 'upload'
  key: string;
  // 'Feed', 'Story', 'Uploaded'
  label: string;
  items: MediaView[];
}

const sizeName = (s: string | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Image');

// Made pictures by size (in the order the sizes first appear, pages in order), then the uploaded files.
export function groupMedia(media: MediaView[]): MediaGroup[] {
  const groups = new Map<string, MediaGroup>();
  for (const m of media) {
    const key = m.source === 'upload' ? 'upload' : `render:${m.renderSize ?? ''}`;
    if (!groups.has(key)) groups.set(key, { key, label: m.source === 'upload' ? 'Uploaded' : sizeName(m.renderSize), items: [] });
    groups.get(key)!.items.push(m);
  }
  const out = [...groups.values()];
  for (const g of out) if (g.key !== 'upload') g.items.sort((a, b) => (a.slide ?? 0) - (b.slide ?? 0));
  return [...out.filter((g) => g.key !== 'upload'), ...out.filter((g) => g.key === 'upload')];
}
