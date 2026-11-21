// The full-bleed photo post (every size) and the page covers as layouts (design/templates/photo.mjs, pagecover.mjs). One entry
// per template: a list of { when?, layout }, the first whose condition holds drawing the page; a spec that matches none is
// drawn by the template function.
//
// Converted: photo (every size; "page": "photo", drawn by lib/design/layout-photo.mjs). Still drawn by its function: pagecover.

// The headline box per size: from the size's top margin (a few px lower on feed, 20 px lower on a story) down to the top of the
// footer's free space (sizes.mjs contentBottom), as wide as the template's text measure, from the size's own left margin
// (brand.css .ptext). The text is anchored at its top, or with textAt bottom at its bottom edge.
const TEXT_BOX = {
  feed: { x: 70, y: 84, w: 880, h: 1115 },
  wide: { x: 56, y: 52, w: 640, h: 502 },
  story: { x: 72, y: 290, w: 900, h: 1182 },
  square: { x: 72, y: 72, w: 830, h: 857 },
};

// photo: the photograph full bleed, the scrim and fade, the thin lines, the eyebrow, headline and sub line at the top or the
// bottom (textAt, per size resolved), and the footer.
const PHOTO = {
  id: 'photo',
  name: 'Photo',
  description: 'A full-bleed photograph, with the eyebrow, headline and sub line at its top or bottom, and the logo in its pill.',
  page: 'photo',
  fields: { headline: { required: true, max: 220 }, sub: { max: 220 }, image: { required: true } },
  canvas: {
    feed: { columns: 12, rows: 15, margin: { top: 80, right: 70, bottom: 56, left: 70 }, gutter: 20 },
    wide: { columns: 12, rows: 8, margin: { top: 52, right: 56, bottom: 40, left: 56 }, gutter: 20 },
    story: { columns: 12, rows: 15, margin: { top: 270, right: 72, bottom: 350, left: 72 }, gutter: 20 },
    square: { columns: 12, rows: 12, margin: { top: 72, right: 72, bottom: 56, left: 72 }, gutter: 20 },
  },
  blocks: [
    { type: 'backdrop', px: { feed: { x: 0, y: 0, w: 1080, h: 1350 }, wide: { x: 0, y: 0, w: 1200, h: 675 }, story: { x: 0, y: 0, w: 1080, h: 1920 }, square: { x: 0, y: 0, w: 1080, h: 1080 } } },
    { type: 'scrim' },
    { type: 'lines' },
    { type: 'headline', when: { field: 'textAt', is: 'top' }, eyebrow: true, subField: 'sub', px: TEXT_BOX },
    { type: 'headline', when: { field: 'textAt', not: 'top' }, valign: 'bottom', eyebrow: true, subField: 'sub', px: TEXT_BOX },
    { type: 'photoFooter' },
  ],
};

export const LAYOUTS = {
  photo: [{ layout: PHOTO }],
};
