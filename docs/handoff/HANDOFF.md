# Handoff: design directions and looks (branch `feat/design-directions`)

Written 2026-11-22 to move this work from a local session to a cloud session. Read `AGENTS.md` first (binding),
then this file, then `docs/handoff/LOOKS.md` (the agreed design for looks as data). `CALM.md` and `COMMON.md` are the
interface rules and glossary; `DIRECTIONS.md` is the art-direction brief for the first three directions.

## Product context

- The project has been renamed **Qerr** (domain qerr.cc) and will be hosted as a **multi-customer SaaS**. Code, packages
  (`@qerr/*`), the UI and the docs say Qerr.
- **People without code access must be able to build their own look entirely from the web panel.**
- The owner sees the product as an AI-automated design and social tool ("an AI automated Canva alternative"): a brand
  sets up its look once, then the system writes posts, picks pictures, lays them out and checks them.
- Quality bar: the owner compared new output with posts made by the earlier version (the owner's own brand: photo blended into
  a page that takes the photo's colour, restrained two-tone headline, logo top-left and web address top-right, rounded
  myth/fact cards, big-number page with supporting figures) and preferred the earlier ones. He also showed four
  Instagram accounts as the standard to reach: Author Digital Labs, Jampolls, Gaderin, LaunchPad 26 (recurring series
  formats, brand shapes and gradients, words in pills, cut-out people, info blocks with buttons, rows of round pictures,
  text over full photos, carousels). Do not copy other companies' marks or artwork into shipped looks.
- The owner dislikes input-heavy screens: prefer visual choices, with exact values behind a "Fine-tune" disclosure.
- Commits: imperative, conventional, one logical change each, **no AI attribution of any kind**.

## What is done (pushed on `feat/design-directions`)

Earlier work (interface overhaul, PR #2, e2e fixes) is on `main`. On this branch:

1. Engine: fonts shipped (`design/fonts/library.json`), the `post` template by kind (statement, figure, list, quote,
   photo, event, offer), design directions with four new checks (emptiness, scale, type levels, grid).
2. Looks as data: schema, validator, catalogue (`lib/design/look*.mjs`), interpreter (`directions/interpret.mjs`),
   ten primitives (`directions/primitives/`), tokens from a look, one stylesheet (`design/directions/kit.css`).
3. Shipped looks as data: `lib/design/looks/retail.look.json` and `swiss.look.json` (nine designs each). Retail as data
   matches the old code version within 3 px.
4. New brand setting `contrast.display` (large headlines, default 4.5, range 3 to 7; the owner chose this).
5. Web: looks stored per brand (`BrandLook`, `BrandLookComposition`), routes under `/api/settings/looks`, render queue,
   look renderer (samples, design previews with element rectangles, the check run, publish), fonts served to the panel.
6. Panel: Settings → Looks gallery, look page with settings as visual choices (Fine-tune for exact values), design
   editor on a canvas with a choices-first properties pane, Inspiration (former design references) inside Looks, one
   Channels page (Buffer accounts and routing merged), "Contrast for large headlines" control.
7. AI drafts from the active look (kinds, variants, each design's own limits), optional `guidance` on draft requests.
8. Fixed: the classic logo setting leaked onto look pages (`kit.mjs` `logoHtml`).

## Work in progress, committed as a checkpoint (not finished, not reviewed)

Three agents were stopped mid-work when the session moved. Their partial changes are in the checkpoint commit:

- **Soft and Bloom looks** (`lib/design/looks/soft.look.json`, `bloom.look.json`, plus engine schema additions for
  rounded shapes). Soft was being reworked around the owner's reference: photo blended into a ground sampled from the
  photo, two-tone headline, logo and web-address header, rounded myth/fact panels, big-number page with supporting
  pairs. Bloom: Fraunces headlines, arch photo windows, cream grounds. Check both validate and draw before going on.
- **Fixes to weak designs** found in the end-to-end run: retail Number (figure/0) half empty; swiss Offer (headline
  touches the price block, price on the block edge, folio shows "75"); swiss List (descender touches first rule); swiss
  inverse statement (lower half empty); a new check for text colliding with a shape edge; AI copy for `figure`
  (bare number, one or two word unit, natural sub line). State unknown: verify each.
- **Brand graphics library** (web): vault items gain a `role` (`photo | cutout | graphic`), migration
  `20261130000000_vault_graphics`, `services/graphics.ts`, `services/image-header.ts`, Pictures page switch
  (Photos / Cut-outs / Graphics), `useBrandGraphics` hook. PNG/WebP with alpha only for cut-outs and graphics; the AI
  offers only photos. State unknown: verify typecheck and the upload path.

## What to do next, in order

1. Bring the checkpoint to a working state: `npm run typecheck --workspace @qerr/web`, then the engine look tests
   (`node --test packages/engine/test-design-look*.mjs`), fix what the stopped agents left half done.
2. Finish Soft (to the standard of the owner's own posts) and Bloom; render sheets with
   `node packages/engine/scripts/direction-sheet.mjs --look <file>` and look at every image.
3. Finish the weak-design fixes and the text-collides-with-shape check. Never loosen an existing check.
4. **"Clean" look**: port the earlier style of the owner's posts as a first-class look, probably the default.
5. Engine gaps toward the reference accounts, each as a bounded, validated look capability usable in every look and
   in the design editor: brand graphics and cut-outs placed on designs (engine half of the graphics library),
   gradients; text over a full photo; words in pills and inline icons in headlines; info blocks (When / Where /
   Book on) and buttons; named recurring series; rows of round pictures; carousels.
6. Rebuild one representative post per reference account as a look and compare side by side.
7. Qerr rename: packages `@qerr/*`, app identity (logo, favicon, colours, Schibsted Grotesk wordmark), docs, deploy,
   identifiers (done; the owner's logo export is in `docs/brand/qerr-logo/`). Renaming the GitHub repository
   and the local folder needs the owner.
8. Full test pass at the end (the owner asked to skip tests until features work): `npm test` with a `TEST_DB_NAME`,
   and `npm run typecheck --workspace @qerr/web`. Known stale tests: specs that pin the AI draft prompt, the retail
   and swiss look data, old design-editor labels. Update them to the new behaviour; do not skip or loosen them.
9. Only then merge `feat/design-directions` into `main`, with the owner's go-ahead.

## Open decisions for the owner

- Use the owner's own finance brand as the test brand instead of the coffee roaster "Emberwell Coffee"? (Most of the owner's new
  stock pictures are finance pictures.)
- The "linked hands" picture is uploaded but blocked for the AI (people, no consent recorded).
- Bright brand field colour is still deepened on retail designs that put small body text on it (Stack, Seam).
- Whether a look in use may be edited directly (today it is locked; you copy, edit, then switch).
- Turn chips in the design editor show internal angle names ("Sticker", "Price"); should read as amounts.

## What a cloud session does not have

- The local dev database (Postgres on 127.0.0.1:55441), the demo user, both trial batches, the 48 vault pictures,
  the configured Anthropic and Brave keys (entered in Settings, encrypted in that database). Set up a fresh dev
  instance per `README.md`; never put keys in files, commands or messages.
- The owner's reference images (Desktop), the swiss prototype images and the rendered sheets (`out/`, ignored).
- Buffer has never been connected and must not be: no batch goes to Buffer without the owner's explicit go-ahead.
