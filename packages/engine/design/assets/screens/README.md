# App screenshots (not committed)

Put the screens used by `screen` and `product` pages here. Every file in this folder except this README and `SOURCES.md`
is ignored by git: screenshots can show real names and amounts, so they never go into the repository. Use test or demo data,
or blur anything real before you use a screenshot, and record where each file came from in `SOURCES.md`.

The demo brand's screen is not here: `../demo/screen-desk.png` is a synthetic desktop screen (committed, drawn by
`brands/demo/make-assets.mjs`).

Phones: a **pre-framed phone capture**, a transparent PNG or WebP with a realistic phone already drawn around the screen
(about 660 x 1354 fits the phone layouts). The classic layouts show it as it is and never draw a phone: a plain screenshot is
refused there with "use a pre-framed phone capture". A look's `device` design draws the phone itself round a plain portrait
phone screenshot (1.6 to 2.4 times as tall as it is wide), and shows a pre-framed capture as it is. Desktop screenshots: a capture of the window content without browser chrome (the tool
draws the window chrome around it), about 1640 px across; with `"framed": true` a capture that already has its chrome is
shown as it is.
