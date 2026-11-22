// The editorial direction: quiet luxury, a magazine rather than an advert. Paper, ink, restraint. Everything a composition in
// this direction needs to know about the direction lives in this table; the compositions hold only what is particular to them.
const pad2 = (n) => String(n).padStart(2, '0');

export const TOKENS = Object.freeze({
  name: 'editorial',
  // margins (feed pixels) and a 6-column grid
  margin: Object.freeze({ left: 96, right: 96, top: 96, bottom: 110 }),
  grid: Object.freeze({ cols: 6, gutter: 24 }),
  // The families this direction sets type in, by role, and the faces of each it needs (the font manifest embeds only these).
  // A brand with its own display or label font (brand.json font.display / font.label with files) replaces that role.
  fonts: Object.freeze({
    display: { family: 'Fraunces', fallback: "Georgia,'Times New Roman',serif", faces: [{ style: 'normal', weights: [300, 400] }, { style: 'italic', weights: [300, 400] }] },
    text: { family: 'Source Serif 4', fallback: "Georgia,'Times New Roman',serif", faces: [{ style: 'normal', weights: [400, 600] }, { style: 'italic', weights: [400] }] },
    label: { family: 'Inter', fallback: "'Helvetica Neue',Arial,sans-serif", faces: [{ style: 'normal', weights: [500] }] },
    mono: { family: 'Inter', fallback: "'Helvetica Neue',Arial,sans-serif", faces: [] },
  }),
  // The type scale: three levels. display (headlines and numerals), body, label.
  type: Object.freeze({
    display: { min: 104, max: 148, lead: 0.98, track: -0.02, weight: 300 },
    body: { size: 34, lead: 46, weight: 400 },
    label: { size: 20, lead: 1.2, track: 0.14, weight: 500, upper: true, family: 'label' },
  }),
  // devices (the hairline's weight in px)
  device: Object.freeze({ rule: 2 }),
  grain: Object.freeze({ freq: 0.85, strength: 0.5 }),
  // "No. 07"
  folio: (n) => `No. ${pad2(n)}`,
  logoHeight: 40,
});
