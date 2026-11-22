// The retail direction: bold, loud, physical. A confident high-street campaign: heavy type, colour as a field, pictures breaking out.
export const TOKENS = Object.freeze({
  name: 'retail',
  // 56 on full-field pages. A page with the frame sets its own inner margin (frame 70 + padding 44 = 114).
  margin: Object.freeze({ left: 56, right: 56, top: 56, bottom: 56 }),
  grid: Object.freeze({ cols: 6, gutter: 24 }),
  // the inner edge of text on a framed page (frame 70 + padding 44) is a grid line too
  extraLines: Object.freeze([114]),
  frame: Object.freeze({ t: 70, pad: 44 }),
  fonts: Object.freeze({
    display: { family: 'Archivo', fallback: "'Arial Black','Helvetica Neue',Arial,sans-serif", faces: [{ style: 'normal', weights: [900], stretch: '80%' }] },
    text: { family: 'Archivo', fallback: "'Helvetica Neue',Arial,sans-serif", faces: [{ style: 'normal', weights: [400, 600] }] },
    label: { family: 'Archivo', fallback: "'Helvetica Neue',Arial,sans-serif", faces: [{ style: 'normal', weights: [600] }] },
    mono: { family: 'Archivo', fallback: "'Helvetica Neue',Arial,sans-serif", faces: [] },
  }),
  type: Object.freeze({
    display: { min: 120, max: 190, lead: 0.9, track: -0.025, weight: 900, width: 82 },
    body: { size: 36, lead: 44, weight: 600 },
    label: { size: 24, lead: 1.2, track: 0.1, weight: 800, upper: true, family: 'label' },
  }),
  // rotations in degrees (the prototype's: sticker -8, bar -1.5, price -3, block -2, band -4, seam -7, card 4)
  device: Object.freeze({ rot: { sticker: -8, bar: -1.5, price: -3, block: -2, band: -4, card: 4 }, seam: { left: 780, right: 648 }, step: [1, 0.9, 0.82] }),
  // The type treatments a composition may name (kit variant): a name maps to a class of retail.css, never a class written by a composition.
  variants: Object.freeze({ sticker: 'rt-sticker', date: 'rt-date', numeral: 'rt-numeral', unit: 'rt-unit', quote: 'rt-quote', item: 'rt-item', num: 'rt-num', meta: 'rt-meta', by: 'rt-by', mark: 'rt-mark' }),
  grain: Object.freeze({ freq: 0.9, strength: 0.4 }),
  folio: (n) => String(n).padStart(2, '0'),
  logoHeight: 44,
});
