// Loads the real files of a font family into the panel so a typeface card shows the actual typeface. The server serves each file
// same-origin (cookie auth); the family comes from its allow-listed library and is used only through the FontFace constructor and a
// quoted CSS family with quotes and backslashes stripped. Browser-only: every function is a no-op where FontFace or document is missing.
import type { FontFamilyInfo } from '../look-types';

export const fontUrl = (family: string, file: string): string => `/api/settings/looks/fonts/${encodeURIComponent(family)}/${encodeURIComponent(file)}`;

const clean = (s: string): string => s.replace(/["'\\]/g, '');
const alias = (family: string): string => `Look ${clean(family)}`;
const generic = (family: string): string => (/mono/i.test(family) ? "'SF Mono', Menlo, monospace" : /serif|fraunces/i.test(family) ? "Georgia, 'Times New Roman', serif" : "'Helvetica Neue', Arial, sans-serif");

// The CSS font-family value for a card: the panel alias first, then a generic fallback.
export const cardFontFamily = (family: string): string => `'${alias(family)}', ${generic(clean(family))}`;

const started = new Set<string>();

// Registers the family's files with document.fonts once; each file loads lazily and a failure leaves the fallback in place.
export function ensureFamily(info: FontFamilyInfo): void {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return;
  if (!info.files?.length || started.has(info.family)) return;
  started.add(info.family);
  for (const f of info.files) {
    try {
      const face = new FontFace(alias(info.family), `url("${fontUrl(info.family, f.file)}")`, { style: f.style, weight: f.weight, unicodeRange: f.range, display: 'swap' });
      document.fonts.add(face);
      face.load().catch(() => undefined);
    } catch { /* leave the fallback font */ }
  }
}
