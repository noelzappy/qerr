// Primitive: the post's portrait picture (avatar), one picture of the person a quotation is by, cropped round, square or with rounded corners
// round its focal point, with an optional ring in a brand colour (kit avatarPhoto: a checked data: URI, its enlargement checked). It sits beside
// or above the attribution: in the flow of a box (a row with the name, or a column above it), or at a place of its own. Whether the picture may
// show a face is the picture's own record (the app's rights and consent rule, the AI's usable pictures), never the look's.
import { PHOTO_TREATS, en, int, list } from '../../look-desc.mjs';

export const AVATAR_SHAPES = ['circle', 'rounded', 'square'];
export const SPEC = {
  label: 'Portrait picture', group: 'Pictures', help: 'One picture of the person quoted (the post\'s avatar), cropped round, square or with rounded corners, with an optional ring in a brand colour. Put it in a row beside the name, or above it.',
  placement: 'required', flow: true, container: null, text: false,
  own: {
    size: int(48, 400, 'Size', 'The picture\'s width and height, in pixels.', 120),
    shape: en(AVATAR_SHAPES, 'Shape', 'Round, with rounded corners, or square.', 'circle'),
    treat: list(en(PHOTO_TREATS, 'Treatment', 'Grey, multiply, grain or punch.'), 4, 'Treatment', 'How the picture is treated; leave out to use the look\'s.', { unique: true }),
  },
  common: ['place', 'z', 'when', 'ring', 'shadow', 'before', 'nudgeX', 'alignSelf'],
  required: [],
};

// For the static checks (look-static.mjs): it shows the avatar, and is a picture (text over it needs a filled box).
export const bindings = () => [{ field: 'avatar', sig: 'avatar|all' }];
export const picture = true;
export function rules(el, bad) {
  if (el.shadow !== undefined && el.shadow !== 'soft' && el.shadow !== 'lift') bad('a portrait picture takes a soft shadow (soft or lift)', 'shadow');
  const pl = el.place;
  if (pl?.px && ((pl.px.w !== undefined && pl.px.w !== (el.size ?? 120)) || (pl.px.h !== undefined && pl.px.h !== (el.size ?? 120)))) bad('is as wide and as tall as its size; leave w and h out of its place, or make them its size', 'place');
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export function render(c, p, env) {
  if (!c.hasAvatar) return '';
  const d = p.size ?? 120, soft = typeof p.shadow === 'string' && p.shadow !== 'hard' ? p.shadow : undefined;
  const look = clean({ d, shape: p.shape ?? 'circle', treat: p.treat ?? env.look.photo.treat ?? [], tint: env.look.photo.tint, ring: p.ring, soft });
  const b = env.box;
  if (b.flow) return c.avatarPhoto({ ...look, nudge: env.nudge, alignSelf: b.alignSelf });
  // at a place of its own: a box of its size holds it
  return c.box(clean({ x: b.x, y: b.y, right: b.right, bottom: b.bottom, w: d, h: d, z: env.z, skipGrid: true }), c.avatarPhoto(look));
}
