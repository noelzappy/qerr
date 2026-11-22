// Primitive: a figure or a date set as large as its width allows, with its unit (kit numeral, fitNumeral).
import { BASELINES, FORMATS, STYLES, UNIT_AT, en, int, obj, field } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Big figure', group: 'Text', help: 'A figure or a date set as large as the width allows, optionally with its unit beside or under it.',
  placement: 'required', flow: true, container: null, text: true, fitted: true,
  own: {
    field: field(['big', 'meta'], 'Field', 'The figure, or the line a date is read from.', 'big'), format: en(FORMATS, 'Format', 'How a date or number is set.'),
    cap: int(100, 900, 'Largest', 'The largest size, in pixels.'), min: int(60, 400, 'Smallest', 'Below this the image is refused, in pixels.'),
    sizes: { kind: 'list', of: int(24, 900, 'Size', 'Pixels.'), max: 8, min: 1, label: 'Sizes', help: 'From the largest down; the largest at which the figure and its unit fit is used (instead of the largest and smallest).' },
    family: en(['display', 'mono'], 'Font', 'Which of the look\'s fonts the figure is set in.', 'display'),
    weight: int(100, 900, 'Weight', 'A weight of the font; leave out for the look\'s headline weight.'),
    baselineAt: en(BASELINES, 'Baseline on', 'Where its baseline sits: the page edge, the bottom margin or the bottom of its box.'),
    unit: obj({ field: field(['unit', 'label'], 'Field', 'The words under or beside the figure.'), style: en(STYLES, 'Style', 'Its type style.', 'label'), at: en(UNIT_AT, 'Where', 'Top right of the figure, under it, or on a bar.', 'under') }, 'Unit', 'Words with the figure.', ['field']),
  },
  common: ['place', 'bleed', 'rot', 'origin', 'z', 'when', 'ink', 'w', 'before', 'textShadow'],
  required: [],
};

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
// With sizes the figure is fitNumeral's (swiss: flush left on the grid, baseline below the page edge, unit on the first column line clear of it);
// with cap and min it is the kit's c.numeral (retail: the baseline on a line, fitted down in steps of 4 px).
export function render(c, p, env) {
  const raw = c.fmt(p.field);
  const shadow = env.textShadow;
  const unit = p.unit && c.has(p.unit.field) ? c.text(p.unit.field) : undefined;
  const html = p.format ? env.formatted(p.field, p.format) : p.field === 'meta' ? undefined : raw;
  if (!html || !String(html)) return '';
  if (p.sizes) {
    const G = c.gridLines(), x0 = env.box.x ?? c.margin.left, right = env.box.w !== undefined ? x0 + env.box.w : c.W - c.margin.right;
    return c.fitNumeral(clean({
      html, unit, x0, right, edge: p.baselineAt === 'margin' ? c.H - c.margin.bottom : p.baselineAt === 'box' && env.box.h !== undefined ? (env.box.y ?? 0) + env.box.h : c.H, sizes: p.sizes, track: env.look.type.numeral.track, family: p.family, weight: p.weight, colour: env.ink, cols: G.lefts, asc: env.metrics.asc, desc: env.metrics.desc, capEm: env.metrics.cap,
      unitSize: c.tokens.type.body.size, bleed: p.baselineAt === 'page' ? 0.08 : 0,
    }));
  }
  const base = p.baselineAt === 'margin' ? c.H - c.margin.bottom : p.baselineAt === 'box' && env.box.h !== undefined ? (env.box.y ?? 0) + env.box.h : c.H;
  return c.numeral(clean({ html, unit, size: p.cap, min: p.min, right: env.box.w !== undefined ? (env.box.x ?? 0) + env.box.w : c.W - c.margin.right, x: env.box.x ?? c.margin.left, base, colour: env.ink, track: env.look.type.numeral.track, family: p.family, weight: p.weight, textShadow: shadow }));
}
