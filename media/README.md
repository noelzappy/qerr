# Media

Put the images and videos for each batch here. This folder is ignored by git except for this file, so media is never
committed.

## Layout

One folder per batch, named like the batch: `media/example-launch/` for `batches/example-launch.json`. The batch's
`mediaRoot` points at that folder, relative to the repository root.

## Naming rule

- Lowercase letters, digits, `-` and `_` only. No spaces, no capitals, no accents.
- Start with the post number so files sort in order: `01-what-is-acme-feed.jpg`, `04-passbooks-1.jpg`.
- Names must be safe in a URL, because Buffer fetches each file from `MEDIA_BASE_URL/<file name>`.
- Allowed types: `.jpg .jpeg .png .gif .webp` for images, `.mp4 .mov .m4v` for video.

## Making the images

You do not have to make the images yourself: `node packages/engine/design.mjs render batches/<name>.json` renders every post that has a
`design` block into this folder, with names the batch's `media` fields then point to (see `docs/design.md`). Rendered
images are ignored by git like everything else here.

## Hosting

Buffer has no upload endpoint. Upload the folder's contents to a public host and set `MEDIA_BASE_URL` to the folder's
URL, or let `node packages/engine/buffer.mjs upload` put them in an S3-compatible bucket. See `docs/monthly-routine.md`.
