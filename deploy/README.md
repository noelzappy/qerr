# Deploying Vesk with Docker Compose

The stack is two containers from `deploy/docker-compose.yml`: `app` (built from the `Dockerfile` at the repository
root on Node 22: the npm workspaces `apps/web`, `packages/engine` and `packages/ai`, the brand packs in `brands/`, and
Chromium) and `postgres` (official image, major version 16, named volume). The app runs `npm run migrate` and then
`npm start` in `apps/web` (`deploy/entrypoint.sh`), listens on port 3000 and answers `GET /healthz`.

Any host that runs Docker Compose behind an HTTPS reverse proxy will do. The steps below use
[Dokploy](https://dokploy.com) as the worked example; the compose file joins Dokploy's external `dokploy-network` so its
proxy can reach the app. On another platform, keep the service name `app` and port `3000` and wire the proxy your way.

Deploy it on a server of its own or a staging server, not next to production systems: the app runs Chromium (see
"Chromium and the sandbox").

## 1. Create the project

1. In Dokploy, open the server, create a project, then **Create Service > Compose**.
2. Source: **GitHub**, repository `<your-org>/<your-repo>`, branch `main`, compose path `deploy/docker-compose.yml`.
   Compose type: Docker Compose.
3. Open the **Environment** tab and paste the variables below.

## 2. Environment variables

Generate the secrets on your own machine:

```sh
openssl rand -base64 32   # run once for BETTER_AUTH_SECRET, once for APP_ENCRYPTION_KEY, once for POSTGRES_PASSWORD
```

| Variable | Required | Meaning |
|---|---|---|
| `POSTGRES_PASSWORD` | yes | Password of the `social` database user. Used by both containers. |
| `BETTER_AUTH_SECRET` | yes | Session secret, 32+ random bytes. |
| `APP_ENCRYPTION_KEY` | yes | 32 random bytes, base64. Encrypts the stored Buffer and AI keys. **Keep a copy outside the server: without it the stored keys cannot be read, and changing it breaks them.** |
| `APP_URL` | yes | The public address, for example `https://social.example.com`. Used for invite and reset links and the origin check. The compose file refuses to start without it. |
| `BRAND_DIR` | no | Rarely needed: the brand is set in Settings (see "Your own brand"). The starting brand pack: a folder under `brands/`, relative to the repository root, for example `brands/acme`. Empty means the demo pack, `brands/demo`. It must stay inside the repository, and the pack must be in the image (the `Dockerfile` copies `brands/`). |
| `APP_NAME` | no | The name in page titles, emails and the sign-in page. Default: `Vesk`. |
| `BOOTSTRAP_ADMIN_EMAIL` | first deploy | Email of the first admin (see section 4). Set it in the platform only; it is not in the repository. |
| `SEED_SECRETS_B64` | first deploy only | One-time secrets seed (section 4a). Remove it after the first start. `SEED_VAULT=0` turns off the automatic vault seed. |
| `ZEPTOMAIL_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` | for email | Invites and password resets go through ZeptoMail's HTTP API. `MAIL_FROM` is the sender address, for example `noreply@example.com`; `MAIL_FROM_NAME` defaults to the brand's name. If unset, the admin page shows the invite link to copy instead. |
| `STORAGE_DRIVER` | for scheduling | `local` (the default: files stay inside the container and are lost on redeploy, for trying things out only) or `s3`. A real deployment sets `s3` and the `S3_*` values. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`, `S3_PREFIX` | for scheduling | S3-compatible storage (Hetzner Object Storage was the target), for example endpoint `https://fsn1.your-objectstorage.com`, region `fsn1` (the location), bucket `example-bucket`, public base URL `https://example-bucket.fsn1.your-objectstorage.com`. `S3_PREFIX` defaults to `public/`; allow public read on that prefix only, in the bucket policy (the app never changes it). Nothing has been sent to a real bucket yet. |

**Private files rely on unguessable URLs.** The bucket is publicly readable, so `vault/` and `renders/` objects are not access-controlled. What protects them is the key: every new private object gets a random 43-character segment (32 random bytes, base64url) in its path, for example `vault/<random>/<id>/<sha>-<name>`, kept in the database and never shown to the browser; the app hands out short-lived signed URLs only. Bucket listing is denied, so an object can be reached only by someone who was given its exact URL. Anyone who obtains a URL (a log, a screenshot, a forwarded link) can read that file until it is deleted, so treat the URLs as secrets and do not put anything in the vault that must stay confidential. Keys written before this change have no random segment and still work. Moving private files to a bucket that is not publicly readable would remove this limit; that is not set up.

Not normally variables: Buffer keys and AI provider keys are entered in the app's admin page and stored encrypted (or seeded once, section 4a).
`DATABASE_URL`, `PORT` and `CHROME_PATH` are set by the compose file.

### Your own brand

You do not need to build anything for your brand. After the first sign-in, an admin sets it in Settings, Brand and look
(or imports an existing brand pack there), and the app keeps it in the database. The app writes it out under `state/brand/`
inside the container when it starts; nothing there needs a volume, because the database holds the brand.

`BRAND_DIR` is still read, but only for what is shown before a brand is saved and for the first vault (`vault.json`). To
start from your own pack instead of the demo, commit it under `brands/` and set `BRAND_DIR`. A private pack belongs in a
private repository or fork: anything in `brands/` is in the image.

## 3. Domain and HTTPS

Point DNS for your address (for example `social.example.com`) at the server. In the compose service's **Domains** tab add:
host `social.example.com`, service `app`, container port `3000`, HTTPS on, certificate Let's Encrypt. No port is
published on the host; only the platform's proxy reaches the app. The `app` service is also attached to the external
`dokploy-network` so the proxy can reach it; if your Dokploy version wires compose domains differently, keep the
service name and port and adjust the network accordingly. Then **Deploy**.

## 4. First login

With `BOOTSTRAP_ADMIN_EMAIL` set and no users yet, the first start creates an invite for that address and logs the
link once. Open the compose service's **Logs** (service `app`), find the invite link, open it and set a password.
Afterwards invite the others from the admin page. You can then remove `BOOTSTRAP_ADMIN_EMAIL`.

## 4a. Seeding a new deployment

A new deployment can start with the vault already filled, and also with the Buffer accounts, channel routing and the AI
provider in place, without any key passing through chat or the repository. Both are one-time and idempotent (each part
only fills what is empty, so a second start changes nothing).

The **vault** is the brand pack's `vault.json` (with its research topics, if it has any), imported automatically on the
first start whenever the vault has never held an item. It needs no variable; `SEED_VAULT=0` turns it off. It never returns
once it has run, even if items are deleted later. The demo pack's `vault.json` holds invented facts only; write your own
for a real brand. The **secrets** are opt-in with `SEED_SECRETS_B64`:

1. On your own machine, from the repository root, build the secrets. It reads `.env`, `accounts.json` (both
   git-ignored; their format is in [apps/web/README.md](../apps/web/README.md), "Seeding a new deployment") and, for the AI
   key, another env file you point it at, and prints only which parts it included, never a value:

   ```sh
   node apps/web/scripts/make-seed-secrets.mjs --anthropic-env <path to the env file with AI_ANTHROPIC_API_KEY>
   ```

   It writes `SEED_SECRETS_B64=...` to `deploy/staging.env.local` (git-ignored, mode 600),
   replacing earlier `SEED_` lines. Buffer accounts come from `accounts.json` with their keys from the variables it names;
   routing is the networks in `accounts.json` the app supports; the AI provider is Anthropic `claude-sonnet-5-5` for
   draft, research and rewrite; a search provider is included only when `BRAVE_SEARCH_API_KEY`, `TAVILY_API_KEY` or
   `EXA_API_KEY` is in `.env`.
2. Paste the line into the compose service's **Environment** and deploy. The first start imports the secrets (keys are
   encrypted with `APP_ENCRYPTION_KEY` like any saved key), then logs `seed.done` with counts and `seed.remove_env`. A part
   that is invalid is skipped with a `seed.invalid` line that names the field, never the value.
3. **Remove `SEED_SECRETS_B64` from the environment** and redeploy, so the encoded keys do not stay in the platform's
   settings. Check the Buffer accounts and routing on the admin pages (use the check button on each account).

Vault items from the seed keep the `status` the file gives them (`confirmed` or `unconfirmed`). A confirmed one has no
confirming user: whoever wrote the pack's `vault.json` vouches for it, and the audit log records each item as
`seed.vault_import` by `system`. Edit them in the app afterwards; editing a confirmed item's facts makes it unconfirmed
again, as usual.

## 5. Backups

All state is in the Postgres volume `social_pgdata` (the app keeps nothing else; media live in the bucket). Take a dump
from the host:

```sh
docker exec "$(docker ps -qf name=postgres -f label=com.docker.compose.project=<project-name>)" \
  pg_dump -U social -Fc social > social-$(date +%F).dump
```

Schedule that (in Dokploy: Schedules on the server) and copy the files off the server, or use the platform's volume
backups for `social_pgdata` to an S3 destination. Restore with `pg_restore -U social -d social --clean`. Back up
`APP_ENCRYPTION_KEY` separately. Test a restore before relying on a backup.

## 6. Updating

Push to `main` and press **Redeploy** (or turn on auto-deploy for the branch). The new image starts, runs the
migrations and then the server; if a migration fails the container stops and the old data is untouched. Migrations
should be additive so a rollback to the previous image still works.

## Chromium and the sandbox

The design engine launches Chromium without any sandbox flag. Inside a container as a non-root user Chromium's own
sandbox cannot start (it needs user namespaces, which Docker's default seccomp profile blocks), so the image sets
`CHROME_PATH` to a wrapper, `/usr/local/bin/chromium-container`, that adds `--no-sandbox` and
`--disable-dev-shm-usage`. The engine itself is unchanged.

Trade-off: keeping the sandbox would need `--cap-add SYS_ADMIN` or a custom seccomp profile, which gives the whole
container more power than this job deserves. Chromium here only renders pages the engine builds itself: a
Content-Security-Policy of `default-src 'none'`, pictures as checked `data:` files, every non-`data:` request blocked
and DNS switched off, all text escaped. It never browses the web. The container runs as the non-root `node` user, the
database is on a separate container and nothing but the proxy can reach the app. Risk accepted: a Chromium exploit
through a rendered page would not be contained by the browser sandbox, only by the container.

`shm_size` is 512 MB and the app is limited to 1.5 GB (`mem_limit`); raise it if renders are killed.

## Checking the set-up

`deploy/check.sh` (needs Docker) lints the compose file with throwaway values, builds the real image, starts the stack
under the project name `vesk-local` (containers `vesk-local-app-1` and `vesk-local-postgres-1`,
no host ports) and checks that the app runs as non-root, Chromium starts, the engine renders a `text` page, `/healthz`
answers 200, the login page loads and the bootstrap admin invite (for `admin@example.com`) is logged once. It passes in
nothing from any `.env` file, and it removes the containers, the volume and the network it made when it ends. With
`BRAND_DIR` unset in your shell it uses the default brand pack.
