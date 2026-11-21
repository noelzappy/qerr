# Vesk

Vesk is an open-source social media desk for an organisation that posts every month. A small team keeps a vault of
confirmed facts and photos; the AI drafts a month of posts from it in the brand's voice; Vesk renders every image in the
brand's look; people review and approve each post; and the approved posts go to [Buffer](https://buffer.com), drafts
first. It works for any organisation without writing code: the brand, its logos, colours, voice and visual direction are
set in the admin panel, and the team can upload design references whose style the AI learns from.

It has a web app and the engine under it:

- **The web app** (`apps/web`). Home, Create, Publish and Settings, in light and dark:
  - Home shows the week, what waits for approval, the setup steps and what goes out next.
  - Create holds the batches on a board, with the vault and the picture library.
  - Publish shows every planned post on a calendar or a list, per channel.
  - Settings covers:
    - Brand and look: identity, logos (or a simple logo drawn from the name), colours with a live preview and contrast
      checks, series, voice, visual direction, and the import of an existing brand pack.
    - Design references: pictures the AI describes as style briefs that guide every draft.
    - The team, the Buffer accounts, the channels, the AI providers with a monthly budget, and the audit log.

  See [apps/web/README.md](apps/web/README.md).
- **Design** (`packages/engine`). It renders finished, on-brand post images with headless Google Chrome: poster pages with
  one strong picture, editorial pages with ledger and passbook cards, real product screens in framed phones and desktop
  windows, photo posts, and carousels with a PDF. See [docs/design.md](docs/design.md).
- **Schedule** (`packages/engine`). It turns each post into one Buffer post per channel (Instagram, LinkedIn, Facebook and
  X), checks the media, and sends them as drafts first, through Buffer's GraphQL API. The channels can belong to one Buffer
  account or to several.
- **AI** (`packages/ai`). It drafts, researches and rewrites from the vault only, and describes design references. It uses
  any Anthropic or OpenAI-compatible model. See [docs/ai.md](docs/ai.md).

The engine also runs on its own from the command line, with the brand in a folder (a **brand pack**, see "Brand packs"
below). The repository ships a fictional demo brand, Acme Savings, so everything runs on a fresh clone.

One batch file describes the whole month: the words, the pictures and the dates.

Licence: MIT, see [LICENSE](LICENSE).

## Status: never run against the real Buffer API

This tool has been tested only against a fake Buffer inside `test.mjs`. It has not talked to the real Buffer API,
because no API key existed when it was written. Everything it knows about Buffer (endpoint, field names, enum values)
comes from Buffer's public documentation and has not been confirmed on a live account. Read
[docs/buffer-api-notes.md](docs/buffer-api-notes.md) for the full list of unverified points, and follow the first-run
precaution in [docs/monthly-routine.md](docs/monthly-routine.md) before trusting it with a month of posts.

The routing across several Buffer accounts, the X network and the upload of media to S3-compatible storage (Hetzner
Object Storage) were added later and have the same status: they are tested against fakes only (`test-accounts.mjs`,
`test-storage.mjs`). **Nothing has run against a real Buffer account or a real Hetzner bucket yet.** The S3 signer is
checked against AWS's published signing examples, which proves the signature maths, not that Hetzner accepts it.

`plan`, `media` and `--help` need no key and no network (except `media --verify`, which fetches your media URLs). The
design commands need no key and no network either; they need Google Chrome on the machine.

## What it is and is not

It is:

- An image maker for a brand's posts: your texts and pictures in, finished images out in the brand pack's look, checked
  by the tool (contrast, enlargement, text that does not fit).
- A batch scheduler: one JSON file in, one Buffer post per channel out.
- Safe by default: it creates drafts, and sends nothing without `--yes`.
- Zero dependencies: the command-line tool and the AI library use Node.js only. (The web app in `apps/web` has its own.)

It is not:

- A design editor. The templates are fixed; the brand pack sets their colours, fonts and logos, and you choose the
  words, the picture and a few options.
- A Buffer client for general use. It only creates posts and lists them.
- A media host. Buffer takes media by public URL only. You either host the files yourself (`MEDIA_BASE_URL`) or let
  `upload` put them in an S3-compatible bucket you own (`S3_*`); the tool does not create or configure the bucket.
- A way to edit or delete Buffer posts. There is no update or delete call. You do that in Buffer.
- A WhatsApp tool. WhatsApp is not a Buffer channel.
- Wired to TikTok. Buffer supports it, but this tool only knows Instagram, LinkedIn, Facebook and X.

## Requirements

- Node.js 22.12 or newer for the repository (the web app needs it; the engine and the AI library alone need Node 20 or
  newer). Tested on Node 24.
- For the design commands only: Google Chrome (the macOS path is found automatically; set `CHROME_PATH` for another
  location). JPG conversion uses `sips` (macOS) or `ffmpeg` when present, otherwise Chrome itself.
- A Buffer account with a key from <https://publish.buffer.com/settings/api> (one key per account; keys expire, 30 days
  by default, so expect to create new ones).
- Somewhere to host media publicly over HTTPS: your own host, or an S3-compatible bucket with public read on one prefix.

This is an npm workspaces monorepo (see "Repository layout" below). The command-line tool and the AI library have
no dependencies, so to use only the CLI there is nothing to install. Run `npm install` once at the repository root if you also
work on the web app (`apps/web`) or want `npm test` to run everything.

## Quick start

```sh
cp .env.example .env                       # then put your key in .env
cp channels.example.json channels.json     # then fill in the channel ids (one Buffer account)
node packages/engine/buffer.mjs check                      # tests the key, lists channels, checks the schema
node packages/engine/buffer.mjs plan batches/example-launch.json
node packages/engine/design.mjs --help                     # make the images: texts and pictures in, post images out
node packages/engine/design.mjs render batches/example-launch.json --out-dir media/preview   # the demo images (needs Chrome)
```

`plan` and `render` need no key and no `.env`, so you can try them first. The example batches use the demo brand
(`brands/demo`); set `BRAND_DIR` to use your own (see "Brand packs"). Their figures are invented: they are format
examples, not posts to send.

The full routine, including first-time setup, is in [docs/monthly-routine.md](docs/monthly-routine.md).

### One Buffer account or several

- **One account (the original setup).** `BUFFER_API_KEY` (and `BUFFER_ORG_ID` if needed) in `.env` plus `channels.json`.
  This works exactly as before, with or without the newer features, as long as there is **no `accounts.json`**. The
  account is called `default` in the output and in the state file.
- **Several accounts.** Copy `accounts.example.json` to `accounts.json` (git-ignored). It lists the accounts and routes
  each of our network names (`instagram`, `linkedin`, `facebook`, `x`) to one account and one channel id:

  ```json
  {
    "accounts": [
      { "name": "main", "keyEnv": "BUFFER_KEY_MAIN", "organizationId": "", "captionLimits": { "x": 280 } },
      { "name": "second", "keyEnv": "BUFFER_KEY_SECOND" }
    ],
    "routing": {
      "x": { "account": "main", "channelId": "..." },
      "linkedin": { "account": "main", "channelId": "..." },
      "facebook": { "account": "second", "channelId": "..." },
      "instagram": { "account": "second", "channelId": "..." }
    }
  }
  ```

  `keyEnv` is the **name** of an environment variable (set in `.env` or the shell), never the key; the file is rejected if it
  holds a field called `apiKey` or similar, and the error does not repeat the value. `organizationId` is optional (as
  `BUFFER_ORG_ID` is). `captionLimits` overrides a network's caption limit for that account; use it to raise X above
  280 when the X profile is on a paid tier. When `accounts.json` exists, `BUFFER_API_KEY`, `BUFFER_ORG_ID` and
  `channels.json` are ignored. A post that goes to four channels is split across the accounts by the routing.
  `node packages/engine/buffer.mjs check` prints a routing suggestion from what each key can see.

Run every command from the repository root: the tool reads `.env`, `accounts.json` and `channels.json` there, keeps
`state/` there, and reads a batch's `mediaRoot` relative to it. npm scripts, if you prefer them: `npm test`,
`npm run check`, `npm run plan -- <batch.json>`, `npm run buffer -- <command>` and `npm run design -- <command>`. They
run `node packages/engine/buffer.mjs` and `node packages/engine/design.mjs`; calling those files directly works the same.
`node packages/engine/buffer.mjs design <command>` is the same as `node packages/engine/design.mjs <command>`.

## Brand packs

For the command-line tool, everything that makes the posts one brand's lives in one folder under `brands/`, the brand
pack. The design engine and the AI library read it.

**In the web app you do not need a pack.** An admin sets the brand in Settings, Brand and look, and the app keeps it in its
database. Until then the app shows the pack named by `BRAND_DIR` (the demo by default). An existing pack moves in through
Settings, Brand and look, Advanced, "Import a brand pack": choose its `brand.json`, its two logos and its optional
`map.json`. The pack's exact colours and rules are kept. Behind the scenes the app writes the saved brand out as a pack
folder under `state/brand/` and points the engine at it, so the app and the command line render the same way.

| File | Needed | What it is |
| --- | --- | --- |
| `brand.json` | yes | Name, website, tagline, descriptor, colours (grounds, text, accents, gradient, surfaces), shadows, radii, window and phone chrome, fonts, logo paths, series, spelling rules, length guidance, contrast targets and photo thresholds. Optional `timezone` and `money`. Every value is checked on load; a wrong one stops the run with the full list. See "The brand file" in [docs/design.md](docs/design.md). |
| `logos/logo-full.png`, `logos/logo-mark.png` | yes | The full colour logo (the mark, then the wordmark) and the mark alone, transparent PNGs. `brand.json` names them by paths relative to the repository root, for example `brands/demo/logos/logo-full.png`. |
| `vault.json` | for the web app | The first vault: facts, figures and research topics the web app imports once, into an empty database (see [apps/web/README.md](apps/web/README.md)). |
| `map.json` | no | A dot map for the `closing` template's `map: true`: a grid, regions of cells and the regions to light. |
| `prompts/<name>.md` | no | Replaces the AI library's `draft`, `research` or `rewrite` prompt for this brand (see [docs/ai.md](docs/ai.md)). |

**Choosing the pack.** `BRAND_DIR` names it, relative to the repository root, in the environment or in `.env` (a real
environment variable wins; a blank value counts as unset). It must be a folder inside the repository. Without it the
default is `brands/demo`.

**The demo pack** (`brands/demo`) is a fictional brand, Acme Savings: website `acmesavings.example`, time zone
`Europe/London`, money in euros. Its `map.json` is an invented island and its `vault.json` holds invented facts and figures
only. `brands/demo/make-assets.mjs` draws its logos, the map and three synthetic demo pictures
(`packages/engine/design/assets/demo/object-jar.jpg`, `scene-market.jpg`, `screen-desk.png`); those files are committed, so
the example batches render on a fresh clone. Run `node brands/demo/make-assets.mjs` again only after changing a drawing (it
needs Chrome).

**Starting your own.**

1. Copy the demo: `cp -r brands/demo brands/<your-brand>`, then delete `make-assets.mjs` from the copy (it writes the demo's
   files), and delete `map.json` unless you will draw your own.
2. Edit `brand.json`: `name`, `website`, `tagline`, `descriptor`, the colours (keep the slot names, such as `gold` or
   `mint`, and give them your colours), `series` (the keys become the `series` values in batches), the `spelling` rules
   (each `{ "wrong": "<pattern>", "flags": "", "right": "<correct form>" }`) and the logo paths, which must point into your
   folder.
3. Replace the two logos with your own transparent PNGs. Set `logos.fullSize` to the full logo's pixel size,
   `logos.wordmarkFrom` to the x where its wordmark starts, and `logos.markGap` to the gap between mark and wordmark (they
   are used to set the wordmark in white on dark grounds). Fonts: the engine ships Inter and IBM Plex Mono in
   `packages/engine/design/fonts/`; another woff2 font may live in your pack, named by its repository path.
4. Set `timezone` to the brand's IANA time zone (the AI drafts in it, the web app shows it; batches name their own). Set
   `money.local` to one sentence on the brand's currency and `money.foreign` to a pattern of the currencies pictures must
   not show, or remove `money` to allow every currency.
5. Write `vault.json` with the brand's own confirmed facts, in the demo's format.
6. Optionally add `prompts/draft.md`, `research.md` or `rewrite.md` (start from `packages/ai/src/prompts/`, keep the version
   line), and a `map.json` from data you may use.
7. Put `BRAND_DIR=brands/<your-brand>` in `.env` and render one page to check it, for example
   `node packages/engine/design.mjs text --headline 'Hello' --out media/preview/hello.jpg`. Look at the image. For the
   web app, import the pack in Settings instead.

A pack can hold private facts (`vault.json`) and the brand's own artwork. Keep a real brand's pack in a private repository
or fork, not in a public one.

## Repository layout

An npm workspaces monorepo. The code is in three workspaces; your data stays at the root.

| Path | What it is |
| --- | --- |
| `packages/engine/` (`@vesk/engine`) | The Buffer tool and the design tool: `buffer.mjs`, `design.mjs`, `lib/`, `design/` (brand CSS, templates, fonts and the asset folders, including the committed demo pictures in `design/assets/demo/`) and the engine tests. No dependencies. Other packages import its modules as `@vesk/engine/<module>`, for example `@vesk/engine/batch`. |
| `packages/ai/` (`@vesk/ai`) | Drafting, research and rewriting (`src/`) and its tests. No third-party dependencies; it uses the engine's validators through `@vesk/engine`. |
| `apps/web/` (`@vesk/web`) | The Vesk web app (see [apps/web/README.md](apps/web/README.md)). It imports `@vesk/engine/...` and `@vesk/ai`. |
| `brands/` | Brand packs, one folder each; `brands/demo` (the fictional Acme Savings) is the default. See "Brand packs". |
| `batches/`, `media/`, `state/`, `out/` | Your batch files (two examples for the demo brand ship here) and the files the tool makes (the last three are not in git). |
| `docs/`, `deploy/`, `Dockerfile` | Documentation and the container set-up (Node 22). |

Root scripts: `npm test` (engine, then AI, then web), `npm run test:engine`, `npm run test:ai`, `npm run test:web`,
`npm run build` (the web app), `npm run buffer`, `npm run design`, `npm run plan`.

## How it works

```
 your texts and pictures
 (design block in the batch, or flags)
        |
        v
   design render   (Chrome renders each image, then checks it: contrast, enlargement,
        |            text that fits, exact pixel size)  -> media/<name>/*.jpg
        |            and fills in "media" in the batch where it was empty
        v
 batches/<name>.json          media/<name>/*.jpg *.mp4
        |                            |
        v                            |  you upload these to a public host
   plan  (validate, one item          v
   per post x channel, hash)   MEDIA_BASE_URL/<file>
        |                            |
        +--------------+-------------+
                       v
        media --verify  (HEAD: 200 and image/* or video/*)
                       |
                       v
        push --yes      -> Buffer drafts   (createPost, saveToDraft)
                       |        you review them in Buffer
                       v
        push --live --yes -> scheduled posts (createPost, no saveToDraft)
                       |
                       v
        status          -> lists scheduled and draft posts, compares with state/
```

Where things are kept, all inside this repository:

| Path | What it holds | In git? |
| --- | --- | --- |
| `batches/` | The batch files you write (`example-launch.json` and `example-editorial.json` ship as examples) | yes |
| `brands/<name>/` | A brand pack: `brand.json`, logos, optional `vault.json`, `map.json`, `prompts/` | yes (keep a real brand's pack in a private repository) |
| `channels.example.json` | Template for channel ids (one account) | yes |
| `channels.json` | Your channel ids for each network (one account) | no |
| `accounts.example.json` | Template for several accounts and the routing | yes |
| `accounts.json` | Your accounts (names of key variables, not keys) and the routing | no |
| `.env` | `BRAND_DIR`, keys (`BUFFER_API_KEY` or one `keyEnv` variable per account), `BUFFER_ORG_ID`, `MEDIA_BASE_URL`, `S3_*` | no |
| `packages/engine/design/` | Brand CSS, templates, Inter and IBM Plex Mono and their licence | yes |
| `packages/engine/design/assets/demo/` | The demo brand's synthetic pictures | yes |
| `packages/engine/design/assets/photos/`, `.../screens/` | Your stock photos and app screenshots | no (only their READMEs, `CREDITS.md` and `SOURCES.md`) |
| `media/<name>/` | Images and videos for a batch (rendered images land here) | no (see `media/README.md`) |
| `state/<name>.json` | What was sent: Buffer id, account, mode, hash, time; and the uploaded media URLs | no |
| `out/<name>-plan.json` | The exact requests `plan` would send | no |
| `schema-cache.json` | The schema `check` read from Buffer | no |

A picture in a batch's `design` block is written as `design/assets/photos/<file>` (or `design/assets/demo/<file>`); the
tool looks for `design/...` paths in `packages/engine/design/` when the repository root has no such folder.

The state file is the only memory of what was sent. If you delete it, the tool no longer knows and can create
duplicates.

A "channel" in the output is a network name (`instagram`, `linkedin`, `facebook`, `x`). `channels.json` maps each name to
one Buffer channel id; `accounts.json` maps each name to an account and a channel id.

An old state file (written before accounts existed) has no `account` on its records and stays valid: the
duplicate-protection hash does not include the account, the route or the media URL, and `test-accounts.mjs` pins the
hashes of the previous version to prove it. A record without an account is looked up in the account its network is
routed to.

## Commands

The design commands (`cover`, `text`, `ledger`, `passbook`, `myth-fact`, `stats`, `screen`, `photo-story`, `closing`, `photo`, `carousel`, `page-cover`, `render`, `lint`) are documented in
[docs/design.md](docs/design.md); run `node packages/engine/design.mjs --help` for the short version. The scheduling commands follow.

Run `npm run buffer -- --help` for the short version. The output is:

```
Schedules a batch of social posts into Buffer (drafts by default).

Usage:
  npm run buffer -- check [batch.json]
  npm run buffer -- plan <batch.json> [--only <postId>] [--channel <name>]
  npm run buffer -- media <batch.json> [--verify] [--only <postId>] [--channel <name>]
  npm run buffer -- upload <batch.json> [--only <postId>] [--yes]
  npm run buffer -- push <batch.json> [--live] [--yes] [--only <postId>] [--channel <name>] [--force-new]
  npm run buffer -- status <batch.json>
  npm run buffer -- design <cover|text|ledger|passbook|myth-fact|stats|screen|photo-story|closing|photo|carousel|page-cover|render|lint> ...
  npm run buffer -- help | --help | -h
```

(The real output continues with a short description of each command and flag.)

Flags that several commands share:

- `--only <postId>`: only the post with this id.
- `--channel <name>`: only one network, `instagram`, `linkedin`, `facebook` or `x`. It takes the network name, not a
  Buffer channel id.

Exit codes: 0 on success. 1 when `check` finds mismatches, a rejected key or a wrongly routed channel, `media` finds a
missing or unreachable file, `upload` stops or finds a file that is not publicly readable, `push` stops or refuses a
post, or any error occurs.

### check

```
node packages/engine/buffer.mjs check [batch.json]
```

Needs `BUFFER_API_KEY`, or with `accounts.json` the key of each account (an account whose key variable is empty is
reported and skipped). Sends read-only requests: `account { organizations }`, `channels(...)` and a set of GraphQL
introspection queries (`__type`). It never creates anything.

With several accounts it does this per account: the key, the organisations, the channels. The schema is the same API
for every account, so it is read once, with the first account that works. It then prints a suggested `routing` block
and reports every channel in `accounts.json` that is routed to an account that does not hold it (and which account
does). A rejected key is reported by account name and the others are still checked. Exit code 1 for any of these.
Buffer's service name for X is not confirmed (`twitter` or `x`); both are matched in the suggestion.

It prints the organisations and channels, a suggested `channels.json`, the shape of the input types the tool relies
on, and any mismatch between what the tool sends and what Buffer's schema says. It saves `schema-cache.json`, which
`plan` then uses to verify the Facebook post type. If you pass a batch, it checks the Facebook types that batch uses.
Exit code 1 if there are mismatches.

No real output exists yet. Without a key it prints:

```
Error: BUFFER_API_KEY is not set (put it in .env, see .env.example)
```

### plan

```
node packages/engine/buffer.mjs plan <batch.json> [--only <postId>] [--channel <name>]
```

No key, no network. Validates the batch, resolves each post into one item per channel, prints a table and any
warnings, and writes `out/<name>-plan.json`. That file holds the exact draft and live request bodies for every item,
with the channel id as `<CHANNEL_ID:network>` if `channels.json` has none. The key is never written to it. With
`accounts.json` the table has an `account` column and each request in the plan file names its account.

The caption column is `used/limit`; the limit is the network's, or the routed account's `captionLimits` (X: 280).

With `--only` or `--channel`, the plan file contains only the filtered items and replaces the earlier one.

Real output for the example batch (abridged, run on a fresh clone: no `MEDIA_BASE_URL`, no `channels.json`, images not
rendered yet):

```
Batch example-launch  timezone Europe/London  28 channel posts (no network used)
MEDIA_BASE_URL is not set; media URLs are shown as <MEDIA_BASE_URL>/<path>.

post                  local             UTC               channel    type  media                     caption
--------------------  ----------------  ----------------  ---------  ----  ------------------------  ---------
01-what-is-acme       Mon 23 Nov 09:00  2026-11-23 09:00  instagram  post  01-what-is-acme-feed.jpg  276/2200
01-what-is-acme       Mon 23 Nov 09:00  2026-11-23 09:00  linkedin   -     01-what-is-acme-feed.jpg  276/3000
01-what-is-acme       Mon 23 Nov 09:00  2026-11-23 09:00  facebook   post  01-what-is-acme-feed.jpg  276/63206
01-what-is-acme       Mon 23 Nov 09:00  2026-11-23 09:00  x          -     01-what-is-acme-feed.jpg  125/280
...
03-how-a-group-works  Fri 27 Nov 09:00  2026-11-27 09:00  instagram  reel  03-how-a-group-works.mp4  202/2200
...

Warnings:
  01-what-is-acme / instagram: local file missing: 01-what-is-acme-feed.jpg
  ...
  01-what-is-acme / facebook: Facebook type "post" is unverified; run check
  ...

Buffer requests needed: 28 creates (the free plan allows 150 per 15 minutes).
Wrote out/example-launch-plan.json
```

The `caption` column is characters used over the network's limit. `local` is the batch time zone, `UTC` is what Buffer
receives as `dueAt`.

Each request in the plan file looks like this (caption shortened here):

```json
{
  "input": {
    "text": "A savings group is a circle of people w...",
    "channelId": "<CHANNEL_ID:instagram>",
    "schedulingType": "automatic",
    "mode": "customScheduled",
    "dueAt": "2026-11-27T09:00:00.000Z",
    "assets": [{ "video": { "url": "<MEDIA_BASE_URL>/03-how-a-group-works.mp4", "metadata": { "thumbnailOffset": 0 } } }],
    "metadata": { "instagram": { "type": "reel", "shouldShareToFeed": true } },
    "saveToDraft": true
  }
}
```

`saveToDraft: true` is present in the draft request and absent in the live one.

### media

```
node packages/engine/buffer.mjs media <batch.json> [--verify] [--only <postId>] [--channel <name>]
```

No key. Lists every media file the batch uses: local size (or `MISSING`) and the URL it must be reachable at. With
`--verify` it also sends a HEAD request to each URL and expects HTTP 200 with a `image/*` or `video/*` content type. It
needs `MEDIA_BASE_URL` for that. It sends nothing to Buffer.

Real output without `--verify`, before the images are rendered (a rendered file shows its size, for example `0.09 MB`):

```
Media for example-launch: 7 files, to be hosted under the folder that MEDIA_BASE_URL points at.

local file                                     size     must be reachable at
---------------------------------------------  -------  -----------------------------------------
media/example-launch/01-what-is-acme-feed.jpg  MISSING  <MEDIA_BASE_URL>/01-what-is-acme-feed.jpg
media/example-launch/02-the-numbers-feed.jpg   MISSING  <MEDIA_BASE_URL>/02-the-numbers-feed.jpg
...
```

Real output of `--verify --only 01-what-is-acme` with `MEDIA_BASE_URL` unset (exit code 1):

```
local file                                     size     must be reachable at                       check
---------------------------------------------  -------  -----------------------------------------  ----------------------
media/example-launch/01-what-is-acme-feed.jpg  MISSING  <MEDIA_BASE_URL>/01-what-is-acme-feed.jpg  MEDIA_BASE_URL not set
```

A passing file shows `ok (image/jpeg)`. A failing one shows `FAIL HTTP 404`, `FAIL content-type is "...", not image/*
or video/*` or `FAIL unreachable (...)`.

### push

```
node packages/engine/buffer.mjs push <batch.json> [--live] [--yes] [--only <postId>] [--channel <name>] [--force-new]
```

The only command that creates anything. Every item gets one `createPost` request (one Buffer request each).

- Without `--yes`: prints the table with an `action` column (`create`, `skip: ...`, `refuse: ...`) and sends nothing.
- With `--yes`: sends **drafts** (`saveToDraft: true`). Needs a key for every account that has something to create
  (checked before anything is sent), and a URL for every media file: its uploaded URL if `upload` has run, else
  `MEDIA_BASE_URL`.
- With `--live --yes`: sends scheduled posts. Draft and live are separate records, so a post that is already a draft
  is created again as live; the draft stays in Buffer and you delete it there.
- `--force-new`: allows a create for a post whose content changed, or whose earlier attempt has an `unknown` outcome.
  The old Buffer post, if any, stays and you delete it by hand.

Before each create the tool re-checks the media URLs with HEAD requests. It sends items one at a time, in order. Each
item goes through the Buffer account it is routed to, with that account's own key, rate-limit window and `Retry-After`
handling.

Real output of `push --only 03-how-a-group-works` without `--yes` (abridged):

```
Batch example-launch: DRAFTS, nothing will publish

post                  local             UTC               channel    type  media                     caption    action
--------------------  ----------------  ----------------  ---------  ----  ------------------------  ---------  ------
03-how-a-group-works  Fri 27 Nov 09:00  2026-11-27 09:00  instagram  reel  03-how-a-group-works.mp4  202/2200   create
03-how-a-group-works  Fri 27 Nov 09:00  2026-11-27 09:00  linkedin   -     03-how-a-group-works.mp4  202/3000   create
03-how-a-group-works  Fri 27 Nov 09:00  2026-11-27 09:00  facebook   post  03-how-a-group-works.mp4  202/63206  create
03-how-a-group-works  Fri 27 Nov 09:00  2026-11-27 09:00  x          -     03-how-a-group-works.mp4  89/280     create
...

Nothing was sent. 4 request(s) would be made. Add --yes to send.
```

With `--live` the first line reads `Batch example-launch: LIVE, posts will be scheduled`.

Real output of `push --yes` with no key:

```
Error: BUFFER_API_KEY is not set (put it in .env, see .env.example)
```

While sending, each item logs one line. These formats come from the code, not from a real run:

```
created 03-how-a-group-works / instagram: draft <buffer id> for 2026-11-27T09:00:00.000Z
skip    03-how-a-group-works / instagram: already a draft (<buffer id>)
REFUSE  03-how-a-group-works / instagram: media not reachable: ...
```

and a final summary line: `Done: N created, N skipped, N refused, N failed, N unknown. N Buffer requests.` With
`accounts.json` there is one more line per account (created, skipped, refused, failed, unknown, **not sent**, requests),
and a run that stops names the account and channel, then lists every item it did not get to:

```
STOPPED: No clear answer for p1 / facebook (account "second", channel f1): ... NOT retried. Run "status" before anything else.
```

Nothing is retried and no other account is started after the stop; finished items are skipped when you run `push` again.

### upload

```
node packages/engine/buffer.mjs upload <batch.json> [--only <postId>] [--yes]
```

Puts the media a batch needs into S3-compatible storage (Hetzner Object Storage) and records the public URLs in
`state/<name>.json`, so `plan`, `media` and `push` use them instead of `MEDIA_BASE_URL`. Settings in `.env`:
`S3_ENDPOINT` (the host, for example `https://fsn1.your-objectstorage.com`), `S3_REGION` (the location: `fsn1`, `nbg1`
or `hel1`; taken from the endpoint if it is a Hetzner one), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
`S3_PUBLIC_BASE_URL` (the public URL of the bucket's root) and `S3_PREFIX` (default `public/`). Requests are
path-style (`<endpoint>/<bucket>/<key>`); `S3_PATH_STYLE=false` switches to `<bucket>.<host>`.

- Without `--yes` it prints the files, their keys and URLs and stops. No network, no keys needed.
- With `--yes`, for each file: hash it (SHA-256), HEAD the object, and upload only if it is missing (or has another
  size or type). The key is `<S3_PREFIX><batch name>/<first 16 hex of the hash>-<file name>`: unguessable, and the same
  content always gives the same key, so running `upload` again changes nothing. A changed file gets a new key.
- Only files inside the batch's `mediaRoot` are uploaded. Paths with `..`, absolute paths and symlinks that lead out of
  the folder are refused before anything is sent.
- After each file it checks the public URL. If that is not a `200` with an image or video type it says `NOT PUBLIC` and
  that "the bucket must allow public read on `<prefix>`", and exits 1. It never changes the bucket's policy or ACLs:
  that is yours to set, ideally on `public/` only.
- A storage error stops the run (the secret is masked in the message); running again is safe.
- A file larger than 500 MB is refused (one upload is held in memory).
- If a file changes after it was uploaded, the recorded URL no longer counts: the plan warns and `push` falls back to
  `MEDIA_BASE_URL` until you run `upload` again.

Real output without `--yes` and without `S3_*` set, for the example batch with its seven files in place (abridged):

```
Batch example-launch: 7 media files to put in the bucket

local file                size     type        key                                                              public URL
------------------------  -------  ----------  ---------------------------------------------------------------  ----------------------------
01-what-is-acme-feed.jpg  0.09 MB  image/jpeg  public/example-launch/f33c78d095adec24-01-what-is-acme-feed.jpg  (S3_PUBLIC_BASE_URL not set)
...
Nothing was uploaded. With --yes each file is checked in the bucket first and uploaded only when missing.
The storage settings are not usable:
  - not set: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL (see .env.example)
  - S3_REGION is not set (for Hetzner it is the location: fsn1, nbg1 or hel1)
```

`upload` has only been run against fakes. Nothing has been sent to a real bucket.

### status

```
node packages/engine/buffer.mjs status <batch.json>
```

Needs `BUFFER_API_KEY` (and `BUFFER_ORG_ID` if the key sees several organisations), or with `accounts.json` the key of
each account that holds a record in the state file. It asks each account for its own posts and compares each record
only with the account that made it. Reads the first page of Buffer's
`scheduled` posts and its `draft` posts, prints them, then prints each record in `state/<name>.json` with whether it
is in Buffer. A record in `unknown` state is resolved to `created` only when exactly one Buffer post has the same
due time and the same text (ignoring runs of whitespace). It never creates, edits or deletes anything in Buffer.

Without a key it prints the same `BUFFER_API_KEY is not set` error. No real output exists yet.

## Safety rules

- **Drafts by default.** `push --yes` creates drafts. Only `push --live --yes` schedules for real.
- **`--yes` to send.** Without it, `push` prints and stops.
- **Media checks.** A post is refused unless every media URL answers a HEAD request with 200 and an `image/*` or
  `video/*` type. Other posts in the run carry on.
- **Duplicate protection by hash.** For each post and channel the state file stores a SHA-256 hash of the text, media
  (kind, path, thumbnail offset), due time, type and metadata. Same hash and same mode: skipped. Same hash, draft
  recorded, `--live` asked: created live. Different hash: refused, unless `--force-new`.
- **Past times.** `--live` refuses an item whose due time has already passed. Drafts are not checked.
- **No channel id, no route.** An item whose network has no id in `channels.json` (or in the routing of `accounts.json`)
  is refused; with `accounts.json`, a network with no route at all is refused too, never sent through another account.
- **A changed route is not a duplicate.** A record made in one account is not honoured as a record in another. If a
  network is routed to a different account than the one that created the post, `push` refuses until you delete the
  old post in Buffer and use `--force-new`.
- **No automatic retry after an uncertain result.** A network error, timeout, 5xx answer, a 200 answer that is not
  JSON or not a recognised result: the post is recorded as `unknown`, the run stops, and nothing is retried. The post
  may or may not exist in Buffer. See "What to do after an unknown result" below.
- **Other errors stop the run.** A `MutationError` from Buffer, an HTTP 4xx or a GraphQL error stops the whole run.
  Posts already created stay recorded.
- **Rate limits.** Requests go one at a time. Buffer's limits are per account, so each account has its own client: its
  own window (the client keeps under 140 requests in any 15 minutes) and its own `Retry-After` handling. A 429 answer
  waits for `Retry-After` (60 seconds if absent) and repeats the same request, up to three times. A 429 means the
  request was rejected, so repeating it cannot duplicate a post. The 600-a-day limit is not tracked; a month of three
  channels is far below it.
- **Warnings do not block.** Caption length, hashtags and media warnings are shown in `plan` and `push` but do not
  stop a send. Read them.

### What to do after an unknown result

1. Do not run `push --force-new` yet.
2. Run `node packages/engine/buffer.mjs status <batch.json>`. If Buffer holds exactly one post with the same time and text, the tool
   marks the record as created and nothing more is needed.
3. If it says `UNKNOWN: not found`, look in Buffer by hand, on the right channel, at the right time, in drafts and in
   the queue.
4. If the post is there and you want to keep it, leave the record alone and send the rest with `--only` or `--channel`
   for other items. If you want to resend it, delete it in Buffer first, then `push --only <id> --channel <network>
   --force-new --yes`.
5. If it is not there, `push --only <id> --channel <network> --force-new --yes`.

## Key and secrets handling

- The key lives in `.env` (git-ignored) or in the `BUFFER_API_KEY` environment variable. A real environment variable
  wins over `.env`. With several accounts there is one variable per account, named by `keyEnv` in `accounts.json`; the
  file itself never holds a key.
- The S3 secret (`S3_SECRET_ACCESS_KEY`) is handled the same way. It signs requests and is never sent itself, never
  printed, and masked in every error.
- It is sent only as `Authorization: Bearer <key>` to `https://api.buffer.com`.
- Every error message passes through a mask that replaces every key and secret this tool knows (all accounts, the S3
  secret) and any `Bearer ...` token with `***`. They are never written to `out/`, `state/` or `schema-cache.json`. Tests
  check this.
- Never paste the key into an issue, a chat, a commit or a batch file. If it leaks, revoke it at
  <https://publish.buffer.com/settings/api> and create a new one.
- Channel ids are not secret but belong to one account, so `channels.json` is git-ignored and `channels.example.json`
  is committed.

## Current status and known unverified points

Verified (by `npm test`, against a fake Buffer and a fake bucket): batch validation, time zone conversion, request
bodies, hashing and duplicate protection (including that a state file from before accounts existed is honoured), the
state file, error handling, rate-limit handling per account, routing a post across two accounts, X caption limits,
secret masking, the `check` and `status` logic, the SigV4 signer (against the examples AWS publishes), upload key
naming, idempotent upload and refusal outside `mediaRoot`.

Not verified against real Buffer (see [docs/buffer-api-notes.md](docs/buffer-api-notes.md)): the endpoint and auth,
the `createPost` mutation and its input and result types, every enum value, `saveToDraft`, video thumbnail offsets,
the `channels` and `posts` queries, the draft status value, whether Buffer fetches your media host, and the real
rate-limit behaviour. `node packages/engine/buffer.mjs check` tests many of these by introspection, but only against a live key.

Also not verified against anything real: that Hetzner Object Storage accepts the signed requests and serves the uploaded
files publicly under the bucket policy you set; that Buffer fetches media from that host; what Buffer calls X in its
`service` field and whether its `createPost` takes X posts with the fields this tool sends (no X-specific metadata is
sent); whether one person may run several free Buffer accounts (a question about Buffer's terms, see
`docs/spec/web-app.md`); and whether Buffer's rate limits are per key, per account or per organisation (the tool treats
them as per account).

Also open: X counts a link as 23 characters and some characters as two, and this tool counts plain characters; no alt text for images, no Instagram stories, no per-network times, and `status` reads only the first page
of results.

## Troubleshooting

| What you see | Cause | What to do |
| --- | --- | --- |
| `BUFFER_API_KEY is not set` | No key in `.env` or the environment | Create a key at publish.buffer.com/settings/api and put it in `.env` |
| `Buffer answered HTTP 401 (Buffer rejected the API key)` (or 403) | Wrong, revoked or mistyped key | Check `.env` for stray spaces or quotes; create a new key |
| `Several organizations found; set BUFFER_ORG_ID ...` | The key sees more than one organisation | Put one id in `BUFFER_ORG_ID` |
| `Buffer refused <post> / <network>: <message>` (a `MutationError`) | Buffer understood the request and said no | Read the message, fix the batch or Buffer account, rerun. Nothing was recorded for that post |
| `GraphQL error: ...` | Buffer's schema differs from what the tool sends | Run `check`; it lists the mismatches |
| `Buffer kept answering 429 (rate limit); stopped.` | Rate limit hit even after three waits | Wait 15 minutes and rerun; created posts are skipped |
| `REFUSE ... media not reachable: <url> -> HTTP 404` | File not uploaded, wrong `MEDIA_BASE_URL`, or a private bucket | Upload the file, fix the URL, run `media --verify` |
| `REFUSE ... content-type is "text/html", not image/*` | The host serves a page, a login or an error, not the file | Open the URL in a browser; fix hosting |
| `MEDIA_BASE_URL is not set and the media has not been uploaded ...` | No host for the media | Set `MEDIA_BASE_URL`, or run `upload` |
| `no Buffer key for account "<name>": set <VAR> in .env` | The variable named by `keyEnv` is empty | Put that account's key in `.env`; nothing was sent |
| `accounts.json is not valid:` followed by a list | Mistakes in `accounts.json` | Fix every line; see `accounts.example.json` |
| `... was created in account "A" but <network> is now routed to "B"` | The routing changed after the post was pushed | Delete the post in Buffer, then `push --force-new`, or restore the old routing |
| `NOT PUBLIC <file>: ... The bucket must allow public read on public/` | The uploaded file is not readable without a login | Allow public read on that prefix in the bucket's policy; rerun `upload` |
| `The storage settings are not usable:` | `S3_*` missing or wrong | Fix `.env`; see `.env.example` |
| `... was refused: HTTP 403 SignatureDoesNotMatch` (upload) | Wrong secret or access key id, or endpoint/region mismatch | Check `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` (the location) |
| `REFUSE ... no channel id for <network> in channels.json` | `channels.json` missing or empty for that network | Run `check`, copy the ids in |
| `REFUSE ... content changed since <id> was created` | You edited a post that is already in Buffer | Delete the Buffer post, then `push --only <id> --force-new --yes` |
| `REFUSE ... dueAt ... is in the past` | `--live` with a time that has passed | Change the date in the batch (this changes the hash), then use `--force-new` if it was already a draft |
| `REFUSE ... an earlier attempt got no clear answer` / `UNKNOWN` | A previous send had an uncertain result | Follow "What to do after an unknown result" |
| `The batch is not valid:` followed by a list | Batch file errors | Fix every line listed; see [docs/batch-format.md](docs/batch-format.md) |
| `Facebook type "post" is unverified; run check` | `schema-cache.json` does not exist yet | Run `check` (needs a key) |

## Tests

```sh
npm test                 # the engine tests, the AI tests, then the web app's
npm run test:engine      # node --test in packages/engine (runs every test*.mjs file, one at a time)
npm run test:ai          # node --test in packages/ai
npm run test:web         # vitest in apps/web; needs Postgres, see apps/web/README.md
```

The engine tests are in `packages/engine/`, the AI tests in `packages/ai/test-ai.mjs`.

`test.mjs`: 22 tests that use a fake Buffer and need no network. They do not need the media files.
`test-accounts.mjs`: accounts and routing (a post fanned out across two accounts), per-account rate limits,
failure reporting, the single-account setup and an old state file, the pinned hashes, X, `check` and `status` per
account. `test-storage.mjs`: the SigV4 signer against AWS's published examples, S3 settings, put and head against a
fake bucket that verifies every signature, upload keys, idempotence, refusal outside `mediaRoot`, secret masking, and
`push` using uploaded URLs.
`test-presign.mjs`: SigV4 query-string presigning (`packages/engine/lib/storage/presign.mjs`) against AWS's published example.
`test-buffer-delete.mjs`: `deletePost` (`packages/engine/lib/buffer-delete.mjs`, an unverified mutation) against a fake Buffer.
`test-design-render.mjs`: `renderDesignBlock` (`packages/engine/lib/design-render.mjs`, one post's design block without the CLI); the real render
needs Google Chrome and is skipped without it.
`test-design.mjs`: tests of the design tool (spec validation, flags, batch `design` blocks and media filling, file
names, enlargement maths, brand lint, contrast maths, line placement, layout checks) plus real renders that need
Google Chrome. `test-design-editorial.mjs`: the editorial templates (every field good and bad, hostile values, brand tokens and
shadows, contrast on the grounds, framed phones and the desktop window, object and panel checks, the carousel PDF read back from
its bytes, one real render per template, the refusal of an unframed phone). Without Chrome the
real renders are skipped with a message and the rest still run. The engine tests run the files one at a time (one Chrome).

## AI library

`packages/ai/` drafts batches from a vault of facts, researches the web and rewrites posts for the Vesk web app. Zero
dependencies, `fetch` only; every model answer and fetched page is untrusted and checked before it is returned. See
[docs/ai.md](docs/ai.md). Its tests are in `packages/ai/test-ai.mjs` (fake fetch, no network).


## Documentation

- [docs/monthly-routine.md](docs/monthly-routine.md): step by step, including first-time setup.
- [docs/design.md](docs/design.md): making the images: every template and option, your own photos and screenshots, the
  automatic checks, the photo rules.
- [docs/batch-format.md](docs/batch-format.md): every field of a batch file, including the `design` block.
- [docs/ai.md](docs/ai.md): the AI library: configuration, checks, safety rules, prompts and cost logging.
- [docs/buffer-api-notes.md](docs/buffer-api-notes.md): what the tool relies on in Buffer's API.
- [AGENTS.md](AGENTS.md): rules for anyone, person or AI agent, who changes or runs this repository.
- [media/README.md](media/README.md): what goes in `media/` and how to name files.
- [packages/engine/design/README.md](packages/engine/design/README.md): the templates, the fonts and the asset folders.
- [deploy/README.md](deploy/README.md): deploying the web app with Docker Compose.
