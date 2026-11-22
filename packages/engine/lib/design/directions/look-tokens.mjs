// The tokens of a look: the same object shape a direction's tokens.mjs holds (margins, grid, frame, fonts per role, type scale, device
// values, variants), worked out from a NORMALISED look (look.mjs normaliseLook) so that the kit, the font embedding and the four post checks
// run unchanged for a look written as data. Pure apart from the font manifest. Nothing here reads a string from the look except through the
// fixed tables below (font roles, folio kinds) and the font library's own entries.
import { familyOf } from '../font-library.mjs';

const pad2 = (n) => String(n).padStart(2, '0');
const FOLIO = {
  no: () => '',
  pad2: (n) => pad2(n),
  'pad2-of-total': (n, total) => (total ? `${pad2(n)}/${pad2(total)}` : pad2(n)),
};
const BRAND_FONT = { display: ['display', '--display'], label: ['label', '--label'], sans: ['family', '--font'], mono: ['mono', '--mono'] };
const DEFAULT_METRICS = Object.freeze({ asc: 1, desc: 0.3, cap: 0.7 });
const GENERIC = "'Helvetica Neue',Arial,sans-serif";

// One font role of the look -> { family, fallback, faces, metrics, brandVar? }
function fontOf(spec, role, brand, weights) {
  if (spec.source === 'brand') {
    const [key, cssVar] = BRAND_FONT[spec.role];
    return { family: String(brand?.font?.[key] ?? 'sans-serif'), fallback: GENERIC, faces: [], metrics: DEFAULT_METRICS, brandVar: cssVar };
  }
  const fam = familyOf(spec.family);
  if (!fam) throw new Error(`look: the font family for ${role} is not in the font library`);
  const faces = [{ style: 'normal', weights: weights ?? spec.weights }];
  if (spec.italic) faces.push({ style: 'italic', weights: weights ?? spec.weights });
  return { family: fam.family, fallback: fam.fallback ?? GENERIC, faces, metrics: fam.metrics ?? DEFAULT_METRICS, ...(spec.stretch ? { stretch: spec.stretch } : {}) };
}

export function tokensFromLook(look, brand) {
  const f = look.canvas.feed, m = f.margin, T = look.type, D = look.devices, tilt = look.dials?.tilt ?? 1;
  const fonts = {};
  for (const role of ['display', 'text', 'label', 'mono']) fonts[role] = fontOf(look.fonts[role] ?? look.fonts.label, role, brand);
  const angles = Object.fromEntries(Object.entries(D.angles ?? {}).map(([k, v]) => [k, +(v * tilt).toFixed(4)]));
  const frame = { t: D.frame?.t ?? 0, pad: D.frame?.pad ?? 0 };
  // the inner edge of text on a framed page is a grid line too
  const extra = [...(f.extraLines ?? []), ...(frame.t > 0 ? [frame.t + frame.pad] : [])];
  const labelFamily = T.label.role === 'mono' ? 'mono' : 'label';
  const shift = look.dials?.weightShift ?? 0;
  const w = (v) => Math.min(900, Math.max(100, Math.round(v + shift)));
  return Object.freeze({
    name: look.id,
    margin: Object.freeze({ left: m.left, right: m.right, top: m.top, bottom: m.bottom }),
    grid: Object.freeze({ cols: f.grid.cols, gutter: f.grid.gutter, rows: f.grid.rows }),
    extraLines: Object.freeze([...new Set(extra)]),
    frame: Object.freeze(frame),
    fonts: Object.freeze(fonts),
    metrics: Object.freeze({ display: fonts.display.metrics, text: fonts.text.metrics }),
    type: Object.freeze({
      display: { min: 0, max: 0, lead: T.display.lead, track: T.display.track, weight: w(T.display.weight) },
      body: { size: T.body.size, lead: +(T.body.lead * T.body.size).toFixed(3), weight: w(T.body.weight) },
      item: { size: T.item.size, lead: T.item.lead, weight: w(T.item.weight) },
      label: { size: T.label.size, lead: 1.2, track: T.label.track, weight: w(T.label.weight), upper: T.label.upper, family: labelFamily },
      numeral: { track: T.numeral.track },
    }),
    device: Object.freeze({ rot: Object.freeze(angles), step: T.display.ladder }),
    variants: Object.freeze({}),
    grain: Object.freeze({ freq: 0.9, strength: 0.4 }),
    folio: FOLIO[D.folio ?? 'no'] ?? FOLIO.no,
    logoHeight: look.logo?.height ?? 44,
  });
}

// The font faces a composition's elements use: per font role the union of the weights its elements set (the look's own, with the weight
// shift), and the italic when the look declares it. Merged by family and style (the font manifest embeds one file per family, style and subset).
export function fontNeedsFor(look, usage, brand) {
  const tokens = tokensFromLook(look, brand), need = new Map();
  for (const [role, weights] of Object.entries(usage)) {
    const f = tokens.fonts[role];
    if (!f || f.brandVar) continue;
    for (const face of f.faces) {
      const ws = [...new Set([...weights])].filter((x) => face.weights.some((y) => Math.abs(y - x) < 1) || true);
      const key = `${f.family}|${face.style}`;
      need.set(key, { family: f.family, style: face.style, weights: [...new Set([...(need.get(key)?.weights ?? []), ...ws])].sort((a, b) => a - b) });
    }
  }
  return [...need.values()];
}
