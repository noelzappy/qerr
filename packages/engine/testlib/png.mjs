// A tiny PNG encoder and decoder for tests (no dependencies). Encoder: pixel(x, y) -> [r, g, b], or [r, g, b, a] with
// { alpha: true } (an RGBA PNG). Decoder: what Chrome's screenshots and the encoder write.
import zlib from 'node:zlib';

export function pngBytes(w, h, pixel, { alpha = false } = {}) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([len, t, c]); };
  const ch = alpha ? 4 : 3;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = pixel(x, y), o = y * (w * ch + 1) + 1 + x * ch;
    for (let k = 0; k < ch; k++) raw[o + k] = k === 3 ? (p[3] ?? 255) : p[k];
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// 8-bit greyscale, grey + alpha, RGB, RGBA or palette images, not interlaced. -> { w, h, data } with data the RGBA bytes, row
// by row.
export function decodePng(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) throw new Error('not a PNG file');
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  for (let i = 8; i + 8 <= buf.length;) {
    const len = buf.readUInt32BE(i), kind = buf.toString('latin1', i + 4, i + 8), data = buf.subarray(i + 8, i + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    i += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (depth !== 8 || !ch || interlace) throw new Error(`unsupported PNG (bit depth ${depth}, colour type ${type}, interlace ${interlace})`);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, rows = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? rows[o + x - ch] : 0, b = y ? rows[o - stride + x] : 0, c = x >= ch && y ? rows[o - stride + x - ch] : 0;
      let p = raw[src + x];
      if (f === 1) p += a;
      else if (f === 2) p += b;
      else if (f === 3) p += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      rows[o + x] = p & 255;
    }
  }
  const out = new Uint8Array(w * h * 4);
  for (let k = 0, j = 0; k < w * h; k++, j += ch) {
    const o = k * 4;
    if (type === 6) { out[o] = rows[j]; out[o + 1] = rows[j + 1]; out[o + 2] = rows[j + 2]; out[o + 3] = rows[j + 3]; }
    else if (type === 2) { out[o] = rows[j]; out[o + 1] = rows[j + 1]; out[o + 2] = rows[j + 2]; out[o + 3] = 255; }
    else if (type === 0 || type === 4) { out[o] = out[o + 1] = out[o + 2] = rows[j]; out[o + 3] = type === 4 ? rows[j + 1] : 255; }
    else { const p = rows[j] * 3; out[o] = palette[p]; out[o + 1] = palette[p + 1]; out[o + 2] = palette[p + 2]; out[o + 3] = trns && rows[j] < trns.length ? trns[rows[j]] : 255; }
  }
  return { w, h, data: out };
}

// Two decoded images, pixel by pixel: how many pixels differ in any channel by more than `tolerance`, the largest difference of
// one channel, and the box that holds every such difference; `noise` counts the pixels that differ by `tolerance` or less (a
// blurred text shadow is not drawn bit for bit the same twice). Images of different sizes are reported as such.
export function comparePixels(a, b, { tolerance = 0 } = {}) {
  if (a.w !== b.w || a.h !== b.h) return { sameSize: false, differing: Math.max(a.w * a.h, b.w * b.h), maxDelta: 255, box: null, noise: 0 };
  let differing = 0, maxDelta = 0, noise = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  const A = a.data, B = b.data;
  for (let k = 0, p = 0; k < A.length; k += 4, p++) {
    const d = Math.max(Math.abs(A[k] - B[k]), Math.abs(A[k + 1] - B[k + 1]), Math.abs(A[k + 2] - B[k + 2]), Math.abs(A[k + 3] - B[k + 3]));
    if (!d) continue;
    if (d > maxDelta) maxDelta = d;
    if (d <= tolerance) { noise++; continue; }
    differing++;
    const x = p % a.w, y = (p - x) / a.w;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { sameSize: true, differing, maxDelta, box: differing ? { x0, y0, x1, y1 } : null, noise };
}

// A picture of where two images of the same size differ: the first image faded, with every differing pixel in solid red.
export function diffImage(a, b) {
  return pngBytes(a.w, a.h, (x, y) => {
    const k = (y * a.w + x) * 4, A = a.data, B = b.data;
    const same = A[k] === B[k] && A[k + 1] === B[k + 1] && A[k + 2] === B[k + 2] && A[k + 3] === B[k + 3];
    return same ? [191 + (A[k] >> 2), 191 + (A[k + 1] >> 2), 191 + (A[k + 2] >> 2)] : [230, 0, 0];
  });
}
