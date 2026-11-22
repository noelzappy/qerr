// The glyph check: every character a page draws must have a glyph in a font the page itself embeds. A character no font of its stack can draw
// is shown by the browser in some system font, or, on a server without one, as an empty box (`.notdef`); neither is the design. The page
// reports what it draws, grouped by font stack (runtime.mjs glyphs()); here each character is held to the @font-face rules of the page's own
// HTML (the brand's fonts, the library's, the emoji and the currency fallback): a face counts for a character when its unicode-range takes it
// AND its character map (font-cmap.mjs, read from the embedded file itself) has a real glyph for it. System fonts never count: they differ
// from machine to machine. Pure (no Chrome).
import { codepointsOf, hasCodepoint } from './font-cmap.mjs';
import { inRange } from './font-library.mjs';

const FACE = /@font-face\s*\{([^}]*)\}/g;
const ALL = 'U+0-10FFFF';

// The faces a page declares: [{ family (lower case), style, range, cps | null }]. cps is null when the file could not be read (an odd font a
// brand uploaded): the face is then trusted for its unicode-range, as the browser would try it.
export function pageFaces(html) {
  const out = [];
  for (const m of String(html).matchAll(FACE)) {
    const body = m[1];
    const family = /font-family\s*:\s*["']([^"']+)["']/.exec(body)?.[1];
    const data = /url\(\s*["']?data:[^;,"')]*;base64,([A-Za-z0-9+/=]+)["']?\s*\)/.exec(body)?.[1];
    if (!family || !data) continue;
    const style = /font-style\s*:\s*(italic|oblique)/.test(body) ? 'italic' : 'normal';
    const range = /unicode-range\s*:\s*([^;}]+)/.exec(body)?.[1]?.trim() ?? ALL;
    let cps = null;
    try { cps = codepointsOf(Buffer.from(data, 'base64')); } catch { cps = null; }
    out.push({ family: family.toLowerCase(), style, range, cps });
  }
  return out;
}

// The families of a computed font-family value, in order, lower case and unquoted.
export const stackOf = (value) => String(value).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '').toLowerCase()).filter(Boolean);

// Whether one family of the page draws a code point at a style: among its faces of that style (or all of them when it has none of that
// style, as the browser then synthesises the style), one whose range takes the code point and whose map has a glyph for it.
function draws(faces, family, style, cp) {
  const own = faces.filter((f) => f.family === family);
  const styled = own.filter((f) => f.style === style);
  return (styled.length ? styled : own).some((f) => inRange(f.range, cp) && (f.cps === null || hasCodepoint(f.cps, cp)));
}

// The characters of a page that no font of their stack draws: [{ ch, cp, role, families }], one entry per character and role.
// groups: runtime glyphs(); html: the page as given to Chrome.
export function glyphProblems(groups, html) {
  const faces = pageFaces(html), out = [], seen = new Set();
  for (const g of groups ?? []) {
    const families = stackOf(g.stack).filter((f) => faces.some((x) => x.family === f));
    const style = /italic|oblique/.test(String(g.style)) ? 'italic' : 'normal';
    for (const ch of String(g.chars ?? '')) {
      const cp = ch.codePointAt(0);
      if (families.some((f) => draws(faces, f, style, cp))) continue;
      const key = `${cp}|${g.role}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ch, cp, role: g.role || '', families });
    }
  }
  return out;
}

const ROLE = { headline: 'headline', accent: 'headline', stat: 'big figure', sub: 'sub line', statlabel: 'unit', label: 'label or sticker', eyebrow: 'label', item: 'list', meta: 'event line', tag: 'tag or price', url: 'website', foot: 'footer', logo: 'logo', quote: 'quote', by: 'name', cta: 'button', folio: 'page number', art: 'artefact label', artbody: 'artefact text' };
const code = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
// The character as it may be shown in a message: itself when it is a visible letter, digit, mark or sign, else only its code.
const shown = (ch) => (/^[\p{L}\p{N}\p{S}\p{P}]$/u.test(ch) ? `"${ch}" (${code(ch.codePointAt(0))})` : code(ch.codePointAt(0)));

// One sentence for a refused page: which characters, in which text, and what to do. Names the characters only, never the text they are in.
export function explainGlyphProblems(problems) {
  const byRole = new Map();
  for (const p of problems) { const w = ROLE[p.role] ?? 'text'; if (!byRole.has(w)) byRole.set(w, []); byRole.get(w).push(p); }
  const parts = [...byRole].map(([w, list]) => {
    const chars = [...new Map(list.map((p) => [p.cp, p])).values()];
    const named = chars.slice(0, 3).map((p) => shown(p.ch)).join(', ') + (chars.length > 3 ? ` and ${chars.length - 3} more` : '');
    return `the ${w} has ${chars.length > 1 ? 'characters' : 'the character'} ${named}`;
  });
  return `${parts.join('; ')}, which no font of this page can draw (it would show as an empty box): write ${problems.length > 1 ? 'them' : 'it'} another way (for a currency, its code, such as GHS or USD), or choose a look whose fonts have ${problems.length > 1 ? 'them' : 'it'}`;
}
