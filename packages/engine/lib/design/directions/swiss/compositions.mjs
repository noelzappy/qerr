// The swiss compositions (kind -> variants). Each is { id, name, describe, fields, words, ground, ... , render(ctx) }; see
// directions/index.mjs. Only the swiss direction's files are edited here. One reference composition (the poster) is kept until the
// direction is authored as data (see the looks plan); asking for another kind is refused with "has no <kind> composition yet".
//
// What every page shares: the meta row (4 px rule, label / brand / folio in mono, a 1 px rule), 64 px margins, twelve columns 16 px
// apart, seven equal rows below the meta row, flush left, square corners, type in three levels (display, body at 34/44, mono at 20), the
// first cap line and the last baseline of every block on a grid line, and the brand's accent on one element only. Where that accent may go
// is decided by measured contrast (layout.mjs plan).
//
// The headline is set at the largest step of its ladder at which it fits, and a text that fits at none is refused with the number of
// characters that would.
import { geometry, metaRow, plan, square, subBlock, trimOf } from './layout.mjs';

const page = (c, P, html, classes = '') => ({ html: c.scope(P.scope, html), classes });

const poster = {
  id: 'swiss/statement/0', name: 'Poster',
  describe: 'An international-style poster: the meta row on top, the headline set as large as the ladder allows in up to six lines from row two across eleven columns, the sub in columns one to six on the last rows, and one accent square on the grid, bottom-right.',
  fields: ['label', 'headline', 'sub'], words: { headline: 67, sub: 132, label: 28 }, ground: 'paper', roles: ['display', 'text', 'label'],
  render(c) {
    const g = geometry(c), P = plan(c), T = c.tokens;
    let h = metaRow(c, g);
    h += c.fitBlock({ x: g.x0, y: g.R(2), w: c.span(0, 10), h: g.B(6) - g.R(2), sizes: T.ladders.poster, max: 6, trim: trimOf(c, 'display', T.type.display.lead), colour: 'ink' });
    // the sub's text box (its descenders included) ends on the foot margin, which the fit check holds text to: its last baseline sits one descent above that line
    h += subBlock(c, g, { a: 0, b: 5, base: g.B(8) - T.metrics.text.desc * T.type.body.size });
    h += square(c, g, { x: c.col(10), bottom: g.B(8) });
    return page(c, P, h);
  },
};

export const COMPOSITIONS = { statement: [poster] };
