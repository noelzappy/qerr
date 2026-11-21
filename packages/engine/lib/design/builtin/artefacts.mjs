// The artefact templates as layouts: ledger, passbook, and a text page with an artefact (design/templates/artefactPage.mjs,
// ledger.mjs, passbook.mjs, text.mjs). One entry per template: a list of { when?, layout }, the first whose condition holds
// drawing the page; a spec that matches none is drawn by the template function. A text page with an artefact is added here as
// more entries for "text" (they are tried after builtin/editorial.mjs's, which takes a text page without one).
//
// Converted: none yet (phase 2, testlib/CONVERTING.md).
export const LAYOUTS = {};
