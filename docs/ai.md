# The AI library (`packages/ai/`, `@vesk/ai`)

No third-party dependencies, Node 20+, `fetch` only. It depends on the engine workspace (`@vesk/engine`) for the batch and design validators. It is the only way the Vesk web app talks to a model or a search
provider. Its interface:

```js
import { createAI } from '@vesk/ai';
const ai = createAI({ providers, search, budget, log, prices });            // config from the app's settings, keys already decrypted
await ai.draftBatch({ vault, series, period, count, channels, brand, timezone }); // -> { batch, notes }
await ai.research({ topics, vault, since });                                       // -> { items, checks, notes }
await ai.rewrite({ post, instruction, vault, channels });                          // -> post (with post.notes)
await ai.analyseReference({ image, note });                                        // -> { analysis, brief, notes }
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
never reach the model. `timezone` defaults to the pack's `timezone`, then `UTC`. When the pack sets `money.foreign` (a
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

`framing` (screens only) is `"phone"` for a pre-framed phone capture (transparent, the phone already drawn around the screen) or
`"desktop"` for a plain screenshot; leave it out when unknown. The web app works it out from the stored file with the engine's own
test (`hasAlpha` in `design/assets.mjs`, the one the renderer applies before it will put a picture in a phone layout) when the file
is uploaded. The model sees it as `screenKind` (`phone screen, framed` or `desktop screenshot`), and `postcheck.mjs` rejects a
post that puts a desktop screenshot in a phone layout (`product`, or a brand layout whose screen block is a phone) or a phone
capture in a desktop screen block, with the reason fed back to the model. There is no repair: no template the drafter may use
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

When the brand pack's `brand.json` has `style.direction` (`editorial`, `swiss` or `retail`; see [design.md](design.md), "Design
directions and the post template"), the model designs with ONE template, `post`, instead of naming layouts or templates. Such a
brand is offered no `layouts`, no screens and no old templates (`object`, `number`, `product`, `myth-fact`, `closing`, `photo`,
`layout`), and **no carousels**: the engine does not accept a `post` as a carousel page (`PAGE_TEMPLATES` in `spec.mjs`), so there is
nothing to offer. The design is `{ "template": "post", "kind": "<kind>", ...fields }`, `kind` being one of `statement`, `figure`,
`list`, `quote`, `photo`, `event`, `offer`.

The request carries `design: { direction, template: 'post', kinds }`, built in `src/direction.mjs` from the engine's own registry
(`lib/design/post-spec.mjs` and `lib/design/directions`), so nothing is written twice: each kind the direction can draw today
(a kind with no composition in the direction is not offered, and is rejected if used), its `required` fields, the fields its
compositions draw, and for each text the hard `max` and the `budget` (the most the direction's compositions are drawn for; with no
`variant` the engine may pick any composition of the kind, so the budget is the smallest one). Items carry `min`, `max`, `chars`.

`prompts/draft.md` is one file; the parts that differ are between `<!-- if direction -->`, `<!-- else -->` and `<!-- end -->`
lines (`forDirection` in `src/prompts.mjs`), so the same version, `draft-12`, serves both kinds of brand and a brand without a
direction gets what it got under `draft-11`, except for the confirmed-only rule. The direction part teaches: choose the kind from
the content (a number is a `figure`; steps or reasons a `list`; a date and place an `event`; a price or "new" an `offer`; a picture
that carries the post a `photo`; a house line a `quote`; otherwise a `statement`); write to the budgets (headline at most 70, aim
for 45, one `*emphasis*` phrase of 1 to 4 words never the whole line, `sub` adds a fact and never repeats the headline, `label` 1 or
2 words, `big` as people say it with its sign or unit and `unit` what it counts, `items` parallel in grammar and length, `meta` as
"12 Dec · 6pm · Place", `tag` at most 2 words or a price); vary the kinds (at least three kinds in five or more posts, never the same
kind three posts running); use each picture once; do not set `variant`. All rules about sources, numbers, dates, networks and
currency stay.

What `postcheck.mjs` adds for a `post` design: the template must be `post` (a direction-less brand refuses `post` and keeps
the old behaviour); the engine's own `postDesignProblems` with the brand's direction; the kind must be one the direction draws; only
fields that kind's compositions draw (a `statement` with an `image` is refused); every text within its budget, with the problem
stated as "headline is 62 characters; ... draws at most 60. Shorten it to about 45"; one emphasis phrase, 1 to 4 words, not the
whole text, and asterisks only in `headline` and `quote`; a `variant` is removed and reported as a repair; the picture of any
post is a vault `photo` item; numbers in `big`, `unit`, `meta`, `tag`, `items` and the other image texts must be in the cited
items; and the same kind may not make three posts in a row by date (the third is rejected, `ctx.kinds`). `notes` gains `direction`
and `kindMix`.

`rewrite` uses the same file (`rewrite-5`): a direction brand's rewrite is told the kinds and budgets, to keep the post's `kind`
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
   - repaired and reported: brand spelling, emoji in image text, duplicate or odd ids, an X caption over 280 (cut to whole sentences);
   - warned, not blocked: over-length Instagram or LinkedIn captions, more than
     30 hashtags, Title Case headlines, US spellings, headline and sub lengths.
4. If posts were rejected, one replacement call is made, checked the same way.
5. The batch is validated by the engine's own `validateBatch`; a post it refuses is dropped and reported. If nothing is left the call
   throws `no_valid_posts`.

`notes`: `promptVersion`, `model`, `usage` (calls, tokens, cost or `"unknown"`), `plan`, `requested`, `delivered`, `seriesMix`,
`rejected` (id and reasons), `repaired`, `direction` and `kindMix` (a direction brand only), `imageSuggestions` (stock-photo briefs; nothing is fetched or embedded) and `messages`.

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

## Prompts

`packages/ai/src/prompts/draft.md`, `research.md`, `rewrite.md`, `reference.md`. They are brand-neutral: they read the `brand` brief above.
The first line is `<!-- version: draft-12 -->` (now `draft-12`, `rewrite-5`); the version is returned in `notes.promptVersion`. Change a prompt by editing
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

- Not run against real Brave, Tavily, Exa or any OpenAI-compatible server. Brave's `page_age`/`age` and Tavily's
  `include_published_date`, and Exa's `contents.text.maxCharacters`, were not confirmed in the docs read.
- Page reads through the real transport were run once against `example.com` only; redirect handling and the pinned lookup are covered by tests with fake transports, not by a real redirecting site.
- The number check is textual. Numbers written as words ("fourteen") and claims without numbers or quotation marks (an invented
  person's name, a product behaviour) are controlled by the prompt and a human reviewer only.
- Prices and the 180-day figure age are caller settings and a default; neither was checked against any real policy.

## How the Vesk web app uses it

`apps/web` depends on `@vesk/ai` and loads it through one seam, `loadAI()` in `src/server/ai.ts` (which tests replace). The `draft-batch` job (queued by `POST /api/batches/ai-draft`, or the Draft with AI button on the batch list)
sends the usable vault items (confirmed, current, rights settled; `vaultListForAi`), calls `draftBatch`, and imports the answer through the same path as a batch file: a batch
in `draft` state owned by the person who asked, each post linked to its vault sources and carrying the AI's warnings,
the drafter's `notes` kept on the batch (shown with an "AI draft" badge), and a render queued for every design block.
Vault photos are offered to the library with a made-up path named after their id; the app swaps it for `vaultItemId`, and
the render job copies the real file from the private bucket. If the AI fails, the monthly budget is used up or the answer does
not pass the checks, no batch is made and the reason is written to the audit log as `ai.draft_batch.failed`.

The `rewrite-post` job (queued by `POST /api/posts/:id/rewrite`, or "Rewrite with AI" in the post page's menu) calls `rewrite` with the post and its linked
facts and, with `apply`, saves the answer as an edit by the person who asked: the title, caption, per-network captions, date, time, design and sources
go through the same checks as a manual edit, approval is taken off and a changed design is made again. A failure leaves the post as it was. The route
refuses first, with the reason, when no provider is ticked for rewriting, the monthly budget is missing or used up, or the post has no linked facts.

Every record `log` receives is saved as a row in `ai_calls` (task, model, tokens, cost, duration, outcome, the run and the
batch it made). Month-to-date spend on the AI settings page is the sum of that month's `costUsd`. A provider needs its input and
output price per million tokens (set on the provider) for the library to estimate a cost; calls without prices are logged with
an unknown cost, counted on the settings page, and do not count against the budget.

