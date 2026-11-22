// Primitive: the brand name repeated at low strength as a texture (kit wordmarkPattern).
import { bool, int, role } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Brand name pattern', group: 'Shapes', help: 'The brand name repeated at low strength as a texture.', placement: 'required', flow: false, container: null, text: false,
  own: { size: int(24, 300, 'Size', 'Pixels.'), altItalic: bool('Italic every second row', 'Italics on alternate rows.', false), fade: bool('Fade', 'Fades the texture out downwards.', false), fadeFrom: int(0, 95, 'Fade from', 'Percent of its height where it starts to fade.'), colour: role('Colour', 'The texture colour.', 'ink') },
  common: ['place', 'z', 'when'],
  required: ['size'],
};
const SEP = { dash: ' — ', dot: ' · ', slash: ' / ', bar: ' | ' };
export function render(c, p, env) {
  const w = env.box.w ?? c.W, h = env.box.h ?? c.H;
  return c.wordmarkPattern({ x: env.box.x ?? 0, y: env.box.y ?? 0, w, h, size: p.size, altItalic: p.altItalic || undefined, fade: p.fade || undefined, fadeFrom: p.fade ? p.fadeFrom : undefined, colour: p.colour, opacity: env.look.devices.wordmark.opacity, sep: SEP[env.look.devices.wordmark.sep] });
}
