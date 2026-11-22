# packages/engine/design/

What the design engine draws from (see [docs/design.md](../../../docs/design.md)), apart from the brand itself. The brand
(`brand.json`, the logos, the optional dot map) is the one saved in the web app's Settings, written out as a pack under
`state/brand/`, or until then a **brand pack** under `brands/` chosen with `BRAND_DIR` (default `brands/demo`); see "The
brand and the design references" in the [README](../../../README.md).

| Path | What it is | In git? |
| --- | --- | --- |
| `brand.css` | The brand stylesheet. It uses the variables made from the pack's `brand.json` and the size variables from `packages/engine/lib/design/sizes.mjs`; it holds no literal colours or file names. | yes |
| `templates/` | One module per template (`cover`, `text`, `ledger`, `passbook`, `stats`, `screen`, `photo-story`, `photo`, `pagecover`, and `poster.mjs` for `object`, `number`, `product`, `myth-fact` and `closing`), plus the shared toolkit (`common.mjs`, `editorial.mjs`, `artefacts.mjs`, `map.mjs` for the brand's dot map). Each turns a spec into HTML. | yes |
| `fonts/` | Inter and IBM Plex Mono (woff2 files) and `OFL.txt` (SIL Open Font License 1.1). A pack's `brand.json` names the files it uses. | yes |
| `assets/demo/` | The demo brand's pictures: `object-jar.jpg` (an object on a plain ground), `scene-market.jpg` (a busy scene) and `screen-desk.png` (a desktop screen). Synthetic drawings made by `brands/demo/make-assets.mjs`: no photograph, no real person, place or amount. Committed so a fresh install can render the example batches (the Pennyhive pack's example batch, `brands/pennyhive/batches/`, uses them too). | yes |
| `assets/photos/` | Stock photos named by path in a design (`design/assets/photos/<file>`). Ignored by git except `README.md` and `CREDITS.md` (where each photo's source and licence are recorded), and left out of the container image: on a deployment, photos go in the vault. | no |
| `assets/screens/` | App screens named by path: pre-framed phone captures and desktop captures. Ignored by git except `README.md` and `SOURCES.md` (where each screen's source is recorded), and left out of the container image like the photos. | no |
| `assets/brand/` | Optional extra brand artwork. Ignored by git except `SOURCES.md`. No template needs it. | no |

The logos are not in this folder: `brand.json` names them by repository-relative paths inside its pack, for example
`brands/demo/logos/logo-full.png` and `brands/demo/logos/logo-mark.png`.

Rendered images never go into this folder: the web app's render job draws into a temporary folder under `out/` and keeps
the images in its private storage.
