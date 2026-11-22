# Looks as data — the agreed design (binding for every agent on this work)

Product: Qerr (formerly Vesk; the code, packages and UI now use Qerr).
Owner's decisions: (1) panel users with no code access must build their own look entirely from the web panel;
(2) shipped looks (retail, swiss, later more) are authored in the SAME data format so they can be duplicated and
edited; (3) the product will be hosted as a multi-customer SaaS, so looks must be tenancy-ready; (4) security model
unchanged (AGENTS.md rule 11): nothing from data reaches the page except through escaping, checked images,
validated numbers and fixed lists; no raw HTML/CSS/URLs from data; CSP unchanged.

Decision: a NEW declarative look + composition schema interpreted onto `packages/engine/lib/design/directions/kit.mjs`.
The existing layout system (`layout.mjs`, the `layout` template, built-ins, `BrandLayout`, `Layouts.tsx`) stays as
"Classic layouts", untouched and frozen. A brand with a look ignores classic layouts.

Reused ideas from the layout system: catalogue-driven editor (`layoutCatalogue()` → `lookCatalogue()`), the `when`
grammar (`present`/`absent`), validate/preview/save/duplicate route shapes (`apps/web/src/server/routes/layouts.ts`),
validation three times (on save, in `validateBrand`, before drawing), the markup-fixture harness
(`packages/engine/testlib/markup-fixture.mjs`, `CONVERTING.md`).

## 1. Schema

### Look
```
{ schema: 1, id, name, description (≤300), origin: "shipped" | "copy:<ref>",
  canvas: { feed: { margin:{top,right,bottom,left}, grid:{ cols 1–24, gutter 0–80, rows 0–16, head 0–120 }, extraLines:[≤4 px] } },
  fonts:  { display|text|label|mono: { source:"library", family:<name in design/fonts/library.json>, weights:[…], stretch?, italic? }
                                   | { source:"brand", role:"display"|"label"|"sans"|"mono" } },
  type:   { display:{ lead .78–1.2, track −.06–.02, weight, case, ladder:[1,.9,.82], trim:"cap"|"none", optical:bool },
            body:{ size (fixed list), lead, weight, strength: 1|.8 }, item:{…},
            label:{ size, track, weight, upper, role }, numeral:{ track, figures:"lining"|"oldstyle" } },
  colour: { logic:"tonal"|"one-accent"|"field", field:"primary"|"dark", sticker:"accent"|"primary",
            accentAsType:"never"|"when-contrast", grounds:[subset of paper, field, dark, accent, soft] },
  devices:{ rule:{hair,heavy}, frame:{t,pad}, highlight:{pad:[t,r,b,l], tilt}, shadow:{x,y: −24..24, colour},
            angles:{ sticker, bar, block, band, card, price: each −15..15 },
            metaRow:{ cells:[≤4 {source,col,span,align}], ruleTop, ruleBelow },
            folio:"no"|"pad2"|"pad2-of-total", wordmark:{opacity .02–.08, sep enum} },
  photo:  { treat:[grey|multiply|grain|punch], tint:<palette role> },
  logo:   { default:"off"|corner, height },
  dials:  { tilt 0–1.5 (scales all angles), density −1..1, weightShift −100..100 },
  compositions:[ … ≤ 21 (≤ 3 per kind) ] }
```
No hex colour and no CSS font name anywhere in a look: colours are role names resolved by `palette()` in
`directions/colour.mjs`; families come from the font library manifest (cap/ascent/descent metrics and fallback
stacks live in `library.json`). A look names no asset path, vault id or brand id: it is portable and safe to copy.

### Composition
```
{ kind, name, describe, ground: <ground> | [{when, ground}],
  fields: { headline:{required, max ≤ POST_FIELDS max}, … },
  accepts:[ {field, part:"all"|"pre"|"phrase", maxChars} | {field:"items", min, max} ],
  calm:{ maxShare .45–.8 }, fit:"margins"|"frame"|{pad,top,bottom},
  elements:[ … ≤ 40 nodes, depth ≤ 4 ] }
```
Kinds: statement, figure, list, quote, photo, event, offer (see `lib/design/post-spec.mjs`). A composition's id is
DERIVED as `<kind>/<index>` relative to its look, never stored free. `accepts` replaces any `accepts(spec)` function;
when the chosen variant does not accept the content, the next variant of the kind is used.

### Common element properties
| Property | Values |
|---|---|
| `place` (exactly one form) | `grid {col, span, row, rowSpan, alignY}`; `px {x,y,w,h}`; `anchor {left/right/top/bottom/w/h}`; `inset: "page"/"margins"/"frame"`; or a flow child of a `box` |
| Lengths | a bounded number, or a token: `margin`, `gutter`, `col`, `frame`, `frame+pad`. NO arithmetic. |
| `bleed` | `{edges:[…], by: 0–0.2 of own size}` |
| `rot` | a name from `look.devices.angles`, or −15..15; `vertical: "up"/"down"` for a rotated label |
| `skew` | −6..6 |
| `origin` | nine anchor names |
| `z` | 0–9 |
| `when` | `{present}` / `{absent}` (both must hold if both given) |
| `fill`, `ink` | palette roles |
| `shadow` | `"hard"` (the look's) or `{x,y,colour}` |
| `ring`, `border`, `pad`, `radius` | bounded numbers and roles |

### Element catalogue
| Type | Maps to (kit) | Own properties |
|---|---|---|
| `box` | `c.box` | `flow: column/row`, `justify`, `align`, `gap`, `grow`, `minH`, `children` |
| `text` | `c.type`/`c.display`/`c.body`/`c.label`/`c.run` | `field`, or `source: brand/folio/index`; `part: all/pre/phrase/post`; `split {sep:"·", pick: 0–3 or "rest"}`; `format: date-dd.mm/day/month/pad2/roman`; `style` role; `size` (from the role's list) or `ladder {by, steps:[[chars,size] ≤6]}`; `shrinkFloor` .82–1; `emphasis: italic/accent/bar/tilt-bar/own-line-bar/none`; `align`; `upper`; `nowrap` |
| `fitted-stack` (primitive) | `c.fitLines`, fitBlock, fitFill | `mode: lines/fill/block`; `cap`; `floor`; `maxLines` 1–5; `gapEm`; `valign`; `emphasisOwnLine`; `sizes[]` (block mode) |
| `numeral` (primitive) | `c.numeral` / fitted width | `cap`, `min`, `bleed`, `baselineAt`, `unit {field, style, at: top-right/under/bar}` |
| `mantra-rows` (primitive) | echo stack | `rmin`, `rmax`, `cap`, `floor`, `outline` 2–4 |
| `rows` (repeater; one per composition, never nested) | list / meta-table loops | `each: items/meta-parts`; `number: none/1/01/roman`; `altFill:[a,b]`; `altRot:[a,b]`; `rule`; `firstAccent`; a fixed two-cell template (number cell, text cell) with styles |
| `photo` | `c.photo` / `c.print` | `shape: rect/circle/arch/rounded/card/print`; `treat`; `border`; `keyline`; `caption` |
| `seam` (primitive) | box with a computed clip polygon | `leftY`, `rightY`, `edge` 0–32, `upper: photo/field`, `lower: <ground>` |
| `band` (primitive) | `c.band` | `y`, `h`, `rot`, `fill`, `children` (overscan computed from the angle) |
| `sticker` | `c.shape` | `shape: circle/pill/tile/stamp/seal`; `size`; `field`; ladder; `ring` |
| `rule`, `block`, `frame`, `keyline` | same-named builders | `weight: hair/heavy/n`; `colour` |
| `glyph` | `c.glyph` | `glyph` from a fixed list (opening/closing quotes, &, №, →); `size`; `colour` |
| `meta-row` (primitive) | swiss meta row | `tone: ink/light`; cells come from the look |
| `wordmark-pattern`, `scrim`, `punch-hole` | kit builders | enums and bounded parameters |

RULE FOR GROWTH: no expressions, no references between elements, no free strings. A new capability is a named
primitive (`directions/primitives/<name>.mjs`: a parameter table, `render(c, params, children)`, its CSS and runtime
hook) with at most about eight validated parameters.

### Examples
Retail `photo/0` Frame pop:
```json
{ "kind": "photo", "name": "Frame pop", "ground": "paper", "fit": "frame",
  "fields": { "image": {"required": true}, "headline": {"required": true, "max": 68}, "sub": {"max": 120}, "tag": {"max": 16} },
  "elements": [
    { "type": "photo", "place": {"inset": "frame"}, "shape": "rect", "treat": ["punch"] },
    { "type": "frame" },
    { "type": "box", "place": {"anchor": {"left": "frame", "right": "frame", "bottom": 34}},
      "rot": "block", "origin": "left bottom", "fill": "paper", "ink": "ink",
      "pad": [40, 48, 42, 48], "shadow": "hard", "flow": "column", "gap": 22,
      "children": [
        { "type": "text", "field": "headline", "style": "display",
          "ladder": {"by": "headline", "steps": [[34, 104], [50, 94], [70, 85]]}, "shrinkFloor": 0.82, "emphasis": "own-line-bar" },
        { "type": "text", "field": "sub", "style": "body", "when": {"present": "sub"} } ] },
    { "type": "sticker", "shape": "circle", "size": 250, "place": {"px": {"x": 760, "y": 22}},
      "rot": "sticker", "ring": {"w": 6, "colour": "paper"}, "field": "tag",
      "ladder": {"by": "tag", "steps": [[4, 92], [9, 66], [16, 52]]}, "when": {"present": "tag"} } ] }
```
Swiss `photo/0` Grid photo:
```json
{ "kind": "photo", "name": "Grid photo", "ground": "paper",
  "fields": { "image": {"required": true}, "headline": {"required": true, "max": 64}, "sub": {"max": 110}, "label": {"max": 28} },
  "elements": [
    { "type": "meta-row", "tone": "ink" },
    { "type": "photo", "place": {"grid": {"col": 5, "span": 8, "row": 2, "rowSpan": 5}}, "treat": ["grey"] },
    { "type": "block", "place": {"grid": {"col": 5, "span": 1, "row": 2, "rowSpan": 4}, "w": "gutter"}, "colour": "accent", "z": 2 },
    { "type": "text", "field": "sub", "style": "body",
      "place": {"grid": {"col": 1, "span": 4, "row": 2, "rowSpan": 4, "alignY": "top"}}, "when": {"present": "sub"} },
    { "type": "box", "place": {"grid": {"col": 1, "span": 9, "row": 6, "rowSpan": 3}}, "fill": "paper", "pad": [32, 0, 0, 0], "z": 2,
      "children": [ { "type": "fitted-stack", "field": "headline", "mode": "block", "sizes": [112, 101, 92], "maxLines": 3 } ] } ] }
```

## 2. Renderer
New engine files (under `packages/engine/lib/design/`):
- `look.mjs` — PURE (no Chrome): the `ELEMENTS` table, `validateLook(look, where, {shipped})`, `validateLooks(list)`,
  `lookCatalogue()` (drives the editor), `lookBrief(look)` (kinds, fields, budgets, variant names for AI and editor).
- `directions/interpret.mjs` — `renderComposition(look, comp, c)`: resolves each `place` to pixel numbers with the
  grid helpers and tokens, then calls kit builders.
- `directions/primitives/*.mjs` — one module per primitive.
- `looks/retail.mjs`, `looks/swiss.mjs` — frozen shipped data.
`directions/index.mjs`: the registry holds SHIPPED looks only (frozen at load); a brand's looks are resolved per call
from the `brand` object (`brand.looks`) — no module-level mutable per-brand state; any memo is keyed by content hash.

Security properties the interpreter enforces:
- The author cannot opt out of a check: `data-role` is derived from the field binding, never chosen; `data-grid="skip"`
  only when the element is rotated or inside a shape; `data-deco` only from primitives for non-field text; `data-fill`
  follows `fill`.
- Nothing raw from data reaches the page: the interpreter never forwards `extra`, `attrs`, `cls`, `id` or hex values;
  classes come from enum→class tables; numbers go through bounded validators.
- Each element carries `data-el="<index path>"` (digits and dots only) so the editor and check messages can address it.
- ONE stylesheet for looks: `design/directions/retail.css`/`swiss.css` dissolve into `kit.css` variants selected by enums
  plus numeric custom properties. CSP unchanged.
Kit/runtime additions: `data-h="auto"`/`data-w="auto"` for fitted elements (measure the laid-out box, as the
prototypes do — no character-count estimates); a row-top helper; `nudge`, `flexNone`, text-shadow parameters replacing
raw `extra`; `postMetrics()` returns rectangles keyed by `data-el`; runtime measurement of cap height and side bearing
for a brand's own fonts.
Fonts: embed the union of weights/styles used by the composition's elements per role (max ~6 files per page); a
`source:"brand"` role uses the brand's embedded faces; the validator rejects a weight outside the manifest's range.
Checks: fit, contrast, enlargement, pixel size and the four post checks (emptiness, scale, levels, grid) run unchanged
because the markup comes from the same builders. Static checks in `validateLook` (no Chrome): each required field of
the kind bound exactly once per condition branch; at most three type levels countable; ink/fill pairs from an allowed
table; at most three rotated elements; text rotation ≤ 8° outside shapes; text over a photo needs a filled parent or
a scrim; node and depth limits.
Hooks: `brand.mjs` adds `looks` + `validateLooks(b.looks)` beside `validateLayouts`; `style.direction` must name a
shipped look or one of the brand's looks; `post-spec.mjs`/`spec.mjs` take kinds and variant counts from the look.
Hostile-input tests (`test-design-security.mjs` + a new file): table-driven fuzz over `lookCatalogue()` (string where
number expected, NaN/Infinity, out of range, `red;background:url(x)`, `</style>`, `javascript:`, `__proto__`,
`constructor`, oversized arrays, nesting past the limit → refusal with a clipped message); rendered body of a valid
look matches an allow-list grammar for `style=""` and has no `url(` except checked `data:` images and the grain;
hostile field text through every binding/transform; a brand look containing a `render` key is refused.

## 3. Migration
1. Retail code: remove estimate arithmetic and raw `extra`/`cls` (flow + measured fit); re-approve its sheet once.
2. Record fixtures from that code: seven kinds × sample/stress/minimal copy × three colour sets × hostile text.
3. Write `looks/retail.mjs`. Equivalence: markup hash equal after stripping `data-el` (npm test); geometry within 1 px
   via `postMetrics()` (Chrome suite); pixels against the prototype sheets (owner sign-off, not CI).
Swiss has no code oracle: geometry + pixel levels against the prototype
(`(the swiss prototype, not in the repo)`).
Then delete the code compositions and per-direction `tokens.mjs`.

## 4. Database and API (tenancy-ready)
```
model BrandLook {
  id uuid, brandId String (owner; today always "brand" = BrandProfile.id), slug, name,
  definition Json (the look without compositions), origin ("shipped:<id>" | "own:<slug>" + engineSchema),
  engineSchema Int, status ("draft"|"ready"), gate Json?, position, createdBy/updatedBy, timestamps,
  @@unique([brandId, slug]), @@index([brandId, position]) }
model BrandLookComposition {
  id, lookId → BrandLook (cascade), brandId (denormalised), kind, position, name, definition Json, draft Json?,
  enabled Boolean, gate Json?, timestamps, @@unique([lookId, kind, position]), @@index([brandId]) }
```
- The ACTIVE look is a pointer on the brand's settings (`activeLookRef`), not a boolean per row.
- Look reference format everywhere: `shipped:<id>` or `own:<slug>`.
- Shipped looks are never rows: engine data, global, read-only.
- "Customise"/duplicate = deep copy into the caller's brand with new ids; source may be `shipped:*` or the caller's own.
- `draft` holds unpublished edits; `definition` changes only when the gate passes.
- Every service function takes `{ brandId }` (from the session; today a constant) and every query filters on it; routes
  never accept a brandId from the request; lookups by (brandId, slug) or uuid + brand check.
- Limits per brand: number of looks, compositions per look, definition size (256 KB), gate runs per hour.
- Caches content-addressed: hash(engine version, look, composition, brand palette+fonts hash, copy scenario, size),
  stored under a per-brand prefix. Pack path `state/brands/<brandId>/<hash>`.
- Render queue interface (implemented over the existing lock today): `{ brandId, class: post|preview|gate,
  supersedeKey, deadline }` — posts first, previews next, gate last; a newer preview replaces a queued older one.
- A stored look a newer engine refuses is left out and logged; the brand falls back to the look's origin; panel flags it.

## 5. Panel
Looks gallery (each shipped look as a seven-kind sample sheet in the brand's colours/content; "Use", "Customise") →
Look settings (type pairing, scale, margins/grid, colour logic, devices, photo, logo, dials; live sheet) →
Compositions (per kind: variants, enable, reorder, duplicate from any shipped look, gate badge) →
Composition editor (canvas = the REAL render with selection handles from `data-el` rectangles; layer list + element
library from `lookCatalogue()`; properties from fixed lists; copy scenario sample/stress/minimal; colour set; checks
inline; saving blocked while a check or the stress copy fails) → Publish (gate report).
Guard rails: no blank start; snap to grid by default, px placement behind "Advanced"; angles from the look's named
set; sizes from ladders; colours from roles; live limits (≤3 type levels, 2.6:1 scale, element/rotation budgets);
distinctness hint; stress-copy gate.
Reuse: `LayoutEditor.tsx` shell, `LayoutSketch.tsx` drag/resize/snap maths, `layout-controls.tsx` option/condition/
number/place editors, the `layout-model.ts` "JSON is the state, round-trip tested" pattern as `look-model.ts`.

## 6. AI and post editor
Kinds, fields, budgets and variant names come from `lookBrief(resolvedLook)`; `packages/ai/src/direction.mjs`
reads it; a kind with no enabled composition is not offered; `accepts` rules are exported as hints.
One server function `lookBriefs()` feeds the post page.

## 7. Gate, distinctness, factory
`npm run look:gate <id>`: `validateLook`; security fuzz; every composition × sample/stress/minimal copy × ≥3 brand
colour sets (light-dominant, dark-dominant, low-contrast accent) passes fit, contrast, emptiness, scale, levels,
grid; fixtures recorded; distinctness.
Distinctness: render the seven canonical pieces; per kind a 12×15 occupancy grid with five channels (headline/stat,
body, photo, filled device, empty) from `postMetrics()`;
`d(kind) = 0.5·(1 − mean channel IoU) + 0.2·Jaccard distance of primitive/device sets + 0.15·type distance (class,
weight bucket, width, case) + 0.15·ground and colour-logic distance`, min over variant pairs; look score = mean over
kinds; a shipped look needs ≥ 0.35 against every existing look and no kind below 0.2 (calibrate on the real looks).
Factory: brief → static prototype on fixed content sets + stress copy → owner approval → gap list (new primitives)
→ author `looks/<id>.mjs` → gate → sample sheets + docs row.

## 8. Order of work
1 retail code tidy (S) · 2 `look.mjs` schema/validator/catalogue + hostile tests (M) · 3 `interpret.mjs` + base
elements + runtime auto-size + `data-el` + kit.css consolidation (L) · 4 swiss as data (M) · 5 retail as data +
equivalence, delete code (L) · 6 registry from data, `brand.looks`, hooks, AI brief (S–M) · 7 Prisma tables,
`services/looks.ts`, routes, sync (M) · 8 panel v1 (M) · 9 gate CLI, distinctness, factory docs (M) · 10 panel v2:
composition editor (L) · 11 other sizes, editorial as data, carousels (L).
