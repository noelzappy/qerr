// Primitive: a fade over a picture behind text, darkened until the text reads (kit scrim).
import { int, num, role } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Dark fade behind the text', group: 'Pictures', help: 'A fade over a picture, behind text, that darkens until the text reads.', placement: 'required', flow: false, container: null, text: false,
  own: { need: num(3, 7, 'Contrast', 'The contrast the text must reach (3 to 7).', { def: 4.5 }), floor: num(0.2, 0.9, 'Least strength', 'Share of full strength.', { def: 0.45 }), cap: num(0.5, 0.98, 'Most strength', 'Share of full strength.', { def: 0.92 }), fade: int(0, 200, 'Fade length', 'Pixels.', 56), colour: role('Colour', 'The fade colour.', 'ink') },
  common: ['place', 'z', 'when'],
  required: [],
};
export function render(c, p, env) {
  return c.scrim({ x: env.box.x ?? 0, y: env.box.y ?? 0, w: env.box.w ?? c.W, h: env.box.h ?? c.H, need: p.need, floor: p.floor, cap: p.cap, fade: p.fade, colour: p.colour });
}
