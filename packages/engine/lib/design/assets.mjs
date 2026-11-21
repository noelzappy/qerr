// Files that end up inside a rendered page. Nothing is referenced by path: every picture, the logos and the font are read
// here, checked, and embedded as data: URIs, so the page needs no file or network access at all.
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR, repoPath } from '../core.mjs';
import { DesignError } from './errors.mjs';

export const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

// What the first bytes of a file say it is. A renamed text file or script does not pass.
export function sniff(buf) {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && buf.toString('latin1', 0, 4) === 'GIF8' && (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61) return 'image/gif';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 4 && buf.toString('latin1', 0, 4) === 'wOF2') return 'font/woff2';
  return null;
}

const dataUri = (type, buf) => `data:${type};base64,${buf.toString('base64')}`;

// Whether a picture has an alpha channel, read from its header: true, false, or null when the header cannot tell (GIF). A
// pre-framed phone capture is transparent around the phone, so a phone image without alpha is a plain screenshot.
export function hasAlpha(buf) {
  const type = sniff(buf);
  if (type === 'image/png') {
    const colour = buf.length > 25 ? buf[25] : -1;
    if (colour === 4 || colour === 6) return true;
    for (let i = 8; i + 8 <= buf.length;) {
      const len = buf.readUInt32BE(i), name = buf.toString('latin1', i + 4, i + 8);
      if (name === 'tRNS') return true;
      if (name === 'IDAT' || name === 'IEND') return false;
      i += 12 + len;
    }
    return false;
  }
  if (type === 'image/webp') {
    const chunk = buf.toString('latin1', 12, 16);
    if (chunk === 'VP8X') return buf.length > 20 && (buf[20] & 0x10) !== 0;
    if (chunk === 'VP8L') return buf.length > 24 && ((buf.readUInt32LE(21) >>> 28) & 1) === 1;
    return false;
  }
  if (type === 'image/jpeg') return false;
  return null;
}

// A picture named in a spec: relative to the repository (or absolute), an allowed image extension, an existing regular
// file of a sane size whose bytes really are that kind of image. Returns a data: URI.
export function readImage(file, { root }) {
  const { type, buf } = readImageBytes(file, { root });
  return dataUri(type, buf);
}

// The same checks, returning the type and the bytes.
export function readImageBytes(file, { root }) {
  if (typeof file !== 'string' || !file || file.includes('\0')) throw new DesignError('image: the path is empty or not text');
  const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
  if (!type) throw new DesignError(`image "${file}" is not an allowed image type (${Object.keys(IMAGE_TYPES).join(' ')})`);
  const abs = repoPath(file, root);
  let real;
  try { real = fs.realpathSync(abs); } catch { throw new DesignError(`image not found: ${file}`); }
  const st = fs.statSync(real);
  if (!st.isFile()) throw new DesignError(`image "${file}" is not a file`);
  if (st.size > MAX_IMAGE_BYTES) throw new DesignError(`image "${file}" is ${(st.size / 1048576).toFixed(0)} MB; the most accepted is ${MAX_IMAGE_BYTES / 1048576} MB`);
  const buf = fs.readFileSync(real);
  const real_type = sniff(buf);
  if (real_type !== type) throw new DesignError(`image "${file}" does not contain ${type.replace('image/', '').toUpperCase()} data (it looks like ${real_type ?? 'something else'})`);
  return { type, buf };
}

// Brand files (font, logos): inside the repository (or the engine package, where design/ lives), the expected type, embedded.
export function readBrandAsset(rel, { root, type }) {
  const buf = brandBytes(rel, { root });
  if (sniff(buf) !== type) throw new Error(`brand asset ${rel} is not a ${type} file`);
  return dataUri(type, buf);
}

// The brand's artwork (the decoration behind pages): a PNG, JPEG or WebP picture whose bytes say so (never SVG or anything
// that can carry script), at most 8 MB, embedded.
export const ARTWORK_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_ARTWORK_BYTES = 8 * 1024 * 1024;
export function readBrandImage(rel, { root }) {
  const buf = brandBytes(rel, { root });
  const type = sniff(buf);
  if (!ARTWORK_TYPES.includes(type)) throw new Error(`brand artwork ${rel} is not a PNG, JPEG or WebP picture`);
  if (buf.length > MAX_ARTWORK_BYTES) throw new Error(`brand artwork ${rel} is larger than ${MAX_ARTWORK_BYTES / 1048576} MB`);
  return dataUri(type, buf);
}

function brandBytes(rel, { root }) {
  if (typeof rel !== 'string' || !rel || rel.includes('\0')) throw new Error('brand asset: the path is empty or not text');
  const abs = repoPath(rel, root);
  const within = (base) => { const r = path.relative(base, abs); return !r.startsWith('..') && !path.isAbsolute(r); };
  if (!within(root) && !within(ENGINE_DIR)) throw new Error(`brand asset "${rel}" must stay inside the repository`);
  if (!fs.existsSync(abs)) throw new Error(`brand asset missing: ${rel}`);
  return fs.readFileSync(abs);
}
