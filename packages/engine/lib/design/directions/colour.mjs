// The colours of a post, worked out from the brand's own roles (never literals): its light and dark grounds, its ink, its primary
// colour and its accent. Neutrals derive from the brand's dark and light; a colour that has to carry type is chosen, or deepened a
// step at a time, until it meets the brand's own contrast target. Every result is a #rrggbb string computed here from checked brand
// colours, written to the page as CSS custom properties (--c-*) on the post's root element.
import { contrastRatio, luminance } from '../checks.mjs';

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex) => luminance(...rgbOf(hex));
export const contrast = (a, b) => contrastRatio(lum(a), lum(b));
const hexOf = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
// t of the way from a to b.
export const mix = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return hexOf(x.map((v, i) => v + (y[i] - v) * t)); };
export const rgba = (hex, a) => `rgba(${rgbOf(hex).join(',')},${+a.toFixed(3)})`;

// The distance between two colours as a person sees it (CIE76 on CIELAB, D65): 0 is the same colour, about 2 is just noticeable.
export function deltaE(a, b) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lab = (hex) => {
    const [r, g, bl] = rgbOf(hex).map(lin), f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047), y = f(0.2126 * r + 0.7152 * g + 0.0722 * bl), z = f((0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const p = lab(a), q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
// How far the brand's accent may be moved toward the ink to carry type on paper before it is no longer the brand's accent.
export const ACCENT_TYPE_MAX_SHIFT = 32;

// Of the candidates, the first that reaches `need` on `bg`; else the one with the most contrast.
export function readable(bg, candidates, need) {
  let best = candidates[0], bestC = 0;
  for (const c of candidates) { const k = contrast(c, bg); if (k >= need) return c; if (k > bestC) { best = c; bestC = k; } }
  return best;
}

// A fill that carries `onto` type at `need`: the colour itself, else moved toward `toward` until it does (at most 24 steps).
export function deepen(colour, onto, toward, need) {
  let c = colour;
  for (let i = 1; i <= 24 && contrast(c, onto) < need; i++) c = mix(colour, toward, i / 24);
  return c;
}

// The ground and ink roles every derivation starts from: the brand's light ground is the paper (a brand whose "light" is dark keeps it and
// its inverse text becomes the ink).
function baseRoles(brand) {
  const light = brand.grounds.light, ink = brand.text.ink;
  const paperIsLight = lum(light) > lum(ink);
  return { paper: light, black: paperIsLight ? ink : brand.text.inverse, white: paperIsLight ? light : brand.text.inverse };
}

// The accent as TYPE on paper (an italic phrase, a numeral): the brand's gold moved toward the ink until it reads at the brand's accent
// target (with a little margin for the page's grain). When that moves it visibly (a light accent such as lime or yellow turns olive and
// muddy), the type is set in the ink instead and the accent stays a hairline or a fill. Returns { colour, ink, shift }.
function accentTypeOf(brand, { paper, black }) {
  const gold = brand.accents.gold, need = Math.max(3, Number(brand.contrast?.accent) || 4.5) * 1.08;
  const shifted = deepen(gold, paper, black, need), shift = deltaE(gold, shifted), ink = shift > ACCENT_TYPE_MAX_SHIFT;
  return { colour: ink ? black : shifted, ink, shift };
}

// The CONTRACT of a post's palette is two separate functions:
//  - palette(brand, need): COLOUR ROLES ONLY. Every value is a string, either `#rrggbb` or `rgba(r,g,b,a)`; each one becomes a custom
//    property (--c-*) on the page's root through paletteCss(), and a composition names one by its role. brand: the normalised brand.
//    need: the strictest text contrast (the brand's headline target).
//  - paletteFacts(brand): the non-colour facts the derivation found along the way, a small fixed set (below), which a composition may read
//    to decide something but which never reach the page: { accentInk: boolean, accentShift: number }.
export function palette(brand, need = 7) {
  const dark = brand.grounds.dark, primary = brand.accents.primary;
  const gold = brand.accents.gold, goldDeep = brand.accents.goldDeep;
  const { paper, black, white } = baseRoles(brand);
  // the deep field: the primary colour, deepened toward the ink until the paper colour reads on it
  // the brand's primary is the field as it is whenever the light or the ink reads on it at the target; it is deepened only when neither does
  const field = Math.max(contrast(white, primary), contrast(black, primary)) >= need ? primary : deepen(primary, white, black, need);
  const onField = readable(field, [white, black], need);
  const accentText = readable(paper, [gold, goldDeep, primary, black], 4.5);
  const accentOnDark = readable(dark, [gold, goldDeep, white], 4.5);
  // the accent as a fill, and the type that sits on it
  const onAccent = readable(gold, [black, white], Math.min(need, 4.5));
  const onPrimary = readable(primary, [white, black], 4.5);
  return {
    accentType: accentTypeOf(brand, { paper, black }).colour, bodyOnField: mix(field, onField, 0.88),
    paper, ink: black, white, dark, primary, field, onField, gold, goldDeep, accentText, accentOnDark, onAccent, onPrimary,
    // body text: the ink at 80% on paper (a solid mix, so the page measures the colour it draws)
    body: mix(paper, black, 0.8), soft: mix(paper, black, 0.06), muted: mix(paper, black, 0.62),
    // the same on a dark ground
    bodyOnDark: mix(dark, white, 0.8), mutedOnDark: mix(dark, white, 0.62),
    rule: rgba(black, 0.55), ruleSoft: rgba(black, 0.2), ruleOnDark: rgba(white, 0.55), ruleOnField: rgba(onField, 0.55),
    ...extraRoles({ paper, black, white, field, onField, primary }, need),
  };
}

// The non-colour facts of a palette (see the contract above). accentInk: true when the brand's accent cannot carry type on paper without
// being moved so far it is no longer the brand's accent (so the type is set in the ink and the accent stays a fill). accentShift: how far
// (CIE76 delta E) the accent would have to move to carry type on paper; accentInk is accentShift above ACCENT_TYPE_MAX_SHIFT.
export function paletteFacts(brand) {
  const a = accentTypeOf(brand, baseRoles(brand));
  return { accentInk: a.ink, accentShift: a.shift };
}

// The palette as the custom properties a post's root carries.
export const paletteCss = (p) => Object.entries({
  paper: p.paper, ink: p.ink, white: p.white, dark: p.dark, primary: p.primary, field: p.field, 'on-field': p.onField, gold: p.gold, 'gold-deep': p.goldDeep,
  accent: p.accentText, 'accent-dark': p.accentOnDark, 'on-accent': p.onAccent, 'on-primary': p.onPrimary, body: p.body, soft: p.soft, muted: p.muted,
  'body-dark': p.bodyOnDark, 'muted-dark': p.mutedOnDark, rule: p.rule, 'rule-soft': p.ruleSoft, 'rule-dark': p.ruleOnDark, 'rule-field': p.ruleOnField,
  'accent-type': p.accentType, 'body-field': p.bodyOnField,
  'field-deep': p.fieldDeep, 'paper-warm': p.paperWarm, 'light-tint': p.lightTint, 'field-text': p.fieldText,
}).map(([k, v]) => `--c-${k}:${v}`).join(';');

// ---- additions for the retail direction (generic: any direction may use them) ----
// The on-colour of a field: of `light` and `dark`, the one with more measured contrast on `bg` (so a light and a dark field each get the
// type that reads on it); never a guess from the colour's name.
export const onColour = (bg, light, dark) => (contrast(light, bg) >= contrast(dark, bg) ? light : dark);
// A text-safe version of a colour on a ground: the colour itself when it reaches `need` there, else moved toward `toward` a step at a
// time until it does (the field colour as type on paper; never the accent, which stays a fill).
export const textSafe = (colour, ground, toward, need = 4.5) => deepen(colour, ground, toward, need);
// The roles retail draws with, derived from the brand's own: a deeper field (hard shadows, the hole of a price tag), a warm paper
// (a photo card), a light ground tinted with the field (every second row of a list), the field as type on paper.
function extraRoles({ paper, black, white, field, primary }, need) {
  return {
    fieldDeep: mix(field, black, 0.2), paperWarm: mix(paper, '#ffffff', 0.45), lightTint: mix(paper, field, 0.12),
    fieldText: textSafe(primary, paper, black, Math.min(need, 4.5)),
  };
}

// ======== accent placement by measured contrast (added for the swiss direction; generic, used by any direction that sets its accent as large type) ========
// Where a brand's accent may go on a page: a FIELD (a block, a bar) always; TYPE only where the accent reaches the brand's own text target
// on that ground. Nothing is washed out: the accent is used as it is or not as type at all. `pal` is palette(brand); the brand's targets are
// brand.contrast (headline: display numerals and headlines; accent: an emphasised phrase; label: small mono type).
// Returns { accent, display: { paper, dark }, accent_: { paper, dark } (booleans: may the accent be type of that kind on that ground),
//   onFill: { colour, ok } (the type that sits on an accent block: whichever of the light and the ink reaches the accent target),
//   mutedPaper, mutedDark (label greys that reach the label target), need: { display, accent, label } }.
export function accentPlan(brand, pal, margin = 1.02) {
  const t = brand.contrast ?? {};
  const need = { display: Number(t.headline) || 7, accent: Number(t.accent) || 4.5, label: Number(t.label) || 4.5 };
  const accent = pal.primary, may = (bg, n) => contrast(accent, bg) >= n * margin;
  const fillText = readable(accent, [pal.white, pal.ink], need.accent * margin);
  // a label grey: the ink moved toward the ground's opposite from 62% until it reaches the label target
  const grey = (bg, fg) => { let k = 0.62, c = mix(bg, fg, k); for (; k < 1 && contrast(c, bg) < need.label * margin; k += 0.02) c = mix(bg, fg, k); return c; };
  return {
    accent, need,
    display: { paper: may(pal.paper, need.display), dark: may(pal.dark, need.display) },
    word: { paper: may(pal.paper, need.accent), dark: may(pal.dark, need.accent) },
    onFill: { colour: fillText, ok: contrast(fillText, accent) >= need.accent * margin },
    mutedPaper: grey(pal.paper, pal.ink), mutedDark: grey(pal.dark, pal.white),
  };
}
