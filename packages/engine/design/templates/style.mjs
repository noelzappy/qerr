// What the brand's style block decides for a page: whether its ground is dark, how the headline's second half is set, its
// decoration, and where the logo goes. Every answer is a name from a fixed list (lib/design/tokens.mjs), so it can go into a
// class attribute as it is.
import { groundIsDark, normaliseBrand } from '../../lib/design/brand.mjs';
import { ACCENT_STYLES, LOGO_PLACES } from '../../lib/design/tokens.mjs';

// The brand as the engine uses it (loadBrand normalises it already; a hand-made brand object in a test may not be).
const styled = (brand) => (brand.darkGrounds ? brand : normaliseBrand(brand));

export const isDark = (brand, ground) => groundIsDark(styled(brand), ground);

// The accent style: the post's own, else the brand-wide device (when it is not "series"), else the series', else the default.
export function accentOf(brand, { spec, series, fallback }) {
  const device = styled(brand).style.type.accent;
  const a = spec?.accent ?? (device !== 'series' ? device : undefined) ?? series?.accent ?? fallback;
  return ACCENT_STYLES.includes(a) ? a : fallback;
}

// The decoration class of a page (one of '', dots, tex, grid, art). auto is the default look: dots on dark editorial pages, the
// fine line texture on dark posters. `off` is a page that asked for none (an editorial page with dots: false).
const KIND = { dots: 'dots', grid: 'grid', lines: 'tex', artwork: 'art', none: '' };
export function decorationOf(brand, { dark, poster = false, off = false }) {
  const b = styled(brand), d = b.style.decoration;
  if (off || (!dark && d.on === 'dark')) return '';
  if (d.kind === 'auto') return poster ? 'tex' : 'dots';
  if (d.kind === 'artwork' && !b.artworkSrc) return '';
  return KIND[d.kind] ?? '';
}

// Where the logo goes on a page of this kind ('poster', 'editorial' or 'photo'): { bottom, right }. Editorial pages and photo
// posts keep the logo in their footer at the bottom and follow only the side.
export function logoPlace(brand, kind) {
  const p = styled(brand).style.logo;
  const place = LOGO_PLACES.includes(p) && p !== 'auto' ? p : kind === 'poster' ? 'top-left' : 'bottom-left';
  return { bottom: kind === 'poster' ? place.startsWith('bottom') : true, right: place.endsWith('right') };
}

// What sits beside the logo: 'website' (the default), 'pill' (the logo in a light pill, and the website) or 'none'.
export const footerOf = (brand) => styled(brand).style.footer;
export const surfaceOf = (brand) => styled(brand).style.surface;
export const photoTreated = (brand) => styled(brand).style.photo.treatment !== 'none';
