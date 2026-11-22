// Does a photo have a plain background at its top and sides, so that it can run into the page without a seam? Judged from the
// pixels of three strips (the top edge, and the left and right edges near the top) as the photo is shown. A pure function, so
// the rule is tested without Chrome; the page script (runtime.mjs) is built from this very source, so the two cannot drift.
//
// "Plain" means the strips are one colour to the eye: each pixel is close to the strip's mean (a few CIE76 delta-E units, which
// is photo grain; it may wander slowly along the edge, as studio light does), and the side strips are the same colour as the top.
// When that holds the page takes the edge's own colour, column by column, so the photo's top edge meets it exactly and the photo
// is drawn with no fade or blend; a real scene (people, a street, hard shadows) is not plain and is placed as a full-bleed band instead
// (see poster.mjs). A flat page colour would show a band wherever the photo's light drifts, so the page follows the edge.

// Calibrated on design/assets/photos (see test-design-edge.mjs): the studio object shots are under every limit, the scenes
// (market, street, people, food and cloth close-ups) are over at least one, most of them by a wide margin.
export const EDGE_LIMITS = { grain: 3.5, drift: 8, shift: 8 };

// regions: { top, topWidth, left, right }, each strip the RGBA bytes (Uint8ClampedArray or array) of one strip; topWidth is the
// top strip's width in pixels (its rows are read from it).
// Returns { rgb, columns, grain, drift, shift, uniform }: rgb is the top strip's mean colour, columns the mean colour of each of
// twelve columns of it (what the page takes, see runtime.mjs flush); grain the mean delta-E
// of its pixels from that mean (texture); drift how far the colour wanders along the edge, the largest delta-E between that mean
// and the mean of one of twelve columns of the strip (a soft lighting gradient: grain is invisible against a flat page, but a
// drift of two or three units shows as a line where the photo meets the page); shift the larger delta-E between the top strip's
// mean and a side strip's mean.
export function classifyEdge(regions, limits = EDGE_LIMITS) {
  const lab = (r, g, b) => {
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const R = lin(r), G = lin(g), B = lin(b);
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const x = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047), y = f(0.2126729 * R + 0.7151522 * G + 0.072175 * B), z = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const mean = (d) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let k = 0; k + 3 < d.length; k += 4) { r += d[k]; g += d[k + 1]; b += d[k + 2]; n++; }
    return n ? [r / n, g / n, b / n] : [0, 0, 0];
  };
  const t = mean(regions.top), tl = lab(t[0], t[1], t[2]);
  let grain = 0, n = 0;
  for (let k = 0; k + 3 < regions.top.length; k += 4) { grain += dE(lab(regions.top[k], regions.top[k + 1], regions.top[k + 2]), tl); n++; }
  grain = n ? grain / n : 0;
  const cols = 12, w = Math.max(1, regions.topWidth | 0), sums = Array.from({ length: cols }, () => [0, 0, 0, 0]);
  for (let k = 0, i = 0; k + 3 < regions.top.length; k += 4, i++) {
    const c = sums[Math.min(cols - 1, Math.floor(((i % w) / w) * cols))];
    c[0] += regions.top[k]; c[1] += regions.top[k + 1]; c[2] += regions.top[k + 2]; c[3]++;
  }
  const used = sums.filter((c) => c[3]), columns = used.map((c) => [c[0] / c[3], c[1] / c[3], c[2] / c[3]].map(Math.round));
  const drift = Math.max(0, ...columns.map((c) => dE(lab(c[0], c[1], c[2]), tl)));
  const side = (d) => { const m = mean(d); return dE(lab(m[0], m[1], m[2]), tl); };
  const shift = Math.max(side(regions.left), side(regions.right));
  const uniform = n > 0 && grain <= limits.grain && drift <= limits.drift && shift <= limits.shift;
  return { rgb: t.map(Math.round), columns, grain, drift, shift, uniform };
}

// ---- the page colour from the picture (a look's colour.fromPicture: "auto" or "picture") ----
// Where classifyEdge asks "is the edge one flat colour, so the photo can meet the page with no blend at all", pictureEdge asks "does the
// picture HAVE a background colour along its top and sides, and how plain is it". The strips are cut into segments (eight along the top,
// six down each side); the background is the colour most segments agree on (within `dominant` delta-E of one segment), the mean of
// those segments. share is the part of the segments that agree; grain the mean delta-E of the agreeing segments' pixels from the colour;
// spread the largest delta-E of an agreeing segment from it. A page that takes the colour shows the picture whole; when the edge is not
// plain (every segment agrees, with no visible grain or drift) the picture's edges fade softly into exactly this colour, never another.
// Calibrated on studio pictures and scenes (test-design-edge.mjs): a picture on a studio colour (pegs on orange, a coin on red, coins
// on lilac) is "auto"; a scene (a market, a street, a pile of fruit) is neither.
export const PICTURE_LIMITS = { dominant: 10, plain: { grain: 2.5, spread: 1.5 }, auto: { share: 0.75, grain: 7 }, picture: { share: 0.6, grain: 12 } };
// regions: { top, topWidth, left, right, sideWidth } RGBA bytes; left and right are sideWidth pixels wide.
// Returns { rgb, share, grain, spread, plain, auto, picture }: auto and picture say whether the mode of that name takes the colour.
export function pictureEdge(regions, limits = PICTURE_LIMITS) {
  const lab = (r, g, b) => {
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const R = lin(r), G = lin(g), B = lin(b);
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const x = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047), y = f(0.2126729 * R + 0.7151522 * G + 0.072175 * B), z = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const segs = [];
  const cut = (data, w, count, along) => {
    const len = data ? data.length : 0, out = Array.from({ length: count }, () => ({ s: [0, 0, 0], n: 0, data, idx: [] }));
    const rows = Math.max(1, Math.floor(len / 4 / w));
    for (let k = 0, i = 0; k + 3 < len; k += 4, i++) {
      const pos = along === 'x' ? (i % w) / w : Math.floor(i / w) / rows;
      const seg = out[Math.min(count - 1, Math.floor(pos * count))];
      seg.s[0] += data[k]; seg.s[1] += data[k + 1]; seg.s[2] += data[k + 2]; seg.n++; seg.idx.push(k);
    }
    for (const g of out) if (g.n) segs.push(g);
  };
  const tw = Math.max(1, regions.topWidth | 0), sw = Math.max(1, regions.sideWidth | 0);
  cut(regions.top, tw, 8, 'x'); cut(regions.left, sw, 6, 'y'); cut(regions.right, sw, 6, 'y');
  if (!segs.length) return { rgb: null, share: 0, grain: Infinity, spread: Infinity, plain: false, auto: false, picture: false };
  for (const g of segs) { g.rgb = g.s.map((v) => v / g.n); g.lab = lab(g.rgb[0], g.rgb[1], g.rgb[2]); }
  // the segment most others agree with, then the mean of those that agree with it
  let best = segs[0], bestN = -1;
  for (const g of segs) { const n = segs.filter((h) => dE(g.lab, h.lab) <= limits.dominant).length; if (n > bestN) { best = g; bestN = n; } }
  const agree = segs.filter((h) => dE(best.lab, h.lab) <= limits.dominant), tot = agree.reduce((t, g) => t + g.n, 0);
  const rgb = [0, 1, 2].map((c) => agree.reduce((t, g) => t + g.rgb[c] * g.n, 0) / tot), L = lab(rgb[0], rgb[1], rgb[2]);
  let grain = 0, n = 0;
  for (const g of agree) for (const k of g.idx) { grain += dE(lab(g.data[k], g.data[k + 1], g.data[k + 2]), L); n++; }
  grain = n ? grain / n : Infinity;
  const spread = Math.max(...agree.map((g) => dE(g.lab, L))), share = agree.length / segs.length;
  const plain = share === 1 && grain <= limits.plain.grain && spread <= limits.plain.spread;
  const auto = plain || (share >= limits.auto.share && grain <= limits.auto.grain);
  return { rgb: rgb.map(Math.round), share, grain, spread, plain, auto, picture: auto || (share >= limits.picture.share && grain <= limits.picture.grain) };
}

// The colours of a page that takes the picture's colour `bg` ([r, g, b]); every one a computed number. roles: the palette's colours as
// [r, g, b] ({ ink, white, accentType, field, primary, accent, gold }); need: { text, accent, label }, the contrast each kind of type must
// reach on the page (the renderer's targets; the page checks still measure every text on its real pixels afterwards).
// Returns null when no type reaches need.text on the colour (the page then keeps the brand colour), else
// { light, ink, body, muted, accent, accentFrom, field, onField, soft, ratio }:
// - ink: the ink or the white, the higher contrast of the two when both reach the target, else the ink deepened toward black until it does;
// - body, muted: from the page toward the type until each reaches its target (solid mixes, so the page measures what it draws);
// - accent (the emphasis): a deeper shade of the picture's own hue on a light page, a lighter one on a dark page, moved no further than it
//   must to reach need.accent (accentFrom "picture"); a picture without a hue (white, grey) or none that reaches it: the first brand colour
//   that reaches it (accentType, field, primary, accent, gold: "brand"); else the type ("ink");
// - field, onField: a pill's fill (the emphasis colour) and its type (the page colour, the white, the ink or black, whichever reads best;
//   both null when none reaches need.label, and the pill keeps the brand's colours);
// - soft: the surface of a pill or a card that carries the page's type (a label pill, a panel): the page colour moved toward white (a
//   little on a dark page, so the light type still reads; more on a light one), as far as the type still reaches need.text on it, or the
//   page colour itself.
export function pictureColours(bg, roles, need) {
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const margin = 1.02, T = (+need.text || 4.5) * margin, A = (+need.accent || 4.5) * margin, Lb = (+need.label || 4.5) * margin;
  const ink = roles.ink, white = roles.white || [255, 255, 255], black = [0, 0, 0];
  const ri = ratio(ink, bg), rw = ratio(white, bg);
  let type = null, light = false;
  if (ri >= T || rw >= T) { light = rw > ri; type = light ? white : ink; }
  else for (let k = 1; k <= 10 && !type; k++) { const d = mix(ink, black, k / 10); if (ratio(d, bg) >= T) type = d; }
  if (!type) return null;
  const toward = (k0, target) => { for (let k = k0; k < 1; k += 0.02) { const c = mix(bg, type, k); if (ratio(c, bg) >= target) return c; } return type; };
  const body = toward(0.8, T), muted = toward(0.62, Lb);
  const hsl = (c) => {
    const [r, g, b] = c.map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, d / (1 - Math.abs(2 * l - 1)), l];
  };
  const rgbOf = (h, s, l) => {
    const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - C / 2;
    const p = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
    return p.map((v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255));
  };
  const [h, s, l] = hsl(bg);
  let accent = null, accentFrom = 'ink';
  if (s >= 0.12) {
    const sat = Math.max(s, 0.55);
    for (let k = 1; k <= 40 && !accent; k++) {
      const c = rgbOf(h, sat, light ? l + (1 - l) * (k / 40) : l * (1 - k / 40));
      if (ratio(c, bg) >= A) { accent = c; accentFrom = 'picture'; }
    }
  }
  if (!accent) for (const c of [roles.accentType, roles.field, roles.primary, roles.accent, roles.gold]) if (c && ratio(c, bg) >= A) { accent = c; accentFrom = 'brand'; break; }
  if (!accent) accent = type;
  const onField = [bg, white, ink, black].reduce((a, c) => (ratio(c, accent) > ratio(a, accent) ? c : a));
  const fieldOk = ratio(onField, accent) >= Lb;
  let soft = bg;
  for (const k of light ? [0.14, 0.1, 0.06] : [0.55, 0.4, 0.25]) { const c = mix(bg, white, k); if (ratio(type, c) >= T) { soft = c; break; } }
  return { light, ink: type, body, muted, accent, accentFrom, field: fieldOk ? accent : null, onField: fieldOk ? onField : null, soft, ratio: ratio(type, bg) };
}
