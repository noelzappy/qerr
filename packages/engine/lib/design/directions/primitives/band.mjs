// Primitive: a full-width band turned by an angle and wider than the page, items flowing in it (kit band).
import { int, num } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Band', group: 'Layout', help: 'A full-width band, turned by an angle and wider than the page so its ends never show. Items flow in it.',
  placement: 'none', flow: false, container: 'any', text: false,
  own: { y: num(-300, 1700, 'Top', 'Where its top sits when straight, in pixels.', { int: true }), h: int(1, 1700, 'Height', 'Pixels.'), gap: int(0, 120, 'Gap', 'Pixels between items.', 0) },
  common: ['rot', 'origin', 'z', 'when', 'fill', 'ink', 'pad', 'shadow'],
  required: ['y', 'h'],
};
export const OVERSCAN = 140;
export function render(c, p, env) {
  const kids = env.kids({ w: c.W - 0, ink: env.ink, flexDir: 'column' });
  return c.band({ y: p.y, h: p.h, colour: p.fill, ink: env.ink, rot: env.rot || undefined, origin: p.origin, z: env.z, unrot: env.rot && kids ? true : undefined, pad: p.pad, shadow: env.shadowOpt, overscan: OVERSCAN }, kids);
}
