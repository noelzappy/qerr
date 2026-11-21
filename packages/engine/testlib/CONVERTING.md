# How the built-in layouts are tested

The built-in templates (`object`, `number`, `product`, `myth-fact`, `closing`, `cover`, `text`, `ledger`, `passbook`, `stats`,
`screen`, `photo-story`, `photo`, `pagecover`) are layout data in `lib/design/builtin/*.mjs`, registered in
`lib/design/builtin-layouts.mjs` (`BUILTIN`, `builtinLayoutFor()`, `TEMPLATE_FNS`) and drawn by the one layout renderer
(`lib/design/layout-render.mjs`, which hands a `poster`, `editorial`, `photo` or `cover` page to `layout-poster.mjs`,
`layout-editorial.mjs`, `layout-photo.mjs` or `layout-cover.mjs`). They were written, template by template, to make exactly the
images the hand-written template functions made; those functions are gone. `design/templates/*.mjs` now holds only the drawing
helpers the page files call (the logo bar, the object photo, the footer, the phone, the desktop window, the cards ...). A design
that names a template (`{ "template": "number", ... }`) is still checked by `validateDesign` (`lib/design/spec.mjs`, never
loosened) and drawn from the first variant of its template whose `when` holds.

Three things hold the built-in layouts to what the functions drew. Read `AGENTS.md` first, rules 10 and 11 above all.

## 1. The markup fixture (no Chrome, in `npm test`)

`testlib/builtin-markup.json` holds, per group, a sha256 of the page markup (`body`, `bodyClass`, `bodyAttrs`, `sheet`, and the
warnings where a test compares them) of every case the built-in tests draw, recorded from the template functions before they
were removed. It holds no markup, no picture and no data: URI: an id per case (a hash of what the case is: the spec, the brand
style, the carousel page, the picture's size) and the hash of what was drawn for it; the harness's pages are named
`<style>/<file>`.

| group | test file | what |
| --- | --- | --- |
| `builtin` | `test-design-builtin.mjs` | every page of the harness's cases with test pictures, at feed, every style and page; number and text with every ground, accent and hostile text; refusals |
| `harness` | `test-design-builtin.mjs` | every page of `testlib/template-baseline.mjs` as `markup` computes it (real demo pictures, every size, every style, the page covers) |
| `poster`, `artefacts`, `editorial`, `screen`, `photo` | `test-design-builtin-<group>.mjs` | each group's templates with fields filled, empty and hostile, every ground, accent, option, size and page, the refusals' words |

`testlib/markup-fixture.mjs` does the checking: `fx.check(identity, pages)` fails when the pages differ from the recorded hash
(or the case is not recorded), and the last test of each file, `fx.done()`, fails when a recorded case was not checked, so a
test that quietly stops covering a case fails too.

**A change of look on purpose** (a built-in layout or a page drawing that should draw something else): make the change, render
the harness before and after and look at the pictures (below), then record the fixture again and commit it with the change:

```sh
VESK_RECORD_MARKUP=1 npm test --workspace @vesk/engine
git diff --stat packages/engine/testlib/builtin-markup.json   # only the cases you meant to change
```

Never record it again to make a failing test pass without knowing why it failed.

## 2. Every valid design has a layout (no Chrome, in `npm test`)

`test-design-builtin.mjs` builds designs over every choice the registry's variants are picked by (artefact type, register card,
`layout`, `device`, `beside`, `fade`, `glow`, `map`, `size`, `align`, `textAt`, `kind`, sizes) and checks that each one
`validateDesign` accepts has a layout at every size and carousel page. A design no layout takes is refused (`TEMPLATE_FNS` and
`preparePage` throw a `DesignError`); nothing draws it any other way.

## 3. The pixel harness (Chrome, by hand)

`testlib/template-baseline.mjs` renders every template with representative specs (fields present and absent, every ground kind,
carousel page 1 and later pages, photos whose plain background becomes the page and photos that stay a band) at every size it
supports, for the demo brand and two style variants, through the web app's render entry point, as lossless PNGs, and compares
two runs. One Chrome at a time (rule 10): wrap it in the machine's Chrome lock if several agents share it.

```sh
node packages/engine/testlib/template-baseline.mjs render base            # before the change (about four minutes)
node packages/engine/testlib/template-baseline.mjs markup base            # the current code's markup against the run's, no Chrome
node packages/engine/testlib/template-baseline.mjs render after
node packages/engine/testlib/template-baseline.mjs compare base after --tolerance 4 --diff
node packages/engine/testlib/template-baseline.mjs sheet after            # contact sheets to look at
```

`--only number,text` takes template names (a carousel case counts for every template on it; `pagecover` for the page covers),
`--styles` and `--cases` narrow further, `list` shows the cases. `compare` exits non-zero when an image has more than `--max` (20)
differing pixels or a case's result (ok, error, warnings, notes) differs; `--diff` writes red-marked difference pictures to
`out/template-baseline/after/diff/`. Everything under `out/` is git-ignored; never commit an image. Look at every image (rule 10).
Add a case to `CASES` (and record the fixture) when a layout gains a variant the cases do not show; take the base run first.

## Rules for the drawings (rule 11)

- Spec and brand text only through `esc()`, `fmtE()`, `fmtSub()`, `lbl()`; pictures only through `ctx.image()`.
- A spec number that moves something is re-checked in the drawing before use, even though `validateDesign` checked it
  (`isInt(spec.photoTop, 300, 960) ? spec.photoTop : r.y`). A spec name that picks something is looked up in its fixed list.
- A class name comes from `opt()` (a listed value) or a constant; a position or size is computed from validated numbers and
  written with `px()`.
- No new stylesheet: the built-in pages use `brand.css`. `design/layout.css` is for grid pages only and holds structure, never a
  colour, font or size of a brand.
- A new block type or option is a name from a fixed list, a flag or a bounded whole number in `lib/design/layout.mjs`; one that
  reads a template's own spec setting (`specSize`, `specAlign`, `photoTop`, `phoneTop`, `lists`, `specWindow`, an artefact `from`
  the spec, the `beside` card) is marked built-in only in `layout.mjs` (`only()`, `builtin: true`), and a condition may test such
  a setting on a built-in layout only: a brand's layout is refused them (`validateLayout` without `{ builtin: true }`; see
  `docs/design.md`, "Starting from a built-in layout"). `builtinCopy` (`lib/design/layout-starters.mjs`) must still make every
  copyable built-in layout a valid brand layout (`test-design-layout-builtin.mjs`).

## What the layouts keep (learned converting them)

- **Defaults differ per page.** `BLOCKS` defaults are the grid page's (a headline's `style` defaults to `editorial`); a poster
  drawing treats an unset `style` as `poster`.
- **`#txt`.** The main text box has `id="txt"` (brand.css puts it above the photo): the first headline or figure a page draws
  gets it, except the stats figure and myth-fact's slabs.
- **Order is stacking.** A built-in page draws its blocks in the order listed (later on top), and blocks carry their own line
  breaks (the photo page), so the order is part of the markup.
- **One choice per condition.** A `when` tests one choice of `SPEC_CHOICES`, so a headline that depends on the spec's `size`
  and `align` is one block per size taking the align through `specAlign`; independent flags (a desktop window's `framed` and
  `tilt`) are read by the block from the spec's validated values (`specWindow`). Template variants that share little are one
  layout each at the registry.
- **Computed geometry stays in the drawings**, from validated numbers: the phone and its glow from the picture's own size
  (`ctx.imageSize`), artefact cards from their drawn size, figures spread by their count.
- **Quirks are part of the output**: number without a photo is `cool`; product's headline is 88 with a sub line and 104 without;
  closing's text moves down with the map; the poster bar stays at the top when a photo or phone reaches the bottom; the page
  covers' `left:0` and their property order.
- **The photo post is not drawn bit for bit the same twice.** Its blurred text shadow differs by 1 to 4 levels over large areas
  between two runs of the same code: compare it with `--tolerance 4` and rely on the markup.
- **Page covers** are not post images: `renderDesignBlock` refuses them, so the harness renders them with `renderImage`. The demo
  brand's tagline does not fit the `x` cover (and with upper-case display not `facebook` or `linkedin` either): those refusals
  are part of the baseline.
