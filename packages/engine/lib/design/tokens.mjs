// Names that the brand file and the spec both rely on. Fixed lists: a spec can only pick from these, never pass a colour.

// The page grounds, by neutral name: two quiet light ones, two tinted ones and two dark ones. Each is one colour in the brand
// file's `grounds`; one ground per post. Which grounds are dark (white type, the dark decoration) is worked out from the
// brand's own colours (isDarkColour), so a brand may make any of them dark or saturated.
export const GROUND_NAMES = ['light', 'soft', 'cool', 'warm', 'dark', 'deep'];
// The names used before 2026-11-21. Batches, brand packs and AI drafts written with them keep working: every place that reads
// a ground name (specs, series, brand.json `grounds`) accepts these and reads them as the new name.
export const GROUND_ALIASES = Object.freeze({ white: 'light', tint: 'soft', mint: 'cool', 'gold-pale': 'warm', ink: 'dark' });
// Every name a spec or a series may use for a ground.
export const GROUND_INPUTS = [...GROUND_NAMES, ...Object.keys(GROUND_ALIASES)];
// The neutral name for a ground name or alias, or null.
export const groundName = (g) => (typeof g !== 'string' ? null : GROUND_NAMES.includes(g) ? g : Object.hasOwn(GROUND_ALIASES, g) ? GROUND_ALIASES[g] : null);
// The grounds that are dark in the demo brand. A brand's own dark grounds come from its colours (see brand.mjs darkGrounds).
export const DARK_GROUNDS = ['dark', 'deep'];

// A colour is dark when white reads better on it than black (relative luminance under about 0.18).
export function isDarkColour(hex) {
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(String(hex).slice(i, i + 2), 16)));
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05 / (l + 0.05)) > ((l + 0.05) / 0.05);
}

// How the second half of a headline (the *phrase* in a spec) is set: muted, the statement in ink and its continuation in the
// muted grey; colour, the continuation in the primary colour (the accent on dark grounds); weight, in a lighter weight; none,
// set like the rest of the headline.
export const ACCENT_STYLES = ['muted', 'colour', 'weight', 'none'];
// The brand's gradient stops (the glow behind phones, the map dots), in order. The names are slots, the colours the brand's.
export const GRADIENT_NAMES = ['sage', 'teal', 'mint', 'gold', 'amber'];
// card: drawn artefacts and raised photos; window: a desktop screen in its window chrome; phone: the drop shadow under a
// pre-framed phone capture (a CSS drop-shadow, so its layers have no spread).
export const SHADOW_NAMES = ['card', 'window', 'phone'];
export const SERIES_KEY = /^[a-z0-9][a-z0-9-]{0,29}$/;
export const HEX = /^#[0-9a-fA-F]{6}$/;
// The poster headline sizes (object, product and number pages).
export const POSTER_SIZES = [76, 88, 104, 120];
// Where a poster's text sits: flush left or centred.
export const ALIGNS = ['left', 'center'];

// ---- the style layer (brand.json `style`, every field optional; the defaults are the demo brand's look) -------------------

// The roles a font file can have: sans (body text, and headlines unless a display font is set), mono (figures, and labels
// unless a label font is set), display (headlines) and label (running heads, footers, eyebrows).
export const FONT_ROLES = ['sans', 'mono', 'display', 'label'];
// How a type role is set: as typed, or in capitals.
export const TYPE_CASES = ['as-typed', 'upper'];
// The brand-wide accent device: follow each series (and the post), or one device on every page.
export const ACCENT_DEVICES = ['series', ...ACCENT_STYLES];
// Cards, panels and screens: a soft layered shadow and a hairline, a solid outline, or flat fills.
export const SURFACES = ['shadow', 'outline', 'flat'];
// The texture behind a page. auto: dots on dark editorial pages, a fine line texture on dark posters.
export const DECORATIONS = ['auto', 'none', 'dots', 'grid', 'lines', 'artwork'];
// Which grounds carry it: the dark ones only, or every ground.
export const DECORATION_ON = ['dark', 'all'];
// Brand artwork (an uploaded PNG, JPEG or WebP): filling the page behind everything, or in the top right corner.
export const ARTWORK_FITS = ['cover', 'corner'];
// What happens to photographs (not to phone or desktop screens): untouched, tinted with one brand colour, a duotone of two
// brand colours, or a brand colour laid over them.
export const PHOTO_TREATMENTS = ['none', 'tint', 'duotone', 'overlay'];
// The brand colours a photo treatment may use, by role. Each is one of the brand's own CSS variables (a fixed table in
// brand.mjs), never a colour from the style block.
export const STYLE_COLOURS = ['primary', 'accent', 'ink', 'inverse', ...GROUND_NAMES];
// Where the logo goes. auto: posters at the top left, editorial pages and photo posts in the footer at the bottom left.
export const LOGO_PLACES = ['auto', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
// What sits beside the logo: the website, the logo in a light pill with the website, or nothing.
export const FOOTERS = ['website', 'pill', 'none'];

// The style block with every default filled in: exactly the look before the style layer existed.
export const STYLE_DEFAULTS = Object.freeze({
  type: {
    display: { case: 'as-typed' },
    body: { case: 'as-typed' },
    label: { case: 'upper' },
    scale: 1,
    accent: 'series',
  },
  surface: 'shadow',
  decoration: { kind: 'auto', on: 'dark', fit: 'cover', opacity: 1 },
  photo: { treatment: 'none', strength: 0.5, colour: 'primary', shadows: 'dark', highlights: 'light' },
  logo: 'auto',
  footer: 'website',
});

// ---- design directions (brand.json `style.direction`, the `post` template; lib/design/directions/) -----------------------------
// A direction is a whole way of composing a post: its own type, grid, colour logic and devices. A brand has none until it names one;
// without one the brand is drawn exactly as before and a `post` design is refused.
export const DIRECTIONS = ['editorial', 'swiss', 'retail'];
// What a `post` design is: it says what the post IS (a kind), never which layout to use; the brand's direction decides the drawing.
export const POST_KINDS = ['statement', 'figure', 'list', 'quote', 'photo', 'event', 'offer'];
