// Primitive: a row of 2 to 5 round pictures (speakers, products), the post's gallery, each cropped to a circle and read like every picture
// (kit galleryPhoto: a checked data: URI, its enlargement checked), with an optional caption under each (escaped by the kit, c.gallery()).
// The circles share the row's width: each is at most `size` across, smaller when more pictures need the room.
import { ALIGNS, PHOTO_TREATS, bool, en, int, list, role } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Row of round pictures', group: 'Pictures', help: 'Two to five of the post\'s pictures in a row, each cropped to a circle, with an optional name under each.',
  placement: 'required', flow: true, container: null, text: true,
  own: {
    size: int(80, 400, 'Size', 'The most a circle is across, in pixels (smaller when the row needs the room).', 200),
    gap: int(0, 80, 'Gap', 'Pixels between the circles.', 24),
    overlap: int(0, 80, 'Overlap', 'Pixels each circle lies over the one before (a stacked row; needs gap 0 and a ring).'),
    align: en(ALIGNS, 'Align', 'Where the row sits across its place.', 'left'),
    captions: bool('Names under the pictures', 'Sets each picture\'s caption under it, in the look\'s label style.', false),
    captionInk: role('Name colour', 'The colour of the names; leave out for the ink of the row (ink on the page).'),
    treat: list(en(PHOTO_TREATS, 'Treatment', 'Grey, multiply, grain or punch.'), 4, 'Treatment', 'How the pictures are treated; leave out to use the look\'s.', { unique: true }),
  },
  common: ['place', 'z', 'when', 'ring', 'shadow', 'w', 'before', 'nudgeX', 'alignSelf'],
  required: [],
};
export const CAPTION_GAP = 12;

// For the static checks (look-static.mjs): it shows the gallery, is a picture (text over it needs a filled box), its captions are label type.
export const bindings = () => [{ field: 'gallery', sig: 'gallery|row' }];
export const picture = true;
export const sizes = (el, look) => (el.captions ? [look.type?.label?.size].filter(Number.isFinite) : []);
export const inks = (el) => (el.captions && el.captionInk !== undefined ? [el.captionInk] : []);
export const fonts = (el, look) => (el.captions ? [[look.type.label.role === 'mono' ? 'mono' : 'label', look.type.label.weight]] : []);
export function rules(el, bad) {
  if (el.overlap !== undefined && el.overlap > 0) {
    if (el.gap !== undefined && el.gap !== 0) bad('lays the circles over each other, so the gap must be 0', 'overlap');
    if (el.ring === undefined) bad('needs a ring round each circle, so the circles stay apart', 'overlap');
    if (el.captions === true) bad('cannot go with names under the pictures (they would lie over each other)', 'overlap');
    if (Number.isFinite(el.size) && el.overlap * 2 >= el.size) bad('is at most less than half the size', 'overlap');
  }
  if (el.captionInk !== undefined && el.captions !== true) bad('is the colour of the names under the pictures; turn them on', 'captionInk');
  if (el.shadow !== undefined && el.shadow !== 'soft' && el.shadow !== 'lift') bad('a round picture takes a soft shadow (soft or lift)', 'shadow');
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export function render(c, p, env) {
  const pics = c.gallery();
  if (!pics.length) return '';
  const w = env.box.w ?? env.innerW;
  if (!Number.isFinite(w)) throw new Error('look: a row of round pictures needs a width (a place with a width, or a box that has one)');
  const n = pics.length, gap = p.gap ?? 24, over = p.overlap ?? 0;
  const d = Math.floor(Math.min(p.size ?? 200, (w - gap * (n - 1) + over * (n - 1)) / n));
  if (d < 60) throw new Error('look: the row of round pictures is too narrow for its pictures');
  const L = env.look.type.label, treat = p.treat ?? env.look.photo.treat ?? [];
  const soft = typeof p.shadow === 'string' && p.shadow !== 'hard' ? p.shadow : undefined;
  const cells = pics.map((pic, i) => {
    const photo = c.galleryPhoto(clean({ d, image: pic.image, treat, tint: env.look.photo.tint, ring: p.ring, soft }));
    const nudge = i && over ? { x: -over } : undefined;
    if (!p.captions) return nudge ? c.box({ flow: true, w: d, flexNone: true, nudge }, photo) : photo;
    const cap = String(pic.caption) ? c.box({ flow: true, w: d, cell: true }, c.run({ html: pic.caption, role: 'label', family: L.role === 'mono' ? 'mono' : 'label', size: L.size, lead: 1.2, weight: L.weight, track: L.track, upper: L.upper, colour: p.captionInk ?? env.ink ?? 'ink', nowrap: true, textAlign: 'center' })) : '';
    return c.box({ flow: true, w: d, flexNone: true, flex: 'column', align: 'center', gap: CAPTION_GAP }, photo + cap);
  });
  const justify = p.align === 'center' ? 'center' : p.align === 'right' ? 'end' : undefined;
  return c.box(clean({ ...env.box, w, flex: 'row', align: 'start', justify, gap: over ? undefined : gap || undefined, z: env.z, nudge: env.nudge, skipGrid: true }), cells.join(''));
}
