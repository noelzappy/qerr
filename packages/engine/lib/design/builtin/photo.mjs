// The full-bleed photo post (every size) and the page covers as layouts (design/templates/photo.mjs, pagecover.mjs). One entry
// per template: a list of { when?, layout }, the first whose condition holds drawing the page; a spec that matches none is
// drawn by the template function.
//
// Converted: photo (every size; "page": "photo", drawn by lib/design/layout-photo.mjs) and pagecover (one layout per kind;
// "page": "cover", drawn by lib/design/layout-cover.mjs).

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

// The page covers: profile picture and cover images for the social pages, one layout per kind (the kind is the size), all on the
// white ground and all the brand's words. A cover's canvas names its own cover size; its grid goes unused.
const cover = (id, name, description, size, blocks) => ({ id, name, description, page: 'cover', fields: {}, canvas: { [size]: { columns: 1, rows: 1, margin: 0, gutter: 0 } }, blocks });
const COVERS = {
  // the brand's mark, 580 px high, in the middle of the square
  profile: cover('pagecover-profile', 'Profile picture', 'The brand\'s mark in the middle of the square.', 'profile', [
    { type: 'coverMark', px: { x: 250, y: 250, w: 580, h: 580 } },
  ]),
  // the logo, tagline, descriptor and website centred in a column over the full width
  facebook: cover('pagecover-facebook', 'Facebook cover', 'The logo, tagline, descriptor and website centred in a column.', 'facebook', [
    { type: 'coverWords', logo: 66, size: 104, subSize: 34, urlSize: 28, gap: 34, subGap: 24, urlGap: 20, px: { x: 0, y: 62, w: 1640, h: 500 } },
  ]),
  // in a row right of the profile picture's place: the logo, the tagline, and the descriptor over the website at the right end
  linkedin: cover('pagecover-linkedin', 'LinkedIn cover', 'The logo, tagline, and descriptor over the website, in a row.', 'linkedin', [
    { type: 'coverWords', arrange: 'row', logo: 48, size: 76, subSize: 30, urlSize: 24, gap: 56, urlGap: 10, subWidth: 420, px: { x: 560, y: 20, w: 1606, h: 270 } },
  ]),
  // a column set left, right of the profile picture's place
  x: cover('pagecover-x', 'X header', 'The logo, tagline, descriptor and website in a column, set left.', 'x', [
    { type: 'coverWords', align: 'left', logo: 48, size: 80, subSize: 29, urlSize: 24, gap: 24, subGap: 16, urlGap: 10, px: { x: 440, y: 105, w: 970, h: 290 } },
  ]),
};

export const LAYOUTS = {
  photo: [{ layout: PHOTO }],
  pagecover: Object.entries(COVERS).map(([kind, layout]) => ({ when: { field: 'kind', is: kind }, layout })),
};
