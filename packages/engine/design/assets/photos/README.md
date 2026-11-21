# Stock photos (not committed)

Put the photographs for photo posts here, for example `design/assets/photos/market-street.jpg`. Every file in this folder
except this README and `CREDITS.md` is ignored by git, so photos never reach the repository.

The demo brand's pictures are not here: they are synthetic drawings in `../demo/` (committed, made by
`brands/demo/make-assets.mjs`), so a fresh clone can render the example batches without any photo.

Rules, in short (the full list is in `docs/design.md`):

- The licence must allow commercial use. Record the source, the author, the licence and the date in `CREDITS.md` for every
  file.
- Prefer images at least 1500 px on the long side. The tool warns when it would enlarge an image by more than 1.3x.
- Avoid tight portraits of identifiable people, and never write text that suggests the people pictured are customers.
