// Primitive: a straight ribbon across one corner of the page, at 45 degrees (the band of an "applications open" or "new" corner), in a
// colour role, with an optional thin stripe of a second role on its corner side. Decoration only: it carries no words. Its geometry is
// computed here from bounded whole numbers (a clipped box, kit c.box clip); the look gives only the corner, two distances and the roles.
import { en, int, role } from '../../look-desc.mjs';

export const RIBBON_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
export const SPEC = {
  label: 'Corner ribbon', group: 'Shapes', help: 'A straight band across one corner of the page at 45 degrees, with an optional thin stripe of a second colour on its corner side. Carries no words.',
  placement: 'none', flow: false, container: null, text: false,
  own: {
    corner: en(RIBBON_CORNERS, 'Corner', 'Which corner of the page it crosses.', 'top-right'),
    at: int(40, 480, 'Distance', 'Pixels from the corner, along each edge, to the ribbon\'s near side.', 160),
    w: int(16, 200, 'Width', 'How wide the ribbon is, measured along each edge, in pixels.', 72),
    colour: role('Colour', 'The ribbon colour.', 'primary'),
    edge: role('Stripe colour', 'A thin stripe of a second colour on the ribbon\'s corner side; leave out for none.'),
    edgeW: int(4, 40, 'Stripe width', 'How wide the stripe is, measured along each edge, in pixels.', 14),
  },
  common: ['z', 'when'],
  required: [],
};

// The ribbon as one or two clipped boxes in the corner square that holds it.
export function render(c, p, env) {
  const at = p.at ?? 160, w = p.w ?? 72, corner = p.corner ?? 'top-right';
  const ew = p.edge !== undefined ? Math.min(p.edgeW ?? 14, at) : 0;
  const S = at + w, right = corner.endsWith('right'), bottom = corner.startsWith('bottom');
  // a band from distance a to b off the corner, in the square's own pixels, mirrored for the corner
  const band = (a, b, colour) => {
    const pts = [[a, 0], [b, 0], [0, b], [0, a]].map(([x, y]) => [right ? S - x : x, bottom ? S - y : y]);
    return c.box({ x: right ? c.W - S : 0, y: bottom ? c.H - S : 0, w: S, h: S, fill: colour, clip: pts, z: env.z });
  };
  return band(at, at + w, p.colour ?? 'primary') + (ew ? band(at - ew, at, p.edge) : '');
}
