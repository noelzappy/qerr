# Fonts

Web fonts used by the design engine, all under the SIL Open Font License 1.1 (an `OFL.txt` sits in each folder, copied from https://github.com/google/fonts, `ofl/<family>/OFL.txt`). Files are woff2, `latin` and `latin-ext` subsets only (the symbol fallback at the end: currency signs and arrows only), fetched from fonts.gstatic.com through the Google Fonts CSS2 API on 2026-11-21 (Anton on 2026-11-22). `library.json` lists every file with its style, weight, stretch, subset, unicode-range and size.

Already present before this addition and untouched: Inter (`inter-v20-*.woff2`, with `OFL.txt` in this folder) and IBM Plex Mono (`ibm-plex-mono-v23-*.woff2`, weights 400 and 500).

The version in each file name is the gstatic path version (`/s/<family>/vN/`) at fetch time. Files are variable fonts when the weight column is a range.

## Fraunces

- Source: https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..600&display=swap
- Fetched: 2026-11-21
- Licence: OFL-1.1 (fraunces/OFL.txt)
- Axes: opsz 9..144, wght 300..600

| File | Style | Weight | Stretch | Subset | Bytes |
|---|---|---|---|---|---|
| fraunces/fraunces-v38-italic-latin-ext.woff2 | italic | 300 600 | - | latin-ext | 71568 |
| fraunces/fraunces-v38-italic-latin.woff2 | italic | 300 600 | - | latin | 81704 |
| fraunces/fraunces-v38-normal-latin-ext.woff2 | normal | 300 600 | - | latin-ext | 59540 |
| fraunces/fraunces-v38-normal-latin.woff2 | normal | 300 600 | - | latin | 67388 |

## Source Serif 4

- Source: https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap
- Fetched: 2026-11-21
- Licence: OFL-1.1 (source-serif-4/OFL.txt)
- Axes: wght 400..600

| File | Style | Weight | Stretch | Subset | Bytes |
|---|---|---|---|---|---|
| source-serif-4/source-serif-4-v15-italic-latin-ext.woff2 | italic | 400 | - | latin-ext | 18464 |
| source-serif-4/source-serif-4-v15-italic-latin.woff2 | italic | 400 | - | latin | 20132 |
| source-serif-4/source-serif-4-v15-normal-latin-ext.woff2 | normal | 400 600 | - | latin-ext | 42040 |
| source-serif-4/source-serif-4-v15-normal-latin.woff2 | normal | 400 600 | - | latin | 50952 |

## Hanken Grotesk

- Source: https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..800&display=swap
- Fetched: 2026-11-21
- Licence: OFL-1.1 (hanken-grotesk/OFL.txt)
- Axes: wght 400..800

| File | Style | Weight | Stretch | Subset | Bytes |
|---|---|---|---|---|---|
| hanken-grotesk/hanken-grotesk-v12-normal-latin-ext.woff2 | normal | 400 800 | - | latin-ext | 19572 |
| hanken-grotesk/hanken-grotesk-v12-normal-latin.woff2 | normal | 400 800 | - | latin | 34664 |

## JetBrains Mono

- Source: https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap
- Fetched: 2026-11-21
- Licence: OFL-1.1 (jetbrains-mono/OFL.txt)
- Axes: wght 400..500

| File | Style | Weight | Stretch | Subset | Bytes |
|---|---|---|---|---|---|
| jetbrains-mono/jetbrains-mono-v24-normal-latin-ext.woff2 | normal | 400 500 | - | latin-ext | 11596 |
| jetbrains-mono/jetbrains-mono-v24-normal-latin.woff2 | normal | 400 500 | - | latin | 31340 |

## Archivo

- Source: https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap
- Fetched: 2026-11-21
- Licence: OFL-1.1 (archivo/OFL.txt)
- Axes: wdth 62..125, wght 100..900

| File | Style | Weight | Stretch | Subset | Bytes |
|---|---|---|---|---|---|
| archivo/archivo-v25-normal-latin-ext.woff2 | normal | 100 900 | 62% 125% | latin-ext | 85856 |
| archivo/archivo-v25-normal-latin.woff2 | normal | 100 900 | 62% 125% | latin | 90096 |


## Anton

A heavy condensed display face with a single weight (400 is its only, and already black, weight), for loud all-caps headlines.

- Source: https://fonts.googleapis.com/css2?family=Anton&display=swap
- Fetched: 2026-11-22
- Licence: OFL-1.1 (anton/OFL.txt, from https://github.com/google/fonts, `ofl/anton/OFL.txt`)
- Axes: none (static, weight 400)
- Metrics (from the font's hhea and OS/2 tables, units per em 2048): ascent 1.176, descent 0.329, cap height 0.859

| File | Style | Weight | Stretch | Subset | Bytes |
|---|---|---|---|---|---|
| anton/anton-v27-normal-latin-ext.woff2 | normal | 400 | - | latin-ext | 31356 |
| anton/anton-v27-normal-latin.woff2 | normal | 400 | - | latin | 18612 |

## Noto Color Emoji

The colour emoji font, embedded only on a post page whose words hold an emoji (a brand with `"emoji": true`; `lib/design/emoji.mjs`).
A COLRv1 build (colour vector glyphs), in the eleven unicode-range slices Google Fonts serves to Chrome; a page embeds only the slices its emoji need.

- Source: https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap (requested as Chrome 130)
- Fetched: 2026-11-22
- Licence: OFL-1.1 (noto-color-emoji/OFL.txt, from https://github.com/google/fonts, `ofl/notocoloremoji/OFL.txt`)
- Files: `noto-color-emoji/noto-color-emoji-v50-00.woff2` to `-10.woff2`, 2,084,740 bytes in all (the flags slice, `-00`, is 708,608); each file's unicode-range is in `emoji.json`

## Noto Sans (currency signs only), the symbol fallback

The currency fallback: a subset of Noto Sans holding only the currency signs (U+20A0 to U+20C0, with $, ¢, £, ¤, ¥ and €). Several faces of
the library lack signs such as the cedi (₵), naira (₦), won (₩), shekel (₪) or lira (₺) although their `latin-ext` unicode-range names them,
so a page drew them in whatever system font the server had, or as an empty box. A page whose words hold one of these signs embeds this face
under the alias `VF Symbols` and names it in every font stack right after the role's own font (and the emoji font), so the role's font
still draws every sign it has. `symbols.json` lists the files; `symbolsLibraryProblems()` (`lib/design/font-library.mjs`) checks them. The
unicode-range declared for it leaves out € (U+20AC), which every library font draws.

- Source: https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&text=... (the text: U+20A0 to U+20C0, $ ¢ £ ¤ ¥ €)
- Fetched: 2026-11-22
- Licence: OFL-1.1 (noto-sans/OFL.txt, from https://github.com/google/fonts, `ofl/notosans/OFL.txt`)
- Axes: wght 100..900

| File | Style | Weight | Stretch | Subset | Bytes |
|---|---|---|---|---|---|
| noto-sans/noto-sans-v42-normal-currency.woff2 | normal | 100 900 | - | currency | 15712 |
| noto-sans/noto-sans-v42-italic-currency.woff2 | italic | 100 900 | - | currency | 18916 |

## Noto Sans Symbols (arrows only)

The arrows (U+2190 to U+2199: ← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙), which Inter, Hanken Grotesk and IBM Plex Mono lack (Plex's range names them, its file has
only ↑ and ↓); classic templates write → in their footers. Listed in `symbols.json` with the currency signs and embedded the same way, under
`VF Symbols`, only on a page whose words hold an arrow.

- Source: https://fonts.googleapis.com/css2?family=Noto+Sans+Symbols:wght@100..900&text=... (the text: U+2190 to U+2199)
- Fetched: 2026-11-22
- Licence: OFL-1.1 (noto-sans-symbols/OFL.txt, from https://github.com/google/fonts, `ofl/notosanssymbols/OFL.txt`)
- Axes: wght 100..900

| File | Style | Weight | Stretch | Subset | Bytes |
|---|---|---|---|---|---|
| noto-sans-symbols/noto-sans-symbols-normal-arrows.woff2 | normal | 100 900 | - | arrows | 2228 |
