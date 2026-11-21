# Vesk: build contract

The approved spec is `web-app.md`. This file fixes the seams so three pieces can be built at the same time
on separate branches and merged cleanly. The decisions behind it are in `web-app.md` section 2.

## Layout

| Path | Owner branch | What |
|---|---|---|
| `packages/engine/` (`@vesk/engine`) | engine | `buffer.mjs`, `design.mjs`, `lib/`, `design/`. Small, additive changes only. Modules are imported as `@vesk/engine/<module>` (package `exports`: `./*` is `lib/*.mjs`). |
| `apps/web/` (`@vesk/web`) | web app | The web app: server, database, auth, web UI, jobs. Its own dependencies. |
| `packages/ai/` (`@vesk/ai`) | AI | AI provider adapter, search adapter, drafting and research. No third-party dependencies (`fetch` only); depends on `@vesk/engine` for the validators. |
| `deploy/`, `Dockerfile`, `.dockerignore` | `feat/deploy` | Container image and Dokploy set-up. |
| `batches/example-launch.json`, `batches/example-editorial.json` | `feat/deploy` | Example batches for the demo brand (poster and editorial templates). |
| `brands/` | engine | Brand packs: `brand.json`, logos, optional `map.json`, `vault.json` and `prompts/`. `brands/demo` (the fictional Acme Savings) is the default. |

A branch never edits files owned by another branch. Anything it needs from another piece goes through the
interfaces below; if an interface must change, say so in the branch report instead of editing the other side.

## App interface (`apps/web/`)

- Node 22.12+, TypeScript. Server: Hono. Database: Postgres through Prisma (`apps/web/prisma/schema.prisma`).
  Jobs: pg-boss on the same database. Web: React + Vite, built into `apps/web/dist/web` and served by the server.
  Auth: Better Auth, email and password, invite-only, roles `admin` and `editor`.
- `apps/web/package.json` scripts: `build` (server and web), `start` (runs the built server), `migrate`
  (`prisma migrate deploy`), `test`.
- The server listens on `PORT` (default 3000) and answers `GET /healthz` with 200 and `{"ok":true}` once the
  database is reachable.
- It calls the engine as a library through the workspace package: `@vesk/engine/design-render` and `design/*` to render,
  `push`, `accounts`, `client` to talk to Buffer, `storage/s3` for the bucket. Where the engine only exposes a CLI
  path, the app may add a thin exported function in a new file under `packages/engine/lib/` (additive). The engine's
  `ROOT` is the repository root (where `.env`, `batches/`, `media/`, `state/` and `out/` live).
- It calls AI through `@vesk/ai` only (see below). If the package is absent, `apps/web` uses a stub with
  the same signatures.

## Environment variables

| Variable | Used by | Meaning |
|---|---|---|
| `PORT` | app | HTTP port, default 3000 |
| `DATABASE_URL` | app | Postgres connection string |
| `APP_URL` | app | Public base URL, e.g. `https://social.example.com` (auth callbacks, invite links) |
| `BETTER_AUTH_SECRET` | app | Auth session secret, 32+ random bytes |
| `APP_ENCRYPTION_KEY` | app | 32 random bytes, base64; AES-256-GCM for stored Buffer and AI keys |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`, `S3_PREFIX` | app, engine | S3-compatible storage (Hetzner Object Storage was the target), as in `.env.example` |
| `CHROME_PATH` | engine | Chrome or Chromium binary in the container |
| `BRAND_DIR` | engine, AI, app | The brand pack, a folder under `brands/` relative to the repository root; default `brands/demo` |
| `APP_NAME` | app | The app's name in titles, emails and the sign-in page; default `Vesk` |
| `ZEPTOMAIL_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` | app | Invite and password-reset email through the ZeptoMail HTTP API (`MAIL_FROM` for example `noreply@example.com`; `MAIL_FROM_NAME` defaults to the brand's name). If unset, the admin page shows the invite link to copy instead. |
| `BOOTSTRAP_ADMIN_EMAIL` | app | On first start with no users, creates an invite for this email and logs the link once |

Buffer keys and AI provider keys are not environment variables in the app: they are entered in the admin page
and stored encrypted.

## AI interface (`@vesk/ai`)

```js
createAI({ providers, search, budget, log })   // config objects from the app's settings; keys already decrypted
  .draftBatch({ vault, series, period, count, channels, brand, timezone })
      // -> { batch, notes }   batch = the engine's batch JSON with `design` blocks,
      //    each post carrying `sources: [vaultItemId]` and `warnings: [string]`
  .research({ topics, vault, since })
      // -> { items: [{ kind, title, body, sourceUrls, foundAt }], checks: [{ vaultItemId, verdict, sourceUrls, note }] }
  .rewrite({ post, instruction, vault })
      // -> post (same shape as in draftBatch)
```

`brand` is optional: the library reads the brand pack's `brand.json` itself, and a `brand` given here may only override its
`name`, `tagline`, `website` and `descriptor`. `timezone` defaults to the pack's `timezone`.

- `providers`: `[{ id, kind: 'anthropic' | 'openai-compatible', baseUrl, model, apiKey, tasks: ['draft','research','rewrite'] }]`.
- `search`: `{ kind: 'brave' | 'tavily' | 'exa', apiKey }`.
- `budget`: `{ monthlyLimitUsd, spentUsd }`; calls stop with a clear error when exhausted. `log` receives one
  record per call: provider, model, task, tokens in and out, estimated cost, duration.
- All AI output is untrusted text: validated against the batch format and the design spec validators before it
  is returned.

## Status and safety rules carried over

Drafts before live, one approval per post, duplicate protection by hash, never retry an uncertain create,
secrets never logged or returned to the browser, the untrusted-text rules in `docs/design.md`, and no AI
attribution in commits.
