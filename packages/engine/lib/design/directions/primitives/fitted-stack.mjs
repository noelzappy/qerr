// Primitive: a headline sized by the page to fill its box (kit fitLines, fitFill, fitBlock). The parameter table SPEC is the one the look
// validator and the editor read (look-elements.mjs); render(c, p, env) draws it from the kit. Pure table, no import of the kit.
import { EMPHASES, FIT_MODES, ALIGNS, VALIGNS, en, int, num, bool, list, field, swashDesc } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Fitted headline', group: 'Text', help: 'A headline sized by the page to fill its box: line by line (lines), edge to edge (fill) or all lines at the largest size that fits (block).',
  placement: 'required', flow: true, container: null, text: true, fitted: true,
  own: {
    field: field(['headline', 'quote', 'tag', 'big', 'unit'], 'Field', 'The headline, the quote, the tag (a price), the big figure or its unit.', 'headline'), mode: en(FIT_MODES, 'Mode', 'Each line as large as fits (lines), the ink filling the box (fill), or one size for all lines (block).'),
    cap: int(40, 1200, 'Largest', 'The largest a line may be, in pixels (lines and fill).'), floor: int(24, 300, 'Smallest', 'Below this the image is refused, in pixels (lines and fill).'),
    maxLines: int(1, 8, 'Most lines', 'The most lines it may take (up to 5 in lines mode, 6 in block mode, 8 in fill mode).', 5), gapEm: num(0, 0.6, 'Line gap', 'Space between lines in em (fill).', { def: 0.24 }),
    lead: num(0.78, 1.2, 'Line height', 'A multiple of the size; leave out for the look\'s headline line height (lines mode).'),
    valign: en(VALIGNS, 'Vertical', 'Where the lines sit in the box.', 'top'), emphasis: en(EMPHASES, 'Emphasis', 'How the *emphasised phrase* is set.', 'none'), emphasisOwnLine: bool('Emphasis on its own line', 'Sets the emphasised phrase on its own line.', false),
    trail: bool('Keep the end inside', 'Keeps the last letter\'s trailing space inside the width (for a figure set with tight letter spacing; lines mode).', false),
    stretch: int(50, 150, 'Width of the letters', 'Font width in percent for this text instead of the look\'s headline width (lines mode; the display font must have it).'),
    padBelowEm: num(0, 0.3, 'Space under each line', 'Extra room under every line in em, for a shadow or a descender (lines mode).'),
    sizes: list(int(24, 400, 'Size', 'Pixels.'), 8, 'Sizes', 'From the largest down; the largest that fits is used (block).', { min: 1 }), align: en(ALIGNS, 'Align', 'Left, centre or right.', 'left'),
    swash: swashDesc(),
  },
  common: ['place', 'bleed', 'z', 'when', 'ink', 'grow', 'minH', 'w', 'h', 'before', 'nudgeX', 'alignSelf', 'textShadow'],
  required: ['mode'],
};

export function render(c, p, env) {
  const { emphasis } = p, bar = ['bar', 'tilt-bar', 'own-line-bar'].includes(emphasis), role = p.field === 'tag' || p.field === 'big' || p.field === 'unit' ? 'stat' : 'headline';
  const html = p.field === 'big' || p.field === 'tag' || p.field === 'unit' ? c.text(p.field) : c.fmt(p.field);
  const base = { ...env.box, colour: env.ink, align: p.align === 'left' ? undefined : p.align, role, emph: emphasis === 'accent' || emphasis === 'italic' || emphasis === 'bold' ? emphasis : undefined };
  if (p.mode === 'lines') {
    const auto = env.box.flow && p.grow;
    return c.fitLines(clean({
      ...base, h: auto ? 'auto' : env.box.h ?? p.minH, w: env.box.w ?? env.innerW, cap: p.cap, floor: p.floor, max: p.maxLines, lead: p.lead ?? env.look.type.display.lead, track: p.field === 'big' ? env.tokens.type.numeral.track : env.tokens.type.display.track,
      valign: p.valign === 'top' ? undefined : p.valign, highlight: bar || undefined, html, grow: auto || undefined, nudge: env.nudge, grid: env.skipGrid ? 'skip' : undefined,
      trail: p.trail || undefined, stretch: p.stretch, padBelow: p.padBelowEm, textShadow: env.textShadow, swash: p.swash,
    }));
  }
  const trim = env.trim, lead = p.lead ?? env.look.type.display.lead;
  const room = env.box.h ?? env.innerH ?? Math.ceil(p.maxLines * (p.sizes?.[0] ?? p.cap) * lead);
  if (p.mode === 'fill') return c.fitFill(clean({ ...base, w: env.box.w ?? env.innerW, h: room, cap: p.cap, floor: p.floor, gapEm: p.gapEm, max: Math.min(p.maxLines, 8), trim, lead: p.lead, html, anchor: p.valign === 'bottom' ? 'bottom' : undefined, desc: env.metrics?.desc, grid: env.skipGrid ? 'skip' : undefined }));
  return c.fitBlock(clean({ ...base, w: env.box.w ?? env.innerW, h: room, sizes: p.sizes, max: Math.min(p.maxLines, 6), trim, lead: p.lead, html, anchor: p.valign === 'bottom' ? 'bottom' : undefined, desc: env.metrics?.desc, grid: env.skipGrid ? 'skip' : undefined, swash: p.swash }));
}
// A swash goes against a headline or a quote set line by line or as a block (fill mode stretches the ink, so it has no measured word to follow).
export function rules(el, bad) {
  if (el.swash === undefined) return;
  if (!['headline', 'quote'].includes(el.field ?? 'headline')) bad('is drawn against a word of the headline or the quote', 'swash');
  if (el.mode === 'fill') bad('is drawn on a headline set line by line or as a block, not in fill mode', 'swash');
}
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
