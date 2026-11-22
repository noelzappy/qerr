// Looks as data: the descriptor builders and the fixed lists every table of the look schema is written with (see look-elements.mjs for the
// whole picture). Pure: no Chrome, no file system, and no import of the look tables, so that the primitives
// (directions/primitives/<name>.mjs) can write their parameter tables with it while look-elements.mjs reads those tables.
import { POST_FIELDS } from './post-spec.mjs';

// ---- limits ----
export const LIMITS = Object.freeze({
  compositions: 21, perKind: 3, nodes: 40, depth: 4, description: 300, name: 40, id: 40, definitionBytes: 256 * 1024,
  looksPerBrand: 20, rotated: 3, textRotation: 8, typeLevels: 3, optionalFieldsInConditions: 6, groundCases: 4, ladderSteps: 6, accepts: 6,
});
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
export const EMPHASES = ['none', 'italic', 'accent', 'bar', 'tilt-bar', 'own-line-bar'];
export const PARTS = ['all', 'pre', 'phrase', 'post'];
export const FORMATS = ['date-dd.mm', 'day', 'month', 'not-date', 'pad2', 'roman'];
export const SPLIT_SEPARATORS = ['·', '/', '|', '–'];
export const SOURCES = ['brand', 'folio', 'index', 'site'];
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
