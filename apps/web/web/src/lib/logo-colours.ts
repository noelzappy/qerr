// The main colours of a logo, read in the browser from its pixels with a canvas (no library, nothing sent anywhere): the one module
// for Brand and look, Colours (the logo's colours offered as swatches) and the guided setup's logo step (a first guess at the four
// colours). `paletteFromPixels` is plain arithmetic on RGBA bytes (tested without a browser); `logoPalette` and `coloursOfImage` draw
// a picture on a canvas first.
//
// How: opaque pixels only (a transparent PNG's edges are half see-through and would add muddy in-between colours), white left out
// unless asked for (the paper a logo sits on, not a brand colour; the setup keeps it for its light colour), the rest counted in coarse
// buckets, then the biggest buckets taken in turn, skipping any too close to one already taken.

export interface Colours { primary: string; accent: string; dark: string; light: string }

const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

// Saturation and lightness (HSL) of a colour, 0 to 1.
export function satLight(h: string): { s: number; l: number; hue: number } {
  const [r, g, b] = rgbOf(h).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d) hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { s, l, hue: (hue * 60 + 360) % 360 };
}

export interface PaletteOptions { max?: number; minShare?: number; minDistance?: number; keepWhite?: boolean }

const hex2 = (v: number) => Math.round(v).toString(16).padStart(2, '0');
const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
const distance = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

export function paletteFromPixels(data: ArrayLike<number>, { max = 6, minShare = 0.01, minDistance = 56, keepWhite = false }: PaletteOptions = {}): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let counted = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    if (a < 200) continue;
    if (!keepWhite && r > 240 && g > 240 && b > 240) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const k = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    k.n++; k.r += r; k.g += g; k.b += b;
    buckets.set(key, k);
    counted++;
  }
  if (!counted) return [];
  const ranked = [...buckets.values()].filter((k) => k.n / counted >= minShare).sort((x, y) => y.n - x.n).map((k) => [k.r / k.n, k.g / k.n, k.b / k.n]);
  const picked: number[][] = [];
  for (const c of ranked) {
    if (picked.length >= max) break;
    if (picked.every((p) => distance(p, c) >= minDistance)) picked.push(c);
  }
  return picked.map((c) => toHex(c[0]!, c[1]!, c[2]!));
}

// The palette of a picture at an address of the app (same origin, so the canvas may read it). Drawn at most 200 pixels wide: enough
// to count colours, quick on a phone. Rejects when the picture cannot be loaded or read.
export async function logoPalette(src: string, opts?: PaletteOptions): Promise<string[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('The logo could not be read'));
    i.src = src;
  });
  const scale = Math.min(1, 200 / Math.max(1, img.naturalWidth));
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('The logo could not be read');
  g.drawImage(img, 0, 0, w, h);
  return paletteFromPixels(g.getImageData(0, 0, w, h).data, opts);
}

// The guided setup's reading: the same palette with white kept, at least 2% of the pixels each, the colours (saturation over 0.25)
// before the greys, most used first.
export function dominantColours(data: ArrayLike<number>, opts: { max?: number; minShare?: number } = {}): string[] {
  const found = paletteFromPixels(data, { max: 64, minShare: opts.minShare ?? 0.02, keepWhite: true });
  const coloured = found.filter((h) => { const c = satLight(h); return c.s > 0.25 && c.l > 0.08 && c.l < 0.95; });
  return [...coloured, ...found.filter((h) => !coloured.includes(h))].slice(0, opts.max ?? 6);
}

// A first guess at the four colours from what the logo holds: the most used colour is the primary, the next one of a clearly
// different hue the accent, a near-black the dark one and a near-white the light one. A role the logo has nothing for keeps the
// colour it had.
export function guessRoles(found: string[], current: Colours): Colours {
  const info = found.map((h) => ({ h, ...satLight(h) }));
  const coloured = info.filter((x) => x.s > 0.25 && x.l > 0.12 && x.l < 0.9);
  const primary = coloured[0]?.h ?? current.primary;
  const p = satLight(primary);
  const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const accent = coloured.find((x) => x.h !== primary && hueGap(x.hue, p.hue) > 20)?.h ?? current.accent;
  const dark = info.find((x) => x.l < 0.2)?.h ?? current.dark;
  const light = info.find((x) => x.l > 0.9)?.h ?? current.light;
  return { primary, accent, dark, light };
}

// The colours of an image file, read with a canvas at a small size (enough for the main colours, quick on a phone).
export async function coloursOfImage(file: Blob, max = 6): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('The picture could not be read'));
      i.src = url;
    });
    const scale = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return [];
    g.drawImage(img, 0, 0, w, h);
    return dominantColours(g.getImageData(0, 0, w, h).data, { max });
  } finally {
    URL.revokeObjectURL(url);
  }
}
