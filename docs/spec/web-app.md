# Vesk: web app spec

Status: the original design, written on 20 November 2026 before the app was built. The app in `apps/web` follows it;
where it differs, the code and `apps/web/README.md` are right. The command-line tool in this repository
(`packages/engine/buffer.mjs`, `packages/engine/design.mjs`) is the engine the app reuses.

## 1. What it is

A private web app where a brand's team keeps a store of facts, news and pictures about the brand and
its world. An AI uses that store to draft batches of social posts with finished images. A person approves
each post; approved posts are scheduled through one or more Buffer accounts.

Each deployment serves one brand. An admin sets it in Settings (identity, logos, colours, type, series, voice, visual
direction and design references), or imports a brand pack there. Until then the pack named by `BRAND_DIR` is shown (see
"Brand packs" in the README). It is not a general social media manager, and it never posts anything a person has not
approved.

## 2. Decisions

| Topic | Decision |
|---|---|
| Hosting | One container plus Postgres with Docker Compose (Dokploy as the worked example), on a server apart from production systems. |
| Media storage | Hetzner Object Storage (S3-compatible). Approved media get public URLs there, which Buffer fetches. |
| Users | A few team members. Email and password accounts, invited from an admin page. Better Auth. |
| AI | Provider-agnostic: Anthropic today, any OpenAI-compatible API later. Chosen per task in settings. |
| Buffer | Several Buffer accounts, each with its own key and channels. Keys entered in the app and stored encrypted with a key from the environment. |
| Approval | A batch is reviewed post by post. Posts can be edited, approved or removed; only approved posts are scheduled. |
| Look | The app has its own look (Vesk's light and dark themes, the layout of a modern publishing dashboard). The posts look like the brand: its typeface (the demo uses Inter, with IBM Plex Mono for labels and figures), its logo colours as accents, mostly neutral grounds, real photography first. |

## 3. Parts

### 3.1 Vault

Everything the AI may use. Each item has:

- **Kind:** fact, figure, news, event, product note, story, photo, screen.
- **Body:** the text, or the file for photos and screens.
- **Source:** where it came from (a link, a person, a document) and when it was recorded.
- **Status:** `confirmed` or `unconfirmed`. Only people confirm. Items the AI finds start unconfirmed.
- **Valid from / until:** figures carry the date they were true. A figure past its "until" date, or older than
  a set age, is flagged as stale and is not used without a warning.
- **For photos and screens:** licence or permission (own, licensed stock with credit, rights to confirm),
  whether identifiable people appear, and whether their consent is recorded. A photo with "rights to confirm"
  can be used in a draft but blocks approval of that post until resolved.
- **Tags** for series and topics.

### 3.2 Research

The AI looks for things that concern the brand and checks claims already in the vault.

- **Runs:** on a schedule (default weekly) and on demand, with a topic list kept in settings
  (for example central bank notices, savings and microfinance news in the brand's market, payment changes, events).
- **Output:** new vault items, all `unconfirmed`, each with the source links it read; and "check" notes on
  existing items (supported, contradicted, could not find).
- **Rule:** the AI never marks anything confirmed. A draft built on an unconfirmed item shows a warning
  on that post in review.
- **Web search:** done through a search provider behind an adapter (see 4.3), so research does not depend on one
  AI vendor's built-in search.

### 3.3 Batches

- **Create:** a person asks for a batch (period, number of posts, series mix, channels), or a monthly schedule
  creates one as a draft.
- **Draft:** the AI picks vault items, writes the post copy per series, writes captions per platform, chooses
  or suggests images (vault photos first; stock suggestions marked as such, with their licence), and the
  design engine renders every image in the needed sizes.
- **Every claim in a post links to the vault item it came from.** Review shows these links.
- **Review page:** one card per post with the rendered images, captions per platform, the date and time,
  the channels, its sources and any warnings. Actions per post: edit text, swap image, re-render, change
  date, approve, remove. Batch actions: approve all without warnings, schedule approved.
- **Schedule:** only approved posts. Each goes first to Buffer as a draft, then live once the batch owner
  confirms (or directly live if a setting allows it). The existing duplicate protection (hash per post and
  channel) carries over.

### 3.4 Publishing and Buffer accounts

- An admin adds Buffer accounts: a name and an API key. The app checks the key, lists that account's channels,
  and stores the key encrypted (see 4.4).
- **Routing:** each channel the team wants to use is mapped once to the Buffer account that holds it, for
  example X and LinkedIn through account A, Facebook and Instagram through account B. A post going to four
  channels is split across the two accounts automatically.
- **Status:** per post and channel: draft in Buffer, scheduled, sent, failed, unknown (an uncertain answer is
  never treated as success or failure; the existing "unknown" handling carries over).
- **Media:** before sending, the post's media are uploaded to S3-compatible storage under an unguessable path,
  checked reachable, and the public URL is given to Buffer.
- **Key expiry:** Buffer keys expire (30 days by default). The app shows each key's expiry and warns a week
  before.

## 4. Technical shape

### 4.1 Stack

Boring and small:

- TypeScript throughout, one repository (this one), one container.
- **Server:** Node 22.12+ with Hono or Express; Postgres (a small database on the same server); Prisma.
- **Jobs:** pg-boss on the same Postgres for research runs, drafting, rendering and Buffer calls. No Redis.
- **Web:** React with Vite, served by the same server.
- **Auth:** Better Auth, email and password, invite-only: an admin creates the invite, the person sets a password
  from the emailed link. Two roles: admin (users, Buffer accounts, AI settings) and editor (vault, batches,
  approval).
- **Rendering:** the existing design engine, with Chrome inside the container. One render at a time per
  container.

### 4.2 Design engine

The templates take their look from the brand pack's `brand.json`: fonts, accent colours, neutral grounds,
photo-led layouts, series as data (name, colours, layout rules). The untrusted-text rules already in
`docs/design.md` apply unchanged: everything the AI writes is data, escaped and validated before it reaches a
page.

### 4.3 AI adapter

One interface the rest of the app uses: `generate(task, input) -> structured output`, plus `search(query)` for
research.

- **Providers:** Anthropic Messages API and any OpenAI-compatible Chat Completions API (OpenAI, Azure OpenAI,
  OpenRouter, local models). Configured in settings: base URL, model, encrypted key, per task
  (research, drafting, captioning).
- **Structured output:** the app asks for JSON matching a schema and validates it; invalid output is retried
  once, then the task fails visibly.
- **Search:** a separate adapter (for example Brave Search, Tavily or Exa API), chosen in settings, so research
  works with any model.
- **Spend:** every AI and search call is logged with its token count and estimated cost; a monthly cap stops new
  runs when reached.
- **Prompts** live in the repository as versioned files, not in the database, so changes are reviewed.

### 4.4 Secrets

- `APP_ENCRYPTION_KEY` (32 random bytes, base64) in the environment. Buffer keys and AI keys are encrypted with
  AES-256-GCM, a fresh nonce per value, stored with a key version so the key can be rotated.
- Keys are never returned to the browser after saving; the page shows only the last four characters.
- Keys never appear in logs, errors or job payloads.

### 4.5 Storage

- An S3-compatible bucket (Hetzner Object Storage was the target) with two areas: `vault/` (private, read through
  short-lived signed URLs) and `public/` (only media of approved posts, unguessable paths, kept until the post has been
  sent and a retention period has passed).

### 4.6 What carries over from the command-line tool

Buffer client and schema check, duplicate protection by hash, the batch format (as the internal shape of a
batch), media checks, rate-limit handling, the design engine and its checks, and all their tests.

## 5. Build order

1. **Engine update:** new look in the templates; several Buffer accounts and channel routing; S3 upload.
2. **App without AI:** auth and invites, vault, manual batches with the review page, approval, scheduling,
   Buffer accounts with encrypted keys. Deployed with Docker Compose.
3. **AI drafting** from the vault, with claim-to-source links and warnings.
4. **AI research** on a schedule, with the search adapter and spend cap.

Each step is usable on its own and is reviewed before the next.

## 6. Open questions

1. **Buffer terms:** whether running several free Buffer accounts for one company is allowed. If not, one paid
   account is the safer route; the app supports either.
2. **Search provider:** which one (Brave, Tavily or Exa), and its key.
3. **Photo rights:** every photo a brand takes from its own website or elsewhere needs a known source and a licence
   that allows social posts before it goes in the vault.
4. **Domain:** the address the app will live at (for example `social.example.com`), behind the platform's proxy.
5. **Email sending** for invites and password resets: ZeptoMail, SMTP or none (links shown to copy).
