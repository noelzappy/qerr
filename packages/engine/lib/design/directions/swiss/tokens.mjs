// The swiss direction: modern, systematic, confident. An international-style poster: a grid you can feel, nothing decorative.
const pad2 = (n) => String(n).padStart(2, '0');

export const TOKENS = Object.freeze({
  name: 'swiss',
  margin: Object.freeze({ left: 64, right: 64, top: 64, bottom: 64 }),
  // 12 columns, 16 gutter; below the meta row (56 px of rules and mono, then 16 px of air) seven equal rows, 16 px apart
  grid: Object.freeze({ cols: 12, gutter: 16, rows: 8 }),
  fonts: Object.freeze({
    display: { family: 'Hanken Grotesk', fallback: "'Helvetica Neue',Arial,sans-serif", faces: [{ style: 'normal', weights: [700, 800] }] },
    text: { family: 'Hanken Grotesk', fallback: "'Helvetica Neue',Arial,sans-serif", faces: [{ style: 'normal', weights: [400, 500] }] },
    label: { family: 'JetBrains Mono', fallback: "'SF Mono',Menlo,monospace", faces: [{ style: 'normal', weights: [500] }] },
    mono: { family: 'JetBrains Mono', fallback: "'SF Mono',Menlo,monospace", faces: [{ style: 'normal', weights: [500] }] },
  }),
  // Font metrics in em (hhea ascent and descent, cap height), read once from the font files' own tables with Chrome's canvas text metrics.
  // They put the first cap line and the last baseline of a block exactly on the grid (kit capTrim), with no use of text-box-trim.
  metrics: Object.freeze({
    display: Object.freeze({ asc: 1, desc: 0.303, cap: 0.697 }),
    text: Object.freeze({ asc: 1, desc: 0.303, cap: 0.697 }),
  }),
  type: Object.freeze({
    display: { min: 112, max: 168, lead: 0.92, track: -0.035, weight: 800 },
    body: { size: 34, lead: 44, weight: 400 },
    label: { size: 20, lead: 1.4, track: 0.06, weight: 500, upper: true, family: 'label' },
  }),
  // The size ladder of the poster's headline (px, largest first). The last step is the floor: below it the render is refused, with the number of
  // characters that fit.
  ladders: Object.freeze({ poster: [232, 208, 184, 168, 152, 138] }),
  device: Object.freeze({ ruleTop: 4, ruleBelow: 1, metaBox: 56, metaHeight: 72 }),
  grain: Object.freeze({ freq: 0.9, strength: 0.4 }),
  // "07/12" (the post's place in its batch, when known)
  folio: (n, total) => (total ? `${pad2(n)}/${pad2(total)}` : pad2(n)),
  logoHeight: 40,
});
