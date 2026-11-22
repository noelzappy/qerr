# The AI library (`packages/ai/`, `@qerr/ai`)

No third-party dependencies, Node 20+, `fetch` only. It depends on the engine workspace (`@qerr/engine`) for the batch and design validators. It is the only way the Qerr web app talks to a model or a search
provider. Its interface:

```js
import { createAI } from '@qerr/ai';
const ai = createAI({ providers, search, budget, log, prices });            // config from the app's settings, keys already decrypted
await ai.draftBatch({ vault, series, period, count, channels, brand, timezone }); // -> { batch, notes }
await ai.research({ topics, vault, since });                                       // -> { items, checks, notes }
await ai.rewrite({ post, instruction, vault, channels });                          // -> post (with post.notes)
await ai.analyseReference({ image, note });                                        // -> { analysis, brief, notes }
await ai.suggestBrandFromSite({ website });                                        // -> { suggestion, source, notes }
await ai.describePicture({ image, hints });                                        // -> { suggestion, notes }
```

- `draftBatch` returns `batch`, the engine's batch JSON (see [batch-format.md](batch-format.md)) with a `design` block on
  each post, every post carrying `sources: [vaultItemId]` and `warnings: [string]`.
- `research` returns `items: [{ kind, title, body, sourceUrls, foundAt, status: 'unconfirmed' }]` and
  `checks: [{ vaultItemId, verdict, sourceUrls, note }]`.
- `rewrite` returns the post in the same shape as one post of `draftBatch`.
- All of it is untrusted output, validated against the batch format and the design spec validators before it is
  returned (see "Safety rules").

## Configuration

- `providers`: `[{ id, kind: 'anthropic' | 'openai-compatible', baseUrl, model, apiKey, tasks: ['draft','research','rewrite'], prices?, temperature? }]`.
  Keys arrive already decrypted. The first provider whose `tasks` lists the task is used. `openai-compatible` needs a `baseUrl`
  (it calls `{baseUrl}/chat/completions`); Anthropic defaults to `https://api.anthropic.com`.
- `search`: `{ kind: 'brave' | 'tavily' | 'exa', apiKey }`. Needed for `research` only.
- `budget`: `{ monthlyLimitUsd, spentUsd }`. Before every model or search call, `spentUsd >= monthlyLimitUsd` throws
  `AIError` with `code: 'budget'`. Spend is counted inside the instance from each call's estimated cost; `ai.spentUsd()` reads it.
  A research run that runs out of budget between topics returns what it has, with `notes.stoppedEarly`.
- `prices`: `{ "<model>": { inputPerMTok, outputPerMTok } }` in USD, supplied by the caller (or per provider). There are no built-in
  prices. A model without an entry has cost `"unknown"` in the log and adds nothing to the spend, so the budget cannot stop a run
  that uses an unpriced model. Set prices if you rely on the cap.
- `log(record)`: one record per model call, search call and page read:
  `{ at, kind: 'llm' | 'search' | 'fetch', provider, model, task, tokensIn, tokensOut, cost (USD or "unknown"), ms, ok, error? }`.
  Prompts, replies and keys are never in a record; error text has keys removed. A throwing logger is ignored.
- Seams for tests and the app: `fetch`, `pageTransport`, `sleep`, `lookup` (DNS), `now`, `root`, `timeoutMs`.

Errors are `AIError` with a stable `code`: `config`, `budget`, `timeout`, `network`, `http`, `invalid_output`, `truncated`,
`unsafe_url`, `rejected`, `no_valid_posts` (its `notes` hold the rejected posts and reasons).

## The brand

The library reads the brand from the brand pack (`BRAND_DIR`, default `brands/demo`; see "Brand packs" in the README),
under the given `root`. Its own prompts name no brand. Each request carries a `brand` brief built from the pack's
`brand.json` (`brandBrief` in `src/context.mjs`):

- `name`, `descriptor` (what the brand does, or `null`), `tagline`, `website`;
- `spellings`: the correct forms from the brand's `spelling` rules (the `right` of each);
- `money`: the pack's `money.local` sentence (for example "Acme Savings works in euros (€) only"), or `null`;
- `language`: the language and spelling to write in (`language` in `brand.json`, default British English);
- `voice` and `visualDirection`: the team's own words on how the brand sounds and how its images look, or `null`;
- `references`: the style briefs of the design references that are switched on (`references` in `brand.json`, written by
  the web app), at most 24.

The voice, the visual direction and the references are taste, not facts: the prompts tell the model to follow them where
the hard rules leave room and never to quote them as claims.

`draftBatch` may override `name`, `tagline`, `website` and `descriptor` with its `brand` argument; colours and file paths
never reach the model. `timezone` defaults to the pack's `timezone`, then `UTC`. The pack's optional `country` (ISO 3166-1
alpha-2) goes into the draft request as `country` and picks the calendar of occasions (see "Occasions"). When the pack sets `money.foreign` (a
pattern of other currencies), a post that uses a vault picture whose title, description or tags match it is rejected,
with the `money.local` sentence in the reason. Without `money` every currency is allowed. A caption, a network's own caption or
image text that matches `money.foreign` (words, symbols, any case; web addresses are left out) is not rejected, since a fact the post cites may
carry another currency, but the post gets a warning (`caption: mentions another currency ("dollars"); <money.local>`) for a person to read. The `series` must be keys of the pack's `series`.

## Design references

`analyseReference({ image: { mediaType, data }, note })` describes one picture the team likes (a post, a poster, an
advert, a page) as a style brief. `data` is a Buffer or base64, at most 5 MB, of type PNG, JPEG, WebP or GIF; `note` is
what the team likes about it (at most 500 characters, passed as data). It uses the provider set up for `draft` (logged as
the task `reference`) with the versioned `reference` prompt. The model must accept images: messages may carry image parts,
which are sent to Anthropic as base64 image blocks and to OpenAI-compatible services as `data:` URLs.

It returns `{ analysis, brief, notes }`:

- `analysis` is checked against a schema: `summary`, `palette` (up to 8 `{ hex, role }`), `typography`, `layout`,
  `imagery`, `mood`, `avoid`, (from the prompt `reference-2`) an optional `proposal` of concrete style settings, and (from
  `reference-3`) an optional `composition`: the reference's arrangement as a layout for the feed page.
- `brief` is the same as one paragraph of at most 2,000 characters, ready for `brand.json` `references`. The brief is text
  for the drafting model only.

The `proposal` (`PROPOSAL_SCHEMA` in `src/reference.mjs`) is what the reference changes in the pixels, once an admin accepts
it. Every value is a `#rrggbb` colour, a number in range or a name from the engine's own lists
(`packages/engine/lib/design/tokens.mjs`), which the schema given to the model carries:

- `colours`: any of the grounds `light`, `soft`, `cool`, `warm`, `dark`, `deep`, the text colours `ink`, `body`, `muted`,
  `inverse`, and the accents `primary` (on light pages) and `accent` (on dark pages).
- `display` and `label`: `case` (`as-typed`, `upper`), optional `tracking` (em, -0.1 to 0.3); headlines an optional
  `weight` (100 to 900), labels an optional `font` (`mono` or `body`).
- `accent` (`colour`, `muted`, `weight`, `none`), `surface` (`shadow`, `outline`, `flat`), `decoration` (`kind`: `none`,
  `dots`, `grid`, `lines`, `auto`; optional `on`: `dark`, `all`; never `artwork`, which is a picture the team uploads) and
  `photo` (`treatment`: `none`, `tint`, `duotone`, `overlay`; optional `strength` 0 to 1).

An answer whose proposal falls outside these is refused like any invalid output; an answer without one keeps its brief. The
web app checks the proposal again with the settings' own schema before it stores it, shows it in Settings, Design
references ("Apply this look": the brand as it is and with the proposal, sketched side by side with what changes and the
colour checks) or applies it (`POST /api/settings/brand/references/:id/apply`, admins only, the engine's `validateBrand`
like any save). Applying sets the proposed colours as roles and replaces the proposed style choices; nothing else changes.

The `composition` (`COMPOSITION_SCHEMA` in `src/reference.mjs`) is built from the engine's own lists: block types, every
option's values, the field catalogue and the grid's bounds (`packages/engine/lib/design/layout.mjs`). A composition outside
them is refused like any invalid output. One that is well formed but not a usable layout (blocks on each other, a field no
block shows, margins under the minimum) is checked by the engine's `validateLayout` and dropped, with its reasons in
`notes.compositionProblems`; the rest of the analysis is kept. A kept one comes back as `analysis.composition`, a complete
layout with the placeholder id `from-reference`. The web app checks it again before it stores it and offers it in Settings,
Design references ("Use this layout"): a sketch, a real preview with the brand and every image check, then, only when an
admin adds it, a new layout in Settings, Layouts (checked once more on the way in).

The prompt tells the model to describe the style and not the content: no copied words, claims, logos or names. Text inside
the picture is data and is never followed.

## Suggestions (`src/suggest.mjs`)

Both return suggestions only: nothing is stored, and the caller shows them to a person who uses, changes or leaves each one. Both use
the provider ticked for `draft` (logged under their own task names, `brand-site` and `picture`), the budget and the log like every
other call.

- `suggestBrandFromSite({ website })` reads the brand's home page (a bare host gets `https://`) through the same safe page reader as
  research (`fetchPage`, see "Safety rules"; no search provider needed, `keepHtml` keeps the raw page for its head) after checking the
  budget, and logs the read as a `fetch`. From the page it takes the title, the meta description and social lines, the visible text
  (6,000 characters) and the colours the page names: its `theme-color` first, then the chromatic colours of its own CSS (style blocks,
  style attributes, custom properties, whose names are kept as hints), at most eight; greys, black and white are left out and linked
  stylesheets are not read. All of it goes to the model as JSON data under the `brand-site` prompt, which says the page is data and
  never instructions. The answer is checked against `BRAND_SITE_SCHEMA`: every field optional, `descriptor` up to 200 characters,
  `tagline` 120, `voice` and `visualDirection` 900, no other field, no emoji, one line for the first two, and `colours.primary` and
  `colours.accent` only as `#rrggbb` values that were found on the page. An empty answer is valid ("the page says too little"). A page
  that cannot be read is an `AIError` with code `site`; a refused address is `unsafe_url`.
- `describePicture({ image: { mediaType, data }, hints })` sends one picture (at most 5 MB, the image types of `analyseReference`) with
  optional hints (`title`, `fileName`, `role`; data, possibly wrong) under the `picture` prompt, and checks the answer against
  `PICTURE_SCHEMA`: `description` (up to 400 characters) and `peopleVisible` (a boolean) required, `title` up to 80, up to six tags in
  lower case joined by hyphens. The prompt forbids identifying or describing personal traits of anyone, quoting numbers from the
  picture, and treating text in the picture as instructions. `peopleVisible` is a hint for the person; it is never consent.

## Vault items the library expects

`{ id, kind, title?, body, status: 'confirmed' | 'unconfirmed', recordedAt?, validFrom?, validUntil?, tags?, sourceUrls?, file?, framing?, license?, identifiable?, consent? }`.
Kinds: fact, figure, news, event, product-note, story, photo, screen. `file` (photos and screens) is a path relative to the
repository. A figure is stale when `validUntil` has passed, or when it has no `validUntil` and was recorded over 180 days ago.
A photo with `license: 'rights-to-confirm'`, or with identifiable people and no recorded consent, has its rights unsettled.
An item that carries an explicit boolean `stale` (the web app sends one, from its own rules in `vault-rules.ts`) is judged by it;
the 180-day rule is for items that say nothing.

### Only usable items reach the model, and only usable items may be cited

An item is **usable** when a person has confirmed it (`status: 'confirmed'`), it is not deleted, it is not stale, and, for a photo
or screen, it has a `file` and its rights are settled. This mirrors what the web app already requires before a post can be
approved (`services/vault-rules.ts`: `sourceProblems` and `rightsProblems`), so a draft never starts from something approval would
refuse. The rule is applied twice, in the library so every caller gets it (`unusableReason` in `src/vault.mjs`):

- **Offering**: `draftBatch` and `rewrite` show the model only usable items. Unconfirmed items (research findings included),
  stale items, deleted items and pictures with rights to settle are not in the request at all, text and ids included, and
  `draftBatch` makes no call when nothing is usable (`config` error). The web app does not send them either (`vaultListForAi`
  in `services/ai-vault.ts`).
- **Checking**: `postcheck.mjs` rejects a post whose `sources` include, or whose picture is, an item that is not usable, with the
  reason ("source fig-9 is out of date (valid until ...), so a post may not cite it"; "picture ph-2 has its rights or consent
  still to be confirmed"). The post is redrafted or reported like any other rejection. These used to be warnings; there is no
  longer a warning for an unconfirmed or stale source or an unconfirmed picture.

`framing` (screens only) is `"phone"` for a pre-framed phone capture (transparent, the phone already drawn around the screen),
`"phone-bare"` for a plain portrait screenshot of a phone (no transparency, 1.6 to 2.4 times as tall as it is wide: a look's `device`
draws the phone round it) or `"desktop"` for any other plain screenshot; leave it out when unknown. The web app works it out from the stored file with the engine's own
test (`hasAlpha` in `design/assets.mjs`, the one the renderer applies before it will put a picture in a phone layout) when the file
is uploaded (the web app reads `phone-bare` from the stored width and height). The model sees it as `screenKind` (`phone screen,
framed`, `phone screenshot, no frame` or `desktop screenshot`), and `postcheck.mjs` rejects a post that puts a plain screenshot (a
bare phone one included) in a phone layout (`product`, or a brand layout whose screen block is a phone) or a phone capture in a
desktop screen block, with the reason fed back to the model. With a look, screens are offered only when one of its variants
draws a `device` (the brief's variant says `device: "phone"` or `"tablet"`), and never a desktop screenshot: a screen goes only
in a variant that draws a device, named with `variant`; a photo never goes in one, and a photo post of a kind that has one names
its variant (else the look might choose the device). There is no repair: no template the drafter may use
takes the other kind of picture with the same fields.

## The brand's own layouts

When the brand pack's `brand.json` has `layouts` (made in the web app's Settings, Layouts; see
[design.md](design.md), "Your own layouts"), the draft request lists the valid ones as `layouts`: each one's `id`, `name`,
`description`, `sizes`, the `fields` it takes (`required`, what each is, `maxChars` for a text, `min` and `max` for a list) and
the kind of vault `picture` it shows. No geometry reaches the model: it fills a layout in, it never draws one. The draft prompt
(from `draft-9`) explains `{ "template": "layout", "layout": "<id>", ...fields }` and tells the model to prefer a layout whose
description fits an idea; from `draft-10` a carousel page may be such a layout too (one with a `feed` size, without `sizes` of its
own), drawn with its place in the carousel. A layout the engine's validator does not accept is never offered. From `draft-11`
the prompt asks the model to vary the layouts across a batch (no layout in more than about a third of the posts, unused layouts
first), and every call after the first is told how often each layout has been used and which layouts each drafted post used;
the prompt also explains that a layout needing a picture can only be used while unused pictures remain, and that a `quote`
field takes a quotation that is in a cited item (a quotation that is not in the vault is rejected).

## A brand with a design direction

When the brand pack's `brand.json` has `style.direction` (`editorial`, `swiss` or `retail`, or the id of a look in `brand.looks`,
which is how the web app writes the active look of Settings, Looks; see [design.md](design.md), "Design directions and the post
template"), the model designs with ONE template, `post`, instead of naming layouts or templates. Such a
brand is offered no `layouts`, no screens and no old templates (`object`, `number`, `product`, `myth-fact`, `closing`, `photo`,
`layout`). Carousels are offered only as carousels of post pages (`{ "template": "carousel", "pages": [post, ...] }`, see
[design.md](design.md), "Carousels of post pages"): a cover page, body pages and a closing page, 3 pages at least and at most
`design.carousel.pages.max`, which is 10, or 4 when X is among the channels (`MEDIA_LIMITS` in the engine's `networks.mjs`). A carousel
counts as its own kind for "never three running". The design is `{ "template": "post", "kind": "<kind>", ...fields }`, `kind` being one of `statement`, `figure`,
`list`, `quote`, `photo`, `event`, `offer`.

The request carries `design: { direction, template: 'post', kinds }`, built in `src/direction.mjs` from the engine's own registry
(`lib/design/post-spec.mjs` and `lib/design/directions`), so nothing is written twice: each kind the direction can draw today
(a kind with no composition in the direction is not offered, and is rejected if used), its `required` fields, the fields its
compositions draw, and for each text the hard `max` and the `budget` (the most the direction's compositions are drawn for; with no
`variant` the engine may pick any composition of the kind, so the budget is the smallest one). Items carry `min`, `max`, `chars`.
For a look written as data the kinds come from the engine's `lookBrief` instead, and each kind also lists its `variants`
(`variant`, `name`, `describe` and the variant's own `fields`).

`prompts/draft.md` is one file; the parts that differ are between `<!-- if direction -->`, `<!-- else -->` and `<!-- end -->`
lines (`forDirection` in `src/prompts.mjs`), so the same version, `draft-20`, serves both kinds of brand and a brand without a
direction gets what it got under `draft-11`, except for the confirmed-only rule. The direction part teaches: choose the kind from
the content (a number is a `figure`; steps or reasons a `list`; a date and place an `event`; a price or "new" an `offer`; a picture
that carries the post a `photo`; a house line a `quote`; otherwise a `statement`); write to the budgets (headline at most 70, aim
for 45, one `*emphasis*` phrase of 1 to 4 words never the whole line, `sub` explains and never repeats the headline, `label` 1 or
2 words, `big` as people say it with its sign or unit and `unit` what it counts, `items` parallel in grammar and length, `meta` as
"12 Dec · 6pm · Place", `tag` at most 2 words or a price); vary the kinds (at least three kinds in five or more posts, never the same
kind three posts running); use each picture once; set `variant` only where the kind lists `variants` (a look written as data
does: each variant has a name, a `describe` and its own fields and `max`, and the model picks one by its `describe` and writes to
its limits). All rules about sources, numbers, dates, networks and
currency stay.

What `postcheck.mjs` adds for a `post` design: the template must be `post` (a direction-less brand refuses `post` and keeps
the old behaviour); the engine's own `postDesignProblems` with the brand's direction; the kind must be one the direction draws; only
fields that kind's compositions draw (a `statement` with an `image` is refused); every text within its budget, with the problem
stated as "headline is 62 characters; ... draws at most 60. Shorten it to about 45"; one emphasis phrase, 1 to 4 words, not the
whole text, and asterisks only in `headline` and `quote`; a `variant` is removed and reported as a repair when the kind lists
no variants (a code direction), and otherwise must be one the kind lists, the post then held to that variant's own fields and
budgets; the picture of any
post is a vault `photo` item; numbers in `big`, `unit`, `meta`, `tag`, `items` and the other image texts must be in the cited
items; and the same kind may not make three posts in a row by date (the third is rejected, `ctx.kinds`). With a look written as data
(since `draft-14`): `[[pill]]` words and `{{icon}}` marks in the headline only where a design of the kind draws them (the brief's headline lists
`pills` / `icons`, with the icon names), `cta`, `info` (rows of a fixed label and a value) and `gallery` (vault photos with captions) only
where the kind lists them, within each design's own counts and characters; the info values and picture names are image text, so their
numbers are checked against the cited items like the others, and a gallery picture is a vault `photo` used once in the batch. From `draft-15`
a `chart` too, where a design of the kind draws one: the brief's `chart` lists the `kinds` the designs draw, the points (`min`, `max`), the
characters of a label and its `shape`, and each variant its own `kinds` and counts; mostly for a `figure`. Every `value` and `total` of a chart
must be in a cited item (`chartsOf` in `src/postcheck.mjs`; the labels are image text, checked like the others), and when a cited item calls its
figures illustrative the post must say so on the image (for example "Illustrative figures." in `sub`) and in every caption, or it is rejected,
the same way figures are marked. The engine refuses a kind or a count the design does not draw. `draft-16` adds
the `avatar`: one portrait picture of the person a quote is by (or an event's speaker), `{ "image": "vault:<id>", "focal"? }`, only where the
kind lists it (the brief gives its `shape`). It is held to every rule of a picture: a vault `photo` (never a screen), confirmed, current,
its rights settled and, when it shows identifiable people, their consent recorded (an item without it is never offered and is refused
if named), used once in the batch with the other pictures; never with a `gallery`. `draft-17` (and `rewrite-6`) let the image text carry up to
three standard emoji per text when the brand's `emoji` is true, never in the brand name, a caption or a series mark; with it false, none.
`notes` gains `direction` and `kindMix`.

### Every image stands alone

Most people see the image and never read the caption, so from `draft-18` (and `rewrite-7`) the prompts split what stays exact from
what the model words itself, and ask that the words on each image answer three questions together: what it is about (the brand or the
product, by name or a clear description), what the number or claim means, and why it matters to the reader.

- **Exact**, as the cited item gives them: every number with its unit, sign or currency, names and the brand's spellings, dates, prices
  and quotations (word for word). "Write money exactly as the item writes it" is about the sum itself, not the sentence around it.
- **The model's own words**: everything else. A fact is said again in plain, clear words, with the same meaning and never stronger than
  the item; an item's sentence is never copied onto the image just because it is there.
- A headline names its subject (never "it", "they" or "this" for something the image does not name); a product or feature name the
  reader may not know is introduced on first use ("<name>, the app's assistant"); a `figure`'s `unit` and `sub` say what is counted,
  whose it is and why it matters; an `offer` says in its headline or `sub` what is free or priced; a label names the topic ("Our
  members", "Free plan"), never a generic word. Where a fact came from ("a live figure from ...", the day it was read) goes in the
  caption; "Illustrative figure." may stay on the image, short, at the end of the `sub`. When a design draws a `sub`, the model writes
  one whenever it adds context; a figure, an offer and a statement normally carry one.

`src/standalone.mjs` (`standAloneProblems`, called by `checkPost` for `post` designs and each post page of a carousel) sends back the
worst cases with a reason, like every other check (the draft's replacement call, the rewrite's retry): a `figure` with no `sub` where
its design (the named variant, else the kind) draws one; a `unit` that is one generic word (`members`, `people`, `users`, ...) with
no `sub` or headline; a figure with neither; a label from a short fixed list (`The numbers`, `Numbers`, `Update`, `Info`, `News`, ...;
not a named series' mark, which the app writes); a `sub` that repeats the headline's emphasis phrase of two words or more; and a
headline (on a carousel, the cover's only) that opens on `it`, `they`, `he`, `she`, or `this`/`that`/`these`/`those` before a verb
("This changes everything"), or ends on a short clause of three words or fewer that does ("..., it only reads"). The checks are a fixed
word list and the first words of a clause, so they stay cheap and deterministic and do not judge style.

### Pictures and variety

`draft-18` also asks for posts with a picture: whenever a confirmed vault photo suits a post's subject, the model chooses a kind and
variant that draws one (a variant that lists `image`) and gives it the photo, aiming for most posts in a batch to carry a picture; a
single idea that a photo suits is a `photo` post rather than a `statement`, an `offer` takes a photo when its variant draws one, and
a picture-less design is for a post no unused photo fits. Whether a look can draw a picture on a figure or a statement is the look's
own: the shipped Clean look, for example, draws pictures only in its `photo` and `offer` designs.

`draft-19` adds two sections of its own at the end, `# Occasions` and `# Tools` (see "Occasions" and "Tools while drafting" below);
nothing else in the prompt changed. A live December draft with `draft-19` used none of the occasions it was given, so `draft-20` asks
for at least one post in four to take an occasion when one fits, says a seasonal post still stands on a cited fact, and asks `plan` to
name the occasions used and why any were left out.

A batch is not one template filled in again and again: `comboProblems` in `postcheck.mjs` refuses a post whose design (its kind and
named variant; a kind in all its variants when none is named) the batch already uses as often as the limit allows: 2, or a fifth of
the batch, or the batch shared out over all the look's designs, whichever is most (`ctx.batchCount`). Named series posts are not
counted. The prompt also asks for headlines of different shapes (an instruction, two short sentences, a full thought with a verb, now
and then a question), not all "X is Y".

`notes.pictures` is `{ posts, of, usablePhotos }`: how many delivered posts carry a picture and how many usable photos the vault
offered. When fewer than half carry one, `notes.messages` says so, and the web app's AI-draft note shows one plain line next to its
summary (not under Details): "Only 2 of 10 posts have a picture: confirm more photos in Pictures (with their rights settled) to get
richer posts", or, when the vault offered at least as many photos as posts, that the photos are ready and a person can add one to a
post or ask again (`pictureNote` in `web/src/lib/ai-draft-note.ts`).

### Named series

`draftBatch` takes `recurring`: the brand's named series (the web app's Settings, Looks, Series), each `{ slug, name, kind, variants,
mark?, markField?, cadence, weekday?, nextNumber }` (`lib/design/series.mjs` in the engine). Each is checked against the look in force
(`seriesBrief` in `src/direction.mjs`, `seriesProblems`); one the look cannot draw is left out with a note, and a brand without a
look plans none. `planSeries` gives the slots of the period at each cadence (weekly or fortnightly from the chosen weekday, monthly on
its first one), numbered from `nextNumber`, at most one per post of the batch. The request carries the open slots as `seriesPlan`
(date, series, name, kind, number, the variant, the mark), refreshed for each call. A post fills a slot by naming its slug in
`series`: the check (`seriesOfPost` in `postcheck.mjs`) refuses a slug with no open slot or a post of another kind or a carousel,
then the app (never the model) sets the slot's date, the design's variant and the mark ("Tip #12") in its field, reported as
repairs; the series number is not taken for an unsourced number. After drafting, each series' posts are renumbered in date order
from `nextNumber`, so a slot left unfilled leaves no gap. Each post carries `series: { slug, number }`; `notes.namedSeries` lists the
numbers drafted per series and `notes.messages` the slots left out.

`rewrite` uses the same file (`rewrite-7`): a direction brand's rewrite is told the kinds and budgets, to keep the post's `kind`
and edit the words within the same budgets, and to redesign an old-template post as a `post`. A kind changed by the model is
shown in the post's `warnings`.

## How drafting works

1. Items that are usable (see above) are ranked (newest first) and the top ones sent to the model as data, with series, period, channels and limits.
2. The model returns JSON (Anthropic: a forced tool call whose `input_schema` is the schema; OpenAI-compatible: `json_object`, falling
   back to plain JSON extraction). It is validated against the schema; invalid output is sent back once with the problems, then the
   call fails with `invalid_output`.
3. Each post goes through `postcheck.mjs`:
   - every source and every picture must be a usable item (rejected otherwise, see above);
   - template must be a poster template, `carousel`, `photo`, or `layout` with one of the brand's own layouts (when it has
     some; never `pagecover`); for a brand with a design direction, `post` only (see above); a carousel's pages are poster pages or, when the brand has layouts, `layout` pages. The design
     passes the engine's `postDesignProblems`: `validateDesign`, and for a layout post or page `layoutDesignProblems`: the
     layout must exist and be valid, and the post or page fills in exactly its declared fields within their lengths. A layout's
     picture must be a vault item of the kind it shows (a `screen` item for a screen block, else a `photo` item);
   - images are written as `vault:<id>` and replaced by that item's `file`; any other path, URL or non-photo item is rejected;
   - every number in the captions and image text must appear in the cited `sources` (so `85,000+` matches "more than
     85,000 deposits");
     quotations of three words or more must appear in a source; the post must cite at least one item that exists;
   - a picture used twice in the batch, or one that shows another currency (see "The brand"), is rejected;
   - a `post` image that does not stand alone (a bare figure, a generic label, a headline leaning on a pronoun; see "Every image
     stands alone") is rejected with the reason;
   - repaired and reported: brand spelling, emoji in image text, duplicate or odd ids, an X caption over 280 (cut to whole sentences);
   - warned, not blocked: over-length Instagram or LinkedIn captions, more than
     30 hashtags, Title Case headlines, US spellings, headline and sub lengths.
4. If posts were rejected, one replacement call is made, checked the same way.
5. The batch is validated by the engine's own `validateBatch`; a post it refuses is dropped and reported. If nothing is left the call
   throws `no_valid_posts`.

`notes`: `promptVersion`, `model`, `usage` (calls, tokens, cost or `"unknown"`, and `toolCalls` when tools ran), `plan`, `requested`, `delivered`, `seriesMix`,
`rejected` (id and reasons), `repaired`, `direction` and `kindMix` (a direction brand only), `imageSuggestions` (stock-photo briefs; nothing is fetched or embedded),
`seasonal` (with occasions: `country`, the `occasions` given and `used`, `{ postId, occasion, date }` for each post planned around one),
`tools` (when a tool ran: `calls`, `searches` `{ tool, query, results }`, `vaultItemsFound`, `foundOnTheWeb`, `dropped`) and `messages`.
`draftBatch` returns `{ batch, notes, found }`; `found` lists the facts taken from the web (below).

## Occasions (`src/occasions.mjs`)

A draft can be planned around the period: its public holidays, observances, seasons and shopping or money moments.
`occasionsFor({ country, from, to })` returns the occasions that touch the window (at most 400 days), sorted by date, each
`{ id, name, date, end?, kind, note, observed?, country }`, `kind` one of `holiday`, `observance`, `season`, `commerce`. No AI, no network.
`country` is the brand's (brand.json `country`, an ISO 3166-1 alpha-2 code the engine's `validateBrand` checks against
`packages/engine/lib/countries.mjs`). Covered: GH, NG, KE, ZA, GB, IE, US, CA, IN, AU, DE, FR, NL, ES, IT (`OCCASION_COUNTRIES`). Any other
country, or none, gets the global occasions only: New Year's Day, Valentine's Day, International Women's Day, Easter Sunday, the start of
Ramadan, Eid al-Fitr, Eid al-Adha, Black Friday, Cyber Monday, Christmas Eve, Christmas Day, New Year's Eve and the month-end payday (the
last working day of each month). A country's own entry of the same id replaces a global one (Christmas Day becomes a `holiday`).

How the dates are made, so each can be checked:
- Fixed dates and weekday rules ("first Friday of December": Ghana's National Farmers' Day; "last Monday before 25 May": Victoria Day;
  "fourth Thursday of November": US Thanksgiving, with Black Friday the day after and Cyber Monday three days later).
- Easter by the anonymous Gregorian algorithm (Meeus, *Astronomical Algorithms*, ch. 8), and Good Friday, Easter Monday, Ascension
  (+39), Whit Monday (+50), Shrove Tuesday (-47), Rose Monday (-48) and the UK and Irish Mothering Sunday (-21) from it.
- Ramadan, Eid al-Fitr, Eid al-Adha and Nigeria's Eid-el-Maulud from the Umm al-Qura calendar through `Intl` (`islamic-umalqura`), and
  Hanukkah (25 Kislev, eight nights) from `Intl`'s Hebrew calendar. Each Islamic note says the day depends on the moon and may differ by
  one locally; on a Node without those calendars the entries are left out.
- Diwali from a table for 2025 to 2030 (20 Oct 2025, 8 Nov 2026, 29 Oct 2027, 17 Oct 2028, 5 Nov 2029, 26 Oct 2030), as India's central
  government holiday list and the major panchangs give the Lakshmi Puja day; a test checks each against a computed new moon. No other year.
- Substitute days: GB bank holidays on a weekend move to the next working day not already a holiday (Christmas and Boxing Day
  together), South Africa's Sunday holidays to the Monday (Public Holidays Act), US federal holidays to the Friday or Monday (OPM), Canada
  Day on a Sunday to the Monday, and Australia Day on a weekend to the Monday. The entry keeps its date and gets `observed` and a sentence.
- Special rules: Ireland's St Brigid's Day bank holiday (the first Monday of February, or 1 February when that is a Friday, since 2023),
  the Dutch King's Day (26 April when the 27th is a Sunday), the French Fête des mères (last Sunday of May, or the first of June when
  Pentecost falls on it), the French sales (Code de commerce D310-15-2), Oktoberfest (the first Saturday after 15 September to the first
  Sunday of October, or 3 October when later), the first Sunday of Advent.
- Money moments only where certain: the UK Self Assessment deadline (31 January) and tax year end (5 April), Ireland's 31 October paper
  return deadline, Canada's 30 April filing deadline, Australia's end of financial year (30 June) and 31 October return deadline.
  Back-to-school is a `season` with a range and a note that dates vary. Meteorological seasons for the temperate countries only.

Sources: each country's government list of public holidays (gov.uk bank holidays, gov.ie public holidays, OPM federal holidays,
canada.ca statutory holidays, India's central government holiday list, the Australian states' lists, the German, French, Dutch,
Spanish and Italian national lists, the South African Public Holidays Act, the Kenyan, Nigerian and Ghanaian government
announcements), read from memory of those sources while writing, not fetched. Left out because they were not certain: Ghana's
7 January and 1 July and its 21 September holiday name (all changed by recent amendments), Kenya's 26 December and 10 October names,
Italy's 4 October from 2026, the US tax day (it moves with weekends and DC's Emancipation Day), regional holidays (German states, Spanish
regions, Scottish and Northern Irish ones except as a note), Holi and the other lunisolar Hindu festivals, and Mother's Day where it is
not one clear rule (Ghana, Nigeria, Kenya). `test-occasions.mjs` pins the rules to known dates.

A draft takes `occasions: [{ name, date?, end?, observed?, kind, note?, source? }]` (`cleanOccasions`: at most 40, names up to 80
characters, dates real, ones outside the period dropped). The request carries them as `occasions` and the brand's `country`, and the
prompt's `# Occasions` section says: plan posts around them where they genuinely fit the brand (a timely angle, a greeting, a themed tip),
on the day or before it and never after, mark such a post `"occasion": "<name>"`, name an occasion and its date only as given, and never
claim the brand does something for one unless a cited vault item says so. Occasions are allowed context, not vault facts: in
`postcheck.mjs` the days of the month and the year of an occasion's dates (and a number in its name) are allowed in a post whose words
name it (`occasionNumberKeys`: the name, or a distinctive word of it such as "christmas") or that declares it. Every other number still
needs a cited item. A post marked for an occasion that goes out after it gets a warning. The `occasion` mark stays in the notes, never in
the engine batch.

`findOccasions({ country, period, known })` ("Look for events this month") runs one web search ("major events and festivities in
<country> <month year>"), wraps the results as `<source>` data and asks the drafting provider (prompt `occasions.md`) for up to six more,
each `{ name, date, end?, kind, note, source }` with `kind` never `holiday`. A proposal is dropped when its `sourceUrl` is not a returned
result, its dates fall outside the period, it repeats a known name, or its name or note carries a number its result does not. The search
and the AI call go through the budget and the call log like every other.

## Tools while drafting (`src/draft-tools.mjs`)

Each drafting call offers the model tools through `complete({ tools })` in `providers.mjs` (at most `MAX_DRAFT_TOOL_CALLS`, 8, over the
whole draft; every round trip is a paid, logged call, the budget is checked before each, and each tool call is logged as `kind: "tool"`):
- Anthropic: the tools go beside the answer tool with `tool_choice: { type: "any" }` (a tool call every turn; the answer tool finishes),
  the model's `tool_use` blocks are run and sent back as `tool_result` blocks, and once the calls are used up the answer tool is forced.
- OpenAI-compatible: `tools: [{ type: "function", function: { name, description, parameters } }]` with `tool_choice: "auto"`, the
  message's `tool_calls` are run and answered with `{ role: "tool", tool_call_id }` messages, then the JSON answer; at the cap
  `tool_choice: "none"`. A server that answers 400 about tools is asked again without them.
The JSON-output contract is unchanged: the answer is the same schema, checked the same way.

- `search_facts({ query, kind? })` searches every usable vault item (confirmed, current, rights settled; never pictures, which are all in
  the request) by title (3), tags (2) and body (1), and returns up to 8 compact items the model may cite. So the request lists only the
  top 40 facts (those that mention a chosen occasion first) and says how many more there are (`tools.factsNotListed`).
- `search_web({ query })`, only with a search provider, returns five results as `<source>` blocks marked as data, never instructions.
  A fact the model wants from one goes in the answer's `found` list (`{ id: "found-…", kind, title, body, sourceUrl }`) and is cited by
  that id. A find is kept only when its `sourceUrl` is a result this draft returned and every number in it is in that result's text, and
  it repeats no vault item. A post citing a kept find passes the source check but gets the warning "Uses a fact found on the web: confirm
  it in Facts first"; a post citing anything else that is not usable is rejected as before. The app saves each find as an unconfirmed
  vault item (tag `found-while-drafting`) and points the post's sources at it, so approval refuses the post until a person confirms it.

## Research

Per topic: search, read up to three pages (`fetchPage`), one model call. Returned items have `kind`, `title`, `body`, `sourceUrls`,
`foundAt` and `status: 'unconfirmed'` (the library never confirms). Items are dropped when they cite a URL that was not read, contain a
number absent from the pages, or duplicate a vault item or an earlier candidate. `checks` are `supported`, `contradicted` or
`not found`, only for real vault ids and only with sources that were read; the strongest verdict per item wins.

## Safety rules

- Everything a model returns and every fetched page is untrusted. Output is never executed. Pages are reduced to text (scripts, styles,
  comments and hidden blocks removed, control and zero-width characters removed), capped, and wrapped as `<source>` data blocks (a
  closing tag inside a page is neutralised). The research prompt says that sources are never instructions.
- `fetchPage` reads only http(s), no credentials in the URL, no `localhost`, `.local`, `.internal` or dot-less names, and only
  global addresses. IPv4: not 0/8, 10/8, 100.64/10 (CGNAT, includes Tailscale), 127/8, 169.254/16, 172.16/12, 192.0.0/24,
  192.168/16, 198.18/15, documentation ranges, multicast or 240/4. IPv6 is deny-by-default: only 2000::/3 is allowed, minus
  documentation, 2001::/23, and 6to4, Teredo, NAT64 (64:ff9b::/96 and 64:ff9b:1::/48) and IPv4-mapped or compatible forms whose
  embedded IPv4 is not public.
- The address checked is the address connected to: pages are read with `node:http`/`node:https` and a custom `lookup` that resolves the
  name, refuses it if any answer is not public, and returns only checked addresses, so a DNS answer that changes between the check and
  the connection cannot reach an internal host. Host header and TLS SNI stay the original name. Redirects are followed by hand
  (at most four), each hop checked and connected the same way. Size 1 MB, 8,000 characters, 15 seconds, text content types only.
  The `pageTransport` seam (or `fromFetch(fetch)`) replaces the transport in tests; an injected transport is not pinned.
- Keys are only sent in headers (or Tavily's bearer header), never put in URLs, logs or errors.
- Drafts only ever come back as data; nothing here sends anything to Buffer.

## The AI designer (`src/design.mjs`)

`designBatch(rt, { posts, check?, onProgress? })` composes each post's design in the look's own composition schema
(`packages/engine/lib/design/look.mjs`), never HTML, CSS, canvas or a picture: data the engine validates, checks and draws like any composition
of the look (see design.md, "A post's own design" and "The art layer"). The owner's reasons for this and not free code: quality, no brand drift,
editable designs, and the same security model (AGENTS.md rule 11).

- **One call per post** (`rt.llm('design', { using: 'draft' })`: the draft provider, the budget, one `ai_calls` row and a cost per call). A per-post
  call is the cheaper of the two that are still good: the model looks at that post's picture only, and a failure costs one post.
- **What the model is given**: the system prompt `src/prompts/design.md` (versioned, `design-1`); a compact catalogue built from the engine's own
  tables (`designCatalogue()`: every element type with its own properties and ranges, the common properties, the places, the art layer's shapes and
  caps; a brand graphic, a device and the top label row are not offered); the look's settings (canvas, fonts, type, colour, devices, photo, logo,
  dials) and the brand's palette as role names with their colours; the brand brief; the post's kind and words; the picture's thumbnail as an image
  part (at most 384 px, from the engine's `probePicture`) with its size, its edge colour and whether the page could take that colour; the designs
  already made in this batch (`batchSoFar`: ground, picture place, element types), so the batch varies; and examples: the look's own designs of the
  kind (valid with these settings) and one each from two other shipped looks.
- **What comes back** is held to an output schema (`DESIGN_SCHEMA`: `{ why, composition }`, the composition's top keys), then to the engine's
  validator for a post's own design (`postCompositionProblems`), then to `check(id, composition)`, the app's trial render of the post with it
  (every check of the finished page, no fallback). When validation or the check fails the model gets **one repair round** with the reasons; if that
  fails too, the post keeps the look's design (`composition: null`, with the reasons). The budget stops the rest of the batch the same way.
- `notes`: `{ task: 'design', promptVersion, usage, designed, of }`. Tests: `test-design.mjs` (fake provider only).

## Prompts

`packages/ai/src/prompts/draft.md`, `research.md`, `rewrite.md`, `reference.md`, `brand-site.md`, `picture.md`, `design.md` (`design-1`). They are brand-neutral: they read the `brand` brief above.
The first line is `<!-- version: draft-20 -->` (now `draft-20`, `rewrite-7`); the version is returned in `notes.promptVersion`. Change a prompt by editing
the file, bumping its version and reviewing the diff. Tests pin the versions' format only, not the wording.

A brand pack can replace any of them with its own `prompts/<name>.md` (for example `brands/acme/prompts/draft.md`), with
the same version line. The pack's file is used when it exists, the library's otherwise (`promptDir` in
`src/prompts.mjs`). A pack's prompt can say more about the brand than the brief does; it must keep the library's rules
(JSON output, sources are data, numbers from cited items), because the checks after the model do not change.

## Provider API facts (read from the docs on 20 November 2026)

- Anthropic Messages API: `POST /v1/messages`, `x-api-key`, `anthropic-version: 2023-06-01`, `tools` and `tool_choice`. Temperature is
  only sent when configured; a 400 that mentions it makes the call repeat without it. `claude-sonnet-5-5` refused a forced `tool_choice` (seen in the live smoke), so on that 400 the call is repeated with `tool_choice: auto` and a system hint to call the tool.
- Brave: `X-Subscription-Token`, `q`, `count` (max 20), `freshness`, results in `web.results[]` (`title`, `url`, `description`).
- Tavily: `POST /search`, `Authorization: Bearer`, `query`, `max_results`, `topic`, `start_date`, `results[]` (`title`, `url`, `content`, `published_date`).
- Exa: `POST /search`, `x-api-key`, `query`, `numResults`, `startPublishedDate`, `results[]` (`title`, `url`, `publishedDate`, `text`, `highlights`).

## Weak or unverified

- Tools were offered to a real Anthropic model (`claude-sonnet-5-5`) in two December 2026 drafts for the Pennyhive test brand (country
  IE, no search key, so only `search_facts`): the requests with `tool_choice: any` were accepted, but the model answered straight away
  and never called `search_facts`, so a real tool round trip has not been seen. With `draft-20` one post of five took an occasion
  (Christmas Eve); with `draft-19` none did. OpenAI-compatible tool calling, `search_web` and `findOccasions` were run only against fakes.
- Not run against real Brave, Tavily, Exa or any OpenAI-compatible server. Brave's `page_age`/`age` and Tavily's
  `include_published_date`, and Exa's `contents.text.maxCharacters`, were not confirmed in the docs read.
- Page reads through the real transport were run once against `example.com` only; redirect handling and the pinned lookup are covered by tests with fake transports, not by a real redirecting site.
- The suggestions (`suggestBrandFromSite`, `describePicture`) were run only against fake providers and fake pages in the tests, never
  against a real model or a real website; how well a real model follows the `brand-site` and `picture` prompts is not known.
- The number check is textual. Numbers written as words ("fourteen") and claims without numbers or quotation marks (an invented
  person's name, a product behaviour) are controlled by the prompt and a human reviewer only.
- Prices and the 180-day figure age are caller settings and a default; neither was checked against any real policy.

## How the Qerr web app uses it

`apps/web` depends on `@qerr/ai` and loads it through one seam, `loadAI()` in `src/server/ai.ts` (which tests replace). The `draft-batch` job (queued by `POST /api/batches/ai-draft`, or the Draft with AI button on the batch list)
sends the usable vault items (confirmed, current, rights settled; `vaultListForAi`), calls `draftBatch`, and imports the answer through the same path as a batch file: a batch
in `draft` state owned by the person who asked, each post linked to its vault sources and carrying the AI's warnings,
the drafter's `notes` kept on the batch (shown with an "AI draft" badge), and a render queued for every design block.
Vault photos are offered to the library with a made-up path named after their id; the app swaps it for `vaultItemId`, and
the render job copies the real file from the private bucket. If the AI fails, the monthly budget is used up or the answer does
not pass the checks, no batch is made and the reason is written to the audit log as `ai.draft_batch.failed`.

Draft with AI's Design choice (AI-designed) and Redesign with AI on a batch call `designBatch` through the `redesign-batch` work
(`src/server/services/ai-design.ts`): the app probes each post's picture, supplies the trial render as `check`, and saves a design that passes as
the post's own, keeping the post's other design to switch back to. See the web app's README, "The AI designer".

`POST /api/suggest/brand-from-site` and `POST /api/suggest/picture-description` call `suggestBrandFromSite` and `describePicture`
directly (not as jobs) and return the suggestion; see the web app's README, "AI suggestions".

The `rewrite-post` job (queued by `POST /api/posts/:id/rewrite`, or "Rewrite with AI" in the post page's menu) calls `rewrite` with the post and its linked
facts and, with `apply`, saves the answer as an edit by the person who asked: the title, caption, per-network captions, date, time, design and sources
go through the same checks as a manual edit, approval is taken off and a changed design is made again. A failure leaves the post as it was. The route
refuses first, with the reason, when no provider is ticked for rewriting, the monthly budget is missing or used up, or the post has no linked facts.

Every record `log` receives is saved as a row in `ai_calls` (task, model, tokens, cost, duration, outcome, the run and the
batch it made). Month-to-date spend on the AI settings page is the sum of that month's `costUsd`. A provider needs its input and
output price per million tokens (set on the provider) for the library to estimate a cost; calls without prices are logged with
an unknown cost, counted on the settings page, and do not count against the budget.

