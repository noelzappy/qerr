// The retail compositions (kind -> variants). Each is { id, name, describe, fields, words, ground, ... , render(ctx) }; see
// directions/index.mjs. Only the retail direction's files are edited here. Ported from the owner-approved prototype (nine pages: the
// numbers below are the prototype's; the notes say where a page differs from it and why).
//
// How the pages fit their words. A headline set by the kit's fitLines (the stack, the mantra, the price numeral, a sticker's tag) is sized
// line by line to the measure between a cap and a floor. Every other headline is set from a ladder of designed sizes (the prototype's three
// steps, 100%, 90% and 82% of the first): the page measures it and uses the largest step at which it takes at most N lines (or at most so
// many px of height); past the last step the page's fit loop may shrink it to 82% of that, and beyond that the render is refused with the
// length it would take. Nothing here estimates a height or a line count from a number of characters: what sits beside a headline (a sub
// line, a band) is laid out in the flow and measured, and `words` is only the longest each field holds that way (the prototype's stress copy).
import { emphasisParts } from '../kit.mjs';

const rot = (c, k) => c.tokens.device.rot[k];
// a sticker's words: the tag, sized by the runtime to the room in the sticker (one line, or two balanced), from `cap` px down to `floor`
const tagFit = (c, o) => c.fitLines({ flow: true, lead: 0.9, track: -0.02, max: 2, align: 'center', role: 'label', what: 'tag', grid: 'skip', variant: 'sticker', html: c.text('tag'), ...o });
const SPEC_BAR = { breakBefore: true, highlight: true };
// the designed ladder of a headline: its first size and the prototype's three steps (100%, 90%, 82%)
const ladder = (first) => [first, +(first * 0.9).toFixed(2), +(first * 0.82).toFixed(2)];

// How much room each stepped headline may take at most (px of height), from the prototype's sheets (its normal and stress copy are set at
// the sizes the prototype chose): a step is used when the headline set at it is no taller than this.
const LIST_ROOM = 350, QUOTE_ROOM = 700, SEAM_ROOM = 320, EVENT_ROOM = 300, OFFER_ROOM = 400;
// the paper above the words on the seam's field, from its left end
const SEAM_GAP = 125;

// ---- statement/0 Stack ----
const stack = {
  id: 'retail/statement/0', name: 'Stack',
  describe: 'A full primary field: the headline stacked edge to edge, every line sized to fill the width in the light colour and centred in the height, the emphasis on a turned highlight bar; a rule, a dot and the brand name at the foot.',
  fields: ['label', 'headline', 'sub'], words: { headline: 65, sub: 110, label: 28 }, ground: 'field', dark: true, bodyOnField: true, roles: ['display', 'text', 'label'],
  render(c) {
    const T = c.tokens, { left, top, bottom } = c.margin, W = c.W - left - c.margin.right;
    const footTop = c.H - bottom - 52, sub = c.has('sub');
    let html = '';
    // one column from the top margin to just above the foot: the label, the headline in the room that is left (measured, centred) and the sub
    html += c.box({ x: left, y: top, w: W, h: footTop - 28 - top, flex: 'column', gap: 36, pad: [0, 0, sub ? 0 : 12, 0] },
      (c.has('label') ? c.label({ flow: true, html: c.text('label'), colour: 'on-field' }) : '')
      + c.fitLines({ flow: true, grow: true, w: W - 8, h: 'auto', cap: 230, floor: 80, lead: 1, track: T.type.display.track, colour: 'on-field', max: 5, valign: 'center', highlight: true, html: c.fmt('headline') })
      + (sub ? c.body({ flow: true, w: 760, html: c.fmt('sub'), colour: 'on-field', nudge: { y: 8 } }) : ''));
    html += c.rule({ x: left, y: footTop, w: W, weight: 4, colour: 'on-field' });
    html += c.box({ x: left, y: footTop + 28, w: 22, h: 22, radius: 'full', fill: 'gold' });
    html += c.label({ html: c.brand, x: left + 46, y: footTop + 24, colour: 'on-field', grid: 'skip' });
    return { html };
  },
};

// ---- statement/1 Mantra ----
const mantra = {
  id: 'retail/statement/1', name: 'Mantra',
  describe: 'The first part of the headline repeated as outline rows down a primary field, the emphasis phrase once, solid, on a highlight bar in the middle; the sub on a light band with an accent edge at the foot. Needs a first part of at most 22 characters, else the Stack is used.',
  fields: ['headline', 'sub'], words: { headline: 60, sub: 130 }, ground: 'field', dark: true, roles: ['display', 'text'],
  accepts: (spec) => [...emphasisParts(spec.headline).pre].length <= 22,
  render(c) {
    const T = c.tokens, { left } = c.margin, W = c.W - left - c.margin.right, sub = c.has('sub');
    const { pre, phrase, post } = c.emphasisParts();
    const both = pre && phrase, solid = both ? [phrase, post].filter(Boolean).join(' ') : [pre, phrase, post].filter(Boolean).join(' '), echo = both ? pre : solid;
    // the echo takes the room the band leaves it; the band is as tall as its text needs (at least 210)
    const echoes = c.echoStack({ w: W, h: 'auto', nudge: { x: left, y: 30 }, cap: 250, floor: 56, lead: 1, track: T.type.display.track, colour: 'on-field', rmin: 3, rmax: 7, pre: c.m`${echo}`, html: c.m`<em data-role="accent">${solid}</em>` });
    const band = sub ? c.box({ flow: true, w: 868, minH: 210, fill: 'paper', flex: 'column', pad: [0, 0, c.margin.bottom, 0], nudge: { y: 40 } },
      c.box({ flow: true, w: 868, h: 14, fill: 'gold', flexNone: true }) + c.body({ flow: true, w: 756, html: c.fmt('sub'), colour: 'ink', nudge: { x: left, y: 40 } })) : '';
    return { html: c.box({ x: 0, y: 0, w: c.W, h: c.H, flex: 'column', pad: [0, 0, sub ? 0 : 56, 0] }, echoes + band) };
  },
};

// ---- figure/0 Price tag ----
const priceTag = {
  id: 'retail/figure/0', name: 'Price tag',
  describe: 'A primary field with a punched hole and a small label like a hang tag; the figure huge and turned a few degrees in the light colour with a hard shadow, its unit on an accent block under it; the sub on a light band at the foot.',
  fields: ['label', 'big', 'unit', 'sub'], words: { label: 28, big: 8, unit: 24, sub: 125 }, ground: 'field', dark: true, roles: ['display', 'text', 'label'],
  render(c) {
    const { left, top } = c.margin, W = c.W - left - c.margin.right, sub = c.has('sub');
    // the figure as large as the stage allows (up to 930 px, centred), the unit fitted on a full-width accent block under it
    const price = c.fitLines({ flow: true, trail: true, w: 920, h: 730, cap: 930, floor: 150, lead: 0.78, track: -0.04, max: 1, colour: 'on-field', variant: 'figure', grid: 'skip', align: 'center', html: c.text('big') })
      + (c.has('unit') ? c.box({ flow: true, w: 920, fill: 'gold', ink: 'on-accent', pad: [14, 24, 30, 24], shadow: { x: 8, y: 8, colour: 'field-deep' }, nudge: { y: 120 }, alignSelf: 'center' },
        c.fitLines({ flow: true, w: 872, h: 120, cap: 120, floor: 56, lead: 0.9, max: 1, role: 'stat', colour: 'on-accent', align: 'center', grid: 'skip', html: c.text('unit') })) : '');
    // the figure centred in the room above the sub band; the band is as tall as its text needs (at least 140)
    const stage = c.box({ flow: true, w: c.W, grow: 1, flex: 'column', justify: 'center', pad: [0, left, 0, left] },
      c.box({ flow: true, w: W, flex: 'column', align: 'center', rot: rot(c, 'price'), origin: '30% 50%', unrot: true, pad: [112, 0, 0, 0] }, price));
    const band = sub ? c.box({ flow: true, w: c.W, minH: 140, fill: 'paper', pad: [26, left, 56, left] }, c.body({ flow: true, w: W, html: c.fmt('sub'), colour: 'ink' })) : '';
    let html = c.box({ x: 0, y: 0, w: c.W, h: c.H, flex: 'column', gap: 48, pad: [0, 0, sub ? 0 : 48, 0] }, stage + band);
    html += c.box({ x: left, y: top, w: 44, h: 44, radius: 'full', fill: 'field-deep', ring: { w: 7, colour: 'on-field' } });
    if (c.has('label')) html += c.label({ html: c.text('label'), x: left + 66, y: top + 6, size: 34, colour: 'on-field', grid: 'skip' });
    return { html };
  },
};

// ---- list/0 Blocks ----
const blocks = {
  id: 'retail/list/0', name: 'Blocks',
  describe: 'A primary field with the headline at the top and, under an accent edge, the items as full-width light rows that share the rest of the height, each with a turned accent number block.',
  fields: ['label', 'headline', 'items'], words: { label: 28, headline: 44, items: 44 }, ground: 'field', dark: true, roles: ['display', 'text', 'label'],
  render(c) {
    const { left, top } = c.margin, W = c.W - left - c.margin.right, items = c.items();
    const head = c.box({ flow: true, w: c.W, flex: 'column', gap: 18, pad: [top, left, 44, left], flexNone: true },
      (c.has('label') ? c.label({ flow: true, html: c.text('label'), colour: 'on-field' }) : '') + c.display({ flow: true, w: W, steps: ladder(140), maxH: LIST_ROOM, split: true, band: true, html: c.fmt('headline', SPEC_BAR), colour: 'on-field' }));
    const rows = items.map((it, i) => c.box({ flow: true, w: c.W, grow: 1, minH: 150, flex: 'row', align: 'center', gap: 36, pad: [0, left, 0, left], fill: i % 2 ? 'light-tint' : 'paper', ink: 'ink' },
      c.box({ flow: true, w: 88, h: 88, fill: 'gold', ink: 'on-accent', rot: i % 2 ? 3 : -4, shadow: { x: 6, y: 6, colour: 'ink' }, flex: 'column', justify: 'center', align: 'center', flexNone: true },
        c.run({ text: String(i + 1), role: 'label', size: 46, lead: 1, weight: 900, colour: 'on-accent', variant: 'num' }))
      + c.run({ html: it, role: 'item', family: 'text', size: 46, lead: 50 / 46, weight: 600, colour: 'ink', variant: 'item' })));
    const html = c.box({ x: 0, y: 0, w: c.W, h: c.H, flex: 'column' }, head + c.box({ flow: true, w: c.W, h: 14, fill: 'gold', flexNone: true }) + c.box({ flow: true, w: c.W, grow: 1, flex: 'column' }, rows.join('')));
    return { html };
  },
};

// ---- quote/0 Shout ----
const shout = {
  id: 'retail/quote/0', name: 'Shout',
  describe: 'A light card inside a primary frame: a big accent quotation mark with a hard shadow over its corner, the quote in the heaviest type the length allows, balanced in the height under it, and the source on a turned accent bar.',
  fields: ['quote', 'by'], words: { quote: 145, by: 40 }, ground: 'paper', fit: { pad: 114, top: 114, bottom: 114 }, roles: ['display', 'text', 'label'],
  render(c) {
    const f = c.tokens.frame, inset = f.t + f.pad;
    let html = c.frame({ t: f.t, colour: 'field' });
    html += c.glyph({ text: '“', x: -16, y: -96, size: 760, lead: 1, colour: 'gold', weight: 900, variant: 'mark' });
    const by = c.has('by') ? c.box({ flow: true, variant: 'tilt', pad: [9, 21, 9, 21] }, c.run({ html: c.text('by'), role: 'label', family: 'label', size: 30, lead: 1, weight: 800, track: 0.06, upper: true, colour: 'on-accent', nowrap: true, variant: 'by' })) : '';
    html += c.box({ x: inset, y: 330, w: c.W - 2 * inset, h: c.H - inset - 330, flex: 'column', justify: 'center', gap: 44 },
      c.display({ flow: true, role: 'headline', w: c.W - 2 * inset, steps: [164, 140, 120, 104, 92], maxH: QUOTE_ROOM, lead: 0.92, track: -0.02, split: true, band: true, html: c.fmt('quote', { highlight: true }), variant: 'quote' }) + by);
    return { html };
  },
};

// ---- photo/0 Frame pop ----
const framePop = {
  id: 'retail/photo/0', name: 'Frame pop',
  describe: 'The picture inside a primary frame; a light block turned a little across its foot with a hard shadow, the headline on it with the emphasis on a bar and the sub under it; a round accent sticker with the tag on the top corner.',
  fields: ['headline', 'sub', 'tag', 'image'], words: { headline: 68, sub: 120, tag: 16 }, ground: 'paper', roles: ['display', 'text', 'label'],
  render(c) {
    const f = c.tokens.frame;
    let html = c.photo({ x: f.t, y: f.t, w: c.W - 2 * f.t, h: c.H - 2 * f.t });
    html += c.frame({ t: f.t, colour: 'field' });
    const inner = c.display({ flow: true, w: 844, size: 104, lead: 0.92, grid: 'skip', split: true, band: true, html: c.fmt('headline', SPEC_BAR), colour: 'ink' })
      + (c.has('sub') ? c.body({ flow: true, w: 760, grid: 'skip', html: c.fmt('sub'), colour: 'ink' }) : '');
    html += c.box({ x: f.t, bottom: 34, w: c.W - 2 * f.t, rot: rot(c, 'block'), origin: 'left bottom', fill: 'paper', ink: 'ink', pad: [40, 48, 42, 48], shadow: { x: 14, y: 14, colour: 'ink' }, flex: 'column', gap: 22 }, inner);
    if (c.has('tag')) html += c.shape({ shape: 'circle', size: 250, x: 760, y: 22, rot: rot(c, 'sticker'), ring: { w: 6, colour: 'paper' } }, tagFit(c, { w: 190, h: 150, cap: 92, floor: 40 }));
    return { html };
  },
};

// ---- photo/1 Seam ----
const seam = {
  id: 'retail/photo/1', name: 'Seam',
  describe: 'The picture full bleed, cut across by a slanted primary field with a thin light edge; the headline and sub on the field at the foot, an accent pill with the tag straddling the seam.',
  fields: ['headline', 'sub', 'tag', 'image'], words: { headline: 66, sub: 130, tag: 16 }, ground: 'field', bodyOnField: true, roles: ['display', 'text', 'label'],
  render(c) {
    const S = c.tokens.device.seam, { left, bottom } = c.margin, W = c.W - left - c.margin.right, rise = S.left - S.right, edge = 16;
    let html = c.photo({ x: 0, y: 0, w: c.W, h: c.H });
    // The field is as tall as its words need (at least from the prototype's seam, 780 px at its left end, to the foot), its top edge rising
    // `rise` px to the right; a paper edge `edge` px thick follows it. The pill is placed on the seam and is as wide as its tag.
    const words = c.box({ flow: true, w: W, flex: 'column', gap: 26 },
      c.display({ flow: true, w: W, steps: ladder(126), maxH: SEAM_ROOM, split: true, band: true, html: c.fmt('headline', SPEC_BAR), colour: 'on-field' }) + (c.has('sub') ? c.body({ flow: true, w: 800, html: c.fmt('sub'), colour: 'on-field' }) : ''));
    const field = c.box({ flow: true, w: c.W, fill: 'field', slant: rise, flex: 'column', justify: 'end', minH: c.H - S.right, pad: [rise + SEAM_GAP, left, bottom, left] }, words);
    const pill = c.has('tag') ? c.shape({ shape: 'pill', h: 118, right: c.W - 985, y: edge - 28, rot: rot(c, 'sticker'), ring: { w: 6, colour: 'paper' }, pad: [0, 28, 0, 28] }, tagFit(c, { w: 'fit', minW: 274, maxW: 504, h: 100, cap: 60, floor: 30, max: 1 })) : '';
    html += c.box({ x: 0, bottom: 0, w: c.W }, c.box({ flow: true, w: c.W, fill: 'paper', slant: rise, pad: [edge, 0, 0, 0] }, field) + pill);
    return { html };
  },
};

// ---- event/0 Poster band ----
const posterBand = {
  id: 'retail/event/0', name: 'Poster band',
  describe: 'The picture full bleed under a turned light band with a primary edge; the headline, the meta line and a short sub on the band, a turned accent date tile on its edge. When the headline takes three lines the sub is left out.',
  fields: ['headline', 'meta', 'sub', 'image'], words: { headline: 50, meta: 40, sub: 62 }, ground: 'paper', roles: ['display', 'text', 'label'],
  render(c) {
    const R = rot(c, 'band'), first = 116;
    // the date tile: a day and a month from the first part of the meta line ("12 Dec", "Sat 12 December", "Dec 12"; the month in three letters); any other first part
    // goes in the tile as it is, at the meta size
    const dp = c.dateParts('meta');
    let html = c.photo({ x: 0, y: 0, w: c.W, h: c.H });
    html += c.band({ y: 734, h: 900, colour: 'field', rot: R });
    const text = c.display({ flow: true, w: 956, steps: ladder(first), maxH: EVENT_ROOM, lead: 0.92, grid: 'skip', html: c.fmt('headline', SPEC_BAR), colour: 'ink', key: 'ev-h', split: true, band: true })
      + c.type({ flow: true, role: 'meta', family: 'label', w: 956, size: 34, lead: 40 / 34, weight: 800, track: 0.06, upper: true, grid: 'skip', html: dp.line, colour: 'field-text', nudge: { y: 30 }, variant: 'meta' })
      + (c.has('sub') ? c.type({ flow: true, role: 'sub', w: 880, size: 32, lead: 1.25, weight: 600, grid: 'skip', html: c.fmt('sub'), colour: 'ink', nudge: { y: 16 }, dropSub: { key: 'ev-h', lines: 3 } }) : '');
    html += c.band({ y: 760, h: 900, colour: 'paper', ink: 'ink', rot: R, unrot: true, pad: [104, 182, 0, 224] }, text);
    if (dp.count) {
      const inner = dp.day
        ? c.run({ html: dp.day, role: 'accent', size: first, scale: true, follow: 'ev-h', lead: 1.1, weight: 900, track: -0.03, variant: 'sticker' }) + c.run({ html: dp.month, role: 'label', family: 'label', size: 44, lead: 1, weight: 800, track: 0.08, upper: true, variant: 'date' })
        : c.run({ html: dp.first, role: 'label', family: 'label', size: 34, lead: 1.1, weight: 800, track: 0.06, upper: true, variant: 'date' });
      html += c.shape({ shape: 'tile', w: 220, h: 250, x: 790, y: 580, rot: rot(c, 'sticker'), ring: { w: 6, colour: 'paper' } }, inner);
    }
    return { html };
  },
};

// ---- offer/0 Sticker ----
const sticker = {
  id: 'retail/offer/0', name: 'Sticker',
  describe: 'A light card inside a primary frame: the headline at the top, under it a turned photo card with a hard primary shadow and a big round accent stamp with the price or the offer overlapping both, the sub at the foot beside the picture; without a picture the stamp is larger and centred with the sub under it.',
  fields: ['headline', 'tag', 'sub', 'image'], words: { headline: 60, tag: 16, sub: 100 }, ground: 'paper', fit: { pad: 114, top: 114, bottom: 114 }, roles: ['display', 'text', 'label'],
  render(c) {
    const f = c.tokens.frame, inset = f.t + f.pad;
    let html = c.frame({ t: f.t, colour: 'field' });
    let stage;
    if (c.hasImage) {
      const card = c.box({ right: 0, y: 0, bottom: 0, w: 520, rot: rot(c, 'card'), fill: 'paper-warm', pad: 8, shadow: { x: 16, y: 16, colour: 'field' } }, c.photo({ x: 8, y: 8, right: 8, bottom: 8 }));
      const stamp = c.has('tag') ? c.shape({ flow: true, shape: 'stamp', size: 410, rot: rot(c, 'sticker'), ring: { w: 6, colour: 'paper' }, nudge: { x: -6, y: -12 }, flexNone: true }, tagFit(c, { w: 310, h: 260, cap: 195, floor: 60 })) : '';
      const sub = c.has('sub') ? c.body({ flow: true, w: 282, html: c.fmt('sub'), colour: 'ink' }) : '';
      // the sticker at the top of the left column and the sub at its foot; when the stage is too short for both they run on past its foot,
      // which the fit loop reads as the headline being too long (it shrinks it, then refuses with the length it would take)
      stage = c.box({ flow: true, w: c.W - 2 * inset, grow: 1, minH: 520, flex: 'row', nudge: { y: 28 } }, card + c.box({ flow: true, w: 282, flex: 'column', justify: 'between', alignSelf: 'stretch', flexNone: true }, stamp + sub));
    } else {
      // no picture: no empty card where it would be; the stamp is larger and stands in the middle of the stage with the sub under it
      const stamp = c.has('tag') ? c.shape({ flow: true, shape: 'stamp', size: 560, rot: rot(c, 'sticker'), ring: { w: 6, colour: 'paper' }, flexNone: true }, tagFit(c, { w: 430, h: 360, cap: 260, floor: 80 })) : '';
      const sub = c.has('sub') ? c.body({ flow: true, w: 600, html: c.fmt('sub'), colour: 'ink', align: 'center' }) : '';
      stage = c.box({ flow: true, w: c.W - 2 * inset, grow: 1, minH: 520, flex: 'column', justify: 'center', align: 'center', gap: 40, nudge: { y: 28 } }, stamp + sub);
    }
    html += c.box({ x: inset, y: inset, w: c.W - 2 * inset, h: c.H - 2 * inset, flex: 'column' }, c.display({ flow: true, w: c.W - 2 * inset, steps: [172.5, ...ladder(150)], maxH: OFFER_ROOM, split: true, band: true, html: c.fmt('headline', SPEC_BAR), colour: 'ink' }) + stage);
    return { html };
  },
};

export const COMPOSITIONS = { statement: [stack, mantra], figure: [priceTag], list: [blocks], quote: [shout], photo: [framePop, seam], event: [posterBand], offer: [sticker] };
