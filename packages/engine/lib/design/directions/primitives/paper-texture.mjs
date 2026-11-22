// Primitive: a light paper texture over an area, usually the whole page (kit paper: the page's own grain, --k-grain, multiplied over the ground at a
// bounded strength). Decoration only: never type, never a fill the emptiness check counts, and the contrast check still measures the finished pixels.
import { en, num } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Paper texture', group: 'Shapes', help: 'A light paper grain over the page or an area of it, as on a printed letter.',
  placement: 'required', flow: false, container: null, text: false,
  own: {
    strength: num(0.05, 0.6, 'Strength', 'How strong the grain is (0.05 faint to 0.6 strong).', { def: 0.25 }),
    grain: en(['fine', 'coarse'], 'Grain', 'A fine or a coarse grain.', 'fine'),
  },
  common: ['place', 'z', 'when'],
  required: [],
};

export function render(c, p, env) {
  const b = env.box;
  return c.paper({ x: b.x ?? 0, y: b.y ?? 0, w: b.w ?? c.W, h: b.h ?? c.H, strength: p.strength ?? 0.25, grain: p.grain ?? 'fine', z: env.z });
}
