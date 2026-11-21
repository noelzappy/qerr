// The shapes of Settings, Layouts: a layout as the engine reads it (packages/engine/lib/design/layout.mjs), the catalogue of
// block types, options and fields the server sends (so the editor offers exactly what the engine accepts), and the grid maths the
// sketch draws with. The server and the engine check every layout; nothing here decides what is valid.

export type Edge = 'top' | 'right' | 'bottom' | 'left';
export interface Slot { col: number; row: number; width: number; height: number }
export type Margins = Record<Edge, number>;
export interface Grid { columns: number; rows: number; margin: number | Margins; gutter?: number; rowGutter?: number }
export interface Block { type: string; slot?: Slot | Record<string, Slot>; field?: string; children?: Block[]; bleed?: Edge[]; text?: string; source?: string; titleField?: string; [option: string]: unknown }
export interface FieldRule { required?: boolean; max?: number; min?: number; types?: string[] }
export interface Layout {
  id: string; name: string; description?: string; ground?: string; accent?: string; texture?: string;
  fields: Record<string, FieldRule>; canvas: Record<string, Grid>; blocks: Block[];
}

export type OptionSpec = { type: 'enum'; values: Array<string | number>; default: string | number } | { type: 'bool'; default: boolean };
export interface Catalogue {
  sizes: Record<string, { w: number; h: number; minMargins: Margins }>;
  grid: { columns: [number, number]; rows: [number, number]; gutter: [number, number]; margin: [number, number]; minCell: number };
  grounds: string[]; darkGrounds: string[]; accents: string[]; textures: string[];
  fields: Record<string, { kind: string; cap?: number; max?: number; chars?: number; word: string }>;
  blocks: Record<string, { kinds: string[]; field: string | null; child: boolean; bleed: boolean; children: boolean; under: boolean; options: Record<string, OptionSpec> }>;
  labelSources: string[];
  limits: { layouts: number; blocks: number; children: number };
}

export interface StoredLayout { id: string; slug: string; name: string; definition: Layout; origin: string; enabled: boolean; position: number; createdAt: string; updatedAt: string }
export interface LayoutsResponse { layouts: StoredLayout[]; starters: Layout[]; catalogue: Catalogue; max: number }
export interface PreviewResult { ok: boolean; image?: string; size: string; error?: string; warnings: string[]; notes: string[] }

export const SIZE_LABEL: Record<string, string> = { feed: 'Feed 1080 x 1350', square: 'Square 1080 x 1080', story: 'Story 1080 x 1920', wide: 'Wide 1200 x 675' };
export const BLOCK_LABEL: Record<string, string> = {
  headline: 'Headline', sub: 'Sub line', label: 'Label', figure: 'Big number', stats: 'Figures', list: 'List', photo: 'Photo', screen: 'Screen',
  logo: 'Logo', website: 'Website', slab: 'Colour panel (slab)', artefact: 'Ledger, passbook or card', decoration: 'Decoration', spacer: 'Empty space',
};
export const OPTION_LABEL: Record<string, string> = {
  size: 'Size (px on the feed page)', style: 'Style', align: 'Alignment', valign: 'Vertical alignment', tone: 'Colour', direction: 'Direction', rules: 'Lines between',
  frame: 'Frame', device: 'Device', fit: 'Fit', glow: 'Glow behind', tilt: 'Tilted', framed: 'Capture has its own frame', variant: 'Logo', ground: 'Colour',
  radius: 'Corners', shadow: 'Shadow', padding: 'Padding (px)', gap: 'Gap between (px)', kind: 'Kind',
};
export const EDGES: Edge[] = ['top', 'right', 'bottom', 'left'];

const isSlot = (s: unknown): s is Slot => !!s && typeof s === 'object' && 'col' in (s as object);
export const slotFor = (b: Block, size: string): Slot | null => (isSlot(b.slot) ? b.slot : (b.slot as Record<string, Slot> | undefined)?.[size] ?? null);

// A block's slot set for one size. With several sizes a single slot becomes one per size (each size its own copy).
export function withSlot(b: Block, size: string, slot: Slot, sizes: string[]): Block {
  if (sizes.length <= 1) return { ...b, slot };
  const per: Record<string, Slot> = {};
  for (const z of sizes) per[z] = slotFor(b, z) ?? slot;
  per[size] = slot;
  return { ...b, slot: per };
}

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

// Fields a block of this type can show, among the catalogue's fields.
export const fieldsFor = (cat: Catalogue, type: string): string[] => Object.keys(cat.fields).filter((f) => cat.blocks[type]?.kinds.includes(cat.fields[f].kind));

// A short description of a block for lists and the sketch.
export function blockTitle(b: Block): string {
  const what = BLOCK_LABEL[b.type] ?? b.type;
  if (b.type === 'label') return `${what}: ${b.field ? b.field : b.text ? `"${b.text}"` : b.source ?? ''}`;
  if (b.type === 'decoration') return `${what}: ${String(b.kind ?? 'rule')}`;
  if (b.type === 'slab') return `${what} (${b.children?.length ?? 0} inside)`;
  return b.field ? `${what}: ${b.field}` : what;
}

// A new layout: a headline and the logo on the feed page's editorial grid.
export const blankLayout = (id = 'my-layout'): Layout => ({
  id, name: 'My layout', fields: { headline: { required: true, max: 90 } },
  canvas: { feed: { columns: 12, rows: 24, margin: { top: 56, right: 70, bottom: 56, left: 70 }, gutter: 20, rowGutter: 0 } },
  blocks: [{ type: 'headline', slot: { col: 1, row: 3, width: 12, height: 10 }, size: 104 }, { type: 'logo', slot: { col: 1, row: 24, width: 6, height: 1 }, valign: 'bottom' }],
});
