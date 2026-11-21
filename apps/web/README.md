# Vesk web app

The web app for a team that runs a brand's social media. A small team keeps a vault of confirmed facts and photos (Facts and Pictures in the app), imports or drafts a
month of posts, reviews and approves each one, renders its images with the design engine, and sends the approved posts
to Buffer as drafts, then live. It is a Hono server, Postgres through Prisma, pg-boss jobs and a React web app built into
`dist/web` and served by the same server. The engine (`packages/engine`, `@vesk/engine`) is its library: batch
validation, the duplicate guard and push loop, the Buffer client, the design renderer and storage. The server loads its
modules by subpath (`engineImport('batch')` is `@vesk/engine/batch`, see `src/server/engine/`) and the AI library through
`src/server/ai.ts`.

The brand is set by an admin in Settings, Brand and look, and kept in the database: no file to edit. Until it is saved
the app shows the brand pack named by `BRAND_DIR` (default `brands/demo`, the fictional Acme Savings) and seeds its first
vault from that pack's `vault.json`. See "The brand" below.

The app has only been run against a fake Buffer and local or fake storage, never against a real Buffer account or a
real bucket.

## Requirements

- Node 22.12 or newer (the machine used for development has Node 24).
- Postgres 16. The app and pg-boss share one database (pg-boss keeps its tables in the `pgboss` schema).
- Google Chrome, for rendering post images. Set `CHROME_PATH` if it is not in the usual place. JPG conversion uses `sips`
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

Then, as an admin, follow the setup steps on Home. Each one opens the page where it is done:

1. Set up the brand, and upload the logos or draw a simple pair from the name (Settings, Brand and look).
2. Add a Buffer account and run Check on it (Settings, Buffer accounts).
3. Choose the account and channel for each network (Settings, Channels).
4. Add an AI provider and a monthly budget (Settings, AI and search).
5. Add the team's facts to Facts.
6. Invite the team (Settings, Team).
7. Draft the first batch with AI, or import one from `batches/`.

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
- **Home.** The setup checklist is one card. `GET /api/overview/home` returns each step as `{ key, title, detail, to, done }`
  and, on the AI step, `missing` (`'provider'`, `'budget'` or `null`).
- **A batch** is Writing, In review, Scheduled or Done. Its page is a four-step flow: Write, Review, Send drafts to Buffer,
  Go live. Steps 1 and 2 show the posts (`/batches/:id`); steps 3 and 4 show the plan, the sending and the Buffer status
  (`/batches/:id/schedule`, and `/batches/:id/schedule?step=live`). `?post=<id>` opens the batch at that post; the calendar
  uses it. The batch list's import tab is "Import a batch file", marked Advanced.
- **A post** is Writing, Approved, Draft in Buffer, Scheduled or Sent. Problems are flags on top of that, never a step of
  their own: Image could not be made, Has warnings, Needs a look, Failed to send, Deleted from Buffer, Removed.
- **The post page** replaces the old side sheet: a post is added at `/batches/:id/posts/new` and edited at
  `/batches/:id/posts/:postId`, a page with breadcrumbs, the form on the left and a live preview on the right. Network choices
  and captions are edited there and saved with the post. It has a picture picker and structured editors for figures, lists, carousel
  pages, tables and cards; a carousel's pages are listed one by one, each made with a built-in page layout or one of the brand's
  own layouts that has the feed size, whose fields the page then shows (`web/src/pages/batches/design-model.ts`); the raw design JSON is under "Advanced". The post card on the batch page shows the image, title, date,
  one status chip (plus a problem chip when there is one), the network icons, Edit, Approve and a More menu. The preview calls `POST /api/posts/preview-design`
  (`src/server/routes/design-preview.ts`, roles admin and editor): the body is `{ design, size? }`, and the answer is
  `{ ok, image, images, size, warnings, notes }` (`ok: false` with an `error` when the design was fine but could not be
  drawn). A design that saving would refuse is a 422 `{ error, details }`, in the same words as saving; a brand without its
  logos is a 409. Nothing is stored, and the drawing runs under the render lock, one at a time.
- **Facts and Pictures.** A fact has its own page, `/vault/:id` (`/vault/new` adds one). A picture has `/library/:id`; uploading
  is the page `/library/upload` (`/library?upload=1` redirects there). List filters live in the URL.
- **Dialogs.** New batch and Draft with AI open as centred dialogs (`/batches/new`, `/batches/ai-draft` still open them). The Team,
  Buffer accounts and AI provider forms are dialogs too, and Channels is one table with a row per network.
- **Conventions.** Field help is behind an info icon (kit `Hint`, `hintMode`); pages use `PageHeader` with `crumbs`; small forms
  use `FormPanel variant="dialog"`; secondary and destructive actions sit in `MoreMenu`; on a desktop only the content area and the
  sidebar scroll. See `web/README-ui.md`.
- **Layouts** open their own page, not a side sheet: `/settings/layouts/new` (optionally `?from=<starter>`,
  `?duplicate=<layout id>` or `?copy=<built-in id>`) and `/settings/layouts/:id`. See "Settings, Layouts" below.

## The brand

An admin sets the brand in **Settings, Brand and look** (`/api/settings/brand`, `src/server/routes/brand.ts`):

- **Identity:** name, website, tagline, what the brand does, time zone, language, and an optional single currency.
- **Logos:** the full logo and the mark, as PNGs. The page measures where the wordmark starts. "Draw a simple logo from the
  name" makes a plain pair in the browser.
- **Colours:** four colours (primary, accent, dark, light), the headline weight and the corners. While people pick
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
- **Voice and visual direction:** in the team's own words, with names to spell exactly.

The page has eight sections, each with its own address: `/settings/brand/<identity|logos|colours|type|surfaces|post-types|voice|advanced>` (`/settings/brand#logos`, used by the setup checklist, still opens Logos). Uploads (logos, fonts, artwork) and Advanced save the moment they are done; everything else is one form that waits for Save, and asks before it is left with changes. "Other currencies to flag" is a list of words; a stored pattern that the list cannot show is edited under Advanced.
- **Advanced:** a `brand.json` fragment merged over the rest, a dot map, and "Import a brand pack", which moves a pack's
  `brand.json`, logos and map in at once and keeps its exact colours and rules.

**Settings, Design references** takes pictures the team likes. A background job (`analyse-reference`) sends each one to
the drafting provider's model with the versioned `reference` prompt. The model writes a style brief (summary, palette,
type, layout, imagery, mood, what to avoid) that people can edit or switch off. The briefs that are switched on reach
every draft and rewrite as `brand.references`, next to `brand.voice` and `brand.visualDirection`. The drafting model must
be able to read images.

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

**Settings, Layouts** (`/api/settings/layouts`, `src/server/routes/layouts.ts`, admins only) holds the brand's own
compositions: blocks placed in slots on a grid, as data the engine's layout validator checks
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

Set `TEST_DB_NAME` for another database name and `TEST_DATABASE_ADMIN_URL` for another server (default
`postgresql://postgres:postgres@127.0.0.1:55440/postgres`). Test files are named `*.spec.ts` so the repository's root
`node --test` does not pick them up. Helpers are in `src/server/testing.ts` and `src/server/testing-batches.ts`.
The render specs launch real Chrome, one at a time. `npm run typecheck` covers the server, the tests and the web app.

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
| `CHROME_PATH` | Path to the Chrome executable, read by the design engine. Without Chrome, rendering fails with a message that says so. |

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
| `research-run`, `rewrite-post` | ids, topics or instruction | Call the AI adapter (below). |

## AI

The app never imports `@vesk/ai` directly. `src/server/ai.ts` is the seam: if the `@vesk/ai` workspace package is installed
it is loaded and its `createAI({ providers, search, budget, log })` must return `{ draftBatch, research, rewrite }`
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
- Chrome is needed on the machine that runs the server, and rendering is one post at a time (a batch of seven takes
  about a minute on a laptop).
- Without ZeptoMail or SMTP, invite and reset links are shown to the admin to copy rather than emailed.
- Deleting a post from Buffer removes it there and marks the delivery deleted; a live send after a delete asks for the
  drafts to be sent again first.

Every AI call is saved in `ai_calls`; month-to-date spend on the AI settings page is the sum of this month's costs. `draft-batch`
makes a real batch in `draft` state (`Batch.aiDraft` holds the drafter's notes and shows the "AI draft" badge): the posts
carry their vault sources and the AI's warnings, and vault photos are rendered by copying the file from the bucket. If the
AI fails, the budget is used up or the answer is not valid, nothing is created and the audit log gets `ai.draft_batch.failed`.
Details: [../../docs/ai.md](../../docs/ai.md).
