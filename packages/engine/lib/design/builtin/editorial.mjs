// The editorial templates with a photo or figures, and the plain text page, as layouts (a "page": "editorial" each; see
// lib/design/layout-editorial.mjs for how the blocks are drawn and design/templates/*.mjs for the functions they replace). One
// entry per template: a list of { when?, layout }, the first whose condition holds drawing the page; a spec that matches none is
// drawn by the template function (not converted yet).
//
// Converted: text without an artefact, cover, stats, photo-story (panel and print). Their functions stay in design/templates/,
// unused, until every template is converted. A text page with an artefact belongs to the artefact group (builtin/artefacts.mjs).
// A photo-story whose layout is neither panel, print nor unset (validateDesign refuses it) matches no variant and goes to the
// function.

// text: the typographic pause page. A big headline (112 px, or the spec's size: 70, 84 or 112) from y 154, the tint panel from
// y 990 with the sub line on it at y 1036, the running head and the footer on the panel.
const TEXT = {
  id: 'text',
  name: 'Text',
  description: 'A big headline, and the sub line on the tint panel at the foot of the page.',
  page: 'editorial',
  ground: 'series',
  fields: { headline: { required: true, max: 220 }, sub: { max: 220 } },
  canvas: { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } },
  blocks: [
    { type: 'decoration', kind: 'panel', px: { x: 0, y: 990, w: 1080, h: 360 } },
    { type: 'runhead' },
    { type: 'headline', size: 112, specSize: true, px: { x: 70, y: 154, w: 940, h: 800 } },
    { type: 'sub', px: { x: 70, y: 1036, w: 620, h: 220 } },
    { type: 'footer' },
  ],
};

// cover: the photo-led opening page of a carousel. The running head without its rule, the photo as a card (the card radius and a
// 1 px line) inside the margins from y 126, 714 px tall, the headline (84 px) 56 px under it with the sub line flowing under that
// (900 px wide), and the footer ("Swipe →" on page 1 of a carousel).
const COVER = {
  id: 'cover',
  name: 'Cover',
  description: 'A photo card at the top, the headline under it, then the sub line.',
  page: 'editorial',
  ground: 'series',
  fields: { headline: { required: true, max: 220 }, sub: { max: 220 }, image: { required: true } },
  canvas: { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } },
  blocks: [
    { type: 'runhead', rule: false },
    { type: 'photo', frame: 'card', px: { x: 70, y: 126, w: 940, h: 714 } },
    { type: 'headline', size: 84, subField: 'sub', subWidth: 900, px: { x: 70, y: 896, w: 940, h: 300 } },
    { type: 'footer' },
  ],
};

// stats: one big figure (168 px) from y 140, the line under it at y 336 (700 px wide), a rule at y 420 when there are figures,
// and up to three supporting figures from y 448. With a photo the figures stand side by side as bold labels and the photo is a
// full-bleed band from y 616, 588 px tall; without one they stack as ruled rows 150 px apart (70 px numbers).
const STATS = {
  id: 'stats',
  name: 'Stats',
  description: 'One big figure, a line under it and up to three supporting figures, over an optional photo band.',
  page: 'editorial',
  ground: 'series',
  fields: { big: { required: true, max: 40 }, line: { max: 80 }, stats: { min: 0, max: 3 }, image: {} },
  canvas: { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } },
  blocks: [
    { type: 'runhead' },
    { type: 'figure', size: 168, px: { x: 70, y: 140, w: 960, h: 180 } },
    { type: 'sub', field: 'line', px: { x: 70, y: 336, w: 700, h: 80 } },
    { type: 'decoration', kind: 'rule', when: { present: 'stats' }, px: { x: 70, y: 419, w: 940, h: 2 } },
    { type: 'stats', direction: 'row', when: { present: 'image' }, px: { x: 70, y: 448, w: 940, h: 150 } },
    { type: 'photo', when: { present: 'image' }, px: { x: 0, y: 616, w: 1080, h: 588 } },
    { type: 'stats', direction: 'column', size: 70, rules: true, when: { absent: 'image' }, px: { x: 70, y: 448, w: 940, h: 450 } },
    { type: 'footer' },
  ],
};

// photo-story, panel (the default): a full-bleed photo across the top (756 px), the label row (the series' name and, on a
// carousel page, the folio) at y 784, the headline (84 px) at y 840 with its sub line flowing under it (940 px wide), and the
// footer. No running head.
const STORY_PANEL = {
  id: 'photo-story',
  name: 'Photo story',
  description: 'A full-bleed photo at the top, then a label, the headline and the sub line.',
  page: 'editorial',
  ground: 'series',
  fields: { headline: { required: true, max: 220 }, sub: { max: 220 }, image: { required: true } },
  canvas: { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } },
  blocks: [
    { type: 'photo', px: { x: 0, y: 0, w: 1080, h: 756 } },
    { type: 'labelrow', px: { x: 70, y: 784, w: 940, h: 40 } },
    { type: 'headline', size: 84, subField: 'sub', subWidth: 940, px: { x: 70, y: 840, w: 940, h: 400 } },
    { type: 'footer' },
  ],
};

// photo-story, print: the running head, the headline (70 px) at y 154 with its sub line flowing under it, the tint panel from
// y 470, the photo on it as a raised card (940 x 600 from y 516) and the footer on the panel.
const STORY_PRINT = {
  id: 'photo-story-print',
  name: 'Photo story (print)',
  description: 'The headline and sub line on top, the photo as a raised card on the tint panel.',
  page: 'editorial',
  ground: 'series',
  fields: { headline: { required: true, max: 220 }, sub: { max: 220 }, image: { required: true } },
  canvas: { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } },
  blocks: [
    { type: 'runhead' },
    { type: 'headline', size: 70, subField: 'sub', px: { x: 70, y: 154, w: 940, h: 300 } },
    { type: 'decoration', kind: 'panel', px: { x: 0, y: 470, w: 1080, h: 880 } },
    { type: 'photo', frame: 'raised', px: { x: 70, y: 516, w: 940, h: 600 } },
    { type: 'footer' },
  ],
};

export const LAYOUTS = {
  text: [{ when: { absent: 'artefact' }, layout: TEXT }],
  cover: [{ layout: COVER }],
  stats: [{ layout: STATS }],
  'photo-story': [
    { when: { field: 'layout', is: 'print' }, layout: STORY_PRINT },
    { when: { field: 'layout', not: ['center', 'side', 'print'] }, layout: STORY_PANEL },
  ],
};
