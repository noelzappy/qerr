// Logo helpers that run in the browser, so nobody needs an image editor:
//   measureLogo   where the wordmark starts in a full logo (mark, gap, then the name), read from the transparent columns
//   simpleLogos   a plain logo and mark drawn from the brand's name and colours, until the real ones are uploaded
//   shrinkImage   a large picture scaled down before it is uploaded as a design reference

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The picture could not be read'));
    img.src = src;
  });
}

// The columns that hold anything opaque, as runs; the second run starts the wordmark. A logo without a transparent gap
// (or without transparency at all) gives 0 and 0: the whole logo is treated as the wordmark.
export async function measureLogo(file: Blob): Promise<{ width: number; height: number; wordmarkFrom: number; markGap: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth, h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return { width: w, height: h, wordmarkFrom: 0, markGap: 0 };
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, w, h).data;
    const filled = new Array<boolean>(w).fill(false);
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y += 2) if (data[(y * w + x) * 4 + 3]! > 24) { filled[x] = true; break; }
    const runs: Array<[number, number]> = [];
    for (let x = 0; x < w; x++) {
      if (!filled[x]) continue;
      const start = x;
      while (x < w && filled[x]) x++;
      runs.push([start, x]);
    }
    // Small gaps (between letters) do not count: the gap after the mark is at least 4% of the height.
    const minGap = Math.max(4, Math.round(h * 0.04));
    for (let i = 1; i < runs.length; i++) {
      const gap = runs[i]![0] - runs[i - 1]![1];
      if (gap >= minGap && runs[i - 1]![1] - runs[0]![0] <= h * 1.6) return { width: w, height: h, wordmarkFrom: runs[i]![0], markGap: gap };
    }
    return { width: w, height: h, wordmarkFrom: 0, markGap: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('The logo could not be drawn'))), 'image/png'));

// A mark (the first letter on a rounded square in the primary colour) and a full logo (the mark, then the name in the dark
// colour), as transparent PNGs. The full logo's wordmark position is returned with it.
export async function simpleLogos(name: string, colours: { primary: string; dark: string }): Promise<{ full: Blob; mark: Blob; wordmarkFrom: number; markGap: number }> {
  await document.fonts.load('600 200px Inter').catch(() => undefined);
  const S = 320, R = S * 0.24;
  const drawMark = (g: CanvasRenderingContext2D, x: number, y: number) => {
    g.fillStyle = colours.primary;
    g.beginPath(); g.roundRect(x, y, S, S, R); g.fill();
    g.fillStyle = '#ffffff';
    g.font = `600 ${Math.round(S * 0.58)}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((name.trim()[0] ?? '?').toUpperCase(), x + S / 2, y + S / 2 + S * 0.03);
  };
  const mark = document.createElement('canvas');
  mark.width = S; mark.height = S;
  drawMark(mark.getContext('2d')!, 0, 0);

  const gap = Math.round(S * 0.12);
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `600 ${Math.round(S * 0.62)}px Inter, system-ui, sans-serif`;
  const textW = Math.ceil(measure.measureText(name).width) + 8;
  const full = document.createElement('canvas');
  full.width = S + gap + textW; full.height = S;
  const g = full.getContext('2d')!;
  drawMark(g, 0, 0);
  g.fillStyle = colours.dark;
  g.font = measure.font;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(name, S + gap, S / 2 + S * 0.03);
  return { full: await toBlob(full), mark: await toBlob(mark), wordmarkFrom: S + gap, markGap: gap };
}

// Pictures larger than this are scaled down (longest side) before upload; the AI reads them at about this size anyway.
const MAX_SIDE = 1600;
export async function shrinkImage(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (file.size < 1_500_000 && Math.max(img.naturalWidth, img.naturalHeight) <= MAX_SIDE) return file;
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.88));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
