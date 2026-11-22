// Primitive: one row for each list item, or each part of the event line: an optional number, then the words (kit box + run).
import { oneOf, VALIGNS, RULE_STYLES, RULE_WEIGHTS, ROW_EACH, ROW_KEYS, ROW_NUMBERS, STYLES, angle, bool, en, int, list, num, obj, role, tuple } from '../../look-desc.mjs';
import { ICON_NAMES } from '../../icons.mjs';

export const SPEC = {
  label: 'Rows', group: 'Layout', help: 'One row for each item of a list (or each part of the event line): an optional number, then the words. One per composition.',
  placement: 'required', flow: true, container: null, text: true,
  own: {
    each: en(ROW_EACH, 'One row for each', 'Each list item, or each part of the event line.'), number: en(ROW_NUMBERS, 'Numbering', 'No number, 1 2 3, 01 02 03 or roman.', 'none'),
    numberStyle: en(STYLES, 'Number style', 'The type style of the number.', 'label'), numberSize: int(14, 300, 'Number size', 'Pixels.'),
    numberTile: obj({ size: int(40, 140, 'Size', 'Side of the square in pixels.'), radius: oneOf([{ is: 'number', desc: int(0, 70, 'Corner radius', 'Pixels.') }, { is: 'string', desc: en(['full'], 'Round', 'A circle.') }], 'Corners', 'Corner radius of the tile in pixels, or "full" for a round badge.'), fill: role('Fill', 'Tile colour.', 'accent'), ink: role('Ink', 'Number colour.', 'on-accent'), shadow: oneOf([{ is: 'boolean', desc: bool('Shadow', 'The look\'s hard shadow.', false) }, { is: 'number', desc: int(1, 24, 'Shadow', 'A hard shadow this many pixels across and down, in the ink colour.') }], 'Shadow', 'The look\'s hard shadow (true), or one this many pixels across and down.') }, 'Number tile', 'Puts each number on a square tile.', ['size']),
    numberSpan: int(1, 4, 'Number columns', 'Sets the number in this many grid columns, the words after them.'),
    textStyle: en(STYLES, 'Words style', 'The type style of the words.', 'item'), textSize: int(14, 300, 'Words size', 'Pixels.'), textTrack: num(-0.1, 0.3, 'Words letter spacing', 'In em; leave out for the style\'s own (label style only).'),
    altFill: tuple([role('First', 'Colour of the first row.'), role('Second', 'Colour of the second row.')], 'Alternate fills', 'Two colours, row by row.'),
    altRot: tuple([angle('First', 'Turn of the first number.'), angle('Second', 'Turn of the second number.')], 'Alternate turns', 'Two turns, row by row.'),
    rule: en(['none', ...RULE_WEIGHTS], 'Rule', 'A rule above each row.', 'none'), firstAccent: bool('First in accent', 'Sets the first number in the accent colour.', false),
    valign: en(['top', 'center'], 'Words sit', 'Where the number and words sit in a row taller than they are.', 'center'),
    gap: int(0, 120, 'Gap', 'Pixels between the number and the words.', 0), rowMinH: int(0, 400, 'Least row height', 'Pixels.', 0),
    ruleEnd: bool('Rule under the last row', 'Closes the last row with a rule too (needs a rule above each row).', false),
    sizeByCount: list(tuple([int(2, 5, 'Items', 'At this many items or more.'), int(14, 300, 'Size', 'Pixels for the words (and the number, when it is not on a tile).')], 'Step', 'At this many items or more, this size.'), 4, 'Size by number of items', 'Smaller words for longer lists, as steps (list rows only); the most items listed that applies wins.', { min: 1 }),
    rowRadius: oneOf([{ is: 'number', desc: int(0, 100, 'Corner radius', 'Pixels.') }, { is: 'string', desc: en(['full'], 'Round', 'Pill-shaped rows.') }], 'Row corners', 'Rounds the corners of each filled row, in pixels, or "full" for pills.'),
    rowGap: int(0, 48, 'Space between rows', 'Pixels of space between the rows (for rows that are cards or pills).', 0),
    ruleStyle: en(RULE_STYLES, 'Rule style', 'The rule above each row: a solid line or a row of round dots.', 'solid'),
    keys: list(en(ROW_KEYS, 'Label', 'A fixed label word.'), 3, 'Row labels', 'Fixed words before each row of an event table.', { min: 1 }),
    // an icon of the engine's own set on each row's tile instead of a number (a feature list): row i takes icons[i % n]
    icons: list(en(ICON_NAMES, 'Icon', 'One of the engine\'s own icons.'), 5, 'Icons', 'Icons on the rows\' tiles instead of numbers, in turn (one icon: the same on every row). Needs a number tile and no numbering.', { min: 1 }),
    numberInk: role('Number colour', 'The colour of the numbers not on a tile (muted when left out); it must read on the page.'),
    ruleColour: role('Rule colour', 'The colour of the rules between rows (the ink at 55% when left out; rule-dark on a dark page, rule-field on the field).', 'rule'),
  },
  common: ['place', 'z', 'when', 'ink', 'fill', 'pad', 'grow', 'minH', 'w', 'before'],
  required: ['each'],
};

// For the static checks (look-validate.mjs): icons stand on a tile, in place of the numbers.
export function rules(el, bad) {
  if (el.icons !== undefined && (el.number ?? 'none') !== 'none') bad('puts icons where the numbers go; set numbering to none', 'icons');
  if (el.icons !== undefined && el.numberTile === undefined) bad('needs a number tile to stand on', 'icons');
}
// For the static checks (look-static.mjs): the number colour must read on what the rows stand on.
export const inks = (el) => (el.numberInk !== undefined ? [el.numberInk] : []);

const NUMBER = {
  '1': (i) => String(i + 1), '01': (i) => String(i + 1).padStart(2, '0'),
  roman: (i) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][i],
};
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
// The rows are boxes in a column (env.box places the whole), each a row of a number cell and a text cell. Row text is Markup from c.items() / c.parts().
export function render(c, p, env) {
  const look = env.look, T = look.type;
  const cells = p.each === 'items' ? c.items() : c.parts('meta');
  if (!cells.length) return '';
  const w = env.box.w ?? env.innerW;
  const padT = Array.isArray(p.pad) ? p.pad[0] : typeof p.pad === 'number' ? p.pad : 0, padB = Array.isArray(p.pad) ? p.pad[2] : typeof p.pad === 'number' ? p.pad : 0;
  const padL = Array.isArray(p.pad) ? p.pad[3] : typeof p.pad === 'number' ? p.pad : 0, padR = Array.isArray(p.pad) ? p.pad[1] : typeof p.pad === 'number' ? p.pad : 0;
  const numStyle = p.numberStyle, tx = p.textStyle;
  const baseSize = p.textSize ?? (tx === 'item' ? T.item.size : tx === 'body' ? T.body.size : T.label.size);
  const stepped = (p.sizeByCount ?? []).filter(([n]) => cells.length >= n).sort((a, b) => b[0] - a[0])[0];
  const textSize = stepped ? stepped[1] : baseSize;
  const textRun = (html, i) => c.run(clean({ html, role: p.each === 'items' ? 'item' : 'meta', family: tx === 'label' ? T.label.role : 'text', size: textSize, lead: tx === 'item' ? T.item.lead : tx === 'label' ? 1 : T.body.lead, weight: tx === 'item' ? T.item.weight : tx === 'label' ? T.label.weight : T.body.weight, ...(tx === 'label' ? { upper: T.label.upper, track: p.textTrack ?? T.label.track } : {}), colour: env.ink ?? 'ink', variant: 'fill' }));
  const rows = cells.map((cell, i) => {
    const turn = p.altRot ? env.angle(p.altRot[i % 2]) : 0;
    const label = p.keys?.[i] ? c.run({ text: p.keys[i], role: 'label', family: T.label.role, size: T.label.size, lead: 1.2, weight: T.label.weight, track: T.label.track, upper: T.label.upper, colour: 'muted', nowrap: true }) : '';
    const labelCell = label && p.numberSpan ? c.box({ flow: true, w: c.span(0, p.numberSpan - 1), flexNone: true }, label) : label;
    let num = '';
    if (p.icons && p.numberTile) {
      // an icon on the tile: decoration in the tile's ink, about half the tile across (numberSize sets it)
      const t = p.numberTile, size = Math.min(t.size - 8, p.numberSize ?? Math.round(t.size * 0.5));
      num = c.box({ flow: true, w: t.size, h: t.size, fill: t.fill, ink: t.ink, radius: t.radius, rot: turn || undefined, shadow: t.shadow === true ? env.shadow : typeof t.shadow === 'number' ? { x: t.shadow, y: t.shadow, colour: 'ink' } : undefined, flex: 'column', justify: 'center', align: 'center', flexNone: true },
        c.icon(p.icons[i % p.icons.length], { colour: t.ink, size }));
    } else if (p.number !== 'none' && p.numberTile) {
      const t = p.numberTile;
      num = c.box({ flow: true, w: t.size, h: t.size, fill: t.fill, ink: t.ink, radius: t.radius, rot: turn || undefined, shadow: t.shadow === true ? env.shadow : typeof t.shadow === 'number' ? { x: t.shadow, y: t.shadow, colour: 'ink' } : undefined, flex: 'column', justify: 'center', align: 'center', flexNone: true },
        c.run({ text: NUMBER[p.number](i), role: 'label', family: numStyle === 'label' ? T.label.role : 'display', dfont: numStyle !== 'label' || undefined, size: p.numberSize ?? 46, lead: 1, weight: T.display.weight, colour: t.ink }));
    } else if (p.number !== 'none') {
      num = c.run(clean({ text: NUMBER[p.number](i), role: 'label', family: numStyle === 'label' ? T.label.role : 'display', size: stepped && !p.numberTile ? stepped[1] : p.numberSize ?? T.label.size, lead: 1, weight: T.label.weight, track: T.label.track, colour: i === 0 && p.firstAccent ? 'accent-type' : p.numberInk ?? 'muted', nowrap: true }));
      if (p.numberSpan) num = c.box({ flow: true, w: c.span(0, p.numberSpan - 1), flexNone: true }, num);
    }
    const fill = p.altFill ? p.altFill[i % 2] : p.fill;
    return c.box(clean({ flow: true, w, grow: p.grow ? 1 : undefined, minH: p.rowMinH || undefined, flex: 'row', align: p.valign === 'top' ? undefined : 'center', gap: p.gap, pad: [padT, padR, padB, padL], fill, ink: env.ink, radius: p.rowRadius, }),
      (labelCell || '') + num + textRun(cell, i));
  });
  const ruleW = p.rule === 'none' ? 0 : (typeof p.rule === 'string' ? env.look.devices.rule[p.rule] : 0);
  const withRules = ruleW ? [...rows.map((r) => c.flowBlock({ w: 'fill', h: ruleW, colour: p.ruleColour ?? 'rule', dotted: p.ruleStyle === 'dotted' || undefined }) + r), ...(p.ruleEnd ? [c.flowBlock({ w: 'fill', h: ruleW, colour: p.ruleColour ?? 'rule', dotted: p.ruleStyle === 'dotted' || undefined })] : [])] : rows;
  return c.box(clean({ ...env.box, flex: 'column', align: 'stretch', gap: p.rowGap || undefined, w, grow: p.grow ? p.grow : undefined, nudge: env.nudge }), withRules.join(''));
}
