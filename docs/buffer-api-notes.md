# Buffer API notes

What Qerr relies on in Buffer's API, where it came from, and how much of it is confirmed. The code is in
`packages/engine/lib/` (the client, the push loop and `deletePost`) and in the web app's account check
(`checkAccount` in `apps/web/src/server/services/buffer-accounts.ts`).

## Status of this information

Everything below was taken from Buffer's public developer documentation (<https://developers.buffer.com>) on
2026-11-20, when the code was written, because no API key existed. **Only the three points marked confirmed under "What
is not confirmed" have been checked against a live Buffer account** (a read-only check on 22 Nov 2026); no post, draft or
other mutation has been sent. The tests use a fake Buffer that was built from the same documentation, so they prove Qerr is consistent
with its own assumptions, not with Buffer.

The way to turn assumptions into facts is the first run against real Buffer: Check on the account in Settings, then
one draft to one channel, looked at in Buffer (see "The first run against real Buffer" in the [README](../README.md)).

## What Qerr uses

| Item | Value in the code | Source file |
| --- | --- | --- |
| Endpoint | `POST https://api.buffer.com` | `packages/engine/lib/client.mjs` |
| Auth | Header `Authorization: Bearer <key>`; `Content-Type: application/json` | `packages/engine/lib/client.mjs` |
| Body | `{ "query": "...", "variables": { ... } }` | `packages/engine/lib/client.mjs` |
| Key | Created at <https://publish.buffer.com/settings/api>. One key belongs to one account; an admin enters it in Settings, Channels, under Buffer accounts, where it is stored encrypted. **Keys expire** (30 days by default, according to `docs/spec/web-app.md`; not confirmed here), so a `401` or `403` after a quiet month usually means "create a new key" | |
| Errors | HTTP 429 for rate limits; 401 or 403 for a bad key; a GraphQL `errors` array on a 200 answer | `packages/engine/lib/client.mjs` |

### Queries

```graphql
query { account { organizations { id name } } }

query { channels(input: { organizationId: "<id>" }) { id name displayName service isQueuePaused } }

query { posts(input: { organizationId: "<id>", sort: [{ field: dueAt, direction: asc }], filter: { status: [scheduled] } }) {
  edges { node { id text dueAt } } } }
```

The account check in Settings runs the first two. The posts query is run twice by a status refresh, with
`status: [scheduled]` and `status: [draft]`. It reads the first page only.

### The mutation

```graphql
mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id text dueAt } }
    ... on MutationError { message }
  }
}
```

A result with `post.id` is a success. A result with a string `message` is a refusal by Buffer. Anything else is treated
as an uncertain answer and recorded as `unknown`.

### Input fields sent

`CreatePostInput`: `text`, `channelId`, `schedulingType: automatic`, `mode: customScheduled`, `dueAt` (UTC ISO 8601),
`assets`, `metadata`, and `saveToDraft: true` for drafts (omitted for live posts).

- `assets`: a list of `{ image: { url } }` or `{ video: { url, metadata: { thumbnailOffset } } }`.
- `metadata`: `instagram { type, shouldShareToFeed, firstComment }`, `facebook { type, firstComment }`,
  `linkedin { firstComment }`.

### Enums relied on

| Enum | Values Qerr uses |
| --- | --- |
| `ShareMode` | `customScheduled` |
| `SchedulingType` | `automatic` |
| `PostType` (Instagram) | `post` (also for several images) and `reel`, unless a batch sets another `type`; never `story` |
| `PostTypeFacebook` | `post` by default, or whatever `type` the batch sets |
| post status filter | `scheduled`, `draft` |

### Media

Buffer takes media by public URL only. There is no upload endpoint in the API, so Qerr sends the file's URL and
Buffer fetches it. Just before a send, the app copies each file the batch is about to send to the bucket's public prefix
(`<S3_PREFIX><batch>/<hash>-<file>`) and gives Buffer that URL. Before sending, it checks each URL itself with a HEAD
request. If the host answers HEAD differently from GET, that check can fail while Buffer could still fetch the file; the
post is refused in that case.

### Rate limits (free plan)

- 150 requests per 15 minutes
- 600 requests per day

Qerr keeps itself under 140 requests in any 15 minutes and honours `Retry-After` on a 429 (60 seconds if the header
is missing, three tries). It does not count the daily limit. A month of three channels is about 21 to 40 requests.

**Buffer's limits are per account, not per app.** With several accounts Qerr therefore keeps a separate client per
account: each has its own 140-in-15-minutes window and its own `Retry-After` wait, so one account being slow does not
eat another's budget. Requests are still sent one at a time, so a wait on one account pauses the run. Whether the limits
apply per key, per account or per organisation is not confirmed; Qerr assumes per account (that is, per key).

### Several accounts, and X

- Each account has its own key (entered in Settings, Channels, under Buffer accounts) and its own channels. An admin maps our network
  names (`instagram`, `linkedin`, `facebook`, `x`) to an account and a channel id in Settings, Channels, choosing from
  the channels the account's check listed; a post goes only through the account its network is routed to.
- X is sent like LinkedIn: `text`, `channelId`, the schedule fields and optional `assets`; no `type`, no `metadata`.
  Buffer's free X tier allows 280 characters; the limit is configurable per account (its X caption limit).
- The app matches Buffer's `service` value for X against `twitter` and `x`. A real check on 22 Nov 2026 showed `twitter`.

## What is not confirmed

Treat each of these as unverified until the first run against real Buffer proves it.

On 22 Nov 2026 a read-only check ran against real Buffer with two keys: the two queries the account check uses (organisations,
then each organisation's channels), nothing else. It confirmed points 1, 2 and 15, marked below. No post, draft or other
mutation was sent, so everything else stays unconfirmed.

1. Confirmed 22 Nov 2026: the endpoint and bearer authentication.
2. Confirmed 22 Nov 2026: `account { organizations { id name } }` and the `channels` query with `id name displayName service
   isQueuePaused`, and that `service` holds the network name. Values seen: `instagram`, `linkedin`, `facebook`, `twitter`,
   `tiktok`, `youtube`.
3. The `createPost` mutation, the `PostActionSuccess` and `MutationError` result types, and that `post { id text dueAt }`
   exists.
4. `saveToDraft`, `mode: customScheduled` and `schedulingType: automatic` together produce a draft with the given time.
5. That drafts keep the due time, and that the same call without `saveToDraft` creates a scheduled post.
6. The `asset` input names (`image`, `video`, `url`, `metadata`) and that `thumbnailOffset` is read in milliseconds.
7. The Instagram and Facebook metadata input types and their fields, and that `shouldShareToFeed` is accepted on every
   Instagram type.
8. That `PostTypeFacebook` contains `post`. Facebook reels or stories may have other values.
9. The `posts` query: the `input` shape, the `sort` field, the `filter.status` values (especially `draft`), and
   pagination. Qerr reads only the first page.
10. That Buffer can fetch your media host (no hotlink or bot blocking, large videos allowed, redirects followed).
11. Instagram and video requirements (formats, sizes, lengths) are not checked by Qerr. Buffer or the network may
    refuse a file Qerr accepts.
12. The real behaviour of rate limiting: the header names, and whether a `Retry-After` is sent.
13. Alt text for images: Qerr does not send any, and does not know whether Buffer takes one.
14. That Buffer's `createPost` accepts X channels with exactly the fields sent for LinkedIn, and that no X-specific
    metadata is needed (for example for threads or replies).
15. Confirmed 22 Nov 2026: an X channel's `service` is `twitter`, which the account check already maps to X.
16. That the rate limits are per account, and that two keys of one person count as two accounts. Whether running several
    free Buffer accounts for one company is allowed is a question about Buffer's terms, not the API.
17. That an expired key shows as a `401` or `403` and not as another error, and the real lifetime of a key.
18. That Hetzner Object Storage accepts the SigV4 requests Qerr signs and serves the uploaded files publicly under
    the bucket policy (the signer matches AWS's published examples; nothing has been sent to Hetzner), and that Buffer
    can fetch from that host.
19. Several images in one post (a carousel): that Buffer keeps the `assets` in the order sent, takes up to 10 on Instagram and
    up to 4 on X (the limits Qerr enforces, `MEDIA_LIMITS` in `packages/engine/lib/networks.mjs`), and what it takes on LinkedIn
    and Facebook (Qerr sets no limit there). Qerr sends a carousel's pages as one post's `assets`, in page order, as drafts first.
20. The `deletePost(input: { id })` mutation in `packages/engine/lib/buffer-delete.mjs` and its `DeletePostSuccess` and `VoidMutationError`
    result types. They are assumptions from Buffer's other mutation names; nothing has run against Buffer.

## How to verify these

The command-line tool once checked Buffer's schema by GraphQL introspection; that check went with the tool. What is left
is what the app does with a real key:

1. **Check** on an account (Settings, Channels, Buffer accounts) confirms that the key works and lists the organisations and the
   channels (points 1, 2, 15 and 17).
2. **One draft to one channel** (see "The first run against real Buffer" in the [README](../README.md)) shows whether
   `createPost`, `saveToDraft`, the assets and the metadata are accepted (points 3 to 8, 10, 11 and 14; a carousel draft also shows point 19).
3. **Refresh status** after it shows whether the `posts` query and the `draft` status filter work (point 9).
4. **Delete from Buffer** on that draft shows whether `deletePost` works (point 20).

Write what you confirmed into this file, with the date. A refusal from Buffer is shown in the app with Buffer's own
message, which usually names the field it did not accept.

## Channels

- Instagram, LinkedIn, Facebook and X are wired into Qerr.
- TikTok is supported by Buffer but not wired in. Adding a network means adding it to `packages/engine/lib/networks.mjs`, the metadata
  rules in `packages/engine/lib/batch.mjs`, the channel matching in `apps/web/src/server/engine/buffer.ts` and the web app's
  pages, with tests.
- WhatsApp is not a supported Buffer channel, so it cannot be added through Buffer.
