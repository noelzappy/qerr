# Where the brand artwork comes from

A place for extra brand artwork (illustrations, textures, shapes from the brand's own website or design files). Git
ignores everything in this folder except this file, so the artwork is not committed; this file records where each file came
from. No template needs anything here: the logos, colours and fonts come from the brand pack (`brands/<name>/`, see
`BRAND_DIR`) and the engine's `design/fonts/`.

What to record for every file:

- **File**: the name in this folder.
- **Source**: where it came from (the brand's repository and commit, a design file, a designer) and whether it was changed.
- **Owner and licence**: who owns it and that the brand may use it in social posts.
- **Size**: its pixel size.
- **Date**: when it was copied.
- **Used by**: which templates or posts use it, or "spare".

| File | Source | Owner and licence | Size | Date | Used by |
| --- | --- | --- | --- | --- | --- |
| `example-texture.webp` | The brand's website repository, commit `<hash>`, unchanged | The brand, own artwork | 1200 x 900 | 2026-01-01 | spare |

Replace the example row with your own.
