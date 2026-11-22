# Qerr design directions — milestone 1 brief (shared by every agent on this work)

## Why
The owner looked at posts made for seven different businesses and said, correctly, that they all look the same:
one design with seven paint jobs. Same typeface (Inter), same seven grid layouts, same "photo on top, flat panel
below" shapes, the same logo + website footer, big empty areas with small text, no brand signature. The goal is
output that looks high-end, expensive and well made, where two organisations do NOT share a look.

Milestone 1 proves the lift with THREE directions built end to end. They must be unmistakably different from each
other in structure (not colour), and each must look like a designer made it.

## The idea: content kinds × directions
A post's design says WHAT it is, not which layout to use:

```json
{ "template": "post", "kind": "figure", "variant": 0, "big": "74%", "unit": "of tasks", "sub": "…", "label": "Numbers" }
```

`kind` is one of: `statement`, `figure`, `list`, `quote`, `photo`, `event`, `offer`. The brand's **direction**
(`brand.json` → `style.direction`: `editorial` | `swiss` | `retail`; absent = today's behaviour, unchanged) decides
the composition. Each direction draws every kind in its OWN way, with 1–2 variants per kind (`variant` picks one;
omitted = chosen deterministically from the post so a batch varies). The same content therefore looks completely
different under each direction — that is the acceptance test.

Fields (all text is untrusted and goes through the existing escaping; lengths enforced in spec validation):
`label` (≤ 28), `headline` (≤ 70, `*phrase*` marks the emphasis), `sub` (≤ 140), `big` (≤ 8) + `unit` (≤ 24),
`items` (2–5 × ≤ 44), `quote` (≤ 160) + `by` (≤ 40), `image` (as today: checked files only) + `focal`/`zoom`,
`meta` (≤ 40, e.g. "12 Dec · 6pm · The roastery"), `tag` (≤ 16, a sticker/badge text such as "New" or "£8").
Required per kind: statement → headline; figure → big; list → headline + items; quote → quote; photo → image +
headline; event → headline + meta; offer → headline + tag.

Canvas for milestone 1: feed 1080×1350 only (other sizes later). Everything below is in feed pixels.

## Rules for all three (the craft bar)
- At most THREE levels of type on a page. Headline : body ≥ 2.6 : 1.
- Display type: leading 0.92–1.05; tracking tightens with size (≥ 100 px: −0.02 to −0.04 em); capitals get +0.06
  to +0.12 em and are used for short labels only (unless the direction says otherwise). Hanging punctuation on
  quotes. Lines balanced (`text-wrap: balance`), no widows, never justified.
- Text that does not fit: the existing fit loop may shrink a headline to no less than 82% of its size; beyond that
  the render is refused with "shorten the headline to about N characters". Never squeeze below that.
- No page may leave more than about 45% of its area as one empty block. Space is used on purpose: one large calm
  area beside one dense area, never small text floating in a void.
- Everything aligns to the direction's margin and column grid. No element sits "near" an edge.
- No logo and no website on single posts by default (the account's avatar already shows it). A direction may show
  a small wordmark or the brand name in type as part of its device. A brand can switch the logo back on
  (`style.logo` keeps its meaning when set to a corner).
- Body text is never grey-on-colour mush: body uses the ink/inverse colour at full or 80% strength.
- Colour and contrast: every pair still passes the existing contrast check. Never weaken a check.
- Photos are art-directed (masked, framed, treated, or type set on them with measured contrast) — never a plain
  rectangle with a flat panel under it.
- All brand values come from the brand (its four colours/roles and style block). No colour or font literal for a
  brand inside a composition; direction defaults live in one tokens table per direction.

## Fonts (shipped with the engine, SIL OFL, latin + latin-ext woff2, each with its OFL text)
- editorial: display **Fraunces** (variable: weight 300–600, optical size; use the soft/low-contrast feel at large
  sizes, with true italics), text **Source Serif 4** (400, 400 italic, 600), labels **Inter** (500).
- swiss: **Hanken Grotesk** (400, 500, 700, 800), meta **JetBrains Mono** (400, 500).
- retail: display **Archivo** at heavy/condensed (variable weight + width if available: 800–900, width 75–100; else
  Archivo Black + Archivo Narrow 700), text **Archivo** (400, 600).
Each direction names its families in its tokens; a brand may override a role with its own uploaded font as today.

## Direction 1 — `editorial` (quiet luxury; a magazine, not an advert)
Feel: paper, ink, restraint. Looks like a well-made print quarterly.
- Margins 96 (left/right/top), 110 bottom. 6-column grid, 24 gutter.
- Colour logic: tonal. Ground = the brand's light ("paper"), ink = dark; ONE deep field colour (primary) used for
  full-field pages; the accent appears only as hairlines, numerals or one italic phrase.
- Type: headlines Fraunces 300–400 at 104–148 px, leading 0.98, tracking −0.02 em; the `*emphasis*` phrase is set
  in ITALIC (not a colour change). Body Source Serif 4, 34/46. Labels Inter 500, 20 px, capitals, +0.14 em.
- Device: a 2 px hairline rule and a folio — a small "No. 07" style marker (built from the post's position/day)
  set top-right or bottom-right — plus small-cap labels. Optional faint wordmark pattern on field pages (the brand
  name repeated in Fraunces at 4–6% opacity).
- Photos: as framed prints (inset with generous paper border and a 1 px keyline, caption strip beneath like a
  gallery label) or in an ARCH mask; slight grain; never full-bleed with a panel.
- Compositions (kind → what is where):
  - statement/0 "Cover line": label top-left, folio top-right, hairline under them; headline anchored bottom-left
    across 5 columns, sub under it in 4 columns. Upper half is calm paper with the wordmark pattern at 4%.
  - statement/1 "Field": whole page in the primary field colour; small label; headline in paper colour set
    centred-left at optical centre (≈ 42% from top); hairline; sub at the bottom margin.
  - figure/0 "Numeral": numeral in Fraunces 300 at 430–520 px, old-style figures, bleeding off the LEFT edge by
    ~6% of its width, baseline at ≈ 52% of page height; unit in italic beside its top right; hairline; sub in a
    3-column block bottom-right; label top-left.
  - list/0 "Index": headline top (92 px), then a ruled table: each row a hairline, a Fraunces italic numeral
    (i., ii., iii. or 1–5) in column 1, the item in Source Serif 600 in columns 2–6; rows fill the remaining height
    evenly (min row 96).
  - quote/0 "Pull quote": an oversized opening quotation mark in the accent (Fraunces, 300 px) hanging outside the
    left margin edge of the text block; quote in Fraunces italic 300 at 64–84 px; hairline; `by` in small caps.
  - photo/0 "Plate": photo as a framed print occupying the top ≈ 62% (inset 96, keyline), caption strip: label in
    small caps left, folio right; headline (72–88 px) below; sub optional.
  - photo/1 "Arch": photo in a tall arch mask (width 5/6 columns → use 4 columns, right-aligned, top at margin),
    headline overlapping the arch's lower-left corner on a paper block with 24 px padding; label vertical along
    the left margin (rotated 90°, small caps).
  - event/0 "Invitation": centred composition allowed here only: hairline, label, headline (Fraunces 300, 96–120),
    hairline, `meta` in small caps with thin dividers, sub; double keyline border inset 48 px around the page.
  - offer/0 "Edition": small circular seal (keyline circle, 190 px, `tag` set on one or two lines in small caps)
    top-right; headline bottom-left; sub; hairline.

## Direction 2 — `swiss` (modern, systematic, confident)
Feel: an international-style poster; a grid you can feel; nothing decorative.
- Margins 64. 12-column grid, 16 gutter; an 8-row rhythm. Square corners everywhere. Flush left, top-left anchor.
- Colour logic: black and white (the brand's dark/light) + ONE accent (primary) used on exactly one element per
  page (a block, a bar, one word, or the numeral). Inverse (dark) pages are a variant, not the default.
- Type: Hanken Grotesk 700–800 headlines at 112–168 px, leading 0.92, tracking −0.035 em, sentence case; body
  Hanken 400/500 at 34/44; meta in JetBrains Mono 500, 20 px, capitals, +0.06 em.
- Device: a META ROW at the top of every page — mono, three cells on the grid: `label` · brand name · folio
  ("07/12") — with a 4 px black rule ABOVE and a 1 px rule below; plus one accent square/bar on the grid.
- Photos: hard rectangular crops snapped to the column grid, greyscale with normal contrast (accent appears as
  the one coloured element next to it), or multiplied with the accent for the "one accent" of that page.
- Compositions:
  - statement/0 "Poster": meta row; headline starts at row 2, spans 11 columns, as large as fits in ≤ 4 lines;
    sub in columns 1–6 at the bottom; accent square (2 columns) bottom-right.
  - statement/1 "Inverse fill": dark page; headline set to FILL the width line by line (each line fitted to the
    full measure, sizes may differ per line, capped 220 px), emphasis line in accent; meta row in light.
  - figure/0 "Number": numeral Hanken 800 at 480–600 px, tracking −0.05 em, flush left, bottom edge bleeding off
    the canvas by ~8%; unit in mono top-right of the numeral; sub in columns 7–12 at the top under the meta row.
  - list/0 "Rows": headline (96) top; then numbered rows "01", "02"… in mono in columns 1–2, item text in columns
    3–12 at 44 px 500, a 1 px rule between rows, the first number in accent.
  - quote/0 "Statement quote": no quotation marks; quote set in 500 at 72–92 px across 10 columns; a 12 px accent
    bar to the left of the block full height of the text; `by` in mono under a 1 px rule.
  - photo/0 "Grid photo": photo in columns 5–12, rows 2–6 (greyscale); headline in columns 1–9 overlapping the
    photo's lower-left on a white block; meta row; accent bar 16 px along the photo's left edge.
  - photo/1 "Bar": full-bleed greyscale photo; a black bar across the bottom 30% holding the meta row and the
    headline in white; accent = one word.
  - event/0 "Date": the date pulled from `meta`'s first token set huge ("12.12" style, mono 500, 260 px) top-left;
    headline (88) under it; remaining meta as a three-row mono table with rules; accent square top-right.
  - offer/0 "Tag": headline (132); a solid accent rectangle (4 columns × 2 rows) bottom-left carrying `tag` in
    white 800 at 88 px; sub to its right.

## Direction 3 — `retail` (bold, loud, physical)
Feel: a confident high-street campaign. Heavy type, colour as a field, pictures breaking out.
- Colour logic: the primary colour is a FIELD and a FRAME, not an accent; the accent is the "sticker" colour;
  ink for type on light. High contrast always.
- Type: Archivo heavy (900, width ≈ 80–90 if variable) for headlines at 120–190 px, leading 0.9, tracking −0.02 em,
  SENTENCE case (not all caps); sub Archivo 600 at 36/44; small text 24.
- Devices: (1) the FRAME — a solid primary border 70 px thick (6.5% of width) on all four sides, with the picture
  or the headline block allowed to break out over ONE side; never text set on the frame itself; (2) the STICKER —
  a circle (220–260 px) or pill in the accent, rotated −8°, carrying `tag`/short words in heavy type, overlapping
  an edge of the photo or frame; (3) the HIGHLIGHT BAR — a solid accent bar behind the `*emphasis*` phrase
  (padding 6/14, slight −1.5° skew allowed).
- Margins: frame 70 + inner padding 44 (frame pages); 56 on full-field pages.
- Photos: full colour, punchy; inside the frame, or cut by an angled seam; sticker overlaps.
- Compositions:
  - statement/0 "Stack": full primary field; headline stacked edge to edge, each line fitted to the width
    (cap 230 px), in the light colour, emphasis line with the highlight bar; small brand name bottom-left.
  - statement/1 "Mantra": the headline's first line repeated down the page 5–7 times in outline/low-contrast,
    one instance solid with the highlight bar; sub bottom-left on a light band.
  - figure/0 "Price tag": numeral 420–520 px heavy in the light colour on the primary field, slightly rotated −3°;
    unit on a highlight bar; sub on a light band across the bottom (140 px high).
  - list/0 "Blocks": headline (120) top; items as rows each with a filled accent square (88 px) holding "1", "2"…
    in heavy type, item text 46 px 600; alternating light/tinted row bands.
  - quote/0 "Shout": quote in heavy type 84–110 px on a light page inside the FRAME; giant accent quotation mark
    breaking out over the frame's top-left corner; `by` on a highlight bar.
  - photo/0 "Frame pop": the FRAME; photo fills the inside; headline on a light block that overlaps and breaks out
    over the frame's bottom edge (block 86% wide, left-aligned, −2° rotation allowed); sticker top-right if `tag`.
  - photo/1 "Seam": page cut by a seam at −7°: photo above, primary field below with the headline in light; the
    sticker sits on the seam.
  - event/0 "Poster band": photo or primary field full-bleed; a light band across the lower third rotated −4°
    (overscan so no gaps) carrying headline + `meta` in heavy/600; sticker with the date.
  - offer/0 "Sticker": light page inside the FRAME; headline (150) top-left; photo (if any) bottom-right as a
    rotated card (+4°, 8 px light border); big sticker with `tag`; sub bottom-left.

## Acceptance (what the lead will look at)
A contact sheet: the SAME seven pieces of content (one per kind) rendered in all three directions with the SAME
brand colours and photo. Across a row the three must share no composition shape; down a column the direction must
be recognisable at a glance. Every page passes the existing checks (fit, contrast, pixel size) and the new ones.
