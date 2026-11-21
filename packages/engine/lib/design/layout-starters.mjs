// Starting points for a brand's own layouts: compositions like the built-in templates, written as layout data
// (lib/design/layout.mjs). Settings, Layouts offers them to copy and change; they are never used by a post as they are.
// Each one is checked by the same validator as a brand's own (test-design-layout.mjs).

// The editorial page's grid: 12 columns and 24 rows of about 52 px inside the reference margins (70 px at the sides, 56 px at
// the top and bottom, where the running head and the footer sit).
const EDITORIAL = { columns: 12, rows: 24, margin: { top: 56, right: 70, bottom: 56, left: 70 }, gutter: 20, rowGutter: 0 };
const POSTER = { columns: 12, rows: 24, margin: { top: 56, right: 80, bottom: 56, left: 80 }, gutter: 20, rowGutter: 0 };
const at = (col, row, width, height) => ({ col, row, width, height });
const foot = (row = 24) => [
  { type: 'logo', slot: at(1, row, 6, 1), valign: 'bottom', variant: 'auto', size: 32 },
  { type: 'website', slot: at(7, row, 6, 1), align: 'right', valign: 'bottom', size: 24 },
];
const head = () => [
  { type: 'label', source: 'series', slot: at(1, 1, 8, 1), valign: 'center' },
  { type: 'label', source: 'brand', slot: at(9, 1, 4, 1), align: 'right', valign: 'center' },
  { type: 'decoration', kind: 'rule', slot: at(1, 2, 12, 1) },
];

export const STARTER_LAYOUTS = [
  {
    id: 'text', name: 'Headline and panel', description: 'A large headline on the page, the sub line on the tint panel below it, the logo and the website at the foot. Like the built-in text page.',
    fields: { headline: { required: true, max: 90 }, sub: { max: 160 } },
    canvas: { feed: EDITORIAL },
    blocks: [
      ...head(),
      { type: 'headline', slot: at(1, 3, 12, 11), size: 112 },
      { type: 'decoration', kind: 'panel', slot: at(1, 17, 12, 8), bleed: ['left', 'right', 'bottom'] },
      { type: 'sub', slot: at(1, 18, 8, 5) },
      ...foot(),
    ],
  },
  {
    id: 'stats', name: 'Big number', description: 'One big figure, a line under it, up to three supporting figures, and an optional photo across the page. Like the built-in stats page.',
    fields: { big: { required: true }, line: { max: 80 }, stats: { min: 0, max: 3 }, image: {} },
    canvas: { feed: EDITORIAL },
    blocks: [
      ...head(),
      { type: 'figure', slot: at(1, 3, 12, 3), size: 168, valign: 'center' },
      { type: 'sub', field: 'line', slot: at(1, 6, 9, 2) },
      { type: 'stats', slot: at(1, 9, 12, 3), size: 56 },
      { type: 'photo', slot: at(1, 13, 12, 10), bleed: ['left', 'right'] },
      ...foot(),
    ],
  },
  {
    id: 'photo-story', name: 'Photo and story', description: 'A full-bleed photo across the top, then a label, the headline and the sub line. Like the built-in photo story page.',
    fields: { image: { required: true }, headline: { required: true, max: 70 }, sub: { max: 140 } },
    canvas: { feed: EDITORIAL },
    blocks: [
      { type: 'photo', slot: at(1, 1, 12, 13), bleed: ['top', 'left', 'right'] },
      { type: 'label', source: 'series', slot: at(1, 15, 12, 1), valign: 'center' },
      { type: 'headline', slot: at(1, 16, 12, 4), size: 76 },
      { type: 'sub', slot: at(1, 20, 12, 3) },
      ...foot(),
    ],
  },
  {
    id: 'cover', name: 'Framed photo', description: 'A photo with the card radius inside the margins, the headline and the sub line under it. Like the built-in cover page.',
    fields: { image: { required: true }, headline: { required: true, max: 70 }, sub: { max: 120 } },
    canvas: { feed: EDITORIAL },
    blocks: [
      { type: 'label', source: 'series', slot: at(1, 1, 12, 1), valign: 'center' },
      { type: 'photo', frame: 'card', slot: at(1, 2, 12, 13) },
      { type: 'headline', slot: at(1, 16, 12, 4), size: 70 },
      { type: 'sub', slot: at(1, 20, 12, 3) },
      ...foot(),
    ],
  },
  {
    id: 'myth-fact', name: 'Myth and fact', description: 'The myth on a dark slab and the fact on a pale one, on a dark textured page. Like the built-in myth and fact page.',
    ground: 'ink', texture: 'lines', accent: 'colour',
    fields: { myth: { required: true, max: 90 }, factLead: { required: true, max: 90 }, fact: { max: 140 } },
    canvas: { feed: POSTER },
    blocks: [
      { type: 'logo', slot: at(1, 1, 6, 1), valign: 'center', variant: 'auto', size: 34 },
      { type: 'website', slot: at(7, 1, 6, 1), align: 'right', valign: 'center' },
      { type: 'slab', ground: 'deep', radius: 'slab', slot: at(1, 3, 12, 9), valign: 'center', padding: 48, gap: 28, children: [
        { type: 'label', text: 'Myth', style: 'tag', size: 24 },
        { type: 'headline', field: 'myth', style: 'poster', size: 68 },
      ] },
      { type: 'slab', ground: 'mint', radius: 'slab', slot: at(1, 12, 12, 11), valign: 'center', padding: 48, gap: 24, children: [
        { type: 'label', text: 'Fact', style: 'tag', size: 24 },
        { type: 'headline', field: 'factLead', style: 'poster', size: 68 },
        { type: 'sub', field: 'fact' },
      ] },
      { type: 'label', source: 'series', style: 'plain', size: 28, slot: at(5, 24, 8, 1), align: 'right', valign: 'bottom' },
    ],
  },
  {
    id: 'split', name: 'Photo beside text', description: 'A photo filling the left half of the page, edge to edge, and the text in the right half.',
    fields: { image: { required: true }, label: { max: 30 }, headline: { required: true, max: 60 }, sub: { max: 110 } },
    canvas: { feed: { ...EDITORIAL, columns: 12 } },
    blocks: [
      { type: 'photo', slot: at(1, 1, 6, 24), bleed: ['top', 'left', 'bottom'] },
      { type: 'label', field: 'label', slot: at(7, 3, 6, 1), valign: 'center', tone: 'accent' },
      { type: 'headline', slot: at(7, 4, 6, 9), size: 64, valign: 'bottom' },
      { type: 'sub', slot: at(7, 14, 6, 6) },
      { type: 'logo', slot: at(7, 24, 6, 1), valign: 'bottom', variant: 'auto', size: 32 },
    ],
  },
  {
    id: 'quote', name: 'Quotation', description: 'A short quotation set large on a pale ground, with a label above it and the logo at the foot.',
    ground: 'mint', accent: 'colour',
    fields: { quote: { required: true, max: 120 }, label: { max: 40 } },
    canvas: { feed: POSTER, square: { ...POSTER, rows: 18 } },
    blocks: [
      { type: 'label', field: 'label', slot: { feed: at(1, 4, 12, 1), square: at(1, 3, 12, 1) }, valign: 'center' },
      { type: 'headline', field: 'quote', style: 'poster', size: 88, slot: { feed: at(1, 5, 12, 15), square: at(1, 4, 12, 11) } },
      { type: 'logo', slot: { feed: at(1, 24, 6, 1), square: at(1, 18, 6, 1) }, valign: 'bottom', variant: 'solid', size: 34 },
      { type: 'website', slot: { feed: at(7, 24, 6, 1), square: at(7, 18, 6, 1) }, align: 'right', valign: 'bottom' },
    ],
  },
];

// A copy of a starting point under a new id and name, ready to be changed.
export function starterCopy(id, { newId, name } = {}) {
  const s = STARTER_LAYOUTS.find((l) => l.id === id);
  if (!s) return null;
  return { ...structuredClone(s), id: newId ?? s.id, name: name ?? s.name };
}
