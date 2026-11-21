# Batch file format

A batch is one JSON file in `batches/`, usually one per month. Everything here is taken from `packages/engine/lib/batch.mjs`. If a
batch is wrong, every problem is listed at once under `The batch is not valid:`; fix them all and rerun.

The validation runs in `plan`, `media`, `push` and `check <batch>`.

## Top level

```json
{
  "name": "2027-01-example",
  "timezone": "Europe/London",
  "defaultTime": "09:00",
  "mediaRoot": "media/2027-01-example",
  "posts": []
}
```

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `name` | string | no | Names the state file (`state/<name>.json`) and the plan file (`out/<name>-plan.json`). Defaults to the batch file's name without `.json`. Any character other than letters, digits, `.`, `_`, `-` becomes `-`. |
| `timezone` | string | yes | A valid IANA time zone, for example `Europe/London`. Daylight saving changes are handled. It is the batch's own; the brand pack's `timezone` is only a default (the AI drafts with it, the web app shows it). |
| `defaultTime` | string | yes | `HH:MM`, 24 hour, `00:00` to `23:59`. Used by posts without their own `time`. |
| `mediaRoot` | string | yes | Folder with the media, relative to the repository root (the repository root, where `.env` and `state/` are). Keep it relative so the repository works wherever it is cloned. |
| `defaultNetworks` | list | no | Where a post goes when it does not say otherwise: any of `instagram`, `linkedin`, `facebook`, `x`. Default: `["instagram", "linkedin", "facebook"]`, so batches written before X existed are unchanged. Add `"x"` to send every post to X as well. |
| `posts` | list | yes | At least one post. |

Reusing a `name` reuses its state file. When you copy last month's batch, change `name`, or the tool will compare new
posts with old records.

## A post

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `id` | string | yes | Letters, digits, `.`, `_`, `-` only. Unique within the batch. Used by `--only` and as the key in the state file. Do not rename an id after pushing. |
| `date` | string | yes | `YYYY-MM-DD`, and a real calendar date (`2026-02-30` is rejected). |
| `time` | string | no | `HH:MM`. Defaults to `defaultTime`. |
| `title` | string | no | A label for you. Not sent to Buffer. Defaults to the id. |
| `caption` | string | yes | Not empty or only spaces. Use `\n` for line breaks. Sent as the post text. |
| `media` | list | no | Files in order. See "Media". Must not be an empty list if present. |
| `design` | object | no | Makes this post's image(s) with `node packages/engine/design.mjs render`. See "The design block" below. Ignored by `plan`, `media` and `push`; checked with the rest of the batch. |
| `skip` | list | no | Networks to leave out: any of `instagram`, `linkedin`, `facebook`, `x`. Default: none. Skipping every network the post would go to is an error. |
| `networks` | object | no | Per-network overrides. Keys must be `instagram`, `linkedin`, `facebook` or `x`. Naming `x` here (even as `"x": {}`) sends this post to X even when `defaultNetworks` does not list it. |

`date` and `time` are in the batch `timezone`. The tool converts them to UTC for Buffer's `dueAt`.

By default a post goes to `defaultNetworks` (Instagram, LinkedIn and Facebook unless the batch says otherwise), as one
Buffer post each. A post with no `media` is allowed for LinkedIn, Facebook and X; Instagram needs media and the tool
warns if there is none.

Which Buffer account and channel a network uses is not in the batch. It comes from `accounts.json` (routing per
network) or `channels.json` (one account); see the README. The batch only names networks.

Fields the tool does not know (a typo such as `captions`) are ignored without any message. Check the plan table.

### Media

`media` is a list. Each entry is either a file name or an object:

```json
"media": ["01-intro.jpg", { "file": "02-clip.mp4", "thumbnailOffsetMs": 1500 }]
```

- The path is relative to `mediaRoot`. It may use sub-folders (`slides/1.jpg`). It must not be absolute or contain
  `..`.
- Allowed extensions, in any letter case: images `.jpg .jpeg .png .gif .webp`, videos `.mp4 .mov .m4v`. Anything else
  is an error. The extension decides whether the file is sent as an image or a video.
- `thumbnailOffsetMs` is only used for videos. It is sent as `thumbnailOffset` in the video's metadata, default `0`.
  Whether Buffer reads it as milliseconds is unverified (see `buffer-api-notes.md`).
- The URL sent to Buffer is the file's uploaded URL when `node packages/engine/buffer.mjs upload` has put it in the bucket and the file
  has not changed since (recorded in `state/<name>.json`), otherwise `MEDIA_BASE_URL/<path>` with each path segment
  URL-encoded. The hash does not depend on which of the two is used. Use URL-safe names; see `media/README.md`.
- The order is the order in a carousel.

### Per-network overrides

Under `networks.<name>` you may set:

| Field | Applies to | Effect |
| --- | --- | --- |
| `caption` | all | Replaces the post caption on this network. This is how a long caption gets a 280 character version for `x`. |
| `media` | all | Replaces the post's media list on this network. Same rules as above. |
| `type` | instagram, facebook | Forces the post type. Not checked by the batch; `check` compares Instagram types with Buffer's `PostType` enum and Facebook types with `PostTypeFacebook`. On LinkedIn it is shown in the plan table and hashed, but never sent. |
| `shouldShareToFeed` | instagram | Boolean, default `true`. Sent with every Instagram post, mainly meaningful for reels. |
| `firstComment` | instagram, facebook, linkedin | Text for a first comment. Sent only when set. Not sent to X: a warning says so. |

An override object for a network you also list in `skip` is ignored.

### How the post type is inferred

If `type` is not set:

| Network | Rule |
| --- | --- |
| instagram | More than one media item: `carousel`. Otherwise the first item is a video: `reel`. Otherwise `post`. |
| facebook | Always `post`, even for video. Set `type` yourself if Buffer offers another value; `check` lists the real ones. |
| linkedin | No type. Nothing is sent. |
| x | No type. No metadata is sent. |

The metadata sent per network:

- Instagram: `{ "type": ..., "shouldShareToFeed": ..., "firstComment": ... }` (first comment only if set)
- Facebook: `{ "type": ..., "firstComment": ... }`
- LinkedIn: `{ "firstComment": ... }` only if a first comment is set; otherwise no metadata at all.

## The design block

A post can carry the recipe for its own image, so one file describes the month: the words, the pictures and the dates.
`node packages/engine/design.mjs render <batch>` renders every post that has one into `mediaRoot` and fills in `media` where the post
has none. The full guide, with every template and option, is [design.md](design.md).

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
| `template` | all | Required: a poster template (`object`, `number`, `product`, `myth-fact`, `closing`), an editorial one (`cover`, `text`, `ledger`, `passbook`, `stats`, `screen`, `photo-story`), `photo` or `carousel` (`pagecover` is not allowed in a batch). |
| `series`, `label`, `ground`, `accent`, `headRight`, `headline`, `sub`, `myth`, `factLead`, `fact`, `big`, `line`, `stats`, `caption`, `artefact`, `columns`, `rows`, `days`, `register`, `beside`, `layout`, `device`, `framed`, `title`, `tilt`, `region`, `silk`, `dots`, `glow`, `fade`, `pills`, `checks`, `map`, `pages` | per template | The texts and content. See design.md. A carousel takes `pages`. |
| `image` | `object`, `number`, `product`, `cover`, `stats`, `screen`, `photo-story`, `photo` | The picture, relative to the repository (for example `design/assets/demo/object-jar.jpg` or `design/assets/photos/market.jpg`). |
| `focal`, `zoom` | `object`, `number`, `cover`, `stats`, `photo-story` | The photo's focal point and zoom. |
| `focal`, `textAt`, `scrim`, `scrimPeak`, `lines` | `photo` | Crop point, text position, scrim mode and strength, thin lines. `focal`, `textAt` and `lines` may be given per size. |
| `sizes` | all | `["feed"]` for every template except `photo` (a list from `feed`, `wide`, `story`, `square`). Default `["feed"]`. |
| `name` | all | The file name stem. Default: the post id. |
| `networkSizes` | all | For example `{ "linkedin": "wide" }`: fills `networks.linkedin.media` with that size's files when the post has none. Each size named must be in `sizes`. |

File names: `<stem>-<size>.jpg` for single images (`01-what-is-acme-feed.jpg`), `<stem>-<n>.jpg` for a one-size
carousel, `<stem>-<size>-<n>.jpg` for a carousel in several sizes.

`media` rules: absent, it is filled with the first size's files; set, it is never touched. The tool still warns when a
hand-set `media` does not list the rendered image. The block is not part of the duplicate-protection hash (the media
file names are). Changing the words in a design block and rendering again produces a new image under the same name;
after a post has been pushed, see "What changes the duplicate-protection hash" below before editing anything else.

## Caption limits and warnings

Warnings appear under the plan table. They never block a send, so read them. Lengths count characters (code points),
not bytes. The plan table shows `used/limit`.

| Network | Characters | Other |
| --- | --- | --- |
| instagram | 2200 | 30 hashtags |
| linkedin | 3000 | |
| facebook | 63206 | |
| x | 280 | Buffer's free X tier. A paid X tier allows more: set `captionLimits.x` for the account in `accounts.json`. Up to 4 images. |

The limit used for a post is the one of the account its network is routed to, when `accounts.json` sets `captionLimits`
for that network. X counts a link as 23 characters and some characters (for example many CJK ones) as two; this tool
counts plain characters, so near the limit check the count in Buffer.

All warnings:

- caption longer than the network limit
- more than 30 hashtags on Instagram (a hashtag is `#` at the start or after whitespace, then letters, digits or `_`)
- Instagram post with no media
- Instagram carousel with more than 10 items, or with a single item
- Instagram reel with no video
- Instagram type `post` with several items (use `carousel`)
- X post with more than 4 images, or with a `firstComment` (it is not sent)
- LinkedIn post that mixes video and images
- several items including a video, on a network other than Instagram
- an uploaded media file that has changed since it was uploaded (the plan then uses `MEDIA_BASE_URL` for it)
- a local media file that does not exist (`local file missing: <path>`)
- a Facebook type that is not in `schema-cache.json`, or `unverified; run check` when there is no cache

## What changes the duplicate-protection hash

The hash is over: caption (after any override), each media item's kind, path and thumbnail offset, `dueAt`, the type
and the metadata. Changing any of these on a post that is already in Buffer makes `push` refuse it until you use
`--force-new`. The post `title`, the channel id, the Buffer account, the media URL (uploaded or `MEDIA_BASE_URL`), the
caption limit and the order of posts do not matter. Moving a network to another Buffer account does not change the hash
either, but `push` refuses on its own when the record's account differs from the routed one (see the README).

## Example 1: a picture post

One post, all three networks, a custom Instagram first comment and a shorter LinkedIn caption.

```json
{
  "name": "2027-02-example",
  "timezone": "Europe/London",
  "defaultTime": "09:00",
  "mediaRoot": "media/2027-02-example",
  "posts": [
    {
      "id": "01-new-feature",
      "date": "2027-02-02",
      "title": "New feature announcement",
      "caption": "A new report is live.\n\nOpen it from the menu and see this week at a glance.\n\nhttps://example.com/reports\n\n#Example #Reports",
      "media": ["01-new-feature.jpg"],
      "networks": {
        "instagram": { "type": "post", "firstComment": "Link in bio." },
        "linkedin": { "caption": "A new report is live. Open it from the menu and see this week at a glance. https://example.com/reports" }
      }
    }
  ]
}
```

Result: three items. Instagram type `post` with the first comment, LinkedIn with its own caption and no type, Facebook
type `post`. All at 09:00 London time (09:00 UTC, as February is outside summer time) on 2027-02-02.

## Example 2: a video and carousel month excerpt

A reel on Instagram only, a carousel that skips LinkedIn, and a video that goes everywhere with its own time and a
thumbnail 2 seconds in.

```json
{
  "name": "2027-03-example",
  "timezone": "Europe/London",
  "defaultTime": "09:00",
  "mediaRoot": "media/2027-03-example",
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
      "media": ["02-steps-1.jpg", "02-steps-2.jpg", "02-steps-3.jpg", "02-steps-4.jpg"],
      "skip": ["linkedin"]
    },
    {
      "id": "03-customer-story",
      "date": "2027-03-05",
      "time": "17:00",
      "caption": "How one team cut its month-end work from two days to two hours.",
      "media": [{ "file": "03-customer-story.mp4", "thumbnailOffsetMs": 2000 }]
    }
  ]
}
```

Resolved types:

| Post | Network | Type | Why |
| --- | --- | --- | --- |
| 01-demo-reel | instagram | reel | one video |
| 02-steps-carousel | instagram | carousel | four items |
| 02-steps-carousel | facebook | post | Facebook default |
| 03-customer-story | instagram | reel | one video |
| 03-customer-story | linkedin | none | LinkedIn has no type |
| 03-customer-story | facebook | post | Facebook default |

Two larger examples ship with the repository, both for the demo brand (Acme Savings, `brands/demo`):

- `batches/example-launch.json`: seven posts on Instagram, LinkedIn, Facebook and X (each post names `x` under
  `networks`, with a short X caption), in the poster templates (`object`, `number`, `text`, `myth-fact`, `screen`,
  `closing`) and one reel (`03-how-a-group-works.mp4`, a video you supply).
- `batches/example-editorial.json`: seven posts in the editorial templates, among them a seven-page carousel.

Their still-image posts carry `design` blocks next to their hand-set `media`, so the images can be rebuilt with
`node packages/engine/design.mjs render batches/example-launch.json --out-dir media/preview`. The pictures they use are
the synthetic files in `packages/engine/design/assets/demo/` (committed), so a fresh clone needs no photos or
screenshots. Their figures are invented: they are format examples, not posts to send.
