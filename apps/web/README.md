# Vesk web app

The web app for a team that runs a brand's social media. A small team keeps a vault of confirmed facts and photos, imports or drafts a
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
5. Add the team's facts to the vault.
6. Invite the team (Settings, Team).
7. Draft the first batch with AI, or import one from `batches/`.

With `STORAGE_DRIVER=local` the files are written under `LOCAL_STORAGE_DIR` (default `apps/web/.data/storage`, git-ignored).
Private files are opened through signed, expiring app URLs; the public prefix is served unsigned at `/_local-public/`,
like a public bucket. Local storage is for development and tests only. Production uses `s3`.

## The brand

An admin sets the brand in **Settings, Brand and look** (`/api/settings/brand`, `src/server/routes/brand.ts`):

- **Identity:** name, website, tagline, what the brand does, time zone, language, and an optional single currency.
- **Logos:** the full logo and the mark, as PNGs. The page measures where the wordmark starts. "Draw a simple logo from the
  name" makes a plain pair in the browser.
- **Colours and type:** four colours (primary, accent, dark, light), the headline weight, the corners and an optional
  woff2 font. While people pick colours, the page asks `POST /api/settings/brand/preview` (nothing is saved). The answer
  gives the colours posts will use, which colours were adjusted, and 32 contrast checks: headlines, sub lines, labels and
  accent words on every page colour and on both slabs of a myth-and-fact page, against the brand's contrast limits.
- **Series:** each with its page colour and headline style.
- **Voice and visual direction:** in the team's own words, with names to spell exactly.
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

**Settings, Layouts** (`/api/settings/layouts`, `src/server/routes/layouts.ts`, admins only) holds the brand's own
compositions: blocks placed in slots on a grid, as data the engine's layout validator checks
(`packages/engine/lib/design/layout.mjs`; the format is in [docs/design.md](../../docs/design.md), "Your own layouts"). The
editor places a block by clicking two cells of the grid, offers each block's options from the engine's catalogue, sketches
the page as it changes, shows the engine's verdict as you type and draws a real preview with the brand on request; a JSON
view shows the layout as the engine reads it. Starting points like the built-in pages come from the engine
(`lib/design/layout-starters.mjs`). Layouts are stored in `brand_layouts`; the enabled ones go into the pack's `brand.json`
as `layouts` on every sync (one that no longer passes is left out and logged), where a post's design names one
(`{ "template": "layout", "layout": "<id>", ...fields }`) and the AI is told about them.

| Route | Does |
|---|---|
| `GET /api/settings/layouts` | the layouts, the starting points and the engine's catalogue of blocks, options and fields |
| `POST /api/settings/layouts` | add one: `{ definition, origin? }` or `{ starter, name? }` (a copy of a starting point under a free id) |
| `POST /api/settings/layouts/validate` | `{ problems }` for a definition, nothing stored |
| `POST /api/settings/layouts/preview` | `{ definition, size?, sample? }`: one image drawn with sample words through the renderer and every check, under the render lock, as a JPEG data URL; nothing stored |
| `PUT /api/settings/layouts/:id` | replace the definition; a new id is refused while a post uses the old one |
| `PATCH /api/settings/layouts/:id` | `enabled`, `position` |
| `POST /api/settings/layouts/:id/duplicate` | a copy under a free id, switched off |
| `DELETE /api/settings/layouts/:id` | refused while a post's design names it |
| `GET /api/layouts` | any signed-in person: the layouts of the brand in force and the fields each takes, for the post editor |

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
