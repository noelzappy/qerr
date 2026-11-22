// The blank starter look: a minimal valid look a brand builds its own from ("Start blank" in Settings, Looks). Data, not a shipped
// look: it is not in shippedLooks() and never in the gallery. Neutral settings that take the brand's own colours and fonts (every font
// role is `source: "brand"`, colours are palette roles), and for every kind one plain composition: the logo top left, a headline (or the
// kind's own main field), a sub line and the kind's required fields (big and unit for a figure, items for a list, quote and by for a
// quote, the picture for a photo, meta for an event, tag for an offer).
//
//   starterLook({ id, name })   -> a fresh copy of the starter (origin "starter"), with the id and name given
//   starterComposition(kind)    -> a fresh copy of the starter's composition of that kind ("Add a blank design"), or null
//   STARTER_KINDS               -> the kinds it has a composition for (all of KINDS)
//
// Every composition passes validateLook and every design check with sample, stress and minimal copy (test-design-look-starter.mjs).
import { KINDS } from './look-elements.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));

const LOGO_ROW = 176; // the top of the content, under the logo (top left, 44 px high, 72 px from the top)
const W = 936; // the width between the margins
const headline = (steps, maxLines = 3, maxH = 420) => ({ type: 'text', field: 'headline', style: 'display', emphasis: 'accent', ladder: { by: 'headline', steps, maxLines, maxH }, w: W });
const sub = (w = 760) => ({ type: 'text', field: 'sub', style: 'body', ink: 'ink', when: { present: 'sub' }, w });
const column = (children, { y = LOGO_ROW, h = 1102, justify = 'center', align = 'start', gap = 32 } = {}) => ({ type: 'box', place: { px: { x: 72, y, w: W, h } }, flow: 'column', justify, align, gap, z: 2, children });

const COMPOSITIONS = Object.freeze({
  statement: {
    kind: 'statement', name: 'Plain statement', ground: 'paper', fit: 'margins', calm: { maxShare: 0.7 },
    describe: 'A large headline in the middle of a plain page with a sub line under it and the logo at the top left. A plain start for a statement of up to about 70 characters.',
    fields: { headline: { required: true, max: 70 }, sub: { max: 125 } },
    elements: [column([headline([[18, 150], [30, 132], [48, 114], [70, 100]], 4, 640), sub()])],
  },
  figure: {
    kind: 'figure', name: 'Plain figure', ground: 'paper', fit: 'margins', calm: { maxShare: 0.7 },
    describe: 'One large figure with what it counts under it and a sub line, in the middle of a plain page under the logo. A plain start for a single number of up to 8 characters.',
    fields: { big: { required: true, max: 8 }, unit: { max: 24 }, sub: { max: 125 } },
    elements: [column([
      { type: 'fitted-stack', field: 'big', mode: 'lines', cap: 400, floor: 140, maxLines: 1, trail: true, lead: 0.95, w: W, h: 400 },
      { type: 'text', field: 'unit', style: 'display', size: 64, emphasis: 'none', ink: 'accent-type', w: W, when: { present: 'unit' } },
      sub(),
    ], { gap: 24 })],
  },
  list: {
    kind: 'list', name: 'Plain list', ground: 'paper', fit: 'margins', calm: { maxShare: 0.7 },
    describe: 'A headline at the top and the items as numbered rows on hairlines under it, under the logo. A plain start for two to five short points.',
    fields: { headline: { required: true, max: 44 }, items: { required: true, min: 2, max: 5 } },
    elements: [column([
      headline([[20, 112], [32, 98], [44, 86]], 3, 300),
      { type: 'rows', each: 'items', number: '1', numberStyle: 'display', numberSize: 40, textStyle: 'item', textSize: 40, rule: 'hair', gap: 40, pad: [0, 0, 0, 0], rowMinH: 120, ink: 'ink' },
    ], { justify: 'start', gap: 56 })],
  },
  quote: {
    kind: 'quote', name: 'Plain quote', ground: 'paper', fit: 'margins', calm: { maxShare: 0.7 },
    describe: 'The quotation large and centred in the middle of a plain page, with who said it under it, under the logo. A plain start for a quotation of up to about 160 characters.',
    fields: { quote: { required: true, max: 160 }, by: { max: 40 } },
    elements: [column([
      { type: 'text', field: 'quote', style: 'display', emphasis: 'none', align: 'center', ladder: { by: 'quote', steps: [[40, 100], [80, 86], [120, 76], [160, 68]], maxLines: 8, maxH: 640 }, w: W },
      { type: 'text', field: 'by', style: 'label', ink: 'body', align: 'center', when: { present: 'by' } },
    ], { gap: 36, align: 'center' })],
  },
  photo: {
    kind: 'photo', name: 'Plain photo', ground: 'paper', fit: 'margins',
    describe: 'A headline and a sub line at the top under the logo and the picture filling the lower half of the page. A plain start for a photograph with a headline of up to 60 characters.',
    fields: { image: { required: true }, headline: { required: true, max: 60 }, sub: { max: 110 } },
    elements: [
      { type: 'photo', place: { px: { x: 0, y: 740, w: 1080, h: 610 } }, shape: 'rect', z: 0 },
      column([headline([[28, 112], [44, 100], [60, 92]], 3, 330), sub()], { h: 520, justify: 'start', gap: 28 }),
    ],
  },
  event: {
    kind: 'event', name: 'Plain event', ground: 'paper', fit: 'margins', calm: { maxShare: 0.7 },
    describe: 'A headline with the date, time and place on a line under it and a sub line, in the middle of a plain page under the logo. A plain start for an event of up to about 56 characters of headline.',
    fields: { headline: { required: true, max: 56 }, meta: { required: true, max: 40 }, sub: { max: 100 } },
    elements: [column([
      headline([[26, 116], [42, 102], [56, 92]], 3, 360),
      { type: 'text', field: 'meta', style: 'label', ink: 'ink', w: W },
      sub(),
    ])],
  },
  offer: {
    kind: 'offer', name: 'Plain offer', ground: 'paper', fit: 'margins', calm: { maxShare: 0.7 },
    describe: 'A headline with the price or tag on a pill under it and a sub line, in the middle of a plain page under the logo. A plain start for an offer with a price or a short tag.',
    fields: { headline: { required: true, max: 56 }, tag: { required: true, max: 16 }, sub: { max: 100 } },
    elements: [column([
      headline([[20, 112], [34, 100], [56, 90]], 3, 330),
      { type: 'sticker', shape: 'pill', w: 'hug', minW: 200, maxW: 600, h: 120, fit: { cap: 72, floor: 40, maxLines: 1, h: 80 }, field: 'tag', fill: 'field', ink: 'on-field', pad: [0, 36, 0, 36] },
      sub(),
    ])],
  },
});

const SETTINGS = Object.freeze({
  schema: 1,
  description: 'A plain start: the brand\'s own fonts and colours, the logo at the top left and one simple design for every kind of post, to build up from.',
  origin: 'starter',
  canvas: { feed: { margin: { top: 72, right: 72, bottom: 72, left: 72 }, grid: { cols: 6, gutter: 24, rows: 0, head: 0 }, extraLines: [] } },
  fonts: { display: { source: 'brand', role: 'display' }, text: { source: 'brand', role: 'sans' }, label: { source: 'brand', role: 'sans' }, mono: { source: 'brand', role: 'mono' } },
  type: {
    display: { lead: 1.04, track: -0.02, weight: 700, case: 'as-typed', ladder: [1, 0.9, 0.82], trim: 'none', optical: false },
    body: { size: 32, lead: 1.4, weight: 400, strength: 1 },
    item: { size: 40, lead: 1.2, weight: 500 },
    label: { size: 30, track: 0.01, weight: 600, upper: false, role: 'label' },
    numeral: { track: -0.04, figures: 'lining' },
  },
  colour: { logic: 'tonal', field: 'primary', sticker: 'primary', accentAsType: 'field', grounds: ['paper', 'dark'] },
  devices: {
    rule: { hair: 1, heavy: 4 }, frame: { t: 0, pad: 0 }, highlight: { pad: [0, 0, 0, 0], tilt: 0 }, shadow: { x: 0, y: 0, colour: 'ink' },
    angles: { sticker: 0, bar: 0, block: 0, band: 0, card: 0, price: 0 }, folio: 'no', wordmark: { opacity: 0.03, sep: 'dot' },
  },
  photo: { treat: [], tint: 'primary' },
  logo: { default: 'top-left', height: 44 },
  dials: { tilt: 0, density: 0, weightShift: 0 },
});

export const STARTER_KINDS = Object.freeze(KINDS.filter((k) => Object.hasOwn(COMPOSITIONS, k)));

// A fresh copy of the starter look with the id and name given (a brand's own look: the app stores it as a draft).
export function starterLook({ id = 'blank', name = 'Blank' } = {}) {
  return { ...clone(SETTINGS), id, name, compositions: STARTER_KINDS.map((k) => clone(COMPOSITIONS[k])) };
}

// A fresh copy of the starter's plain composition of `kind`, or null for a kind it does not know.
export function starterComposition(kind) {
  return typeof kind === 'string' && Object.hasOwn(COMPOSITIONS, kind) ? clone(COMPOSITIONS[kind]) : null;
}
