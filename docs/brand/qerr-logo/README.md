# The Qerr logo

The owner's logo export, kept here unchanged: `svg/` and `png/` are the files as supplied, and `EXPORT-README.md` is the
export's own note. Qerr's own identity only; the brand packs under `brands/` and the posts the engine renders do not use it.

## Colours and type

| | |
|---|---|
| Ink | `#1b1a18` |
| Paper | `#f7f6f2` |
| Accent | `#e0532f` |
| Wordmark | Schibsted Grotesk ExtraBold (800), lowercase `qerr`, letter-spacing -0.055em |

The mark is a ring (`circle cx=46 cy=46 r=31`, stroke 14, ink) and a square (`rect x=66 y=66 w=30 h=30`, accent) in a
104x104 box. In the 343x118 lockup the word sits at x 114 with its baseline at y 96, font size 113; the square's bottom
edge sits on the baseline. On dark backgrounds the ring and the word are paper; the square stays the accent.

## Known defects in the export

1. The lockup SVGs (`svg/qerr-lockup*.svg`) do not embed the font, although `EXPORT-README.md` says they do: their
   `<defs>` is empty, so the word falls back to whatever font the viewer has. Use the PNG lockups, or outline the text.
2. `svg/favicon.svg` has no stroke colour on the ring, so the ring is invisible. The app does not use it.

## What the app uses

In `apps/web/web/`:

- `src/shell/QerrLogo.tsx` draws the mark and the lockup as inline SVG from the geometry above. The ring and the word
  use `--logo-ink` (ink in light mode, paper in dark mode, `src/index.css`); the square is `--logo-accent`.
- `public/fonts/schibsted-grotesk/` holds Schibsted Grotesk ExtraBold, latin subset, as woff2 with its `OFL.txt` (see the
  README there), loaded by `src/index.css` for the wordmark.
- `public/favicon.svg` is drawn for the app from the mark (the ring is ink, or paper when the system is in dark mode).
- `public/favicon-16.png`, `favicon-32.png`, `favicon-48.png`, `apple-touch-icon-180.png`, `app-icon-192.png` and
  `app-icon-512.png` are copied unchanged from `png/`. `public/manifest.webmanifest` names the app and its two app icons.
