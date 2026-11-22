// Primitive: the row of small labels across the top, from the look's own cells (label, brand name, folio) between two rules (kit rule, label, folioMark).
import { en } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Top label row', group: 'Layout', help: 'The row of small labels across the top, built from the look\'s own cells (label, brand name, folio) between two rules.', placement: 'none', flow: false, container: null, text: true,
  own: { tone: en(['ink', 'light'], 'Tone', 'Dark type, or light type for a row over a picture.', 'ink') },
  common: ['z', 'when'],
  required: [],
};

export function render(c, p, env) {
  const look = env.look, M = look.devices.metaRow, g = look.canvas.feed.grid, top = c.margin.top, ink = p.tone === 'light' ? 'white' : 'ink', mute = p.tone === 'light' ? 'muted-dark' : 'muted';
  const box = g.head - g.gutter, LH = 28, x0 = c.col(0), W = c.span(0, g.cols - 1), rowBottom = top + box;
  const y = top + M.ruleTop + (box - M.ruleTop - M.ruleBelow - LH) / 2;
  let h = M.ruleTop ? c.rule({ x: x0, y: top, w: W, weight: M.ruleTop, colour: ink }) : '';
  const cells = M.cells.map((cell) => ({ ...cell, a: cell.col - 1, b: cell.col + cell.span - 2 }));
  // the brand name's cell starts earlier when the name is too long for it (a mono line at 20 px with 0.06 em tracking is about 13.2 px a character)
  const need = c.brandChars * 13.3;
  for (const cell of cells) {
    if (cell.source === 'brand') while (cell.a > 0 && c.span(cell.a, cell.b) < need && cell.a > cell.col - 3) cell.a--;
  }
  for (const cell of cells) {
    const common = { x: c.col(cell.a), y, w: c.span(cell.a, cell.b), lead: LH / look.type.label.size, align: cell.align === 'left' ? undefined : cell.align };
    const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
    if (cell.source === 'label') { if (c.has('label')) h += c.label(clean({ ...common, role: 'label', html: c.text('label'), colour: ink })); }
    else if (cell.source === 'brand') h += c.label(clean({ ...common, role: 'meta', html: c.brand, colour: mute }));
    else h += c.folioMark(clean({ ...common, colour: mute }));
  }
  if (M.ruleBelow) h += c.rule({ x: x0, y: rowBottom - M.ruleBelow, w: W, weight: M.ruleBelow, colour: ink });
  return h;
}
