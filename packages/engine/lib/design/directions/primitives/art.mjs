// Primitive: the art layer. Decorative vector shapes behind or around the words: circles, ellipses, rounded rectangles, rings, arcs, lines,
// simple paths (a list of M, L, Q, C and Z commands of numbers), a field of dots and a field of stripes; a circle, an ellipse or a rectangle may
// be filled with a linear or radial gradient of palette colours. Colours are palette roles only (on a page that takes its colour from the
// picture, the roles are the picture's own: the emphasis, the surfaces and the pills follow the picture, runtime pictureLook); opacity, turn and
// blend come from bounded numbers and a fixed list. At most 24 shapes and 400 path points in a composition (art-geom.mjs ART_LIMITS).
// It is never text and never a fill the checks count as a panel: the contrast check measures the words on the finished pixels, art
// included; the page refuses art that covers a letter of any word (runtime artCover, checks.mjs kind "art"); and the emptiness check counts it
// as covering the page only where its pixels show it, like a pattern (data-pattern, runtime patternCover).
import { d, en, gradientDesc, int, list, num, obj, role } from '../../look-desc.mjs';
import { ART_BLENDS, ART_CAPS, ART_LIMITS, ART_SHAPES, pathProblems, shapePoints } from '../art-geom.mjs';

const POS = (label, help) => int(ART_LIMITS.pos[0], ART_LIMITS.pos[1], label, `${help} In thousandths of the art's box (0 to 1000 is the box; past it the box clips the shape).`);
const SIZE = (label, help) => int(ART_LIMITS.size[0], ART_LIMITS.size[1], label, `${help} In thousandths of the box's shorter side.`);
const STROKE = int(ART_LIMITS.stroke[0], ART_LIMITS.stroke[1], 'Line width', 'Pixels.');
const CAP = en(ART_CAPS, 'Line ends', 'Round or flat ends.', 'round');
// what every shape takes
const BASE = {
  colour: role('Colour', 'A colour of the brand (the accent when left out).', 'accent'),
  opacity: num(ART_LIMITS.opacity[0], ART_LIMITS.opacity[1], 'Strength', 'How strongly it shows (0.05 faint to 1 solid).', { def: 1 }),
  rot: int(ART_LIMITS.rot[0], ART_LIMITS.rot[1], 'Turn', 'Degrees, about the shape\'s centre.', 0),
  blend: en(ART_BLENDS, 'Blend', 'How it mixes with what is under it.', 'normal'),
};
const shape = (name, props, required, label, help) => obj({ shape: en([name], 'Shape', label), ...BASE, ...props }, label, help, ['shape', ...required]);
const GRADIENT = gradientDesc('Gradient', 'A blend of two or three brand colours instead of one colour.');
export const SHAPE_FORMS = Object.freeze({
  circle: shape('circle', { cx: POS('Centre x', 'Across.'), cy: POS('Centre y', 'Down.'), r: SIZE('Radius', 'Its radius.'), gradient: GRADIENT }, ['cx', 'cy', 'r'], 'Circle', 'A filled circle.'),
  ellipse: shape('ellipse', { cx: POS('Centre x', 'Across.'), cy: POS('Centre y', 'Down.'), rx: SIZE('Radius across', 'Half its width.'), ry: SIZE('Radius down', 'Half its height.'), gradient: GRADIENT }, ['cx', 'cy', 'rx', 'ry'], 'Ellipse', 'A filled oval.'),
  rect: shape('rect', { x: POS('Left', 'Its left edge.'), y: POS('Top', 'Its top edge.'), w: SIZE('Width', 'Thousandths of the box width.'), h: SIZE('Height', 'Thousandths of the box height.'), radius: int(0, 500, 'Corners', 'How round its corners are, in thousandths of the box\'s shorter side.'), gradient: GRADIENT }, ['x', 'y', 'w', 'h'], 'Rectangle', 'A filled rectangle, its corners square or rounded.'),
  ring: shape('ring', { cx: POS('Centre x', 'Across.'), cy: POS('Centre y', 'Down.'), r: SIZE('Radius', 'Its radius.'), stroke: STROKE }, ['cx', 'cy', 'r', 'stroke'], 'Ring', 'The outline of a circle.'),
  arc: shape('arc', { cx: POS('Centre x', 'Across.'), cy: POS('Centre y', 'Down.'), r: SIZE('Radius', 'Its radius.'), from: int(0, 359, 'From', 'Where it starts, in degrees clockwise from the top.', 0), sweep: int(5, 360, 'Sweep', 'How far round it runs, in degrees.'), stroke: STROKE, cap: CAP }, ['cx', 'cy', 'r', 'sweep', 'stroke'], 'Arc', 'Part of a circle\'s outline.'),
  line: shape('line', { x1: POS('Start x', 'Across.'), y1: POS('Start y', 'Down.'), x2: POS('End x', 'Across.'), y2: POS('End y', 'Down.'), stroke: STROKE, cap: CAP }, ['x1', 'y1', 'x2', 'y2', 'stroke'], 'Line', 'A straight line.'),
  path: shape('path', { d: d({ kind: 'path', max: ART_LIMITS.pathCommands }, 'Path', 'A list of commands: ["M", x, y] moves, ["L", x, y] draws a line, ["Q", x1, y1, x, y] and ["C", x1, y1, x2, y2, x, y] curves, ["Z"] closes; numbers in thousandths of the box.'), stroke: { ...STROKE, help: 'Pixels; with a width the path is drawn as a line, without one it is filled.' }, cap: CAP }, ['d'], 'Path', 'A free shape of lines and curves.'),
  dots: shape('dots', { x: POS('Left', 'The field\'s left edge.'), y: POS('Top', 'The field\'s top edge.'), w: SIZE('Width', 'Thousandths of the box width.'), h: SIZE('Height', 'Thousandths of the box height.'), gap: int(ART_LIMITS.gap[0], ART_LIMITS.gap[1], 'Spacing', 'Pixels between dots.'), size: int(ART_LIMITS.dot[0], ART_LIMITS.dot[1], 'Dot size', 'The radius of each dot, in pixels.') }, ['x', 'y', 'w', 'h', 'gap', 'size'], 'Dots', 'A field of dots in rows.'),
  stripes: shape('stripes', { x: POS('Left', 'The field\'s left edge.'), y: POS('Top', 'The field\'s top edge.'), w: SIZE('Width', 'Thousandths of the box width.'), h: SIZE('Height', 'Thousandths of the box height.'), gap: int(ART_LIMITS.gap[0], ART_LIMITS.gap[1], 'Spacing', 'Pixels from one stripe to the next.'), width: int(ART_LIMITS.stroke[0], ART_LIMITS.stroke[1], 'Stripe width', 'Pixels.'), angle: int(0, 179, 'Angle', 'Degrees.', 45) }, ['x', 'y', 'w', 'h', 'gap', 'width'], 'Stripes', 'A field of parallel stripes.'),
});

export const SPEC = {
  label: 'Art', group: 'Shapes', help: 'Decorative shapes in the brand\'s colours behind or around the words: circles, rounded rectangles, rings, arcs, lines, free paths, dots and stripes. Never words; the page checks that it covers no letter and that the words still read on it.',
  placement: 'required', flow: false, container: null, text: false,
  own: {
    shapes: list(d({ kind: 'tagged', key: 'shape', forms: SHAPE_FORMS }, 'Shape', 'One shape.'), ART_LIMITS.shapes, 'Shapes', `The shapes, drawn in order (the first at the back). At most ${ART_LIMITS.shapes} in a design.`, { min: 1 }),
  },
  common: ['place', 'z', 'when'],
  required: ['shapes'],
};
export { ART_SHAPES, ART_LIMITS };

const GRADIENT_SHAPES = ['circle', 'ellipse', 'rect'];
export function rules(el, bad) {
  if (!Array.isArray(el.shapes)) return;
  el.shapes.forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    if (s.shape === 'path' && s.d !== undefined) for (const p of pathProblems(s.d).slice(0, 2)) bad(p, `shapes[${i}].d`);
    if (s.gradient !== undefined && !GRADIENT_SHAPES.includes(s.shape)) bad('a gradient fills a circle, an ellipse or a rectangle', `shapes[${i}].gradient`);
    if (s.gradient !== undefined && s.colour !== undefined) bad('takes a colour or a gradient, not both', `shapes[${i}].colour`);
    if (s.shape === 'dots' || s.shape === 'stripes') { if (s.rot !== undefined && s.rot !== 0) bad(`${s.shape} turn by their own angle, not by rot`, `shapes[${i}].rot`); }
    if (s.shape === 'ring' && s.rot !== undefined && s.rot !== 0) bad('a ring has no direction to turn', `shapes[${i}].rot`);
  });
}
// The points every art element of a composition holds (the cap counts them over the whole composition: look-validate.mjs).
export const artPoints = (el) => (Array.isArray(el.shapes) ? el.shapes.reduce((a, s) => a + shapePoints(s), 0) : 0);
// For the static checks: decoration; no words reach it and it is not a fill (text on it reads on what is under it, measured on the pixels).
export const decoration = true;

export function render(c, p, env) {
  const b = env.box;
  return c.art({ x: b.x ?? 0, y: b.y ?? 0, w: b.w ?? c.W, h: b.h ?? c.H, shapes: p.shapes, z: env.z });
}
