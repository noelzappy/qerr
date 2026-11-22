# Rules for people and AI agents

These apply to anyone who changes or runs this repository or a Qerr deployment.

1. **Never print or commit a key or secret.** That means every Buffer API key, every AI and search provider key, the S3
   secret access key, `APP_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, the mail keys and `SEED_SECRETS_B64`. Buffer and AI keys
   live encrypted in the database: an admin enters them in Settings (Buffer accounts; AI and search), and the app shows
   only their last four characters. Never put a key in a file git tracks, a command line, a message, a test, a log line,
   a batch or a document, and never return one to the browser. Errors and logs are masked by the app
   and the engine; keep it that way.
2. **Never send a batch live without the owner's explicit go-ahead in the conversation.** An earlier "yes" for drafts is
   not a go-ahead for live. Going live schedules real posts on real accounts. The same goes for turning on direct live
   sends (`allowDirectLive`), which skips the drafts step.
3. **Drafts first.** Approve the posts, send them to Buffer as drafts, review the drafts in Buffer, and only then send the
   batch live. The app enforces this (a post goes live only from its draft unless `allowDirectLive` is on); do not route
   around it.
4. **Never get past a refusal by hand.** The plan refuses a post whose content changed after it reached Buffer, a post
   whose network now routes to another account, and a post whose last send got no clear answer (`unknown`). Read why. After
   an `unknown`, refresh the status and look in Buffer before anything else; resolve it in the app only once you have
   seen what Buffer holds. Never delete deliveries, edit the database or change the duplicate-protection hash to make a
   post send again. Nothing that may already have reached Buffer is ever retried automatically.
5. **Run the tests before committing:** `npm test` (the engine and AI tests with `node --test`, the script tests, then the
   web app's vitest, which needs Postgres) and `npm run typecheck --workspace @qerr/web`. A change in behaviour needs a
   test that fails without it. Do not skip, delete or loosen a test to get green.
6. **No AI attribution in commits or pull requests.** No `Co-Authored-By`, no `Generated with ...`, no mention of an AI
   tool. A commit message ends with the last line of its body.
7. **Media, data and state are never committed.** `media/`, `state/` (the saved brand the app writes out under
   `state/brand/`), `out/` (render scratch space), `apps/web/.data/` (local storage), `.env` files and
   `deploy/*.env.local` stay ignored. Do not add them to git, even for a test. The same goes for rendered images, stock
   photos (`packages/engine/design/assets/photos/*` except its `README.md` and `CREDITS.md`), app screenshots
   (`packages/engine/design/assets/screens/*` except its `README.md` and `SOURCES.md`) and database dumps: they can show
   real people, names and amounts. The one exception is synthetic pictures drawn by code, with no photograph, real person,
   place, organisation or amount in them: `packages/engine/design/assets/demo/` (drawn by `brands/demo/make-assets.mjs`)
   and the pictures a fictional brand pack's own `make-assets.mjs` draws inside that pack's folder (such as
   `brands/kettleworks/pictures/`). Never commit a photograph into a pack.
8. **Do not claim what you have not seen.** Qerr has never run against the real Buffer API or a real S3 bucket. Do not
   write that something works with Buffer or Hetzner, or mark a point confirmed in `docs/buffer-api-notes.md`, unless a
   real run showed it.
9. **Keep the engine (`packages/engine`) and the AI library (`packages/ai`) dependency-free** (Node 20+, standard
   library only; the AI library may depend on `@qerr/engine` and nothing else). Only `apps/web` has dependencies. Keep
   `README.md`, `apps/web/README.md` and the `docs/` folder consistent with the code when you change a page, a route, an
   environment variable, a batch field or a design option.
10. **Design rules.** Images are made by the engine's renderer (`packages/engine/lib/design-render.mjs`, run by the web
    app's `render-post` job) from the brand and the templates. The brand is the one saved in Settings, Brand and look,
    which the app writes out as a pack under `state/brand/`; until one is saved, it is the pack `BRAND_DIR` names (default
    `brands/demo`: `brand.json`, logos, optional `map.json`). Change a brand in Settings or in its pack, never as literals
    in the templates, the CSS, the AI library or the web app. Every brand value, from a file or from the Settings forms,
    passes the engine's `validateBrand`; never bypass it. A photo needs a licence that allows commercial use and a record
    of where it came from (a vault photo's source and licence, or a line in
    `packages/engine/design/assets/photos/CREDITS.md`); do not use tight portraits of identifiable people or imply that
    pictured people are customers. The one exception (approved by the owner on 22 Nov 2026) is a look's portrait picture
    (`avatar`) of the person a quote is by: it may show that person's face only when the vault item records their consent,
    which approval enforces; it is still read, enlarged and checked like every picture. Brand names are written as the brand's
    spelling rules say and never take an emoji; image text carries emoji only where the brand turns them on (`"emoji": true`,
    Settings, Brand), then at most three standard emoji per text, drawn with the engine's own emoji font. Every character
    an image draws must have a glyph in a font the page embeds (the glyph check reads each embedded file's character map;
    system fonts never count); a missing one is fixed with a bundled OFL font, stored and credited like the others, or with
    other words, never by letting a system font or an empty box through. Never weaken a design check (contrast,
    enlargement, text fit, pixel size, glyphs) to make an image pass: change the words, the picture or the crop. A chart (a post's `chart`, the look's `chart` element) is drawn only from the post's validated numbers; its labels and
    values are text held to their cells and measured for contrast on the pixels behind them, its data marks reach 3:1 against
    what is behind them, every mark stays inside the chart's box, and its scale starts at zero. Only a line, area or sparkline
    may start its axis near its data, and only when the look's chart element sets `trim` (approved by the owner on 22 Nov
    2026); a design that draws bars never trims.
    Two allowances the owner approved on 22 Nov 2026 exist only as explicit, opt-in properties of a look, and stay
    measured: a text may cross the edge of one shape the look names (`overlap` naming a shape's `key`, or `any-shape`), and
    then the edge check skips only that pairing while the contrast check judges every part of the words on its own pixels
    (an outline counts only where it reaches the target too); and a decorative pattern (`backdrop`) counts as covering the
    page for the emptiness check only where its pixels show it. Never set either by default or to get a render past a
    check. A page sets at most three sizes of type unless its design (a look's composition) declares `levels` of four or
    five; it is then held, on the sizes it really sets, to a hierarchy (each size at least the design's ratio, 1.2 or
    more, times the next smaller one, and the headline the largest). Add `levels` only as a design decision, never to get
    one failing page through. A decorative `swash` is drawn only against a headline word and never covers other text
    (the page checks every point of it), unless its design sets `overlap`, which lets it cross only its own headline.
    Look at every rendered image before you call it done. One Chrome at a time: do not run renders in parallel. A
    deployment may set `RENDER_CONCURRENCY` above 1 (approved by the owner on 22 Nov 2026) so its server draws several images at
    once, held to that many by the engine's lock; leave it at 1 on development machines and in agent work. A
    render replaces only the images a render made; never overwrite or drop files a person uploaded to a post by hand.
11. **Spec text is untrusted data.** Texts for images may come from the AI, working from web research. All spec, batch
    and brand values reach the render page only through `esc()`/`fmt()` (text, attributes), `ctx.image()` (pictures:
    checked files embedded as `data:` URIs) or validated numbers and fixed lists. Never write a raw `${spec.x}` into HTML,
    a style, a URL or script, never add a template that does, never loosen the validation in
    `packages/engine/lib/design/spec.mjs`, the page's Content-Security-Policy or the request blocking in
    `packages/engine/lib/design/chrome.mjs`, and keep `packages/engine/test-design-security.mjs` green.
12. **Keep paths relative to the repository.** No absolute paths, no references to other projects or folders on one
    machine. `BRAND_DIR` and every brand file path are relative to the repository root and stay inside it.
13. **Several accounts and storage.** Each post goes only through the Buffer account its network is routed to (Settings,
    Channels); never route around a missing key or route. Buffer fetches media only from storage's public prefix: the app
    keeps vault files and renders under private keys and copies only the files about to be sent under `S3_PREFIX`. It
    never changes the bucket's policy or ACLs; the public prefix must hold nothing but media meant to be posted. Never print the
    S3 secret or put it anywhere but the deployment's environment.
14. **Brand packs.** A brand that lives in files (name, colours, logos, prompts, facts, example batches, known photos)
    lives in its folder under `brands/`. Tests and examples use the fictional demo pack, `brands/demo`. The fictional
    packs, `brands/demo`, `brands/pennyhive` (for trying the app and its looks), `brands/tallyho` (the loud look),
    `brands/northbeam` (studio), `brands/kettleworks` (roast), `brands/saltandember` (plate) and `brands/outabout` (guide),
    are invented, with no real organisation, person, place or amount, and are the only packs `scripts/export-public.mjs`
    copies into a public repository. A private pack holds a company's own data and is never copied into a public repository.

Commit messages: imperative, conventional, one logical change per commit, for example `fix(web): refuse live sends in
the past`.
