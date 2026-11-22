// Primitive: the first part of the headline repeated as outline rows, the emphasised phrase once, solid, in the middle (kit echoStack).
import { field, int } from '../../look-desc.mjs';

export const SPEC = {
  label: 'Repeated headline', group: 'Text', help: 'The first part of the headline repeated as outline rows, the emphasised phrase once, solid, in the middle.',
  placement: 'required', flow: true, container: null, text: true, fitted: true,
  own: {
    field: field(['headline'], 'Field', 'The headline.', 'headline'), rmin: int(2, 7, 'Fewest rows', 'The fewest rows.', 3), rmax: int(2, 9, 'Most rows', 'The most rows.', 7),
    cap: int(40, 400, 'Largest', 'The largest a line may be, in pixels.'), floor: int(24, 300, 'Smallest', 'Below this the image is refused, in pixels.'), outline: int(2, 4, 'Outline', 'Outline width in pixels.', 3),
  },
  common: ['place', 'z', 'when', 'ink', 'grow', 'minH', 'before'],
  required: ['cap', 'floor'],
};

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export function render(c, p, env) {
  const { pre, phrase, post } = c.emphasisParts(p.field);
  const both = pre && phrase, solid = both ? [phrase, post].filter(Boolean).join(' ') : [pre, phrase, post].filter(Boolean).join(' '), echo = both ? pre : solid;
  const auto = env.box.flow && p.grow;
  return c.echoStack(clean({
    ...env.box, w: env.box.w ?? env.innerW, h: auto ? 'auto' : env.box.h, cap: p.cap, floor: p.floor, lead: 1, track: env.tokens.type.display.track, colour: env.ink, rmin: p.rmin, rmax: p.rmax, outline: p.outline,
    pre: c.m`${echo}`, html: c.m`<em data-role="accent">${solid}</em>`, nudge: env.nudge ?? (env.box.x !== undefined ? undefined : undefined),
  }));
}
