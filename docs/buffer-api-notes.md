# Buffer API notes

What this tool relies on in Buffer's API, where it came from, and how much of it is confirmed.

## Status of this information

Everything below was taken from Buffer's public developer documentation (<https://developers.buffer.com>) on
2026-11-20, when the tool was written. **None of it has been confirmed against a live Buffer account**, because no API
key existed. The tests use a fake Buffer that was built from the same documentation, so they prove the tool is
consistent with its own assumptions, not with Buffer.

`node packages/engine/buffer.mjs check` is the way to turn assumptions into facts. Run it first with a real key (see below).

## What the tool uses

| Item | Value in the code | Source file |
| --- | --- | --- |
| Endpoint | `POST https://api.buffer.com` | `packages/engine/lib/client.mjs` |
| Auth | Header `Authorization: Bearer <key>`; `Content-Type: application/json` | `packages/engine/lib/client.mjs` |
| Body | `{ "query": "...", "variables": { ... } }` | `packages/engine/lib/client.mjs` |
| Key | Created at <https://publish.buffer.com/settings/api>. One key belongs to one account. **Keys expire** (30 days by default, according to `docs/spec/web-app.md`; not confirmed here), so a `401` or `403` after a quiet month usually means "create a new key" | |
| Errors | HTTP 429 for rate limits; 401 or 403 for a bad key; a GraphQL `errors` array on a 200 answer | `packages/engine/lib/client.mjs` |

### Queries

```graphql
query { account { organizations { id name } } }

query { channels(input: { organizationId: "<id>" }) { id name displayName service isQueuePaused } }

query { posts(input: { organizationId: "<id>", sort: [{ field: dueAt, direction: asc }], filter: { status: [scheduled] } }) {
  edges { node { id text dueAt } } } }
```

The posts query is run twice, with `status: [scheduled]` and `status: [draft]`. It reads the first page only.

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

| Enum | Values the tool uses |
| --- | --- |
| `ShareMode` | `customScheduled` |
| `SchedulingType` | `automatic` |
| `PostType` (Instagram) | `post`, `reel`, `carousel` (and `story`, which the tool never sends) |
| `PostTypeFacebook` | `post` by default, or whatever `type` the batch sets |
| post status filter | `scheduled`, `draft` |

### Media

Buffer takes media by public URL only. There is no upload endpoint in the API, so the tool sends the file's URL and
Buffer fetches it. The URL is the one `node packages/engine/buffer.mjs upload` recorded for the file (an object in the S3-compatible
bucket, under `<S3_PREFIX><batch>/<hash>-<file>`) or, when nothing was uploaded, `MEDIA_BASE_URL/<file>`. Before sending, the tool checks each URL itself with a HEAD request. If your host answers HEAD
differently from GET, that check can fail while Buffer could still fetch the file; the tool refuses the post in that
case.

### Rate limits (free plan)

- 150 requests per 15 minutes
- 600 requests per day

The tool keeps itself under 140 requests in any 15 minutes and honours `Retry-After` on a 429 (60 seconds if the header
is missing, three tries). It does not count the daily limit. A month of three channels is about 21 to 40 requests.

**Buffer's limits are per account, not per tool.** With several accounts (`accounts.json`) the tool therefore keeps a
separate client per account: each has its own 140-in-15-minutes window and its own `Retry-After` wait, so one account
being slow does not eat another's budget. Requests are still sent one at a time, so a wait on one account pauses the
run. Whether the limits apply per key, per account or per organisation is not confirmed; the tool assumes per account
(that is, per key).

### Several accounts, and X

- Each account has its own key (from the environment variable named in `accounts.json`) and its own channels. The
  tool maps our network names (`instagram`, `linkedin`, `facebook`, `x`) to an account and a channel id; it never
  sends a channel id through an account that does not hold it (`check` reports the mismatch).
- X is sent like LinkedIn: `text`, `channelId`, the schedule fields and optional `assets`; no `type`, no `metadata`.
  Buffer's free X tier allows 280 characters; the limit is configurable per account (`captionLimits.x`).
- `suggestChannels` matches Buffer's `service` value for X against `twitter` and `x`; which one Buffer uses is not
  confirmed.

## What is not confirmed

Treat each of these as unverified until `check` and the first-run draft prove it.

1. The endpoint and bearer authentication.
2. `account { organizations }` and the `channels` query, including the field names and that `service` holds the network
   name (`suggestChannels` matches it against `instagram`, `linkedin`, `facebook`).
3. The `createPost` mutation, the `PostActionSuccess` and `MutationError` result types, and that `post { id text dueAt }`
   exists.
4. `saveToDraft`, `mode: customScheduled` and `schedulingType: automatic` together produce a draft with the given time.
5. That drafts keep the due time, and that the same call without `saveToDraft` creates a scheduled post.
6. The `asset` input names (`image`, `video`, `url`, `metadata`) and that `thumbnailOffset` is read in milliseconds.
7. The Instagram and Facebook metadata input types and their fields, and that `shouldShareToFeed` is accepted on every
   Instagram type.
8. That `PostTypeFacebook` contains `post`. Facebook reels or stories may have other values.
9. The `posts` query: the `input` shape, the `sort` field, the `filter.status` values (especially `draft`), and
   pagination. The tool reads only the first page.
10. That Buffer can fetch your media host (no hotlink or bot blocking, large videos allowed, redirects followed).
11. Instagram and video requirements (formats, sizes, lengths) are not checked by the tool. Buffer or the network may
    refuse a file the tool accepts.
12. The real behaviour of rate limiting: the header names, and whether a `Retry-After` is sent.
13. Alt text for images: the tool does not send any. `check` prints any field on the image input whose name contains
    `alt` or `description`, so you can see if one exists.
14. That Buffer's `createPost` accepts X channels with exactly the fields sent for LinkedIn, and that no X-specific
    metadata is needed (for example for threads or replies).
15. The `service` value of an X channel (`twitter` or `x`), and so that `check` suggests the right channel.
16. That the rate limits are per account, and that two keys of one person count as two accounts. Whether running several
    free Buffer accounts for one company is allowed is a question about Buffer's terms, not the API.
17. That an expired key shows as a `401` or `403` and not as another error, and the real lifetime of a key.
18. That Hetzner Object Storage accepts the SigV4 requests this tool signs and serves the uploaded files publicly under
    the bucket policy (the signer matches AWS's published examples; nothing has been sent to Hetzner), and that Buffer
    can fetch from that host.
19. The `deletePost(input: { id })` mutation in `packages/engine/lib/buffer-delete.mjs` and its `DeletePostSuccess` and `VoidMutationError`
    result types. They are assumptions from Buffer's other mutation names; nothing has run against Buffer.

## How `check` verifies these

`node packages/engine/buffer.mjs check [batch.json]` asks Buffer for its schema by GraphQL introspection (`__type`):

1. It confirms the key works and lists organisations and channels (points 1 and 2).
2. It reads the types `CreatePostInput`, `AssetInput`, the image and video asset inputs (names found from
   `AssetInput`), `PostInputMetaData`, the three metadata inputs, `ShareMode`, `SchedulingType`, `PostType`,
   `PostTypeFacebook`, the `posts` input, its filter and the status enum.
3. `compareSchema` reports every field the tool sends that does not exist, every required field the tool does not
   send, and every enum value the tool uses that is not in the enum.
4. It prints the status values, the service values, the mutations whose names contain "post" and any alt-text field.
5. It writes `schema-cache.json`. `plan` then uses it to verify Facebook types.

With several accounts, steps 1 is done per account (and a rejected key is reported by name without stopping the
others), the schema in steps 2 to 5 is read once, and `check` adds the routing suggestion and the list of channels
that are routed to an account that does not hold them.

Introspection can only confirm shape. It cannot confirm behaviour: that a draft keeps its time, that media is fetched,
or that thumbnails are in milliseconds. That is what the first-run draft in
[monthly-routine.md](monthly-routine.md) is for. Introspection may also be disabled by Buffer; if `check` cannot
introspect, the mismatch list is not trustworthy.

## Channels

- Instagram, LinkedIn, Facebook and X are wired into the tool.
- TikTok is supported by Buffer but not wired in. Adding a network means adding it to `packages/engine/lib/networks.mjs`, the metadata
  rules in `packages/engine/lib/batch.mjs`, `channels.example.json`, `accounts.example.json` and `suggestChannels` in `packages/engine/lib/schema.mjs`,
  with tests.
- WhatsApp is not a supported Buffer channel, so it cannot be added through Buffer.
