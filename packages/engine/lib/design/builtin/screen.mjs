// The screen template as layouts: a pre-framed phone (beside a passbook, faded, or with pills or a check list) or a desktop
// window (design/templates/screen.mjs). One entry per template: a list of { when?, layout }, the first whose condition holds
// drawing the page; a spec that matches none is drawn by the template function.
//
// Converted: screen, every variant (desktop, beside, fade, and the phone row). The function is kept, unused, until phase 2
// removes the template functions (testlib/CONVERTING.md).
//
// The pieces are the screen group's drawings on the editorial page (lib/design/layout-editorial.mjs): the `screen` block (a phone
// the width of its rectangle, from its top, cut at its foot with fit "crop"; a desktop window with the spec's framed, tilt and
// region with specWindow), `halo` (the glow behind the phone, sized from the picture), `beside` (the passbook card of the spec's
// "beside"), `footlogo` (the footer with the logo alone), and the headline's `lists` (the spec's pills and check list) and `row`
// (the headline and the phone side by side in one flex row, centred in the band their rectangles share).

const CANVAS = { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } };
const TEXT_FIELDS = { headline: { required: true, max: 220 }, sub: { max: 220 }, image: { required: true } };
const SUB = { present: 'sub' }, NOSUB = { absent: 'sub' };
// The headline (70 px) from y 154, with its sub line (900 px wide) when there is one. The panel starts where the reference
// spacing puts it under two lines of headline and up to three of sub line (editorial.mjs panelTopFor(70): 500, or 350 without
// a sub line).
const HEAD = [
  { type: 'headline', size: 70, subField: 'sub', subWidth: 900, px: { x: 70, y: 154, w: 940, h: 346 }, when: SUB },
  { type: 'headline', size: 70, px: { x: 70, y: 154, w: 940, h: 196 }, when: NOSUB },
];
const PANEL = [
  { type: 'decoration', kind: 'panel', px: { x: 0, y: 500, w: 1080, h: 850 }, when: SUB },
  { type: 'decoration', kind: 'panel', px: { x: 0, y: 350, w: 1080, h: 1000 }, when: NOSUB },
];

// desktop: the headline and sub line, the tint panel, and the window on it 48 px under the panel's top, 940 px wide (the
// website's window chrome, or the capture as it is with framed; tilt and region as the spec says; the spec's title in its bar).
const DESKTOP = {
  id: 'screen-desktop',
  name: 'Screen on a desktop',
  description: 'A desktop screenshot in the website\'s window chrome on the tint panel, under the headline and sub line.',
  page: 'editorial',
  ground: 'series',
  fields: { ...TEXT_FIELDS, title: { max: 40 } },
  canvas: CANVAS,
  blocks: [
    { type: 'runhead' },
    ...HEAD,
    ...PANEL,
    { type: 'screen', device: 'desktop', specWindow: true, titleField: 'title', px: { x: 70, y: 548, w: 940, h: 692 }, when: SUB },
    { type: 'screen', device: 'desktop', specWindow: true, titleField: 'title', px: { x: 70, y: 398, w: 940, h: 842 }, when: NOSUB },
    { type: 'footlogo' },
  ],
};

// beside: the headline and sub line, the tint panel, and on it, 50 px under its top, the passbook card (380 x 500) at the left
// and the phone (430 px wide) at the right margin, running off the bottom of the page. No glow.
const BESIDE = {
  id: 'screen-beside',
  name: 'Phone beside a passbook',
  description: 'A pre-framed phone running off the foot of the page, beside a passbook card on the tint panel.',
  page: 'editorial',
  ground: 'series',
  fields: TEXT_FIELDS,
  canvas: CANVAS,
  blocks: [
    { type: 'runhead' },
    ...HEAD,
    ...PANEL,
    { type: 'beside', px: { x: 70, y: 550, w: 380, h: 500 }, when: SUB },
    { type: 'beside', px: { x: 70, y: 400, w: 380, h: 500 }, when: NOSUB },
    { type: 'screen', px: { x: 580, y: 550, w: 430, h: 800 }, when: SUB },
    { type: 'screen', px: { x: 580, y: 400, w: 430, h: 950 }, when: NOSUB },
    { type: 'footlogo' },
  ],
};

// fade: the text across the top (headline, sub line, pills and check list), the phone (620 px wide) centred under it from y 600,
// cut and faded out at y 1236, above the footer (the website's product wells), on its glow unless the spec says glow: false.
const FADE = {
  id: 'screen-fade',
  name: 'Phone, faded out',
  description: 'The text across the top and a large pre-framed phone under it, cut and faded out above the footer.',
  page: 'editorial',
  ground: 'series',
  fields: TEXT_FIELDS,
  canvas: CANVAS,
  blocks: [
    { type: 'halo', when: { field: 'glow', is: true } },
    { type: 'runhead' },
    { type: 'headline', size: 70, subField: 'sub', subWidth: 900, lists: true, px: { x: 70, y: 154, w: 940, h: 446 } },
    { type: 'screen', fit: 'crop', px: { x: 230, y: 600, w: 620, h: 636 } },
    { type: 'footlogo' },
  ],
};

// The phone row (the default): the text (430 px: headline, sub line, pills and check list) and the whole phone (470 px wide) side
// by side, 40 px apart, both centred in the band between the running head and the footer (y 126 to 1240), the phone on its glow
// unless the spec says glow: false.
const ROW = {
  id: 'screen',
  name: 'Phone beside the text',
  description: 'The text on the left and a whole pre-framed phone on the right, both centred on the page.',
  page: 'editorial',
  ground: 'series',
  fields: TEXT_FIELDS,
  canvas: CANVAS,
  blocks: [
    { type: 'halo', when: { field: 'glow', is: true } },
    { type: 'runhead' },
    { type: 'headline', size: 70, subField: 'sub', subWidth: 430, lists: true, row: true, px: { x: 70, y: 126, w: 430, h: 1114 } },
    { type: 'screen', px: { x: 540, y: 126, w: 470, h: 1114 } },
    { type: 'footlogo' },
  ],
};

export const LAYOUTS = {
  screen: [
    { when: { field: 'device', is: 'desktop' }, layout: DESKTOP },
    { when: { field: 'beside', is: true }, layout: BESIDE },
    { when: { field: 'fade', is: true }, layout: FADE },
    { layout: ROW },
  ],
};
