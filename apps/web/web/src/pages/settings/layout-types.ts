// The shapes of Settings, Layouts: a layout as the engine reads it (packages/engine/lib/design/layout.mjs), the catalogue of
// block types, options and fields the server sends (so the editor offers exactly what the engine accepts), and the grid maths the
// sketch draws with. The server and the engine check every layout; nothing here decides what is valid.

export type Edge = 'top' | 'right' | 'bottom' | 'left';
export interface Slot { col: number; row: number; width: number; height: number }
// A rectangle in page pixels (a block on a built-in page: poster or editorial).
export interface Px { x: number; y: number; w: number; h: number }
export type Margins = Record<Edge, number>;
export interface Grid { columns: number; rows: number; margin: number | Margins; gutter?: number; rowGutter?: number }
export type When = Record<string, unknown>;
export interface Block { type: string; slot?: Slot | Record<string, Slot>; px?: Px | Record<string, Px>; when?: When; field?: string; subField?: string; children?: Block[]; bleed?: Edge[]; text?: string; source?: string; titleField?: string; [option: string]: unknown }
export interface GroundCase { when?: When; ground: string }
export interface FieldRule { required?: boolean; max?: number; min?: number; types?: string[] }
export interface Layout {
  id: string; name: string; description?: string; page?: string; ground?: string | GroundCase[]; accent?: string; texture?: string;
  fields: Record<string, FieldRule>; canvas: Record<string, Grid>; blocks: Block[];
}

// What an option or a binding needs of the block's other settings: { device: "desktop" } (that option's value, its default filled
// in) or { subField: true } (that key given).
export type Needs = Record<string, string | number | boolean> | null;
export type OptionSpec = ({ type: 'enum'; values: Array<string | number>; default: string | number; aliases?: Record<string, string> } | { type: 'bool'; default: boolean } | { type: 'int'; min: number; max: number; step: number; default: number }) & { needs?: Needs };
export type ChoiceValue = string | number | boolean;
// A block type on one page kind (the catalogue's pages): what it shows, how it is placed, the options the page takes there.
export interface PageBlockSpec {
  kinds: string[]; field: string | null; fields: string[];
  chrome: boolean; child: boolean; text: boolean; under: boolean;
  bleed: { edges: Edge[]; needs: Needs } | null;
  children: string[] | null;
  // a block the page runs the full width to its bottom edge (with these option values)
  fullWidth: Record<string, string> | null;
  options: Record<string, OptionSpec>;
  // a block with children: each child type it holds, with the options it takes inside (its children lists the same types)
  holds: Record<string, string[]> | null;
  // the most slabs a myth and fact block draws (each headline starts one, and so does a first child that is not a headline)
  slabs: number | null;
  defaults: Record<string, unknown>;
  bindings: Record<string, { kinds?: string[]; fields?: string[]; max?: number; values?: string[]; needs: Needs; child: boolean }>;
}
// One page kind a brand's layout may use: grid, poster or editorial.
export interface PageCatalogue {
  sizes: string[];
  place: Array<'slot' | 'px'>;
  decorations: string[];
  grounds: string[];
  photoGround: { field: string } | null;
  conditions: { keys: string[]; pages: string[]; choices: Record<string, { values: ChoiceValue[]; unset: boolean; declared: boolean }> };
  blocks: Record<string, PageBlockSpec>;
}
export interface FieldSpec {
  kind: string; cap?: number; max?: number; chars?: number; word: string;
  rules: { required: boolean; max?: { min: number; max: number; default?: number }; min?: { min: number; max: number }; types?: string[] };
}
export interface Catalogue {
  sizes: Record<string, { w: number; h: number; minMargins: Margins; px: Record<'x' | 'y' | 'w' | 'h', [number, number]> }>;
  grid: { columns: [number, number]; rows: [number, number]; gutter: [number, number]; margin: [number, number]; minCell: number };
  grounds: string[]; groundAliases: Record<string, string>; darkGrounds: string[]; accents: string[]; textures: string[];
  fields: Record<string, FieldSpec>;
  // the grid page's block types (what the AI is offered); the editor reads pages
  blocks: Record<string, { kinds: string[]; field: string | null; child: boolean; bleed: boolean; children: boolean; under: boolean; options: Record<string, OptionSpec> }>;
  labelSources: string[];
  layout: { id: { pattern: string; max: number }; name: { max: number }; description: { max: number }; accents: string[] };
  limits: { layouts: number; blocks: number; children: number; groundCases: number };
  pages: Record<string, PageCatalogue>;
}

export interface StoredLayout { id: string; slug: string; name: string; definition: Layout; origin: string; enabled: boolean; position: number; createdAt: string; updatedAt: string }
// A built-in layout (read only): its template, the variant it draws ("layout is side"), and whether a brand may copy it.
export interface BuiltinLayout { id: string; template: string; variant: string | null; copyable: boolean; why: string | null; definition: Layout }
export interface LayoutsResponse { layouts: StoredLayout[]; starters: Layout[]; builtins: BuiltinLayout[]; catalogue: Catalogue; max: number }
export interface PreviewResult { ok: boolean; image?: string; size: string; error?: string; warnings: string[]; notes: string[] }

export const SIZE_LABEL: Record<string, string> = { feed: 'Feed 1080 x 1350', square: 'Square 1080 x 1080', story: 'Story 1080 x 1920', wide: 'Wide 1200 x 675' };
export const BLOCK_LABEL: Record<string, string> = {
  headline: 'Headline', sub: 'Sub line', label: 'Label', figure: 'Big number', stats: 'Figures', list: 'List', photo: 'Photo', screen: 'Screen',
  logo: 'Logo', website: 'Website', slab: 'Colour panel (slab)', artefact: 'Ledger, passbook or card', decoration: 'Decoration', spacer: 'Empty space',
  bar: 'Logo bar', runhead: 'Running head', footer: 'Footer', mark: 'Series mark', slabs: 'Myth and fact slabs', labelrow: 'Label row',
  halo: 'Glow behind the phone', footlogo: 'Footer with the logo', beside: 'Passbook beside the phone', backdrop: 'Photo behind everything',
  scrim: 'Scrim', lines: 'Thin lines', photoFooter: 'Photo footer',
};
export const OPTION_LABEL: Record<string, string> = {
  size: 'Size (px on the feed page)', style: 'Style', align: 'Alignment', valign: 'Vertical alignment', tone: 'Colour', direction: 'Direction', rules: 'Lines between',
  frame: 'Frame', device: 'Device', fit: 'Fit', glow: 'Glow behind', tilt: 'Tilted', framed: 'Capture has its own frame', variant: 'Logo', ground: 'Colour',
  radius: 'Corners', shadow: 'Shadow', padding: 'Padding (px)', gap: 'Gap between (px)', kind: 'Kind',
  shrink: 'Shrinks to fit', subWidth: 'Sub line width (px)', row: 'In a row with the phone', rule: 'Rule under it', label: 'Label beside the logo',
  fallback: 'When the post gives none', subFallback: 'Sub line when the post gives none', from: 'Artefact from',
  titleField: 'Window title from', subField: 'Sub line under it',
};
export const EDGES: Edge[] = ['top', 'right', 'bottom', 'left'];

// Where a built-in page puts its chrome, roughly, for the sketch only (the engine places it by the brand's style).
export const CHROME_RECT: Record<string, Px> = {
  bar: { x: 80, y: 52, w: 920, h: 44 }, runhead: { x: 70, y: 52, w: 940, h: 40 }, footer: { x: 70, y: 1262, w: 940, h: 44 },
  footlogo: { x: 70, y: 1262, w: 300, h: 44 }, mark: { x: 700, y: 1250, w: 300, h: 44 }, photoFooter: { x: 70, y: 1262, w: 940, h: 44 },
};
export function marginsOf(m: Grid['margin']): Margins {
  if (typeof m === 'number') return { top: m, right: m, bottom: m, left: m };
  return { top: m?.top ?? 0, right: m?.right ?? 0, bottom: m?.bottom ?? 0, left: m?.left ?? 0 };
}

// The same maths as the engine's cellOf and slotRect, for drawing the sketch only.
export function cellOf(g: Grid, page: { w: number; h: number }) {
  const m = marginsOf(g.margin), gx = g.gutter ?? 0, gy = g.rowGutter ?? gx;
  return { w: (page.w - m.left - m.right - (g.columns - 1) * gx) / g.columns, h: (page.h - m.top - m.bottom - (g.rows - 1) * gy) / g.rows, gx, gy, m };
}
export function rectOf(g: Grid, page: { w: number; h: number }, s: Slot, bleed: Edge[] = []) {
  const c = cellOf(g, page);
  let x = c.m.left + (s.col - 1) * (c.w + c.gx), y = c.m.top + (s.row - 1) * (c.h + c.gy);
  let w = s.width * c.w + (s.width - 1) * c.gx, h = s.height * c.h + (s.height - 1) * c.gy;
  if (bleed.includes('top')) { h += y; y = 0; }
  if (bleed.includes('left')) { w += x; x = 0; }
  if (bleed.includes('bottom')) h = page.h - y;
  if (bleed.includes('right')) w = page.w - x;
  return { x, y, w, h };
}

// The cell under a point of the sketch (in page pixels), or null in a margin.
export function cellAt(g: Grid, page: { w: number; h: number }, px: number, py: number): { col: number; row: number } | null {
  const c = cellOf(g, page);
  const col = Math.floor((px - c.m.left) / (c.w + c.gx)) + 1, row = Math.floor((py - c.m.top) / (c.h + c.gy)) + 1;
  return col >= 1 && col <= g.columns && row >= 1 && row <= g.rows ? { col, row } : null;
}


// A new layout: a headline and the logo on the feed page's editorial grid.
export const blankLayout = (id = 'my-layout'): Layout => ({
  id, name: 'My layout', fields: { headline: { required: true, max: 90 } },
  canvas: { feed: { columns: 12, rows: 24, margin: { top: 56, right: 70, bottom: 56, left: 70 }, gutter: 20, rowGutter: 0 } },
  blocks: [{ type: 'headline', slot: { col: 1, row: 3, width: 12, height: 10 }, size: 104 }, { type: 'logo', slot: { col: 1, row: 24, width: 6, height: 1 }, valign: 'bottom' }],
});
