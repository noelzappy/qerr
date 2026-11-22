// Primitive: the post's picture pasted on like a print, in a paper mount with an optional keyline round the picture, held by strips of tape on two
// or four corners, and turned as a whole (kit box + photo + keyline + tape). The picture is read and checked like every picture (c.photo: a checked
// data: URI, its enlargement checked); the tape is decoration (kit tape: a palette colour, see-through, torn ends from kit.css). Every number is
// bounded here and again by the kit; the corners and the treatments are fixed lists.
import { PHOTO_TREATS, en, int, list, role } from '../../look-desc.mjs';

export const TAPE_CORNERS = ['diagonal', 'other-diagonal', 'top', 'all'];
export const SPEC = {
  label: 'Taped picture', group: 'Pictures', help: 'The post\'s picture pasted on like a print: a paper mount, a thin line round the picture, strips of tape on its corners, turned as a whole.',
  placement: 'required', flow: false, container: null, text: false,
  own: {
    mount: int(0, 40, 'Mount', 'Width of the paper border round the picture, in pixels (0: none).', 0),
    keyline: int(0, 8, 'Line round the picture', 'Pixels of a line in the ink colour round the picture (0: none).', 4),
    keylineColour: role('Line colour', 'The colour of the line round the picture.', 'ink'),
    tapeOn: en(TAPE_CORNERS, 'Tape on', 'Which corners are taped: top left and bottom right (diagonal), top right and bottom left (other-diagonal), the two top corners, or all four.', 'diagonal'),
    tapeColour: role('Tape colour', 'The colour of the tape (it is drawn see-through).', 'muted'),
    tapeLength: int(60, 260, 'Tape length', 'Pixels.', 150),
    tapeWidth: int(20, 80, 'Tape width', 'Pixels.', 44),
    treat: list(en(PHOTO_TREATS, 'Treatment', 'Grey, multiply, grain or punch.'), 4, 'Treatment', 'How the picture is treated; leave out to use the look\'s.', { unique: true }),
  },
  common: ['place', 'rot', 'z', 'when', 'fill', 'shadow'],
  required: [],
};

// For the static checks (look-static.mjs): it shows the image, and is a picture (text over it needs a filled box or a fade).
export const bindings = () => [{ field: 'image', sig: 'image|all' }];
export const picture = true;
export function rules(el, bad) {
  const pl = el.place;
  if (pl && !(pl.px && pl.px.w !== undefined && pl.px.h !== undefined) && pl.grid === undefined && pl.inset === undefined) bad('needs a place with a width and a height (pixels with w and h, a grid place, or an inset)', 'place');
  if (pl?.px && Number.isFinite(pl.px.w) && Number.isFinite(pl.px.h) && Number.isFinite(el.mount) && 2 * el.mount + 80 > Math.min(pl.px.w, pl.px.h)) bad('leaves too little room for the picture inside its mount', 'mount');
  if (el.fill !== undefined && !(el.mount > 0)) bad('is the colour of the mount; give the mount a width', 'fill');
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
// the corners taped, as [x share, y share, turn]: the tape lies across the corner, square to the picture's diagonal
const CORNERS = { tl: [0, 0, -45], tr: [1, 0, 45], bl: [0, 1, 45], br: [1, 1, -45] };
const TAPED = { diagonal: ['tl', 'br'], 'other-diagonal': ['tr', 'bl'], top: ['tl', 'tr'], all: ['tl', 'tr', 'bl', 'br'] };
export function render(c, p, env) {
  if (!c.hasImage) return '';
  const b = env.box, w = b.w, h = b.h;
  if (!Number.isFinite(w) || !Number.isFinite(h)) throw new Error('look: a taped picture needs a place with a width and a height');
  const mount = p.mount ?? 0, line = p.keyline ?? 4, L = p.tapeLength ?? 150, T = p.tapeWidth ?? 44;
  if (w - 2 * mount < 40 || h - 2 * mount < 40) throw new Error('look: a taped picture is too small for its mount');
  const treat = p.treat ?? env.look.photo.treat ?? [];
  const inner = c.photo(clean({ x: mount, y: mount, w: w - 2 * mount, h: h - 2 * mount, treat, tint: env.look.photo.tint }))
    + (line ? c.keyline({ x: mount, y: mount, w: w - 2 * mount, h: h - 2 * mount, weight: line, colour: p.keylineColour ?? 'ink' }) : '');
  const tapes = (TAPED[p.tapeOn ?? 'diagonal'] ?? TAPED.diagonal).map((k) => { const [sx, sy, turn] = CORNERS[k]; return c.tape({ cx: sx * w, cy: sy * h, w: L, h: T, rot: turn, colour: p.tapeColour ?? 'muted' }); }).join('');
  // turned about its centre, as a whole: the mount, the picture, its line and the tape
  return c.box(clean({ x: b.x, y: b.y, w, h, fill: mount > 0 ? (p.fill ?? 'paper') : undefined, rot: env.rot || undefined, shadow: env.shadowOpt, z: env.z }), inner + tapes);
}
