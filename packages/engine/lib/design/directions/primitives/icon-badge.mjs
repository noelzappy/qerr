// Primitive: one icon of the engine's own set (icons.mjs) drawn large, bare or on a round or rounded badge (kit box + iconSvg): the mark of a
// feature, a trust or security page, or a small sticker beside a big figure (turned, with a soft shadow). Decoration, never type: the path is
// the engine's constant, the icon's name one of a fixed list, its colours palette roles, its sizes whole pixels in bounds and its turn a named
// or bounded angle. Nothing of the post reaches it.
import { en, int } from '../../look-desc.mjs';
import { ICON_NAMES } from '../../icons.mjs';

export const BADGE_SHAPES = ['circle', 'rounded', 'none'];
export const SPEC = {
  label: 'Icon', group: 'Shapes', help: 'One of the engine\'s own icons drawn large (a padlock, a shield, a tick), bare or on a round or rounded badge, like a sticker.',
  placement: 'required', flow: true, container: null, text: false,
  own: {
    icon: en(ICON_NAMES, 'Icon', 'Which of the engine\'s own icons.'),
    size: int(24, 400, 'Icon size', 'The icon\'s width and height, in pixels.', 64),
    shape: en(BADGE_SHAPES, 'Badge', 'A round badge, a badge with rounded corners, or the icon alone.', 'circle'),
    badge: int(40, 600, 'Badge size', 'The side of the badge in pixels (about twice the icon when left out); larger than the icon.'),
  },
  common: ['place', 'rot', 'z', 'when', 'fill', 'ink', 'ring', 'shadow', 'before', 'nudgeX', 'alignSelf'],
  required: ['icon'],
};

// the badge's side when the look leaves it out: the icon with room round it
const sideOf = (p) => (p.shape === 'none' ? p.size ?? 64 : p.badge ?? Math.round((p.size ?? 64) * 1.9));
// For the static checks (look-static.mjs): a badge is its own filled shape and its icon stands on it; a bare icon has no fill and stands on
// what is under it.
export const ownFill = (el) => (el.shape !== 'none' ? el.fill : undefined);
export const inkPairs = (el) => (el.shape !== 'none' && el.fill !== undefined ? [[el.ink ?? 'ink', el.fill]] : []);
export function rules(el, bad) {
  if (el.shape === 'none' && el.badge !== undefined) bad('is the side of a badge; an icon alone has none', 'badge');
  if (el.shape === 'none' && el.fill !== undefined) bad('fills a badge; an icon alone has none', 'fill');
  if (el.shape === 'none' && el.ring !== undefined) bad('rings a badge; an icon alone has none', 'ring');
  if (el.shape === 'none' && el.shadow !== undefined) bad('is a badge\'s shadow; an icon alone has none', 'shadow');
  if (el.shape !== 'none' && el.fill === undefined) bad('needs a fill for its badge (or shape "none" for the icon alone)', 'fill');
  if (el.badge !== undefined && el.badge <= (el.size ?? 64)) bad('must be larger than the icon', 'badge');
  if (el.shadow !== undefined && el.shadow !== 'soft' && el.shadow !== 'lift') bad('a badge takes a soft shadow (soft or lift)', 'shadow');
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export function render(c, p, env) {
  const size = p.size ?? 64, side = sideOf(p), shape = p.shape ?? 'circle';
  const radius = shape === 'circle' ? 'full' : shape === 'rounded' ? Math.round(side * 0.28) : undefined;
  // on a badge the icon takes the ink the static check read; alone it takes the ink of what it stands on
  const icon = c.icon(p.icon, { colour: p.ink ?? (shape === 'none' ? env.ink : undefined) ?? 'ink', size });
  const look = clean({ w: side, h: side, fill: shape === 'none' ? undefined : p.fill, radius, ring: p.ring, shadow: env.shadowOpt, rot: env.rot || undefined, flex: 'column', justify: 'center', align: 'center', skipGrid: true });
  const b = env.box;
  if (b.flow) return c.box(clean({ ...look, flow: true, flexNone: true, alignSelf: b.alignSelf, nudge: env.nudge, z: env.z }), icon);
  return c.box(clean({ ...look, x: b.x, y: b.y, right: b.right, bottom: b.bottom, z: env.z }), icon);
}
