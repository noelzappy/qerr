# Converting a built-in template to a layout

The built-in templates (`design/templates/*.mjs`) are being re-expressed as layout data (`lib/design/layout.mjs`), drawn by the
one layout renderer (`lib/design/layout-render.mjs`). Phase 1 extended the format and converted `number` and `text` (without an
artefact). Phase 2 converts the rest, one template group per person or agent, in parallel. This file is how.

**The bar: the same output as today.** Every baseline image of your templates identical (at most about 20 differing pixels, of
tiny deltas, from anti-aliasing), for the demo brand and both style variants, at every size, with the same errors, warnings and
notes. Old designs (`{ "template": "stats", ... }`) keep working unchanged: they are still checked by `validateDesign`
(`lib/design/spec.mjs`, never loosened); only how the page is drawn changes. Read `AGENTS.md` first, rules 10 and 11 above all.

## Where things are

| file | what |
| --- | --- |
| `lib/design/layout.mjs` | the format and its validator: `BLOCKS` (block types and their options, each a fixed list or a bounded number), `PAGES` (per built-in page: the block types it draws and the options each honours, its decorations and fit margins), `when` conditions, `px` rectangles, ground cases |
| `lib/design/layout-parts.mjs` | shared: `opt()` (an option, only ever a listed value), `place()`/`box()`, decorations, `builtFrame()` (ground, accent, texture, series label of a built-in page) and `drawBuiltPage()` (the loop: blocks in order, `when` applied) |
| `lib/design/layout-poster.mjs` | the poster page's drawings (`DRAW`) and wrapper |
| `lib/design/layout-editorial.mjs` | the editorial page's drawings (`DRAW`) and wrapper |
| `lib/design/layout-render.mjs` | `renderLayoutWith()`: a grid page, or hands a `poster`/`editorial` page to its file; `layoutFit()` (a built-in page uses `PAGES[page].fit`) |
| `lib/design/builtin-layouts.mjs` | the registry (do not edit for a group): `builtinLayoutFor(spec, counter)`, `builtinTemplate()` |
| `lib/design/builtin/<group>.mjs` | **your group's layouts**: `LAYOUTS = { <template>: [{ when?, layout }, ...] }` |
| `design/templates/index.mjs` | `TEMPLATE_FNS` (routes through the registry) and `LEGACY_FNS` (the functions) |
| `test-design-builtin.mjs` | proves, without Chrome, that a converted template's markup is the function's, byte for byte |
| `testlib/template-baseline.mjs` | the pixel harness (below) |

## The groups (one file each, so the branches do not collide)

| group | templates | layouts file | page drawings |
| --- | --- | --- | --- |
| poster | `object`, `product`, `myth-fact`, `closing` | `builtin/poster.mjs` | `layout-poster.mjs` |
| artefacts | `ledger`, `passbook`, `text` with an `artefact` | `builtin/artefacts.mjs` (extra `text` entries go here; they are tried after editorial's) | `layout-editorial.mjs` |
| editorial | `cover`, `stats`, `photo-story` | `builtin/editorial.mjs` (holds `text` already) | `layout-editorial.mjs` |
| screen | `screen` (phone, beside, fade, desktop) | `builtin/screen.mjs` | `layout-editorial.mjs` |
| photo | `photo` (every size), `pagecover` | `builtin/photo.mjs` | a new `layout-photo.mjs` (and probably `layout-cover.mjs`) |

## Who edits what (so that the group branches merge without conflicts)

Each group edits **only** the places below. Every shared list has one section per group, between `// -- <group> group --` and
`// (end of <group> group)`: put your lines inside your own section, just before its end line, and never edit, reorder or
reformat anything outside it. Sections are separated by unchanged lines, so git merges the branches cleanly.

| file | every group | only its owner |
| --- | --- | --- |
| `lib/design/builtin/<group>.mjs` | its own file, freely | |
| `lib/design/layout.mjs` | its section in `BLOCKS` (new block types), `ADDED_OPTIONS` (`[type, name, option]`: a new option on a block type that exists), `ADDED_HONOURS` (`[page, type, option]`: a page honours one more option of a block type it already draws) and `PAGES.<page>.draws` (a page draws a block type it did not) | photo: `PAGE_KINDS`, a new `PAGES.photo` / `PAGES.cover` entry, the canvas size rules for page covers |
| `lib/design/layout-poster.mjs` | | poster: everything (the `words`, `sub`, `stats`, `photo` drawings included) |
| `lib/design/layout-editorial.mjs` | its sections: new drawing functions above `DRAW`, and their lines in `DRAW` | screen: the existing `headline` drawing (the flowing pills and check list, textBlock's `flow`); nobody else changes the existing drawings |
| `lib/design/layout-photo.mjs`, `layout-cover.mjs` (new) | | photo |
| `lib/design/layout-render.mjs` | | photo: the dispatch in `renderLayoutWith` and `layoutFit` for its new page kinds |
| `lib/design/layout-parts.mjs` | nothing | |
| `design/templates/<template>.mjs` | its own templates' files: export a helper (output unchanged), comment the function as unused | poster: `poster.mjs`; artefacts: `artefactPage.mjs`, `artefacts.mjs`, `ledger.mjs`, `passbook.mjs`, `text.mjs`; editorial: `cover.mjs`, `stats.mjs`, `photo-story.mjs`; screen: `screen.mjs`; photo: `photo.mjs`, `pagecover.mjs`. `editorial.mjs` (shared helpers): export only, no change of output |
| `testlib/template-baseline.mjs` | new cases at the end of its own templates' part of `CASES` (before the carousels), added **before** it takes its baseline | |
| tests | a new file `test-design-builtin-<group>.mjs` (its fields filled, empty and hostile, against `LEGACY_FNS`, as in `test-design-builtin.mjs`; its new options, valid, invalid and hostile) | |
| `docs/design.md` | its own bullet under "The built-in templates as layouts" (the bullets are separated by blank lines) | |
| `packages/engine/testlib/CONVERTING.md` | its own gotchas, as a new bullet at the end of "Gotchas" | |

Nobody edits `lib/design/builtin-layouts.mjs`, `design/templates/index.mjs`, `lib/design/render.mjs`, `lib/design/spec.mjs`,
`test-design-builtin.mjs` (it compares every registered template with its function by itself), `test-design-layout.mjs` or
`test-design-layout-shared.mjs`. A change you need there is a shared change: ask the coordinator.

## The shared extensions (in place)

**1. A headline with its sub line flowing under it** (`textBlock({ headline, sub, subW })` on editorial pages, `words({
headline, sub, subW, align })` on posters). Give the headline block `subField` (a declared text field) and `subWidth` (the
sub line's `max-width`, a whole number of pixels from 100 to 1080, default 820):

```js
{ type: 'headline', size: 84, subField: 'sub', subWidth: 900, px: { x: 70, y: 896, w: 940, h: 300 } }       // cover
{ type: 'headline', size: 104, align: 'center', subField: 'sub', px: { x: 80, y: 170, w: 920, h: 400 } }    // object
```

The sub line is drawn inside the headline's `#txt` box, 28 px under it (`margin-top`), `max-width` the `subWidth`, centred
under a centred poster headline: byte for byte the templates' markup (`test-design-layout-shared.mjs` compares it with
`textBlock` and `words`). Since it is in the same box it moves up as the fit loop shrinks the headline, as today. The field
counts as shown by that block. Built-in pages only. Not drawn yet: textBlock's `pills` and `checks` (screen) and `flow` (the
phone row): the screen group adds them to the editorial headline drawing.

**2. Conditions on the artefact's type, flags and fixed spec options.** Besides `present`, `absent` and `page`, a `when` may
test one choice from the fixed table `SPEC_CHOICES` in `layout.mjs`:

```js
{ field: 'artefact', is: 'ledger' }            // the artefact's type: ledger, passbook, register
{ field: 'register', is: true }                // a passbook with a register card (spec.register or spec.artefact.register)
{ field: 'layout', is: 'side' }                // product center|side, photo-story panel|print (as given: unset matches no "is")
{ field: 'layout', not: 'side' }               // ... so the default variant is "not side" (unset included)
{ field: 'size', is: [70, 84] }                // the spec's headline size, as given
{ field: 'device', is: 'desktop' }             // phone (default) or desktop
{ field: 'glow', is: false }                   // flags with their templates' defaults: glow, dots default true; map, fade, tilt, framed false
{ field: 'textAt', is: 'bottom' }              // the photo post's, per size resolved (default top); also scrim (default black)
{ field: 'beside', is: true }                  // presence: beside, pills, checks
{ field: 'artefact', is: 'passbook', present: 'sub', page: 'first' }   // several keys: all must hold
```

`is` and `not` take one value or a list of them; every value must be in the choice's list, and a choice must be in the table.
Two conditions on the same choice that let no value through together exclude each other (so their blocks may share a field
and space). On a grid page (a brand's own layout) only `artefact` may be tested, and only when declared; the registry
variants (`LAYOUTS = { text: [{ when: { field: 'artefact', is: 'ledger' }, layout }] }`) may test any choice. A choice not in
the table (for example `closing`'s default text, `region`) is a shared change: ask the coordinator.

## The recipe

1. **Baseline first, on the unchanged branch**, before you change anything:
   ```sh
   node packages/engine/testlib/template-baseline.mjs render base --only cover,stats,photo-story
   ```
   `--only` takes template names (a carousel case counts for every template on it; `pagecover` for the page covers). `list`
   shows the cases. Renders are sequential, one Chrome (rule 10); a full run of all templates takes about four minutes. Add
   cases to `CASES` in `template-baseline.mjs` if your template has a variant they do not cover (do it before the baseline).
2. **Read the function** and list everything it writes: every element, its position (often a constant, sometimes computed from a
   spec value, the brand or the picture's size), its markup and classes, the conditions (`spec.x ? ... : ''`, `spec.size ??
   (spec.sub ? 88 : 104)`), and what it passes to `page()`/`poster()` (ground, accent fallback, `flex`, `dots`).
3. **Write the layout** in your group's file. Use `px` for hand-placed things, `when` for branches (two blocks with exclusive
   conditions may show the same field), a ground case list when the ground depends on a field, and the page's chrome blocks.
   The `canvas` still needs a grid per size the template draws at (its keys are the layout's sizes; with `px` blocks its cells
   go unused, so give it the page's own margins). Number and text (`builtin/poster.mjs`, `builtin/editorial.mjs`) are the
   models.
4. **Add the drawings your blocks need** to the page file: reproduce the template's markup byte for byte, by calling the
   template's helper where there is one (export it from the template file without changing its output, as `bar` and
   `objectPhoto` were). All of it in your sections (see "Who edits what"): a new block type's line in `PAGES[page].draws`
   with its honoured options; one more honoured option of a drawn type in `ADDED_HONOURS`; a new option in `ADDED_OPTIONS`
   (`e(list, def)`, `b(def)` or `n(min, max, def)`: a fixed list, a flag or a bounded whole number; wrap a built-in-only one
   in `on(BUILT_PAGES, ...)` so the editor and the AI never see it).
5. **Compare the markup, without Chrome**, until there is no difference:
   ```sh
   node packages/engine/testlib/template-baseline.mjs markup base --only cover,stats,photo-story
   ```
   It prints, per page, the first character that differs. Byte-identical markup gives identical pixels; this loop takes seconds.
6. **Render and compare the pixels**, then look at the images (rule 10: every image):
   ```sh
   node packages/engine/testlib/template-baseline.mjs render after --only cover,stats,photo-story
   node packages/engine/testlib/template-baseline.mjs compare base after --only cover,stats,photo-story --diff
   node packages/engine/testlib/template-baseline.mjs sheet after --only cover,stats,photo-story
   ```
   `compare` exits non-zero when an image has more than `--max` (20) differing pixels or a case's result (ok, error, warnings,
   notes) differs; `--diff` writes red-marked difference pictures to `out/template-baseline/after/diff/`. `sheet` writes contact
   sheets (`out/template-baseline/after/sheet-<only>-<style>-<n>.png`) to look at with an image viewer. Everything under `out/`
   is git-ignored; never commit an image.
7. **Tests.** `test-design-builtin.mjs` compares every registered template's markup with its function's for every harness
   case, style and carousel page by itself. In your own `test-design-builtin-<group>.mjs`, compare your templates with
   `LEGACY_FNS` for fields filled, empty and hostile, every ground and accent and option they take, and the errors they raise;
   and test each new block type and option (valid, invalid, hostile). `test-design-security.mjs` runs hostile text through
   `TEMPLATE_FNS`, so it covers your layouts once registered. Then `npm test` and `npm run typecheck --workspace @vesk/web`.
8. **Leave the function in place, unused** (phase 2 removes them all at the end), and say so in its comment and in your
   group file's "Converted:" line. Update your bullet in `docs/design.md` ("The built-in templates as layouts").

## Rules for the drawings (rule 11)

- Spec and brand text only through `esc()`, `fmtE()`, `fmtSub()`, `lbl()`; pictures only through `ctx.image()`.
- A spec number that moves something is re-checked in the drawing before use, even though `validateDesign` checked it
  (`isInt(spec.photoTop, 300, 960) ? spec.photoTop : r.y`). A spec name that picks something is looked up in its fixed list.
- A class name comes from `opt()` (a listed value) or a constant; a position or size is computed from validated numbers and
  written with `px()`.
- No new stylesheet: the built-in pages use `brand.css` as the templates do. `design/layout.css` is for grid pages only and holds
  structure, never a colour, font or size of a brand.

## Gotchas found in phase 1

- **Defaults differ per page.** `BLOCKS` defaults are the grid page's (a headline's `style` defaults to `editorial`); a poster
  drawing treats an unset `style` as `poster`. Check `blk.x !== undefined` before `opt(blk, 'x')` when the page's default differs.
- **`#txt`.** The templates' main text box has `id="txt"` (brand.css puts it above the photo). The first headline or figure a
  page draws gets it (`lead(state)` in the page files); keep that order.
- **Order is stacking.** A built-in page draws its blocks in the order listed (later on top), not grouped as a grid page is.
  Keep the template's DOM order (number: photo, bar, figure, line, stats; text: panel, running head, headline, sub, footer).
- **Quirks are part of the output.** `number` without a photo is `cool` even when its series has another ground (hence its
  ground case list); with one it starts from the series' ground. `text` takes the spec's `size` (70, 84, 112) through
  `specSize`. `product`'s headline is 88 with a sub line and 104 without (two headline blocks with exclusive `when`s).
  `closing`'s bar has no label, its headline defaults to the brand's tagline (`taglineMarkup`) and its line to the website, and
  its text moves down when `map` is on. `myth-fact`'s series mark sits opposite the logo bar (bottom right, or top right when
  the bar is at the bottom). Reproduce them; changing a look is not part of this work.
- **Derived attributes.** A sub line on the editorial panel carries `data-onpanel` (the fit check then ignores the panel's
  edge for it); the page file derives it from the rectangles. The editorial footer's logo is drawn for the panel when the page
  has one, else for the ground.
- **Fit margins** come from `PAGES[page].fit` (poster and editorial: pad 62, top 46, the templates' reference margins). The
  photo post and page covers use the size's own margins (`S`): give those pages `fit: null` and make `layoutFit` return `S`.
- **The photo post is not drawn bit for bit the same twice.** Its blurred text shadow differs by 1 to 4 levels over large
  areas between two runs of the same code. Compare it with `--tolerance 4` and rely on `markup` being identical.
- **Page covers** are not post images: `renderDesignBlock` refuses them, so the harness renders them with `renderImage`. Their
  sizes (`profile`, `facebook`, `linkedin`, `x`) are `COVER_SIZES`, not layout sizes; the canvas validation must learn them for a
  `cover` page. The demo brand's tagline does not fit the `x` cover (and with upper-case display not `facebook` or `linkedin`
  either): those refusals are part of the baseline.
- **Computed geometry.** `screen` centres a flex row of text and phone in a band and sizes the phone and its glow from the
  picture's own size (`ctx.imageSize`); `product` sizes the glow from it; `artefactPage` sizes cards from the artefact's drawn
  size and places notes under them; `stats` and `number` spread figures by their count. Keep the computation in the drawing,
  from validated numbers, and keep the layout's `px` as the rectangle the drawing works in.
- **Variants at the registry.** When a template's variants share little (`screen` phone, beside, fade and desktop; `text` with
  each artefact type), register one layout per variant with a `when` in your group file instead of one layout full of
  conditions. The first variant whose `when` holds is drawn; a spec that matches none falls back to the function.
- **`ensureValid`.** The registry validates every built-in layout the first time one is used and throws a plain `Error` naming
  each problem; `test-design-builtin.mjs` checks the same with `builtinProblems()`.
- **Editorial group (cover, stats, photo-story).** The editorial page now draws `photo` (`frame`), `figure`, `stats` and the
  new `labelrow`, each with the editorial markup, which is not the poster's: the stats figure is a bare `abs h big` box with its
  line height set and *no* `#txt` (the stats page has none, so `editorialFigure` never calls `lead`); a `row` of stats is bold
  numbers over labels in the sub style (`size` unused), a `column` is the ruled rows (its style keeps the template's trailing
  `;` on the first row). A rule decoration is drawn across the middle of its rectangle, so stats' rule at `top:420px` is
  `y: 419, h: 2`. photo-story's default variant is `{ field: 'layout', not: ['center', 'side', 'print'] }` (unset or panel), so
  a layout it does not take still goes to the function, as `(spec.layout ?? 'panel') === 'panel'` decided. Two blocks with
  `present`/`absent: 'image'` share the stats field and the space under the line. `test-design-layout.mjs` asserted that an
  editorial page draws no `figure`; it now tests the refusal with a `slab` (a shared change). Imports a group needs in a
  shared page file go in its own section under names of its own (`import * as editorialKit ...`), so two groups importing the
  same helper do not declare it twice when their branches merge.

## Pre-existing issues seen in the baseline (not part of the conversion)

- With the logo at the bottom (`style.logo` `bottom-left`/`bottom-right`), the poster bar sits over the photo of `number` and
  `object` and over the phone of `product`; on a dark ground with a treated photo the white wordmark is unreadable there, and no
  check measures the logo's contrast. Reproduce it as it is; fix it separately.
