// The editorial templates with a photo or figures, and the plain text page, as layouts (a "page": "editorial" each; see
// lib/design/layout-editorial.mjs for how the blocks are drawn and design/templates/*.mjs for the functions they replace). One
// entry per template: a list of { when?, layout }, the first whose condition holds drawing the page; a spec that matches none is
// drawn by the template function (not converted yet).
//
// Converted: none yet. A text page with an artefact belongs to the artefact group (builtin/artefacts.mjs).
export const LAYOUTS = {};
