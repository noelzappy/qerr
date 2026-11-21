// The poster templates as layouts (a "page": "poster" each; see lib/design/layout-poster.mjs for how the blocks are drawn and
// design/templates/poster.mjs for the functions they replace). One entry per template: a list of { when?, layout }, the first
// whose condition holds drawing the page; a spec that matches none is drawn by the template function (not converted yet).
//
// Converted: number, object, product (centre and side), myth-fact, closing. Their functions in design/templates/poster.mjs are
// unused and go when every template is converted.

const CANVAS = { feed: { columns: 12, rows: 15, margin: 80, gutter: 40 } };
// The headline sizes an object or product design may give (spec.mjs POSTER_SIZES).
const SIZES = [76, 88, 104, 120];
// A headline drawn at the spec's size: one block for each other size it may give, and one at the default size `def` (when it gives
// that size or none), each under its own condition on "size", so exactly one of them is drawn.
const sized = (base, def) => [
  ...SIZES.filter((n) => n !== def).map((n) => ({ ...base, when: { field: 'size', is: n }, size: n })),
  { ...base, when: { field: 'size', not: SIZES.filter((n) => n !== def) }, size: def },
];

// number: one big figure (168 px), a line under it and up to three supporting figures, and optionally a photo from y 616 (or the
// spec's photoTop) that bleeds off the bottom. With a photo the page starts from the series' ground (else cool) and a plain
// photo background becomes the page; without one the ground is cool.
const NUMBER = {
  id: 'number',
  name: 'Big number',
  description: 'One big figure, a line under it and up to three supporting figures, over an optional photo that bleeds off the bottom.',
  page: 'poster',
  ground: [{ when: { present: 'image' }, ground: 'photo' }, { ground: 'cool' }],
  fields: { big: { required: true, max: 40 }, line: { max: 80 }, stats: { min: 0, max: 3 }, image: {} },
  canvas: CANVAS,
  blocks: [
    { type: 'photo', px: { x: 0, y: 616, w: 1080, h: 734 }, photoTop: true },
    { type: 'bar' },
    { type: 'figure', field: 'big', size: 168, px: { x: 80, y: 140, w: 920, h: 180 } },
    { type: 'sub', field: 'line', px: { x: 80, y: 336, w: 900, h: 92 } },
    { type: 'stats', size: 64, px: { x: 80, y: 448, w: 920, h: 150 } },
  ],
};

// object: a headline (104 px, or the spec's size) with its sub line flowing under it, left or centred as the spec's align says,
// over one styled object photo from y 600 (or the spec's photoTop) that bleeds off the bottom. The page starts from the series'
// ground (else cool) unless the spec names one, and a plain photo background becomes the page.
const OBJECT_HEAD = { type: 'headline', specAlign: true, subField: 'sub', px: { x: 80, y: 170, w: 920, h: 430 } };
const OBJECT = {
  id: 'object',
  name: 'Object',
  description: 'A headline and its sub line over one styled object photo that bleeds off the bottom.',
  page: 'poster',
  ground: 'photo',
  fields: { headline: { required: true, max: 220 }, sub: { max: 220 }, image: { required: true } },
  canvas: CANVAS,
  blocks: [
    { type: 'photo', px: { x: 0, y: 600, w: 1080, h: 750 }, photoTop: true },
    { type: 'bar' },
    ...sized(OBJECT_HEAD, 104),
  ],
};

// product, centred (the default): a pre-framed phone, 600 px wide and centred, from y 620 (660 with a sub line, or the spec's
// phoneTop) running off the bottom, on the cool ground (or the spec's; never the series') with the phone's soft glow (off with
// glow: false). The headline is 104 px, 88 with a sub line (or the spec's size), centred unless the spec's align is left.
const PRODUCT_HEAD = { type: 'headline', align: 'center', specAlign: true, subField: 'sub', px: { x: 80, y: 170, w: 920, h: 430 } };
const PRODUCT_PHONE = { type: 'screen', phoneTop: true };
const PRODUCT = {
  id: 'product',
  name: 'Product',
  description: 'A large pre-framed phone with its soft glow, centred under the headline and running off the bottom.',
  page: 'poster',
  ground: 'cool',
  fields: { headline: { required: true, max: 220 }, sub: { max: 220 }, image: { required: true } },
  canvas: CANVAS,
  blocks: [
    { type: 'decoration', kind: 'glow', when: { field: 'glow', is: true }, px: { x: 240, y: 620, w: 600, h: 730 } },
    { type: 'bar' },
    ...SIZES.map((n) => ({ ...PRODUCT_HEAD, when: { field: 'size', is: n }, size: n })),
    { ...PRODUCT_HEAD, when: { present: 'sub', field: 'size', not: SIZES }, size: 88 },
    { ...PRODUCT_HEAD, when: { absent: 'sub', field: 'size', not: SIZES }, size: 104 },
    { ...PRODUCT_PHONE, when: { present: 'sub' }, px: { x: 240, y: 660, w: 600, h: 690 } },
    { ...PRODUCT_PHONE, when: { absent: 'sub' }, px: { x: 240, y: 620, w: 600, h: 730 } },
  ],
};

// product, side: the phone 450 px wide at the right (60 px from the edge) from y 300 (or the spec's phoneTop), the headline
// (76 px, or the spec's size; always left) and its sub line beside it from y 300.
const PRODUCT_SIDE = {
  id: 'product-side',
  name: 'Product beside',
  description: 'A pre-framed phone with its soft glow at the right, the headline and its sub line beside it.',
  page: 'poster',
  ground: 'cool',
  fields: { headline: { required: true, max: 220 }, sub: { max: 220 }, image: { required: true } },
  canvas: CANVAS,
  blocks: [
    { type: 'decoration', kind: 'glow', when: { field: 'glow', is: true }, px: { x: 570, y: 300, w: 450, h: 1050 } },
    { type: 'bar' },
    ...sized({ type: 'headline', subField: 'sub', subWidth: 440, px: { x: 80, y: 300, w: 470, h: 900 } }, 76),
    { ...PRODUCT_PHONE, px: { x: 570, y: 300, w: 450, h: 1050 } },
  ],
};

// myth-fact: the myth on a solid slab and the fact (its headline and the optional explanation) on a pale one, centred between the
// top bar and the series mark, on the dark ground with the posters' texture.
const MYTH_FACT = {
  id: 'myth-fact',
  name: 'Myth and fact',
  description: 'The myth and the fact as colour-blocked slabs on a dark ground, with the series mark.',
  page: 'poster',
  ground: 'dark',
  fields: { myth: { required: true, max: 220 }, factLead: { required: true, max: 220 }, fact: { max: 220 } },
  canvas: CANVAS,
  blocks: [
    { type: 'bar' },
    {
      type: 'slabs',
      px: { x: 80, y: 150, w: 920, h: 1050 },
      children: [{ type: 'headline', field: 'myth', size: 68 }, { type: 'headline', field: 'factLead', size: 68 }, { type: 'sub', field: 'fact' }],
    },
    { type: 'mark' },
  ],
};

// closing: the deep ground, the bar without its label, the headline (136 px; the brand's tagline when the spec has none) and its
// line under it (the brand's website when the spec has none) from y 560; with the brand's dot map at the top right, from y 700.
const CLOSING_HEAD = { type: 'headline', size: 136, fallback: 'tagline', subField: 'line', subFallback: 'website' };
const CLOSING = {
  id: 'closing',
  name: 'Closing',
  description: 'The tagline set large on a deep ground, the website under it, optionally with the brand\'s dot map.',
  page: 'poster',
  ground: 'deep',
  fields: { headline: { max: 220 }, line: { max: 60 } },
  canvas: CANVAS,
  blocks: [
    { type: 'decoration', kind: 'map', when: { field: 'map', is: true }, px: { x: 640, y: 150, w: 360, h: 450 } },
    { type: 'bar', label: 'none' },
    { ...CLOSING_HEAD, when: { field: 'map', is: true }, px: { x: 80, y: 700, w: 920, h: 600 } },
    { ...CLOSING_HEAD, when: { field: 'map', is: false }, px: { x: 80, y: 560, w: 920, h: 740 } },
  ],
};

export const LAYOUTS = {
  object: [{ layout: OBJECT }],
  number: [{ layout: NUMBER }],
  product: [{ when: { field: 'layout', is: 'side' }, layout: PRODUCT_SIDE }, { layout: PRODUCT }],
  'myth-fact': [{ layout: MYTH_FACT }],
  closing: [{ layout: CLOSING }],
};
