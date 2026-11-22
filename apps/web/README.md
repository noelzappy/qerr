# Vesk web app

The web app for a team that runs a brand's social media. A small team keeps a vault of confirmed facts and photos (Facts and Pictures in the app), imports or drafts a
month of posts, reviews and approves each one, renders its images with the design engine, and sends the approved posts
to Buffer as drafts, then live. It is a Hono server, Postgres through Prisma, pg-boss jobs and a React web app built into
`dist/web` and served by the same server. The engine (`packages/engine`, `@vesk/engine`) is its library: batch
validation, the duplicate guard and push loop, the Buffer client, the design renderer and storage. The server loads its
modules by subpath (`engineImport('batch')` is `@vesk/engine/batch`, see `src/server/engine/`) and the AI library through
`src/server/ai.ts`.

The brand is set by an admin in Settings, Brand and look, and kept in the database: no file to edit. Until it is saved
the app shows the brand pack named by `BRAND_DIR` (default `brands/demo`, the fictional Acme Savings; `brands/pennyhive`
is a second fictional test brand, a savings-club app, and `brands/northbeam` a third, a product studio for the studio look) and seeds its first vault from that pack's `vault.json`. See "The
brand" below.

The app has been run against a fake Buffer and local or fake storage. It has sent no post to a real Buffer account and
never used a real bucket; only the account check's two read-only queries have run against real Buffer, once (see
[docs/buffer-api-notes.md](../../docs/buffer-api-notes.md)).

## Requirements

- Node 22.12 or newer (the machine used for development has Node 24).
- Postgres 16. The app and pg-boss share one database (pg-boss keeps its tables in the `pgboss` schema).
- Google Chrome or Chromium, for rendering post images. Set `CHROME_PATH` if neither is in the usual place. JPG conversion uses `sips`
  (macOS) or `ffmpeg`.
- The npm workspaces at the repository root: the server imports `@vesk/engine` and `@vesk/ai` from `packages/`, so install from the root.

## Install and local run

```bash
npm install   # from the repository root: installs every workspace
cd apps/web
createdb vesk                                   # or any empty Postgres database

export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vesk
export APP_URL=http://localhost:3000
export BETTER_AUTH_SECRET=$(openssl rand -hex 24)
export APP_ENCRYPTION_KEY=$(openssl rand -base64 32)   # keep it: stored Buffer keys cannot be read without it
export STORAGE_DRIVER=local
export BOOTSTRAP_ADMIN_EMAIL=you@example.com
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"   # macOS

npm run build
npm run migrate
npm start                                              # or `npm run dev` (reload) with `npm run dev:web` for Vite
```

There is no `.env` loader: the variables must be in the process environment. Do not put real keys in a file in the
repository. The server listens on `PORT` (default 3000) and answers `GET /healthz` with 200 and `{"ok":true}` once the
database is reachable. On the first start with no users, the server logs one line, `bootstrap.admin_invite`, with an
invite link for `BOOTSTRAP_ADMIN_EMAIL`. Open it, choose a name and a password, then sign in. Restarting does not make a
second invite.

Then, as an admin, go through the guided setup. After the first sign-in an admin whose brand was never saved lands on it
(`/setup/<step>`); Home's setup steps open the matching step, and Settings stays the place to change things later:

1. Your brand: the name and the website, with the tagline, the description and the voice offered from the website when the AI
   is set up; the time zone and the language come from the browser.
2. Your logo: upload it (the small mark is cut from its left when it has one) or draw a simple pair from the name, then pick
   the colours from the ones read from the logo.
3. Your look: one of the shipped looks (Clean is chosen first).
4. Channels: add a Buffer account and run Check on it, then choose the account and channel for each network.
5. AI: the provider (the model and its prices follow the choice), a monthly budget and an optional search key.
6. The first batch: draft it with AI, or start empty. Facts and the team are added from Home's steps.

Brand, logo, channels and AI can also be done in Settings (Brand and look, Channels, AI and search), as before.

With `STORAGE_DRIVER=local` the files are written under `LOCAL_STORAGE_DIR` (default `apps/web/.data/storage`, git-ignored).
Private files are opened through signed, expiring app URLs; the public prefix is served unsigned at `/_local-public/`,
like a public bucket. Local storage is for development and tests only. Production uses `s3`.

## The web app

The pages are in `web/src/pages`, the shared pieces in `web/src/components` and `web/src/shell` (see
`web/README-ui.md` for the kit and the conventions).

- **Navigation.** The sidebar is Home, Create, Facts (`/vault`), Pictures (`/library`), Publish and Activity. Create has no
  tabs. Settings has a "Back to the app" link. Ctrl/Cmd+K opens a palette that searches pages, actions, batches, facts and
  pictures. The router is `createBrowserRouter` with one catch-all route.
- **Unsaved changes.** Editors use `useUnsavedGuard` and `confirmDiscard` from `web/src/hooks/use-unsaved-guard.tsx`: leaving
  or closing with edits that are not saved asks first; a save that succeeds does not.
- **The guided setup** (`web/src/pages/setup/`, routes `/setup/brand|logo|look|channels|ai|batch`; `/setup` opens the step to
  pick up at). One screen per step with a progress line, Back, and "Skip for later" on the logo, channels and AI steps;
  "Finish later" leaves it. Each step saves through the route Settings already uses (`PUT /api/settings/brand`, the logo
  uploads, `PUT /api/settings/looks/active`, `/api/buffer-accounts`, `/api/routing`, `/api/settings/ai/*`). `GET /api/setup`
  (admins) says where each step stands, read from what is saved, plus `progress` (`done`, `skipped`, `left`, `finished`);
  `PUT /api/setup/progress` takes `{ step, state: 'done'|'skipped' }`, `{ left: true }` or `{ finished: true }`. An admin with
  no saved brand who has neither left nor finished the setup is sent to it from Home. The first save of the brand keeps none of
  the example brand's words (tagline, description, voice, spellings, currency, post types). The brand step keeps its typing in
  the tab's sessionStorage across a reload. Its "Fill in from your website" button calls `POST /api/suggest/brand-from-site`
  (`{ website, name }` in, `{ descriptor?, tagline?, voice?, colours? }` out) only while the AI is ready, hides itself when the
  route answers 404, 405 or 501, fills only empty fields (or earlier suggestions) and marks what it filled. The logo step reads
  the logo's main colours in the browser with a canvas (`logo-colours.ts`).
- **Home.** The setup checklist is one card. `GET /api/overview/home` returns each step as `{ key, title, detail, to, done }`
  and, on the AI step, `missing` (`'provider'`, `'budget'` or `null`); the merged "Connect your channels" step (seven steps in all) carries `missing` too (`'account'`, `'routes'` or `null`).
- **A batch** is Writing, In review, Scheduled or Done. Its page is a four-step flow: Write, Review, Send drafts to Buffer,
  Go live. Steps 1 and 2 show the posts (`/batches/:id`); steps 3 and 4 show the plan, the sending and the Buffer status
  (`/batches/:id/schedule`, and `/batches/:id/schedule?step=live`). `?post=<id>` opens the batch at that post; the calendar
  uses it. The batch list's import tab is "Import a batch file", marked Advanced.
- **A post** is Writing, Approved, Draft in Buffer, Scheduled or Sent. Problems are flags on top of that, never a step of
  their own: Image could not be made, Has warnings, Needs a look, Failed to send, Deleted from Buffer, Removed.
- **The post page** replaces the old side sheet: a post is added at `/batches/:id/posts/new` and edited at
  `/batches/:id/posts/:postId`, a page with breadcrumbs, the form on the left and a live preview on the right. Network choices
  and captions are edited there and saved with the post: the networks are a row of icon chips (`web/src/components/network-toggles.tsx`,
  also used by New batch, Draft with AI and, as a one-channel filter, Publish), and the caption is tabs, "Same for all" plus one tab per
  network that is on, each with its character counter. Wording typed for a network that is then switched off is kept and saved with the
  post (never sent), and a note says so. The title follows the headline (else the first words of the caption) until someone types
  one, marked "From the headline"; a new post starts with its designed image on, marked "Auto", when the brand has a look. It has a picture picker and structured editors for figures, lists, carousel
  pages, tables and cards; a carousel's pages are listed one by one, each made with a built-in page layout or one of the brand's
  own layouts that has the feed size, whose fields the page then shows (`web/src/pages/batches/design-model.ts`); the raw design JSON is under "Advanced". The post card on the batch page is one row: a thumbnail, the title (a link to the
  post page), date, the networks it goes to, two lines of the caption, one status chip (plus a problem chip, whose popover lists
  what is wrong), one action (Approve, or Fix when something stops approval) and a More menu (Edit, Take approval off, the image,
  upload, Remove). The preview calls `POST /api/posts/preview-design`
  (`src/server/routes/design-preview.ts`, roles admin and editor): the body is `{ design, size? }`, and the answer is
  `{ ok, image, images, size, warnings, notes }` (`ok: false` with an `error` when the design was fine but could not be
  drawn). A design that saving would refuse is a 422 `{ error, details }`, in the same words as saving; a brand without its
  logos is a 409. Nothing is stored, and the drawing runs under the render lock, one at a time.
- **Facts and Pictures.** A fact has its own page, `/vault/:id` (`/vault/new` adds one). A picture has `/library/:id`; uploading
  is the page `/library/upload` (`/library?upload=1` redirects there). List filters live in the URL.
  Pictures has a Photos / Cut-outs / Graphics switch (`?role=cutout|graphic`; counts from `GET /api/vault/counts`). A picture
  item's `role` is chosen when it is made and may be changed on the picture's page ("Use as"; `PATCH /api/vault/:id` with `role`,
  which checks the stored file and makes the item unconfirmed again; only a graphic may be marked recolourable, `tintable`). A
  cut-out or graphic must be a PNG or WebP with an alpha
  channel, at least 256 px on its longer side (`services/image-header.ts`, which reads only the file header). Any picture, whatever its
  role, is refused above 16384 px on a side or 100 megapixels (a small file claiming a huge canvas would make Chrome decode it). The upload page
  asks `POST /api/vault/file-check?role=` (multipart, nothing stored) before it makes an item, so a refused file leaves no empty
  item; `POST /api/vault/:id/file` checks again. `GET /api/vault/graphics` is the compact list of cut-outs and graphics the
  look editor offers; a cut-out or graphic a post or look still uses cannot be deleted (`services/graphics.ts`). The AI is
  offered photos only.
  Each upload card shows the title (from the file name, marked so until edited), the kind (guessed from the file name), the
  description (required for photos), the licence and who is in the picture; tags, licence notes and the source link are under
  More details. With two or more files, "For all pictures" sets the licence, the people and tags on every card; a card that
  chose its own keeps it (`pages/library/upload-rows.ts`). A new fact's "Recorded on" starts as today and its title follows
  the first words of the text until a title is typed, each marked as filled in (`pages/vault/fact-form.ts`); the three dates
  fold into one "Dates" line. Small choices and the list filters are segmented buttons or chips (`SegmentedField` in the kit),
  tags are chips everywhere (`TagInput`), and the batch page's Show menu gives a count beside each choice.
- **Dialogs.** New batch and Draft with AI open as centred dialogs (`/batches/new`, `/batches/ai-draft` still open them). Both
  take the period as one tap (Next week, next month, the month after, or Custom with two dates; next month first). New batch
  names the batch from the dates ("December 2026", "Week of 30 November") until someone types a title, and keeps the time zone,
  the brand's, under "More". Draft with AI takes the number of posts as one tap too (5, 10, 15, 20, 30, or Custom).
  Draft with AI first asks `GET /api/batches/ai-draft` (`{ ready, missing: 'provider' | 'budget' | null }`) and, when drafting
  cannot run, says what is missing and where to add it instead of queuing a job that would fail; `POST /api/batches/ai-draft`
  refuses with a 409 in the same two cases. The Team
  and AI provider forms are dialogs too. The AI provider dialog fills what follows from the kind (`lib/ai-presets.ts`): Anthropic
  gets its address and a choice of model (Recommended `claude-sonnet-5-5`, Best quality `claude-opus-5-5`, Faster, cheaper
  `claude-haiku-5-5`) whose prices per million tokens come with it; OpenAI-compatible gets OpenAI's address and a model to type. The
  exact model id, the address and the prices are under Fine-tune, marked "Auto" or "From the model" while they are the filled ones, and
  a value a person typed is never replaced. The server checks them as before. Settings, Channels is one page with two sections: the Buffer accounts (compact rows, their forms are dialogs; `/settings/accounts`, `/admin/accounts` and `/admin/routing` redirect there, `#accounts` scrolls to the accounts) and a table with a row per network (where it posts). On load it asks the server for each account's channels, and that calls Buffer: local screenshot servers: add no Buffer accounts (the tests fake every outbound call and refuse any they did not expect, so they never reach Buffer). In the account dialog the
  Buffer organisation is a choice of the organisations the key check listed (from the row's Check key, or the dialog's own Check key
  button, which calls the same `POST /api/buffer-accounts/:id/check`); before a check it shows what is set, and the typed id is a
  fallback under Fine-tune. The caption limits are under Fine-tune too, each box showing the network's own limit.
- **Conventions.** Field help is behind an info icon (kit `Hint`, `hintMode`); pages use `PageHeader` with `crumbs`; small forms
  use `FormPanel variant="dialog"`; secondary and destructive actions sit in `MoreMenu`; on a desktop only the content area and the
  sidebar scroll. See `web/README-ui.md`.
- **Layouts** open their own page, not a side sheet: `/settings/layouts/new` (optionally `?from=<starter>`,
  `?duplicate=<layout id>` or `?copy=<built-in id>`) and `/settings/layouts/:id`. See "Settings, Layouts" below.

## The brand

An admin sets the brand in **Settings, Brand and look** (`/api/settings/brand`, `src/server/routes/brand.ts`):

- **Identity:** name, website, tagline, what the brand does, time zone, language, an optional single currency, and how the numbers of a chart are written (Numbers in charts: the decimal mark, the thousands separator, the currency sign before or after, a space before it or before %; brand.json `numbers`). The time zone
  is the shared picker (`components/kit/time-zone-picker.tsx`, over the one list of zones in `lib/time-zones.ts`): the zone with its
  offset and time now, a short list of likely zones (the one chosen, this browser's, places on the same clock, UTC) and a search over
  every zone by city or offset; "From this browser" marks the zone the browser is in.
- **Design direction:** the old "Design direction" tab is gone: choosing how kinds of post are drawn is **Settings, Looks** (below). The
  brand setting `style.direction` stays in the settings (an older choice keeps working; an active look overrides it in the pack).
  `GET /api/posts/post-kinds` (admin and editor) tells the post editor the brand's direction, each kind's fields and required fields,
  the look (variant) names of the direction's compositions, and the field limits, all read from the engine's registry; with a look in
  force the editor also reads `GET /api/looks/brief` (see Settings, Looks). The limits also give the counted lists (`items`, `info`,
  `gallery`: `{ min, max, chars }`), the fixed `infoKeys`, the `icons` a headline may name and the `chart` limits (`{ min, max, chars, kinds,
  units }`). The post editor then shows only what the look's designs draw: a Pill button and an icon grid on the headline (`[[words]]`,
  `{{name}}`), the Button words (`cta`), Info rows (a fixed label, added by tapping it, and a short line each), Round pictures (2 to 5 from the Pictures page, each
  with an optional name), a Portrait picture (`avatar`: one picture of the person a quote is by, from the same picker, with its position) and a Chart: what it is drawn as (the kinds the chosen design draws, or the design's choice), whether its numbers
  are a number, money or a percentage, which point stands out, a small table of points (a label and a number each; add, move, remove) and,
  for a donut or progress bar, what the one value is out of (`editor/ChartEditor.tsx`, `editor/chart-model.ts`). A gallery picture and the portrait are
  design nodes like the post's own picture: the same path rule, vault copy and rights checks, a face blocking approval until its consent
  is recorded (`services/design-images.ts`). A screen in Pictures is a framed phone capture, a bare phone screenshot (`phone-bare`: a plain
  one 1.6 to 2.4 times as tall as it is wide, read from its size at upload; the item page says so) or a desktop screenshot; a look's design
  that draws a phone round its picture (`device`) takes the first two and refuses a desktop screenshot or a photo before any render
  (`designScreenNeeds`), while a classic phone layout still takes only a framed capture. The
  `POST /api/settings/brand/direction-samples` route and its service were removed with the tab.
  With a look, the post editor's Design offers **Single image** or **Carousel**: a carousel is a cover, body pages and a closing page, each a
  post page of its own kind (moved, added before the closing page, removed; 2 to 10), drawn as one image per page and sent in that order. It
  warns when a network the post goes to takes fewer images (Instagram 10, X 4), and approval is blocked until pages are removed or that network
  is left out. Above the design, **Series** puts the post in one of the brand's named series with its number, which sets its kind, its design
  when the series chose some, and the mark in its label or tag.
- **Logos:** the full logo and the mark, as PNGs. The page measures where the wordmark starts. "Draw a simple logo from the
  name" makes a plain pair in the browser.
- **Colours:** four colours (primary, accent, dark, light), the headline weight, the corners and **contrast for large headlines**
  (`contrastDisplay`: null = the engine's standard 4.5; 3 to 7, anything else is refused with a 400; written to the pack as
  `contrast.display` only when set, and only when the engine's `validateBrand` knows the key (`withoutUnreadContrast` drops it, and logs
  `brand.contrast_display_unsupported` once, for an engine that does not); read back from a pack's `contrast.display`). While people pick
  colours, the page asks `POST /api/settings/brand/preview` (nothing is saved). The answer gives the colours posts will
  use, which colours were adjusted, and 32 contrast checks: headlines, sub lines, labels and accent words on every page
  colour and on both slabs of a myth-and-fact page, against the brand's contrast limits.
- **Type:** case, letter spacing and weight per role (headlines, body, labels), and each role's font: built in (Inter for
  the body; headlines in the body or label font; labels in IBM Plex Mono or the body font), a family from the curated
  Google Fonts list (in every weight the role is drawn at), or a woff2 file of your own. See "Google Fonts" below.
- **Logo placement and photo look** (Surfaces and photos): where the logo sits (it moves on posters, editorial pages and photo posts, with what
  shares its edge; a layout's own logo block stays where the layout puts it) and the photo treatment, whose colour is judged on the
  photo as treated. See "The brand file" in [docs/design.md](../../docs/design.md).
- **Post types** (the engine's `series`): each with its page colour and headline style.
- **Voice and visual direction:** in the team's own words, with names to spell exactly, and the switch for emoji in post images
  (off by default; on, each text on an image may carry up to three standard emoji, never the brand name).

The page has eight sections, each with its own address: `/settings/brand/<identity|logos|colours|type|surfaces|post-types|voice|advanced>` (`/settings/brand#logos`, used by the setup checklist, still opens Logos; `/settings/brand/direction` and `#direction` go to Settings, Looks). Uploads (logos, fonts, artwork) and Advanced save the moment they are done; everything else is one form that waits for Save, and asks before it is left with changes. "Other currencies to flag" is a list of words; a stored pattern that the list cannot show is edited under Advanced. While a look is in use (Settings, Looks; or the brand names a design direction), Type and Surfaces and photos open on one line, "A look is in use", pointing to Settings, Looks. What a look reads too stays in view: each role's font and font file (a look such as Clean takes its fonts from the brand), the photo treatment and the logo's place. What only the classic layouts draw (case, letter spacing and weight of type, headline size, the second half of a headline, cards and panels, decoration and artwork, what goes beside the logo) is behind "Settings for classic layouts only", which opens by itself when the server names a problem there.
- **Advanced:** a `brand.json` fragment merged over the rest, a dot map, and "Import a brand pack", which moves a pack's
  `brand.json`, logos and map in at once and keeps its exact colours and rules.

**Settings, Looks, Inspiration** (the design references; `/settings/looks/inspiration`, and `/settings/references` redirects there) takes pictures the team likes. A background job (`analyse-reference`) sends each one to
the drafting provider's model with the versioned `reference` prompt. The model writes a style brief (summary, palette,
type, layout, imagery, mood, what to avoid) that people can edit or switch off. The briefs that are switched on reach
every draft and rewrite as `brand.references`, next to `brand.voice` and `brand.visualDirection`. The drafting model must
be able to read images. On each described picture "Apply this look" proposes brand settings, and "Find the closest look" suggests a shipped look from the stored analysis alone (no AI call; "We can't tell from this picture yet" when the text settles fewer than two traits or no look is clearly closer); "Use this layout" (classic layouts) shows only while no look is active.

How it reaches the engine (`src/server/services/brand-settings.ts`):

- **Expanding the settings.** The four colours are spread over the engine's grounds, text, accents, gradient and
  surfaces. Each text colour is then fitted to the page colours it is set on (`fitContrast`). A colour that already
  reads is kept exactly; one that does not is moved towards black on light pages, or towards white on dark ones, only as
  far as the contrast limits need. The page says which colours moved. The layout values (shadows, window and phone chrome, lint and contrast limits, photo rules) come from the
  demo pack. Then the Advanced fragment is merged. Everything is checked by the engine's own `validateBrand` before it is
  saved.
- **Writing the pack folder.** `syncBrand` writes the result, the uploaded logos and font and the map as a pack folder
  under `state/brand/<hash>/` and points `BRAND_DIR` at it. It runs at start, after every change, and before every render
  and AI job, so several processes agree.
- **Before the logos exist.** Images are refused until the logos are uploaded.
- **Without a saved brand.** With no saved brand, no reference briefs and no layouts, the configured pack is used as it is.

### Google Fonts

An admin can give each type role (body, headlines, labels) a family from a curated list of about fifty Google Fonts
(`src/server/services/google-fonts.ts`: sans, serif, display, condensed, mono and handwriting families, each with the
weights it really has, its licence, SIL OFL 1.1 or Apache 2.0, and a one-line note). No API key is involved.

The server downloads the font once, when the admin picks it, and stores it like an uploaded font. The browser never talks
to Google: the render page blocks every request and embeds the stored files as `data:` URIs, and the app's own CSP allows
fonts from the app only. The picker lists the names in the app's font; the font in force for each role is shown in its
own face from the server's copy.

| Route (admins only) | Does |
|---|---|
| `GET /api/settings/brand/google-fonts` | the curated list: `{ categories, fonts: [{ family, category, weights, licence, note }] }` |
| `POST /api/settings/brand/google-font` | `{ role, family }` (and an optional `weight`, which older pages send: it must be one the family offers and is brought as well): the family must be on the list (no address is made from free text). The server works out the weights the brand draws that role's family at with the saved settings (the engine's `familyWeights`, see [docs/design.md](../../docs/design.md), "Weights by role") and, for each, the weight the family has or the nearest it has; asks `https://fonts.googleapis.com/css2?family=<Family>:wght@<w1>;<w2>;...&display=swap` once with a browser User-Agent; keeps each weight's `latin` and `latin-ext` faces; downloads each distinct woff2 file once from `https://fonts.gstatic.com/` only (no redirects, 2 MB per file and 8 MB for all files of a pick, at most nine weights, the `wOF2` signature checked) and stores them with their unicode ranges and weights. A headline or label font is switched on for its role. Audited as `brand.font.google` (family, weights, licence, files, subsets, bytes). Google refusing the family or a weight, failing, or being unreachable gives a 502 with a plain message and nothing is stored; an oversize file or pick gives 413. |
| `GET /api/settings/brand/font/:role` | the stored font of a role (the latin file of its regular weight, or the nearest), for the page's preview |

Each stored weight is its own `@font-face` rule, declared for the weights it is the nearest to, so bold text in that role
is drawn with the family's true bold (or the nearest weight it has) and the browser never draws a synthetic bold. The
brand view's `fontSources.<role>.google` says `{ family, weights, missing }`: the weights brought, and the weights the brand
now draws the role at that the font was stored without (after the headline weight changed, or for a Google font saved
with one weight before fonts came in several). The form lists both; picking the font again adds the missing ones, and until
then the nearest stored weight stands in. Change the weights and save before picking a font. An uploaded font stays one
file, declared for every weight.

**Outbound hosts.** Only when an admin picks a Google font does the server connect to `fonts.googleapis.com` and
`fonts.gstatic.com` (HTTPS). A deployment with an egress allowlist must allow both for the feature; nothing else needs them,
and rendering never does. Uploading a woff2 file needs no outbound access.

**Settings, Layouts** (`/api/settings/layouts`, `src/server/routes/layouts.ts`, admins only; "Classic layouts" in the menu, shown
only while no look is active) holds the brand's own compositions: blocks placed in slots on a grid, as data the engine's layout validator checks
(`packages/engine/lib/design/layout.mjs`; the format is in [docs/design.md](../../docs/design.md), "Your own layouts"). The
editor covers everything a brand's layout can say, from the engine's catalogue (`layoutCatalogue().pages`) for the layout's
kind of page: blocks dragged and resized on a canvas, snapped to the grid's cells, or placed in pixels, on every size or per size; every option, the blocks
inside a slab, the condition each block is drawn on ("Show this block": a field filled or empty, a carousel page, a choice's
values), the page colour as one ground or cases, sizes, grids and fields. It sketches the page as it changes, "as if" a field
were empty, as a single post or as page 1, a middle page or the last page of a carousel, or with a choice's value, shows the engine's verdict as you type and draws a real preview of that case with
the brand (the canvas's "Real image" view); the layout's JSON, under "Advanced: JSON", shows the layout as the engine reads it, and switching between them loses nothing
(`web/src/pages/settings/layout-model.ts`, checked by `src/web-layout-model.spec.ts`; see docs/design.md, "Editing a layout"). Starting points like the built-in pages come from the engine
(`lib/design/layout-starters.mjs`), and so do the built-in templates' own layouts, listed read only with a sketch, their variant and
their fields: "Duplicate to edit" copies one into a layout of the brand's own (`builtinCopy`), switched off, on the built-in
poster or editorial page, where the editor sets each block's rectangle in pixels and its options, conditions and ground cases
from the page's own lists (`layoutCatalogue().pages`). What reads a built-in template's own design settings, and
the photo post's and page covers' pages, are refused for a brand's layout (see [docs/design.md](../../docs/design.md), "Starting
from a built-in layout"). Layouts are stored in `brand_layouts`; the enabled ones go into the pack's `brand.json`
as `layouts` on every sync (one that no longer passes is left out and logged), where a post's design names one
(`{ "template": "layout", "layout": "<id>", ...fields }`) and the AI is told about them.

| Route | Does |
|---|---|
| `GET /api/settings/layouts` | the layouts, the starting points, the built-in layouts (`builtins`: read only, each with `template`, `variant`, `copyable` and `why` not) and the engine's catalogue (`catalogue.pages`: every kind of page a brand's layout may use, with its blocks, options, fields, conditions and grounds) |
| `POST /api/settings/layouts` | add one: `{ definition, origin? }`, `{ starter, name? }` (a copy of a starting point under a free id) or `{ builtin, name? }` (a copy of a built-in layout under a free id, switched off; 400 with the reason for one a brand may not use) |
| `POST /api/settings/layouts/validate` | `{ problems }` for a definition, nothing stored |
| `POST /api/settings/layouts/preview` | `{ definition, size?, sample?, empty?, artefact?, page? }`: one image drawn with sample words (`empty`: fields left empty; `artefact`: the sample artefact's type; `page`: `first`, `middle` or `last` draws it as that page of a carousel of three, at the feed size) through the renderer and every check, under the render lock, as a JPEG data URL; nothing stored |
| `PUT /api/settings/layouts/:id` | replace the definition; a new id is refused while a post (or a carousel page) uses the old one |
| `PATCH /api/settings/layouts/:id` | `enabled`, `position` |
| `POST /api/settings/layouts/:id/duplicate` | a copy under a free id, switched off |
| `DELETE /api/settings/layouts/:id` | refused while a post's design, or a page of a carousel, names it |
| `GET /api/layouts` | any signed-in person: the layouts of the brand in force and the fields each takes, for the post editor (a post, or a carousel page, made with one; the editor lists a carousel's pages one by one, and a page may use a layout with a feed size) |

**Settings, Looks** (`/api/settings/looks`, `src/server/routes/looks.ts`, `src/server/services/looks.ts`, admins only) holds the
brand's looks: whole ways of composing a post, as data the engine's look module checks (`packages/engine/lib/design/look.mjs`;
`validateLook`, `lookBrief`, `lookHash`). Classic layouts above stay as they are; a brand with an active look ignores them.
A look is named by a reference everywhere: `shipped:<id>` (the engine's own looks: global, read only, never rows; loaded by one
adapter, `shippedLooks()` over the engine's `shippedLooks()`) or `own:<slug>` (a slug is lowercase letters, digits and `-`, never contains `:`, and
never equals a shipped id). Tables `brand_looks` (the look without compositions, `origin`, `engineSchema`, `status` draft or ready,
`gate`) and `brand_look_compositions` (`definition` is what is drawn, `draft` holds unpublished edits and never affects drawing,
`enabled`, `gate`); the active look is a pointer, `brand_profiles.activeLookRef` (`shipped:<id>`, `own:<slug>` or null for classic
layouts), so it can only be set once the brand is saved in Settings, Brand. A newly saved brand starts on the shipped Clean look
(`shipped:clean`); brands saved before keep their choice. There is no blank look: a brand starts from
`POST /duplicate` (a deep copy of a shipped look or one of its own, a draft). **The scope rule:** every service function takes
`{ brandId }` first (from `brandScope(c)`, the one place that decides it; a constant today) and every query filters on it, a row
is found by (brandId, slug) or uuid and brandId, and no route reads a brandId from a request; `brandId` is a plain indexed
column (not a foreign key, because the profile row exists only once Settings, Brand is saved). Limits per brand: 20 looks,
21 compositions per look (3 per kind), a look up to 256 KB. A look the installed engine refuses is left out of drawing and logged
once (`look.skipped`) and the list marks it `needsAttention`. The active look can be edited like any other (every change is
validated whole first; a design's edits still go through its draft, and publishing it runs the gate); only deleting it is refused
(409), so the brand is never left drawing nothing. An edit to the active look marks it Draft until it is published again, and it stays
in use meanwhile. What an edit changes: every post drawn from then on uses the look as it is. Images already made are stored files and
do not change; a post is drawn again only when its design changes or someone asks for it (nothing re-renders by itself). A post that
names a design by number (`variant`) keeps the number, so moving, switching off or removing a design of that kind can change which
design the number names, or put it out of range (that post's next render then says so). Copying a look (Duplicate) stays the way to
try changes without touching posts.

| Route | Does |
|---|---|
| `GET /api/settings/looks` | `{ activeRef, shipped, own, catalogue, limits, fonts }` (`fonts`: the font library's families with their lowest and highest weight and whether they have an italic and a width axis, for the typeface pickers) |
| `GET /api/settings/looks/:ref` | one look in full; an own look with its drafts and gate records |
| `POST /api/settings/looks/duplicate` | `{ source, name?, slug? }` |
| `POST /api/settings/looks/validate` | `{ problems }` for a whole look, nothing stored (the Settings tab's Fine-tune asks it before writing a grouped value) |
| `POST /api/settings/looks/preview` | `{ ref }` or `{ look }` (a whole look as the panel holds it, validated first) and optionally `kinds`: `{ hash, samples: [{ kind, ok, image, error, warnings }] }`, one picture per kind (the first design of the kind, sample copy), drawn by `lookRenderer()` (`services/look-render.ts`, connected at start with `setLookRenderer`; 501 when none is connected, as in tests that do not connect one); `superseded: true` with no samples when a newer request from the same person for the same look replaced this one while it waited |
| `POST /api/settings/looks/preview-design` | one design on its own, for the design editor: `{ ref }` or `{ look }`, `kind`, `index` (among all the look's compositions of the kind, enabled or not), optionally `draft` (an own look's unsaved composition swapped in), `scenario` (`sample`, `stress` = the longest copy it accepts, `minimal` = only what it needs) and `withRects`: `{ hash, image, rects: [{ el, x, y, w, h, rot }], warnings, problems }`. `el` is the element's address in the composition (digits and dots: `2`, `2.0`; a seam's sticker is the child after its children). An unfinished draft is not drawn: `problems` come back with status 200 so the editor keeps its sketch. Drawn by `lookRenderer().previewComposition` (optional on the renderer, so a renderer that only draws samples answers 501 here too); `rects` come from the page's own `postMetrics().els`; a refusal of the engine's page checks comes back as `problems` with status 200, never a 500 |
| `POST /api/settings/looks/:slug/gate` | the render checks: every enabled design is drawn with sample, stress (the longest copy that holds, down to half of the limit its brief states) and minimal copy under the engine's own page checks (class `gate` of the render queue, one Chrome run, at most 150 s once running; a design not reached fails with "ran out of time"), and a record `{ passed, checks: [validate, render:sample, render:stress, render:minimal] }` is stored on each design; answers `{ look }`. Without a renderer it validates only |
| `GET /api/settings/looks/fonts/:family/:file` | a shipped font file (woff2) for the typeface cards: only a `family` and `file` the engine's `design/fonts/library.json` lists are served (a lookup in a map built from it; nothing from the request reaches the file system), `cache-control: private, max-age=31536000, immutable`; admins only; the page's CSP already has `font-src 'self'`. `GET /api/settings/looks` lists each family's `files` (`file`, `style`, `weight`, `range`) |
| `PUT /api/settings/looks/active` | `{ ref }`: a shipped look or an own look that is ready; `null` for classic layouts; writes the brand pack |
| `PUT /api/settings/looks/:slug/settings` | `{ definition }`: the look without compositions, checked with the compositions it has; resets the gate |
| `POST /api/settings/looks/:slug/compositions` | `{ source, kind, index }`: copy one composition from a shipped or an own look |
| `POST /api/settings/looks/:slug/compositions/:id/validate` | `{ definition }`: `{ problems: [{ path, message }] }` for a draft swapped into its look, nothing stored (the design editor's check as it is edited; paths read `compositions[n].elements[i].children[j].size`) |
| `PUT` / `DELETE /api/settings/looks/:slug/compositions/:id/draft` | save (the whole look must validate with it) or discard a draft |
| `POST /api/settings/looks/:slug/compositions/:id/publish` | the draft becomes the composition, once the gate passes (validation and the render checks above; `runGate` replaces them in tests) |
| `PATCH` / `DELETE /api/settings/looks/:slug/compositions/:id` | `{ enabled?, position? }` (position among its kind); remove (never the last of its kind) |
| `POST /api/settings/looks/:slug/publish` | the look is `ready`: it validates and every enabled composition has a passing gate record for its current definition (the checks are run now for any that has none, in one Chrome run; a failure names the design and the reason) |
| `DELETE /api/settings/looks/:slug` | refused while active (the only change that is) |
| `GET /api/looks/brief` | any signed-in person: `{ look }`, the active look's kinds, variants, fields and budgets (`lookBrief`), or `{ look: null }` |

**Named series** (`/api/settings/series`, `src/server/routes/series.ts`, `src/server/services/series.ts`, admins only; table `brand_series`,
migration `20261201000000_brand_series`). A series is a recurring format of the brand ("Tip of the week"): a `kind` of post, up to three of the
active look's designs of that kind (`variants`, remembered with the look they were chosen in, `lookRef`, and ignored while another look is in
use), an optional `mark` with `{n}` or `{nn}` for the number (`Tip #{n}`) written into the post's `label` or `tag` (`markField`), a `cadence`
(`weekly`, `fortnightly`, `monthly`), an optional `weekday` (0 Monday) and a `firstNumber`. Every create and change is checked by the engine's
`seriesProblems` against the look in use (no look: 400); at most 12 per brand. The next number is worked out, never stored: one more than the
highest `seriesNumber` of a live post of the series, or `firstNumber`. A post links to a series with `Post.seriesId` and `Post.seriesNumber`
(`PATCH /api/posts/:id { series: { id, number } | null }`, also on new posts; a change does not take an approval back, since the reader sees
only the design's own label); deleting a series keeps its posts and drops the link. An imported batch links a post's `series: { slug, number }`
by slug and warns about a slug the brand has none of. The AI draft job passes the enabled series with their next numbers (`forDrafting`) to
`draftBatch` as `recurring`, and a rewrite of a series post keeps its mark. In Settings, Looks, Series a series is added and edited in a centred
dialog (with the unsaved-changes guard); its mark is chosen from No mark, Tip #12, No. 12 and Part 12 (`looks/series-marks.ts`), or
Custom for a mark typed with `{n}`; where the mark goes and the first number are under Fine-tune.

| Route | What it does |
| --- | --- |
| `GET /api/settings/series` | `{ series: [{ id, slug, name, kind, variants, lookRef, mark, markField, cadence, weekday, firstNumber, enabled, position, nextNumber, posts, nextMark, designsInLook, problems }], look: { ref, name, kinds: { kind: [{ index, name, fields }] } } \| null, limits }` |
| `POST /api/settings/series` | `{ name, kind, variants?, mark?, markField?, cadence, weekday?, firstNumber?, enabled? }` (201) |
| `PATCH /api/settings/series/:id` | any of those, or `{ enabled }` / `{ position }` alone |
| `DELETE /api/settings/series/:id` | remove it; its posts lose the link and keep their words |
| `GET /api/series` | admins and editors: `{ series }`, the same rows, for the post editor |

**The design editor** (`/settings/looks/:slug/designs/:id`, `apps/web/web/src/pages/settings/looks/`; see `web/README-ui.md`) edits one composition
visually: the layers and a library of pieces, a canvas, and the settings of the selected piece, with the JSON under Advanced. Every control edits the
composition through `design-model.ts` (pure; `src/web-design-editor.spec.ts` loads, edits and checks every composition of every shipped look). It checks the
draft as it is edited with the `validate` route, draws it with `preview-design` and falls back to a sketch drawn in the browser while that answers 501, saves
with `PUT .../draft` and publishes with `POST .../publish`.
A look in use is edited there like any other; the page says that only a published design reaches posts.
A **Chart** piece (the post's `chart`) is added bound to the field, as bars in the brand colour with the highlighted point in the accent (on a coloured
or dark ground it takes an ink that reads there). Its choices come first as chips (`design/parts.tsx`, `design/chart-choices.ts`): what it is drawn as
(bars, bars across, line, area, sparkline, donut, progress bar), the axis (none, a baseline, a light grid), the corners, values and labels on or off and, for
a line kind only, "Start the axis near the data"; the colours, the dots, the line width, the thickness and the type sizes are under Fine-tune.
A **Pattern** piece (`backdrop`) is chosen from thumbnails (`design/surfaces.tsx`: one per pattern, and a row of ready-made settings whose quiet ones keep
words easy to read), with its colours as swatches and its strength and fade as chips; scale, density, strength, angle, seed and centre are under
Fine-tune. A text or a fitted headline has a **Crosses a shape** group: No, one of the design's filled shapes by name, or Any shape; choosing a shape names
it (its `key`) and sets the text's `overlap` in one step, and an outline for words that cross two grounds is under Fine-tune.

**Drawing a look** (`services/look-render.ts`, connected in `src/server/index.ts` with `connectLookRenderer`). Everything goes through the render queue
(`services/render-queue.ts`: posts, then previews, then gate jobs, under the engine's single Chrome lock; a newer request with the same key, one per person
and look, replaces one still waiting; a preview that waits over 60 s is dropped; a gate over 5 minutes). The brand is the one in force (the pack `syncBrand`
wrote: its colours, fonts and logo), with the look asked for as its direction; a brand with no logo yet draws a placeholder one and warns. The words are
neutral sample copy made from the look's own brief (`services/look-copy.ts`: no customer's text; the stress copy is tried at 100%, 85%, 70%, 60% and 50% of each limit and
the longest that the engine accepts is the one drawn), the picture of a photo, event or offer is a synthetic one the engine ships
(`design/assets/demo/`). The look and the design are validated by the engine (`resolveLook`, `validateDesign`) before any drawing; nothing here builds markup.
**Brand graphics and cut-outs** a design places (its `graphic` pieces name a vault item by `ref`) are found by the app, never taken from a request: for a
design of a look, the composition being drawn (`lookCompositionGraphics`, the draft when one is swapped in); for a post (the render job and
`POST /api/posts/preview-design`), the composition the engine will choose for it, or for each post page of a carousel (`designGraphicNeeds`: the named or
hashed variant, then the next that accepts the words). Each item must be in the vault, of this brand, not deleted, a picture whose role is `cutout` or
`graphic`, with a PNG or WebP file (`services/design-images.ts` `graphicProblem`; being confirmed is not needed to draw, as for a post's photo). Its file is
copied into the run's own folder like a post's vault photo (`copyVaultFile`) and the spec gets `graphics: [{ ref, image, tintable }]` (`tintable` only for a
graphic marked recolourable); the copy is removed afterwards. A graphic that is missing, deleted, has changed role or has no usable file refuses the drawing
with a message that names the design and the graphic ("The design "Stack" places the brand graphic "Leaf mark", which was deleted from Pictures ...", a
carousel's prefixed with its page), before Chrome starts: the render job fails with it, the post preview answers `ok: false` with it, and the design editor
and the gate show it as the design's problem. A design that sets `graphics` itself is refused like any invalid design.
**What is cached:** sample pictures only, in memory, at most 64, by look hash + brand hash + the state of the vault graphics the look places + kind (the brand
hash is the pack's files and brand file without its looks and direction, so changing the active look does not empty it); a design preview is never cached (a draft changes at every key) and neither is a
refusal caused by a busy or broken Chrome. A gate record is stored on each design and goes stale with the design's definition; it does not know the brand, so a
changed brand is not rechecked until the checks are run again.
The brand pack carries the active look (`looks: [<the look>]`, `style.direction` = its id; a shipped look is written as a copy of itself, `copy:shipped:<id>`), so
the render job and `POST /api/posts/preview-design` draw `template: "post"` designs with it, a post is held to the look's own designs and budgets before drawing
(`designBlockProblems` reads the look), and `GET /api/posts/post-kinds` answers from the engine's `postKinds(brand)` for it.
`src/server/services/render-queue.ts`: the older previews (`routes/layouts.ts`, `routes/brand.ts`, `routes/design-preview.ts`) still take the render lock directly.

A design reference's analysis may suggest a layout (`analysis.composition`); it is checked by the same validator before it
is stored, and "Use this layout" on the reference previews it with the brand before an admin adds it.

The public routes:

| Route | Sign-in needed | Answers |
|---|---|---|
| `GET /api/app` | no | `{ appName, brand: { name, website, timezone, series: [{ key, name }], logo } }`. Public on purpose: the sign-in page needs it, and it holds nothing that is not on the brand's own posts. `logo` is `/brand/logo-mark.png?v=<version>`, or `null` while the saved brand has no logos. |
| `GET /brand/logo-mark.png` | no | The brand's logo mark, for the app's frame; 404 when there is none. |

`appName` is `APP_NAME`, or `Vesk`. A vault that has already been seeded is never replaced.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Runs the server with reload (the variables below must be in the environment) |
| `npm run dev:web` | Runs the Vite dev server on :5173, proxying `/api` to :3000 |
| `npm run build` | Generates the Prisma client, compiles the server to `dist/server`, builds the web app to `dist/web` |
| `npm start` | Runs the built server |
| `npm run migrate` | `prisma migrate deploy` |
| `npm test` | Vitest, one file at a time, against a real Postgres (see below) |
| `npm run typecheck` | Server, tests and web |

## Tests

Tests need Postgres and run one file at a time against a real database (no mocked database; Buffer is faked through the
injectable `fetchImpl`, storage through the local or memory driver). Start a throwaway Postgres 16 and run them:

```bash
docker run -d --name vesk-test-pg -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:55440:5432 postgres:16
npm test                            # database vesk_test on 127.0.0.1:55440, created and migrated on first use
TEST_DB_NAME=vesk_other npm test   # another database, so two runs do not clash
```

The tests refuse to start when `@vesk/engine` or `@vesk/ai` resolves to another checkout of the repository (a git worktree
without its own install finds the main checkout's packages by walking up the folders, and would test this app against
another engine). Run `npm install` in the checkout, or link `node_modules/@vesk/engine` and `node_modules/@vesk/ai` to its
own `packages/engine` and `packages/ai`.

Set `TEST_DB_NAME` for another database name and `TEST_DATABASE_ADMIN_URL` for another server (default
`postgresql://postgres:postgres@127.0.0.1:55440/postgres`). Test files are named `*.spec.ts` so the repository's root
`node --test` does not pick them up. Helpers are in `src/server/testing.ts` and `src/server/testing-batches.ts`.
The render specs launch real Chrome or Chromium (`CHROME_PATH`), one at a time. `npm run typecheck` covers the server, the tests and the web app.

## Environment variables

Settings are read once at start (`src/server/config.ts`). A missing or invalid value stops the server with a message
that names the variable, never its value.

| Variable | Meaning |
|---|---|
| `NODE_ENV` | `development` (default), `test` or `production`. Production turns the rate limits on unless `RATE_LIMIT` says otherwise. |
| `PORT` | HTTP port, default 3000 |
| `DATABASE_URL` | Postgres connection string |
| `APP_URL` | Public address, used for invite and reset links and the origin check |
| `BETTER_AUTH_SECRET` | Session secret, 32 or more random characters |
| `APP_ENCRYPTION_KEY` | Base64 of 32 random bytes; encrypts stored Buffer and AI keys |
| `APP_ENCRYPTION_KEY_VERSION`, `APP_ENCRYPTION_KEY_OLD` | Key rotation: the current key's version (default 1) and older keys as `version:base64,version:base64` |
| `BOOTSTRAP_ADMIN_EMAIL` | On first start with no users, makes an admin invite and logs its link once |
| `BRAND_DIR` | The brand pack, a folder under `brands/` relative to the repository root, for example `brands/acme`. Default `brands/demo`. It must stay inside the repository; a blank value counts as unset. Read by the engine, the AI library and the app. The app uses it only until a brand is saved in Settings; after that it points `BRAND_DIR` at the folder it writes under `state/brand/`. |
| `APP_NAME` | The name in page titles, emails and the sign-in page. Default: `Vesk`. |
| `SEED_VAULT`, `SEED_SECRETS_B64` | `SEED_VAULT=0` turns off the automatic vault seed; `SEED_SECRETS_B64` is the one-time secrets seed, removed after the first start (see Seeding a new deployment) |
| `TRUSTED_ORIGINS` | Extra origins allowed to make changes, comma separated (for the Vite dev server) |
| `TRUSTED_PROXY_HOPS` | How many proxies in front of the app append to `X-Forwarded-For`, default 1 (Traefik on Dokploy). The client address is the Nth entry from the end; everything before it is caller-written and ignored. With no header the socket address is used. |
| `RATE_LIMIT` | `on` or `off`. Default: on in production, off elsewhere. Set `on` to try the limits locally or in a spec. |
| `STORAGE_DRIVER` | `local` (a directory, `LOCAL_STORAGE_DIR`) or `s3` (uses the `S3_*` variables). Default `local`. |
| `LOCAL_STORAGE_DIR` | Directory for the `local` driver, default `.data/storage` (relative to `apps/web/`) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` | Required with `STORAGE_DRIVER=s3` (the engine's `loadS3Config`). `S3_PUBLIC_BASE_URL` is the public address of the bucket; Buffer is given URLs under it. |
| `S3_REGION` | Region, for Hetzner the location (`fsn1`, `nbg1`, `hel1`). Taken from the endpoint when it is a Hetzner `*.your-objectstorage.com` host; required otherwise. |
| `S3_PREFIX` | The public prefix, default `public/`. Vault files (`vault/`) and renders (`renders/`) stay private; only what is about to be sent is copied under this prefix. The bucket is publicly readable, so private objects are protected only by an unguessable key: `vault/<random>/<id>/<sha>-<name>` and `renders/<random>/<batchId>/<postKey>/<sha>-<name>`, where `<random>` is 32 random bytes in base64url (43 characters) drawn per object and stored in the database. Old keys without it still work. |
| `S3_PATH_STYLE` | `false` for virtual-hosted style addressing; default is path style |
| `CHROME_PATH` | Path to the Chrome or Chromium executable, read by the design engine. Unset, it looks for Chrome, then Chromium, in the usual places. Without either, rendering fails with a message that says so. |
| `VESK_CHROME_LOCK` | Optional. The absolute path of the machine-wide lock that keeps one Chrome running at a time; default `vesk-chrome.lock` in the system's temporary folder. Every checkout on the machine must use the same one. |
| `VESK_CHROME_LOCK_WAIT_MS` | Optional. How long a render waits for another one's Chrome before it stops with the reason; default 1800000 (30 minutes). |

Buffer keys and AI and search provider keys are not environment variables: an admin enters them in Settings (Buffer
accounts; AI and search), and they are stored encrypted with `APP_ENCRYPTION_KEY` (AES-256-GCM, a fresh nonce per value,
with the key version). The pages show only their last four characters; keys are never returned to the browser, logged or
put in a job payload. A new deployment can be seeded with them once (see "Seeding a new deployment").

### Client address and rate limits

The client address is worked out in one place (`clientIp` in `src/server/middleware.ts`). A middleware that runs first
removes any `x-vesk-client-ip` header the caller sent and sets it from the trusted address; Better Auth reads that header
only, so a spoofed or rotating `X-Forwarded-For` cannot get past its limiter or ours.

When `RATE_LIMIT` is on, each of these answers 429 with `Retry-After` once a bucket is full (15-minute window):

| Where | Counts | Limit |
|---|---|---|
| Sign-in | failures per email and address; per address; per email | 5; 20; 20 |
| Password reset request | every request, per email; per address | 5; 20 |
| Password reset confirm | failures per address (token guessing) | 10 |
| Invite lookup and accept | failures per address (token guessing) | 20 |
| AI suggestions (`/api/suggest/*` POSTs) | every request, per person; at most 3 at once per person | 60 |

The per-email buckets mean someone who knows an address can lock that person out of sign-in for 15 minutes; an admin
can still make a reset link. Buckets are in memory and clear on restart. Test apps default to `RATE_LIMIT=off`; pass
`createTestApp({ config: { RATE_LIMIT: 'on' } })` to test the limits.

### Email

Invite and password-reset emails go through the first transport that is configured:

1. **ZeptoMail** (primary): set `ZEPTOMAIL_API_KEY` and `MAIL_FROM`.
2. **SMTP** (optional alternative): set `SMTP_HOST` (and `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).
3. **Neither:** nothing is sent, and the admin page shows the invite or reset link to copy.

If both are set, ZeptoMail is used.

| Variable | Meaning |
|---|---|
| `ZEPTOMAIL_API_KEY` | ZeptoMail send-mail token. Sent as `Authorization: Zoho-enczapikey <key>` to `https://api.zeptomail.com/v1.1/email`. Never logged. |
| `MAIL_FROM` | Sender address, for example `noreply@example.com`. Required with `ZEPTOMAIL_API_KEY`, also used by SMTP. Without it the sender is `no-reply@localhost`. |
| `MAIL_FROM_NAME` | Sender name. Default: the brand's name from the pack's `brand.json`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | The SMTP alternative; port defaults to 587 |

When a send fails, the invite or reset link is still created and returned. The response has `emailed: false` and
`emailFailed: true`, so the page can show "email not sent" next to the link. `emailed: false` without `emailFailed`
means no transport is set up. The error from ZeptoMail carries the status and a short excerpt with the key removed.
Every value placed in the HTML body (names, links, addresses) is escaped.

## Seeding a new deployment

`src/server/seed.ts` runs at start-up, right after the bootstrap admin step. It only fills what is empty, so a second
start changes nothing, and it logs counts, names and field paths, never a key (`seed.done {vault: 13, ...}` for the demo
pack; a start with nothing to do logs nothing).

| Variable | What it does |
|---|---|
| (none; `SEED_VAULT=0` turns it off) | On a start where the vault has never held an item, imports the brand pack's `vault.json` (`brands/demo/vault.json` by default, invented facts only) and, when no research topics were ever saved, its `research.topics`. A marker setting (`seedVaultImportedAt`) records the import, so it never returns, even after every item is deleted. |
| `SEED_SECRETS_B64` | Opt-in. Base64 of `{ bufferAccounts: [{ name, apiKey, keyExpiresAt?, organizationId?, captionLimits? }], routing: [{ network, account, channelId }], aiProviders: [{ kind, baseUrl?, model, apiKey, tasks, priceInPerMTok?, priceOutPerMTok? }], search?: { kind, apiKey }, aiMonthlyBudgetUsd? }`. Remove it after the first start (`seed.remove_env` reminds you). |

The secrets go through the same service functions as the admin pages (`services/buffer-accounts.ts`,
`services/routing.ts`, `services/ai-settings.ts`) and the same validators, so keys are encrypted with
`APP_ENCRYPTION_KEY` as usual. A Buffer account is created only if no account has that name; a route only for a network
with no route yet (to an account that exists); AI providers only when there are none; search and the budget only when
unset. An invalid part is skipped with `seed.invalid {part, field, problem}`; the other parts still run.

Vault items keep the `status` the file gives them, with no creator and no confirming user: whoever wrote the pack's
`vault.json` vouches for the confirmed ones, and each item has an audit entry `seed.vault_import` by actor `system` (with a
`confirmedBy` note on a confirmed item). The file is `{ note?, vault: [...], research?: { topics: [...] } }`. Field
mapping: `kind` (`product` becomes `product_note`), `title`, `body`, `sourceUrl`, `sourceNote` to `sourceNotes`, `status`,
`validFrom`, `validUntil`, `tags`.

Build the secrets on your own machine with `scripts/make-seed-secrets.mjs` (plain Node, from the repository root):

```bash
node apps/web/scripts/make-seed-secrets.mjs --anthropic-env <env file holding AI_ANTHROPIC_API_KEY>
```

It reads two files at the repository root, both git-ignored, prints only which parts it included, and writes
`SEED_SECRETS_B64=...` to `deploy/staging.env.local` (git-ignored, mode 600), replacing earlier `SEED_` lines:

- `accounts.json`: the Buffer accounts and the routing. Each account names the environment variable that holds its key
  (`keyEnv`), never the key:

  ```json
  {
    "accounts": [
      { "name": "main", "keyEnv": "BUFFER_KEY_MAIN", "organizationId": "", "captionLimits": { "x": 280 } },
      { "name": "second", "keyEnv": "BUFFER_KEY_SECOND" }
    ],
    "routing": {
      "x": { "account": "main", "channelId": "..." },
      "instagram": { "account": "second", "channelId": "..." }
    }
  }
  ```

- `.env`: `KEY=value` lines with the keys `accounts.json` names (for example `BUFFER_KEY_MAIN=...`) and, optionally, one
  of `BRAVE_SEARCH_API_KEY`, `TAVILY_API_KEY` or `EXA_API_KEY` for search.

An account whose key is missing is left out, and so is any route to it or to a network the app does not support.
Options: `--anthropic-env <file>` (an env file with `AI_ANTHROPIC_API_KEY`), `--root <dir>` and `--out <file>` (for
tests). See `deploy/README.md` section 4a for the deployment steps.

## Roles

There are two roles, set on the invite and changeable by an admin. Every route checks the role on the server; the web app
only hides what a role cannot do.

| Role | Can do |
|---|---|
| `admin` | Everything: users and invites, Buffer accounts, channel routing, AI and search settings, audit log, plus all editor work. Can schedule live and delete from Buffer on any batch. |
| `editor` | The vault, batches, posts, review and approval, the plan, sending drafts, refreshing status, reading routing. Schedules live and deletes from Buffer only on batches they own. |

Sign-up is closed: an account exists only through an invite (or the bootstrap invite). At least one active admin must
remain.

## Jobs

Background work runs in pg-boss, started with the server (`src/server/jobs/`). Payloads hold ids only, never secrets. The
handlers are plain functions (`src/server/jobs/handlers.ts`), so tests call them directly.

| Job | Payload | Does |
|---|---|---|
| `render-post` | `{ postId }` | Renders the post's `design` block with the real design engine and Chrome into private storage under `renders/<random>/<batchId>/`. One at a time, one waiting job per post. Queued when a batch is imported and when a post's design changes. |
| `send-batch` | `{ batchId, mode, actorId, planToken }` | Copies the media about to be sent to the public prefix, then runs the engine's push loop against Buffer as `draft` or `live`. Never retried: an unclear answer is stored as `unknown` for a person to resolve. |
| `refresh-delivery` | `{ batchId }` | Lists scheduled and draft posts in each Buffer account and reconciles the deliveries. |
| `refresh-sweep` | none | Cron, every 15 minutes: enqueues `refresh-delivery` for batches that have deliveries to check. |
| `draft-batch` | `{ actorId, brief }` | Asks the AI for a batch and imports it as a draft batch owned by `actorId`, marked as an AI draft, with a render queued for each design (see AI, below). Queued by `POST /api/batches/ai-draft`. |
| `research-run` | `{ actorId?, topics? }` | Calls the AI adapter (below). |
| `rewrite-post` | `{ postId, instruction, apply?, actorId? }` | Asks the AI to rewrite one post from its linked facts. With `apply` (what `POST /api/posts/:id/rewrite` sets) the answer is saved as an edit by `actorId` through the same checks as `PATCH /api/posts/:id`: title, caption, per-network captions, date, time, design and sources; approval is taken off and a changed design is made again. The run keeps the caption before and after. Without `apply` it only returns the answer. |

## Rewrite a post with AI

`POST /api/posts/:id/rewrite` (admin and editor; in `src/server/routes/review.ts`) takes `{ instruction }` (1 to 500 characters, trimmed;
the post page's dialog builds it from quick asks such as Shorter or Fix the facts and optional words of one's own, `pages/batches/rewrite-asks.ts`)
and queues the `rewrite-post` job with `apply: true`, answering `202 { queued: true, activityId }`. It answers `409` with the reason, and queues
nothing, when the post is removed, no enabled provider is ticked for "Rewriting posts", the monthly budget is missing or used up, the post has
no linked facts that still exist, or a rewrite of the post is already queued or running; `404` for an unknown post, `400` for a bad instruction.
Editing rules are the ones of `PATCH /api/posts/:id` (a removed post is refused; there is no other guard, so a post already in Buffer is
changed in Vesk only, as with a manual edit). `GET /api/posts/:id` carries `rewrite: { available, reason }` so the post page can say why the
action cannot start without exposing provider details. The run is titled "Rewrite: <post>" (kind "Rewrite a post" in Activity).

## AI suggestions

Suggestions a person reviews; nothing is saved by these routes (`src/server/routes/suggest.ts`):

- `GET /api/suggest` (admin, editor): `{ available, reason }`, whether suggestions can run now and, if not, why in words for the page.
- `POST /api/suggest/brand-from-site` (admin) takes `{ website, name? }` (the address as typed, up to 300 characters; a bare host gets `https://`; `name`, which the guided setup sends, is accepted and not used) and
  answers `{ descriptor?, tagline?, voice?, visualDirection?, colours?: { primary?, accent? }, source: { url } }`. The home page is read
  on the server by the AI library's safe page reader (public http(s) only, no private, loopback or link-local address, every redirect
  checked again, the connection pinned to the checked address, 1 MB and 15 seconds); the library's `brand-site` prompt treats the page
  as data, and the answer is checked by the library's schema and again by strict shapes here (lengths 200, 120, 900, 900; colours
  `#RRGGBB` found on the page). `422` when the address is not public or the page cannot be read, with the reason.
- `POST /api/suggest/picture-description` (admin, editor) takes `{ vaultItemId }` (a photo or screen with a file) as JSON, or a picture
  as multipart (`file`, optional `title` and `role`), for the upload page before the item exists. It answers
  `{ title?, description, tags?, peopleVisible }`. The type is read from the bytes; over 5 MB is `413` (the upload page scales pictures
  down first). `peopleVisible` is a hint shown to the person and never sets "People can be recognised" or consent.

Both use the provider ticked for drafting, answer `409` with the reason before anything is fetched or sent when there is none, no
budget is set or the budget is used up, save one `ai_calls` row per call with the person who asked (a page read is a `fetch` row),
write `ai.suggest_brand_from_site` or `ai.describe_picture` to the audit log (no page text, no picture), and answer `502` when the
AI's answer could not be used after one retry. In the web app, Brand and look, Voice and spelling has "Suggest from website"
(`components/suggest/BrandSiteSuggest.tsx`), and the upload page has "Describe with AI" on each picture and "Describe all with AI"
(`components/suggest/PictureSuggest.tsx`); a used suggestion fills the editable field and is marked as the AI's.

## AI

The app never imports `@vesk/ai` directly. `src/server/ai.ts` is the seam: if the `@vesk/ai` workspace package is installed
it is loaded and its `createAI({ providers, search, budget, log })` must return `{ draftBatch, research, rewrite, analyseReference, suggestBrandFromSite, describePicture }`
(the input and result types are in `ai.ts`). The library is an ordinary dependency of the app. Providers (Anthropic or OpenAI-compatible), the search provider and the
monthly budget are set by an admin under AI and search (a provider's prices per million tokens too, which the budget needs to see its cost); their keys are encrypted at rest and only the last four
characters are ever shown.

## Known limits

- Local storage is for development; use `s3` in production. Private files are copied to the public prefix only when sent.
- Single instance. Rate-limit buckets and the channel-list cache are in memory and clear on restart.
- Buffer's API is not fully documented. The post delete mutation (`deletePost`) and the `draft` status filter are
  assumptions that have only run against a fake Buffer (see `docs/buffer-api-notes.md`); try them with one real draft
  before relying on them.
- Posts are published to a network only through Buffer; the app does not talk to Instagram, LinkedIn, Facebook or X.
- Chrome or Chromium is needed on the machine that runs the server, and rendering is one post at a time (a batch of seven takes
  about a minute on a laptop).
- Without ZeptoMail or SMTP, invite and reset links are shown to the admin to copy rather than emailed.
- Deleting a post from Buffer removes it there and marks the delivery deleted; a live send after a delete asks for the
  drafts to be sent again first.

Every AI call is saved in `ai_calls`; month-to-date spend on the AI settings page is the sum of this month's costs. `draft-batch`
makes a real batch in `draft` state (`Batch.aiDraft` holds the drafter's notes and shows the "AI draft" badge): the posts
carry their vault sources and the AI's warnings, and vault photos are rendered by copying the file from the bucket. If the
AI fails, the budget is used up or the answer is not valid, nothing is created and the audit log gets `ai.draft_batch.failed`.
Details: [../../docs/ai.md](../../docs/ai.md).

### The Looks pages (web)

`/settings/looks` has three tabs, **Looks**, **Series** (`/settings/looks/series`) and **Inspiration** (`/settings/looks/inspiration`).
Series sits in Looks because a series is drawn by the look in use: its list shows each series with a one-line summary ("Statement · weekly
on Tuesdays · next Tip #15"), an On switch (only switched-on series are planned into AI drafts), a flag when its designs belong to another
look or the look cannot draw it, and Edit and Delete; Add and Edit open a side panel of visual choices (kind, the look's designs, how often,
which day), the mark with a live "Reads: Tip #15", and Fine-tune for where the mark goes and the first number. Without a look in use the
tab points to Looks. Looks shows "In use" (the active look, or
Classic layouts; "Back to classic layouts" is in its menu), "Looks we ship" (**Use this look**, with a confirm saying new images use it and
posts already made keep theirs, and **Customise**, which duplicates into the brand and opens the copy) and "Your looks" (status Draft,
Ready or Needs attention with the first problem, origin, last changed; Open, Use when Ready, and a menu with Duplicate and Delete, whose
refusal while active shows the server's reason). `/settings/looks/:slug` is a wide page, crumbs `Settings / Looks / <name>`, with the name
editable in the header, a status chip, Save (with "You have changes that are not saved" and the unsaved guard), **Publish** (a dialog listing the
check of every design, with a link to each failing design) and, when Ready and not active, **Use this look**. A look that is ACTIVE can be
edited: the page says that saved changes reach posts drawn from then on while images already made stay as they are, shows Publish when
the edits have not been checked, and **Duplicate** still offers a copy to try changes on.
Tabs: **Settings** (drawn from `lookCatalogue().sections`, so a setting the engine adds appears without UI work: Dials, Typefaces, Type,
Page, Colour, Devices, Pictures, Logo; numbers show their range and an inline error, never clamped; server problems are mapped to the control
by path), **Designs** (per kind: reorder, On/Off, status, Edit, which opens the design editor, Duplicate within this look, Remove, "Add a design" from
any shipped or own look, at most three per kind) and **Check** (the stored gate records; "Run the checks" draws every design with sample, stress and minimal copy and shows what each check said). `/settings/looks/:slug/designs/:id` is the design editor (see "The design editor" above).
**Classic layouts** is in the menu only while no look is active (the page itself shows a one-line notice with a link to Looks otherwise).
Sample pictures: `useLookSamples` asks `POST /api/settings/looks/preview` (debounced, stale requests cancelled, cached by the hash the server
returns); while it answers 501 (no renderer connected) the strips show quiet placeholders named by kind and one line. The post editor reads `GET /api/looks/brief` when a look is active: kinds without an enabled design are not offered, the "Look"
choice lists the look's designs by name, and the field counters follow the chosen design's budgets (`editor/look-brief.ts`). Logic that needs no
browser is in `web/src/pages/settings/looks/look-model.ts` (specs `src/web-look-model.spec.ts`, `web-look-brief.spec.ts`,
`web-inspiration-fit.spec.ts`, `web-nav.spec.ts`).
