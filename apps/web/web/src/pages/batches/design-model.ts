// What the post editor does to a design (the form in PageFields.tsx and PagesEditor.tsx draws them), as plain functions: the layout
// a post or a carousel page is made with (a built-in layout, or one of the brand's own as "layout:<id>"), and a carousel's pages.
// The engine checks the result again when the post is saved (packages/engine/lib/design/layout.mjs postDesignProblems).
import { CHART_LIMITS, type ChartLimits } from './editor/chart-model';
import { LAYOUT_CATALOGUE, postKindName } from './editor/catalogue';
import type { Json as DesignBlock, LayoutBrief } from './editor/types';

export type { LayoutBrief };

export const LAYOUT = 'layout:';
// The most pages a carousel takes (the engine's MAX_PAGES), and the fewest.
export const MAX_PAGES = 10;
export const MIN_PAGES = 2;
// The built-in layouts a carousel page may use (the engine's PAGE_TEMPLATES: every layout but the photo post and the carousel).
const NOT_A_PAGE = ['photo', 'carousel'];
export const PAGE_TEMPLATES = LAYOUT_CATALOGUE.filter((t) => !NOT_A_PAGE.includes(t.value));
// A carousel page is drawn at the feed size, the only size of a carousel, so only a brand layout with that size can be a page.
export const pageLayouts = (brand: LayoutBrief[]): LayoutBrief[] => brand.filter((l) => l.sizes.includes('feed'));
// What a carousel page from one of the brand's layouts keeps besides the layout's fields: its frame and the app's vault photo id.
const PAGE_FRAME = ['template', 'layout', 'series', 'label', 'ground', 'accent', 'vaultItemId'];
// What belongs to the carousel and never to one of its pages.
const CAROUSEL_OWN = ['sizes', 'name', 'networkSizes'];

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const isObj = (v: unknown): v is DesignBlock => !!v && typeof v === 'object' && !Array.isArray(v);

// The value of the layout select for a design block or a page: "layout:<id>" for a brand's layout, else the template's name.
export const chosenOf = (d: DesignBlock): string => (d.template === 'layout' ? `${LAYOUT}${text(d.layout)}` : text(d.template));

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
  if (value === '' || value === undefined || value === null || (Array.isArray(value) && value.length === 0)) delete next[key];
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

// ---- the `post` design: a kind of post and only the fields that kind uses ----
// The fallback for what GET /api/posts/post-kinds answers (the engine's post-spec.mjs and the kind's compositions); the server's
// answer is used when it is there.
export const POST_KINDS = ['statement', 'figure', 'list', 'quote', 'photo', 'event', 'offer'] as const;
export type PostKind = (typeof POST_KINDS)[number];
export type PostFieldName = 'label' | 'headline' | 'sub' | 'big' | 'unit' | 'items' | 'quote' | 'by' | 'image' | 'meta' | 'tag' | 'cta' | 'info' | 'gallery' | 'chart';
export interface PostKindFields { fields: PostFieldName[]; required: PostFieldName[] }

export const POST_KIND_FIELDS: Record<PostKind, PostKindFields> = {
  statement: { fields: ['label', 'headline', 'sub'], required: ['headline'] },
  figure: { fields: ['label', 'sub', 'big', 'unit'], required: ['big'] },
  list: { fields: ['label', 'headline', 'items'], required: ['headline', 'items'] },
  quote: { fields: ['label', 'quote', 'by'], required: ['quote'] },
  photo: { fields: ['label', 'headline', 'sub', 'image'], required: ['image', 'headline'] },
  event: { fields: ['label', 'headline', 'sub', 'meta'], required: ['headline', 'meta'] },
  offer: { fields: ['label', 'headline', 'sub', 'image', 'tag'], required: ['headline', 'tag'] },
};
// The most characters a field takes, counting what is seen (the engine's POST_FIELDS and POST_ITEMS).
// cta, info (labelled rows) and gallery (round pictures) are drawn by a look written as data only (the engine's POST_INFO and POST_GALLERY).
export interface ListLimit { min: number; max: number; chars: number }
export interface PostLimits {
  label: number; headline: number; sub: number; big: number; unit: number; quote: number; by: number; meta: number; tag: number; cta: number;
  items: ListLimit; info: ListLimit; gallery: ListLimit; infoKeys: string[]; icons: string[];
  // a chart (a look written as data only): its points, the characters of a label, the kinds a design draws and the units (the engine's POST_CHART)
  chart: ChartLimits;
}
export const POST_LISTS = ['items', 'info', 'gallery'] as const;
export const POST_LIMITS: PostLimits = {
  label: 28, headline: 70, sub: 140, big: 8, unit: 24, quote: 160, by: 40, meta: 40, tag: 16, cta: 24, items: { min: 2, max: 5, chars: 44 },
  info: { min: 1, max: 4, chars: 40 }, gallery: { min: 2, max: 5, chars: 24 },
  infoKeys: ['When', 'Where', 'Date', 'Time', 'Place', 'Book on', 'Tickets', 'Price', 'Entry', 'Who', 'Host', 'Call', 'Online', 'Starts', 'Ends', 'Open'],
  chart: { ...CHART_LIMITS },
  icons: ['arrow-right', 'arrow-up-right', 'check', 'plus', 'star', 'spark', 'heart', 'bolt', 'leaf', 'calendar', 'clock', 'pin', 'ticket', 'tag', 'gift', 'phone', 'mail', 'user', 'play', 'dot', 'lock', 'shield', 'bowl'],
};
// What the server says about each kind (GET /api/posts/post-kinds).
export interface PostKindInfo {
  kind: string; fields: string[]; required: string[];
  // `budgets` (a look's design only): what the design needs and its longest text per field.
  variants: Array<{ variant: number; name: string; describe: string; budgets?: Record<string, { required: boolean; max?: number; min?: number; kinds?: string[] }> }>;
}

const CANON: PostFieldName[] = ['label', 'headline', 'sub', 'big', 'unit', 'items', 'quote', 'by', 'image', 'meta', 'tag', 'cta', 'info', 'gallery', 'chart'];
// The keys a post may carry besides its fields; the app's vaultItemId is stripped by the server before the engine sees it.
const POST_FRAME = ['name', 'networkSizes', 'sizes'];
const POST_EXTRA = ['focal', 'zoom', 'vaultItemId'];

export const isPostDesign = (d: DesignBlock | null | undefined): boolean => !!d && d.template === 'post';

// A new post design: only its kind. The words are the person's to write.
export const newPostDesign = (kind: string): DesignBlock => ({ template: 'post', kind });

// The fields and the required ones of a kind: the server's data when given, else the static table.
export function postFieldsFor(kind: string, kinds?: PostKindInfo[] | null): { fields: string[]; required: string[] } {
  const known = kinds?.find((k) => k.kind === kind);
  if (known) return { fields: CANON.filter((f) => known.fields.includes(f)), required: known.required };
  const own = (POST_KIND_FIELDS as Record<string, PostKindFields | undefined>)[kind];
  return own ? { fields: [...own.fields].sort((a, b) => CANON.indexOf(a) - CANON.indexOf(b)), required: [...own.required] } : { fields: [], required: [] };
}

// The characters a person sees in a text: the asterisks of an emphasis and the line breaks do not count (as the engine counts).
// A headline's [[pill]] brackets do not count either, and an icon ({{name}}) counts as two characters (the engine's seenText).
export const seenLength = (v: string): number => [...v.replace(/\{\{([a-z][a-z-]{0,19})\}\}/g, '■■').replace(/\[\[([^[\]*{}\n\\]{1,40})\]\]/g, '$1').replace(/\*/g, '').replace(/\\n|\n/g, '')].length;

// A post set to another kind: it keeps only what the new kind uses, plus its frame (template, kind, name, network sizes). The
// variant goes, since the new kind's looks differ. A picture's position and zoom and the app's vault id go with the picture.
export function switchKind(d: DesignBlock, kind: string, kinds?: PostKindInfo[] | null): DesignBlock {
  const { fields } = postFieldsFor(kind, kinds);
  const keep = new Set<string>([...fields, ...(fields.includes('image') ? POST_EXTRA : [])]);
  const next: DesignBlock = { template: 'post', kind };
  for (const [k, v] of Object.entries(d)) {
    if (k === 'template' || k === 'kind' || k === 'variant') continue;
    if (keep.has(k) || POST_FRAME.includes(k)) next[k] = v;
  }
  return next;
}

// A post's look set (a number), or left to the post (undefined).
export const setVariant = (d: DesignBlock, n: number | undefined): DesignBlock => withField(d, 'variant', n);

const KEEP_PICTURE = ['image', 'vaultItemId', 'focal', 'zoom'];
const asText = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

// An old-layout design as a post, where the mapping is obvious: { kind, design }. Nothing is cut to a limit (the server states them),
// empty texts are dropped, and only keys a post may carry are copied. Anything else (a carousel, a brand layout) is null.
export function convertToPost(d: DesignBlock): { kind: PostKind; design: DesignBlock } | null {
  if (!d || Array.isArray(d.pages) || typeof d.template !== 'string') return null;
  const t = d.template;
  const put = (kind: PostKind, pairs: Array<[string, unknown]>, picture = false) => {
    const design: DesignBlock = { template: 'post', kind };
    for (const [k, v] of pairs) { const w = asText(v); if (w !== undefined) design[k] = w; }
    if (picture) for (const k of KEEP_PICTURE) if (d[k] !== undefined && d[k] !== '') design[k] = d[k];
    const name = asText(d.name);
    if (name) design.name = name;
    if (isObj(d.networkSizes)) design.networkSizes = d.networkSizes;
    if (Array.isArray(d.sizes) && d.sizes.length === 1 && d.sizes[0] === 'feed') design.sizes = ['feed'];
    return { kind, design };
  };
  if (['photo', 'cover', 'photo-story', 'object'].includes(t)) {
    const pairs: Array<[string, unknown]> = [['label', d.label], ['headline', d.headline], ['sub', d.sub]];
    return asText(d.image) ? put('photo', pairs, true) : put('statement', pairs.filter(([k]) => k !== 'image'));
  }
  if (['text', 'screen', 'product', 'ledger', 'passbook'].includes(t)) return put('statement', [['label', d.label], ['headline', d.headline], ['sub', d.sub]]);
  if (t === 'closing') return put('statement', [['label', d.label], ['headline', asText(d.headline) ?? d.line], ['sub', d.sub]]);
  if (t === 'number' || t === 'stats') return put('figure', [['label', d.label], ['big', d.big], ['sub', d.line]]);
  if (t === 'myth-fact') return put('statement', [['label', d.label], ['headline', d.factLead], ['sub', d.fact]]);
  return null;
}

export { postKindName };
