// Names that the brand file and the spec both rely on. Fixed lists: a spec can only pick from these, never pass a colour.
// The palette names: white and tint grounds, an ink ground for closing and emphasis pages, and the
// poster grounds of 2026-11-20 (pale mint, pale gold and the deep green; one pale colour per post, or a dark one for bold posts).
export const GROUND_NAMES = ['white', 'tint', 'mint', 'gold-pale', 'ink', 'deep'];
// The dark grounds: white type, gold accent, the fine line texture on poster pages.
export const DARK_GROUNDS = ['ink', 'deep'];
// muted: the website's two-tone heading (a statement in ink, its continuation in the muted grey, spec `*...*`); colour: the
// continuation in the primary green; weight: in a lighter weight.
export const ACCENT_STYLES = ['muted', 'colour', 'weight'];
// The website's gradient stops (--g-1 ... --g-5 in its globals.css), in order.
export const GRADIENT_NAMES = ['sage', 'teal', 'mint', 'gold', 'amber'];
// card: drawn artefacts and raised photos; window: a desktop screen in its window chrome; phone: the drop shadow under a
// pre-framed phone capture (a CSS drop-shadow, so its layers have no spread).
export const SHADOW_NAMES = ['card', 'window', 'phone'];
export const SERIES_KEY = /^[a-z0-9][a-z0-9-]{0,29}$/;
export const HEX = /^#[0-9a-fA-F]{6}$/;
// The poster headline sizes (object, product and number pages): large and confident, as on the WeWire posts the owner likes.
export const POSTER_SIZES = [76, 88, 104, 120];
// Where a poster's text sits: flush left or centred.
export const ALIGNS = ['left', 'center'];
