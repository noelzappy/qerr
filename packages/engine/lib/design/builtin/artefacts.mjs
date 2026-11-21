// The artefact templates as layouts: ledger, passbook, and a text page with an artefact (a "page": "editorial" each; see
// lib/design/layout-editorial.mjs for how the blocks are drawn and design/templates/artefactPage.mjs for the function they
// replace). One entry per template: a list of { when?, layout }, the first whose condition holds drawing the page; a spec that
// matches none is drawn by the template function. A text page with an artefact is added here as more entries for "text" (they
// are tried after builtin/editorial.mjs's, which takes a text page without one).
//
// Converted: ledger, passbook, and text with each type of artefact (a ledger, a register card, a passbook page, a passbook page
// with its register card). Their function (artefactPage) is no longer used.
//
// Every page is the same composition: the headline (and its sub line flowing under it) from y 154, the tint panel under it, and
// the artefact on the panel as a crisp white card. Where the panel starts depends on the headline's size and on whether there
// is a sub line (the reference spacing for two headline lines and up to three sub lines), and the card sits just under the
// panel's top. So each layout has one band per headline size and sub line, each band a panel, a headline and an artefact with
// the same condition; the bands exclude each other, so exactly one is drawn. The headline's size is the spec's (70, 84 or 112)
// or the template's default: 84, but 112 for a passbook page on its own without a sub line. A 112 px headline is 940 px wide,
// the others 900.

// The panel's top for a headline of 70, 84 or 112 px, without and with a sub line (design/templates/editorial.mjs panelTopFor).
const PANEL_TOP = { 70: [350, 500], 84: [420, 540], 112: [450, 600] };
// The bottom of the cards' area: a passbook page on its own fills the panel down to it (but is 420 to 724 px tall).
const CARD_FOOT = 1190;

// The bands' conditions: a size as given, or (`not`) the default one, which an unset size also takes.
const SIZE_WHEN = {
  usual: { 70: { field: 'size', is: 70 }, 84: { field: 'size', not: [70, 112] }, 112: { field: 'size', is: 112 } },
  // a passbook page on its own: without a sub line an unset size is 112; with one it is 84
  big: {
    70: [{ field: 'size', is: 70 }, { field: 'size', is: 70 }],
    84: [{ field: 'size', is: 84 }, { field: 'size', not: [70, 112] }],
    112: [{ field: 'size', not: [70, 84] }, { field: 'size', is: 112 }],
  },
};

// Where the artefact's rectangle starts under the panel's top, and how tall it is, by what it shows. A ledger or register card
// takes its own size from its content, from the rectangle's top-left; a passbook page on its own fills the rectangle; beside
// its register card it is 410 px wide and the rectangle's height, the card at the rectangle's top-right.
const CARD = {
  ledger: (top) => ({ y: top + 44, h: CARD_FOOT - top - 44 }),
  register: (top) => ({ y: top + 48, h: CARD_FOOT - top - 48 }),
  passbook: (top) => ({ y: top + 46, h: Math.min(724, Math.max(420, CARD_FOOT - top - 46)) }),
  'passbook-register': (top) => ({ y: top + 48, h: 540 }),
};

function bands(card, sizeWhen) {
  const panels = [], heads = [], cards = [];
  for (const size of [70, 84, 112]) {
    [false, true].forEach((sub, i) => {
      const top = PANEL_TOP[size][i % 2];
      const base = sizeWhen === 'big' ? SIZE_WHEN.big[size][i] : SIZE_WHEN.usual[size];
      const when = { ...base, [sub ? 'present' : 'absent']: 'sub' };
      const c = CARD[card](top);
      panels.push({ type: 'decoration', kind: 'panel', when, px: { x: 0, y: top, w: 1080, h: 1350 - top } });
      heads.push({ type: 'headline', size, subField: 'sub', when, px: { x: 70, y: 154, w: size === 112 ? 940 : 900, h: top - 154 } });
      cards.push({ type: 'artefact', when, px: { x: 70, y: c.y, w: 940, h: c.h } });
    });
  }
  return { panels, heads, cards };
}

// One layout: `from` is where the artefact is (the artefact field of a text page, or the spec itself for the ledger and passbook
// templates); `card` what it is.
function artefactLayout({ id, name, description, from, card, types }) {
  const { panels, heads, cards } = bands(card, card === 'passbook' ? 'big' : 'usual');
  return {
    id,
    name,
    description,
    page: 'editorial',
    ground: 'series',
    // The ledger and passbook templates' own fields (columns, rows, ...; days, ticked, ...) are their artefact: the
    // artefact block reads them from the spec (from: ledger | passbook). Designs are checked by validateDesign as before.
    fields: { headline: { required: true, max: 220 }, sub: { max: 220 }, artefact: { required: true, types } },
    canvas: { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } },
    blocks: [
      ...panels,
      { type: 'runhead' },
      ...heads,
      ...cards.map((c) => (from === 'field' ? c : { ...c, from })),
      { type: 'footer' },
    ],
  };
}

const LEDGER = artefactLayout({ id: 'ledger', name: 'Ledger', description: 'A headline, a sub line and a ledger card (ruled mono rows, gold underlines) with its notes on the panel.', from: 'ledger', card: 'ledger', types: ['ledger'] });
const PASSBOOK = artefactLayout({ id: 'passbook', name: 'Passbook', description: 'A headline, a sub line and a passbook page of 28 to 31 days on the panel.', from: 'passbook', card: 'passbook', types: ['passbook'] });
const PASSBOOK_REGISTER = artefactLayout({ id: 'passbook-register', name: 'Passbook and register', description: 'A headline, a sub line, and a passbook page with a register card beside it on the panel.', from: 'passbook', card: 'passbook-register', types: ['passbook'] });
const TEXT_LEDGER = artefactLayout({ id: 'text-ledger', name: 'Text with a ledger', description: 'A headline, a sub line and the artefact, a ledger card with its notes, on the panel.', from: 'field', card: 'ledger', types: ['ledger'] });
const TEXT_REGISTER = artefactLayout({ id: 'text-register', name: 'Text with a register card', description: 'A headline, a sub line and the artefact, a register card, on the panel.', from: 'field', card: 'register', types: ['register'] });
const TEXT_PASSBOOK = artefactLayout({ id: 'text-passbook', name: 'Text with a passbook page', description: 'A headline, a sub line and the artefact, a passbook page, on the panel.', from: 'field', card: 'passbook', types: ['passbook'] });
const TEXT_PASSBOOK_REGISTER = artefactLayout({ id: 'text-passbook-register', name: 'Text with a passbook and card', description: 'A headline, a sub line and the artefact, a passbook page with its register card, on the panel.', from: 'field', card: 'passbook-register', types: ['passbook'] });

export const LAYOUTS = {
  ledger: [{ layout: LEDGER }],
  passbook: [{ when: { field: 'register', is: true }, layout: PASSBOOK_REGISTER }, { layout: PASSBOOK }],
  text: [
    { when: { field: 'artefact', is: 'ledger' }, layout: TEXT_LEDGER },
    { when: { field: 'artefact', is: 'register' }, layout: TEXT_REGISTER },
    { when: { field: 'register', is: true }, layout: TEXT_PASSBOOK_REGISTER },
    { when: { field: 'artefact', is: 'passbook' }, layout: TEXT_PASSBOOK },
  ],
};
