// Which characters a font file really has a glyph for: its character map (the `cmap` table), read from the file itself. Standard library
// only: a woff2 file is a Brotli stream (node:zlib) of tables after a small directory; the cmap table is never transformed, so reading it
// needs no glyph decoding. A plain TrueType or OpenType file (an sfnt) is read too. Formats 4 (the basic plane) and 12 (every plane) are
// understood, which is what every font the engine ships or a brand can upload carries; a code point that maps to glyph 0 (`.notdef`, the
// empty box a browser draws for a missing character) counts as absent. Pure, and cached by the file's bytes.
import zlib from 'node:zlib';
import crypto from 'node:crypto';

// The tags a woff2 table directory names by index (the woff2 specification, section 5.1).
const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
const MAX_FONT_BYTES = 30 * 1024 * 1024;

function base128(buf, at) {
  let v = 0;
  for (let i = 0; i < 5; i += 1) {
    const b = buf[at.i++];
    if (b === undefined) throw new Error('font: the table directory is cut short');
    if (i === 0 && b === 0x80) throw new Error('font: a length has a leading zero');
    if (v & 0xfe000000) throw new Error('font: a length overflows');
    v = (v << 7) | (b & 0x7f);
    if (!(b & 0x80)) return v >>> 0;
  }
  throw new Error('font: a length is too long');
}

// The cmap table of a woff2 file, as a Buffer.
function woff2Cmap(buf) {
  if (buf.length < 48) throw new Error('font: too short for a woff2 file');
  const numTables = buf.readUInt16BE(12), compressed = buf.readUInt32BE(20);
  if (buf.toString('latin1', 4, 8) === 'ttcf') throw new Error('font: a woff2 font collection is not supported');
  const at = { i: 48 };
  let offset = 0, cmap = null;
  for (let t = 0; t < numTables; t += 1) {
    const flags = buf[at.i++], idx = flags & 0x3f, version = (flags >> 6) & 3;
    let tag;
    if (idx === 63) { tag = buf.toString('latin1', at.i, at.i + 4); at.i += 4; } else tag = KNOWN[idx];
    const orig = base128(buf, at);
    // glyf and loca are transformed unless their version is 3; any other table is transformed unless its version is 0
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    const length = transformed ? base128(buf, at) : orig;
    if (tag === 'cmap') cmap = { offset, length };
    offset += length;
  }
  if (!cmap) throw new Error('font: no cmap table');
  if (at.i + compressed > buf.length) throw new Error('font: the compressed data is cut short');
  const data = zlib.brotliDecompressSync(buf.subarray(at.i, at.i + compressed), { maxOutputLength: MAX_FONT_BYTES });
  if (cmap.offset + cmap.length > data.length) throw new Error('font: the cmap table is cut short');
  return data.subarray(cmap.offset, cmap.offset + cmap.length);
}

function sfntCmap(buf) {
  const n = buf.readUInt16BE(4);
  for (let t = 0; t < n; t += 1) {
    const r = 12 + t * 16;
    if (buf.toString('latin1', r, r + 4) === 'cmap') {
      const off = buf.readUInt32BE(r + 8), len = buf.readUInt32BE(r + 12);
      if (off + len > buf.length) throw new Error('font: the cmap table is cut short');
      return buf.subarray(off, off + len);
    }
  }
  throw new Error('font: no cmap table');
}

// The code points of one cmap subtable that map to a real glyph, as sorted [lo, hi] ranges.
function subtableRanges(c, off) {
  const format = c.readUInt16BE(off), out = [];
  if (format === 4) {
    const segX2 = c.readUInt16BE(off + 6), ends = off + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ros = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s += 1) {
      const end = c.readUInt16BE(ends + 2 * s), start = c.readUInt16BE(starts + 2 * s), delta = c.readInt16BE(deltas + 2 * s), ro = c.readUInt16BE(ros + 2 * s);
      if (start === 0xffff) continue;
      let lo = -1;
      for (let cp = start; cp <= end; cp += 1) {
        let g;
        if (ro === 0) g = (cp + delta) & 0xffff;
        else {
          const at = ros + 2 * s + ro + 2 * (cp - start);
          g = at + 1 < c.length ? c.readUInt16BE(at) : 0;
          if (g) g = (g + delta) & 0xffff;
        }
        if (g && lo < 0) lo = cp;
        if (!g && lo >= 0) { out.push([lo, cp - 1]); lo = -1; }
      }
      if (lo >= 0) out.push([lo, end]);
    }
  } else if (format === 12) {
    const groups = c.readUInt32BE(off + 12);
    for (let g = 0; g < groups; g += 1) {
      const r = off + 16 + g * 12, lo = c.readUInt32BE(r), hi = c.readUInt32BE(r + 4), glyph = c.readUInt32BE(r + 8);
      if (glyph === 0) { if (hi > lo) out.push([lo + 1, hi]); } else out.push([lo, hi]);
    }
  } else return null;
  return out;
}

const merge = (ranges) => {
  const s = ranges.sort((a, b) => a[0] - b[0]), out = [];
  for (const r of s) { const last = out[out.length - 1]; if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]); else out.push([...r]); }
  return out;
};

// [lo, hi] ranges of the code points the font draws: the union of its Unicode subtables (platform 0, or 3 with encoding 1 or 10).
export function fontCodepoints(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const sig = buf.toString('latin1', 0, 4);
  const c = sig === 'wOF2' ? woff2Cmap(buf) : (sig === '\0\x01\0\0' || sig === 'OTTO' || sig === 'true') ? sfntCmap(buf) : null;
  if (!c) throw new Error('font: not a woff2, TrueType or OpenType file');
  const n = c.readUInt16BE(2), all = [];
  let found = false;
  for (let t = 0; t < n; t += 1) {
    const r = 4 + t * 8, platform = c.readUInt16BE(r), enc = c.readUInt16BE(r + 2), off = c.readUInt32BE(r + 4);
    if (!(platform === 0 || (platform === 3 && (enc === 1 || enc === 10)))) continue;
    const got = subtableRanges(c, off);
    if (got) { all.push(...got); found = true; }
  }
  if (!found) throw new Error('font: no Unicode character map');
  return merge(all);
}

const cache = new Map();
// fontCodepoints, cached by the bytes' hash (a page embeds the same few files again and again).
export function codepointsOf(bytes) {
  const key = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!cache.has(key)) { if (cache.size > 200) cache.clear(); cache.set(key, fontCodepoints(bytes)); }
  return cache.get(key);
}

export function hasCodepoint(ranges, cp) {
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (cp < ranges[m][0]) hi = m - 1; else if (cp > ranges[m][1]) lo = m + 1; else return true; }
  return false;
}
