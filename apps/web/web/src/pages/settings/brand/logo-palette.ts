// The main colours of a logo, read in the browser from its pixels (a canvas), so Brand and look, Colours can offer them as swatches.
// `paletteFromPixels` is plain arithmetic on RGBA bytes (tested without a browser); `logoPalette` draws the picture on a canvas first.
//
// How: opaque pixels only (a transparent PNG's edges are half see-through and would add muddy in-between colours), white left out
// (the paper a logo sits on, not a brand colour), the rest counted in coarse buckets, then the biggest buckets taken in turn, skipping
// any too close to one already taken.

export interface PaletteOptions { max?: number; minShare?: number; minDistance?: number }

const hex2 = (v: number) => Math.round(v).toString(16).padStart(2, '0');
const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
const distance = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

export function paletteFromPixels(data: ArrayLike<number>, { max = 6, minShare = 0.01, minDistance = 56 }: PaletteOptions = {}): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let counted = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    if (a < 200) continue;
    if (r > 240 && g > 240 && b > 240) continue;
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
