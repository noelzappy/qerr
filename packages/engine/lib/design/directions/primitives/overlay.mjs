// Primitive: a colour laid over a full picture so text on it reads (kit overlay). Flat, or strongest at the foot or the head of its box and fading
// towards the other end. Its colour is a brand role a panel can be filled with; its strength is measured when the page is made: the runtime reads
// the picture's own pixels under the text in its box and raises the strength from `floor` until the text reaches `need`:1, no further than `cap`.
// The render's contrast check then measures the finished pixels behind the text, as for every page.
import { OVERLAY_FROM, en, int, num, role } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Colour over the picture', group: 'Pictures', help: 'A brand colour laid over a picture so the words on it read: even, or strongest at the foot or the top and fading away.',
  placement: 'required', flow: false, container: null, text: false,
  own: {
    colour: role('Colour', 'The colour laid over the picture (a colour a panel can be filled with).', 'ink'),
    from: en(OVERLAY_FROM, 'Strongest', 'Even all over, strongest at the foot (fading upwards) or strongest at the top (fading downwards).', 'bottom'),
    need: num(3, 7, 'Contrast', 'The contrast the words on it must reach (3 to 7).', { def: 4.5 }),
    floor: num(0.1, 0.9, 'Least strength', 'Share of full colour it starts from.', { def: 0.35 }),
    cap: num(0.3, 0.95, 'Most strength', 'Share of full colour it may reach.', { def: 0.85 }),
    fade: int(0, 800, 'Fade length', 'Pixels over which it fades out beyond the words (not for an even colour; 240 when left out).'),
  },
  common: ['place', 'z', 'when'],
  required: [],
};
export function render(c, p, env) {
  const b = env.box;
  // an anchored overlay keeps the edge it is anchored to (a band at the foot of the page is placed from the bottom)
  const x = b.x ?? (b.right === undefined ? 0 : undefined), y = b.y ?? (b.bottom === undefined ? 0 : undefined);
  return c.overlay({ x, y, right: b.right, bottom: b.bottom, w: b.w ?? (b.x !== undefined && b.right !== undefined ? undefined : c.W), h: b.h ?? (b.y !== undefined && b.bottom !== undefined ? undefined : c.H), colour: p.colour, from: p.from, need: p.need, floor: p.floor, cap: p.cap, fade: p.fade, z: env.z });
}
