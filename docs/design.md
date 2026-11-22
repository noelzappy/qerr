# Making the post images

The design engine turns a post's texts and pictures into finished post images. It drives headless Google Chrome, so what
you get is what Chrome draws, at the exact pixel size, checked before it is saved.

Everything here is taken from the code in `packages/engine/lib/design/` and `packages/engine/design/templates/`. Five poster templates (`object`, `number`, `product`, `myth-fact`, `closing`, see "The poster look"), seven earlier editorial templates (`cover`, `text`, `ledger`, `passbook`, `stats`, `screen`, `photo-story`), `carousel`, full-bleed `photo` posts, `page-cover` and `post` (the design directions' template, see "Design directions and the post template") make up the engine. Where something has not been proved, it
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
  website). The brand's logo placement (`style.logo`) may put the logo on the right, or the footer at the top and the running
  head at the foot.
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
  Text takes its colour from the surface it sits on, not from the page's ground: on an ink page the sub line, the footer (its
  logo and website), a ledger's notes and a running head on the light panel are set as on a light page (and text on a dark
  panel of a light page as on a dark one), so they meet the contrast targets on what is really behind them.
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
    texture is dropped, and the type turns white or ink, whichever has the better contrast on the page. If neither reaches the
    page's strictest text contrast (`contrast.headline`, `sub` and `label`) on that colour, the page keeps its ground and the
    photo is placed as a band, as for a scene, and the tool notes why. This is what `ground: "photo"` means. The demo's
    `object-jar.jpg` is drawn to be this kind. With a photo treatment (`style.photo`) all of this is judged on the photo as
    treated.
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
`passbook`, `myth-fact`, `stats`, `screen`, `photo-story`, `closing` (a page may override the carousel's `series` or `label`),
or one of the brand's own layouts (`{ "template": "layout", "layout": "<id>", ...that layout's fields }`, see "Your own layouts";
built-in pages and layout pages mix freely).
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
at the bottom right (the brand's logo placement may swap the sides, or put both at the top and the text under them). Optional thin white and gold arcs and a corner bracket add a little brand motion. Works at every size.

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

The words are set at the sizes their layout gives them (`size`, `subSize`, `urlSize`), and every word (the logo, the tagline,
the descriptor and the website, which never breaks over two lines) must lie inside its box (the `coverWords` rectangle) and inside
the cover size's margins, whichever is tighter on each side. When they do not (upper-case display type is wider, a tagline can be
long, the X header's 970 px box is narrower than its 80 px tagline in the demo's words; in a row, a wide tagline squeezes the
descriptor and website out of the box), the renderer (`fitCover` in `lib/design/render.mjs`, `findCoverProblems` in
`lib/design/checks.mjs`) sets the tagline smaller in steps of 7% down to 62% of its layout size (the headlines' floor), on one line;
then, if it still does not fit, balanced over at most two lines, again from its full size down to 62%. The descriptor and the
website keep their sizes, like body text everywhere (the descriptor already wraps in its box). The first setting that fits is
used, with a note ("tagline set at 87% of the layout's size to fit the x cover"), and a warning below 70%. A cover whose words fit
none of these is refused, and nothing is written: "The brand's words do not fit the x cover even with the tagline set from 80 px
down to 50 px, on one line and wrapped over 2 lines: the words stand 9 px taller than the 290 px of their box. Shorten the brand's
tagline, descriptor or website (Settings, Brand and look); a cover never draws clipped words." With the demo's words every cover
fits in every style; with upper-case display type the Facebook cover's tagline is set at 93% and the LinkedIn and X taglines at
75%.

### What was removed

The old green look is gone: the `card` template, the old `stats` and `screen` looks, the carousel slide kinds `title`, `step` and
`end` (and `slides`, now `pages`), the decorative circles, the pills and chips and Inter Variable. Later the warm paper look
went too: the `paper` and `stone` grounds, the table and its grain, rotated sheets (`rotate`), the flat-print and paper shadows, the
CSS phone body (`statusFill`) and the `onTable` and `bodyStrong` text colours. `photo` and `page-cover` stay, restyled.

## Your own layouts

A brand can add its own compositions without a developer: **layouts as data** (`packages/engine/lib/design/layout.mjs`). A
layout is blocks placed in slots on a grid. It holds no markup, CSS or address: only numbers in bounds and names from fixed
lists, checked by `validateLayout`. The engine draws it (`lib/design/layout-render.mjs`) with the same helpers and escaping as the
built-in templates, in the brand's style layer (grounds, type roles, accent device, surfaces, decoration, photo treatment, logo
pill), and checks every image exactly like a built-in page: the fit loop, contrast, enlargement, pixel size, under the same
Content-Security-Policy. Admins make them in **Settings, Layouts**; the enabled ones are written into the brand pack's
`brand.json` as `layouts`, which `validateBrand` checks with the same validator.

A post uses one with `{ "template": "layout", "layout": "<id>", ...fields }`. The block is checked against the fields that
layout declares, with their lengths, exactly as a built-in template checks its own, plus the frame keys `sizes`, `name`,
`networkSizes`, `series`, `label`, `ground`, `accent`, and `focal` and `zoom` when it shows a picture. Anything else is
refused with the field named.

A carousel page may be drawn from a layout too: `{ "template": "carousel", "pages": [{ "template": "layout", "layout": "<id>",
...fields }, ...] }`. The page is checked exactly as a single post made with that layout (`layoutPageProblems`, then
`layoutDesignProblems`), except that `sizes`, `name` and `networkSizes` belong to the carousel and are refused on a page, and the
layout needs a `feed` canvas (a carousel is drawn at the feed size). `postDesignProblems` and `normalisePostDesign` (in
`layout.mjs`) check and normalise any post's design this way; the batch validator, the render job and the AI's checks use them.
Each page is drawn with its place in the carousel (`{ n, total }`), so its `page` conditions hold: `first` on page 1, `later` on
every other page, `single` never; the ground cases follow the same conditions, and a label with `"source": "folio"` reads
"02 / 05". A post made with a layout alone is a single post.

```json
{
  "id": "split", "name": "Photo beside text", "description": "A photo on the left, the text on the right.",
  "ground": "series", "accent": "series", "texture": "auto",
  "fields": { "image": { "required": true }, "headline": { "required": true, "max": 60 }, "sub": { "max": 110 } },
  "canvas": { "feed": { "columns": 12, "rows": 24, "margin": { "top": 56, "right": 70, "bottom": 56, "left": 70 }, "gutter": 20, "rowGutter": 0 } },
  "blocks": [
    { "type": "photo", "slot": { "col": 1, "row": 1, "width": 6, "height": 24 }, "bleed": ["top", "left", "bottom"] },
    { "type": "headline", "slot": { "col": 7, "row": 4, "width": 6, "height": 9 }, "size": 64, "valign": "bottom" },
    { "type": "sub", "slot": { "col": 7, "row": 14, "width": 6, "height": 6 } }
  ]
}
```

- **`id`**: lowercase letters, digits and `-`, up to 40. **`name`**: one line, up to 40; **`description`**: up to 300. Neither
  is ever placed in an image; they are for people and the AI.
- **`ground`**: `series` (the default: the series' ground, else `light`) or a ground name (older names are read as the new
  ones). **`accent`**: `series` (the brand's style) or `muted`, `colour`, `weight`, `none`. **`texture`**: `auto` (the brand's
  decoration for an editorial page), `none`, `dots`, `grid`, `lines`.
- **`canvas`**: one grid per size the layout is drawn at (`feed`, `square`, `story`, `wide`): `columns` 1 to 24, `rows` 1 to 36,
  `gutter` and `rowGutter` 0 to 80 px, `margin` a number or `{ top, right, bottom, left }` up to 600 px. Margins have a minimum
  per size (feed and square 40 at the top and bottom, 48 at the sides; wide 28 and 36; story 250 at the top and 320 at the bottom,
  clear of the story interface), and every cell must be at least 16 px. Text never leaves the margins.
- **`fields`**: what a post fills in, from a fixed catalogue: texts `headline`, `sub`, `quote`, `myth`, `factLead`, `fact` (up to
  220 characters), `line` (120), one-line `big`, `label`, `title` (40), `eyebrow` (60), `note` (80); lists `stats` (up to 3
  `"number|label"`) and `items` (up to 6 points of 48 characters); `image`; `artefact` (a ledger, passbook or register card,
  checked by the built-in artefact rules; `types` may narrow it). Each takes `required`, and `max` (texts, up to the cap) or
  `min` and `max` (lists). Every declared field must be shown by exactly one block.
- **`blocks`** (up to 24, drawn back to front): each has a `type` and a `slot` `{ col, row, width, height }` in grid cells counted
  from 1 (or one slot per size, `{ "feed": {...}, "story": {...} }`), and options from fixed lists:

| type | shows | options |
| --- | --- | --- |
| `headline` | a text field (default `headline`) | `size` 56 to 136 px, `style` `editorial` or `poster`, `align`, `valign` |
| `sub` | a text field (default `sub`) | `size` 30 to 44 px, `align`, `valign` |
| `label` | a short field, fixed `text` of the layout (up to 40), or `source` `series`, `brand`, `folio` | `style` `mono`, `tag`, `plain`; `tone` `muted`, `accent`; `size` 22 to 28 |
| `figure` | a short field (default `big`) | `size` 96 to 240 px, `style`, `align`, `valign` |
| `stats` | `stats` | `direction` `row` or `column`, `size` 48 to 84, `rules` |
| `list` | `items` | `style` `checks`, `pills`, `bullets` |
| `photo` | `image` | `frame` `none`, `card`, `raised`; `bleed` |
| `screen` | `image` | `device` `phone` (a pre-framed capture, refused otherwise) or `desktop`; `fit` `contain` or `crop` (phone), `glow`, `tilt` and `framed` (desktop), `titleField` |
| `logo` | the brand's logo | `variant` `auto`, `full`, `solid`, `pill`, `mark`; `size` 24 to 48 |
| `website` | the brand's website | `size` 22 to 30 |
| `slab` | a colour panel holding up to 6 `children` (text blocks without slots) | `ground` (a ground, `panel` or `card`), `radius` `none`, `card`, `slab`; `shadow`; `padding`; `gap`; `bleed` |
| `artefact` | `artefact` | `align`, `valign` (refused when the card does not fit its slot) |
| `decoration` | nothing | `kind` `rule`, `panel`, `dots`, `texture`, `glow`, `map`; `bleed`; lies under everything |
| `spacer` | nothing | reserves cells |

  `headline`, `figure` and `stats` also take `shrink` (default true: the fit loop shrinks them together; false keeps the size),
  and every block may take `when` and `px` (see "The built-in templates as layouts" below).

  `align` is `left`, `center` or `right`; `valign` `top`, `center` or `bottom`. Only `photo`, `slab` and `decoration` may
  `bleed`, and only to the page edges their slot touches. Blocks other than decorations may not overlap (put text on a colour
  with a `slab`), and a block on a `panel` decoration lies wholly on it or wholly off it. Text sizes are for the feed page; the
  other sizes scale them (square 0.9, wide 0.6).

**How it stays safe.** Every value is checked before it is stored (Settings, Layouts), again when the brand pack is written
(`validateBrand`), and again when a page is drawn. Names reach class attributes only after a lookup in their fixed list;
positions and sizes are numbers computed from the checked grid; spec words go through `esc()`/`fmtE()`/`fmtSub()`; pictures
through `ctx.image()`. The layout classes are a fixed engine stylesheet (`design/layout.css`, no colour or font of its own) that a
page asks for by name (`buildPage({ sheet: 'layout' })`), never a stylesheet from a layout. `test-design-layout.mjs` feeds hostile
text through every block type and every field, and hostile values through every setting of a layout.

**Checks.** On top of the built-in checks, a layout's text must stay inside its own slot: text that runs out of it is a fit
problem ("the sub line runs 40 px out of the bottom of its slot"); a headline or a big figure is shrunk first, other text must be
shortened. The fit check holds text to the layout's own margins.

**The built-in layouts.** Settings, Layouts also lists every built-in template's layouts (below, "The built-in templates as
layouts"), read only, with a sketch, the variant each one draws and its fields; the page covers are not post images and are not
listed. An admin may duplicate one into a layout of the brand's own and change it (see "Starting from a built-in layout").

**Starting points.** `lib/design/layout-starters.mjs` writes compositions like the built-in `text`, `stats`, `photo-story`,
`cover` and `myth-fact` pages (and a split and a quotation page) as layout data. Settings, Layouts offers them to copy and
change. They are close to the built-ins but not pixel-identical: a grid of up to 24 x 36 cells cannot place things on the
built-ins' exact pixels, and a grid page has none of their own behaviour.

### The built-in templates as layouts

Every built-in template is expressed in the same format, so one renderer draws every page. A design that names a template
(`{ "template": "number", ... }`) is still written and checked exactly as before (`validateDesign`), and is drawn from the first
of its template's layouts whose condition holds (`lib/design/builtin-layouts.mjs`, one file per template group under
`lib/design/builtin/`). The layouts were written to make, pixel for pixel, the images the hand-written template functions made;
those functions are gone (`design/templates/` keeps only the drawing helpers the pages call). A design no layout takes (one
`validateDesign` refuses) is refused. The tests hold the layouts to the markup the functions drew (a sha256 of every page,
`packages/engine/testlib/builtin-markup.json`), and `testlib/template-baseline.mjs` renders every template, for the demo brand
and two style variants, to compare two versions of the code picture by picture (see `packages/engine/testlib/CONVERTING.md`).
By group:

- Poster (`lib/design/builtin/poster.mjs`): **`number`**, **`object`**, **`product`** (two layouts: `product` centred, and
  `product-side` for `"layout": "side"`), **`myth-fact`** and **`closing`** are drawn from their layouts. The spec's headline
  `size` picks one of several headline blocks by a condition on `size`; the spec's `align` reaches a headline that takes
  `specAlign`. The poster page also draws a `screen` block (the pre-framed phone; `phoneTop` moves it to the spec's validated
  `phoneTop`), and a `glow` decoration on a page with a phone is that phone's glow, sized from the picture's own ratio. New for
  the poster page only: `slabs` (myth-fact's colour-blocked myth and fact slabs, stacked and centred; each headline child starts
  the next slab, and the page is marked as flowing; it holds only `headline` children, which take only `size`, and `sub`
  children, which take no options, and at most two slabs: each headline starts one, and so does a first child that is not a
  headline), the chrome block `mark` (the series mark opposite the logo bar: the spec's
  `label`, else the series' name, else "Myths vs facts"), the bar's `label` (`auto` or `none`), and a headline's `fallback`
  (`tagline`: the brand's tagline when the spec has no headline) and `subFallback` (`website`: the brand's website when the spec
  has no sub line), as the closing page sets them. A poster page with the dot map refuses a brand without one, as `closing` did.
  The `bar` block stays at the top, as the templates' bar does, when the page shows a photo block or a phone whose full height
  reaches the bar's low place.

- Artefacts (`lib/design/builtin/artefacts.mjs`): **`ledger`**, **`passbook`** (on its own, and with a register card) and a
  **`text`** page with an artefact (one layout per type: ledger, register card, passbook page, passbook page with its register
  card) are drawn from their layouts. Each is one band per headline size (70, 84, 112) with and without a sub line: the panel's
  top, the headline's width and the card's place follow them, as on the templates, and the bands' conditions exclude each other.
  The cards are an `artefact` block on the editorial page, drawn from the rectangle's top-left (a ledger or register card its own
  drawn size, a ledger's notes under it; a passbook page fills the rectangle; beside its register card it is 410 px wide). Its
  built-in-only option `from` (`field`, `ledger` or `passbook`) says where the artefact is: a text page's `artefact` field, or the
  ledger or passbook template's own fields. A condition on `register` reads the register card the template draws (the passbook
  template's own `register`, a text page's artefact's).

- Editorial (`lib/design/builtin/editorial.mjs`): **`text`** without an artefact, **`cover`**, **`stats`** and **`photo-story`**
  are drawn from their layouts (photo-story as two variants, `panel` and `print`, chosen by a `when` on its `layout`). For them
  the editorial page also draws a `photo` (`frame`: `none` a photo window, as the stats band and the panel story's photo;
  `card` the cover's card; `raised` the print story's card on the panel), the stats page's big `figure` (`size`, `shrink`; the
  box is the figure itself, and it is not the page's `#txt`), its `stats` (`direction` `row`: each number in bold over its label,
  side by side, 50 px apart; `column`: rows a third of the rectangle apart, numbers in the headline type at `size`, a hairline
  between them with `rules`; `shrink`) and a `labelrow` (built-in editorial pages only: the series' name or the spec's `label`
  and, on a carousel page, the folio, at the two ends of its rectangle).

- Screen (`lib/design/builtin/screen.mjs`): **`screen`** is drawn from four layouts, one per variant: a desktop window
  (`device: desktop`), a phone beside a passbook (`beside`), a faded phone (`fade`) and the phone row (the default). They use the
  screen group's pieces of the editorial page, each from a fixed list or a bounded number: the `screen` block (a phone the
  width of its rectangle from its top, cut at its foot with `fit: crop`; a desktop window with `specWindow`, which takes the
  spec's own validated `framed`, `tilt` and `region`, and `titleField`), `halo` (the glow behind the phone, sized from the
  picture as the phone is drawn), `beside` (the passbook card of the spec's `beside`, in its rectangle), `footlogo` (the
  footer with the logo alone), and two headline options: `lists` (the spec's pills and check list under the sub line) and
  `row` (the headline and the phone side by side in one flex row, centred in the band their rectangles share). All of them
  belong to the built-in editorial page; Settings, Layouts and the AI are not offered them.

- Photo (`lib/design/builtin/photo.mjs`): **`photo`** is drawn from its layout at every size, on its own kind of page
  (`"page": "photo"`, `lib/design/layout-photo.mjs`): the photograph under everything (`backdrop`), the scrim and footer fade
  the renderer raises until the text reads (`scrim`), the thin lines it draws (`lines`), one text box per `textAt` (two
  headline blocks with exclusive conditions on `textAt`, the bottom one anchored at the foot of its rectangle with `"valign":
  "bottom"`) holding the eyebrow (`"eyebrow": true`), the headline and its `subField` sub line, and the footer with the logo in
  its pill (`photoFooter`). The type sizes per size are the page's own (`PAGES.photo.type`), the fit margins the size's.
  The page covers (**`pagecover`**) are drawn from one layout per kind (`{ "field": "kind", "is": "facebook" }`), on a
  `"page": "cover"` (`lib/design/layout-cover.mjs`) whose canvas names the cover sizes (`profile`, `facebook`, `linkedin`,
  `x`) instead of the post sizes: the brand's mark centred in its rectangle (`coverMark`), or the brand's logo, tagline,
  descriptor and website in a box filling it (`coverWords`: a column, centred or set left, or a row, with the sizes and gaps
  as bounded whole numbers). A cover's words are all the brand's, so its layout declares no field. They are held to their box
  and the size's margins; the tagline shrinks (to 62%) and wraps (to two lines) to fit, or the cover is refused (see
  "`page-cover`" above).

The format gained what the built-ins need; every new value is a name from a fixed list or a bounded whole number, checked by
`validateLayout` like the rest:

- **`page`**: `grid` (the default, a brand's own layout as above), `poster` or `editorial` (a brand's layout may use these too, at
  the feed size; see "Starting from a built-in layout"), and for the built-in layouts only `photo` and `cover`. A poster or editorial page is the
  built-in templates' own page: their wrapper, type, decoration (`texture: auto` is the posters' line texture or the editorial
  dots, off with a spec's `dots: false`), accent (the colour on posters, muted on editorial pages) and fit margins, and each block
  drawn with their markup, from the top of its rectangle down, in the order listed. `PAGES` in `layout.mjs` lists the block types
  each page draws and the options each honours there; anything else is refused. A poster's photo and an editorial page's tint
  panel run the full width to the bottom edge.
- **`px`**: a block may give `{ "x", "y", "w", "h" }` in page pixels (whole numbers inside the page, or one per size) instead of a
  `slot`. Text keeps inside the size's minimum margins. The overlap and panel checks treat it like a slot.
- **`when`**: a block may be drawn only when a declared field is filled (`{ "present": "sub" }`) or empty (`{ "absent":
  "image" }`), or only on page 1 of a carousel, a later page or a single post (`{ "page": "first" | "later" | "single" }`);
  several keys must all hold. Blocks whose conditions exclude each other may show the same field and share space. A
  condition may also test one choice from a fixed table (`SPEC_CHOICES`): `{ "field": "artefact", "is": "ledger" }` (the
  artefact's type; the only choice a grid page may test, and only a declared artefact), and on the built-in pages the
  templates' own options and flags (`register`, `beside`, `pills`, `checks`, `layout`, `device`, `align`, `size`, `textAt`,
  `scrim`, `map`, `fade`, `tilt`, `framed`, `glow`, `dots`, and a page cover's `kind`), with `is` or `not` and a value or a list of values from that
  choice's list. Where every template has the same default it is filled in (a device is a phone unless it says desktop);
  where they differ the value is read as given, and an unset value matches no `is`, only a `not`.
- **`ground`** may be a list of up to 4 cases, `[{ "when": { "present": "image" }, "ground": "photo" }, { "ground": "cool" }]`,
  the first that holds being used (only the last has no `when`). On a poster page `photo` starts the page from the series'
  ground, else `cool`; a plain photo background then replaces it in the browser, as on the poster templates.
- **Chrome blocks** with no slot, placed by the page and the brand's style (logo placement, footer style, "Swipe →" on page 1
  of a carousel): `bar` (the poster's logo and website), `runhead` (the editorial running head: the series or the spec's
  `label`, and the folio, the spec's `headRight` or the brand's name; `rule`) and `footer` (the editorial footer, its logo and
  label drawn for what they sit on: the panel when it lies on it, else the ground). With the brand's logo at the top the
  `footer` and the `runhead` change places (see `style.logo` under "The brand file").
- **Options**: `shrink` (headline, figure, stats; default true: the block shrinks with every other such block in the fit loop;
  false keeps its size), `specSize` (a headline takes the spec's own validated `size`), `photoTop` (a poster photo's top edge
  moves to the spec's validated `photoTop`), and a headline's `subField` with `subWidth` (100 to 1080 px, default 820): that
  sub line flows 28 px under the headline in the same box, as the templates set a headline and its sub line, so it moves up
  when the fit loop shrinks the headline.

The chrome blocks, `specSize`, `photoTop`, `subField` and `subWidth` belong to the built-in pages. The AI's compositions are
offered only what a grid page takes (`layoutCatalogue().blocks`). Settings, Layouts is driven by `layoutCatalogue().pages`, which
describes every kind of page a brand's layout may use (`grid`, `poster`, `editorial`): its sizes, how blocks are placed (cells
and pixels on a grid page, pixels on a built-in page), its decorations and page colours, the condition forms and the choices a
brand may test there, and for every block type the fields it may show, the children it holds with the options each takes
inside it (`holds`) and, for the myth and fact slabs, how many slabs it draws (`slabs`), its options (a list, a flag or a
bounded whole number, each with what it needs of the block's other settings, such as a desktop window's `tilt` needing
`"device": "desktop"`), its bindings (a label's words, `titleField`, `subField`) and the full-width rule; it also gives each
field's rule bounds and each size's pixel bounds. Those dependencies are data the validator reads too, so the two cannot drift:
`test-design-layout-catalogue.mjs` checks that everything the catalogue offers is accepted, that values just outside its bounds
and lists are refused, and that everything it leaves out (block types, options, bindings, choices, grounds, sizes) is refused.

### Starting from a built-in layout

An admin duplicates a built-in layout in Settings, Layouts ("Duplicate to edit"); the copy is a layout of the brand's own, on the
same page (`"page": "poster"` or `"editorial"`), with the same blocks, pixel rectangles and look, switched off until it is switched
on, and edited like any layout: its rectangles in pixels, its options from the page's own lists, its conditions and ground cases,
all in the visual editor (see "Editing a layout" below), with the engine's verdict as you type and a real preview with the brand. A
post then uses it as `{ "template": "layout", "layout": "<id>", ...fields }`.

**What a brand may customise.** Everything those pages draw is a name from a fixed list, a flag or a bounded whole number that
`validateLayout` checks, and every drawing takes text only through the escaping functions and numbers only from checked values, so
a brand's layout may use the poster and editorial pages with their blocks (the logo bar, running head, footer, series mark,
label row, myth and fact slabs, the glow behind a phone, the headline's flowing sub line) and options. What it may not use is
what reads a setting of the built-in templates' own designs: a design for a brand's layout carries only the layout's fields and
the page frame (`series`, `label`, `ground`, `accent`), never a template's `size`, `align`, `photoTop`, `phoneTop`, pills and
checks, a desktop window's `framed`, `tilt` and `region`, a ledger's columns or a passbook's days. So these are for the built-in
layouts only (`validateLayout(l, where, { builtin: true })`, as `lib/design/builtin-layouts.mjs` checks them), and a brand's
layout is refused them: the options `specSize`, `specAlign`, `photoTop`, `phoneTop`, `lists` and `specWindow`, an artefact
`"from": "ledger"` or `"passbook"` (a brand's layout takes its artefact from its `artefact` field), the `beside` card, and
conditions on any choice but the artefact's type and its register card. Two kinds of page are for the built-in layouts only as
well: `photo` (the renderer raises the photo post's scrim, places its thin lines and holds its text to the photo contrast targets
from the photo template's own `textAt`, `scrim` and `lines`, which a brand's design does not have) and `cover` (page covers are
made from the brand for its social profiles, never for a post). The poster and editorial pages are drawn at the feed size only.

**The copy** (`builtinCopy` in `lib/design/layout-starters.mjs`) settles each condition on a template's own setting to what a
brand's design reads (the default headline size and alignment, the glow on, no map, text at the top): a block that would then
never be drawn is left out, and the condition of one that always would is dropped; it leaves out the options above, and takes
the artefact of the variant's type from the layout's `artefact` field (`"types": ["ledger"]` for a ledger page). Every built-in
layout can be copied except the phone beside a passbook (its card is the design's own `beside`) and the photo post; the list says
why. `test-design-layout-builtin.mjs` checks that every copy is a valid brand layout, that what is for the built-in layouts only
is refused, that hostile values are refused and hostile words drawn escaped, and renders every copy with the demo brand (which
has a synthetic pre-framed phone, `design/assets/demo/screen-phone.png`, for the previews of the layouts that show a phone).

### Editing a layout

Everything a brand's layout can say is edited visually in Settings, Layouts. A layout opens its own page, not a side sheet:
`/settings/layouts/new` (optionally `?from=<starter>`, `?duplicate=<layout id>` or `?copy=<built-in id>`) and
`/settings/layouts/:id`. Blocks are dragged and resized on a large canvas, snapped to the grid's cells, or placed with the number
fields or in pixels. The keyboard works too: the arrow keys move the selected block, Shift with the arrows resizes it, Escape
deselects and Delete removes it. The canvas's "Real image" view is the real preview, drawn with the brand. The layout's JSON, under
"Advanced: JSON", shows the same layout as the engine reads it, and switching between them loses nothing. The page asks before it
is left with changes that are not saved. The editor's controls come from `layoutCatalogue().pages` for the layout's
kind of page, so it offers nothing the validator refuses and leaves out nothing it accepts:

- **The layout**: name, id, description, kind of page (moving a layout to another page keeps what that page draws, places it as
  that page places blocks and names what it left out), the accent and the texture.
- **Page colour**: one ground, or cases, each a condition and a ground, the first that holds being used, with an "otherwise"
  last; cases are added, removed and reordered (up to 4).
- **Sizes and grids**: the sizes of a grid page, and for each its columns, rows, gutter and row gutter (or the same as the
  columns), and its margins, one for every side or one per side, never under the size's minimum.
- **Blocks**: added from the page's block types, reordered and removed. Each block's place in grid cells (dragged or resized on
  the canvas, snapped to the cells) or in page pixels, one place for every size or one per size; its bleed, only to the edges its slot touches; every
  option the page takes for it, shown only when what it needs is set (a phone's `fit`, a desktop window's `tilt`, a sub line's
  `subWidth`); what it shows (a field, which is declared when picked; a label's field, fixed words or source; a window title; a
  headline's flowing sub line); and the blocks inside a slab, added, reordered and removed.
- **Show this block**: always, or only when every clause holds: a field is filled, a field is empty, on page 1 of a carousel, a
  later page or a single post (a post made with a layout alone is a single post; a carousel page made with it is page 1 or a
  later page), or a choice is (or is not)
  one of chosen values: the artefact's type once the layout declares an artefact, and on a poster or editorial page its register
  card. The block list says when each block is drawn ("Sub line, when sub is filled").
- **Fields**: declared, required, and their limits (characters, or the least and most entries) within the catalogue's bounds,
  and the kinds of artefact one takes.

The sketch follows "sketch as if" switches for what the conditions test (a field empty, a choice's value) and for where the post
is: a single post, or page 1, a middle page or the last page of a carousel (offered when the layout has a feed size; a middle and
the last page are both "later" pages, told apart by the folio). The blocks a post would not draw in that case are hidden (the
selected one dashed), conditional blocks are marked, and the page takes the colour that case would get. The preview draws the
same case (`POST /api/settings/layouts/preview` with `empty`, `artefact` and `page`: `first`, `middle` or `last` draws the layout
as that page of a carousel of three at the feed size). The editor's model (`apps/web/web/src/pages/settings/layout-model.ts`) reads each part of the JSON into what the
editor shows and writes it back; `apps/web/src/web-layout-model.spec.ts` opens every starter, every built-in layout a brand may
copy and every layout the catalogue lets one build that the engine accepts, and checks that nothing is left unshown and that each
comes back deep-equal. Anything in a layout the editor could not show (only what the engine refuses for a brand) is listed above
the editor, to be fixed under Advanced: JSON.

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
- **The demo pictures** are in `packages/engine/design/assets/demo/`: `object-jar.jpg`, `scene-market.jpg`, `screen-desk.png` and
  `screen-phone.png` (a pre-framed phone capture),
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
| **Text fits** | Chrome measures the real text lines: inside the margins and clear of the footer (above it, or under it when the brand's logo placement puts it at the top), no text on text, no text on a photo, screenshot or on an object it does not belong to (text inside its own card is fine), body text at least 30 px, text not straddling the panel's edge, single-line numbers not wider than their box. Drawn objects must stay inside the page (a phone may run off the bottom), clear of the footer and the logo, on the panel, and not overlap each other | The headline (and big numbers) shrink in steps down to 62% of the brand size. A long headline (more than 24 characters) starts a little smaller. If it still does not fit, or the sub line does not fit, the image **fails** with: "The text does not fit the feed format: ... Shorten the text ..." and nothing is written. Shrinking below 70% adds a warning. |
| **Contrast** | The page is rendered with all text hidden; the pixels behind each text line are read. The worst case counts: the brightest part for light text (95th percentile, so a single speck does not decide), the darkest for dark text. Needs, on photo posts: headline and big numbers 3:1, sub line and eyebrow 4.5:1, website 3:1. On every other page (`brand.json` `contrast`): headline, big numbers, sub and body 7:1, labels, the footer label, the poster logo's wordmark and the accent phrase 4.5:1, an artefact's labels 4.5:1 and the words written on it 7:1. Text inside artefacts (SVG text) is measured the same way | On photo posts the black scrim is raised in 0.05 steps (cap 0.65) before anything else; a weak website line gets a soft black fade behind the footer (cap 0.5). Anything still below the target is a warning with the measured ratio, to one decimal, or to two (cut off, not rounded up) when one decimal would read as the target itself, so a warning never says "4.5:1 (needs 4.5:1)". `"scrim": "none"` switches the automatic fix off (it still warns). |
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
limit), and optionally the brand's own `layouts` (see "Your own layouts"). The tokens become CSS variables; `packages/engine/design/brand.css` and the templates use the variables, not
literals. Every value is checked when the file is loaded (`validateBrand` in `packages/engine/lib/design/brand.mjs`), and a
wrong one is refused with a list of every problem. A brand saved in Settings, Brand and look is written out as this file
(see [apps/web/README.md](../apps/web/README.md), "The brand").

- **Paths.** `logos.full` and `logos.mark` are PNG files, relative to the repository root and inside it (the demo:
  `brands/demo/logos/logo-full.png` and `logo-mark.png`). Font files are `design/fonts/...` paths, found in the engine's
  `packages/engine/design/fonts/` (Inter and IBM Plex Mono, SIL Open Font License, `OFL.txt`).
- **Ground names.** `grounds` holds six colours under neutral names: `light`, `soft`, `cool`, `warm`, `dark` and `deep`.
  The names used before (`white`, `tint`, `mint`, `gold-pale`, `ink`) still work everywhere a ground is named: in
  `grounds` (one name per ground, never both), in a series' `ground` and in a spec's `ground`; they are read as `light`,
  `soft`, `cool`, `warm` and `dark`. Which grounds are dark (light type, the dark decoration, the light logo) is worked out
  from their colours, not their names, so a brand may make any ground dark or a saturated full-bleed colour. Elsewhere in
  this document the older names appear; they mean the same grounds.
- **Colour roles.** Besides `grounds`, `text` (`ink`, `body`, `muted` on light grounds; `mutedInv`, `invBody` and the
  optional `inverse`, the headline colour on dark grounds, default the light ground or white), `accents` (`primary` on
  light grounds, `gold` on dark ones, `goldDeep`), `surfaces` (`panel`, `card`, `line` and the optional `outline`, default
  the ink) and `poster.slabs` (`myth`, `fact`). In Settings each can be set by hand; the ones left out are made from four
  colours and fitted for contrast; the ones set by hand are used as set and the checks say where they do not read.
- **Fonts by role.** `font.family` is the sans (body text, and headlines unless they have their own), `font.mono` the mono
  (figures in drawn artefacts, and labels unless they have their own). Optional `font.display` (headlines) and `font.label`
  (running heads, footers, eyebrows, the website) name a family: the sans, the mono, or one with files of role `display` or
  `label` in `font.files` (roles: `sans`, `mono`, `display`, `label`; each file a `.woff2` with the weight it is declared
  for, `"400"` or a range such as `"300 700"`, from 100 to 900, and its unicode range). Each file is its own `@font-face`
  rule with that `font-weight`. A file's path is relative, inside the repository, with no `..`; a brand has at most 64
  files, 18 per role. A name with no files is refused.
- **Weights by role.** The page draws each role at these weights (`roleWeights` in `lib/design/brand.mjs`): body text
  (`sans`) at the body weight (`style.type.body.weight`, default 400), its bold words at the headline weight, and 400, 500
  (website, pills) and 600 (tags); headlines (`display`) at the headline weight (`font.headlineWeight` or
  `style.type.display.weight`), the lighter accent and big figures at `font.accentWeight` (or the display weight minus
  300), poster headlines at `poster.headlineWeight` (or the display weight) and 600 (a layout's plain brand name); labels
  at the label weight (`style.type.label.weight`, default 500); the mono of drawn figures at 400 and 500. A family that
  fills several roles (the sans for headlines too) is drawn at the weights of each (`familyWeights`).
  `test-design-fonts.mjs` fails when a stylesheet sets a weight this list does not know.
- **Fonts in the web app.** In Settings, Brand and look, Type, each role's font is built in, a woff2 upload (one file
  declared for every character and every weight, `100 900`), or a family from a curated list of Google Fonts that the
  server downloads once and stores: every weight the brand draws that role's family at (with the saved settings), or,
  where the family lacks one, the nearest it has; each weight's `latin` and `latin-ext` files, listed in `font.files` with
  the unicode range Google gave them (as the demo pack lists Inter). Each file is declared for the weights it is the
  nearest to (`weightRanges`: with 400 and 700, `100 549` and `550 900`), so every weight is drawn with the true face
  nearest to it and the browser never makes a synthetic bold. A variable family's one file is declared for all the
  weights it draws. A Google font saved before fonts came in several weights keeps its one weight, declared `100 900`;
  Settings lists the weights the brand now uses that it lacks, and picking it again adds them. The engine sees only files
  in the pack folder; nothing is fetched while a page is rendered.
- **`style`** (optional; without it a brand looks exactly as before). Every field is optional, a value from a fixed list or
  a number in range (`styleProblems`); the stylesheet takes only table entries and checked numbers, and the page root only
  fixed class names (`styleClasses`):
  - `type.display`, `type.body`, `type.label`: `case` (`as-typed`, `upper`; labels default `upper`), `tracking` (em, -0.1 to
    0.3) and `weight` (100 to 900). A display weight or tracking applies to editorial and poster headlines alike; without
    one each keeps `font.*` and `poster.*`. `type.scale` (0.8 to 1.25, default 1) multiplies every headline size (the fit
    loop still shrinks a long one). `type.accent`: `series` (default: each series and post says), or one of `muted`,
    `colour`, `weight`, `none` for every page; a post's own `accent` still wins. `none` is also a series and spec accent.
  - `surface`: `shadow` (default: the layered card shadow and a 1 px line), `outline` (a solid line in `surfaces.outline`)
    or `flat` (fills only), for cards, panels, the desktop window and the phone's drop shadow.
  - `decoration`: `kind` `auto` (default: dots on dark editorial pages, the fine line texture on dark posters), `none`,
    `dots`, `grid`, `lines` or `artwork`; `on` `dark` (default) or `all` grounds; `alpha` (0.01 to 0.4) for dots, grid and
    lines; for artwork, `artwork` (the path of a PNG, JPEG or WebP picture inside the repository, read and checked by its
    bytes and embedded as a `data:` URI; never SVG), `fit` (`cover` or `corner`) and `opacity` (0.05 to 1). A page with
    `dots: false` has none.
  - `photo`: `treatment` `none` (default), `tint`, `duotone` or `overlay`, on photographs only (never phone or desktop
    screens), with `colour`, `shadows` and `highlights` naming brand colours (`primary`, `accent`, `ink`, `inverse` or a
    ground) and `strength` (0 to 1). The contrast checks measure the treated pixels, and the photo post's scrim sits above
    the treatment. A treated poster photo is judged, and lends the page its edge colour, as the treatment draws it: the page
    applies the same treatment to the pixels it reads (`lib/design/treatment.mjs`) before it decides, so the page, the photo
    and the type picked against the page agree. With the demo colours, a tinted or duotone `object-jar.jpg` takes the page,
    and in duotone so does `scene-market.jpg`, whose sky and buildings turn one grey; the overlay at strength 0.5 does not
    (see the contrast rule under Object photos).
  - `logo`: `auto` (default: each page's own place, the top left of a poster, the bottom left of an editorial page and a
    photo post), `top-left`, `top-right`, `bottom-left`, `bottom-right`. It places the logo a page draws itself, and only
    that: the poster's logo bar, the editorial footer (also the footer with the logo alone on `screen` pages) and the photo
    post's footer. A logo a layout places as a block stays where its layout puts it: a grid page's `logo` block (a brand's
    own layout) and the page covers' logos.
    - **Posters** move their logo bar to the top or the bottom (`myth-fact`'s series mark goes to the other edge), except on
      pages whose photo or phone runs to the bottom edge (`object`, `number` with a photo, `product` when the phone reaches
      the bar): there the bar stays at the top, on the ground its logo is drawn for, and follows only the side.
    - **Editorial pages** with the logo at the top swap their chrome: the footer (the logo and the website) takes the running
      head's place at the top, and the running head goes to the foot of the page, its rule above it, where its labels count
      as footer labels. A page whose picture reaches into the band at the top (above y 126: `photo-story`'s full-bleed photo)
      or, on a page with a running head, into the band at the foot (below y 1240: the phone beside a passbook on `screen`,
      which runs off the bottom edge) keeps its footer at the bottom and follows only the side.
    - **Photo posts** with the logo at the top put the footer there, as far from the top edge as it sits from the bottom one
      (in a story, at the top margin, under the band the app's interface covers), and move the text out of its way: it starts
      40 px under the footer's pill and runs down to as far from the bottom edge as it was from the top (in a story, above the
      bottom band), so text set at the bottom (`textAt`) sits where the footer was. The footer fade, when the website needs
      it, follows the footer.
    - The fit check holds text and drawn objects clear of the footer wherever it is.

    `footer`: `website` (default), `pill` (the logo on a light pill, and the website) or `none` (the logo alone; page 1 of a
    carousel still says "Swipe").
- **`timezone`** (optional): an IANA time zone such as `Europe/London`. The AI drafts in it and the web app shows it; a batch
  still names its own.
- **`money`** (optional): `{ "local": "...", "foreign": "..." }`. `local` is one sentence on what the brand's money is (the
  demo: "Acme Savings works in euros (€) only"); `foreign` is a regular expression, matched without case, of other
  currencies that pictures must not show and that texts are warned about: the brand lint (`lintText`, so image text in every
  render) and the AI library's caption check warn when a text matches it (`foreignMoneyWarning` in `lib/design/lint.mjs`), and the
  web app's review page does the same for a caption a person wrote. The AI library uses both (see [ai.md](ai.md)).
- **`map.json`** (optional, next to `brand.json`): the dot map for `closing` with `map: true`. `{ "grid": { "cols", "rows" },
  "regions": [{ "name", "capital": [col, row], "cells": [col, row, col, row, ...] }], "lit": ["<region name>", ...] }`: a
  grid of 2 to 400 columns and rows, 1 to 100 regions with names up to 80 characters, cells as flat pairs inside the grid,
  and `lit` naming regions to light. Only numbers and short names, checked on load (`mapProblems`); nothing in it becomes
  markup. Draw it from public-domain or your own data and say where it came from in the file.

## Design directions and the post template

A design direction is a way of drawing posts as a whole: its fonts, margins, grid, devices and colour logic live in one table
(`packages/engine/lib/design/directions/<name>/tokens.mjs`) and its layouts live in `compositions.mjs` beside it. The `post`
template does not name a layout. A post says **what it is**, and the brand's direction decides **how it is drawn**:

```json
{ "template": "post", "kind": "figure", "variant": 0, "big": "74%", "unit": "of our beans", "sub": "come straight from the farm.", "label": "Numbers" }
```

- **`kind`** is one of `statement`, `figure`, `list`, `quote`, `photo`, `event`, `offer`.
- **The direction** is `style.direction` in `brand.json` (`editorial`, `swiss` or `retail`; Settings, Brand and look in the
  web app). It is optional. When it is absent the brand behaves exactly as before, and a `post` design is refused with a message
  that names the way out (set `style.direction`). Every other template ignores it.
- **`variant`** (a whole number from 0 to 9) picks one of the direction's compositions of that kind. Leave it out and the
  engine chooses one from a hash of the post's name and words (`chooseVariant`), so a batch varies but a re-render never
  changes. A variant the direction does not have is refused with the number it does have.
- **Size**: `feed` (1080 x 1350) only for now, like the poster templates.
- **No logo and no website** are drawn on a post page. A brand that sets `style.logo` to a corner gets its logo there, and
  nothing else.

### The fields

Lengths count what is seen: the asterisks of an emphasis and line breaks do not count. Unknown keys are refused, and a text
that is empty, over its limit or on two lines where one is required is refused, all by `postProblems` in
`lib/design/post-spec.mjs`, before Chrome starts. `image`, `focal` and `zoom` work as in the other templates.

| Field | Limit | Notes |
|---|---|---|
| `label` | 28 | one line; the small line above or beside the page |
| `headline` | 70 | `*phrase*` marks the emphasis; `\n` breaks a line |
| `sub` | 140 | |
| `big` | 8 | the numeral of a figure, one line |
| `unit` | 24 | one line |
| `items` | 2 to 5 texts of 44 | one line each |
| `quote` | 160 | |
| `by` | 40 | one line |
| `meta` | 40 | one line, for example the date and place of an event |
| `tag` | 16 | one line, the words of a seal or sticker |
| `image`, `focal`, `zoom` | as elsewhere | `.jpg .jpeg .png .webp .gif`; zoom 1 to 3 |

Required per kind: `statement` needs `headline`; `figure` `big`; `list` `headline` and `items`; `quote` `quote`; `photo`
`image` and `headline`; `event` `headline` and `meta`; `offer` `headline` and `tag`. A field the chosen composition does not
draw is left out of the image, with a warning. A text longer than the composition's own budget (`words`) gets a warning that it
may be set smaller than intended.

### The three directions

| Direction | Look | Built today |
|---|---|---|
| `editorial` | Quiet luxury, a magazine rather than an advert. Margins 96, 6 columns. Fraunces (display), Source Serif 4 (text), Inter (label); the emphasis is italic, not a colour; a 2 px rule and a folio ("No. 07"). | `statement/0` "Cover line" |
| `swiss` | An international-style poster. Margins 64, 12 columns and an 8-row rhythm. Hanken Grotesk (display, text), JetBrains Mono (meta); a meta row (label, brand name, folio, 4 px rule above); one accent block. | `statement/0` "Poster" |
| `retail` | A high-street campaign. Margin 56 (a frame of 70 plus 44 padding on the framed pages, so text there starts at 114). Archivo, heavy and condensed; the primary colour as a field; highlight bars, stickers, hard shadows and turned boxes. | all seven kinds, nine compositions (below) |

Retail's nine compositions, ported from the owner-approved prototype. `words` is the most characters a field holds (the prototype's
longest copy that holds, tested on every composition); beyond it the page may be refused with "shorten the headline to about N
characters". Each kind is a variant list; a post that names no variant gets one by hash.

| Composition | Kind | Page | Words (characters) | How it fits |
|---|---|---|---|---|
| `statement/0` Stack | statement | primary field; the headline stacked, every line sized to the width and centred in the height, the emphasis on a turned bar; rule, dot and brand name at the foot | headline 65, sub 110, label 28 | `fitLines`, 5 lines at most, floor 80 px, cap 230 px |
| `statement/1` Mantra | statement | the first part of the headline repeated as outline rows, the emphasis once, solid, on a bar; the sub on a light band with an accent edge | headline 60, sub 130 | rows sized to the width, as many as fit; floor 56 px. **Needs a first part of at most 22 characters**, else `statement/0` is drawn (note: "does not take these words") |
| `figure/0` Price tag | figure | a hole and label like a hang tag; the figure huge, turned 3 degrees, with a hard shadow; the unit on an accent block; the sub on a light band | big 8, unit 24, label 28, sub 125 | numeral `fitLines`, cap 520 px, floor 150 px; the label is set at 34 px so the page keeps three levels of type |
| `list/0` Blocks | list | the headline from the top margin (under the label, if any), then an accent edge and the items as full-width rows that share all the remaining height, each with a turned number block | headline 44, items 44, label 28 | headline steps 140, 126, 115 px by length; rows flex; the numbers are set at the item size (three levels) |
| `quote/0` Shout | quote | light card in a primary frame; a big accent mark, the quote and the source on a turned bar, one block centred in the card | quote 145, by 40 | quote steps 164, 140, 120, 104, 92 px by length |
| `photo/0` Frame pop | photo | the picture in a primary frame, a light block turned 2 degrees with a hard shadow across its foot, a round sticker for the tag | headline 68, sub 120, tag 16 | headline 104 px; the block grows upward; the tag sized to the sticker (floor 40 px) |
| `photo/1` Seam | photo | the picture cut by a slanted primary field with a light edge, the text on the field, a pill sticker for the tag on the seam | headline 66, sub 130, tag 16 | headline steps 126, 113, 103 px by length; the seam rises with the step |
| `event/0` Poster band | event | the picture under a light band turned 4 degrees with a primary edge; headline, meta, sub; an accent date tile | headline 50, meta 40, sub 62 | headline steps 116, 104, 95 px by length (the date numeral follows it). **When the headline takes three lines the sub is left out** (noted in the render's notes) |
| `offer/0` Sticker | offer | light card in a primary frame; headline at the top, then a turned photo card with a hard shadow, a big stamp for the tag overlapping both, the sub beside the card | headline 60, tag 16, sub 100 | headline steps 150, 135, 123 px by length (larger when short); sticker and sub share the left column, and when the stage is too short for both the fit loop shrinks the headline to 82%, then refuses |

Retail draws no `label` on the Mantra, Shout, Frame pop, Seam, Poster band or Sticker; a post that gives one gets the warning that it
is left out. The date tile of the Poster band reads a day and a month from the first part of `meta` ("12 Dec", "Sat 12 December",
"Dec 12"; the month in three letters); any other first part is set in the tile as it is.

### Declining content

A composition may declare `accepts(spec)`. When the chosen variant (named, or chosen by hash) returns false for the post, the next
variant of the kind is used, wrapping round, and the render's notes say which one was drawn instead; when none accepts it, the post
is refused. Retail's Mantra uses it for its 22 character rule.

### What the engine checks on a post

Every check of the other templates still runs unchanged: text fit, contrast measured on the pixels behind the text, the
pixel size and the loaded fonts. A post adds four, measured by the page itself (`postMetrics` in `lib/design/runtime.mjs`) and
judged by `findPostProblems` in `lib/design/checks.mjs`, with the numbers in `POST_LIMITS`. A failed check refuses the render
with a sentence that says what to change.

| Check | Rule |
|---|---|
| Emptiness | The largest rectangle that no text, picture or deliberate filled device covers is at most 45% of the page. A composition may declare a calm area (`calm: { maxShare }`, above 0.45 and up to 0.8) and is then held to that. |
| Scale | The headline (or the big numeral) is at least 2.6 times the largest body text, judged at the size it was designed for, before the fit loop shrank it. |
| Levels | At most three sizes of type, sizes within 2 px counting as one. A headline fitted line by line counts as one level. |
| Grid | Every text block's left edge (or right edge, or centre) sits on the margin, a column line or the page centre, within 2 px. A block marked `data-grid="skip"`, and a block inside `data-deco`, is not judged. |

Two rules about fit. A post's headline may shrink to 82% of its designed size (`POST_MIN_SCALE` in `render.mjs`); below that
the render is refused with "shorten the headline to about N characters", an estimate from how much of it fitted. And a
headline set by `fitLines` (a headline stacked so that each line fills the measure) is sized line by line between a `floor` and
a `cap`; if the words would need a line smaller than the floor, or more lines than the box allows, the render is refused with
the same kind of character estimate. Nothing is squeezed past these limits, and no check is weakened to make a picture pass.

### Contrast of large display type (`contrast.display`)

On a post (a direction or a look page) the contrast check holds text to a target chosen by its **rendered size**, not by its role alone.
Text that is at least **64 px** on the 1080 px wide feed canvas (`LARGE_DISPLAY_PX` in `lib/design/checks.mjs`; about 24 CSS px at
phone size, the large-text threshold of the accessibility standard) at a weight of 400 or more, and whose role is a headline, a
big figure (`stat`), an accent phrase or a label (a fitted headline and a sticker's words included), is judged against the brand's
`contrast.display`. The same role set smaller keeps its own target (`contrast.headline` 7:1 for a headline or figure, the body
target for body roles, `contrast.label`/`accent` as before), so a headline the fit loop shrinks under 64 px must then meet the
stricter target (`postContrastNeed`).

`contrast.display` is a number from 3 to 7, 4.5 when absent; `validateBrand` refuses anything outside it, so 3:1, the minimum for
large text, is a floor. It is a brand accessibility setting, not a design setting: a look cannot carry it, and classic layouts and
every other role are untouched. The palette of a post page (`colour.mjs`) uses it instead of the old hard 7:1: the brand's primary
colour stays the field as it is whenever the light or the ink reads on it at the target, and is deepened (by the smallest step that
passes) only when neither does. A composition that sets small body text directly on the field (`bodyOnField`: retail's Stack and
Seam) needs the stricter of the display target and `contrast.sub` there, so its field is deepened as before; a low-contrast accent
still never becomes small text. The Settings form needs a control for it ("Contrast for large headlines": Standard 4.5, High 7, or
a custom value from 3 to 7, with a note under 4.5); the web app does not have it yet.

### Fonts

The engine ships the families the directions use, under the SIL Open Font License 1.1, with the licence text (`OFL.txt`) in each
folder under `packages/engine/design/fonts/`: Fraunces (variable, weights 300 to 600, normal and italic), Source Serif 4
(400, 600, and 400 italic), Hanken Grotesk (400 to 800), JetBrains Mono (400 to 500) and Archivo (variable weight and width).
Inter and IBM Plex Mono were already there. Files are woff2, `latin` and `latin-ext` subsets only. `fonts/library.json` lists
each file, and `fonts/README.md` gives each family's source URL, the fetch date, the axes and the file sizes; `libraryProblems()`
(`lib/design/font-library.mjs`) checks that every listed file exists and is a woff2. A page embeds only what it uses: the faces
of the roles its composition draws in, the `latin-ext` file only when a character of its words needs it, each as one
`@font-face` with a `data:` URI under an alias (`VF Fraunces`, so a brand's own fonts of the same name never clash). A brand
that supplied its own display or label font keeps it; the direction supplies the other roles.

### Adding a composition

A composition is trusted engine code, in `lib/design/directions/<direction>/compositions.mjs`, which exports
`COMPOSITIONS = { <kind>: [composition, ...] }`; the index of a kind in its list is its `variant`. Everything about the
direction as a whole (margins, grid, fonts, type scale, devices, the folio format) stays in its `tokens.mjs`; its stylesheet is
`design/directions/<direction>.css`, loaded after the shared `kit.css`. A composition is an object:

| Field | Meaning |
|---|---|
| `id` | `<direction>/<kind>/<variant>`, which must match its place (the registry check refuses a mismatch or a duplicate) |
| `name`, `describe` | a short name and a sentence on what is where |
| `fields` | the spec fields it draws |
| `words` | the most characters per field it is designed for |
| `ground` | the page colour: `paper`, `field`, `dark`, `accent` or `soft` |
| `calm` | optional `{ maxShare }`, a deliberate empty area (see Emptiness) |
| `fit` | optional `{ pad, top, bottom }`, the margins the fit check holds text to (default: the direction's margins) |
| `dark` | optional, true when the page is dark, so the logo (if switched on) is the inverse one |
| `roles` | optional, the font roles it uses (`display`, `text`, `label`, `mono`; default all); only those faces are embedded |
| `accepts(spec)` | optional; false when the composition cannot draw this content, so the next variant of the kind is drawn |
| `render(ctx)` | returns `{ html, classes? }`; `classes` may use lowercase letters, digits, space, `-` and `_` only |

`render` receives the context built by `makeContext` in `lib/design/directions/kit.mjs`. All positions are in feed pixels.

- **Grid**: `col(i)`, `colR(i)`, `span(a, b)`, `gridLines()`, and `margin`, `grid`, `W`, `H`, `tokens`.
- **Words** (the only way spec text reaches the page): `has(f)`, `chars(f)`, `text(f)` (escaped, one line), `fmt(f, { highlight })`
  (escaped, `*phrase*` as emphasis, `\n` as a break, optionally on a highlight bar), `items()`, `brand`, `labelOrBrand()`,
  `folioText()`.
- **Type**: `type`, `label`, `body`, `display` (size-dependent tracking and leading), `fitLines` (each line as large as fills the
  width, between `floor` and `cap`), `group` with `flow: true` blocks, `flowBlock`, `folioMark`, `verticalLabel`.
- **Boxes and shapes** (generic): `box` (a container: fill, ink, `rot` with `origin`, hard `shadow`, `ring`, `border`, `pad`, `radius`, `clip` polygon, `flex`, `flow`, `grow`; a turned box carries `data-tilt`, so its text is measured in slices along its own direction), `band` (a turned full-width slab with overscan), `shape` (`circle`, `pill`, `tile`, `stamp`), `run` (a text run inside a box or shape), `echoStack` (a phrase repeated as outline rows around one solid row). `fitLines` also takes `valign`, `role`, `what`, `trail`, `flow` and `key`; a sub line with `data-dropsub="key:n"` is left out when the headline with that key sets in n lines or more; `fmt` takes `breakBefore`; `emphasisParts` splits a headline around its emphasis.
- **Devices and pictures**: `rule`, `block`, `sticker`, `highlight`, `wordmarkPattern`, `frame`, `keyline`, `photo` (shapes
  `rect`, `circle`, `arch`, `rounded`; treatments `grey`, `multiply`, `grain`), `print` (a framed print), `logoHtml`.
- **No free strings.** No builder takes a style, a class or an attribute written by a composition (`extra`, `cls` and `attrs` are refused).
  What they stood for is a validated parameter: `variant` (a name from the direction's `tokens.variants` or the kit's, mapped to a
  class), `nudge: { x, y }` (margin, within 96 px), `flexNone`, `alignSelf`, `minH`, `slant`, `split`, `band`, `key`, `follow`,
  `dropSub: { key, lines }`. Sizes and room are measured on the page, not estimated from a number of characters: `steps` (a ladder,
  largest first) with `maxLines` and/or `maxH` sets a text at the largest step it fits at; `fitLines` takes `h: 'auto'` (the height of
  its own flex slot) and `w: 'fit'` (its own natural width, between `minW` and `maxW`).
- **Element addresses.** Every element a builder makes carries `data-el`, its index path among the addressed elements (digits and
  dots, document order; `numberElements` in the kit), and the runtime's `postMetrics().els` lists a rectangle for each one. `renderImage` returns that list as `els` for a `post` (the web app's design editor reads it), and `designBlockProblems` holds a `post` to the brand's own look (`loadLook` in `lib/design/brand.mjs`: the entry of `brand.looks` that `style.direction` names) when it has one.
- **Palette contract.** `palette(brand, need)` returns colour roles only (every value `#rrggbb` or `rgba(...)`); the non-colour facts
  of the derivation are `paletteFacts(brand)`: `{ accentInk: boolean, accentShift: number }`.
- **Colours** are names, never literals: `paper ink white dark primary field on-field gold gold-deep accent accent-dark
  on-accent on-primary body soft muted body-dark muted-dark rule rule-soft rule-dark rule-field accent-type body-field field-deep paper-warm light-tint field-text` (`COLOUR_NAMES` in the kit). `onColour(bg, light, dark)` picks the type colour with more measured contrast on a field, and `textSafe` moves a colour toward the ink until it reads on a ground.
  `lib/design/directions/colour.mjs` works them out from the brand's own colours and deepens any that must carry type until it
  meets the brand's contrast target.
- **Data attributes** the checks read, written by the helpers: `data-role` (what a text is: headline, stat, sub, item, label,
  meta, folio, accent), `data-scaled` (a text the page scales with the headline), `data-grid` (`left`, `right`, `center`, `skip`), `data-fill` (a deliberate filled device, which counts as
  covered for Emptiness), `data-deco` (a texture, not type), `data-bleed` (an edge a block may leave the page by) and
  `data-calm`.

**The untrusted-text rule applies to compositions.** The words of a post may come from a program working from web research.
A composition never writes a spec value into HTML itself. Markup is a class (`Markup`) that only `ctx.fmt()`, `ctx.text()`,
`ctx.items()`, `ctx.brand` and the tag `m` (`` m`<b>${x}</b>` `` escapes every value) produce; every builder that takes HTML
refuses a plain string, and positions, sizes and colour names are checked (finite numbers, names from the list, class names
from a fixed alphabet). Never write a raw `${spec.x}` in a composition (rule 11 in `AGENTS.md`).

To try a composition, add its entry to the list, then run `npm test`; `test-design-directions.mjs` checks the registry, the
fields, the hostile-text cases, the checks, and (with Chrome) that every composition renders and passes every check. To look at
it, use the contact sheet:

```sh
node packages/engine/scripts/direction-sheet.mjs [--content file.json] [--brand brands/demo] [--directions editorial,swiss,retail]
     [--kinds statement,figure] [--variants all|0|0,1] [--name "Brand name"] [--out out/directions] [--thumb 400]
```

It draws the same designs in every direction with one brand pack, writes `out/directions/<direction>/<kind>-<variant>.jpg`
and one labelled `out/directions/sheet.jpg` (rows are kinds and variants, columns are directions; a direction without a variant
shows a gap, a refused design shows the reason). The default content, `packages/engine/testlib/direction-sample.json`, is a
fictional coffee roaster with one design per kind and only the synthetic demo pictures. The tool needs Chrome, runs one Chrome at
a time, and writes only under the repository; `out/` is ignored by git. Look at every picture it writes.

## What is weak or unverified

- The phone glow is placed by fixed numbers per template, checked only for contrast; a very long headline next to it is shrunk, not
  moved.
- Poster photos: the plain-or-scene call is made from three strips of pixels, calibrated on one brand's photo library
  (`EDGE_LIMITS` in `lib/design/edge.mjs`, checked on real files by `test-design-edge.mjs` when they are present). A photo near a limit (a pale desk with a soft shadow
  at the top) can go either way: look at every image, and move the crop with `focal` if it matters. A treated photo is judged
  on its treated pixels with the same limits, which were calibrated on untreated photos; a treatment that greys a scene (a
  duotone) can make its edge plain. A card always shows the whole
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

## Looks as data: the schema

A design direction (editorial, swiss, retail) is engine code today. A **look** is the same thing written as data, so that it can be
shown in the panel, copied, edited and checked without a developer: the tables, the validator, the catalogue the panel draws its controls
from, the brief the AI and the post editor read, and the renderer that draws a look (`directions/interpret.mjs`, the primitives). The
engine's own retail, swiss, soft, bloom and clean looks are shipped in this format (`lib/design/looks/*.look.json`), and the classic layouts (`layout.mjs`,
Settings, Layouts) are untouched. All of it is pure (no Chrome) and lives in `packages/engine/lib/design/`:

| File | What it holds |
|---|---|
| `look.mjs` | the public API: `validateLook`, `validateLooks`, `lookCatalogue`, `lookBrief`, `normaliseLook`, `lookHash`, and the defaults |
| `look-elements.mjs` | the tables: kinds and fields, fixed lists, limits, the common properties, the element types, the look-level sections |
| `look-validate.mjs` | `validateLook`: guard pass, descriptor-driven checks, placement, composition rules |
| `look-desc.mjs` | the descriptor builders and the fixed lists the tables are written with |
| `look-static.mjs` | the static design checks (they need no picture) |

Two partial sample looks, `packages/engine/testlib/looks/retail.sample.json` (Frame pop, Stack, Mantra, Blocks) and `swiss.sample.json` (Grid photo,
Poster, Rows), are test fixtures only; the shipped looks are the full ones (see "The shipped looks and the engine's hooks"). `test-design-look.mjs`
holds the fixtures, the catalogue and the validator together.

**What a look is.** `{ schema: 1, id, name, description, origin, canvas, fonts, type, colour, devices, photo, logo, dials, compositions }`.
The sections hold numbers in bounds and names from fixed lists: `canvas.feed` (margins, a grid of 1 to 24 columns, a gutter, rows, the
height of a top label row, extra text lines), `fonts` (four roles, each a library family with its weights, or the brand's own font),
`type` (display, body, item, label and numeral styles), `colour` (the logic, the field colour, the sticker colour, whether the accent may
be type, which page colours compositions may use), `devices` (rules, frame, highlight bar, hard shadow, six named angles, the top label
row, the folio, the brand-name pattern), `photo`, `logo` and `dials` (tilt 0 to 1.5, density, weight shift). A look names **no hex
colour, no CSS font name, no asset path, no URL, no brand id**: colours are palette roles, families come from `design/fonts/library.json`.
`origin` is `"shipped"` (only the engine's own looks, `validateLook(look, where, { shipped: true })`) or `copy:shipped:<id>` / `copy:own:<slug>`.

**A composition** is `{ kind, name, describe, ground, fields, accepts?, calm?, fit?, elements }`. `kind` is one of the seven post kinds;
`fields` names the post fields it draws, each with `required` and `max` (never above what a post allows, and the kind's own required fields
must be required); `accepts` holds rules on the words it can draw (`{ field, part: all|pre|phrase, maxChars }` or `{ field: "items", min, max }`),
and when they fail the next variant of the kind is used. Its id is derived, `<kind>/<index>` among the look's compositions of that kind, never
stored. At most 21 compositions, at most 3 of a kind.

**The elements** (a composition's `elements` is a tree: at most 40 elements, at most 4 levels deep):

| Type | What it is |
|---|---|
| `box` | A container; items flow in it in a column or a row, or sit at places of their own; fill, padding, shadow, turn |
| `text` | A field of the post (or the brand name, the folio, an index) in one of the look's type styles; part, split, format, size or size ladder, emphasis |
| `fitted-stack` | A headline sized by the page to fill its box: `lines`, `fill` or `block` |
| `numeral` | A figure or date as large as the width allows, with an optional unit |
| `mantra-rows` | The first part of the headline repeated as outline rows, the emphasis once, solid |
| `rows` | One row per list item (or event part): number, tile, alternating fills and turns, rules. One per composition |
| `photo` | The post's picture: rect, circle, arch, rounded, card or print, with treatments |
| `seam` | The page cut by a slanted edge (picture or colour above, a colour role below); items flow in the colour below and one sticker may sit on the edge |
| `band` | A turned full-width band (wider than the page, so its ends never show) |
| `sticker` | A circle, pill, tile, stamp or seal carrying a short field or text items |
| `rule`, `block`, `frame`, `keyline` | Lines, solid blocks, the page frame, a thin outlined box |
| `glyph` | A decorative mark from a fixed list (opening and closing quotes, `&`, `№`, arrows) |
| `meta-row` | The top label row, built from the look's own cells |
| `wordmark-pattern`, `scrim`, `punch-hole` | The brand name as texture, a dark fade behind text over a picture, a punched hole |

Common to most: `place` (exactly one of a grid position, pixels, an anchor, or an inset of the page, margins or frame; a flow child of a
box has none), `bleed`, `rot` (a named angle or -15 to 15), `origin` or `originPct`, `skew` (a plain block only), `z`, `when` (`{ present }` / `{ absent }`), `fill`, `ink`,
`shadow`, `ring`, `border`, `pad`, `radius`. Lengths are a bounded number or a token (`margin`, `gutter`, `col`, `frame`, `frame+pad`);
there is **no arithmetic, no reference between elements and no free string** (only `name`, `describe` and `description` carry text, one line, no
control characters). A key named `render`, `__proto__`, `constructor` or `prototype` is refused anywhere. `lookCatalogue()` lists every
element, property, range and fixed list with a label and a line of help in plain words; the validator is driven by the same tables.

**Properties that join others.** Each is a table entry, so it is in the catalogue and refused value by value like the rest; the rules that
need two properties are listed here.

| Where | Property | Rule |
|---|---|---|
| any element that lists it (`box`, `text`, `fitted-stack`, `numeral`, `mantra-rows`, `rows`, `sticker`, `rule`, `block`) | `before` | Whole pixels -40 to 120 of extra space above an item flowing in a box, on top of the box's gap. Like `grow`, `minH`, `w` and `h`, it is refused on an element placed at the top of a composition and on a child that has a place |
| `place` | `minH` | Whole pixels 0 to 600, with any form of place: the least height of what is placed (a box grows with its content). The static checks take it as the least extent |
| `place` | `square` | A grid place only. When true the height is the width (a `w` modifier, else the columns); with rows, `alignY: "bottom"` puts it at the foot of its rows, `center` in the middle, otherwise at the top. A square place may not also give `h` |
| `text` | `track`, `lead`, `font` | Letter spacing in em (-0.1 to 0.3), line height as a multiple of the size (0.8 to 1.6) and which of the look's fonts (`display`, `text`, `label`, `mono`); left out, the style's own |
| `text` | `weight` | A whole number 100 to 900 that the font of its role lists in `fonts.<role>.weights`: its own `font`, else the style's (display and numeral use `display`, body and item `text`, label `label` or `mono` as `type.label.role` says). Checked only for library fonts, as the type weights are |
| `text` | `dropWhenTight` | Leaves the text out when the composition's headline sets in three lines or more. At most one text of a composition may set it, and the composition needs another headline `text` (field `headline` or `quote`) or a `fitted-stack` on the headline to measure |
| `text`, `sticker` | `ladder.maxLines`, `ladder.maxH` | Optional: the page measures the words and takes the largest step at which they take at most `maxLines` lines (1 to 8) and are at most `maxH` pixels tall (40 to 900). The ladder rules (shortest text first, sizes never grow, the last step reaches the field's maximum) still apply |
| `text`, `numeral`, `glyph` | `textShadow` | `"hard"` (the look's hard shadow, no more needed) or `{ x, y, colour }`: a hard shadow behind the letters, no blur |
| `fitted-stack` | `maxLines` | 1 to 8; at most 5 in `lines` mode, 6 in `block` mode, up to 8 in `fill` mode |
| `fitted-stack` | `lead` | Line height 0.78 to 1.2, `lines` mode only; left out, the headline line height of the look. `h` and `minH` are allowed on a block-mode headline in a flow; nothing requires them |
| `numeral` | `cap`, `min`, `sizes`, `family`, `weight`, `format` | Either both `cap` and `min`, or `sizes` (1 to 8 whole numbers 24 to 900, each smaller than the one before), never both. `family` is `display` (default) or `mono`; `weight` is one the font of that role lists. The least height is `min`, else the last size. `format` is honoured for both fields (`pad2`, `roman` read the first digits; a date format needs `field: meta`, and a meta numeral needs a format) |
| `sticker` | `w` | A number of pixels 40 to 900, or `"hug"`: as wide as its words, between `minW` and `maxW` |
| `sticker` | `minW`, `maxW` | Whole pixels 40 to 900, only with `w: "hug"`, `minW` at most `maxW` |
| `sticker` | `fit` | `{ cap, floor, w?, h?, maxLines? }`: the page sizes the words of the sticker's `field` to fill a box, line by line (`floor` at most `cap`, `maxLines` 1 to 4). Only with a `field`, and never with `ladder` or `textSize` |
| `sticker` | `w: "hug"` rules | A hugging sticker is a `pill`, carries a `field`, has `fit`, and has a height (`h` or `size`) |
| `sticker` | `pad` | The space inside it, as for a box |
| `seam` | `leftY`, `rightY` | `leftY` must be more than `rightY`: the edge rises to the right (the renderer draws only that) |
| `seam` | `lower` | A colour role the panel can be filled with (the same list as `fill`), not a page colour name. Ink on the seam and on its items is checked against it |
| `seam` | `edge`, `gap`, `ink` | The thin edge in pixels, the space from the edge's lowest point to the words, and the ink of the items |
| `seam` | `children` | Items that flow in the colour below the edge, like the flowing children of a box: they take no `place` and no `z`, count as text on the seam's colour (no picture needs to back them) and may use `before`, `w` and the like |
| `seam` | `sticker` | At most one `sticker` element, given as the seam's own property (not in `children`). It is checked like any sticker and counts as an element, one level below the seam; its `place` is required and is an `anchor` or `px` place measured from the top edge of the split (a negative `top` lifts it above the edge); it takes no `z`. `normaliseLook` fills its defaults and `lookCatalogue()` lists it under the seam's `slots` |
| `type.display` | `wordSpace` | Extra space between the words of headlines, 0 to 0.2 em (default 0) |

**What `validateLook` refuses** (every message says where, quotes only a short plain value, never echoes other input, and is at most 200
characters): unknown keys at every level, wrong types, out-of-range numbers, values outside a fixed list, a family not in the font
library or a weight or width the family lacks, fields a kind does not have, and the static design checks: each required field shown in
every branch of the conditions (the same way of showing a field twice is refused), at most three type levels (sizes within 2 px are one; a
fitted headline counts as one), ink and fill pairs from a table, at most three turned elements, text turned at most 8 degrees outside a
sticker, text over a picture only with a filled box under it or a dark fade between, and an element running to a page edge only where it
touches that edge (a numeral aside). The render-time checks (fit, contrast, enlargement, pixel size, the four post checks) still run on
the pictures.

**The rule for growth.** No expressions, no references between elements, no free strings. A new capability is a named primitive with a
parameter table of at most about eight validated parameters (a new entry in `ELEMENTS`, and later `directions/primitives/<name>.mjs` with its
CSS and runtime hook), never a new kind of value in an existing property.

**Limits.** 21 compositions, 3 per kind, 40 elements, 4 levels, description 300 characters, a serialised definition 256 KB, 20 looks per brand
(`validateLooks`, ids unique). `normaliseLook` returns a deep-frozen copy with the documented defaults filled and the ids derived; `lookHash` is
the sha256 of its canonical JSON (a look written with its defaults and one without hash the same); `lookBrief` gives the kinds, variants,
fields and budgets the AI and the post editor read.

### The renderer: drawing a look from data

`lib/design/directions/interpret.mjs` draws a composition of a look with the kit's builders (`kit.mjs`): `renderComposition(look, comp, c)`
returns the same `{ html, classes }` a code composition returns. A look is validated first (`validateLook`), normalised (`normaliseLook`) and
only then drawn; `resolveLook(look, { shipped })` in `directions/index.mjs` does both, memoised by the content of the look (no state per
brand), and `renderPostWithLook(look, spec, ctx, { shipped })` draws a post with it, refusing an invalid look with "this look cannot be
drawn" and the validator's problems. `renderPost` uses it when the brand object carries `looks` and `style.direction` names one of them
(an own look's origin is `copy:...`; only the engine's own shipped looks are `shipped`). A brand file carries `looks` (see "The shipped looks and the engine's hooks").

How the data becomes the page:

| Element | Drawn with | Notes |
|---|---|---|
| `box` | `c.box` | flow children get no place of their own (`flow: true`); `align: stretch` is the kit's `align-items: stretch`; `rot` turns the box and holds it straight while fitted lines inside it are measured |
| `text` | `c.display` (display), `c.body`, `c.label`, `c.type` (item, numeral), `c.run` inside a sticker | `data-role` comes from the field (`headline`/`quote` headline, `big` stat, `sub` sub, `items` item, `label`, `by`, `tag`, `unit` label, `meta` meta, folio, brand) and is never chosen; a ladder becomes the runtime's measured `steps` (the largest step that fits `maxLines` and `maxH`), the characters in a step are only for the editor |
| `photo` | `c.photo`, `c.print`, a box for card, turn, shadow or ring | treatments from the element or the look; `punch` is a kit class |
| `sticker` | `c.shape` with fitted or stepped words | `fit` is a fitted tag (`c.fitLines`), `w: "hug"` leaves the shape as wide as its words |
| `rule`, `block`, `frame`, `keyline`, `glyph` | `c.rule`/`c.flowBlock`, `c.block`/`c.box`, `c.frame`, `c.keyline`, `c.glyph` | |
| primitives | `directions/primitives/<name>.mjs` | see below |

`place` is resolved to pixel numbers with the look's canvas: grid cells (`col`/`span`, `row`/`rowSpan` with the top label row `head`,
`alignY`, `square`, `w`/`h`/`dx`/`dy`/`minH` modifiers), pixels, anchors (both sides of an axis give a size), `inset` page, margins or
frame, and the length tokens `margin`, `gutter`, `col`, `frame`, `frame+pad`. `rot` is a number or a name from `devices.angles`, scaled
by `dials.tilt`. `data-grid="skip"` is written only for a turned element or one inside a turned box or a shape; a look's own text
lines (the frame inset, `extraLines`) are what the grid check holds text to. `data-el` index paths come from the kit.

**Tokens from the look** (`directions/look-tokens.mjs`, `tokensFromLook`): the token object the kit and the checks read, from the look's
canvas, fonts (library families with their fallback stacks and metrics from `design/fonts/library.json`, or the brand's own roles), type
scale, devices and angles. Font files embedded are the union of the weights the composition's elements use (`fontUsage`), at most the
files the manifest has. Colours are palette roles (`palette()` with the brand's display contrast target); `colour.logic: one-accent`
sets the accent as type only where the brand's contrast targets allow (`accentPlan`, as the swiss direction did).

**One stylesheet**: a look's page loads the `kit` sheet only. Its look-wide values reach the page as numeric custom properties on the root
(`--k-dstretch`, `--k-dcase`, `--k-dword`, `--k-hl-top`, `--k-hl-h`, `--k-hl-pr`, `--k-hl-pl`, `--k-hl-tilt`) and as enum classes
(`k-look`, `k-em-i`, `k-em-a`, `k-punch`, `k-v-fill`, `k-dfont`). `retail.css` stays for the code oracle until it is deleted.

**Checks apply unchanged**: fit, contrast, enlargement, pixel size and the four post checks run on the same markup. One change: a headline
pulled left by its first letter's side bearing (`data-optical`) has its ink on the margin, so the fit check lets its box stand that far
outside the margin.

**Primitives and their parameters** (the tables in each module are the ones the validator and the editor read):

| Primitive | Parameters |
|---|---|
| `fitted-stack` | `field`, `mode` (lines, fill, block), `cap`, `floor`, `maxLines`, `gapEm`, `lead`, `valign`, `emphasis`, `emphasisOwnLine`, `trail`, `stretch`, `padBelowEm`, `sizes`, `align` |
| `numeral` | `field`, `format`, `cap`, `min` or `sizes`, `family`, `weight`, `baselineAt`, `unit` |
| `mantra-rows` | `field`, `rmin`, `rmax`, `cap`, `floor`, `outline` |
| `rows` | `each`, `number`, `numberStyle`, `numberSize`, `numberTile`, `numberSpan`, `textStyle`, `textSize`, `textTrack`, `altFill`, `altRot`, `rule`, `ruleEnd`, `sizeByCount`, `firstAccent`, `gap`, `rowMinH`, `valign`, `keys` |
| `seam` | `leftY`, `rightY`, `edge`, `upper`, `lower`, `edgeFill`, `gap`; children flow in the colour below, optional `sticker` slot |
| `band` | `y`, `h`, `gap`, `rot`, `origin`, `fill`, `ink`, `pad`, `shadow`; children flow in it |
| `meta-row` | `tone`; the cells come from `devices.metaRow` |
| `wordmark-pattern` | `size`, `altItalic`, `fade`, `fadeFrom`, `colour` |
| `scrim` | `need`, `floor`, `cap`, `fade`, `colour` |
| `punch-hole` | `size` |

**What the schema grew to draw the two full looks.** Each is a table entry (catalogue, validator, fuzz) with a bounded value and a rule; none is an
expression, a reference or a free string. A property that validates has an effect: what the renderer does not draw is refused or not in the schema
(`shrinkFloor`, a photo's `caption` and a box's `skew` were removed; `skew` is drawn on a plain block; `bleed` is refused unless the element is at the top of
the composition and its place gives left, top, width and height; `origin` and `originPct` need `rot`).

| Where | Property | What it does |
|---|---|---|
| any flowing item | `alignSelf` (`start`, `center`, `end`, `stretch`) | how one item lines up across its box, whatever the box says for the others (the offer's column of stamp and sub stretches to the card's height) |
| any flowing item | `before` -40 to 120, `nudgeX` -120 to 120 | a small negative number pulls an item up; `nudgeX` moves it across |
| `box`, `sticker` | `originPct` `[x, y]` percentages 0 to 100 | the turning point as percentages (the price tag turns about 30% 50%); `origin` (the nine names) is mapped to the kit's origins; not both |
| `fitted-stack` | `field` may be `tag` or `big` too | the tag of the swiss offer and the figure of the retail price tag are fitted type (`big` takes the look's numeral tracking) |
| `fitted-stack` (lines) | `trail`, `stretch` 50 to 150, `padBelowEm` 0 to 0.3, `textShadow` | a negative tracking keeps its trailing space inside the width; the font width of this text; room under each line; a hard shadow |
| `fitted-stack` | `emphasis: accent` or `italic` | on `fill` and `block` headlines too: the emphasised rows take the accent (`.k-em-a .fb-em`) |
| `text` | `tiltBar` | a label line set on a bar in the accent colour turned by the look's highlight turn (a quote's source); its padding follows the size |
| `text` | `follow` | inside a sticker, the text takes the size the composition's headline is set at (the date of a poster follows its headline) |
| `text` | `format: not-date` | the first part of the meta line, only when it is not a date (the tile's fallback); `format` and `split` are not given together |
| `sticker` | `stretch` | the font width of the fitted words (84% for the retail stickers); `fit` now needs `h`, and `w` unless the sticker hugs |
| `glyph` | `stretch` | the font width of the mark |
| `numeral` | `weight`, `baselineAt: box` with `sizes` | the date numeral in mono 500; its baseline on the foot of its box |
| `rows` | `valign`, `ruleEnd`, `sizeByCount`, `textTrack`, `numberSpan` with `keys` | words at the top of tall rows; a rule closing the last row; smaller words from so many items on (`[[5, 44]]`: five points are set at 44 px, the number follows); letter spacing of label words; the key labels of an event table in their own columns |
| `rows` | each row grows only when the rows element has `grow` | a table of natural height no longer collapses |
| `seam` | `upper: photo` | draws the picture full page behind the slanted field |
| `devices.highlight` | | the highlight pad of retail is `[0.09, 0.12, 0.04, 0.12]` |

**Dark pages of a one-accent look (swiss).** A page on the dark ground keeps it only when the brand's accent reads on it (`accentPlan`): when it does
not but reads on paper, the page takes the light ground and every dark-page colour turns into its light-page one (`white` to the ink, `dark` and `field` to
paper, `on-field` to the ink, `body-dark` and `muted-dark` to the light greys), so the accent logic holds for any brand.

### The shipped looks and the engine's hooks

`shippedLooks()` (`directions/index.mjs`) returns `{ retail, swiss, soft, bloom, clean }`: the full looks of `lib/design/looks/*.look.json` (nine compositions each: two
statements, a figure, a list, a quote, two photos, an event and an offer), read once, validated with `{ shipped: true }`, deep frozen. Retail and swiss are the
data counterpart of the code directions of the same name: retail is held to the code (the same budgets, names and grounds; geometry within 3 px of the
code compositions in `test-design-look-equivalence.mjs`, with the deviations listed there: the roles of the unit and the date tile, and the wrapping
highlight bar 0.12 em against 0.13 em); swiss is held to the approved prototype by eye. Soft (one sans in medium weights on pale tints of the brand colour, the logo top
left and the web address top right, rounded panels and pills, pictures that melt into a page sampled from their own edge, a myth and fact page and a big
figure over a rounded panel) bloom (a serif with italics, arch, oval and circle windows, keylines and dotted rules) and clean (the classic poster pages as a look: the brand's own
fonts, two-tone headlines, a picture melting into a page sampled from its edge, myth and fact on rounded cards on the dark page) exist only as data.
`test-design-look-retail.mjs`, `test-design-look-swiss.mjs`, `test-design-look-soft.mjs`, `test-design-look-bloom.mjs` and `test-design-look-clean.mjs` accept no problem at all from the
validator, and `test-design-look-equivalence.mjs` draws all five from sample, stress and minimal copy in three sets of brand colours through every check.
The retail price tag (figure/0) sets its figure as large as the stage allows (up to 930 px, centred) with the unit fitted on a full-width accent block
under it, in the code composition and the look alike. A folio is written only from the post's real place (its position in its batch, or a carousel
page's); without one a page has no folio, never a number made up from the words or the date. The partial `testlib/looks/*.sample.json` stay as test fixtures.

Where swiss differs from the prototype: the offer has the tag block top right in four columns and three rows with the headline at the foot (the
three-type-level rule: headline and tag are both fitted type), where the prototype puts the tag block bottom left; headlines are set in balanced lines
(the prototype leaves them ragged); a list takes three to five items and sets five at 44 px; the list numbers are muted grey where the prototype's are
the ink; photo/0 accepts a headline of up to 56 characters (else the Bar is used); the empty page the style is made of is declared as `calm` (0.55 to 0.75
of the page) on the six compositions that can be sparse. The swiss minimal copy (`testlib/swiss-copy.mjs`) and the retail `MINIMAL_CHECKED`
(`testlib/retail-copy.mjs`) carry the least a post of the kind needs to pass the checks (the code retail refuses the bare fields of the figure and the
second photo too).

**Hooks (the engine's public names, for the web app and the AI library):**

| Name | Where | What |
|---|---|---|
| `shippedLooks()` | `@vesk/engine/design/directions/index` | the frozen shipped looks, raw data `{ retail, swiss, soft, bloom, clean }` |
| `resolveLook(raw, { shipped })` | same | `{ problems }` or `{ problems: [], look (normalised), comps }`, memoised by content, deep frozen |
| `renderPostWithLook(look, spec, ctx, { shipped })` | same | draws a post with a look written as data; any failure of the kit on a valid look is a `DesignError` |
| `postKinds(brand)` | same | `{ [kind]: { required, fields: { field: { max, budget? } or { min, max, chars } or {} }, variants: [{ variant, name, describe }] } }` for the brand's direction, a code direction or its own look, the same shape |
| `lookOfBrand(brand)` | same | the entry of `brand.looks` the direction names, or null |
| `lookBrief(look)` | same, and `@vesk/engine/design/look` | the kinds, variants, fields and budgets of a raw look |
| `validateBrand(raw)` | `design/brand.mjs` | validates `brand.looks` (at most `MAX_LOOKS` = 20, each through `validateLook`, problems prefixed `brand.json: looks[i]`, ids unique, origin `copy:...`) and accepts `style.direction` naming a shipped direction or the id of one of the brand's looks |
| `validateDesign(d, where, { look })` | `design/spec.mjs` | a `post` design held to the kinds, variants and budgets of a data look (`postProblems(d, where, { brief })`); without `look` the direction is looked up among the engine's |
| `validateLook`, `validateLooks`, `lookCatalogue`, `normaliseLook`, `lookHash`, `MAX_LOOKS` | `design/look.mjs` | as above |

`renderPost` still draws a code direction by its name; a brand look is drawn when the brand object carries it in `looks` and `style.direction` is its id.
`test-design-security.mjs` holds that a hostile look is refused by `validateBrand`; `test-design-look-hooks.mjs` holds the hooks.

**Drawing a look as a sheet:** `node packages/engine/scripts/direction-sheet.mjs --look packages/engine/lib/design/looks/retail.look.json,packages/engine/lib/design/looks/swiss.look.json
[--copy sample|stress|minimal] [--brand out/brand-a] [--content file.json] [--out out/lk/x]` draws every composition of the looks, one column per look;
with `--copy` each composition is drawn from the test copy written for it (`testlib/retail-copy.mjs`, `testlib/swiss-copy.mjs`; for soft and bloom pass
`--copy-lib testlib/soft-copy.mjs,testlib/bloom-copy.mjs,testlib/clean-copy.mjs`), without it from the
content file (the shipped looks are drawn as a brand's own copy). Tests: `test-design-look-render.mjs` (hostile text through every binding, the
style grammar, class and attribute sets, validation first, no Chrome), `test-design-look-equivalence.mjs` (Chrome: the data version of
all nine retail compositions against the code oracle within 3 px, and all 18 shipped compositions through every check, from three copies in three sets of colours), `test-design-look-hooks.mjs` (the engine hooks, no Chrome).
