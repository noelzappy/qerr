// The colours of an uploaded logo, read in the browser with a canvas (no library): the few colours that cover most of the
// opaque pixels, near-greys and near-whites last, and a first guess at which one is the primary, accent, dark and light colour.
// The guess is only a suggestion the person confirms or changes on the logo step.

export interface Colours { primary: string; accent: string; dark: string; light: string }

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
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

// RGBA pixels (as a canvas gives them) to their main colours: pixels are grouped in buckets of 32 levels per channel, mostly
// transparent ones are ignored, and each bucket gives the average of its pixels. Buckets under `minShare` of the opaque pixels
// are dropped; at most `max` are returned, the most used first, with colours (saturation over 0.25) before greys.
export function dominantColours(data: Uint8ClampedArray | number[], opts: { max?: number; minShare?: number } = {}): string[] {
  const max = opts.max ?? 6, minShare = opts.minShare ?? 0.02;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 200) continue;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
    total++;
  }
  if (!total) return [];
  const found = [...buckets.values()]
    .filter((e) => e.n / total >= minShare)
    .sort((a, b) => b.n - a.n)
    .map((e) => hex(e.r / e.n, e.g / e.n, e.b / e.n));
  const unique = [...new Set(found)];
  const coloured = unique.filter((h) => satLight(h).s > 0.25 && satLight(h).l > 0.08 && satLight(h).l < 0.95);
  const neutral = unique.filter((h) => !coloured.includes(h));
  return [...coloured, ...neutral].slice(0, max);
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

// The small mark cut from the left of a full logo (the symbol before the name), as a square transparent PNG. Null when the logo
// has no separate symbol (wordmarkFrom is 0) or the part is too thin to be a mark.
export async function markFromLogo(file: Blob, wordmarkFrom: number, markGap: number): Promise<Blob | null> {
  const width = wordmarkFrom - markGap;
  if (wordmarkFrom <= 0 || width < 8) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('The picture could not be read'));
      i.src = url;
    });
    const h = img.naturalHeight;
    if (width < h * 0.4) return null;
    const side = Math.max(width, h);
    const canvas = document.createElement('canvas');
    canvas.width = side; canvas.height = side;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.drawImage(img, 0, 0, width, h, (side - width) / 2, (side - h) / 2, width, h);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
