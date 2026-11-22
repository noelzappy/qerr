# Vesk

Vesk is an open-source social media desk for an organisation that posts every month. A small team keeps a vault of
confirmed facts and photos; the AI drafts a month of posts from it in the brand's voice; Vesk renders every image in the
brand's look; people review and approve each post; and the approved posts go to [Buffer](https://buffer.com), drafts
first. It works for any organisation without writing code: the brand, its logos, colours, voice and visual direction are
set in the admin panel, and the team can upload design references whose style the AI learns from.

Vesk is a web app (`apps/web`). Home, Create, Facts, Pictures, Publish, Activity and Settings, in light and dark:

- **Home** shows the week, what waits for approval, the setup steps and what goes out next.
- **Create** holds the batches. A batch is drafted by the AI or imported from a batch file; each post is written, reviewed,
  edited, given its image again if needed and approved one by one, in a four-step flow: Write, Review, Send drafts to Buffer,
  Go live.
- **Facts** and **Pictures** hold what the AI may write from and the photos and screens posts may use.
- **Activity** lists what the app does in the background: AI drafts, images, sends to Buffer.
- **Publish** shows every planned post on a calendar or a list, per channel, and sends approved posts to Buffer.
- **Settings** covers:
  - Brand and look: identity, logos (or a simple logo drawn from the name), colours with a live preview and contrast
    checks, post types, voice, visual direction, and the import of an existing brand pack.
  - Looks: how every kind of post is drawn (the shipped looks, such as Clean, Soft, Bloom, Retail and Swiss, or the brand's own
    copies, each design edited in a visual design editor), with two more tabs: Series, the brand's
    named recurring formats ("Tip of the week": a kind of post, the look's designs, a numbered mark, how often), which AI drafts
    plan into each batch, and Inspiration, pictures the AI describes as style briefs that guide every draft. With a look, a post
    may be a carousel of post pages (a cover, body pages and a closing page), one image per page. A newly saved brand starts on
    the Clean look.
  - Classic layouts (in the menu only while no look is in use): the brand's own page compositions, blocks dragged and resized on a canvas, each layout on its own page, checked and drawn by the
    engine like the built-in pages; posts and the AI can use them. The built-in layouts are listed too, read only, and can be
    duplicated into a layout of the brand's own on the built-in poster or editorial page.
  - The team, the Buffer accounts, the channels, the AI providers with a monthly budget, and the audit log.

Under it are two libraries with no dependencies, which the app imports:

- **The engine** (`packages/engine`, `@vesk/engine`). It renders finished, on-brand post images with headless Google
  Chrome or Chromium (post pages drawn by a look, poster pages with one strong picture, editorial pages with ledger and
  passbook cards, real product screens in framed phones and desktop windows, photo posts, and carousels with a PDF; see
  [docs/design.md](docs/design.md)), and it
  turns each approved post into one Buffer post per channel (Instagram, LinkedIn, Facebook and X) through Buffer's GraphQL
  API, with the duplicate guard, the media checks and the rate limits. The channels can belong to one Buffer account or
  to several.
- **The AI library** (`packages/ai`, `@vesk/ai`). It drafts, researches and rewrites from the vault only, and describes
  design references. It uses any Anthropic or OpenAI-compatible model. See [docs/ai.md](docs/ai.md).

The repository ships a fictional demo brand, Acme Savings (`brands/demo`), so a fresh install has a brand to show and
render with until an admin sets the real one, a second fictional finance brand for testing, Pennyhive
(`brands/pennyhive`), chosen with `BRAND_DIR=brands/pennyhive`, and a fictional polls and community brand, Tallyho
(`brands/tallyho`), that shows off the loud look.

Licence: MIT, see [LICENSE](LICENSE).

## Status: no post sent through the real Buffer API yet

Vesk has been tested against a fake Buffer and fake or local storage. Against the real Buffer API it has run once, a
read-only check on 22 Nov 2026: the account check's two queries (organisations, then channels), which confirmed the
endpoint, the bearer authentication, those two queries and that Buffer calls X `twitter`. No post, draft or other
mutation has been sent. Everything else it knows about Buffer (the mutations, field names, enum values) comes from
Buffer's public documentation and has not been confirmed on a live account. Read
[docs/buffer-api-notes.md](docs/buffer-api-notes.md) for what is confirmed and the full list of unverified points, and
follow "The first run against real Buffer" below before trusting it with a month of posts.

The routing across several Buffer accounts, sending to X and the copy of media to S3-compatible storage (Hetzner Object
Storage was the target) are tested against fakes only. **No post has been sent to a real Buffer account, and nothing
has run against a real Hetzner bucket yet.** The S3 signer is checked against AWS's published signing examples, which
proves the signature maths, not that Hetzner accepts it.

## What it is and is not

It is:

- A desk for one brand per deployment: a vault of facts and pictures, batches of posts, review and approval, a calendar.
- An image maker for the brand's posts: the words and pictures in, finished images out in the brand's look, checked by
  the engine (contrast, enlargement, text that does not fit, exact pixel size).
- A careful Buffer client: approved posts only, drafts before live, one Buffer post per post and channel, never sent
  twice by accident.

It is not:

- A free-form design tool. Every page is drawn from data the engine checks: a look's designs or a layout, edited in the
  admin panel from fixed lists of pieces and bounded settings, never as markup or CSS. The brand sets the colours, fonts
  and logos, and people choose the words, the picture and a few options.
- A general social media manager. It only creates, lists and deletes the posts it made, through Buffer. It never talks
  to Instagram, LinkedIn, Facebook or X directly.
- A media host for anyone else. Buffer takes media by public URL only, so the app copies the files of each post it sends
  to the public prefix of a bucket you own. It does not create or configure the bucket.
- A WhatsApp tool (WhatsApp is not a Buffer channel), and not wired to TikTok (Buffer supports it; Vesk knows Instagram,
  LinkedIn, Facebook and X).

There are two ways to draw a post. With a **look** (Settings, Looks), a post uses the `post` template: it says what it is
(`kind`: statement, figure, list, quote, photo, event or offer) and the look decides how it is drawn, with its own fonts,
grid, devices and checks. A look is data (`brand.looks`, named by `style.direction` in the pack the app writes); the
engine ships several, and a brand may copy one and change it. A newly saved brand starts on the shipped Clean look. The
engine also has three directions written as code (`editorial`, `swiss`, `retail`) that a pack, or a brand saved with an
older choice, can name in `style.direction` instead. With neither, the **classic layouts** draw the post: the fixed
templates and the brand's own layouts, and a `post` design is refused with a message. See "Design directions and the post template" and "Looks as data" in [docs/design.md](docs/design.md).

## Quick start

### On a server: Docker Compose

`deploy/docker-compose.yml` runs two containers: `app` (the `Dockerfile` at the repository root: the web app, the engine,
the AI library, the brand packs and Chromium, on Node 22) and `postgres` (16, with a named volume). The app migrates the
database, then starts on port 3000 behind your HTTPS reverse proxy; the compose file publishes no host port.
[deploy/README.md](deploy/README.md) walks through it on Dokploy: the environment variables, the domain, the first
login, seeding, backups, updating and why Chromium runs without its sandbox.

The short version, on a host with Docker and a proxy:

1. Generate `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` and `APP_ENCRYPTION_KEY` (`openssl rand -base64 32` each) and keep
   a copy of `APP_ENCRYPTION_KEY` outside the server: without it the stored keys cannot be read.
2. Set them with `APP_URL`, `BOOTSTRAP_ADMIN_EMAIL`, `STORAGE_DRIVER=s3` and the `S3_*` values in the platform's
   environment, then deploy.
3. Open the invite link the app logs once (`bootstrap.admin_invite`), set a password, and follow the setup steps on Home.

### On your machine: local development

You need Node.js 22.12 or newer, Postgres 16 and Google Chrome or Chromium (set `CHROME_PATH` if neither is in the usual place).
From the repository root:

```sh
npm install                                        # every workspace
docker run -d --name vesk-pg -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:5432:5432 postgres:16
docker exec vesk-pg createdb -U postgres vesk      # or any empty database (wait a few seconds after the first line)

cd apps/web
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vesk
export APP_URL=http://localhost:3000
export BETTER_AUTH_SECRET=$(openssl rand -hex 24)
export APP_ENCRYPTION_KEY=$(openssl rand -base64 32)   # keep it: stored keys cannot be read without it
export STORAGE_DRIVER=local
export BOOTSTRAP_ADMIN_EMAIL=you@example.com
npm run build && npm run migrate && npm start      # or `npm run dev` with `npm run dev:web` for Vite
```

Open the invite link the server logs on its first start, choose a name and a password, and sign in. Then follow the
setup steps on Home; each opens the page where it is done:

1. Set up the brand (Settings, Brand and look). Saving it starts the brand on the Clean look (Settings, Looks).
2. Upload the logos, or draw a simple pair from the name (Settings, Brand and look, Logos).
3. Connect the channels (Settings, Channels): add a Buffer account and run Check on it, then choose the account and
   channel for each network.
4. Add an AI provider and a monthly budget (Settings, AI and search).
5. Add the team's facts to Facts.
6. Invite the team (Settings, Team).
7. Draft the first batch with AI, or import one (the two files in `batches/` are examples for the demo brand).

The details, every command and the test set-up are in [apps/web/README.md](apps/web/README.md).

## Configuration

The deployment is configured by environment variables, read once at start; a missing or invalid value stops the server
with a message that names the variable, never its value. The main ones:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. The app and its pg-boss jobs share the database. |
| `APP_URL` | The public address, for invite and reset links and the origin check. |
| `BETTER_AUTH_SECRET` | The session secret. |
| `APP_ENCRYPTION_KEY` | 32 random bytes, base64. Encrypts the stored Buffer and AI keys. Rotation: `APP_ENCRYPTION_KEY_VERSION` and `APP_ENCRYPTION_KEY_OLD`. |
| `BOOTSTRAP_ADMIN_EMAIL` | On the first start with no users, the app logs one admin invite for this address. |
| `STORAGE_DRIVER` and `S3_*` | `local` (a folder, for development and tests) or `s3` with `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` and `S3_PREFIX` (default `public/`). |
| `CHROME_PATH` | The Chrome or Chromium binary the engine renders with. |
| `BRAND_DIR` | The brand pack shown until a brand is saved in Settings, and the source of the first vault. Default `brands/demo`. |
| `APP_NAME` | The app's name in titles, emails and the sign-in page. Default `Vesk`. |
| `ZEPTOMAIL_API_KEY`, `MAIL_FROM` or `SMTP_*` | Invite and reset emails. Without them the admin page shows the link to copy. |

The full list (rate limits, proxies, seeding, mail) is in [apps/web/README.md](apps/web/README.md).

**Keys are not environment variables.** Buffer keys (one per Buffer account) and the AI and search provider keys are
entered by an admin in Settings and stored encrypted with `APP_ENCRYPTION_KEY` (AES-256-GCM, with a key version so the
key can be rotated). After saving, the app shows only their last four characters; they are never returned to the
browser, logged or put in a job payload. A new deployment can be seeded with them once through `SEED_SECRETS_B64` (see
section 4a of [deploy/README.md](deploy/README.md)). Buffer keys expire (30 days by default), so expect to replace them
in Settings, Channels, under Buffer accounts.

## The brand and the design references

**The brand is set in Settings, Brand and look**, and the app keeps it in its database: identity (name, website,
tagline, what the brand does, time zone, language, currency), logos, colours, type (each role's font built in, picked
from a curated list of Google Fonts that the server downloads once in every weight the role uses, or uploaded), series,
voice, visual direction, and an Advanced section with a `brand.json` fragment, a dot map and the import of a brand
pack. While people pick
colours, the page shows the colours posts will use and the contrast checks. Every value passes the engine's own
`validateBrand` before it is saved. Behind the scenes the app writes the saved brand out as a pack folder under
`state/brand/` and points the engine at it, so the renders and the AI read the same brand. Images are refused until the
logos are uploaded. [apps/web/README.md](apps/web/README.md) ("The brand") says how the four colours are spread over the
engine's tokens and fitted for contrast.

**Design references** (Settings, Looks, Inspiration) are pictures the team likes: a post, a poster, an advert, a page. A
background job sends each to the drafting provider's model, which writes a style brief (summary, palette, type, layout,
imagery, mood, what to avoid). People can edit a brief or switch it off; the briefs that are on reach every draft and
rewrite as part of the brand. They are taste, not facts: the prompts tell the model to follow them where the hard rules
leave room and never to quote them as claims. The drafting model must be able to read images.

**Looks** (Settings, Looks) decide how each kind of post is drawn: pick a shipped look, or customise a copy of one, its
settings (dials, typefaces, type, page, colour, devices, pictures, logo) and its designs (at most three per kind), each edited in
a visual design editor and checked by the engine with sample, stress and minimal copy before it is published. Series and
Inspiration are tabs of the same page. See "Looks as data" in [docs/design.md](docs/design.md).

**Layouts** (Settings, Classic layouts, in the menu while no look is in use) are the brand's own compositions: blocks (a headline, a photo, a colour panel, figures, the
logo) placed in slots on a grid, with options from fixed lists, edited visually (conditions and page-colour cases included) or
as JSON. No one writes markup or CSS: the engine checks every layout,
draws it in the brand's look and checks each image like a built-in page. A post picks one in its design, the AI is told
about the ones in use, and a design reference may suggest one, which an admin previews before adding it. The built-in templates'
own layouts are listed there too, read only; an admin may duplicate one (all but the phone beside a passbook and the photo post)
and change it on the built-in poster or editorial page. See [docs/design.md](docs/design.md), "Your own layouts" and "Starting
from a built-in layout".

### Brand packs

A brand can also live in files: a **brand pack**, one folder under `brands/`. Until an admin saves a brand, the app
shows the pack named by `BRAND_DIR` (the demo by default) and seeds its first vault from that pack's `vault.json`. An
existing pack moves into the app through Settings, Brand and look, Advanced, "Import a brand pack": choose its
`brand.json`, its two logos and its optional `map.json`. The pack's exact colours and rules are kept.

| File | Needed | What it is |
| --- | --- | --- |
| `brand.json` | yes | Name, website, tagline, descriptor, colours (grounds, text, accents, gradient, surfaces), shadows, radii, window and phone chrome, fonts, logo paths, series, spelling rules, length guidance, contrast targets and photo thresholds. Optional `timezone` and `money`. Every value is checked on load; a wrong one stops with the full list. See "The brand file" in [docs/design.md](docs/design.md). |
| `logos/logo-full.png`, `logos/logo-mark.png` | yes | The full colour logo (the mark, then the wordmark) and the mark alone, transparent PNGs. `brand.json` names them by paths relative to the repository root, for example `brands/demo/logos/logo-full.png`. |
| `vault.json` | no | The first vault: facts, figures and research topics the app imports once, into an empty database (see [apps/web/README.md](apps/web/README.md)). |
| `map.json` | no | A dot map for the `closing` template's `map: true`: a grid, regions of cells and the regions to light. |
| `prompts/<name>.md` | no | Replaces the AI library's `draft`, `research`, `rewrite` or `reference` prompt for this brand (see [docs/ai.md](docs/ai.md)). |

**Choosing the pack.** `BRAND_DIR` names it, relative to the repository root, in the environment (a blank value counts
as unset). It must be a folder inside the repository, and in a container the pack must be in the image (the `Dockerfile`
copies `brands/`). Without it the default is `brands/demo`.

**The demo pack** (`brands/demo`) is a fictional brand, Acme Savings: website `acmesavings.example`, time zone
`Europe/London`, money in euros. Its `map.json` is an invented island and its `vault.json` holds invented facts and
figures only. `brands/demo/make-assets.mjs` draws its logos, the map and three synthetic demo pictures
(`packages/engine/design/assets/demo/object-jar.jpg`, `scene-market.jpg`, `screen-desk.png`) with the engine's Chrome
helper; those files are committed, so the example batches render on a fresh install. Run
`node brands/demo/make-assets.mjs` again only after changing a drawing (it needs Chrome).

**The Pennyhive pack** (`brands/pennyhive`) is a second fictional brand, for testing with a finance brand: Pennyhive, a
savings-club app (website `pennyhive.example`, time zone `Europe/Dublin`, money in euros). Deep green and teal grounds
with a honey accent, Hanken Grotesk with JetBrains Mono, and `style.direction` set to `retail`, so every `post` kind
draws. Its `vault.json` holds invented facts with round, illustrative figures; its `map.json` is an invented coastline.
`brands/pennyhive/make-assets.mjs` draws its logos (`logos/*.svg` as the source and the `logos/*.png` the engine reads)
and the map with the standard library only, no Chrome. It draws no pictures of its own: its example batch,
`brands/pennyhive/batches/example-posts.json` (seven `post` designs, one per kind), uses the demo pictures above;
`batches/example-ledger.json` (eleven posts with a five-page how-it-works carousel, for the shipped Ledger look) uses them and
three photos recorded in `packages/engine/design/assets/photos/CREDITS.md` (not committed: put them there before rendering). Use it
with `BRAND_DIR=brands/pennyhive`; `test-brand-pennyhive.mjs` keeps the pack and both batches valid. The demo stays the
default and the pack every test and example uses.

**The Tallyho pack** (`brands/tallyho`) is a third fictional brand, made to show off the loud look: Tallyho, a polls and
community app (website `tallyho.example`, time zone `Europe/Dublin`, money in euros). A saturated blue primary, an orange
accent and a deep purple dark ground, Hanken Grotesk, invented facts with round figures in `vault.json`, and logos (a
speech bubble with a tick and a heavy monoline "tallyho") drawn by `brands/tallyho/make-assets.mjs` with the standard library
only. Its `brand.json` names no direction: choose the Loud look in Settings, Brand and look. Its example batch,
`brands/tallyho/batches/example-posts.json` (eleven `post` designs over every kind), uses photos of the engine's photo library
(`packages/engine/design/assets/photos/`, recorded in its `CREDITS.md`): those files are git-ignored, so on a fresh clone the
picture posts are refused until the photos are put there. `test-brand-tallyho.mjs` keeps the pack and its batch valid.

**Starting your own pack.**

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
4. Set `timezone` to the brand's IANA time zone (the AI drafts in it, the app shows it; batches name their own). Set
   `money.local` to one sentence on the brand's currency and `money.foreign` to a pattern of the currencies pictures must
   not show and texts are warned about, or remove `money` to allow every currency.
5. Write `vault.json` with the brand's own confirmed facts, in the demo's format.
6. Optionally add `prompts/draft.md`, `research.md`, `rewrite.md` or `reference.md` (start from `packages/ai/src/prompts/`,
   keep the version line), and a `map.json` from data you may use.
7. Import the pack in Settings, Brand and look, Advanced (or set `BRAND_DIR=brands/<your-brand>` and restart the app),
   render one post and look at the image.

A pack can hold private facts (`vault.json`) and the brand's own artwork. Keep a real brand's pack in a private repository
or fork, not in a public one; `npm run export-public` makes a public copy of the repository that leaves out every pack
but the fictional ones, `brands/demo`, `brands/pennyhive` and `brands/tallyho` (`PUBLIC_PACKS` in `scripts/export-public.mjs`).

## How it works

```
 vault (facts, figures, photos, screens)          design references
        |                                                |
        v                                                v
   draft-batch job: the AI writes a batch from the vault, in the brand's voice    (or: import a batch file)
        |
        v
   render-post job: the engine renders each post's design block with Chrome, then checks it
        |            (contrast, enlargement, text that fits, exact pixel size)  -> private storage
        v
   review: people edit, re-render and approve each post; warnings and sources on every card
        |
        v
   plan: one row per post x channel, with the account, the channel and what will happen
        |
        v
   send-batch job, drafts: the files about to be sent are copied to the public prefix and checked
        |                  (HEAD: 200 and image/* or video/*), then createPost with saveToDraft
        |                  you review the drafts in Buffer
        v
   send-batch job, live: createPost without saveToDraft, for posts whose draft is in Buffer
        |
        v
   refresh-delivery job (and every 15 minutes): lists each account's scheduled and draft posts and reconciles them
```

Everything a person does is checked on the server by role: an `editor` works on the vault, batches, review, approval
and drafts; sending live and deleting from Buffer is for an `admin` or the person who made the batch. Every change goes
into the audit log. A post's deliveries (one per channel) are the app's record of what is in Buffer; they are the only
thing that stops a second send from creating a duplicate.

## Safety model

- **Approved posts only, drafts first.** Only approved posts go out. A send is drafts unless a person chooses live, and a
  post goes live only from its draft in Buffer, unless an admin has turned on direct live sends (`allowDirectLive`).
  Changing an approved post (its text, its date, a file) takes its approval away.
- **The plan is confirmed.** A send names the plan it was confirmed against (the number of posts times channels and a
  token over every row). If anything changed since the plan was shown, nothing is sent.
- **Media checks.** A post is refused unless every media file has been copied to the public prefix and its URL answers
  a HEAD request with 200 and an `image/*` or `video/*` type. Other posts in the run carry on.
- **Duplicate protection by hash.** For each post and channel the delivery stores a SHA-256 hash of the text, media
  (kind, path, thumbnail offset), due time, type and metadata. Same hash and same mode: skipped. Same hash, draft in
  Buffer, live asked: created live (the draft stays in Buffer; delete it there). Different hash: refused until the old
  post is deleted from Buffer.
- **Past times.** A live send refuses a post whose due time has already passed.
- **No route, no send.** A post on a network with no route (Settings, Channels), no channel id or no key is not sent,
  and never through another account. A record made in one account is not honoured in another: if a network is routed to
  a different account than the one that made the post, the plan refuses it until the old post is deleted from Buffer.
- **No automatic retry after an uncertain result.** A network error, timeout, 5xx answer, a 200 answer that is not JSON
  or not a recognised result: the delivery is recorded as `unknown`, the run stops, and nothing is retried. The post may
  or may not exist in Buffer. Refresh the status: an `unknown` delivery is resolved only when exactly one Buffer post in
  that account has the same due time and the same text. Otherwise look in Buffer and resolve it by hand in the app.
- **Other errors stop the run.** A `MutationError` from Buffer, an HTTP 4xx or a GraphQL error stops the whole run.
  Posts already created stay recorded, and the run says which account and channel it stopped at and what was not sent.
- **Rate limits.** Requests go one at a time. Each Buffer account has its own client: its own window (under 140 requests
  in any 15 minutes) and its own `Retry-After` handling. A 429 waits for `Retry-After` (60 seconds if absent) and repeats
  the same request, up to three times; a 429 means the request was rejected, so repeating it cannot duplicate a post.
- **Untrusted text.** Everything the AI writes, every fetched page and every batch value is data: validated against the
  batch format and the design spec, escaped before it reaches a render page, and rendered in a locked-down page (a
  strict Content-Security-Policy, pictures as checked `data:` files, every other request blocked). See "Untrusted text"
  in [docs/design.md](docs/design.md) and "Safety rules" in [docs/ai.md](docs/ai.md).
- **Secrets.** Keys are encrypted at rest, shown by their last four characters only, and masked out of every error and
  log line. Private files (vault pictures and renders) live under unguessable keys and are read through short-lived
  signed URLs; only the files about to be sent are copied under the public prefix. The app never changes the bucket's
  policy or ACLs.

## The first run against real Buffer

Do this once, before the first real batch, because no post has been sent through real Buffer yet.

1. Add one Buffer account in Settings, Channels, and run Check. It must list the organisation and the channels you
   expect; route one network to one channel in Settings, Channels.
2. Make a batch with one post, approve it, and send it as a draft to that channel only.
3. Open Buffer and look at the draft: the text with its line breaks and hashtags, the date and time in the right time
   zone, the media in the right order (and a video's thumbnail), the post type and first comment, and the channel.
4. Refresh the status in the app. The delivery must show as a draft in Buffer. If the draft is not listed, or the refresh
   fails, note the message: the `draft` status value is one of the unverified points.
5. The first time you use several accounts, X or the bucket: send one draft through each account and look at each in
   the right Buffer login; for X, compare the text length with the plan; open one public media URL in a private browser
   window (it must show without a login).
6. Write what you confirmed into [docs/buffer-api-notes.md](docs/buffer-api-notes.md). If anything was wrong, delete the
   test draft in Buffer (from the app or in Buffer) and stop until it is fixed.

## Current status and known unverified points

Verified by the tests, against a fake Buffer and a fake bucket: batch validation, time zone conversion, request bodies,
hashing and duplicate protection (including records that carry no account), error handling, rate-limit handling per
account, routing a post across two accounts, X caption limits, secret masking, status reconciliation, the SigV4 signer
(against the examples AWS publishes), upload key naming, idempotent upload and refusal of files outside the send folder,
and the web app's routes, roles, jobs and pages against a real Postgres.

Confirmed against real Buffer by the read-only check of 22 Nov 2026: the endpoint and bearer authentication, the
`organizations` and `channels` queries, and that an X channel's `service` is `twitter`. Not verified against real Buffer
(see [docs/buffer-api-notes.md](docs/buffer-api-notes.md)): the `createPost` and `deletePost` mutations and their input
and result types, every enum value, `saveToDraft`, video thumbnail offsets, the `posts` query, the draft status value,
the order and number of images Buffer keeps in a carousel, whether Buffer fetches media from the bucket, and the real
rate-limit behaviour. Also not verified against anything real: that Hetzner Object Storage accepts the signed requests
and serves the copied files publicly under the bucket policy you set; whether Buffer's `createPost` takes X posts with
the fields Vesk sends; whether one person may run several
free Buffer accounts (a question about Buffer's terms, see [docs/spec/web-app.md](docs/spec/web-app.md)); and whether
Buffer's rate limits are per key, per account or per organisation (Vesk treats them as per account).

Also open: X counts a link as 23 characters and some characters as two, and Vesk counts plain characters; no alt text
for images, no Instagram stories, no per-network times, and a status refresh reads only the first page of Buffer's
results.

## Tests

```sh
npm test                 # the engine tests, the AI tests, the script tests, then the web app's
npm run test:engine      # node --test in packages/engine (every test*.mjs file, one at a time: one Chrome)
npm run test:ai          # node --test in packages/ai
npm run test:scripts     # node --test for scripts/ (the public export)
npm run test:web         # vitest in apps/web; needs Postgres, see apps/web/README.md
npm run typecheck --workspace @vesk/web
```

`npm test` needs no keys and no network: Buffer, the AI providers and the bucket are faked. The render tests need Google
Chrome or Chromium (`CHROME_PATH`) and are skipped with a message without it; the web app's tests need Postgres 16 on
`127.0.0.1:55440` (a throwaway `docker run -d -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:55440:5432 postgres:16` will do).

The engine tests, in `packages/engine/`:

- `test.mjs`: the push loop against a fake Buffer: time zones, the hash and the duplicate guard, request bodies, drafts
  and live, a 429 and `Retry-After`, an unclear answer recorded as `unknown` and never retried, media checks, media that
  was not uploaded, past times, status reconciliation and the example launch batch.
- `test-accounts.mjs`: account names, a post fanned out across two accounts, per-account rate limits, failure reporting,
  the pinned hashes, records that carry no account, X, and status per account.
- `test-storage.mjs`: the SigV4 signer against AWS's published examples, S3 settings, put and head against a fake bucket
  that verifies every signature, upload keys, idempotence, refusal outside the media folder, secret masking, and push
  using the uploaded URLs. `test-presign.mjs`: query-string presigning (`lib/storage/presign.mjs`).
- `test-buffer-delete.mjs`: `deletePost` (`lib/buffer-delete.mjs`, an unverified mutation) against a fake Buffer.
- `test-design-render.mjs`: `renderDesignBlock` (`lib/design-render.mjs`, the render job's entry point).
- `test-design.mjs`, `test-design-editorial.mjs`, `test-design-poster.mjs`, `test-design-website.mjs`,
  `test-design-edge.mjs`: spec validation, file names, enlargement and contrast maths, brand lint, line placement, layout
  checks, the editorial and poster templates, the carousel PDF read back from its bytes, and real renders of every
  template through `renderDesignBlock`.
- `test-design-security.mjs`: hostile text in every field of every template stays inert; the page's
  Content-Security-Policy and request blocking.
- `test-design-directions.mjs`, `test-design-look*.mjs`, `test-design-post-carousel.mjs`, `test-design-series.mjs`: the
  `post` template, the code directions, looks as data (the schema, the renderer, every shipped look through every check,
  the hooks the web app and the AI library use), carousels of post pages and named series.
- `test-design-find-chrome.mjs`: finding Chrome, then Chromium, and the message when neither is there.
- `test-brand-pack.mjs`: `BRAND_DIR`, the demo pack and the brand file's optional fields.
- `test-brand-pennyhive.mjs`: the Pennyhive pack loads, its spelling rules hold, and its example batch passes the post
  checks in its direction and its Ledger batch those of the shipped Ledger look.
- `test-brand-tallyho.mjs`: the Tallyho pack loads, its spelling rules hold, its example batch passes the post checks in the
  loud look, and its vault holds round, invented figures. `test-design-look-loud.mjs`: the loud look (pure, and with Chrome
  every composition through every check). `test-design-look-paste.mjs`: the taped picture, paper texture, icon badges, bold
  emphasis and badged icons, with hostile values.

The AI tests are in `packages/ai/test-ai.mjs` (fake fetch, no network), the export tests in
`scripts/test-export-public.mjs`, and the web app's specs in `apps/web/src/**/*.spec.ts`.

## Repository layout

An npm workspaces monorepo.

| Path | What it is |
| --- | --- |
| `apps/web/` (`@vesk/web`) | The web app: a Hono server, Postgres through Prisma, pg-boss jobs, and a React client built into `dist/web` (see [apps/web/README.md](apps/web/README.md)). The only workspace with dependencies. |
| `packages/engine/` (`@vesk/engine`) | The engine: `lib/` (batch validation, the Buffer client, the push loop, storage, the design renderer) and `design/` (brand CSS, templates, fonts and the asset folders, including the committed demo pictures in `design/assets/demo/`), and its tests. No dependencies. The app imports its modules as `@vesk/engine/<module>`, for example `@vesk/engine/batch`. |
| `packages/ai/` (`@vesk/ai`) | Drafting, research, rewriting and design-reference analysis (`src/`, with the versioned prompts) and its tests. No third-party dependencies; it uses the engine's validators. |
| `brands/` | Brand packs, one folder each; `brands/demo` (the fictional Acme Savings) is the default, `brands/pennyhive` (the fictional Pennyhive, with its own example batch) a second test brand, `brands/tallyho` (the fictional Tallyho) the loud look's brand. |
| `batches/` | Two example batch files for the demo brand, to import in the app (Create, New batch, the "Import a batch file" tab, marked Advanced) or to start from. |
| `deploy/`, `Dockerfile` | The container image and the Docker Compose set-up, with `deploy/check.sh` to try it end to end. |
| `docs/` | The documentation (below). |
| `scripts/` | `export-public.mjs`: a public copy of the repository without private brand packs (`npm run export-public`). |

At run time the app writes `state/brand/` (the saved brand as a pack) and `out/` (the render lock and temporary renders)
at the repository root, and `apps/web/.data/` with the local storage driver. None of them is in git.

## Documentation

- [apps/web/README.md](apps/web/README.md): the web app: install, commands, environment variables, the brand, seeding,
  roles, jobs, AI and known limits.
- [deploy/README.md](deploy/README.md): deploying with Docker Compose (Dokploy as the worked example).
- [docs/design.md](docs/design.md): the images: every template and option, the `post` template and looks as data,
  pictures and screenshots, the automatic checks, the photo rules.
- [docs/batch-format.md](docs/batch-format.md): every field of a batch, including the `design` block.
- [docs/ai.md](docs/ai.md): the AI library: its interface, configuration, checks, safety rules, prompts and cost logging.
- [docs/buffer-api-notes.md](docs/buffer-api-notes.md): what Vesk relies on in Buffer's API, and what is unconfirmed.
- [docs/spec/web-app.md](docs/spec/web-app.md): the original design of the web app.
- [packages/engine/design/README.md](packages/engine/design/README.md): the templates, the fonts and the asset folders.
- [AGENTS.md](AGENTS.md): rules for anyone, person or AI agent, who changes or runs this repository.
- [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
