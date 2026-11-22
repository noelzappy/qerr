// Primitive: a button-shaped call to action, one line of the post's words (cta, or the tag or label) in a pill, a rounded or a square box, with
// an optional icon of the engine's own set after the words (kit box + run + iconSvg). The words are escaped by the kit (c.text); they never wrap,
// and a button whose words run out of its place is refused by the fit check (the place is the words' cell).
import { ALIGNS, bool, en, field, int } from '../../look-desc.mjs';
import { ICON_NAMES } from '../../icons.mjs';

export const BUTTON_SHAPES = ['pill', 'rounded', 'square'];
export const BUTTON_FONTS = ['label', 'display', 'text'];
export const SPEC = {
  label: 'Button', group: 'Shapes', help: 'A call to action shaped like a button: one line of words (such as Book now) in a pill or box, with an optional icon.',
  placement: 'required', flow: true, container: null, text: true,
  own: {
    field: field(['cta', 'tag', 'label'], 'Field', 'The words on the button: the call to action, the tag or the label.', 'cta'),
    shape: en(BUTTON_SHAPES, 'Shape', 'A round pill, a box with rounded corners, or a square box.', 'pill'),
    size: int(20, 60, 'Text size', 'Pixels.', 32),
    font: en(BUTTON_FONTS, 'Font', 'Which of the look\'s fonts the words are set in.', 'label'),
    upper: bool('Capitals', 'Sets the words in capitals (the label style decides when left out).'),
    icon: en(['none', ...ICON_NAMES], 'Icon', 'An icon after the words, from the engine\'s own icons.', 'none'),
    width: en(['hug', 'full'], 'Width', 'As wide as its words, or the whole width of its place.', 'hug'),
    align: en(ALIGNS, 'Align', 'Where a hugging button sits across its place (left when left out).'),
  },
  common: ['place', 'z', 'when', 'fill', 'ink', 'shadow', 'ring', 'before', 'nudgeX', 'alignSelf'],
  required: [],
};

// the defaults a button is drawn in when its look gives no fill or ink: the accent and its own ink
export const DEFAULT_FILL = 'accent', DEFAULT_INK = 'on-accent';
// For the static checks (look-static.mjs).
export const bindings = (el) => [{ field: el.field ?? 'cta', sig: `${el.field ?? 'cta'}|button` }];
export const sizes = (el) => [el.size ?? 32];
// the button is its own filled shape: its ink stands on its fill
export const ownFill = (el) => el.fill ?? DEFAULT_FILL;
export const inkPairs = (el) => [[el.ink ?? DEFAULT_INK, el.fill ?? DEFAULT_FILL]];
export function fonts(el, look) {
  const T = look.type, f = el.font ?? 'label';
  return [f === 'display' ? ['display', T.display.weight] : f === 'text' ? ['text', T.body.weight] : [T.label.role === 'mono' ? 'mono' : 'label', T.label.weight]];
}
export function rules(el, bad) {
  if (el.align !== undefined && el.width === 'full') bad('places a hugging button; a full-width button fills its place', 'align');
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export function render(c, p, env) {
  const f = p.field ?? 'cta';
  if (!c.has(f)) return '';
  const T = env.look.type, L = T.label, size = p.size ?? 32, font = p.font ?? 'label';
  // the room round the words: at least 14 px above and below (the post check wants 10 px between ink and the edge of a shape)
  const padY = Math.max(14, Math.round(size * 0.5)), padX = Math.max(24, Math.round(size * 0.9));
  const radius = p.shape === 'square' ? undefined : p.shape === 'rounded' ? Math.round(size * 0.35) : 'full';
  const ink = p.ink ?? DEFAULT_INK;
  const words = c.run(clean({
    html: c.text(f), role: 'label', family: font === 'label' ? (L.role === 'mono' ? 'mono' : 'label') : font, dfont: font === 'display' || undefined, size, lead: 1.15,
    weight: font === 'display' ? T.display.weight : font === 'text' ? T.body.weight : L.weight, track: font === 'label' ? L.track : undefined, upper: p.upper ?? (font === 'label' ? L.upper : undefined), colour: ink, nowrap: true,
  }));
  const icon = p.icon && p.icon !== 'none' ? c.icon(p.icon, { cls: 'btn' }) : '';
  const full = p.width === 'full';
  const shape = (o) => c.box(clean({ ...o, fill: p.fill ?? DEFAULT_FILL, ink, radius, pad: [padY, padX, padY, padX], flex: 'row', align: 'center', justify: full ? 'center' : undefined, gap: icon ? Math.round(size * 0.4) : undefined, shadow: env.shadowOpt, ring: p.ring, skipGrid: true }), `${words}${icon}`);
  const b = env.box;
  // in a box's flow: the button itself (as wide as its words unless full)
  if (b.flow) return shape(clean({ flow: true, w: full ? b.w : undefined, alignSelf: full ? 'stretch' : b.alignSelf, flexNone: true, nudge: env.nudge }));
  // at a place of its own: the place is the words' cell; a hugging button sits in it at the left, centre or right
  if (full) return c.box(clean({ ...b, cell: true, z: env.z }), shape({ flow: true, w: b.w, flexNone: true }));
  return c.box(clean({ ...b, cell: true, z: env.z, flex: 'row', align: 'start', justify: p.align === 'center' ? 'center' : p.align === 'right' ? 'end' : undefined }), shape({ flow: true, flexNone: true }));
}
