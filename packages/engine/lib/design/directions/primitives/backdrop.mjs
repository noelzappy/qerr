// Primitive: a decorative background (kit backdrop): dots, halftone, a grid, stripes, rings, waves, a soft blob mesh, confetti, plus marks, a
// checker, or the page's own grain, over the page, a panel's area, or fading out (mask). It is drawn from brand colour roles and bounded
// numbers only (scale, density, opacity, angle, seed), as inline SVG paths or CSS radial gradients built by backdrop-geom.mjs, so the same
// numbers draw the same pattern every time. Decoration, never type: the contrast check measures the text on the finished pixels, the
// pattern included, and the emptiness check counts the pattern as covering a part of the page only where its pixels show it (runtime
// patternCover: measured against the page colour, a quiet pattern stays empty space).
import { BACKDROP_MASKS, BACKDROP_PATTERNS, GRADIENT_AT, en, int, num, role } from '../../look-desc.mjs';

// Ready-made settings the editor offers as a visual picker. Each is a set of the element's own values (never a new kind of value), and the
// quiet ones keep the pattern faint enough for words on it to read in the brand's ink.
export const PRESETS = Object.freeze({
  'quiet-dots': { pattern: 'dots', scale: 36, density: 0.35, opacity: 0.1 },
  'quiet-grid': { pattern: 'grid', scale: 54, density: 0.3, opacity: 0.08 },
  'quiet-rings': { pattern: 'rings', scale: 64, density: 0.25, opacity: 0.08, at: 'right top' },
  'quiet-waves': { pattern: 'waves', scale: 60, density: 0.3, opacity: 0.08 },
  'quiet-stripes': { pattern: 'stripes', scale: 48, density: 0.3, opacity: 0.06, angle: 135 },
  'quiet-grain': { pattern: 'grain', opacity: 0.25 },
  halftone: { pattern: 'halftone', scale: 28, density: 0.8, opacity: 0.22, at: 'left top', mask: 'fade-down' },
  'bold-dots': { pattern: 'dots', scale: 44, density: 0.55, opacity: 0.3 },
  confetti: { pattern: 'confetti', scale: 70, density: 0.35, opacity: 0.5, seed: 7 },
  'plus-marks': { pattern: 'plus', scale: 80, density: 0.5, opacity: 0.18 },
  checker: { pattern: 'checker', scale: 90, density: 1, opacity: 0.06 },
  'blob-mesh': { pattern: 'blobs', scale: 160, density: 0.5, opacity: 0.5, seed: 3 },
});
export const PRESET_NAMES = Object.keys(PRESETS);

export const SPEC = {
  label: 'Pattern', group: 'Shapes', help: 'A decorative background drawn in a brand colour: dots, a grid, stripes, rings, waves, soft blobs, confetti, plus marks, a checker or a grain. Over the page, a panel, or fading out.',
  placement: 'required', flow: false, container: null, text: false,
  own: {
    pattern: en(BACKDROP_PATTERNS, 'Pattern', 'Which pattern.'),
    colour: role('Colour', 'The colour the pattern is drawn in (a colour a panel can be filled with; the accent when left out).'),
    second: role('Second colour', 'A second colour, for confetti and blobs (they alternate).'),
    scale: int(12, 240, 'Scale', 'The spacing of the pattern in pixels (the size of a blob for blobs).', 40),
    density: num(0.1, 1, 'Density', 'How much of each step is drawn: small dots and fine lines (0.1) to large dots and heavy lines (1); 0.5 when left out.'),
    opacity: num(0.03, 0.6, 'Strength', 'How strongly it shows (0.03 faint to 0.6 strong); words on it are measured on the pixels.', { def: 0.1 }),
    angle: int(0, 179, 'Angle', 'Turns the pattern, in degrees (lines, dots, grids, plus marks and checkers; 0 when left out).'),
    seed: int(0, 9999, 'Seed', 'Picks one of many arrangements of confetti and blobs; the same seed always draws the same (1 when left out).'),
    mask: en(BACKDROP_MASKS, 'Fade', 'Not at all, towards one side, out from the middle (vignette) or clear in the middle (edges).', 'none'),
    at: en(GRADIENT_AT, 'Centre', 'Where rings are centred and where halftone dots are largest.'),
  },
  common: ['place', 'z', 'when', 'radius', 'corners'],
  required: ['pattern'],
};

const HAS_ANGLE = ['dots', 'halftone', 'grid', 'stripes', 'waves', 'plus', 'checker'];
const HAS_SEED = ['confetti', 'blobs'];
export function rules(el, bad) {
  const p = el.pattern;
  if (el.second !== undefined && !HAS_SEED.includes(p)) bad('is for confetti and blobs (they alternate two colours)', 'second');
  if (el.at !== undefined && !['rings', 'halftone'].includes(p)) bad('is for rings and halftone', 'at');
  if (el.angle !== undefined && el.angle !== 0 && !HAS_ANGLE.includes(p)) bad(`a ${p} pattern has no direction`, 'angle');
  if (el.seed !== undefined && !HAS_SEED.includes(p)) bad('picks an arrangement of confetti or blobs; other patterns are regular', 'seed');
  if (p === 'grain') for (const k of ['colour', 'second', 'density', 'angle', 'seed', 'at']) if (el[k] !== undefined) bad('the grain is the page\'s own texture; it takes only scale, strength and a fade', k);
  if (p === 'blobs' && el.angle !== undefined && el.angle !== 0) bad('blobs have no direction', 'angle');
}
// For the static checks: a pattern is decoration, no words reach it and it is not a fill (text on it reads on what is under it).
export const decoration = true;

export function render(c, p, env) {
  const b = env.box;
  return c.backdrop({ x: b.x ?? 0, y: b.y ?? 0, w: b.w ?? c.W, h: b.h ?? c.H, pattern: p.pattern, colour: p.colour, second: p.second, scale: p.scale, density: p.density, opacity: p.opacity, angle: p.angle, seed: p.seed, mask: p.mask, at: p.at, radius: p.radius, corners: p.radius !== undefined && p.corners !== 'all' ? p.corners : undefined, z: env.z });
}
