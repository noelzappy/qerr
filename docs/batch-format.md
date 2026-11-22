# Batch format

A batch is a month (or any period) of posts: the words, the pictures and the dates. In the web app a batch is made in
Create: drafted by the AI from the vault, built post by post, or imported from a JSON file in this format (Create, New
batch, "Import batch JSON"). The format is the engine's: everything here is taken from `packages/engine/lib/batch.mjs` (validation and
resolution) and `apps/web/src/server/services/batches.ts` (the import). If a batch is wrong, every problem is listed at
once and nothing is saved; fix them all and import again.

The same checks run again on each post in review and before every send, so a post edited in the app is held to the same
rules as a file.

## Top level

```json
{
  "name": "2027-01-example",
  "title": "January",
  "timezone": "Europe/London",
  "defaultTime": "09:00",
  "posts": []
}
```

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `name` | string | no | The batch's short name. Any character other than letters, digits, `.`, `_`, `-` becomes `-`. Default: `imported`. The app adds a number when the name is taken. |
| `title` | string | no | The batch's title in the app (up to 200 characters). Default: the name. |
| `timezone` | string | yes | A valid IANA time zone, for example `Europe/London`. Daylight saving changes are handled. It is the batch's own; the brand's time zone is only a default (the AI drafts with it, the app shows it). |
| `defaultTime` | string | yes | `HH:MM`, 24 hour, `00:00` to `23:59`. Used by posts without their own `time`. |
| `defaultNetworks` | list | no | Where a post goes when it does not say otherwise: any of `instagram`, `linkedin`, `facebook`, `x`. Default: `["instagram", "linkedin", "facebook"]`, so batches written before X existed are unchanged. Add `"x"` to send every post to X as well. |
| `periodStart`, `periodEnd` | string | no | `YYYY-MM-DD`: the period the batch covers. Default: the first and last post dates. |
| `mediaRoot` | string | no | Ignored by the app (its files live in storage, not in a folder). Older batch files carry it; it may stay. |
| `posts` | list | yes | At least one post. |

## A post

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `id` | string | yes | Letters, digits, `.`, `_`, `-` only, up to 60 characters, not only dots. Unique within the batch. It names the post's image files and its deliveries. |
| `date` | string | yes | `YYYY-MM-DD`, and a real calendar date (`2026-02-30` is rejected). |
| `time` | string | no | `HH:MM`. Defaults to `defaultTime`. |
| `title` | string | no | A label for the team. Not sent to Buffer. Defaults to the id. |
| `caption` | string | yes | Not empty or only spaces. Use `\n` for line breaks. Sent as the post text. |
| `design` | object | no | The recipe for the post's image(s). The app renders it as soon as the batch is imported, and again whenever it changes. See "The design block" below. |
| `media` | list | no | File names. The app does not import files: a post that names media and has no `design` gets a warning to upload its images in the app before it is approved. See "Media". |
| `skip` | list | no | Networks to leave out: any of `instagram`, `linkedin`, `facebook`, `x`. Default: none. Skipping every network the post would go to is an error. |
| `networks` | object | no | Per-network overrides. Keys must be `instagram`, `linkedin`, `facebook` or `x`. Naming `x` here (even as `"x": {}`) sends this post to X even when `defaultNetworks` does not list it. |
| `series` | object | no | `{ "slug": "tip-of-the-week", "number": 12 }`: the brand's named series this post belongs to (Settings, Looks, Series) and its number in it. `slug` is lowercase letters, digits and `-`; `number` 1 to 9999. Not sent to Buffer and not part of the duplicate-protection hash. On import, a slug the brand has no series for is dropped with a warning. The mark the reader sees ("Tip #12") is in the design's own `label` or `tag`; this field only links the post to its series. Not the same as `design.series` (a classic layout's series key, below). |
| `sources` | list | no | Ids of vault items the post's claims come from (the AI fills it in). An id that is not in the vault is dropped with a warning. |
| `warnings` | list | no | Notes for review (the AI fills them in). |

`date` and `time` are in the batch `timezone`. They are converted to UTC for Buffer's `dueAt`.

By default a post goes to `defaultNetworks` (Instagram, LinkedIn and Facebook unless the batch says otherwise), as one
Buffer post each. A post with no media is allowed for LinkedIn, Facebook and X; Instagram needs media, and an Instagram
post without any cannot be approved.

Which Buffer account and channel a network uses is not in the batch. An admin routes each network to one account and
one channel in Settings, Channels. The batch only names networks.

Fields that are not listed here (a typo such as `captions`) are ignored without any message. Read the post in review.

### Media

A post's files are the images its `design` renders, then any files a person uploads to the post in the app (images or
videos, up to the app's size limit). For each network the post sends the images of the size that network
uses (`networkSizes`, below), then the uploaded files.

The rules for the file names a post carries (the app writes them itself; they also apply to `media` in a file):

- A name may use sub-folders (`slides/1.jpg`). It must not be absolute or contain `..`.
- Allowed extensions, in any letter case: images `.jpg .jpeg .png .gif .webp`, videos `.mp4 .mov .m4v`. Anything else
  is an error. The extension decides whether the file is sent as an image or a video.
- An entry may be an object, `{ "file": "02-clip.mp4", "thumbnailOffsetMs": 1500 }`. `thumbnailOffsetMs` is only used
  for videos. It is sent as `thumbnailOffset` in the video's metadata, default `0`. Whether Buffer reads it as
  milliseconds is unverified (see [buffer-api-notes.md](buffer-api-notes.md)).
- The URL sent to Buffer is the file's public URL: just before a send, the app copies each file under the bucket's
  public prefix (`S3_PREFIX`) under a key made from its content hash, and checks the URL answers. A file with no public
  copy is not sent. The hash does not depend on the URL.
- The order is the order in a carousel.

### Per-network overrides

Under `networks.<name>` you may set:

| Field | Applies to | Effect |
| --- | --- | --- |
| `caption` | all | Replaces the post caption on this network. This is how a long caption gets a 280 character version for `x`. |
| `type` | instagram, facebook | Forces the post type. Not checked against Buffer (the values are unverified). On LinkedIn it is hashed, but never sent. |
| `shouldShareToFeed` | instagram | Boolean, default `true`. Sent with every Instagram post, mainly meaningful for reels. |
| `firstComment` | instagram, facebook, linkedin | Text for a first comment. Sent only when set. Not sent to X: a warning says so. |

An override object for a network you also list in `skip` is ignored. A `media` list under a network is not imported
(see "Media").

### How the post type is inferred

If `type` is not set:

| Network | Rule |
| --- | --- |
| instagram | The first item is a video: `reel`. Otherwise `post`, also for several images (Buffer takes an Instagram carousel as type `post` with several images). |
| facebook | Always `post`, even for video. Set `type` yourself if Buffer offers another value. |
| linkedin | No type. Nothing is sent. |
| x | No type. No metadata is sent. |

The metadata sent per network:

- Instagram: `{ "type": ..., "shouldShareToFeed": ..., "firstComment": ... }` (first comment only if set)
- Facebook: `{ "type": ..., "firstComment": ... }`
- LinkedIn: `{ "firstComment": ... }` only if a first comment is set; otherwise no metadata at all.

## The design block

A post can carry the recipe for its own image, so one batch describes the month: the words, the pictures and the dates.
The app's `render-post` job renders it with the engine and keeps the images in private storage; a render replaces only
the images an earlier render made. The full guide, with every template and option, is [design.md](design.md).

```json
{
  "id": "02-numbers",
  "date": "2027-01-06",
  "caption": "1,200+ savings groups keep their records on Acme Savings. ...",
  "design": {
    "template": "stats",
    "series": "the-numbers",
    "big": "85,000+",
    "line": "deposits recorded on Acme Savings last year",
    "stats": ["9,400+|members saving weekly", "1,200+|savings groups"]
  }
}
```

| Field | Applies to | Meaning |
| --- | --- | --- |
| `template` | all | Required: a poster template (`object`, `number`, `product`, `myth-fact`, `closing`), an editorial one (`cover`, `text`, `ledger`, `passbook`, `stats`, `screen`, `photo-story`), `photo`, `carousel` or `layout` with `layout` naming one of the brand's own layouts (`pagecover` is not allowed in a batch). A carousel's page is a poster or editorial template, or `layout` (see design.md, "Your own layouts"); or, for a brand with a look, every page is a `post` page (`{ "template": "post", "kind": ... }`, see design.md, "Carousels of post pages"). |
| `series`, `label`, `ground`, `accent`, `headRight`, `headline`, `sub`, `myth`, `factLead`, `fact`, `big`, `line`, `stats`, `caption`, `artefact`, `columns`, `rows`, `days`, `register`, `beside`, `layout`, `device`, `framed`, `title`, `tilt`, `region`, `silk`, `dots`, `glow`, `fade`, `pills`, `checks`, `map`, `pages` | per template | The texts and content. See design.md. A carousel takes `pages`. |
| `image` | `object`, `number`, `product`, `cover`, `stats`, `screen`, `photo-story`, `photo` | The picture: a file under `design/assets/` (for example `design/assets/demo/object-jar.jpg`), or, with `vaultItemId`, a vault photo (below). Any other path is refused. |
| `vaultItemId` | wherever `image` is | The id of a vault photo or screen. The render copies that file from the private bucket and uses it instead of `image`, which must still be an image file name. The photo's rights are checked before the post can be approved. A carousel page may carry its own. |
| `focal`, `zoom` | `object`, `number`, `cover`, `stats`, `photo-story` | The photo's focal point and zoom. |
| `focal`, `textAt`, `scrim`, `scrimPeak`, `lines` | `photo` | Crop point, text position, scrim mode and strength, thin lines. `focal`, `textAt` and `lines` may be given per size. |
| `sizes` | all | `["feed"]` for every template except `photo` (a list from `feed`, `wide`, `story`, `square`). Default `["feed"]`. |
| `name` | all | The file name stem. Default: the post id. |
| `networkSizes` | all | For example `{ "linkedin": "wide" }`: that network gets that size's images. Each size named must be in `sizes`. Other networks get the first size. |

File names: `<stem>-<size>.jpg` for single images (`01-what-is-acme-feed.jpg`), `<stem>-<n>.jpg` for a one-size
carousel, `<stem>-<size>-<n>.jpg` for a carousel in several sizes. The engine also writes `<stem>.pdf`, a PDF of a
carousel's pages for LinkedIn documents; the web app does not keep it yet.

The block itself is not part of the duplicate-protection hash (the media file names are). Changing the words in a design
block and rendering again produces a new image under the same name; after a post is in Buffer, see "What changes the
duplicate-protection hash" below.

## Caption limits and warnings

Warnings appear on the post in review. Most never block a send, so read them; a caption over the limit, an Instagram
post without media, and more images than a network takes in one post (Instagram 10 items, X 4 images: `MEDIA_LIMITS` in
`packages/engine/lib/networks.mjs`) block approval. A carousel over a limit says so: remove pages or leave that network out.
LinkedIn and Facebook limits through Buffer are not known, so none is enforced for them. Lengths count characters (code points), not bytes.

| Network | Characters | Other |
| --- | --- | --- |
| instagram | 2200 | 30 hashtags |
| linkedin | 3000 | |
| facebook | 63206 | |
| x | 280 | Buffer's free X tier. A paid X tier allows more: raise the account's X caption limit in Settings, Buffer accounts. Up to 4 images. |

The limit used for a post is the one of the account its network is routed to. X counts a link as 23 characters and
some characters (for example many CJK ones) as two; Vesk counts plain characters, so near the limit check the count in
Buffer.

All warnings:

- caption longer than the network limit (blocks approval)
- Instagram post with no media (blocks approval)
- more than 30 hashtags on Instagram (a hashtag is `#` at the start or after whitespace, then letters, digits or `_`)
- Instagram post with more than 10 items (blocks approval)
- Instagram type `carousel` (Buffer rejects it; use `post` with several images)
- Instagram reel with no video
- X post with more than 4 images (blocks approval), or with a `firstComment` (it is not sent)
- LinkedIn post that mixes video and images
- several items including a video, on a network other than Instagram
- a file that changed after its public copy was made (it must be copied again before it is sent)

Review adds the app's own checks: sources that are unconfirmed, stale or deleted, photo rights and consent, and images
that are not rendered yet.

## What changes the duplicate-protection hash

The hash is over: caption (after any override), each media item's kind, file name and thumbnail offset, `dueAt`, the
type and the metadata. Changing any of these on a post that is already in Buffer makes the plan refuse it until the old
Buffer post is deleted (from the app or in Buffer). The post `title`, the channel id, the Buffer account, the media URL,
the caption limit and the order of posts do not matter. Moving a network to another Buffer account does not change the
hash either, but the plan refuses on its own when the record's account differs from the routed one.

## Example 1: a picture post

One post, all three networks, a custom Instagram first comment and a shorter LinkedIn caption.

```json
{
  "name": "2027-02-example",
  "timezone": "Europe/London",
  "defaultTime": "09:00",
  "posts": [
    {
      "id": "01-new-feature",
      "date": "2027-02-02",
      "title": "New feature announcement",
      "caption": "A new report is live.\n\nOpen it from the menu and see this week at a glance.\n\nhttps://example.com/reports\n\n#Example #Reports",
      "design": { "template": "text", "headline": "A new report. *This week at a glance.*" },
      "networks": {
        "instagram": { "type": "post", "firstComment": "Link in bio." },
        "linkedin": { "caption": "A new report is live. Open it from the menu and see this week at a glance. https://example.com/reports" }
      }
    }
  ]
}
```

Result: three deliveries. Instagram type `post` with the first comment, LinkedIn with its own caption and no type,
Facebook type `post`. All at 09:00 London time (09:00 UTC, as February is outside summer time) on 2027-02-02.

## Example 2: a video and carousel month excerpt

A reel on Instagram only, a carousel that skips LinkedIn, and a video that goes everywhere with its own time. The videos
are uploaded to their posts in the app after the import (the import warns that they are missing).

```json
{
  "name": "2027-03-example",
  "timezone": "Europe/London",
  "defaultTime": "09:00",
  "posts": [
    {
      "id": "01-demo-reel",
      "date": "2027-03-01",
      "caption": "A two minute tour, in 30 seconds.\n\n#Example",
      "media": ["01-demo-reel.mp4"],
      "skip": ["linkedin", "facebook"],
      "networks": { "instagram": { "shouldShareToFeed": true } }
    },
    {
      "id": "02-steps-carousel",
      "date": "2027-03-03",
      "time": "12:30",
      "title": "Four steps",
      "caption": "Four steps from sign-up to first report.\n\nSwipe through.\n\n#Example",
      "design": {
        "template": "carousel",
        "pages": [
          { "template": "text", "headline": "Four steps. *From sign-up to first report.*" },
          { "template": "text", "headline": "Sign up." },
          { "template": "text", "headline": "Add your team." },
          { "template": "closing" }
        ]
      },
      "skip": ["linkedin"]
    },
    {
      "id": "03-customer-story",
      "date": "2027-03-05",
      "time": "17:00",
      "caption": "How one team cut its month-end work from two days to two hours.",
      "media": ["03-customer-story.mp4"]
    }
  ]
}
```

Resolved types:

| Post | Network | Type | Why |
| --- | --- | --- | --- |
| 01-demo-reel | instagram | reel | one video |
| 02-steps-carousel | instagram | post | several images |
| 02-steps-carousel | facebook | post | Facebook default |
| 03-customer-story | instagram | reel | one video |
| 03-customer-story | linkedin | none | LinkedIn has no type |
| 03-customer-story | facebook | post | Facebook default |

Two larger examples ship with the repository, both for the demo brand (Acme Savings, `brands/demo`), to import in the
app or to start from:

- `batches/example-launch.json`: seven posts on Instagram, LinkedIn, Facebook and X (each post names `x` under
  `networks`, with a short X caption), in the poster templates (`object`, `number`, `text`, `myth-fact`, `screen`,
  `closing`) and one reel (`03-how-a-group-works.mp4`, a video you supply).
- `batches/example-editorial.json`: seven posts in the editorial templates, among them a seven-page carousel.

Their still-image posts carry `design` blocks, so the app renders their images on import. The pictures they use are the
synthetic files in `packages/engine/design/assets/demo/` (committed), so a fresh install needs no photos or screenshots.
They also carry `mediaRoot` and the `media` names an earlier version wrote; both are ignored on import. Their figures are
invented: they are format examples, not posts to send.
