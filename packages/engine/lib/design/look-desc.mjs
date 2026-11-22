// Looks as data: the descriptor builders and the fixed lists every table of the look schema is written with (see look-elements.mjs for the
// whole picture). Pure: no Chrome, no file system, and no import of the look tables, so that the primitives
// (directions/primitives/<name>.mjs) can write their parameter tables with it while look-elements.mjs reads those tables.
import { POST_FIELDS } from './post-spec.mjs';

// ---- limits ----
export const LIMITS = Object.freeze({
  compositions: 21, perKind: 3, nodes: 40, depth: 4, description: 300, name: 40, id: 40, definitionBytes: 256 * 1024,
  looksPerBrand: 20, rotated: 3, textRotation: 8, typeLevels: 3, optionalFieldsInConditions: 6, groundCases: 4, ladderSteps: 6, accepts: 6,
});
// More type sizes on one page (a composition's `levels`): an explicit, opt-in property of a design. Three levels by default, at most five;
// with more than three, each level must be at least `ratio` times the next smaller one (1.2 to 2, 1.25 when left out) and the headline the
// largest. The page measures this on the sizes it really sets (checks.mjs findPostProblems), and the validator on the sizes it knows.
export const LEVELS = Object.freeze({ min: 3, max: 5, ratioMin: 1.2, ratioMax: 2, ratio: 1.25 });
export const TEXT_FIELDS = Object.keys(POST_FIELDS);
export const SHORT_FIELDS = ['label', 'big', 'unit', 'by', 'meta', 'tag'];
export const FONT_ROLES = ['display', 'text', 'label', 'mono'];
// ---- fixed lists ----
export const GROUNDS = ['paper', 'field', 'dark', 'accent', 'soft', 'tint'];
export const ANGLE_NAMES = ['sticker', 'bar', 'block', 'band', 'card', 'price'];
export const LENGTH_TOKENS = ['margin', 'gutter', 'col', 'frame', 'frame+pad'];
export const ORIGINS = ['center', 'left top', 'top', 'right top', 'left', 'right', 'left bottom', 'bottom', 'right bottom'];
export const EDGES = ['top', 'right', 'bottom', 'left'];
export const ALIGNS = ['left', 'center', 'right'];
export const VALIGNS = ['top', 'center', 'bottom'];
export const FLOW_ALIGNS = ['start', 'center', 'end', 'stretch'];
export const JUSTIFIES = ['start', 'center', 'end', 'between'];
export const STYLES = ['display', 'body', 'item', 'label', 'numeral'];
export const EMPHASES = ['none', 'italic', 'accent', 'bar', 'tilt-bar', 'own-line-bar', 'bold'];
export const PARTS = ['all', 'pre', 'phrase', 'post'];
export const FORMATS = ['date-dd.mm', 'day', 'month', 'not-date', 'pad2', 'roman'];
export const SPLIT_SEPARATORS = ['·', '/', '|', '–'];
export const SOURCES = ['brand', 'folio', 'index', 'site', 'swipe'];
// The fixed words a text may be: labels like the two panels of a myth and a fact page. Never free text.
export const WORDS = ['Myth', 'Fact', 'Before', 'After', 'Yes', 'No'];
// How a picture melts into the page: not at all, the page takes the colour of the picture's own plain edge (and the top edge fades), or only a fade.
export const BLENDS = ['none', 'ground', 'fade'];
// The only words a look may place besides the post's own: glyphs (decoration, not type).
export const GLYPHS = ['“', '”', '‘', '’', '&', '№', '→', '←', '↑', '↓', '+', '×'];
export const STICKER_SHAPES = ['circle', 'pill', 'tile', 'stamp', 'seal'];
export const PHOTO_SHAPES = ['rect', 'circle', 'arch', 'rounded', 'card', 'print', 'oval', 'pill'];
export const PHOTO_TREATS = ['grey', 'multiply', 'grain', 'punch'];
export const FIT_MODES = ['lines', 'fill', 'block'];
export const ROW_EACH = ['items', 'meta-parts'];
export const ROW_NUMBERS = ['none', '1', '01', 'roman'];
export const RULE_WEIGHTS = ['hair', 'heavy'];
export const BASELINES = ['page', 'margin', 'box'];
export const UNIT_AT = ['top-right', 'under', 'bar'];
export const SHADOWS = ['hard'];
// Soft shadows: fixed presets (a blurred, low-opacity ink shadow below the shape), never a number the look chooses.
export const SOFT_SHADOWS = ['soft', 'lift'];
// Which corners a rounded radius applies to.
export const CORNERS = ['all', 'top', 'bottom', 'left', 'right'];
// Round shapes a radius may name instead of pixels: a full pill, an oval (an ellipse), an arch (a rounded top).
export const ROUND_SHAPES = ['full', 'oval', 'arch'];
export const RULE_STYLES = ['solid', 'dotted'];
export const BORDER_STYLES = ['solid', 'dashed'];
export const METAROW_SOURCES = ['label', 'brand', 'folio'];
export const WORDMARK_SEPS = ['dash', 'dot', 'slash', 'bar'];
export const FOLIOS = ['no', 'pad2', 'pad2-of-total'];
export const COLOUR_LOGICS = ['tonal', 'one-accent', 'field'];
// The fixed words of an event table's row labels (never free text).
export const ROW_KEYS = ['Date', 'Time', 'Place', 'Where', 'When', 'Price', 'Entry'];
// Fixed size lists of the look's own type levels (feed pixels). Body 36 and 34 are retail's and swiss's; item 46 and 52 the same.
export const BODY_SIZES = [28, 30, 32, 34, 36, 38, 40, 44];
export const ITEM_SIZES = [36, 40, 44, 46, 48, 52, 56];
export const LABEL_SIZES = [16, 18, 20, 22, 24, 26, 28, 30, 34];
// The size of a text element, by style: a whole number of pixels in this range (a look's elements are not limited to the look's
// own list: a headline is sized by its ladder or fitted; a sticker's words, a date tile's numerals, a price's unit are sized here).
export const SIZE_RANGE = Object.freeze({ display: [24, 300], body: [20, 60], item: [24, 80], label: [14, 60], numeral: [60, 900] });

// ---- descriptor builders ----
export const d = (o, label, help, def) => ({ ...o, label, help, ...(def !== undefined ? { default: def } : {}) });
export const num = (min, max, label, help, { int = false, step = int ? 1 : 0.01, def } = {}) => d({ kind: 'number', min, max, step, ...(int ? { int: true } : {}) }, label, help, def);
export const int = (min, max, label, help, def) => num(min, max, label, help, { int: true, def });
export const en = (values, label, help, def) => d({ kind: 'enum', values: [...values] }, label, help, def);
export const bool = (label, help, def) => d({ kind: 'bool' }, label, help, def);
export const role = (label, help, def) => d({ kind: 'role' }, label, help, def);
export const length = (min, max, label, help, def) => d({ kind: 'length', min, max }, label, help, def);
export const angle = (label, help, def) => d({ kind: 'angle' }, label, help, def);
export const field = (of, label, help, def) => d({ kind: 'field', of: [...of] }, label, help, def);
export const text = (max, label, help) => d({ kind: 'text', max }, label, help);
export const list = (of, max, label, help, o = {}) => d({ kind: 'list', of, max, ...(o.min ? { min: o.min } : {}), ...(o.unique ? { unique: true } : {}) }, label, help, o.def);
export const tuple = (items, label, help) => d({ kind: 'tuple', items }, label, help);
export const obj = (props, label, help, required = []) => d({ kind: 'object', props, ...(required.length ? { required } : {}) }, label, help);
export const oneOf = (forms, label, help, def) => d({ kind: 'oneOf', forms }, label, help, def);

// ---- decorative swashes: a fixed flourish drawn against one word of the headline ----
// The shapes are the engine's own (runtime.mjs placeSwashes draws them from these names and the measured word); a look picks one, the word
// (the first, the last, the emphasised phrase or the nth word), a palette role, a stroke weight, and whether it may cross the headline's other
// words. It never crosses other text: the page checks that on the drawn swash (checks.mjs findPostProblems, kind swash).
export const SWASH_SHAPES = ['underline', 'swoosh', 'tail', 'loop'];
export const SWASH_WORDS = ['first', 'last', 'phrase'];
export const SWASH_WEIGHTS = ['fine', 'medium', 'bold'];
export const SWASH_MAX_WORD = 12;
export const swashDesc = () => obj({
  shape: en(SWASH_SHAPES, 'Swash', 'An underline swoosh under the word, a swoosh that flicks up past its end, a tail from its last letter curling back under it, or a loop from its first letter running under it.'),
  word: oneOf([{ is: 'string', desc: en(SWASH_WORDS, 'Word', 'The first word, the last word, or the emphasised phrase (its last line).') }, { is: 'number', desc: int(1, SWASH_MAX_WORD, 'Word number', 'The nth word (1 is the first); a shorter headline uses its last word.') }], 'Word', 'Which word of the headline the swash is drawn against.', 'last'),
  colour: role('Colour', 'The swash colour (a role of the brand\'s colours).', 'accent'),
  weight: en(SWASH_WEIGHTS, 'Weight', 'How thick the stroke is, as a share of the letters\' size.', 'medium'),
  overlap: bool('May cross the headline', 'Lets the swash cross the headline\'s other words on purpose. It never crosses any other text.', false),
}, 'Swash', 'A decorative flourish drawn against one word of the headline, in a brand colour.', ['shape']);

// ---- gradients, overlays over a picture, brand graphics and cut-outs (each a separate, bounded capability) ----
// A gradient: two or three brand colour roles (never a hex), linear at a whole-degree angle or radial from one of nine points.
export const GRADIENT_KINDS = ['linear', 'radial'];
export const GRADIENT_AT = ['center', 'top', 'bottom', 'left', 'right', 'left top', 'right top', 'left bottom', 'right bottom'];
export const GRADIENT_SHAPES = ['circle', 'ellipse'];
export const GRADIENT_STOPS = Object.freeze({ min: 2, max: 3 });
// The one gradient descriptor every element that takes a gradient shares (the gradient primitive, a box's gradient fill).
export const gradientDesc = (label = 'Gradient', help = 'A blend of two or three of the brand\'s colours.') => obj({
  kind: en(GRADIENT_KINDS, 'Kind', 'Linear (along a direction) or radial (out from a point).', 'linear'),
  stops: list(role('Colour', 'A colour of the brand.'), GRADIENT_STOPS.max, 'Colours', 'Two or three colours of the brand, in order.', { min: GRADIENT_STOPS.min }),
  angle: int(0, 359, 'Direction', 'Degrees, for a linear gradient: 0 runs up, 90 to the right, 180 down (when left out), 270 to the left.'),
  at: en(GRADIENT_AT, 'From', 'The point a radial gradient spreads out from (the centre when left out).'),
  shape: en(GRADIENT_SHAPES, 'Shape', 'A radial gradient spreads as a circle or an ellipse (an ellipse when left out).'),
  mid: int(20, 80, 'Middle colour at', 'Where the middle colour of three sits, in percent along the gradient (50 when left out).'),
}, label, help, ['kind', 'stops']);
// An overlay over a picture: flat, or strongest at the foot or the head of its box; its strength is measured so the text reaches its contrast.
export const OVERLAY_FROM = ['flat', 'bottom', 'top'];
// A brand graphic or cut-out on the page: where it sits (nine slots, inside the margins or on the page edge) and how wide (a share of the page
// width, or pixels). Its height follows its own proportions.
export const GRAPHIC_SLOTS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
export const GRAPHIC_SIZES = Object.freeze({ s: 0.22, m: 0.34, l: 0.5, xl: 0.72 });
// A vault item named by a look: its id (a UUID, lowercase), nothing else; the file is found by the app and checked when the page is made.
export const VAULT_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const ref = (label, help) => d({ kind: 'ref' }, label, help);

// ---- text that crosses the edge of a shape on purpose (an explicit, opt-in pairing) ----
// A shape a text may cross is named with one of a fixed list of keys (never a free string); the text names that key, or any-shape.
export const SHAPE_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];
export const OVERLAP_WITH = ['any-shape', ...SHAPE_KEYS];
// The most texts of one composition that may cross a shape's edge.
export const OVERLAP_MAX = 3;

// ---- decorative backgrounds (the backdrop primitive): patterns drawn from brand colour roles and bounded numbers ----
export const BACKDROP_PATTERNS = ['dots', 'halftone', 'grid', 'stripes', 'rings', 'waves', 'blobs', 'confetti', 'plus', 'checker', 'grain'];
// How a backdrop fades out: not at all, towards one side, or towards its edges all round.
export const BACKDROP_MASKS = ['none', 'fade-down', 'fade-up', 'fade-left', 'fade-right', 'vignette', 'edges'];
