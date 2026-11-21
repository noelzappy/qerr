# Making the post images

The design engine turns a post's texts and pictures into finished post images. It drives headless Google Chrome, so what
you get is what Chrome draws, at the exact pixel size, checked before it is saved.

Everything here is taken from the code in `packages/engine/lib/design/` and `packages/engine/design/templates/`. Five poster templates (`object`, `number`, `product`, `myth-fact`, `closing`, see "The poster look"), seven earlier editorial templates (`cover`, `text`, `ledger`, `passbook`, `stats`, `screen`, `photo-story`), `carousel`, full-bleed `photo` posts and `page-cover` make up the engine. Where something has not been proved, it
says so (see "What is weak or unverified" at the end).

## The short version

Each post can carry a `design` block: the template, the words and the picture. The AI writes one for every post it
drafts, a batch file can carry them (see "Design blocks in a batch" below and [batch-format.md](batch-format.md)), and
people change them in review. Whenever a post's design is imported or changes, the web app's `render-post` job renders it
with the engine (`renderDesignBlock` in `packages/engine/lib/design-render.mjs`) and keeps the images in private storage;
review shows them with every warning, and "Re-render" makes them anew.

```json
{
  "template": "photo",
  "image": "design/assets/demo/scene-market.jpg",
  "headline": "Save together,\n*see every step.*",
  "sub": "Group savings, goals and records in one place."
}
```

## Untrusted text

Everything in a `design` block, whether it came from a batch file, the AI or the review page, is **data, never
markup**. This matters because the texts may be written by a program from web research. What the engine does about it:

- **One escape helper.** All text and attribute values go through `esc()` / `fmt()` in `packages/engine/design/templates/common.mjs`.
  `fmt()` escapes first and only then adds `<br>` (for `\n`) and `<span class="gold">` (for `*accent*`), so those are the
  only tags text can ever produce.
- **Strict validation at the spec boundary** (`validateDesign`, run on import, on every edit, by batch validation and
  before every render): `template`,
  `sizes`, `series` (a key of the brand file), `ground`, `accent`, `tick`, `layout`, `device`, `size`, `kind`, `scrim` and `textAt` must be one of a fixed list; ledger and register cells, columns, notes and the window `title` are short one-line texts with their own limits; `zoom`, `region`, `days`, `ticked`, `today` are numbers in range; `framed`, `tilt`, `dots`, `glow`, `fade` and `map` true or false; `caption` and `silk` are refused; `pills` and `checks` lists of up to 4 short one-line texts; `focal` must match `N% N%`, a keyword or
  numbers in range; `scrimPeak` a finite number 0 to 0.65; `name` lowercase letters, digits and `. _ -`; every field of a thin-line shape a finite number in range (`x`, `y` -1 to 2; `r` up to 3; angles up to
  720; `l` up to 1; `dx`, `dy` 1 or -1; `o` 0 to 1; `w` up to 20) with `c` only `"gold"` or `"white"`; text fields must be
  text, at most 220 characters. Anything else is rejected with the field named. CSS values are never passed through: the
  focal point is rebuilt from numbers, and the drawing code coerces shape values again and drops a shape that is not
  finite.
- **Pictures are files, not addresses.** An `image` must have an allowed extension (`.jpg .jpeg .png .webp .gif`), exist
  as a regular file of at most 30 MB, and its first bytes must really be that kind of image (a renamed script or text file
  is refused; so are `javascript:`, `http:` and `file:` strings). It is read by the engine and embedded as a `data:` URI;
  the page never receives a path. The web app accepts only files under `design/assets/` or a vault photo (`vaultItemId`).
- **The page is locked down.** It carries a Content-Security-Policy (`default-src 'none'`; images and fonts from `data:` only;
  one inline script, allowed by a per-page nonce, which contains no spec data). Chrome runs without file-access flags, the
  page is loaded from a string (no file is opened), every request except `data:` is blocked through the DevTools protocol
  (and logged as a warning if a template ever tries one), and DNS is switched off. The fonts, logos and brand CSS are embedded
  too.
- **The brand file is checked as well**: colours must be `#rrggbb`, every shadow layer finite numbers in range with an alpha from 0 to 1 (the phone's drop shadow has no spread), radii, the scale and the window chrome numbers in range, the font families plain letters, weights numbers, unicode-ranges well formed, series ground and accent from the fixed lists, and asset paths must stay inside the repository. The CSS (shadows, radii, window chrome) is built from the checked numbers.
- **Never add a template that interpolates a raw value.** Use `esc()`/`fmt()` for text, `ctx.image()` for pictures, and
  numbers or table values for sizes. `packages/engine/test-design-security.mjs` feeds hostile values to every template and fails if any
  shows up as markup.

## Requirements and how images are made

- **Google Chrome.** Found at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on macOS (and the usual
  `/usr/bin` names on Linux). Set `CHROME_PATH` to use another build; the container image sets it to its Chromium
  wrapper (see [deploy/README.md](../deploy/README.md)). Without Chrome the render fails with a message that says how to
  fix it.
- **One Chrome at a time.** The render job renders one post at a time, and a lock file (`out/design.lock`) stops a second
  render from starting another Chrome while one runs. A post uses one Chrome for all its images.
- **How Chrome is driven.** Through the DevTools protocol over a pipe, using only Node's standard library. The page is
  built as a self-contained string, laid out at the exact size (no browser window is involved), measured by a small script
  inside the page, and screenshotted. It needs no file or network access (see "Untrusted text").
- **PNG to JPG.** The page is captured as PNG. A `.jpg` output is converted with `sips` (macOS) if it is there, else
  `ffmpeg` if it is there, else Chrome itself is asked for a JPEG. The last line of every run says which was used.
  Output is quality 92. Use a `.png` file name to keep the lossless PNG.
- **Nothing is sent anywhere.** Rendering needs no key and no network. The render job draws into a temporary folder
  under `out/` (ignored by git), stores the images in private storage under `renders/`, and removes the folder.

## Sizes

| Name | Pixels | Use |
| --- | --- | --- |
| `feed` (default) | 1080 x 1350 | Instagram, Facebook and LinkedIn feed (4:5). **The only size of the editorial templates and carousels.** |
| `wide` | 1200 x 675 | LinkedIn and Facebook link-style images (16:9). `photo` only |
| `story` | 1080 x 1920 | Stories and reels covers. `photo` only. The top 270 px and bottom 350 px are kept clear of the app's own buttons |
| `square` | 1080 x 1080 | Square feed posts. `photo` only |

Ask for more than one with `"sizes": ["feed", "wide", "story"]` (photo posts). Giving an editorial template or a carousel another size is
refused with: "... is made for the feed format (1080x1350) only".

## The look: type, depth and tokens

Every value of the look comes from the brand pack's `brand.json` (see "The brand file" below); the templates and
`packages/engine/design/brand.css` use only the variables made from it. The values quoted here are the demo brand's
(`brands/demo`, Acme Savings) unless they are fixed by the templates. Every editorial page (everything except the poster
templates, `photo` and `page-cover`) follows one system:

- **Type.** Headlines are a two-tone heading (`font.headlineWeight`, `font.leading`, `font.tracking`; the demo: Inter 400,
  line height 1.2, tracking -0.02 em), at 70, 84 or 112 px with balanced lines: a statement in ink (`text.ink`), then its
  continuation in the muted grey (`text.muted`) in the same paragraph (on ink: white, then `text.mutedInv`). In a spec the
  continuation is the `*phrase*`: write `"Save together. *Every deposit recorded the day it is made.*"`. That is
  `accent: "muted"`, the default of every demo series; `accent: "colour"` (the primary colour, gold on ink) and
  `accent: "weight"` (`font.accentWeight`, the demo's Inter 300) remain for a page that asks for them. The big figure of
  `stats` uses the accent weight. Body is the sans at 400 (32 px on 42 px lines), labels the mono at 500 (22 px, upper case,
  wide tracking; mixed case for the brand name and web addresses). The font files are named in `font.files` (the engine ships
  Inter and IBM Plex Mono in `packages/engine/design/fonts/`, SIL OFL, `OFL.txt`) and embedded as `data:` URIs with their
  unicode ranges.
- **Frame.** 70 px margins. A running head (series label on the left, "02 / 07" or the brand name on the right, a hairline
  rule), the full colour logo bottom-left and a mono label bottom-right ("Swipe ->" on page 1 of a carousel, otherwise the
  website).
- **Grounds.** A fixed list of names (`white`, `tint`, `mint`, `gold-pale`, `ink`, `deep`), each a colour in `grounds`; the
  editorial pages use `white`, `tint` and `ink` (the closing and emphasis page). A page picks one with `ground`, or gets its
  series' ground. An ink page carries a dot grid (`dots` in `brand.json`: the demo draws 1 px white dots at 8% on a 24 px
  grid, at the brand scale); `dots: false` removes it. Text colours are `text.ink`, `text.body` and `text.muted` (labels).
  The accents `accents.gold` and `accents.primary` are accents only. A gold that is too light for text on a light ground is
  only a mark there (ticks, underlines); gold text appears on the ink page and on photo posts. `accents.goldDeep` is the
  token to use if gold-coloured text is ever needed on a light ground. The contrast check (below) measures every case.
- **Depth.** Depth comes from a product style, not from paper: below the text, a **panel** (`surfaces.panel`, with a
  hairline top edge) fills the lower part of the page; drawn artefacts (ledger, passbook page, register card, the fact card)
  are **white cards** (`surfaces.card`) on it with the card shadow (`shadows.card`; the demo: `0 13px 27px -5px` and
  `0 8px 16px -8px` in ink at 18% and 22%), a 1 px line (`surfaces.line`) and the card radius (`radius.card`, the demo 8 px).
  Nothing is rotated, textured or lit like paper. The myth card is flat (line, no shadow) so the fact card stands above it.
  Photos: scenes with people are full-bleed panels; an inset photo has the card radius and a line; a news photo is a raised
  card on the panel.
- **Scale.** The tokens are in the brand's website pixels. A post is drawn at `scale` post pixels per website pixel (the
  demo: 2), so an 8 px card radius is 16 px and the card shadow twice its size on a 1080 px image (which a phone shows at
  about 400 CSS px). Screens scale their chrome to their own width instead (below).
- **Screens.** A phone is a **pre-framed capture**: a transparent PNG or WebP with a realistic phone (band, bezel, camera,
  status bar) already drawn around the screen by whatever capture tool you use. The tool shows it as it is with the phone
  drop shadow (`shadows.phone`, scaled by the phone's width over `phone.refWidth`). It never draws a phone: a phone image
  that is not transparent around the phone is refused. A desktop screenshot is shown in a window frame: a white window
  (`radius.device`), the layered device shadow (`shadows.window`), a 1 px ring in the line colour, a tint title bar with
  three dots and an optional title pill (the `window` sizes), all scaled by the window's width over `window.refWidth`.
- **Touches.** **The phone glow**: a phone floats on a soft blurred glow of the brand's gradient (`gradient`, `glow`: the
  demo puts a blur 40 px larger than the phone behind it at 60%), set right of the phone so its blur stays off the text
  column; `glow: false` removes it. **The fade**: `fade: true` on a phone puts the text across the top and the phone,
  620 px wide, centred under it, cut above the footer and faded out over its last `phone.fade` website px. **Pills and
  checks**: `pills` (up to 4, 28 characters) are outlined chips in the primary colour and `checks` (up to 4, 48 characters)
  a check list (a circle in the primary colour at 10% with a check), both under the sub line of a phone screen. **The dot
  map**: `map: true` on `closing` draws the brand pack's `map.json` as a still frame of dots, with the regions it lists in
  `lit` in gold, as SVG circles; the headline moves down under it. The demo's map is an invented island in three regions.
  A brand without `map.json` cannot use `map: true` (the render fails with "this brand has no map").
- **Tokens** (all in `brand.json`, none in the templates or CSS): `grounds`, `text` (ink, body, muted, mutedInv, invBody,
  hair), `gradient` (five stops: sage, teal, mint, gold, amber; the names are slots, the colours are the brand's), `glow`
  (opacity, blur, inset), `dots` (size, spacing, alpha), `poster` (the poster type, slabs, texture; see "The poster look"),
  `accents` (gold, goldDeep, primary), `surfaces` (panel, card, line), `scale`, `radius` (card, device, button), `shadows`
  (`card`, `window`, `phone`; each a list of `{ x, y, blur, spread, color, alpha }` layers in website pixels), `window` (the
  frame sizes: the demo's `refWidth` 560, `bar` 32, `dot` 8, `dotGap` 6, `padX` 12, `titleGap` 12, `titleSize` 10, the title
  padding and the `tilt`), `phone` (`refWidth`, `fade`) and `series` (below). The ground, gradient and accent names are
  fixed slots; give them your own colours.
- **Series.** `series` in `brand.json` maps a key to `{ name, ground, accent }`. The demo's keys are `explainers`
  ("Savings sense"), `myth-vs-fact`, `the-numbers`, `on-record`, `news` and `community`, all with `accent: "muted"`. A page
  picks one with `"series": "explainers"` (the key is checked against the brand file) or gives its own `"label"` text;
  `ground` and `accent` can be overridden per page. In a carousel the series goes on the carousel.

Fields every editorial template accepts: `series`, `label` (up to 40 characters), `ground`, `accent`, `dots`, `headRight` (the
right-hand running-head text of a single post; default the brand's name), and `name`, `sizes` (feed). `text`, `ledger` and
`passbook` also take `size` (headline size 70, 84 or 112).

## The poster look

The poster templates (`object`, `number`, `product`, `myth-fact`, `closing`) make bolder posts: one strong real visual per
post, a big confident headline with one phrase in the brand colour, a pale single-colour ground, colour-blocked myth and fact
cards, and only a small logo and the website. Rules:

- **One real image per post.** A styled object photograph (`object`, `number`), a framed phone capture (`product`) or
  nothing but type on the dark ground (`myth-fact`, `closing`). Nothing is drawn to pretend to be an object: no drawn
  ledgers, passbook grids, receipts or cards. If a post cannot get a real image that looks right, say which image is missing
  rather than drawing one.
- **No captions, no silk.** `caption` and `silk` are refused on every template with a message that says why.
- **Chrome.** The small logo at the top left (the full colour logo on a light ground, the mark with a white wordmark on a
  dark one) and the website at the top right ("Swipe →" on page 1 of a carousel). `myth-fact` adds the series mark at the
  bottom right. Nothing else.
- **Type.** The sans only (`poster` in `brand.json`; the demo: headlines at 600, tracking -0.035 em, line height 1.06), at
  76, 88, 104 or 120 px (`size`; the fit loop shrinks them if it must), balanced. Two-tone: the statement in ink, the
  `*continuation*` in the primary colour; gold on a dark ground; on a page that took a photo's colour, the myth slab colour
  (`poster.slabs.myth`; white type and gold on a dark one), picked for contrast. Sub lines 34/46 px in ink. Big figures
  (`number`) 168 px, left-aligned at the top with the line under it and the supporting figures in columns, then the photo
  from y 616 to the bottom edge.
- **Grounds** (`grounds` in `brand.json`, a fixed list): the pale `mint`, `gold-pale`, `tint` and `white`, and the dark
  `ink` and `deep`, which carry a very fine diagonal line texture (`poster.texture`; the demo: 1 px white lines at 4.5%
  every 9 px, 135 degrees). One ground per post. `object` and `number` also take `ground: "photo"`.
- **Object photos** (`object`, `number`): the photo fills the page from `photoTop` (default 600; 616 under a big figure) to
  the bottom edge and bleeds off it, cropped with `focal` and `zoom`. No gradient, fade or blend is ever drawn over a photo.
  The page looks at the photo's own background (the top edge and the left and right edges near the top, as shown;
  `lib/design/edge.mjs`) and chooses one of two layouts, whatever the ground says:
  - **a plain background** (a studio shot; mean delta-E from the edge's mean at most 3.5, the edge drifting at most 8 along
    its width, the sides within 8 of the top): the page takes the photo's edge colour, so the photo runs into it unseen.
    When the light drifts along the edge the page follows it column by column (twelve exact colours), because one flat
    colour would show a band; when it does not drift the page is one flat colour. A named ground is overridden, a dark
    texture is dropped, and the type turns white or ink, whichever has the better contrast on the page. This is what
    `ground: "photo"` means. The demo's `object-jar.jpg` is drawn to be this kind.
  - **a scene** (people, a street, a market, hard shadows): the photo is a full-bleed band, like the photo on `stats`: edge
    to edge (left 0, full width), no radius, no shadow, no side margins, from `photoTop` to the bottom edge of the page, on
    the ground: the spec's, else the series', else mint. A scene photo is never centred or inset. The demo's
    `scene-market.jpg` is drawn to be this kind.
  The tool notes which it chose and why. Contrast is measured on the real pixels as everywhere.
- **`product`**: a pre-framed phone capture (as for `screen`, refused if it is not transparent around the phone), 600 px
  wide and centred under the headline from `phoneTop` (default 620), running off the bottom of the page, or with
  `layout: "side"` 450 px wide on the right with the text (76 px) on the left. The soft glow sits behind it (`glow: false`
  removes it).
- **`myth-fact`**: on the dark ground (default `ink`), the myth on a solid dark slab (`poster.slabs.myth`, white text) and
  the fact on a pale slab (`poster.slabs.fact`, ink text with the continuation in the primary colour), with rounded corners
  (`poster.slabRadius`), each with a small "Myth" / "Fact" tag; the series name (the demo: "Myths vs facts") at the bottom
  right.
- **`closing`**: the dark `deep` ground with its texture, the brand's tagline at 136 px (the continuation in gold) and the
  website under it. `map: true` adds the brand's dot map (see "Touches").

Poster fields: `headline`, `sub`, `image`, `ground`, `size`, `align` (`left` or `center`), `photoTop` / `phoneTop` (300 to 960),
`focal`, `zoom`, `layout` and `glow` (product), `big`, `line`, `stats` (number), `myth`, `factLead`, `fact` (myth-fact), `series`
and `label` (the myth-fact mark). Unknown combinations are refused with the field named.

## Templates

The sections below describe the earlier editorial templates; the poster templates are above.

Text rules that apply everywhere: a newline (`\n` in JSON) is a line break; `*words in
asterisks*` are the headline's continuation (muted grey on the editorial pages, muted light grey on ink, gold on `photo` posts);
everything is escaped, so no markup can be injected. Write the brand's names as its pack's `spelling` rules say (the demo: `Acme Savings`), in sentence
case, with no emoji (see "Brand text rules"). Every text field is at most 220 characters; short fields have their own limit. Write a
headline as one statement sentence, then its continuation in asterisks (`"Pay out the pot. *Approval comes first.*"`).

### `cover`: the photo-led opening page

A photo inside the margins (the card radius and a 1 px line), the headline (84 px) under it, then the sub line. Fields: `headline` (required), `sub`, `image` (required), `focal` (`"71% 100%"`, `center`, `{ "x": 0.7, "y": 1 }`) and `zoom`
(1 to 3, around the focal point). The engine warns when the picture is enlarged more than 1.3x.

### `text`: a headline, with or without an artefact

With no `artefact` it is the typographic pause page: a big 112 px headline, the sub line at the bottom on an empty panel band.
With `artefact` it sits on the panel below the headline, as a white card. Fields: `headline` (required), `sub`, `size`, and `artefact`: an object
with a `type` of `ledger`, `passbook` or `register` and the fields of that artefact (below).

### `ledger`: a ruled card on the panel

A white card with ruled mono rows. Fields: `headline` (required), `sub`, `columns` (2 to 5 of
`{ "label": "Day", "align": "start" | "end" }`, labels up to 16 characters), `rows` (1 to 10 rows, each a list of texts, one per
column, each cell at most 16 characters, `""` leaves a cell blank), `mark` (a list of `{ "row": 3, "col": 2 }`, zero-based, each
underlined in gold), `notes` (up to 2 short mono lines under the card, 60 characters). Row height shrinks with more rows; if the
longest cells cannot fit the card the spec is refused. `rotate` is refused: cards are never rotated.

### `passbook`: a passbook page

A ruled page of days (7 across) on a white card on the panel. Fields: `headline` (required), `sub`, `days` (28 to 31, default 31; blank cells
after the last day are hatched), `ticked` (0 to days: days 1 to `ticked` get a tick), `today` (1 to days: a heavy box), `tick`
(`ink` or `gold`) and `register`. With a `register` card beside it the page is the small one; without, it is the big
grid (headline 112 px when there is no sub line).

`register` (also the artefact `type: "register"` of `text`): `{ "title": "Where this record exists", "rows": [["Member's passbook",
"1"], ["Office copy", "-"]], "mark": 0 }`: a white card, up to 6 rows of `[label, value]` (label 17, value 8 characters, title 26),
`mark` underlines one row's value in gold.

### `myth-fact`: see "The poster look"

Colour-blocked slabs on the dark ground. Fields: `myth` (required), `factLead` (required, may use `*accent*`), `fact`.

### `stats`: one big figure

`big` (required, 168 px, may contain `*accent*`, for example `"*€* 2.4M+"`), `line`, `stats` (up to 3 of `"number|label"`),
`image` (optional, `focal`, `zoom`): a full-bleed photo panel across the bottom.
With the series' muted accent, `"*€* 2.4M+"` sets the currency in grey and the figure in ink. Without an image the supporting figures stack as
ruled rows.

### `screen`: a real product screen

`headline` (required), `sub`, `image` (required), `device` (`phone`, the default, or `desktop`). A
phone also takes `glow` (default on), `fade`, `pills` and `checks` (see "Touches").

- **`device: "phone"`**: `image` must be a **pre-framed phone capture**, a transparent PNG or WebP with the phone already drawn
  around the screen (for example a 660 x 1354 `<name>-phone-660.webp`; record where it came from in
  `packages/engine/design/assets/screens/SOURCES.md`). It is shown as it is, 470 px wide (0.71x of a 660 px capture), with the phone drop
  shadow; the text is on the left and the whole phone on the right, both centred on the page. A plain screenshot is **refused**
  with "use a pre-framed phone capture": the header must say the file has transparency, and in the page its four corners must be
  see-through. `framed: false` is refused at validation. With `beside` (`{ "days": 31, "ticked": 17 }`) a passbook card lies on
  the panel next to the phone, which then runs off the bottom of the page.
- **`device: "desktop"`**: a desktop screenshot in the window frame (see "Screens" above), 940 px wide, on the panel under
  the headline and sub line. `title` (up to 40
  characters) adds the title pill, `tilt: true` a slight 3D lean (`window.tilt`), `region` (0.4 to 1) a zoom: only the top-left
  share of the capture's width and height shows, drawn larger, so a wide capture stays readable (0.75 shows 1230 x 769 of a
  1640 x 1025 capture). `framed: true` means the capture brings its own chrome: it is shown in the window shape without a bar.

`statusFill` (from the old CSS phone) is refused. Never enlarge a screen past 1.3x: the enlargement check warns, and the 660 px
phone captures fit up to about 860 px wide.

### `photo-story`: a photograph and its story

`image` (required), `headline` (required), `sub`, `label`, `layout`. `"panel"` (default): the photo full-bleed at the
top, then a label, the headline and the sub line. `"print"`: headline and sub line on top, the photo as a raised card (card radius
and shadow) on the panel.

### `closing`: see "The poster look"

The closing page is a poster page now (the dark textured ground, the tagline large).

### `carousel`: pages with a PDF

`{ "template": "carousel", "series": "explainers", "pages": [ ... ] }`: 2 to 10 `pages`, each any of `cover`, `text`, `ledger`,
`passbook`, `myth-fact`, `stats`, `screen`, `photo-story`, `closing` (a page may override the carousel's `series` or `label`).
Each page gets the series label and the folio ("01 / 07") in its running head; page 1 says "Swipe ->" in the footer, the others the
website. File names: `<name>-1.jpg`, `<name>-2.jpg` ... and **`<name>.pdf`**, a PDF of the pages for LinkedIn documents, one page per
image, each exactly 1080 x 1350 CSS px (810 x 1012.5 pt), no margins, written only when every page was made. Chrome snaps a printed
page to a grid of about one point (1013.04 pt for this size), so the engine corrects the page box to the true 1012.5 pt without
changing any byte offset; if it cannot, it warns with the size it got. The web app keeps the page images; it does not keep the PDF
yet.

### `photo`: a full-bleed photograph with text

What it makes: your photograph fills the whole image. Behind the text only, a neutral black gradient eases from a
solid strength down to nothing, so the picture is untouched everywhere else. On top: an optional mono eyebrow, a white Inter
headline (words in asterisks turn brand gold), a white sub line, the brand's logo pill at the bottom left and its website in mono
at the bottom right. Optional thin white and gold arcs and a corner bracket add a little brand motion. Works at every size.

| Field | Meaning |
| --- | --- |
| `image` | The photo (jpg, png, webp, gif). Required. A file under `design/assets/`, or a vault photo named with `vaultItemId`. |
| `headline`, `sub`, `eyebrow` | Texts. Headline required. |
| `focal` | Which part of the photo stays in frame when it is cropped: `"60% 40%"`, `center`, `left top`, or `{ "x": 0.6, "y": 0.4 }`. It can be per size: `{ "feed": "60% 40%", "wide": "50% 100%" }`. Default centre. |
| `textAt` | `top` (default) or `bottom`: where the text and scrim sit. Per size allowed. |
| `scrim` | `black` (default) or `none`. |
| `scrimPeak` | Starting strength of the black scrim, 0 to 0.65 (default 0.5). The engine raises it by 0.05 steps up to 0.65 if the text needs it. |
| `"lines": false` | No arcs or brackets. |
| `lines` | Default `"auto"`. Or a list of up to 12 shapes (numbers only, in the ranges above): `{ "t": "arc", "x": 0.62, "y": 0.8, "r": 0.5, "a0": 200, "a1": 300, "c": "gold" }` and `{ "t": "br", "x": 0.92, "y": 0.06, "l": 0.07, "dx": -1, "dy": 1 }`. Per size allowed. |

Automatic lines: when no shapes are given, the engine measures where the text really is and tries a few arc positions
(chosen by a stable hash of the headline) on the side away from the text. It rejects any position whose arc would cross the text or
the footer. If nothing fits it draws none and says so.

### `page-cover`: profile picture and cover images

`{ "template": "pagecover", "kind": "profile" | "facebook" | "linkedin" | "x" }` makes the fixed brand images for the social pages
(1080x1080 profile, 1640x624 Facebook cover, 2256x382 LinkedIn cover, 1500x500 X header) on the white ground in the brand type,
from the brand file's tagline, description and website. They are not post images, so a batch or a post refuses the template; the
web app has no page that makes them yet.

### What was removed

The old green look is gone: the `card` template, the old `stats` and `screen` looks, the carousel slide kinds `title`, `step` and
`end` (and `slides`, now `pages`), the decorative circles, the pills and chips and Inter Variable. Later the warm paper look
went too: the `paper` and `stone` grounds, the table and its grain, rotated sheets (`rotate`), the flat-print and paper shadows, the
CSS phone body (`statusFill`) and the `onTable` and `bodyStrong` text colours. `photo` and `page-cover` stay, restyled.

## Your own photos and screenshots

- **In the vault.** Upload photos and screens to the vault in the app, with their source, their licence, whether
  identifiable people appear and whether their consent is recorded. A design names one with `vaultItemId` (the AI does
  this for the pictures it picks); the render copies the file from the private bucket for that render only. A photo whose
  rights are still to be confirmed, or with people and no recorded consent, blocks approval of the post.
- **Files in the repository.** A picture written as `design/...` (for example `design/assets/photos/market.jpg`) is
  looked up under the repository root first, then in `packages/engine/design/`, where the fonts and the asset folders are.
  The web app accepts no other path. `packages/engine/design/assets/photos/` and `assets/screens/` are ignored by git
  except their `README.md`, `CREDITS.md` and `SOURCES.md`, and they are left out of the container image, so on a
  deployment use the vault.
- **Screenshots** can show real names and amounts: use test or demo data (an invented organisation, fake phone numbers),
  or blur anything real first.
- **The demo pictures** are in `packages/engine/design/assets/demo/`: `object-jar.jpg`, `scene-market.jpg` and `screen-desk.png`,
  synthetic drawings made by `brands/demo/make-assets.mjs` (no photograph, no real person, place or amount). They are committed
  so the example batches render on a fresh install; use them as `design/assets/demo/<file>`.
- **Size.** Give photos at least 1500 px on the long side. The engine measures how much each image is enlarged and warns
  above 1.3x, naming the file, its size and the width it needs. Phones and windows are checked the same way (a 660 px wide
  phone capture shown 470 px wide is fine).

### The photo rules

1. **The licence must allow commercial use** (a brand post is commercial). Free stock sites with a licence that allows
   it are fine; "free for personal use" is not.
2. **Record where every photo came from**: for a vault photo, its source and licence in the vault; for a file in the
   repository, a line in `packages/engine/design/assets/photos/CREDITS.md` (file, source page, author, licence, what is in
   it). That file is committed (it lists licences and holds no pictures); the photos themselves are not.
3. **Avoid tight portraits of identifiable people.** Crowds, hands, backs and wide market scenes are safer than faces.
4. **Never imply that the people pictured are customers.** Do not write "our members" or a testimonial over a stock
   photograph of strangers, and do not use a photo of a real person next to a quote or a number that is not theirs.
5. **Check what else is in the frame**: brand names, readable signs, children. Crop with `focal` or choose another.
6. A photo from another country than the brand's market can still be used as a mood image; do not caption it as local.
7. **No other currency.** When the brand pack sets `money`, do not use a picture that shows another currency's notes, coins
   or signs; the AI library refuses vault pictures described with one (see [ai.md](ai.md)).

## Design blocks in a batch

A batch carries one `design` block per post (see [batch-format.md](batch-format.md)):

```json
{
  "id": "01-tagline",
  "date": "2026-12-01",
  "caption": "Save together, see every step. ...",
  "design": {
    "template": "photo",
    "image": "design/assets/demo/scene-market.jpg",
    "headline": "Save together,\n*see every step.*",
    "sub": "Group savings, goals and records in one place.",
    "focal": "60% 50%",
    "textAt": "top",
    "sizes": ["feed", "wide"],
    "networkSizes": { "linkedin": "wide", "facebook": "wide" }
  }
}
```

Each image is named from the post id and the size (`01-tagline-feed.jpg`, `01-tagline-wide.jpg`; a carousel
`04-passbooks-1.jpg`...). Use `"name": "05-field-agents"` in the block to choose the stem. What the post sends:

- Each network gets the images of its size: `networkSizes` names one per network, the others get the first size (a
  carousel's pages in order).
- Files a person uploaded to the post by hand follow the rendered ones. A render replaces only the images an earlier
  render made; uploaded files are never changed or dropped.
- Changing the design drops the images the last render made and queues a new render. A failed render saves nothing,
  and the post shows why it failed; it cannot be approved until its images are ready.

Rendering again makes the same file names, so edit the words and render again. The `design` block is not part of the
duplicate-protection hash (the image file names are), but it is validated with the rest of the post.

## What the engine checks, by itself

Every image goes through these before it is saved. A failure fails the render and nothing is saved; warnings are kept on
the post and the image is kept.

| Check | How | What happens |
| --- | --- | --- |
| **Text fits** | Chrome measures the real text lines: inside the margins and above the footer, no text on text, no text on a photo, screenshot or on an object it does not belong to (text inside its own card is fine), body text at least 30 px, text not straddling the panel's edge, single-line numbers not wider than their box. Drawn objects must stay inside the page (a phone may run off the bottom), above the footer, clear of the logo, on the panel, and not overlap each other | The headline (and big numbers) shrink in steps down to 62% of the brand size. A long headline (more than 24 characters) starts a little smaller. If it still does not fit, or the sub line does not fit, the image **fails** with: "The text does not fit the feed format: ... Shorten the text ..." and nothing is written. Shrinking below 70% adds a warning. |
| **Contrast** | The page is rendered with all text hidden; the pixels behind each text line are read. The worst case counts: the brightest part for light text (95th percentile, so a single speck does not decide), the darkest for dark text. Needs, on photo posts: headline and big numbers 3:1, sub line and eyebrow 4.5:1, website 3:1. On every other page (`brand.json` `contrast`): headline, big numbers, sub and body 7:1, labels, the footer label and the accent phrase 4.5:1, an artefact's labels 4.5:1 and the words written on it 7:1. Text inside artefacts (SVG text) is measured the same way | On photo posts the black scrim is raised in 0.05 steps (cap 0.65) before anything else; a weak website line gets a soft black fade behind the footer (cap 0.5). Anything still below the target is a warning with the measured ratio. `"scrim": "none"` switches the automatic fix off (it still warns). |
| **Enlargement** | The shown size of every supplied image against its real pixel size | Above 1.3x: a warning naming the file, its size and the width it would need. |
| **Pixel size** | The captured image and the saved file are read back | A mismatch fails the image. |
| **Fonts and images load** | Inter and IBM Plex Mono must load; every image must decode | A missing or unreadable image fails with its path. A missing font warns. |
| **Framed phones** | A `screen` phone's file header must have transparency, and in the page its four corners must be see-through | Fails with "... is not a pre-framed phone capture ... Use a pre-framed phone capture"; nothing is written. |
| **Brand text** | The brand lint, run before every render | Warnings only, see below. |

The measured contrast uses the picture without the text's soft shadow, so it is a little stricter than what a viewer sees.

### Brand text rules

Warnings, never blockers (they come from the brand pack's `brand.json`, so you can add rules there):

- Spelling: each rule in `spelling` is `{ "wrong": "<pattern>", "flags": "", "right": "<correct form>" }`. The demo flags
  `Acme savings`, `Acmesavings`, `Acme-savings` and `ACME SAVINGS`, which should be `Acme Savings`. Write the pattern so it
  does not catch the website address, which is often lower case on purpose (the demo's `acmesavings.example` is not flagged).
- No emoji in image text.
- Headline length guidance per size: the statement (the words outside the `*continuation*`) up to 60 characters on `feed` and
  `story`, 50 on `square`, 48 on `wide`, and the whole headline up to the sub line's guidance (110 / 90); sub line 110 / 90. Pills and
  check list items are linted for spelling and emoji too.

## The brand file

The brand file is `brand.json` in the brand pack that `BRAND_DIR` names (default `brands/demo/brand.json`; see "Brand
packs" in the README). It holds the name, website, tagline, descriptor, grounds, text colours, accents, surfaces, scale,
radii, shadows, window chrome, phone slot, series, fonts, logo paths, spelling rules, length guidance, the contrast targets
of the editorial pages and the photo thresholds (scrim start and cap, footer fade cap, minimum contrasts, enlargement
limit). The tokens become CSS variables; `packages/engine/design/brand.css` and the templates use the variables, not
literals. Every value is checked when the file is loaded (`validateBrand` in `packages/engine/lib/design/brand.mjs`), and a
wrong one is refused with a list of every problem. A brand saved in Settings, Brand and look is written out as this file
(see [apps/web/README.md](../apps/web/README.md), "The brand").

- **Paths.** `logos.full` and `logos.mark` are PNG files, relative to the repository root and inside it (the demo:
  `brands/demo/logos/logo-full.png` and `logo-mark.png`). Font files are `design/fonts/...` paths, found in the engine's
  `packages/engine/design/fonts/` (Inter and IBM Plex Mono, SIL Open Font License, `OFL.txt`).
- **`timezone`** (optional): an IANA time zone such as `Europe/London`. The AI drafts in it and the web app shows it; a batch
  still names its own.
- **`money`** (optional): `{ "local": "...", "foreign": "..." }`. `local` is one sentence on what the brand's money is (the
  demo: "Acme Savings works in euros (€) only"); `foreign` is a regular expression, matched without case, of other
  currencies that pictures must not show. The AI library uses both (see [ai.md](ai.md)).
- **`map.json`** (optional, next to `brand.json`): the dot map for `closing` with `map: true`. `{ "grid": { "cols", "rows" },
  "regions": [{ "name", "capital": [col, row], "cells": [col, row, col, row, ...] }], "lit": ["<region name>", ...] }`: a
  grid of 2 to 400 columns and rows, 1 to 100 regions with names up to 80 characters, cells as flat pairs inside the grid,
  and `lit` naming regions to light. Only numbers and short names, checked on load (`mapProblems`); nothing in it becomes
  markup. Draw it from public-domain or your own data and say where it came from in the file.

## What is weak or unverified

- The phone glow is placed by fixed numbers per template, checked only for contrast; a very long headline next to it is shrunk, not
  moved.
- Poster photos: the plain-or-scene call is made from three strips of pixels, calibrated on one brand's photo library
  (`EDGE_LIMITS` in `lib/design/edge.mjs`, checked on real files by `test-design-edge.mjs` when they are present). A photo near a limit (a pale desk with a soft shadow
  at the top) can go either way: look at every image, and move the crop with `focal` if it matters. A card always shows the whole
  crop; a plain photo's page colour can fall outside the brand palette (the engine notes it).
- The poster templates were tuned on one launch set only (ten images); other photos may need `photoTop`, `focal` or `zoom`.
- The example batches (`batches/example-launch.json`, `batches/example-editorial.json`) are format examples for the demo brand,
  with synthetic pictures and invented figures, not sets to post. The editorial one still uses the earlier templates with
  drawn artefacts.
- Contrast is measured, but a pass does not mean the picture is pleasant: busy backgrounds can pass at the scrim cap and
  still be hard to read. Look at every image.
- The automatic lines avoid the text but not the subject of the photo; they can cross a boat or a face. Use `lines` or
  `"lines": false` when they do.
- On a very bright photo with the footer URL, the soft footer fade can be a visible band.
- The editorial templates have been run on a small set of posts only; very long ledgers, long sub lines or a
  3-line headline are shrunk or refused rather than redesigned.
- The phone layout assumes a capture of 660 x 1354; a much taller capture would run into the footer and be
  refused by the fit check rather than resized.
- `region` crops at a fixed share of the capture; at 0.75 a button at the right edge of a 1640 px capture can be cut by the
  window edge. Pick the share by eye.
- The carousel PDF's page box is corrected after Chrome prints it (see `carousel`); it was read back with poppler's `pdfinfo` and
  macOS, not with every PDF reader. The `square` size is less used than `feed`.
- Chrome versions: the tests run with current Google Chrome on macOS and Linux. The container's Debian Chromium is
  checked by `deploy/check.sh` with one text page only.
- Images are checked for pixel size and loaded fonts, not for correct language, facts or figures. Check the numbers.
