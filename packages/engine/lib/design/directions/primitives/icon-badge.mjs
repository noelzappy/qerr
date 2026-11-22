// Primitive: a small round badge holding one of the engine's own icons (kit badge: a round box and iconSvg), like a sticker beside a big figure.
// Decoration: no words, the icon is the engine's fixed SVG path, the colours are palette roles and the size a bounded number.
import { en, int } from '../../look-desc.mjs';
import { ICON_NAMES } from '../../icons.mjs';

export const SPEC = {
  label: 'Icon badge', group: 'Shapes', help: 'A small round badge with one of the engine\'s icons in it, like a sticker.',
  placement: 'required', flow: true, container: null, text: false,
  own: {
    icon: en(ICON_NAMES, 'Icon', 'Which of the engine\'s icons.'),
    size: int(24, 300, 'Size', 'Pixels across.', 72),
  },
  common: ['place', 'rot', 'z', 'when', 'fill', 'ink', 'ring', 'shadow', 'before', 'nudgeX', 'alignSelf'],
  required: ['icon'],
};

// the defaults: the accent with its own ink
export const DEFAULT_FILL = 'gold', DEFAULT_INK = 'on-accent';
// For the static checks (look-static.mjs): the badge is its own filled shape, its icon stands on its fill.
export const ownFill = (el) => el.fill ?? DEFAULT_FILL;
export const inkPairs = (el) => [[el.ink ?? DEFAULT_INK, el.fill ?? DEFAULT_FILL]];
export function rules(el, bad) {
  if (el.shadow !== undefined && el.shadow !== 'soft' && el.shadow !== 'lift') bad('a round badge takes a soft shadow (soft or lift)', 'shadow');
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export function render(c, p, env) {
  const b = env.box, size = p.size ?? 72;
  return c.badge(clean({ x: b.flow ? undefined : b.x, y: b.flow ? undefined : b.y, right: b.flow ? undefined : b.right, bottom: b.flow ? undefined : b.bottom, flow: b.flow || undefined, alignSelf: b.alignSelf,
    nudge: env.nudge, size, icon: p.icon, fill: p.fill ?? DEFAULT_FILL, ink: p.ink ?? DEFAULT_INK, ring: p.ring, shadow: env.shadowOpt, rot: env.rot || undefined, z: env.z }));
}
