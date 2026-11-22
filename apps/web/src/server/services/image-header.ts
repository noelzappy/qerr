// Picture facts read from the first bytes of a file, never from its name or the type a browser claimed: the real type, the pixel
// size, and whether it can have transparency. No decoder: PNG, WebP, JPEG and GIF headers only.
//
// What this does NOT do: it cannot see whether pixels along the border are really transparent (that needs the decoded image).
// An alpha channel is the test here; the border test is left for the engine step.
import { sniffImage } from '../routes/vault.js';

export interface ImageFacts { type: string; ext: string; width: number; height: number; alpha: boolean | null }

function pngSize(b: Buffer): { width: number; height: number } | null {
  // 8-byte signature, then the IHDR chunk: length(4) 'IHDR'(4) width(4) height(4)
  if (b.length < 33 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function webpSize(b: Buffer): { width: number; height: number } | null {
  const chunk = b.toString('latin1', 12, 16);
  if (chunk === 'VP8X' && b.length >= 30) return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8L' && b.length >= 25 && b[20] === 0x2f) { const v = b.readUInt32LE(21); return { width: 1 + (v & 0x3fff), height: 1 + ((v >>> 14) & 0x3fff) }; }
  if (chunk === 'VP8 ' && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  return null;
}

function jpegSize(b: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1]!;
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

// Whether a PNG or WebP can carry transparency (colour type with alpha, a tRNS chunk, VP8X's alpha flag, VP8L's alpha bit).
export function hasAlphaChannel(b: Buffer, type: string): boolean | null {
  if (type === 'image/png') {
    const colour = b.length > 25 ? b[25] : -1;
    if (colour === 4 || colour === 6) return true;
    for (let i = 8; i + 8 <= b.length;) {
      const len = b.readUInt32BE(i); const name = b.toString('latin1', i + 4, i + 8);
      if (name === 'tRNS') return true;
      if (name === 'IDAT' || name === 'IEND') return false;
      i += 12 + len;
    }
    return false;
  }
  if (type === 'image/webp') {
    const chunk = b.toString('latin1', 12, 16);
    if (chunk === 'VP8X') return b.length > 20 && (b[20]! & 0x10) !== 0;
    if (chunk === 'VP8L') return b.length > 24 && ((b.readUInt32LE(21) >>> 28) & 1) === 1;
    return false;
  }
  return type === 'image/jpeg' ? false : null;
}

export function imageFacts(b: Buffer): ImageFacts | null {
  const kind = sniffImage(b);
  if (!kind) return null;
  let size: { width: number; height: number } | null = null;
  try {
    if (kind.type === 'image/png') size = pngSize(b);
    else if (kind.type === 'image/webp') size = webpSize(b);
    else if (kind.type === 'image/jpeg') size = jpegSize(b);
    else if (kind.type === 'image/gif' && b.length >= 10) size = { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  } catch { size = null; }
  if (!size || !size.width || !size.height) return null;
  return { ...kind, ...size, alpha: hasAlphaChannel(b, kind.type) };
}

export const MIN_LONG_SIDE = 256;
export const MAX_SIDE = 8000;
export const MAX_PIXELS = 40_000_000;

// Why a file cannot be a cut-out or a graphic, or null when it can.
export function cutoutProblem(facts: ImageFacts | null, role: 'cutout' | 'graphic'): string | null {
  const noun = role === 'cutout' ? 'cut-out' : 'graphic';
  if (!facts) return `A ${noun} must be a PNG or WebP picture with a transparent background`;
  if (facts.type !== 'image/png' && facts.type !== 'image/webp') return `A ${noun} must be a PNG or WebP with a transparent background. JPG, GIF and SVG files are not accepted`;
  if (Math.max(facts.width, facts.height) < MIN_LONG_SIDE) return `This picture is ${facts.width} x ${facts.height} px. A ${noun} needs at least ${MIN_LONG_SIDE} px on its longer side`;
  if (Math.max(facts.width, facts.height) > MAX_SIDE || facts.width * facts.height > MAX_PIXELS) return `This picture is ${facts.width} x ${facts.height} px, which is larger than the ${MAX_SIDE} px or ${MAX_PIXELS / 1_000_000} megapixel limit`;
  if (!facts.alpha) return `This picture has no transparency. A ${noun} needs a transparent background, so save it as a PNG or WebP with an alpha channel`;
  return null;
}
