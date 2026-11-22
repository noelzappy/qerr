// The editorial compositions (kind -> variants). Each is { id, name, describe, fields, words, ground, ... , render(ctx) }; see
// directions/index.mjs. Only the editorial direction's files are edited here.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// A display size from a text length: the shortest texts at the largest size, the longest at the smallest.
const sizeFor = (chars, [shortChars, longChars], [big, small]) => Math.round(big - (clamp(chars, shortChars, longChars) - shortChars) * (big - small) / (longChars - shortChars));

const coverLine = {
  id: 'editorial/statement/0', name: 'Cover line',
  describe: 'A magazine cover line: label and folio over a hairline, a calm paper upper half with the brand name as a faint texture, the headline anchored bottom-left across five columns with the sub beneath it.',
  fields: ['label', 'headline', 'sub'], words: { headline: 60, sub: 120 }, ground: 'paper', calm: { maxShare: 0.62 }, roles: ['display', 'text', 'label'],
  render(c) {
    const { left, top, bottom } = c.margin, x0 = c.col(0), x1 = c.colR(5), W = x1 - x0, T = c.tokens;
    const size = sizeFor(c.chars('headline'), [14, 60], [T.type.display.max, T.type.display.min]);
    let h = '';
    h += c.label({ html: c.labelOrBrand(), x: x0, y: top, w: 520, colour: 'muted' });
    h += c.folioMark({ x: x1 - 300, y: top, w: 300, align: 'right', colour: 'accent' });
    h += c.rule({ x: x0, y: top + 46, w: W, weight: T.device.rule, colour: 'ink' });
    h += c.wordmarkPattern({ x: x0, y: top + 96, w: W, h: 640, size: 76, opacity: 0.04, weight: 300, fade: true });
    const inner = c.display({ flow: true, w: c.span(0, 4), size, html: c.fmt('headline') }) + (c.has('sub') ? c.flowBlock({ w: 56, h: 2, colour: 'gold' }) + c.body({ flow: true, w: c.span(0, 3), html: c.fmt('sub') }) : '');
    h += c.group({ x: x0, bottom, w: c.span(0, 4), gap: 36 }, inner);
    return { html: h };
  },
};

export const COMPOSITIONS = { statement: [coverLine] };
