# Where the screens come from

One row for every screen in this folder. The screens themselves are not committed (git ignores everything here except this
file and `README.md`), because a screenshot can show real names and amounts; this file is, so their origin stays on record.

Use test or demo data only: an invented organisation, invented people, fake phone numbers and demo amounts. Blur anything
real before a screen goes here.

What the tool expects:

- **Phones**: a **pre-framed phone capture**, a transparent PNG or WebP with a realistic phone already drawn around the
  screen. The tool shows it as it is and never draws a phone; a plain screenshot is refused with "use a pre-framed phone
  capture". A capture about 660 px wide fits the phone layouts without enlargement.
- **Desktop**: a capture of the window content without browser chrome (the tool draws the window around it), about
  1640 px across. With `"framed": true` a capture that already has its own chrome is shown as it is.

What to record:

- **File**: the name in this folder (sub-folders are fine).
- **Source**: where it came from (the product, the repository and commit, or the capture tool) and how it was made.
- **Kind and size**: framed phone or desktop, and its pixel size.
- **Data shown**: that it is demo data, and which demo organisation.
- **Date**: when it was captured or copied.
- **Used**: which posts use it, or "spare".

| File | Source | Kind | Size | Data shown | Date | Used |
| --- | --- | --- | --- | --- | --- | --- |
| `example-phone-660.webp` | Example product, capture tool, commit `<hash>` | framed phone, home screen | 660 x 1354 | demo organisation, invented members | 2026-01-01 | spare |

Replace the example row with your own. The demo brand's synthetic screen is not here: it is
`packages/engine/design/assets/demo/screen-desk.png`, drawn by `brands/demo/make-assets.mjs`.
