// The brand's photo treatment (brand.json style.photo) applied to pixels, the way brand.css draws it over a photograph, so that
// a poster page that takes its colour from a photo's plain background takes the colour the photo is drawn in, not the colour of
// its raw file. A pure function, so it is tested without Chrome; the page script (runtime.mjs) is built from this very source and
// runs it on the strips it reads before it judges the edge (edge.mjs), so the two cannot drift.
//
// What brand.css draws (all in sRGB, as Chrome composites), for a brand colour C, shadows Lo, highlights Hi and strength k:
//   tint     a layer of C with mix-blend-mode: color at opacity k: (1 - k) P + k SetLum(C, Lum(P))
//   overlay  a layer of C at opacity k: (1 - k) P + k C
//   duotone  the photo in grey (grayscale(1) contrast(1.08)) multiplied into Hi, then Lo with mix-blend-mode: lighten
//            (strength is not used)
// The colour blend is the W3C compositing one (Lum with 0.3, 0.59, 0.11; ClipColor); the grey is the filter's (0.2126, 0.7152,
// 0.0722), stretched about the middle by 1.08 and clamped.

export const TREATED = ['tint', 'duotone', 'overlay'];

// data: RGBA bytes (Uint8ClampedArray or array). t: { treatment, strength, colour, shadows, highlights }, each colour [r, g, b]
// (0 to 255). Returns new RGBA bytes with the treatment applied (alpha kept), or the same data when there is no treatment.
export function treatPixels(data, t) {
  const kind = t && t.treatment;
  if (kind !== 'tint' && kind !== 'duotone' && kind !== 'overlay') return data;
  const unit = (c) => (Array.isArray(c) && c.length === 3 ? c.map((v) => Math.min(255, Math.max(0, Number(v) || 0)) / 255) : [0, 0, 0]);
  const k = Math.min(1, Math.max(0, Number(t.strength) || 0)), C = unit(t.colour), lo = unit(t.shadows), hi = unit(t.highlights);
  const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const setLum = (c, l) => {
    const d = l - lum(c);
    let o = c.map((v) => v + d);
    const L = lum(o);
    if (Math.min(...o) < 0) { const n = Math.min(...o); o = o.map((v) => L + ((v - L) * L) / (L - n)); }
    if (Math.max(...o) > 1) { const x = Math.max(...o); o = o.map((v) => L + ((v - L) * (1 - L)) / (x - L)); }
    return o;
  };
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i + 3 < data.length; i += 4) {
    const p = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
    let q;
    if (kind === 'overlay') q = p.map((v, j) => v * (1 - k) + C[j] * k);
    else if (kind === 'tint') { const b = setLum(C, lum(p)); q = p.map((v, j) => v * (1 - k) + b[j] * k); }
    else {
      const g = Math.min(1, Math.max(0, (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] - 0.5) * 1.08 + 0.5));
      q = hi.map((h, j) => Math.max(g * h, lo[j]));
    }
    out[i] = Math.round(q[0] * 255); out[i + 1] = Math.round(q[1] * 255); out[i + 2] = Math.round(q[2] * 255); out[i + 3] = data[i + 3];
  }
  return out;
}
