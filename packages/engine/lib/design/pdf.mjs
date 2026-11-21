// Reading and fixing the PDF that Chrome prints for a carousel. Pure: bytes in, bytes out.

// The pages of a PDF as Chrome writes it (plain, uncompressed page objects): the MediaBox of each page, and its width and height in points.
export function pdfPages(buf) {
  const text = Buffer.from(buf).toString('latin1');
  const pages = [];
  for (const m of text.matchAll(/\/Type \/Page\b(?!s)[\s\S]*?\/MediaBox \[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g)) {
    const box = [m[1], m[2], m[3], m[4]].map(Number);
    pages.push({ box, width: +(box[2] - box[0]).toFixed(4), height: +(box[3] - box[1]).toFixed(4) });
  }
  return pages;
}

// Chrome snaps the printed page size to a grid of about one point (a 1350 px page, 1012.5 pt, becomes 1013.04 pt). The images fill
// the page from its top edge, so the true page is the top 1012.5 pt: lower the box's bottom edge instead of changing its length, with
// spaces padding the text so that every byte offset in the file (the cross-reference table) stays valid. Returns { pdf, changed, found }.
// When the box is not in the plain form below, or is already right, the bytes are returned as they were.
export function snapMediaBox(buf, { width, height }) {
  const text = Buffer.from(buf).toString('latin1');
  let changed = 0, found = 0;
  const out = text.replace(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g, (whole, w, h) => {
    found++;
    const W = Number(w), H = Number(h);
    if (Math.abs(W - width) > 0.5 || H - height < 0.001 || H - height > 2) return whole;
    const next = `/MediaBox [0 ${+(H - height).toFixed(2)} ${+W.toFixed(2)} ${+H.toFixed(2)}`;
    const pad = whole.length - next.length - 1;
    if (pad < 0) return whole;
    changed++;
    return `${next}${' '.repeat(pad)}]`;
  });
  return { pdf: Buffer.from(out, 'latin1'), changed, found };
}
