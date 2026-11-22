// Primitive: the page cut across by a slanted edge: a picture above, a colour below with a thin edge; the words flow in the colour and an
// optional sticker straddles the edge (kit box with a slant). Its height is measured: the field is as tall as its words need.
import { GROUNDS, int, role, en } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Slanted split', group: 'Pictures', help: 'The page cut across by a slanted edge: a picture or colour above, a colour below, with a thin edge. The words flow in the colour below; an optional sticker sits on the edge.',
  placement: 'none', flow: false, container: 'any', text: true, sticker: true,
  own: {
    leftY: int(0, 1350, 'Left height', 'Where the edge meets the left of the page, in pixels from the top.'), rightY: int(0, 1350, 'Right height', 'Where it meets the right of the page.'),
    edge: int(0, 32, 'Edge', 'Thickness of the thin edge in pixels.', 0), upper: en(['photo', 'field'], 'Above', 'The picture or the colour field.', 'photo'), lower: role('Below', 'The colour below the edge.'),
    edgeFill: role('Edge colour', 'The colour of the thin edge.', 'paper'), gap: int(0, 300, 'Space above the words', 'Pixels from the edge\'s lowest point to the words.', 0),
  },
  common: ['z', 'when', 'ink'],
  required: ['leftY', 'rightY', 'lower'],
};
export function render(c, p, env) {
  const rise = p.leftY - p.rightY, left = c.margin.left, bottom = c.margin.bottom, W = c.W - left - c.margin.right;
  const words = env.kids({ w: W, ink: env.ink, flexDir: 'column' });
  const field = c.box({ flow: true, w: c.W, fill: p.lower, slant: Math.abs(rise), flex: 'column', justify: 'end', minH: c.H - Math.min(p.leftY, p.rightY), pad: [Math.abs(rise) + p.gap, left, bottom, left] }, words);
  const sticker = env.sticker ? env.sticker({ relativeTo: 'seam' }) : '';
  const photo = p.upper === 'photo' && c.hasImage ? c.photo({ x: 0, y: 0, w: c.W, h: c.H, treat: env.look.photo.treat ?? [], tint: env.look.photo.tint }) : '';
  return photo + c.box({ x: 0, bottom: 0, w: c.W, z: env.z }, c.box({ flow: true, w: c.W, fill: p.edgeFill, slant: Math.abs(rise), pad: [p.edge, 0, 0, 0] }, field) + sticker);
}
