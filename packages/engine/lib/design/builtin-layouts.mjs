// The built-in templates, as layouts. A design that names a template ({ "template": "number", ... }) is drawn from the layout
// registered for it here, through the same layout renderer as a brand's own layouts (lib/design/layout-render.mjs). The layouts
// were first written to make exactly the images the hand-written template functions made; those functions are gone, and the
// tests hold the layouts to the markup they drew (testlib/builtin-markup.json, see testlib/CONVERTING.md).
//
// The layouts live in one file per template group (lib/design/builtin/*.mjs); each exports
// LAYOUTS = { <template>: [{ when?, layout }, ...] }, tried in order, the first whose condition holds drawing the page.
// Designs are still checked by the templates' own validator (lib/design/spec.mjs, validateDesign): a built-in layout never
// widens what a design may contain.
import { LAYOUTS as ARTEFACTS } from './builtin/artefacts.mjs';
import { LAYOUTS as EDITORIAL } from './builtin/editorial.mjs';
import { LAYOUTS as PHOTO } from './builtin/photo.mjs';
import { LAYOUTS as POSTER } from './builtin/poster.mjs';
import { LAYOUTS as SCREEN } from './builtin/screen.mjs';
import { DesignError } from './errors.mjs';
import { FIELD_NAMES, validateLayout, whenHolds, whenProblems } from './layout.mjs';
import { renderLayoutWith } from './layout-render.mjs';
import { TEMPLATES } from './spec.mjs';

// template -> [{ when?, layout }], the groups in a fixed order (editorial before artefacts, so a text page's own entry comes first).
const GROUPS = [POSTER, EDITORIAL, ARTEFACTS, SCREEN, PHOTO];
export const BUILTIN = {};
for (const g of GROUPS) for (const [t, list] of Object.entries(g)) BUILTIN[t] = [...(BUILTIN[t] ?? []), ...list];

// Every built-in layout valid, every id used once, every template a real one, every condition a valid one, and only the last
// variant of a template without a condition.
export function builtinProblems() {
  const errors = [], ids = [];
  for (const [t, list] of Object.entries(BUILTIN)) {
    if (!TEMPLATES.includes(t)) errors.push(`built-in layouts: "${t}" is not a template`);
    if (!Array.isArray(list) || !list.length) { errors.push(`built-in layouts: ${t} must be a list of { when?, layout }`); continue; }
    list.forEach((v, i) => {
      const where = `built-in layouts: ${t}[${i}]`;
      if (v.when !== undefined) errors.push(...whenProblems(v.when, FIELD_NAMES, `${where}.when`));
      else if (i < list.length - 1) errors.push(`${where} has no "when", so the variants after it are never used`);
      errors.push(...validateLayout(v.layout, where, { builtin: true }));
      ids.push(v.layout?.id);
    });
  }
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) errors.push(`built-in layouts: the id "${id}" is used more than once`);
  return errors;
}

let problems = null;
const ensureValid = () => {
  problems ??= builtinProblems();
  if (problems.length) throw new Error(`the built-in layouts are not valid: ${problems.join('; ')}`);
};

// The layout a design of a built-in template is drawn from, or null when no variant of its template takes it (a design that
// validateDesign refuses: every valid one has a layout, test-design-builtin.mjs checks it). counter: { n, total } on a carousel page.
export function builtinLayoutFor(spec, counter) {
  if (!spec || !Object.hasOwn(BUILTIN, spec.template)) return null;
  ensureValid();
  return BUILTIN[spec.template].find((v) => whenHolds(v.when, spec, counter))?.layout ?? null;
}

// The built-in templates by name, each (spec, ctx) -> { body, bodyClass?, bodyAttrs?, warnings? }: drawn from its layout.
export const TEMPLATE_FNS = Object.fromEntries(Object.keys(BUILTIN).map((name) => [name, (spec, ctx) => {
  const layout = builtinLayoutFor({ ...spec, template: name }, ctx.counter);
  if (!layout) throw new DesignError(`the ${name} template has no layout for this design (the design checks refuse it)`);
  return renderLayoutWith(layout, spec, ctx);
}]));
