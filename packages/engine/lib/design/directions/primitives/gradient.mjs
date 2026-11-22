// Primitive: an area filled with a gradient of two or three brand colour roles (kit gradient). The colours are roles, the angle a whole number
// of degrees and the radial point one of nine names; the kit writes the CSS from fixed tables. Text on it is held to every one of its colours
// (look-static.mjs: the ink must read on each stop) and to the pixels it is drawn on (the render's contrast check).
import { gradientDesc } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Gradient', group: 'Shapes', help: 'An area filled with a blend of two or three of the brand\'s colours: linear along a direction or radial from a point.',
  placement: 'required', flow: false, container: null, text: false,
  own: { gradient: gradientDesc() },
  common: ['place', 'bleed', 'z', 'when', 'radius', 'corners', 'key'],
  required: ['gradient'],
};
export function render(c, p, env) {
  const b = env.box;
  return c.gradient({ x: b.x, y: b.y, w: b.w, h: b.h, right: b.right, bottom: b.bottom, gradient: p.gradient, radius: p.radius, corners: p.radius !== undefined && p.corners !== 'all' ? p.corners : undefined, z: env.z });
}
