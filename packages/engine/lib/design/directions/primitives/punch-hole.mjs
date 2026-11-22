// Primitive: a round hole, as in a hang tag (a ring-edged round box).
import { int } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Punched hole', group: 'Shapes', help: 'A round hole, as in a hang tag.', placement: 'required', flow: false, container: null, text: false,
  own: { size: int(20, 120, 'Size', 'Pixels.', 44) },
  common: ['place', 'z', 'when', 'fill', 'ring'],
  required: [],
};
export function render(c, p, env) {
  return c.box({ x: env.box.x, y: env.box.y, right: env.box.right, bottom: env.box.bottom, w: p.size, h: p.size, radius: 'full', fill: env.fill ?? 'field-deep', ring: p.ring ?? { w: Math.round(p.size / 6), colour: 'on-field' } });
}
