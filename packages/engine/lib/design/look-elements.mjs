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
import {
  ALIGNS, ANGLE_NAMES, BASELINES, BODY_SIZES, ROTATE_GROUNDS, BORDER_STYLES, COLOUR_LOGICS, EDGES, EMPHASES, FIT_MODES, FLOW_ALIGNS, FOLIOS, FONT_ROLES, FORMATS, GLYPHS, GROUNDS, ITEM_SIZES, JUSTIFIES, LABEL_SIZES, LENGTH_TOKENS, LIMITS,
  METAROW_SOURCES, ORIGINS, PARTS, PHOTO_SHAPES, PHOTO_TREATS, ROW_EACH, ROW_KEYS, ROW_NUMBERS, RULE_WEIGHTS, SHADOWS, SOFT_SHADOWS, CORNERS, ROUND_SHAPES, RULE_STYLES, SHORT_FIELDS, SIZE_RANGE, SOURCES, SPLIT_SEPARATORS, STICKER_SHAPES, STYLES, TEXT_FIELDS, UNIT_AT, VALIGNS, WORDMARK_SEPS,
  WORDS, BLENDS,
  angle, bool, d, en, field, int, length, list, num, obj, oneOf, role, text, tuple,
} from './look-desc.mjs';
import { GRADIENT_AT, GRADIENT_KINDS, GRADIENT_SHAPES, GRADIENT_STOPS, GRAPHIC_SIZES, GRAPHIC_SLOTS, OVERLAY_FROM, VAULT_REF, gradientDesc, swashDesc, SWASH_SHAPES, SWASH_WORDS, SWASH_WEIGHTS } from './look-desc.mjs';
import { BACKDROP_MASKS, BACKDROP_PATTERNS, OVERLAP_MAX, OVERLAP_WITH, SHAPE_KEYS } from './look-desc.mjs';
import * as fittedStack from './directions/primitives/fitted-stack.mjs';
import * as numeral from './directions/primitives/numeral.mjs';
import * as mantraRows from './directions/primitives/mantra-rows.mjs';
import * as rows from './directions/primitives/rows.mjs';
import * as seam from './directions/primitives/seam.mjs';
import * as band from './directions/primitives/band.mjs';
import * as metaRow from './directions/primitives/meta-row.mjs';
import * as wordmarkPattern from './directions/primitives/wordmark-pattern.mjs';
import * as scrim from './directions/primitives/scrim.mjs';
import * as punchHole from './directions/primitives/punch-hole.mjs';
import * as gradient from './directions/primitives/gradient.mjs';
import * as overlay from './directions/primitives/overlay.mjs';
import * as graphic from './directions/primitives/graphic.mjs';
import * as infoRows from './directions/primitives/info-rows.mjs';
import * as button from './directions/primitives/button.mjs';
import * as photoRow from './directions/primitives/photo-row.mjs';
import * as tapedPhoto from './directions/primitives/taped-photo.mjs';
import * as paperTexture from './directions/primitives/paper-texture.mjs';
import * as iconBadge from './directions/primitives/icon-badge.mjs';
import * as avatar from './directions/primitives/avatar.mjs';
import * as device from './directions/primitives/device.mjs';
import * as ribbon from './directions/primitives/ribbon.mjs';
import * as chart from './directions/primitives/chart.mjs';
import * as backdrop from './directions/primitives/backdrop.mjs';
// the shapes of a headline's pills (kit.mjs PILL_SHAPES)
export const PILL_SHAPES = ['pill', 'soft', 'outline'];
export { ALIGNS, ANGLE_NAMES, BASELINES, BODY_SIZES, BORDER_STYLES, COLOUR_LOGICS, EDGES, EMPHASES, FIT_MODES, FLOW_ALIGNS, FOLIOS, FORMATS, GLYPHS, GROUNDS, ITEM_SIZES, JUSTIFIES, LABEL_SIZES, LENGTH_TOKENS, LIMITS, METAROW_SOURCES, ORIGINS, PARTS, PHOTO_SHAPES, PHOTO_TREATS, ROW_EACH, ROW_KEYS, ROW_NUMBERS, RULE_WEIGHTS, SHADOWS, SOFT_SHADOWS, CORNERS, ROUND_SHAPES, RULE_STYLES, SHORT_FIELDS, SIZE_RANGE, SOURCES, SPLIT_SEPARATORS, STICKER_SHAPES, STYLES, TEXT_FIELDS, UNIT_AT, VALIGNS, WORDMARK_SEPS, WORDS, BLENDS };
export { GRADIENT_AT, GRADIENT_KINDS, GRADIENT_SHAPES, GRADIENT_STOPS, GRAPHIC_SIZES, GRAPHIC_SLOTS, OVERLAY_FROM, VAULT_REF, SWASH_SHAPES, SWASH_WORDS, SWASH_WEIGHTS };
export { BACKDROP_MASKS, BACKDROP_PATTERNS, OVERLAP_MAX, OVERLAP_WITH, SHAPE_KEYS };
export const PRIMITIVES = Object.freeze({ 'fitted-stack': fittedStack, numeral, 'mantra-rows': mantraRows, rows, seam, band, 'meta-row': metaRow, 'wordmark-pattern': wordmarkPattern, scrim, 'punch-hole': punchHole,
  // gradients, colour over a picture, brand graphics and cut-outs
  gradient, overlay, graphic,
  // info rows, a button and a row of round pictures
  'info-rows': infoRows, button, 'photo-row': photoRow,
  // a picture taped on at an angle, a paper texture, one of the engine's icons drawn large, bare or on a badge (a sticker, a trust mark),
  // and a ribbon across a corner of the page
  'taped-photo': tapedPhoto, 'paper-texture': paperTexture, 'icon-badge': iconBadge, ribbon,
  // a chart drawn from the post's numbers (bars, a line, a sparkline, a donut, a progress bar), one portrait picture of the person quoted (the
  // post's avatar), a phone or tablet drawn round a bare screenshot, and a decorative background (a pattern of brand colours drawn from bounded numbers)
  chart, avatar, device, backdrop });

export const LOOK_SCHEMA = 1;
export const KINDS = [...POST_KINDS];
export { POST_FIELDS, POST_ITEMS, POST_REQUIRED };

// The palette roles of a post (the names kit.mjs COLOUR_NAMES resolves to --c-* custom properties of colour.mjs palette()). A copy, so that
// this pure module loads without the builders; test-design-look.mjs holds it equal to the kit's list. A look names a role, never a hex.
export const COLOUR_NAMES = Object.freeze(['paper', 'ink', 'white', 'dark', 'primary', 'field', 'on-field', 'gold', 'gold-deep', 'accent', 'accent-dark', 'on-accent', 'on-primary', 'body', 'soft', 'muted', 'body-dark', 'muted-dark', 'rule', 'rule-soft', 'rule-dark', 'rule-field', 'accent-type', 'body-field', 'field-deep', 'paper-warm', 'light-tint', 'field-text', 'tint-deep']);

export const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
// a copy of a shipped or own look, or "starter": made from the engine's blank starter (look-starter.mjs)
export const ORIGIN = /^(copy:(shipped|own):[a-z0-9][a-z0-9-]{0,39}|starter)$/;
// The feed page (1080 x 1350): the only size a look draws today (other sizes come with a later step).
export const PAGE = Object.freeze({ w: 1080, h: 1350 });
// The keys no look may carry, at any depth.
export const FORBIDDEN_KEYS = Object.freeze(['render', '__proto__', 'constructor', 'prototype']);

// ---- the fields of a post, per kind ----
// Which fields a composition of a kind may use (a superset of the compositions of the shipped directions); the required ones come
// from POST_REQUIRED and must be declared required.
// cta (a button's words), info (an info block's rows) and gallery (a row of round pictures) are the optional parts a post may add; they come last.
// A figure may carry a tag (a small change pill such as "+12%"), a quote a gallery (round pictures of the people quoted) or an avatar (one portrait
// picture of the person quoted); an event may carry an avatar too (the speaker).
// Any kind but a quote may carry a chart (chart.mjs: a bar or line chart, a sparkline, a donut or a progress bar drawn from its numbers).
export const KIND_FIELDS = Object.freeze({
  statement: ['label', 'headline', 'sub', 'cta', 'info', 'gallery', 'chart'],
  figure: ['label', 'headline', 'big', 'unit', 'sub', 'image', 'tag', 'chart'],
  list: ['label', 'headline', 'sub', 'items', 'cta', 'chart'],
  quote: ['label', 'quote', 'by', 'gallery', 'avatar'],
  photo: ['label', 'image', 'headline', 'sub', 'tag', 'cta', 'info', 'gallery', 'chart'],
  event: ['label', 'image', 'headline', 'meta', 'sub', 'tag', 'cta', 'info', 'gallery', 'avatar', 'chart'],
  offer: ['label', 'image', 'headline', 'tag', 'sub', 'unit', 'cta', 'info', 'gallery', 'chart'],
});
// the counted lists of a post (POST_LISTS) and its picture
export const LIST_FIELDS = ['items', 'info', 'gallery'];
// the fields that are a picture: the post's own and the portrait picture of a quotation
export const PICTURE_FIELDS = ['image', 'avatar'];
export const FIELD_NAMES = [...TEXT_FIELDS, ...LIST_FIELDS, ...PICTURE_FIELDS, 'chart'];

// ---- the common properties of elements ----
export const COMMON = Object.freeze({
  place: d({ kind: 'place' }, 'Place', 'Where it goes: on the page grid, at pixel positions, anchored to the edges, or filling the page, margins or frame. Inside a box, leave it out to flow with the other items.'),
  bleed: obj({
    edges: list(en(EDGES, 'Edge', 'A page edge.'), 4, 'Edges', 'The page edges it runs over, only edges it touches.', { min: 1, unique: true }),
    by: num(0, 0.2, 'By', 'How far past the edge, as a share of its own size (0 to 0.2).', { def: 0.05 }),
  }, 'Run to the page edge', 'Lets a picture, block or numeral run over the margin to the page edge.', ['edges']),
  rot: angle('Turn', 'A named angle of the look, or from -15 to 15 degrees.', 0),
  skew: num(-6, 6, 'Slant', 'Slants a plain colour block, from -6 to 6 degrees (a block with no rounded corners, shadow or flowing place).', { def: 0 }),
  origin: en(ORIGINS, 'Turn about', 'The point it turns around.', 'center'),
  originPct: tuple([int(0, 100, 'Across', 'Percent across the element (0 left, 100 right).'), int(0, 100, 'Down', 'Percent down the element (0 top, 100 bottom).')], 'Turn about (percent)', 'The point it turns around, as percentages across and down; use this or the named point, not both.'),
  z: int(0, 9, 'Layer', 'Drawing order, 0 at the back to 9 at the front.', 0),
  when: d({ kind: 'when' }, 'Show when', 'Shown only when a field is filled (present) or empty (absent); both must hold when both are given.'),
  fill: role('Fill', 'The colour it is filled with (a role of the brand\'s colours).'),
  ink: role('Ink', 'The colour of the type on it (a role of the brand\'s colours).'),
  shadow: oneOf([{ is: 'string', desc: en([...SHADOWS, ...SOFT_SHADOWS], 'Shadow', 'The look\'s own hard shadow, or a soft one: "soft" (a gentle shadow just below) or "lift" (a deeper, wider one).') }, {
    is: 'object', desc: obj({ x: int(-24, 24, 'Across', 'Pixels across.'), y: int(-24, 24, 'Down', 'Pixels down.'), colour: role('Colour', 'The shadow colour.', 'ink') }, 'Shadow', 'A hard shadow, no blur.', ['x', 'y']),
  }], 'Shadow', 'The look\'s hard shadow ("hard") or your own.'),
  ring: obj({ w: int(0, 16, 'Width', 'Pixels.'), colour: role('Colour', 'The ring colour.') }, 'Ring', 'A ring just outside it.', ['w', 'colour']),
  border: obj({ w: int(0, 16, 'Width', 'Pixels.'), colour: role('Colour', 'The border colour.', 'ink'), style: en(BORDER_STYLES, 'Style', 'Solid or dashed.', 'solid') }, 'Border', 'A border inside its edge.', ['w']),
  pad: oneOf([{ is: 'number', desc: int(0, 200, 'Padding', 'Pixels on every side.') }, { is: 'array', desc: tuple([int(0, 200, 'Top', ''), int(0, 200, 'Right', ''), int(0, 200, 'Bottom', ''), int(0, 200, 'Left', '')], 'Padding', 'Top, right, bottom, left in pixels.') }], 'Padding', 'The space inside it, in pixels (one number, or top, right, bottom, left).'),
  radius: oneOf([{ is: 'number', desc: int(0, 200, 'Corner radius', 'Pixels.') }, { is: 'string', desc: en(ROUND_SHAPES, 'Round', 'Fully round ("full": a circle on a square, a pill on a long box), an oval (an ellipse) or an arch (a rounded top, square foot).') }], 'Corners', 'Corner radius in pixels, or "full", "oval" or "arch".'),
  corners: en(CORNERS, 'Which corners', 'Which corners the radius rounds: all, the top two, the bottom two, the left two or the right two.', 'all'),
  // only for an item that flows in a box (no place of its own)
  grow: int(0, 4, 'Share of the space', 'How much of the free height a flowing item takes (0 to 4).'),
  minH: int(0, 1350, 'Least height', 'The least height in pixels.'),
  w: length(1, 1200, 'Width', 'Width of a flowing item: pixels, or margin, gutter, col, frame, frame+pad.'),
  h: length(1, 1350, 'Height', 'Height of a flowing item: pixels, or a token.'),
  before: int(-40, 120, 'Space before', 'Extra space above a flowing item, in pixels (on top of the gap); a small negative number pulls it up.'),
  nudgeX: int(-120, 120, 'Move across', 'Moves a flowing item across by this many pixels (negative: left).'),
  alignSelf: en(FLOW_ALIGNS, 'Line up across', 'How a flowing item lines up across its box, whatever the box says for the others (stretch makes it as tall or wide as the box).'),
  textShadow: oneOf([{ is: 'string', desc: en(SHADOWS, 'Shadow', 'The look\'s own hard shadow.') }, {
    is: 'object', desc: obj({ x: int(-24, 24, 'Across', 'Pixels across.'), y: int(-24, 24, 'Down', 'Pixels down.'), colour: role('Colour', 'The shadow colour.', 'ink') }, 'Shadow', 'A hard shadow behind the letters, no blur.', ['x', 'y']),
  }], 'Letter shadow', 'A hard shadow behind the letters: the look\'s ("hard") or your own.'),
  // a box filled with a gradient instead of one colour (not with fill)
  gradient: gradientDesc('Gradient fill', 'Fills it with a blend of two or three of the brand\'s colours instead of one (leave out fill).'),
  // a name for a filled shape (one of a fixed list), so that a text may be allowed to cross its edge on purpose
  key: en(SHAPE_KEYS, 'Name for crossing', 'Names this shape (a to f) so that a text of the composition may cross its edge on purpose (that text\'s overlap names it).'),
  // a text that crosses the edge of a shape on purpose: the "text meets the edge of a block" check skips only this pairing
  overlap: obj({
    with: en(OVERLAP_WITH, 'Crosses', 'The shape whose edge the words may cross: a shape named with key (a to f), or any shape of the composition.'),
    allow: bool('Allowed', 'Must be true: the words cross that edge on purpose. Leave overlap out to keep the edge check for every shape.'),
    outline: obj({ colour: role('Colour', 'The outline colour.'), w: int(2, 12, 'Width', 'Pixels.') }, 'Outline', 'An outline round the letters, for words that must read on two grounds; the outline must itself reach the contrast on every part of the ground, and the ink on the outline.', ['colour', 'w']),
  }, 'Crosses a shape\'s edge', 'Lets the words cross the edge of one shape on purpose (a headline breaking out of its panel or across a circle). Every part of the words is still measured for contrast on the pixels under it.', ['with', 'allow']),
});
// The properties only an item flowing in a box takes.
export const FLOW_ONLY = ['grow', 'minH', 'w', 'h', 'before', 'nudgeX', 'alignSelf'];

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
  minH: int(0, 600, 'Least height', 'The least height of a box placed here, in pixels (it grows with its content).'), square: bool('Square', 'As tall as it is wide (a grid place: the height is the width; with rows it sits at the foot or top of them).', false),
});

// ---- the element types ----
// placement: 'required' (a top-level element has exactly one form of place; inside a box it flows unless it is a type that cannot),
// 'none' (the element has its own geometry and takes no place). flow: it may flow in a box. container: what it may hold.
// text: its words must read (the text-over-photo check). fitted: sized to its box by the runtime.
const SPEC_FIELDS = field(TEXT_FIELDS, 'Field', 'Which of the post\'s words it shows.');
const ELEMENTS_BASE = {
  box: {
    label: 'Box', group: 'Layout', help: 'A container: items flow in it in a column or a row, or sit in it at places of their own. May have a fill, padding, a shadow, a turn.',
    placement: 'required', flow: true, container: 'any', text: false,
    own: {
      flow: en(['column', 'row'], 'Direction', 'Items flow down a column or across a row.', 'column'), justify: en(JUSTIFIES, 'Spread along', 'Where the items sit along the direction.', 'start'),
      align: en(FLOW_ALIGNS, 'Across', 'How the items line up across the direction (stretch fills it).', 'start'), gap: int(0, 120, 'Gap', 'Pixels between items.', 0),
    },
    common: ['place', 'bleed', 'rot', 'origin', 'originPct', 'z', 'when', 'fill', 'ink', 'shadow', 'ring', 'border', 'pad', 'radius', 'corners', 'grow', 'minH', 'w', 'h', 'before', 'nudgeX', 'alignSelf', 'gradient', 'key'],
  },
  text: {
    label: 'Text', group: 'Text', help: 'Words of the post (or the brand name, the folio, a list number) set in one of the look\'s type styles.',
    placement: 'required', flow: true, container: null, text: true,
    own: {
      field: field(TEXT_FIELDS, 'Field', 'Which of the post\'s words it shows (or choose a source).'), source: en(SOURCES, 'Source', 'The brand name, the folio, the index, the brand\'s web address, or "Swipe" with an arrow (only on a carousel page that has a page after it) instead of a field.'),
      word: en(WORDS, 'Word', 'One of a few fixed words (such as Myth or Fact) instead of a field.'),
      part: en(PARTS, 'Part', 'The whole text, the part before the emphasised phrase, the phrase, or what follows it.', 'all'),
      split: obj({ sep: en(SPLIT_SEPARATORS, 'Separator', 'What splits the text into parts.'), pick: oneOf([{ is: 'number', desc: int(0, 3, 'Part', 'Which part (0 is the first).') }, { is: 'string', desc: en(['rest'], 'Rest', 'Everything after the first part.') }], 'Pick', 'Which part to show, or "rest".') }, 'Split', 'Shows one part of a line like "12 Dec · 6pm · Place".', ['sep', 'pick']),
      format: en(FORMATS, 'Format', 'Sets a date as 12.12, a day, a month name, a two-digit number or a roman numeral.'),
      style: en(STYLES, 'Style', 'One of the look\'s type styles.'), size: int(14, 900, 'Size', 'Pixels (within the style\'s range).'),
      ladder: obj({ by: field(TEXT_FIELDS, 'Counted on', 'The field whose length picks the size.'), steps: list(tuple([int(1, 400, 'Up to', 'Characters.'), int(14, 900, 'Size', 'Pixels.')], 'Step', 'Up to this many characters, this size.'), LIMITS.ladderSteps, 'Steps', 'Longest text first to shortest size; each size smaller than the last.', { min: 1 }), maxLines: int(1, 8, 'Most lines', 'The page sets the text at the largest step at which it takes at most this many lines (and fits maxH).'), maxH: int(40, 900, 'Most height', 'The page sets the text at the largest step at which it is at most this tall, in pixels.') }, 'Size by length', 'Steps down the size as the text gets longer; the page measures which step fits.', ['by', 'steps']),
      emphasis: en(EMPHASES, 'Emphasis', 'How the *emphasised phrase* is set.', 'none'), align: en(ALIGNS, 'Align', 'Left, centre or right.', 'left'),
      upper: bool('Capitals', 'Sets it in capitals.', false), nowrap: bool('One line', 'Keeps it on one line.', false), vertical: en(['up', 'down'], 'Vertical', 'Runs it up or down the page (a label along an edge).'),
      track: num(-0.1, 0.3, 'Letter spacing', 'In em; leave out for the style\'s own.'), lead: num(0.8, 1.6, 'Line height', 'A multiple of the size; leave out for the style\'s own.'),
      weight: int(100, 900, 'Weight', 'A weight of the style\'s font; leave out for the style\'s own.'), font: en(FONT_ROLES, 'Font', 'Which of the look\'s fonts; leave out for the style\'s own.'),
      tiltBar: bool('Line on a bar', 'Sets the whole line on a bar in the accent colour, turned by the look\'s highlight turn (a quote\'s source).', false),
      follow: bool('Follows the headline', 'Takes the size the composition\'s headline is set at (a date numeral that grows with the headline).', false),
      dropWhenTight: bool('Leave out when tight', 'Leaves this out when the composition\'s headline sets in three lines or more (at most one per composition).', false),
      // the headline's inline marks (post-spec.mjs INLINE): without these the [[pill]] words are plain and the {{icon}} marks left out
      pills: obj({
        shape: en(PILL_SHAPES, 'Shape', 'A round pill, a softly rounded box, or a round outline in the ink colour.', 'pill'),
        fill: role('Fill', 'The pill colour (leave out for an outline).'), ink: role('Ink', 'The colour of the words in the pill.'),
      }, 'Words in pills', 'Sets the headline\'s [[marked]] words (one or two runs of one to three words) in pills.', ['ink']),
      icons: obj({ colour: role('Colour', 'The icon colour; leave out for the colour of the words.'), badge: role('Badge', 'Sets each icon in a small round disc of this colour, like a sticker in the line; leave out for a plain icon.') }, 'Inline icons', 'Draws the headline\'s {{icon}} marks, from the engine\'s own icons.'),
      // a decorative flourish against one word of a headline (display type), drawn by the page and checked against every other text
      swash: swashDesc(),
    },
    common: ['place', 'bleed', 'rot', 'origin', 'z', 'when', 'ink', 'w', 'before', 'nudgeX', 'alignSelf', 'textShadow', 'overlap'],
  },
  photo: {
    label: 'Picture', group: 'Pictures', help: 'The post\'s picture, cropped to a shape and treated in the look\'s way.',
    placement: 'required', flow: false, container: null, text: false,
    own: {
      shape: en(PHOTO_SHAPES, 'Shape', 'A rectangle, circle, oval, pill, arch, rounded rectangle, a card in a paper mount or a framed print.', 'rect'),
      treat: list(en(PHOTO_TREATS, 'Treatment', 'Grey, multiply, grain or punch.'), 4, 'Treatment', 'How the picture is treated; leave out to use the look\'s.', { unique: true }),
      border: int(0, 60, 'Mount', 'Width of a paper mount in pixels (print and card).'), keyline: int(0, 4, 'Keyline', 'Pixels.'),
      tint: role('Tint', 'The colour of a multiply treatment.'),
      blend: en(BLENDS, 'Melt into the page', 'none: a plain edge. ground: when the picture\'s top and side edges are one plain colour the page takes that colour and the picture runs into it (the type changes to suit); otherwise it fades. fade: the top edge fades into the page.', 'none'),
      fade: int(0, 400, 'Fade length', 'Pixels over which the top edge of a melting picture fades into the page (160 when left out).'),
    },
    common: ['place', 'bleed', 'rot', 'origin', 'z', 'when', 'radius', 'shadow', 'ring'],
  },
  sticker: {
    label: 'Sticker', group: 'Shapes', help: 'A circle, pill, tile, stamp or seal carrying a short word, a price or a date.',
    placement: 'required', flow: true, container: 'text', text: false,
    own: {
      shape: en(STICKER_SHAPES, 'Shape', 'Circle, pill, tile, stamp (a dashed ring inside) or seal (the brand name round it).', 'circle'), size: int(40, 600, 'Size', 'Side or width of a circle, stamp, seal or tile, in pixels.'),
      w: oneOf([{ is: 'number', desc: int(40, 900, 'Width', 'Width of a pill or tile, in pixels.') }, { is: 'string', desc: en(['hug'], 'Width', 'As wide as its words, between minW and maxW.') }], 'Width', 'Width of a pill or tile in pixels, or "hug" for as wide as its words.'),
      h: int(40, 600, 'Height', 'Height of a pill or tile, in pixels.'), minW: int(40, 900, 'Least width', 'The least width of a hugging sticker\'s words, in pixels.'), maxW: int(40, 900, 'Most width', 'The most width of a hugging sticker\'s words, in pixels.'),
      fit: obj({ cap: int(14, 400, 'Largest', 'The largest the words may be, in pixels.'), floor: int(14, 300, 'Smallest', 'Below this the image is refused, in pixels.'), w: int(20, 900, 'Width', 'Width of the box the words fill, in pixels.'), h: int(20, 600, 'Height', 'Height of the box the words fill, in pixels.'), maxLines: int(1, 4, 'Most lines', 'The most lines.', 2) }, 'Fit the words', 'The words are sized by the page to fill a box, line by line (instead of steps).', ['cap', 'floor']),
      field: field(SHORT_FIELDS, 'Field', 'The short words it carries (or give it text items).'),
      ladder: obj({ by: field(SHORT_FIELDS, 'Counted on', 'The field whose length picks the size.'), steps: list(tuple([int(1, 400, 'Up to', 'Characters.'), int(14, 900, 'Size', 'Pixels.')], 'Step', 'Up to this many characters, this size.'), LIMITS.ladderSteps, 'Steps', 'Longest text first to smallest size.', { min: 1 }), maxLines: int(1, 8, 'Most lines', 'The most lines at the chosen step.'), maxH: int(40, 900, 'Most height', 'The most height at the chosen step, in pixels.') }, 'Size by length', 'Steps down the size as the words get longer; the page measures which step fits.', ['by', 'steps']),
      textSize: int(14, 400, 'Text size', 'Pixels, when the size does not change with length.'),
      stretch: int(50, 150, 'Width of the letters', 'Font width in percent for the words, instead of the look\'s headline width (with fit; the display font must have it).'),
    },
    common: ['place', 'rot', 'origin', 'originPct', 'z', 'when', 'fill', 'ink', 'shadow', 'ring', 'pad', 'radius', 'before', 'nudgeX', 'alignSelf', 'key'],
  },
  rule: {
    label: 'Rule', group: 'Shapes', help: 'A line.', placement: 'required', flow: true, container: null, text: false,
    own: { weight: oneOf([{ is: 'string', desc: en(RULE_WEIGHTS, 'Weight', 'Hair or heavy, as the look sets them.') }, { is: 'number', desc: int(1, 16, 'Weight', 'Pixels.') }], 'Weight', 'Hair, heavy or a number of pixels.', 'hair'), vertical: bool('Vertical', 'Runs up and down.', false), colour: role('Colour', 'The line colour.', 'rule'), style: en(RULE_STYLES, 'Style', 'A solid line or a row of round dots (the weight is the dot size).', 'solid') },
    common: ['place', 'bleed', 'z', 'when', 'w', 'h', 'before'],
  },
  block: {
    label: 'Colour block', group: 'Shapes', help: 'A solid block of colour (a bar, a square, a dot).', placement: 'required', flow: true, container: null, text: false,
    own: { colour: role('Colour', 'The block colour.', 'accent') },
    common: ['place', 'bleed', 'rot', 'skew', 'origin', 'z', 'when', 'radius', 'corners', 'shadow', 'w', 'h', 'before', 'key'],
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
    own: { glyph: en(GLYPHS, 'Mark', 'Which mark.'), size: int(40, 1100, 'Size', 'Pixels.'), colour: role('Colour', 'The mark colour.', 'accent'), stretch: int(50, 150, 'Width of the letters', 'Font width in percent for the mark, instead of the look\'s headline width.') },
    common: ['place', 'rot', 'z', 'when', 'textShadow'],
  },
};
const PRIM = Object.fromEntries(Object.entries(PRIMITIVES).map(([k, m]) => [k, { ...m.SPEC }]));
for (const [k, spec] of Object.entries(PRIM)) { delete spec.required; spec.own = { ...spec.own }; ELEMENTS_BASE[k] = spec; }
export const ELEMENTS = Object.freeze({ ...ELEMENTS_BASE });
export const ELEMENT_TYPES = Object.keys(ELEMENTS);
// The own properties an element must give (the others have defaults).
export const REQUIRED_OWN = Object.freeze({ glyph: ['glyph'], ...Object.fromEntries(Object.entries(PRIMITIVES).filter(([, m]) => m.SPEC.required.length).map(([k, m]) => [k, [...m.SPEC.required]])) });
// The elements that may be placed only at the top of a composition (their own geometry), the types that may go in a box.
export const TOP_ONLY = ELEMENT_TYPES.filter((t) => ELEMENTS[t].placement === 'none');
export const FLOWING = ELEMENT_TYPES.filter((t) => ELEMENTS[t].flow);
export const CONTAINERS = ELEMENT_TYPES.filter((t) => ELEMENTS[t].container);
// Every property name an element of a type takes (the validator's allow-list and the catalogue's property list).
export const keysOf = (type) => ['type', ...Object.keys(ELEMENTS[type].own), ...ELEMENTS[type].common, ...(ELEMENTS[type].container ? ['children'] : []), ...(ELEMENTS[type].sticker ? ['sticker'] : [])];
// The descriptor of a property of an element type.
export const descriptorOf = (type, name) => (Object.hasOwn(ELEMENTS[type].own, name) ? ELEMENTS[type].own[name] : COMMON[name]);

// ---- the look-level sections ----
const marginSide = (l) => int(0, 300, l, 'Pixels.');
const weight = (label) => int(100, 900, label, 'Font weight, 100 to 900.');
const FONT_PROPS = {
  library: obj({
    source: en(['library'], 'Source', 'A font of the engine\'s library.'), family: text(40, 'Family', 'A family of the font library.'),
    weights: list(int(100, 900, 'Weight', 'Font weight.'), 4, 'Weights', 'The weights used (up to four, within what the family has).', { min: 1, unique: true }),
    stretch: num(50, 150, 'Width', 'Font width in percent, for families that have it.', { int: true }), opsz: num(6, 144, 'Optical size', 'For families with an optical size axis (Fraunces): a lower number draws sturdier, softer letters with less contrast between thick and thin strokes; leave out to let the size choose.', { int: true }), italic: bool('Italic', 'Also embeds the italic.', false),
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
      wordSpace: num(0, 0.2, 'Word space', 'Extra space between words of headlines, in em.', { def: 0 }),
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
    sticker: en(['accent', 'primary'], 'Stickers', 'Which colour stickers are.', 'accent'), accentAsType: en(['never', 'when-contrast', 'field'], 'Accent as type', 'Whether the accent may be type: never, where it has enough contrast, or field: the emphasised phrase takes the deep colour of the field.', 'never'),
    grounds: list(en(GROUNDS, 'Page colour', 'A page colour.'), 5, 'Page colours', 'The page colours compositions may use.', { min: 1, unique: true }),
    rotate: list(en(ROTATE_GROUNDS, 'Page colour', 'A light page colour.'), 3, 'Page colours in turn', 'Light page colours a batch takes in turn: a composition whose page colour is one of these is drawn on one of them, chosen from the post\'s own words, so a batch without pictures does not sit on one colour. Each must be in the page colours.', { min: 2, unique: true }),
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
  logo: obj({ default: en(['off', 'corner', 'top-left'], 'Logo', 'No logo, the brand\'s logo in the corner the brand chose, or always at the top left.', 'off'), height: int(24, 80, 'Height', 'Pixels.', 44) }, 'Logo', 'The brand logo.'),
  dials: obj({ tilt: num(0, 1.5, 'Tilt', 'Scales every angle (0 straight, 1 as set, 1.5 more).', { def: 1 }), density: num(-1, 1, 'Density', 'Tighter (-1) to looser (1) spacing.', { def: 0 }), weightShift: int(-100, 100, 'Weight shift', 'Lighter (-100) to heavier (100) type.', 0) }, 'Dials', 'Three dials that adjust the whole look.'),
});
export const SECTION_NAMES = Object.keys(SECTIONS);
