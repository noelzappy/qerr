// Looks as data: the tables (see look.mjs for the whole picture). A look is a whole way of composing a post written as data:
// look-level sections (page grid, fonts, type, colour, devices, photo, logo, dials) and up to 21 compositions, each a tree of
// elements. Pure: no Chrome, no file system. Everything here is a table of NUMBERS in bounds and NAMES from fixed lists; a look
// holds no markup, no CSS, no hex colour, no CSS font name, no URL and no path. look-validate.mjs checks a look against these
// tables, look.mjs describes them to the editor (lookCatalogue) and the AI (lookBrief).
//
// A property is described by a descriptor, a plain object (so the catalogue is JSON):
//   { kind: 'number', min, max, step?, int? }      a finite number in bounds (int: whole numbers only)
//   { kind: 'enum', values }                       one of a fixed list (strings or numbers)
//   { kind: 'bool' }
//   { kind: 'role' }                               a palette role name (kit COLOUR_NAMES); never a hex colour
//   { kind: 'length', min, max }                   a bounded number of pixels, or a token: margin, gutter, col, frame, frame+pad
//   { kind: 'angle' }                              a named look angle (devices.angles) or a number from -15 to 15 degrees
//   { kind: 'field', of: [...] }                   the name of a field of the post, from the list; declared by the composition
//   { kind: 'text', max }                          one line of text (a name or a description), no control characters
//   { kind: 'list', of, min?, max, unique? }       a list (of descriptors)
//   { kind: 'tuple', items: [...] }                a list of exactly these descriptors, in order
//   { kind: 'object', props, required? }           an object with exactly these properties
//   { kind: 'oneOf', forms: [{ is, desc }] }       a number | a string | a list | an object, told apart by its type
//   { kind: 'tagged', key, forms: { tag: object } } an object whose `key` names which form it is
//   { kind: 'place' } { kind: 'when' } { kind: 'children' }   the three structural ones (look-validate.mjs)
// Every descriptor also carries `label` and `help`: plain British English for the panel (glossary: ux/COMMON.md), and optional
// `default` (what normaliseLook fills in).
import { POST_FIELDS, POST_ITEMS, POST_KINDS, POST_REQUIRED } from './post-spec.mjs';

export const LOOK_SCHEMA = 1;
export const KINDS = [...POST_KINDS];
export { POST_FIELDS, POST_ITEMS, POST_REQUIRED };

// The palette roles of a post (the names kit.mjs COLOUR_NAMES resolves to --c-* custom properties of colour.mjs palette()). A copy, so that
// this pure module loads without the builders; test-design-look.mjs holds it equal to the kit's list. A look names a role, never a hex.
export const COLOUR_NAMES = Object.freeze(['paper', 'ink', 'white', 'dark', 'primary', 'field', 'on-field', 'gold', 'gold-deep', 'accent', 'accent-dark', 'on-accent', 'on-primary', 'body', 'soft', 'muted', 'body-dark', 'muted-dark', 'rule', 'rule-soft', 'rule-dark', 'rule-field', 'accent-type', 'body-field', 'field-deep', 'paper-warm', 'light-tint', 'field-text']);

// ---- limits ----
export const LIMITS = Object.freeze({
  compositions: 21, perKind: 3, nodes: 40, depth: 4, description: 300, name: 40, id: 40, definitionBytes: 256 * 1024,
  looksPerBrand: 20, rotated: 3, textRotation: 8, typeLevels: 3, optionalFieldsInConditions: 6, groundCases: 4, ladderSteps: 6, accepts: 6,
});
export const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const ORIGIN = /^copy:(shipped|own):[a-z0-9][a-z0-9-]{0,39}$/;
// The feed page (1080 x 1350): the only size a look draws today (other sizes come with a later step).
export const PAGE = Object.freeze({ w: 1080, h: 1350 });
// The keys no look may carry, at any depth.
export const FORBIDDEN_KEYS = Object.freeze(['render', '__proto__', 'constructor', 'prototype']);

// ---- the fields of a post, per kind ----
// Which fields a composition of a kind may use (a superset of the compositions of the shipped directions); the required ones come
// from POST_REQUIRED and must be declared required.
export const KIND_FIELDS = Object.freeze({
  statement: ['label', 'headline', 'sub'],
  figure: ['label', 'headline', 'big', 'unit', 'sub'],
  list: ['label', 'headline', 'sub', 'items'],
  quote: ['label', 'quote', 'by'],
  photo: ['label', 'image', 'headline', 'sub', 'tag'],
  event: ['label', 'image', 'headline', 'meta', 'sub', 'tag'],
  offer: ['label', 'image', 'headline', 'tag', 'sub', 'unit'],
});
export const TEXT_FIELDS = Object.keys(POST_FIELDS);
export const FIELD_NAMES = [...TEXT_FIELDS, 'items', 'image'];
export const SHORT_FIELDS = ['label', 'big', 'unit', 'by', 'meta', 'tag'];

// ---- fixed lists ----
export const GROUNDS = ['paper', 'field', 'dark', 'accent', 'soft'];
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
export const FORMATS = ['date-dd.mm', 'day', 'month', 'pad2', 'roman'];
export const SPLIT_SEPARATORS = ['·', '/', '|', '–'];
export const SOURCES = ['brand', 'folio', 'index'];
// The only words a look may place besides the post's own: glyphs (decoration, not type).
export const GLYPHS = ['“', '”', '‘', '’', '&', '№', '→', '←', '↑', '↓', '+', '×'];
export const STICKER_SHAPES = ['circle', 'pill', 'tile', 'stamp', 'seal'];
export const PHOTO_SHAPES = ['rect', 'circle', 'arch', 'rounded', 'card', 'print'];
export const PHOTO_TREATS = ['grey', 'multiply', 'grain', 'punch'];
export const FIT_MODES = ['lines', 'fill', 'block'];
export const ROW_EACH = ['items', 'meta-parts'];
export const ROW_NUMBERS = ['none', '1', '01', 'roman'];
export const RULE_WEIGHTS = ['hair', 'heavy'];
export const BASELINES = ['page', 'margin', 'box'];
export const UNIT_AT = ['top-right', 'under', 'bar'];
export const SHADOWS = ['hard'];
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
const d = (o, label, help, def) => ({ ...o, label, help, ...(def !== undefined ? { default: def } : {}) });
const num = (min, max, label, help, { int = false, step = int ? 1 : 0.01, def } = {}) => d({ kind: 'number', min, max, step, ...(int ? { int: true } : {}) }, label, help, def);
const int = (min, max, label, help, def) => num(min, max, label, help, { int: true, def });
const en = (values, label, help, def) => d({ kind: 'enum', values: [...values] }, label, help, def);
const bool = (label, help, def) => d({ kind: 'bool' }, label, help, def);
const role = (label, help, def) => d({ kind: 'role' }, label, help, def);
const length = (min, max, label, help, def) => d({ kind: 'length', min, max }, label, help, def);
const angle = (label, help, def) => d({ kind: 'angle' }, label, help, def);
const field = (of, label, help, def) => d({ kind: 'field', of: [...of] }, label, help, def);
const text = (max, label, help) => d({ kind: 'text', max }, label, help);
const list = (of, max, label, help, o = {}) => d({ kind: 'list', of, max, ...(o.min ? { min: o.min } : {}), ...(o.unique ? { unique: true } : {}) }, label, help, o.def);
const tuple = (items, label, help) => d({ kind: 'tuple', items }, label, help);
const obj = (props, label, help, required = []) => d({ kind: 'object', props, ...(required.length ? { required } : {}) }, label, help);
const oneOf = (forms, label, help, def) => d({ kind: 'oneOf', forms }, label, help, def);

// ---- the common properties of elements ----
export const COMMON = Object.freeze({
  place: d({ kind: 'place' }, 'Place', 'Where it goes: on the page grid, at pixel positions, anchored to the edges, or filling the page, margins or frame. Inside a box, leave it out to flow with the other items.'),
  bleed: obj({
    edges: list(en(EDGES, 'Edge', 'A page edge.'), 4, 'Edges', 'The page edges it runs over, only edges it touches.', { min: 1, unique: true }),
    by: num(0, 0.2, 'By', 'How far past the edge, as a share of its own size (0 to 0.2).', { def: 0.05 }),
  }, 'Run to the page edge', 'Lets a picture, block or numeral run over the margin to the page edge.', ['edges']),
  rot: angle('Turn', 'A named angle of the look, or from -15 to 15 degrees.', 0),
  skew: num(-6, 6, 'Slant', 'Slants it, from -6 to 6 degrees.', { def: 0 }),
  origin: en(ORIGINS, 'Turn about', 'The point it turns around.', 'center'),
  z: int(0, 9, 'Layer', 'Drawing order, 0 at the back to 9 at the front.', 0),
  when: d({ kind: 'when' }, 'Show when', 'Shown only when a field is filled (present) or empty (absent); both must hold when both are given.'),
  fill: role('Fill', 'The colour it is filled with (a role of the brand\'s colours).'),
  ink: role('Ink', 'The colour of the type on it (a role of the brand\'s colours).'),
  shadow: oneOf([{ is: 'string', desc: en(SHADOWS, 'Shadow', 'The look\'s own hard shadow.') }, {
    is: 'object', desc: obj({ x: int(-24, 24, 'Across', 'Pixels across.'), y: int(-24, 24, 'Down', 'Pixels down.'), colour: role('Colour', 'The shadow colour.', 'ink') }, 'Shadow', 'A hard shadow, no blur.', ['x', 'y']),
  }], 'Shadow', 'The look\'s hard shadow ("hard") or your own.'),
  ring: obj({ w: int(0, 16, 'Width', 'Pixels.'), colour: role('Colour', 'The ring colour.') }, 'Ring', 'A ring just outside it.', ['w', 'colour']),
  border: obj({ w: int(0, 16, 'Width', 'Pixels.'), colour: role('Colour', 'The border colour.', 'ink'), style: en(BORDER_STYLES, 'Style', 'Solid or dashed.', 'solid') }, 'Border', 'A border inside its edge.', ['w']),
  pad: oneOf([{ is: 'number', desc: int(0, 200, 'Padding', 'Pixels on every side.') }, { is: 'array', desc: tuple([int(0, 200, 'Top', ''), int(0, 200, 'Right', ''), int(0, 200, 'Bottom', ''), int(0, 200, 'Left', '')], 'Padding', 'Top, right, bottom, left in pixels.') }], 'Padding', 'The space inside it, in pixels (one number, or top, right, bottom, left).'),
  radius: oneOf([{ is: 'number', desc: int(0, 200, 'Corner radius', 'Pixels.') }, { is: 'string', desc: en(['full'], 'Round', 'Fully round.') }], 'Corners', 'Corner radius in pixels, or "full" for round.'),
  // only for an item that flows in a box (no place of its own)
  grow: int(0, 4, 'Share of the space', 'How much of the free height a flowing item takes (0 to 4).'),
  minH: int(0, 1350, 'Least height', 'The least height in pixels.'),
  w: length(1, 1200, 'Width', 'Width of a flowing item: pixels, or margin, gutter, col, frame, frame+pad.'),
  h: length(1, 1350, 'Height', 'Height of a flowing item: pixels, or a token.'),
});
// The properties only an item flowing in a box takes.
export const FLOW_ONLY = ['grow', 'minH', 'w', 'h'];

// ---- place ----
export const PLACE_FORMS = Object.freeze({
  grid: obj({
    col: int(1, 24, 'Column', 'First column (1 is the left).'), span: int(1, 24, 'Columns', 'How many columns wide.'),
    row: int(1, 16, 'Row', 'First row (1 is the top row of the page grid).'), rowSpan: int(1, 16, 'Rows', 'How many rows tall.'),
    alignY: en(VALIGNS, 'Vertical', 'Where it sits in its rows when it is shorter than them.'),
  }, 'On the grid', 'Columns and rows of the look\'s page grid.', ['col', 'span']),
  px: obj({ x: num(-300, 1500, 'Left', 'Pixels from the left of the page.', { int: true }), y: num(-300, 1700, 'Top', 'Pixels from the top.', { int: true }), w: int(1, 1700, 'Width', 'Pixels.'), h: int(1, 1700, 'Height', 'Pixels.') }, 'At pixels', 'A rectangle in page pixels (inside a box: in the box).', ['x', 'y']),
  anchor: obj({
    left: length(-300, 1500, 'From the left', 'Pixels or a token.'), right: length(-300, 1500, 'From the right', 'Pixels or a token.'),
    top: length(-300, 1700, 'From the top', 'Pixels or a token.'), bottom: length(-300, 1700, 'From the bottom', 'Pixels or a token.'),
    w: length(1, 1700, 'Width', 'Pixels or a token.'), h: length(1, 1700, 'Height', 'Pixels or a token.'),
  }, 'Anchored', 'Held at distances from the page edges (inside a box: from the box edges).'),
  inset: en(['page', 'margins', 'frame'], 'Fill', 'Fills the whole page, inside the margins, or inside the frame.'),
});
// Modifiers that go beside a grid place (the swiss bar is one gutter wide: { grid: {...}, w: "gutter" }).
export const PLACE_MODIFIERS = Object.freeze({
  w: length(1, 1200, 'Width', 'A width other than the columns\': pixels or a token.'), h: length(1, 1350, 'Height', 'A height other than the rows\': pixels or a token.'),
  dx: int(-200, 200, 'Nudge across', 'Moves it across, in pixels.'), dy: int(-200, 200, 'Nudge down', 'Moves it down, in pixels.'),
});

// ---- the element types ----
// placement: 'required' (a top-level element has exactly one form of place; inside a box it flows unless it is a type that cannot),
// 'none' (the element has its own geometry and takes no place). flow: it may flow in a box. container: what it may hold.
// text: its words must read (the text-over-photo check). fitted: sized to its box by the runtime.
const SPEC_FIELDS = field(TEXT_FIELDS, 'Field', 'Which of the post\'s words it shows.');
export const ELEMENTS = Object.freeze({
  box: {
    label: 'Box', group: 'Layout', help: 'A container: items flow in it in a column or a row, or sit in it at places of their own. May have a fill, padding, a shadow, a turn.',
    placement: 'required', flow: true, container: 'any', text: false,
    own: {
      flow: en(['column', 'row'], 'Direction', 'Items flow down a column or across a row.', 'column'), justify: en(JUSTIFIES, 'Spread along', 'Where the items sit along the direction.', 'start'),
      align: en(FLOW_ALIGNS, 'Across', 'How the items line up across the direction (stretch fills it).', 'start'), gap: int(0, 120, 'Gap', 'Pixels between items.', 0),
    },
    common: ['place', 'bleed', 'rot', 'skew', 'origin', 'z', 'when', 'fill', 'ink', 'shadow', 'ring', 'border', 'pad', 'radius', 'grow', 'minH', 'w', 'h'],
  },
  text: {
    label: 'Text', group: 'Text', help: 'Words of the post (or the brand name, the folio, a list number) set in one of the look\'s type styles.',
    placement: 'required', flow: true, container: null, text: true,
    own: {
      field: field(TEXT_FIELDS, 'Field', 'Which of the post\'s words it shows (or choose a source).'), source: en(SOURCES, 'Source', 'The brand name, the folio or the index instead of a field.'),
      part: en(PARTS, 'Part', 'The whole text, the part before the emphasised phrase, the phrase, or what follows it.', 'all'),
      split: obj({ sep: en(SPLIT_SEPARATORS, 'Separator', 'What splits the text into parts.'), pick: oneOf([{ is: 'number', desc: int(0, 3, 'Part', 'Which part (0 is the first).') }, { is: 'string', desc: en(['rest'], 'Rest', 'Everything after the first part.') }], 'Pick', 'Which part to show, or "rest".') }, 'Split', 'Shows one part of a line like "12 Dec · 6pm · Place".', ['sep', 'pick']),
      format: en(FORMATS, 'Format', 'Sets a date as 12.12, a day, a month name, a two-digit number or a roman numeral.'),
      style: en(STYLES, 'Style', 'One of the look\'s type styles.'), size: int(14, 900, 'Size', 'Pixels (within the style\'s range).'),
      ladder: obj({ by: field(TEXT_FIELDS, 'Counted on', 'The field whose length picks the size.'), steps: list(tuple([int(1, 400, 'Up to', 'Characters.'), int(14, 900, 'Size', 'Pixels.')], 'Step', 'Up to this many characters, this size.'), LIMITS.ladderSteps, 'Steps', 'Longest text first to shortest size; each size smaller than the last.', { min: 1 }) }, 'Size by length', 'Steps down the size as the text gets longer.', ['by', 'steps']),
      shrinkFloor: num(0.82, 1, 'Smallest share', 'How far the page may shrink it to fit, as a share of its size (0.82 to 1).', { def: 0.82 }),
      emphasis: en(EMPHASES, 'Emphasis', 'How the *emphasised phrase* is set.', 'none'), align: en(ALIGNS, 'Align', 'Left, centre or right.', 'left'),
      upper: bool('Capitals', 'Sets it in capitals.', false), nowrap: bool('One line', 'Keeps it on one line.', false), vertical: en(['up', 'down'], 'Vertical', 'Runs it up or down the page (a label along an edge).'),
    },
    common: ['place', 'bleed', 'rot', 'origin', 'z', 'when', 'ink', 'w'],
  },
  'fitted-stack': {
    label: 'Fitted headline', group: 'Text', help: 'A headline sized by the page to fill its box: line by line (lines), edge to edge (fill) or all lines at the largest size that fits (block).',
    placement: 'required', flow: true, container: null, text: true, fitted: true,
    own: {
      field: field(['headline', 'quote'], 'Field', 'The headline or the quote.', 'headline'), mode: en(FIT_MODES, 'Mode', 'Each line as large as fits (lines), the ink filling the box (fill), or one size for all lines (block).'),
      cap: int(40, 400, 'Largest', 'The largest a line may be, in pixels (lines and fill).'), floor: int(24, 300, 'Smallest', 'Below this the image is refused, in pixels (lines and fill).'),
      maxLines: int(1, 5, 'Most lines', 'The most lines it may take.', 5), gapEm: num(0, 0.6, 'Line gap', 'Space between lines in em (fill).', { def: 0.24 }),
      valign: en(VALIGNS, 'Vertical', 'Where the lines sit in the box.', 'top'), emphasis: en(EMPHASES, 'Emphasis', 'How the *emphasised phrase* is set.', 'none'), emphasisOwnLine: bool('Emphasis on its own line', 'Sets the emphasised phrase on its own line.', false),
      sizes: list(int(24, 400, 'Size', 'Pixels.'), 8, 'Sizes', 'From the largest down; the largest that fits is used (block).', { min: 1 }), align: en(ALIGNS, 'Align', 'Left, centre or right.', 'left'),
    },
    common: ['place', 'bleed', 'z', 'when', 'ink', 'grow', 'minH', 'w'],
  },
  numeral: {
    label: 'Big figure', group: 'Text', help: 'A figure or a date set as large as the width allows, optionally with its unit beside or under it.',
    placement: 'required', flow: true, container: null, text: true, fitted: true,
    own: {
      field: field(['big', 'meta'], 'Field', 'The figure, or the line a date is read from.', 'big'), format: en(FORMATS, 'Format', 'How a date or number is set.'),
      cap: int(100, 900, 'Largest', 'The largest size, in pixels.'), min: int(60, 400, 'Smallest', 'Below this the image is refused, in pixels.'),
      baselineAt: en(BASELINES, 'Baseline on', 'Where its baseline sits: the page edge, the bottom margin or the bottom of its box.'),
      unit: obj({ field: field(['unit', 'label'], 'Field', 'The words under or beside the figure.'), style: en(STYLES, 'Style', 'Its type style.', 'label'), at: en(UNIT_AT, 'Where', 'Top right of the figure, under it, or on a bar.', 'under') }, 'Unit', 'Words with the figure.', ['field']),
    },
    common: ['place', 'bleed', 'rot', 'origin', 'z', 'when', 'ink', 'w'],
  },
  'mantra-rows': {
    label: 'Repeated headline', group: 'Text', help: 'The first part of the headline repeated as outline rows, the emphasised phrase once, solid, in the middle.',
    placement: 'required', flow: true, container: null, text: true, fitted: true,
    own: {
      field: field(['headline'], 'Field', 'The headline.', 'headline'), rmin: int(2, 7, 'Fewest rows', 'The fewest rows.', 3), rmax: int(2, 9, 'Most rows', 'The most rows.', 7),
      cap: int(40, 400, 'Largest', 'The largest a line may be, in pixels.'), floor: int(24, 300, 'Smallest', 'Below this the image is refused, in pixels.'), outline: int(2, 4, 'Outline', 'Outline width in pixels.', 3),
    },
    common: ['place', 'z', 'when', 'ink', 'grow', 'minH'],
  },
  rows: {
    label: 'Rows', group: 'Layout', help: 'One row for each item of a list (or each part of the event line): an optional number, then the words. One per composition.',
    placement: 'required', flow: true, container: null, text: true,
    own: {
      each: en(ROW_EACH, 'One row for each', 'Each list item, or each part of the event line.'), number: en(ROW_NUMBERS, 'Numbering', 'No number, 1 2 3, 01 02 03 or roman.', 'none'),
      numberStyle: en(STYLES, 'Number style', 'The type style of the number.', 'label'), numberSize: int(14, 300, 'Number size', 'Pixels.'),
      numberTile: obj({ size: int(40, 140, 'Size', 'Side of the square in pixels.'), fill: role('Fill', 'Tile colour.', 'accent'), ink: role('Ink', 'Number colour.', 'on-accent'), shadow: bool('Shadow', 'The look\'s hard shadow.', false) }, 'Number tile', 'Puts each number on a square tile.', ['size']),
      numberSpan: int(1, 4, 'Number columns', 'Sets the number in this many grid columns, the words after them.'),
      textStyle: en(STYLES, 'Words style', 'The type style of the words.', 'item'), textSize: int(14, 300, 'Words size', 'Pixels.'),
      altFill: tuple([role('First', 'Colour of the first row.'), role('Second', 'Colour of the second row.')], 'Alternate fills', 'Two colours, row by row.'),
      altRot: tuple([angle('First', 'Turn of the first number.'), angle('Second', 'Turn of the second number.')], 'Alternate turns', 'Two turns, row by row.'),
      rule: en(['none', ...RULE_WEIGHTS], 'Rule', 'A rule above each row.', 'none'), firstAccent: bool('First in accent', 'Sets the first number in the accent colour.', false),
      gap: int(0, 120, 'Gap', 'Pixels between the number and the words.', 0), rowMinH: int(0, 400, 'Least row height', 'Pixels.', 0),
      keys: list(en(ROW_KEYS, 'Label', 'A fixed label word.'), 3, 'Row labels', 'Fixed words before each row of an event table.', { min: 1 }),
    },
    common: ['place', 'z', 'when', 'ink', 'fill', 'pad', 'grow', 'minH', 'w'],
  },
  photo: {
    label: 'Picture', group: 'Pictures', help: 'The post\'s picture, cropped to a shape and treated in the look\'s way.',
    placement: 'required', flow: false, container: null, text: false,
    own: {
      shape: en(PHOTO_SHAPES, 'Shape', 'A rectangle, circle, arch, rounded rectangle, a card in a paper mount or a framed print.', 'rect'),
      treat: list(en(PHOTO_TREATS, 'Treatment', 'Grey, multiply, grain or punch.'), 4, 'Treatment', 'How the picture is treated; leave out to use the look\'s.', { unique: true }),
      border: int(0, 60, 'Mount', 'Width of a paper mount in pixels (print and card).'), keyline: int(0, 4, 'Keyline', 'Pixels.'),
      caption: en(['none', 'label', 'sub', 'by'], 'Caption', 'A caption under a print, from a field.', 'none'), tint: role('Tint', 'The colour of a multiply treatment.'),
    },
    common: ['place', 'bleed', 'rot', 'origin', 'z', 'when', 'radius', 'shadow', 'ring'],
  },
  seam: {
    label: 'Slanted split', group: 'Pictures', help: 'The page cut across by a slanted edge: a picture or colour above, a page colour below, with a thin edge.',
    placement: 'none', flow: false, container: null, text: false,
    own: {
      leftY: int(0, 1350, 'Left height', 'Where the edge meets the left of the page, in pixels from the top.'), rightY: int(0, 1350, 'Right height', 'Where it meets the right of the page.'),
      edge: int(0, 32, 'Edge', 'Thickness of the thin edge in pixels.', 0), upper: en(['photo', 'field'], 'Above', 'The picture or the colour field.', 'photo'), lower: en(GROUNDS, 'Below', 'The page colour below the edge.'),
      edgeFill: role('Edge colour', 'The colour of the thin edge.', 'paper'),
    },
    common: ['z', 'when'],
  },
  band: {
    label: 'Band', group: 'Layout', help: 'A full-width band, turned by an angle and wider than the page so its ends never show. Items flow in it.',
    placement: 'none', flow: false, container: 'any', text: false,
    own: { y: num(-300, 1700, 'Top', 'Where its top sits when straight, in pixels.', { int: true }), h: int(1, 1700, 'Height', 'Pixels.'), gap: int(0, 120, 'Gap', 'Pixels between items.', 0) },
    common: ['rot', 'origin', 'z', 'when', 'fill', 'ink', 'pad', 'shadow'],
  },
  sticker: {
    label: 'Sticker', group: 'Shapes', help: 'A circle, pill, tile, stamp or seal carrying a short word, a price or a date.',
    placement: 'required', flow: true, container: 'text', text: false,
    own: {
      shape: en(STICKER_SHAPES, 'Shape', 'Circle, pill, tile, stamp (a dashed ring inside) or seal (the brand name round it).', 'circle'), size: int(40, 600, 'Size', 'Side or width of a circle, stamp, seal or tile, in pixels.'),
      w: int(40, 900, 'Width', 'Width of a pill or tile, in pixels.'), h: int(40, 600, 'Height', 'Height of a pill or tile, in pixels.'),
      field: field(SHORT_FIELDS, 'Field', 'The short words it carries (or give it text items).'),
      ladder: obj({ by: field(SHORT_FIELDS, 'Counted on', 'The field whose length picks the size.'), steps: list(tuple([int(1, 400, 'Up to', 'Characters.'), int(14, 900, 'Size', 'Pixels.')], 'Step', 'Up to this many characters, this size.'), LIMITS.ladderSteps, 'Steps', 'Longest text first to smallest size.', { min: 1 }) }, 'Size by length', 'Steps down the size as the words get longer.', ['by', 'steps']),
      textSize: int(14, 400, 'Text size', 'Pixels, when the size does not change with length.'),
    },
    common: ['place', 'rot', 'origin', 'z', 'when', 'fill', 'ink', 'shadow', 'ring'],
  },
  rule: {
    label: 'Rule', group: 'Shapes', help: 'A line.', placement: 'required', flow: true, container: null, text: false,
    own: { weight: oneOf([{ is: 'string', desc: en(RULE_WEIGHTS, 'Weight', 'Hair or heavy, as the look sets them.') }, { is: 'number', desc: int(1, 16, 'Weight', 'Pixels.') }], 'Weight', 'Hair, heavy or a number of pixels.', 'hair'), vertical: bool('Vertical', 'Runs up and down.', false), colour: role('Colour', 'The line colour.', 'rule') },
    common: ['place', 'bleed', 'z', 'when', 'w', 'h'],
  },
  block: {
    label: 'Colour block', group: 'Shapes', help: 'A solid block of colour (a bar, a square, a dot).', placement: 'required', flow: true, container: null, text: false,
    own: { colour: role('Colour', 'The block colour.', 'accent') },
    common: ['place', 'bleed', 'rot', 'skew', 'origin', 'z', 'when', 'radius', 'shadow', 'w', 'h'],
  },
  frame: {
    label: 'Frame', group: 'Shapes', help: 'A solid border round the whole page, as thick as the look\'s frame.', placement: 'none', flow: false, container: null, text: false,
    own: { colour: role('Colour', 'The frame colour.', 'field'), t: int(0, 160, 'Thickness', 'Pixels; leave out to use the look\'s frame.') },
    common: ['z', 'when'],
  },
  keyline: {
    label: 'Keyline', group: 'Shapes', help: 'A thin outlined box.', placement: 'required', flow: false, container: null, text: false,
    own: { weight: int(1, 8, 'Weight', 'Pixels.', 1), colour: role('Colour', 'The line colour.', 'rule') },
    common: ['place', 'z', 'when', 'radius'],
  },
  glyph: {
    label: 'Big mark', group: 'Shapes', help: 'A large decorative mark, such as an opening quotation mark. Decoration, never read as type.', placement: 'required', flow: false, container: null, text: false,
    own: { glyph: en(GLYPHS, 'Mark', 'Which mark.'), size: int(40, 1100, 'Size', 'Pixels.'), colour: role('Colour', 'The mark colour.', 'accent') },
    common: ['place', 'rot', 'z', 'when'],
  },
  'meta-row': {
    label: 'Top label row', group: 'Layout', help: 'The row of small labels across the top, built from the look\'s own cells (label, brand name, folio) between two rules.', placement: 'none', flow: false, container: null, text: true,
    own: { tone: en(['ink', 'light'], 'Tone', 'Dark type, or light type for a row over a picture.', 'ink') },
    common: ['z', 'when'],
  },
  'wordmark-pattern': {
    label: 'Brand name pattern', group: 'Shapes', help: 'The brand name repeated at low strength as a texture.', placement: 'required', flow: false, container: null, text: false,
    own: { size: int(24, 300, 'Size', 'Pixels.'), altItalic: bool('Italic every second row', 'Italics on alternate rows.', false), fade: bool('Fade', 'Fades the texture out downwards.', false), fadeFrom: int(0, 95, 'Fade from', 'Percent of its height where it starts to fade.'), colour: role('Colour', 'The texture colour.', 'ink') },
    common: ['place', 'z', 'when'],
  },
  scrim: {
    label: 'Dark fade behind the text', group: 'Pictures', help: 'A fade over a picture, behind text, that darkens until the text reads.', placement: 'required', flow: false, container: null, text: false,
    own: { need: num(3, 7, 'Contrast', 'The contrast the text must reach (3 to 7).', { def: 4.5 }), floor: num(0.2, 0.9, 'Least strength', 'Share of full strength.', { def: 0.45 }), cap: num(0.5, 0.98, 'Most strength', 'Share of full strength.', { def: 0.92 }), fade: int(0, 200, 'Fade length', 'Pixels.', 56), colour: role('Colour', 'The fade colour.', 'ink') },
    common: ['place', 'z', 'when'],
  },
  'punch-hole': {
    label: 'Punched hole', group: 'Shapes', help: 'A round hole, as in a hang tag.', placement: 'required', flow: false, container: null, text: false,
    own: { size: int(20, 120, 'Size', 'Pixels.', 44) },
    common: ['place', 'z', 'when', 'fill', 'ring'],
  },
});
export const ELEMENT_TYPES = Object.keys(ELEMENTS);
// The own properties an element must give (the others have defaults).
export const REQUIRED_OWN = Object.freeze({
  'fitted-stack': ['mode'], numeral: ['cap', 'min'], 'mantra-rows': ['cap', 'floor'], rows: ['each'], seam: ['leftY', 'rightY', 'lower'], band: ['y', 'h'], glyph: ['glyph'], 'wordmark-pattern': ['size'],
});
// The elements that may be placed only at the top of a composition (their own geometry), the types that may go in a box.
export const TOP_ONLY = ELEMENT_TYPES.filter((t) => ELEMENTS[t].placement === 'none');
export const FLOWING = ELEMENT_TYPES.filter((t) => ELEMENTS[t].flow);
export const CONTAINERS = ELEMENT_TYPES.filter((t) => ELEMENTS[t].container);
// Every property name an element of a type takes (the validator's allow-list and the catalogue's property list).
export const keysOf = (type) => ['type', ...Object.keys(ELEMENTS[type].own), ...ELEMENTS[type].common, ...(ELEMENTS[type].container ? ['children'] : [])];
// The descriptor of a property of an element type.
export const descriptorOf = (type, name) => (Object.hasOwn(ELEMENTS[type].own, name) ? ELEMENTS[type].own[name] : COMMON[name]);

// ---- the look-level sections ----
const marginSide = (l) => int(0, 300, l, 'Pixels.');
const weight = (label) => int(100, 900, label, 'Font weight, 100 to 900.');
const FONT_PROPS = {
  library: obj({
    source: en(['library'], 'Source', 'A font of the engine\'s library.'), family: text(40, 'Family', 'A family of the font library.'),
    weights: list(int(100, 900, 'Weight', 'Font weight.'), 4, 'Weights', 'The weights used (up to four, within what the family has).', { min: 1, unique: true }),
    stretch: num(50, 150, 'Width', 'Font width in percent, for families that have it.', { int: true }), italic: bool('Italic', 'Also embeds the italic.', false),
  }, 'Library font', 'A font from the library.', ['source', 'family', 'weights']),
  brand: obj({ source: en(['brand'], 'Source', 'The brand\'s own font.'), role: en(['display', 'label', 'sans', 'mono'], 'Role', 'Which of the brand\'s fonts.') }, 'Brand font', 'The font the brand brought for this role.', ['source', 'role']),
};
const FONT = d({ kind: 'tagged', key: 'source', forms: FONT_PROPS }, 'Font', 'A library font or the brand\'s own.');
export const SECTIONS = Object.freeze({
  canvas: obj({
    feed: obj({
      margin: obj({ top: marginSide('Top'), right: marginSide('Right'), bottom: marginSide('Bottom'), left: marginSide('Left') }, 'Margins', 'Pixels round the page.', ['top', 'right', 'bottom', 'left']),
      grid: obj({
        cols: int(1, 24, 'Columns', 'Columns of the page grid.'), gutter: int(0, 80, 'Gutter', 'Pixels between columns and rows.'),
        rows: int(0, 16, 'Rows', 'Rows of the page grid, counting the top label row (0: no rows).', 0), head: int(0, 120, 'Top row height', 'Height of the first row, for the top label row (0: all rows equal).', 0),
      }, 'Grid', 'Columns, gutter and rows.', ['cols', 'gutter']),
      extraLines: list(int(0, 1080, 'Line', 'Pixels from the left.'), 4, 'Extra text lines', 'Further vertical lines text may start on.', { def: [] }),
    }, 'Square feed post', 'The page of a feed post (1080 by 1350).', ['margin', 'grid']),
  }, 'Page', 'The page grid.', ['feed']),
  fonts: obj({ display: FONT, text: FONT, label: FONT, mono: FONT }, 'Fonts', 'The four font roles.', ['display', 'text', 'label']),
  type: obj({
    display: obj({
      lead: num(0.78, 1.2, 'Line height', 'Headline line height (a multiple of the size).'), track: num(-0.06, 0.02, 'Tracking', 'Headline letter spacing in em.'), weight: weight('Weight'),
      case: en(['as-typed', 'upper'], 'Case', 'As typed, or capitals.', 'as-typed'), ladder: list(num(0.6, 1, 'Step', 'A share of the first size.'), 4, 'Size steps', 'The sizes a headline steps down through, as shares of the first (1, 0.9, 0.82).', { min: 2, def: [1, 0.9, 0.82] }),
      trim: en(['cap', 'none'], 'Trim', 'Trims the space above the cap line and below the baseline so type sits on the grid.', 'none'), optical: bool('Optical alignment', 'Pulls each line left by its first letter\'s side space so the ink sits on the margin.', false),
    }, 'Headline type', 'How headlines are set.', ['lead', 'track', 'weight']),
    body: obj({
      size: en(BODY_SIZES, 'Size', 'Pixels.'), lead: num(1.1, 1.7, 'Line height', 'A multiple of the size.'), weight: weight('Weight'), strength: en([1, 0.8], 'Strength', 'Full ink (1) or ink at 80% for body copy.', 1),
    }, 'Body type', 'How the sub line and other copy is set.', ['size', 'lead', 'weight']),
    item: obj({ size: en(ITEM_SIZES, 'Size', 'Pixels.'), lead: num(1, 1.5, 'Line height', 'A multiple of the size.'), weight: weight('Weight') }, 'List item type', 'How list items are set.', ['size', 'lead', 'weight']),
    label: obj({
      size: en(LABEL_SIZES, 'Size', 'Pixels.'), track: num(-0.02, 0.2, 'Tracking', 'Letter spacing in em.'), weight: weight('Weight'), upper: bool('Capitals', 'Sets labels in capitals.', true),
      role: en(['label', 'mono'], 'Font', 'Which font role labels use.', 'label'),
    }, 'Label type', 'How small labels are set.', ['size', 'track', 'weight']),
    numeral: obj({ track: num(-0.08, 0.02, 'Tracking', 'Letter spacing in em.', { def: -0.04 }), figures: en(['lining', 'oldstyle'], 'Figures', 'Lining or old-style figures.', 'lining') }, 'Figure type', 'How big figures are set.'),
  }, 'Type', 'The look\'s type styles.', ['display', 'body', 'label']),
  colour: obj({
    logic: en(COLOUR_LOGICS, 'Colour logic', 'Tonal (paper and ink), one accent, or a colour field.'), field: en(['primary', 'dark'], 'Field', 'Which colour a field is.', 'primary'),
    sticker: en(['accent', 'primary'], 'Stickers', 'Which colour stickers are.', 'accent'), accentAsType: en(['never', 'when-contrast'], 'Accent as type', 'Whether the accent may be type: never, or where it has enough contrast.', 'never'),
    grounds: list(en(GROUNDS, 'Page colour', 'A page colour.'), 5, 'Page colours', 'The page colours compositions may use.', { min: 1, unique: true }),
  }, 'Colour', 'How the brand\'s colours are used.', ['logic', 'grounds']),
  devices: obj({
    rule: obj({ hair: int(1, 4, 'Hairline', 'Pixels.', 1), heavy: int(2, 12, 'Heavy rule', 'Pixels.', 4) }, 'Rules', 'The two rule weights.'),
    frame: obj({ t: int(0, 160, 'Thickness', 'Pixels.', 0), pad: int(0, 120, 'Padding', 'Space inside the frame in pixels.', 0) }, 'Frame', 'The frame round the page.'),
    highlight: obj({ pad: tuple([num(0, 0.4, 'Top', 'em'), num(0, 0.4, 'Right', 'em'), num(0, 0.4, 'Bottom', 'em'), num(0, 0.4, 'Left', 'em')], 'Padding', 'Top, right, bottom, left in em.'), tilt: num(-3, 3, 'Turn', 'Degrees.') }, 'Highlight bar', 'The bar behind an emphasised phrase.'),
    shadow: obj({ x: int(-24, 24, 'Across', 'Pixels.', 0), y: int(-24, 24, 'Down', 'Pixels.', 0), colour: role('Colour', 'The shadow colour.', 'ink') }, 'Hard shadow', 'The look\'s hard shadow.', ['x', 'y']),
    angles: obj(Object.fromEntries(ANGLE_NAMES.map((n) => [n, num(-15, 15, n[0].toUpperCase() + n.slice(1), 'Degrees, -15 to 15.', { def: 0 })])), 'Angles', 'The named angles elements turn by.'),
    metaRow: obj({
      cells: list(obj({ source: en(METAROW_SOURCES, 'Shows', 'The label, the brand name or the folio.'), col: int(1, 24, 'Column', 'First column.'), span: int(1, 24, 'Columns', 'How many columns.'), align: en(ALIGNS, 'Align', 'Left, centre or right.', 'left') }, 'Cell', 'One cell of the row.', ['source', 'col', 'span']), 4, 'Cells', 'Up to four cells.', { min: 1 }),
      ruleTop: int(0, 12, 'Rule above', 'Pixels.', 0), ruleBelow: int(0, 12, 'Rule below', 'Pixels.', 0),
    }, 'Top label row', 'The cells of the top label row.', ['cells']),
    folio: en(FOLIOS, 'Folio', 'The post\'s number: none, 07, or 07/12.', 'no'),
    wordmark: obj({ opacity: num(0.02, 0.08, 'Strength', 'How strong the brand name pattern is.', { def: 0.05 }), sep: en(WORDMARK_SEPS, 'Separator', 'What stands between the repeats.', 'dash') }, 'Brand name pattern', 'How the pattern is set.'),
  }, 'Devices', 'Rules, frame, shadow, angles and the other devices.'),
  photo: obj({ treat: list(en(PHOTO_TREATS, 'Treatment', 'Grey, multiply, grain or punch.'), 4, 'Treatment', 'How pictures are treated.', { unique: true, def: [] }), tint: role('Tint', 'The colour of a multiply treatment.', 'primary') }, 'Pictures', 'How pictures are treated.'),
  logo: obj({ default: en(['off', 'corner'], 'Logo', 'No logo, or the brand\'s logo in a corner.', 'off'), height: int(24, 80, 'Height', 'Pixels.', 44) }, 'Logo', 'The brand logo.'),
  dials: obj({ tilt: num(0, 1.5, 'Tilt', 'Scales every angle (0 straight, 1 as set, 1.5 more).', { def: 1 }), density: num(-1, 1, 'Density', 'Tighter (-1) to looser (1) spacing.', { def: 0 }), weightShift: int(-100, 100, 'Weight shift', 'Lighter (-100) to heavier (100) type.', 0) }, 'Dials', 'Three dials that adjust the whole look.'),
});
export const SECTION_NAMES = Object.keys(SECTIONS);
