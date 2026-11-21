// Pure geometry for the drawn artefacts (ledger sheet, passbook page, register card). No file system, no Chrome: the spec
// validator uses it to refuse content that cannot fit, and the templates use it to place every line and every word.
export const LIMITS = {
  ledger: { minCols: 2, maxCols: 5, minRows: 1, maxRows: 10, maxCell: 16, maxLabel: 16, maxNotes: 2, maxNote: 60, width: 860, gap: 28, head: 42, fs: 22, minFs: 16 },
  register: { minRows: 1, maxRows: 6, maxTitle: 26, maxLabel: 17, maxValue: 8, width: 380, pitch: 56, head: 42 },
  passbook: { minDays: 28, maxDays: 31, cols: 7, head: 92 },
};
// How wide one character of the mono face is, as a fraction of its font size, letter-spacing included.
export const MONO_ADVANCE = 0.655;

// Row height for a given number of rows (more rows, tighter rows, so ten still fit above the footer).
export const ledgerPitch = (rows) => (rows <= 6 ? 56 : rows === 7 ? 52 : rows === 8 ? 48 : rows === 9 ? 44 : 40);

// Where each column of a ledger goes. Columns share the width in proportion to their longest text; the first starts at the left
// edge and the last ends at the right edge. When the longest texts do not fit at 22 px the type shrinks, down to 16 px;
// below that `ok` is false and the spec is refused.
export function ledgerLayout(columns, rows, { width = LIMITS.ledger.width } = {}) {
  const L = LIMITS.ledger, n = columns.length;
  const chars = columns.map((c, j) => Math.max(c.label.length, ...rows.map((r) => String(r[j] ?? '').length), 2));
  const total = chars.reduce((a, b) => a + b, 0);
  const fs = Math.min(L.fs, Math.floor(((width - (n - 1) * L.gap) / (total * MONO_ADVANCE)) * 10) / 10);
  const ok = fs >= L.minFs;
  const f = ok ? fs : L.minFs;
  const natural = chars.map((c) => c * MONO_ADVANCE * f);
  const extra = Math.max(0, width - (n - 1) * L.gap - natural.reduce((a, b) => a + b, 0));
  let x = 0;
  const cols = columns.map((c, j) => {
    const slot = natural[j] + extra / n;
    const out = { x: c.align === 'end' ? x + slot : x, anchor: c.align === 'end' ? 'end' : 'start', chars: chars[j] };
    x += slot + L.gap;
    return out;
  });
  const pitch = ledgerPitch(rows.length);
  return { ok, fs: f, cols, pitch, head: L.head, height: L.head + rows.length * pitch + 4, width };
}

export const registerHeight = (rows) => LIMITS.register.head + rows * LIMITS.register.pitch + 4;

// The grid of a passbook page of w x h pixels: 7 columns, as many rows as the month needs.
export function passbookGeometry(w, h, days) {
  const P = LIMITS.passbook, rows = Math.ceil(days / P.cols);
  return { rows, cols: P.cols, hdr: P.head, cw: w / P.cols, ch: (h - P.head) / rows, slots: rows * P.cols };
}
