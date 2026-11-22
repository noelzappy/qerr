// The small mark cut from the left of an uploaded full logo, for the guided setup's logo step (canvas, no library).

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
