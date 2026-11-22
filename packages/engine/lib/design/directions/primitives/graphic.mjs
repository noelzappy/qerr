// Primitive: one of the brand's graphics or cut-outs on the page (kit graphic). The look names the vault item by its id only; the app hands the
// renderer the file (post spec `graphics`), which is read, checked (PNG or WebP with transparency) and embedded as a data: URI before the page is
// built, so the page reaches it only through ctx.image(). Where it sits is a slot (nine places, inside the margins or on the page edge), how wide
// a named share of the page or pixels; its height follows its own proportions. A recolourable graphic may take a brand colour role.
import { GRAPHIC_SIZES, GRAPHIC_SLOTS, bool, en, int, oneOf, ref, role } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Brand graphic', group: 'Pictures', help: 'One of the brand\'s graphics or cut-outs (Pictures, Cut-outs and Graphics), at one of nine places, turned or mirrored, a recolourable graphic in a brand colour.',
  placement: 'none', flow: false, container: null, text: false,
  own: {
    ref: ref('Graphic', 'Which of the brand\'s graphics or cut-outs it shows.'),
    at: en(GRAPHIC_SLOTS, 'Where', 'One of nine places on the page.', 'bottom-right'),
    size: oneOf([{ is: 'string', desc: en(Object.keys(GRAPHIC_SIZES), 'Size', 'Small, medium, large or extra large: a share of the page width.') }, { is: 'number', desc: int(24, 1350, 'Width', 'Pixels.') }], 'Size', 'Small (s), medium (m), large (l), extra large (xl), or a width in pixels.', 'm'),
    edge: bool('On the page edge', 'Sits against the page edge instead of inside the margins (a cut-out standing on the foot of the page).', false),
    dx: int(-540, 540, 'Move across', 'Pixels from its place (negative: left).', 0),
    dy: int(-675, 675, 'Move down', 'Pixels from its place (negative: up).', 0),
    flip: bool('Mirror', 'Mirrors it left to right.', false),
    tint: role('Colour', 'Recolours a recolourable graphic in one of the brand\'s colours (a cut-out keeps its own colours).'),
  },
  common: ['rot', 'z', 'when'],
  required: ['ref'],
};
export const sizePx = (size, W) => (typeof size === 'number' ? size : Math.round((GRAPHIC_SIZES[size] ?? GRAPHIC_SIZES.m) * W));
export function render(c, p, env) {
  const g = c.graphicOf(p.ref);
  if (!g) { c.lookNotes.push('a brand graphic of this design is not available (removed, or not handed to the renderer), so it is left out'); return ''; }
  const edge = p.edge === true, m = c.margin;
  const area = edge ? { x0: 0, y0: 0, x1: c.W, y1: c.H } : { x0: m.left, y0: m.top, x1: c.W - m.right, y1: c.H - m.bottom };
  let w = sizePx(p.size ?? 'm', c.W);
  let h = g.w && g.h ? Math.round((w * g.h) / g.w) : w;
  // never taller than the page: a tall cut-out is set narrower
  if (h > c.H) { w = Math.round((w * c.H) / h); h = c.H; }
  const [col, row] = slotOf(p.at ?? 'bottom-right');
  const x = col === 0 ? area.x0 : col === 1 ? Math.round((area.x0 + area.x1 - w) / 2) : area.x1 - w;
  const y = row === 0 ? area.y0 : row === 1 ? Math.round((area.y0 + area.y1 - h) / 2) : area.y1 - h;
  if (p.tint !== undefined && !g.tintable) c.lookNotes.push('a brand graphic of this design is not marked as recolourable, so it keeps its own colours');
  return c.graphic({ ref: p.ref, x: x + (p.dx ?? 0), y: y + (p.dy ?? 0), w, h, rot: env.rot || undefined, flip: p.flip === true || undefined, tint: g.tintable ? p.tint : undefined, z: env.z });
}
// [column, row] of a slot: 0 left/top, 1 centre, 2 right/bottom
export function slotOf(at) {
  const i = GRAPHIC_SLOTS.indexOf(at);
  return i < 0 ? [2, 2] : [i % 3, Math.floor(i / 3)];
}
