// Pieces shared by every template. Templates are functions (spec, ctx) -> { body, bodyClass?, bodyAttrs? };
// ctx = { size, brand, counter?, image(path) }.
//
// RULE for every template: nothing from a spec, a batch, a flag or the brand file reaches the page except through
//   esc()/fmt()/fmtE()  for text and attribute values (they add <br>, <span class="gold"> or <em> only AFTER escaping),
//   ctx.image()         for pictures (a checked data: URI),
//   a number the code computed or a value picked from a fixed table or list.
// Never write ${spec.something} into markup, a style or a URL directly.

// Escapes for text AND for double-quoted attribute values.
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
// \n or a real newline is a line break; *text* is brand gold (photo posts and page covers).
export const fmt = (s) => esc(s).replace(/\\n|\n/g, '<br>').replace(/\*([^*]+)\*/g, '<span class="gold">$1</span>');
// The editorial pages: \n is a line break; *text* is the accent phrase (colour or weight, set per page). Its own role, so the
// accent colour is measured as well.
export const fmtE = (s) => esc(s).replace(/\\n|\n/g, '<br>').replace(/\*([^*]+)\*/g, '<em data-role="accent">$1</em>');
// The sub line: \n is a line break; *text* is bold ink.
export const fmtSub = (s) => esc(s).replace(/\\n|\n/g, '<br>').replace(/\*([^*]+)\*/g, '<b>$1</b>');
// A font size that the fit loop can shrink (headlines, big numbers), times the brand's headline scale (--h-scale, 1 by default).
export const hs = (n) => `calc(${n}px*var(--hs,1)*var(--h-scale,1))`;
export const byName = (table, size) => table[size.name];
// A number the code computed, as plain digits for markup (never "NaN" or an exponent).
export const px = (n) => String(Math.round(Number(n) * 100) / 100);
// "Every saving, on record." -> "Every saving, *on record.*"
export const taglineMarkup = (t) => { const i = t.indexOf(', '); return i > 0 ? `${t.slice(0, i + 1)} *${t.slice(i + 2)}*` : t; };
