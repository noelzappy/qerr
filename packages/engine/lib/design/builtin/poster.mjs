// The poster templates as layouts (a "page": "poster" each; see lib/design/layout-poster.mjs for how the blocks are drawn and
// design/templates/poster.mjs for the functions they replace). One entry per template: a list of { when?, layout }, the first
// whose condition holds drawing the page; a spec that matches none is drawn by the template function (not converted yet).
//
// Converted: number. Still drawn by their functions: object, product, myth-fact, closing (phase 2, testlib/CONVERTING.md).

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
  canvas: { feed: { columns: 12, rows: 15, margin: 80, gutter: 40 } },
  blocks: [
    { type: 'photo', px: { x: 0, y: 616, w: 1080, h: 734 }, photoTop: true },
    { type: 'bar' },
    { type: 'figure', field: 'big', size: 168, px: { x: 80, y: 140, w: 920, h: 180 } },
    { type: 'sub', field: 'line', px: { x: 80, y: 336, w: 900, h: 92 } },
    { type: 'stats', size: 64, px: { x: 80, y: 448, w: 920, h: 150 } },
  ],
};

export const LAYOUTS = {
  number: [{ layout: NUMBER }],
};
