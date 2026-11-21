// What the post editor's design form does to a design block, as plain functions (DesignFields.tsx draws them): the layout a post
// or a carousel page is made with (a built-in template, or one of the brand's own layouts as "layout:<id>"), and a carousel's
// pages. The engine checks the result again when the post is saved (packages/engine/lib/design/layout.mjs postDesignProblems).
import { TEMPLATES } from './labels';
import type { DesignBlock } from './types';

// The brand's own layouts (Settings, Layouts), as GET /api/layouts lists them: what a post fills in for each.
export interface LayoutBrief { id: string; name: string; description: string | null; sizes: string[]; fields: Array<{ name: string; kind: string; required: boolean; max: number | null; min: number | null; word: string }> }

export const LAYOUT = 'layout:';
// The most pages a carousel takes (the engine's MAX_PAGES), and the fewest.
export const MAX_PAGES = 10;
export const MIN_PAGES = 2;
// The built-in templates a carousel page may use (the engine's PAGE_TEMPLATES: every template but the photo post and the carousel).
const NOT_A_PAGE = ['photo', 'carousel'];
export const PAGE_TEMPLATES = TEMPLATES.filter((t) => !NOT_A_PAGE.includes(t.value));
// What a carousel page from one of the brand's layouts keeps besides the layout's fields: its frame and the app's vault photo id.
const PAGE_FRAME = ['template', 'layout', 'series', 'label', 'ground', 'accent', 'vaultItemId'];
// What belongs to the carousel and never to one of its pages.
const CAROUSEL_OWN = ['sizes', 'name', 'networkSizes'];

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const isObj = (v: unknown): v is DesignBlock => !!v && typeof v === 'object' && !Array.isArray(v);

// The value of the layout select for a design block or a page: "layout:<id>" for a brand's layout, else the template's name.
export const chosenOf = (d: DesignBlock): string => (d.template === 'layout' ? `${LAYOUT}${text(d.layout)}` : text(d.template));
export const labelOf = (l: LayoutBrief) => `Your layout: ${l.name}`;

// The choices for a post (every template, the carousel and every brand layout) or for a carousel page (the page templates and the
// brand layouts drawn at the feed size, the only size of a carousel). A value no choice has (a layout since removed) stays listed.
export function layoutChoices(brand: LayoutBrief[], chosen: string, { page = false } = {}): Array<{ value: string; label: string }> {
  const mine = brand.filter((l) => !page || l.sizes.includes('feed')).map((l) => ({ value: `${LAYOUT}${l.id}`, label: labelOf(l) }));
  const builtin = page ? PAGE_TEMPLATES : TEMPLATES;
  const known = [...builtin, ...mine].some((t) => t.value === chosen);
  return [...(known ? [] : [{ value: chosen, label: chosen.replace(LAYOUT, 'Your layout: ') || 'Choose a layout' }]), ...mine, ...builtin];
}

// The brand layout a design block or page is made with, when it is one the brand has.
export const ownLayoutOf = (d: DesignBlock, brand: LayoutBrief[]): LayoutBrief | null => (d.template === 'layout' ? brand.find((l) => l.id === d.layout) ?? null : null);

// A design block or page set to another layout. A built-in template drops "layout" (a brand layout's id). A post keeps its other
// fields as they were; a carousel page made with a brand's layout keeps only that layout's fields and its frame, since the engine
// refuses anything else on it.
export function chooseLayout(d: DesignBlock, value: string, brand: LayoutBrief[], { page = false } = {}): DesignBlock {
  if (!value.startsWith(LAYOUT)) {
    const { layout: _l, ...rest } = d;
    const next: DesignBlock = { ...rest, template: value };
    if (value === 'carousel' && !Array.isArray(next.pages)) next.pages = [{ template: 'closing' }, { template: 'closing' }];
    return next;
  }
  const id = value.slice(LAYOUT.length);
  const next: DesignBlock = { ...d, template: 'layout', layout: id };
  if (!page) return next;
  const l = brand.find((x) => x.id === id);
  const keep = new Set([...PAGE_FRAME, ...(l?.fields.map((f) => f.name) ?? []), ...(l?.fields.some((f) => f.kind === 'image') ? ['focal', 'zoom'] : [])]);
  return Object.fromEntries(Object.entries(next).filter(([k]) => keep.has(k) && !CAROUSEL_OWN.includes(k)));
}

// One field of a design block or page set (an empty text or list removes it).
export function withField(d: DesignBlock, key: string, value: unknown): DesignBlock {
  const next: DesignBlock = { ...d };
  if (value === '' || value === undefined || (Array.isArray(value) && value.length === 0)) delete next[key];
  else next[key] = value;
  return next;
}

// ---- a carousel's pages ----
export const isCarousel = (d: DesignBlock) => d.template === 'carousel' || Array.isArray(d.pages);
export const pagesOf = (d: DesignBlock): DesignBlock[] => (Array.isArray(d.pages) ? d.pages.map((p) => (isObj(p) ? p : {})) : []);
export const withPage = (d: DesignBlock, i: number, page: DesignBlock): DesignBlock => ({ ...d, pages: pagesOf(d).map((p, j) => (j === i ? page : p)) });
// A new last page: a closing page, which needs no words of its own.
export const addPage = (d: DesignBlock): DesignBlock => (pagesOf(d).length >= MAX_PAGES ? d : { ...d, pages: [...pagesOf(d), { template: 'closing' }] });
export const removePage = (d: DesignBlock, i: number): DesignBlock => (pagesOf(d).length <= MIN_PAGES ? d : { ...d, pages: pagesOf(d).filter((_, j) => j !== i) });
export function movePage(d: DesignBlock, i: number, by: -1 | 1): DesignBlock {
  const pages = pagesOf(d), j = i + by;
  if (j < 0 || j >= pages.length) return d;
  [pages[i], pages[j]] = [pages[j]!, pages[i]!];
  return { ...d, pages };
}
