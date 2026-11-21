// The editorial templates with a photo or figures, and the plain text page, as layouts (a "page": "editorial" each; see
// lib/design/layout-editorial.mjs for how the blocks are drawn and design/templates/*.mjs for the functions they replace). One
// entry per template: a list of { when?, layout }, the first whose condition holds drawing the page; a spec that matches none is
// drawn by the template function (not converted yet).
//
// Converted: text without an artefact. Still drawn by their functions: cover, stats, photo-story (phase 2). A text page with an
// artefact belongs to the artefact group (builtin/artefacts.mjs).

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

export const LAYOUTS = {
  text: [{ when: { absent: 'artefact' }, layout: TEXT }],
};
