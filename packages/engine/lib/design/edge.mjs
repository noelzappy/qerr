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
