// What the post editor fills in by itself: the post's title from its headline (else the first words of the caption), and a designed
// image for a new post when the brand has a look. Pure, so it is specced without a browser (src/web-smart-defaults.spec.ts).
import type { Json } from './types';

export const TITLE_WORDS_MAX = 60;

// A headline as people read it: no *highlight* asterisks, [[pill]] brackets or {{icon}} marks, one line.
export function plainHeadline(text: string): string {
  return text.replace(/\{\{[^}]*\}\}/g, ' ').replace(/\[\[|\]\]/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

// The words that head a design: its headline, else a quotation or a myth; in a carousel, the first page that has one.
export function headlineOf(design: Json | null | undefined): string {
  if (!design) return '';
  for (const key of ['headline', 'quote', 'myth', 'factLead'] as const) {
    const t = plainHeadline(str(design[key]));
    if (t) return t;
  }
  if (Array.isArray(design.pages)) {
    for (const p of design.pages) { const t = isObj(p) ? headlineOf(p) : ''; if (t) return t; }
  }
  return '';
}

// At most `max` characters, cut at a word.
export function firstWords(text: string, max = TITLE_WORDS_MAX): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return (at > max / 3 ? cut.slice(0, at) : line.slice(0, max)).replace(/[\s,;:.–-]+$/, '');
}

export type TitleSource = 'headline' | 'caption';

// The title a post gets when nobody typed one: from the headline, else the first words of the caption, else nothing.
export function autoTitle(design: Json | null | undefined, caption: string): { title: string; from: TitleSource | null } {
  const head = headlineOf(design);
  if (head) return { title: firstWords(head), from: 'headline' };
  const words = firstWords(caption.split(/\n/).find((l) => l.trim()) ?? '');
  return words ? { title: words, from: 'caption' } : { title: '', from: null };
}

export const TITLE_FROM: Record<TitleSource, string> = { headline: 'From the headline', caption: 'From the caption' };

// The design a new post starts with: a statement post when the brand has a look or a design direction (the kind needs only a
// headline, so a brand with no pictures yet can make its first image); none while that is not known or when it has neither.
export function designForNewPost(direction: string | null | undefined): Json | null {
  return typeof direction === 'string' ? { template: 'post', kind: 'statement' } : null;
}
