# Web UI: shadcn/ui, Tailwind v4

The web app UI is built from shadcn/ui components (Radix + Tailwind CSS v4 + lucide-react). The old hand-made kit and its
stylesheet are gone: everything is Tailwind utilities, the theme tokens and the components below.

## Where things are

| Path | What |
| --- | --- |
| `src/components/ui/*` | shadcn components (button, input, textarea, label, select, checkbox, switch, dialog, alert-dialog, sheet, drawer, table, badge, card, tabs, dropdown-menu, sonner, alert, skeleton, tooltip, popover). Owned by us: edit freely. |
| `src/components/kit/` | The one shared kit, imported from `@/components/kit`: `TextField`, `FormField`, `Notice`, `FormPanel` (see below), `PageHeader`, `DataList`, field wrappers, `SegmentedField` (2 to 4 choices, or chips for a longer list, as one radio group: use it instead of a dropdown for small choices and filters), `TagInput` (the one tag control: chips, Enter, comma or Add), `FilledTag` (the "Auto" / "From the file name" mark beside a value the app filled in), states (`RowsSkeleton`, `EmptyBlock`, `ErrorBlock`, `LoadingBlock`, `Pager`, `BusyButton`), `ConfirmAction`, badges. Add new shared composites here. `src/components/*.tsx` holds the domain pieces (activity parts, network icon, post row). Shared hooks that are not data loading are in `src/hooks/` (`use-media-query.ts`); the data hooks are in `src/hooks.ts`. |
| `src/index.css` | Tailwind import, fonts, theme tokens (light and dark). |
| `src/lib/utils.ts` | `cn()` for class names. |
| `src/lib/theme.ts` | `initTheme()`, `setTheme('light' \| 'dark' \| 'system')`, `useTheme()`. |
| `src/shell/` | `Shell` (sidebar on desktop, Sheet menu on a phone), `nav.ts` (the one navigation list), `CommandPalette` (Ctrl/Cmd+K), `AuthLayout`, `PasswordFields`, `ErrorBoundary`. |
| `src/hooks/use-unsaved-guard.tsx` | `useUnsavedGuard`, `confirmDiscard`, `withoutGuard` and the dialog they share (see "Unsaved changes"). |
| `components.json` (in `apps/web`) | shadcn config; the `@/` alias points to `web/src` (also in `vite.config.ts` and `tsconfig.web.json`). |

## Adding a shadcn component

The shadcn CLI (`npx shadcn@latest add <name>`) currently fails in this repo: it tries to `npm install` a package called
`cn` (a registry quirk) and `next-themes`. Fetch the file from the registry instead and fix the two imports:

```sh
cd apps/web
curl -s https://ui.shadcn.com/r/styles/new-york-v4/<name>.json | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));for(const f of j.files)console.log(f.content.replace('from \"cn\"','from \"@/lib/utils\"'))" > web/src/components/ui/<name>.tsx
```

Then check the JSON's `dependencies` (add exact versions with `npm install -w @vesk/web --save-exact`; most are in
`radix-ui` already) and `registryDependencies` (fetch those too). Keep exact versions in `package.json`, no `^`.
`sonner.tsx` was changed to use `lib/theme.ts` instead of `next-themes`.

## Theme tokens

Defined in `src/index.css` from `packages/engine/design/brand.json` (the website palette). Use the Tailwind names:
`bg-background text-foreground`, `bg-card`, `bg-muted text-muted-foreground`, `bg-primary text-primary-foreground`
(brand green `#2F6B5A`), `bg-accent` (mint), `border-border`, `border-input`, `ring-ring`, `text-destructive`, plus the
status tokens `success`, `warning` / `warning-foreground`, `info`, and `gold` (logo gold `#FFB300`). `bg-sidebar*` for the sidebar.
Never use literal colours or Tailwind palette colours (`bg-green-500`).

- Fonts: Inter is the default (`font-sans`); IBM Plex Mono is `font-mono` and is for ids, figures and small caps labels
  (`font-mono text-[11px] uppercase tracking-wider text-muted-foreground`). Files are served from `/fonts`: the engine's own copies in `packages/engine/design/fonts`, served and built by a small plugin in `apps/web/vite.config.ts`; no font CDN.
- Radius is `0.5rem` (`rounded-md`, `rounded-lg`). Keep it calm: neutral surfaces, one green primary action per view.
- Dark mode: variables exist (`.dark` class on `<html>`). The default is light until the pages are ported because the old
  CSS has no dark palette. Test with `localStorage.theme = 'dark'` then reload.
- The focus ring is brand green in light mode (gold on white is too faint) and gold in dark mode.

## Conventions

- Import from `@/components/ui/*` and `@/components/*`. Style with Tailwind utility classes and `cn()`. Do not write page CSS files.
- Icons: `lucide-react` only, `aria-hidden` when decorative, an `aria-label` on icon-only buttons.
- Create, edit and detail forms use **FormPanel**; destructive confirms use **AlertDialog**; a Dialog only informs. See "Panels, dialogs and confirms" below.
- Toasts are **sonner**: `import { toast } from 'sonner'`, past tense, no trailing full stop ("Batch approved").
- Loading uses **Skeleton** shaped like the content, not a page spinner. Empty and error states say what happened and what to do.
- Lists: `Table` on desktop, cards on a phone (`components/kit/data-list.tsx` shows the pattern).
- Status uses `Badge` with the `success | warning | info | destructive | quiet` variants (or `secondary`, `outline`).
- Responsive down to **360 px** with no sideways scroll; tap targets at least 44 px on a phone (`max-sm:min-h-11`).
- Copy: sentence case, plain words. Money, dates and enums go through `lib/format.ts` and `lib/labels.ts`.
- Navigation lives only in `shell/nav.ts`; add a route in `App.tsx` and a nav entry together (see "Navigation, routes and the palette").
- Do not add or change anything under `src/server`; the UI only calls the API through `src/api.ts` and `hooks.ts`.

## Panels, dialogs and confirms

| Need | Use |
| --- | --- |
| A small form (a team member, a Buffer account, an AI provider, a new batch) | `FormPanel variant="dialog"` (`@/components/kit`): a centred dialog on a desktop, a bottom drawer on a phone |
| A form with many fields, or something with a live preview: a post, a fact, a picture, a layout, an upload | Its own page (`PageHeader` with `crumbs`), not a panel |
| A side panel of options that belongs to a page (rare) | `FormPanel` (the default `variant="sheet"`) |
| "Are you sure?" before a destructive or irreversible action | `AlertDialog`, through `ConfirmAction` (`@/components/kit`) |
| A message or a read-only result that needs no input beyond closing it | `Dialog` |
| The phone navigation menu | a left `Sheet` (`shell/Shell.tsx`), not a `FormPanel` |

Never put a form in a `Dialog`, and never roll your own `SheetContent`: use `FormPanel` so every side panel looks and behaves the same.

`FormPanel` is a `Sheet` from the right on a desktop (768 px and wider) and a `Drawer` (vaul) from the bottom on a phone, with
the same anatomy in both: header (title and description), a body that scrolls, and a footer that stays pinned.

```tsx
<FormPanel
  open={open} onClose={onClose} busy={saving} size="md"     // sm | md (default) | lg | xl
  title="Add a Buffer account" description="The key is write-only."
  footer={<>
    <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
    <BusyButton type="submit" form="account-form" loading={saving}>Add account</BusyButton>
  </>}
>
  <form id="account-form" onSubmit={...}>...</form>
</FormPanel>
```

- The footer is outside the `<form>`, so the primary button is `type="submit" form="<form id>"`. Put the secondary buttons first
  and the primary action last; on a phone they stack full width with the primary on top. A destructive button on the left:
  `className="md:mr-auto"`.
- Sizes are the maximum width on a desktop: `sm` max-w-md, `md` max-w-lg, `lg` max-w-2xl, `xl` max-w-4xl. Use `lg` for long forms
  and detail panels, `xl` for panels with a list of rows.
- `busy` stops the panel closing (Escape, the X, a click outside). A click outside never closes a form unless you pass
  `dismissOnOutside`, so a slip does not lose typing. If the form lives in a child component, let it report its busy state up
  (see `batches/NewBatchSheet.tsx`) and clear it when it unmounts.
- A panel always has an accessible title. Without a `description`, none is announced.
- Mount it only while it is needed (`{editing && <FormPanel open ...>}`) or pass `open`; its contents are unmounted on close, so
  form state starts fresh each time.
- A page can open its dialog from the route (Create: `/batches/new` and `/batches/ai-draft` render the list with the dialog open,
  and closing navigates back to `/create`). Keep the dialog's state in one component so a save does not re-open it.
- Images inside a panel: `max-w-full` with `object-contain` so they never exceed the panel width.


## Interface conventions

- **Field help is behind an info icon** (hover, focus or tap), through the kit `Hint`, or the `hint` prop of the kit fields with
  `hintMode="tip"` (the default). The text is also in the page, visually hidden, for screen readers. Use `hintMode="inline"` only
  for text that must stay on screen: a warning or a consequence.
- **Pages start with `PageHeader`**, with `crumbs` (the kit `Breadcrumbs`) when the page is below another. A description longer
  than about 90 characters appears only in the info icon beside the title; a short one is one muted line under it.
- **Small forms** are `FormPanel variant="dialog"`; a form with many fields is a page.
- **Secondary and destructive actions** sit in `MoreMenu`, so a row or a card shows its main action and one menu.
- **AI suggestions** (`components/suggest/`) are shown, never applied by themselves: "Suggested by the AI" with Use (or Replace,
  with Undo) and, for pictures, Edit. A used suggestion fills the editable field and is marked "Filled in by the AI"; a title a
  person typed is kept. Why suggestions cannot run is said once (beside the action), not on every card.
- **On a desktop only the content area and the sidebar scroll**; the window itself does not (`shell/Shell.tsx`).

## Navigation, routes and the palette

- The sidebar lists **Home, Create, Facts** (`/vault`), **Pictures** (`/library`), **Publish** and **Activity**; Settings is
  reached from the account menu, and its pages show a "Back to the app" link. There are no tabs on Create: Facts and
  Pictures are their own pages. The addresses `/vault` and `/library` keep their names; only the words people see changed.
- The router is `createBrowserRouter` with one catch-all route (in `main.tsx` and `App.tsx`), so the data-router features
  (blockers, `useBlocker`) work for every page.
- **Ctrl/Cmd+K** opens the command palette (`shell/CommandPalette.tsx`). It searches pages, actions (add a fact, upload
  pictures, new batch...), batches, facts and pictures, and opens the one chosen.
- The first setup is a guided flow at `/setup/<step>` (`pages/setup/`, its own frame outside the shell; rules in `pages/setup/flow.ts`). Home's checklist links the brand, logo, channels, AI and batch steps into it.
- The setup checklist on Home is one card. `GET /api/overview/home` returns each step as `{ key, title, detail, to, done }`,
  and the AI step also carries `missing` (`'provider'`, `'budget'` or `null`), so the card says what is still needed. "Connect your channels" is one step (seven in all) with `missing` `'account'`, `'routes'` or `null`.

## Unsaved changes

`hooks/use-unsaved-guard.tsx` is the one way an editor protects typing. Its header comment has the details:

- `useUnsavedGuard(dirty, { message?, allow? })`, in the component that owns the form state: while `dirty`, leaving by a
  link, the back button or a menu asks "Leave without saving?", and closing the tab shows the browser's own warning. `allow`
  names moves that keep the form's state (Brand and look uses it for switching between its sections).
- `confirmDiscard(dirty, close)` for sheets and panels: call it from every way of closing (the X, Escape, Cancel, a click
  outside). A save that succeeds closes without asking.
- `withoutGuard(fn)` runs a navigation that must not ask, such as the redirect after the first save of a new layout.
- `<UnsavedGuardHost />` is rendered once, inside the router.

The post editor, Brand and look and the layout editor use it, as do the other forms.

## Batches, posts and their words

- The batch page (`/batches/:id`) is a four-step flow: **Write, Review, Send drafts to Buffer, Go live**. Steps 1 and 2 show
  the posts (`/batches/:id`, with `?step=write` for step 1); steps 3 and 4 show the plan, the sending and the Buffer status
  (`/batches/:id/schedule`, and `/batches/:id/schedule?step=live` for going live). `?post=<id>` opens the batch at that post
  (the calendar uses it). One button offers the next sensible action; "Approve all without warnings" is that button when
  it is the next step, and sits beside the filter otherwise.
- A post is **Writing, Approved, Draft in Buffer, Scheduled** or **Sent**. Problems are flags on top of that and never a step
  of their own: Image could not be made, Has warnings, Needs a look, Failed to send, Deleted from Buffer, Removed. A batch is
  **Writing, In review, Scheduled** or **Done**. The words come from `lib/labels.ts` and `batches/flow/status.ts`.
- The batch list's import tab is "Import a batch file", marked Advanced.
- A post is added at `/batches/:id/posts/new` and edited at `/batches/:id/posts/:postId` (`batches/PostPage.tsx`, with
  `batches/editor/`). It is a page with breadcrumbs, not a side sheet: the form (words, date, networks, design) on the left and
  a live preview on the right (stacked on a phone). Network choices and captions are edited here and saved with the post.
  Designs are edited with a layout chooser, a picture picker and structured editors for figures, lists, carousel pages, tables
  and cards; the raw design JSON is under "Advanced". When the brand has a look or a design direction (`GET /api/posts/post-kinds` says so; with a look, `GET /api/looks/brief` supplies the kinds offered, the design names and the budgets) a
  new designed image is a *kind of post* (`editor/PostFields.tsx`, `editor/KindChooser.tsx`): Statement, Number, List, Quote, Picture,
  Event or Offer, each showing only its fields with character counters, and a "Look" choice (Automatic or one of the direction's
  compositions for that kind). Switching kind keeps the fields the new kind shares (`design-model.ts` `switchKind`). A post made with a
  classic layout still opens with today's controls and offers "Convert to a <kind> post" where the mapping is obvious
  (`convertToPost`). Brands without a direction see exactly the layout chooser as before. The preview asks `POST /api/posts/preview-design`, waits a moment after
  the last edit, keeps the last good picture on screen and cancels a request that a newer edit has overtaken (`api.post` takes
  an optional `AbortSignal`; a cancelled request shows no error).
- The post page's More menu has **Rewrite with AI** (disabled with "save first" while there are unsaved edits). It opens a small dialog
  (`batches/RewritePostDialog.tsx`): "What should change?", a one-line statement that approval is taken off, Cancel and Rewrite. After
  `POST /api/posts/:id/rewrite` the dialog follows the run with `useActivityRun`, then the page loads the post again, toasts "Rewritten" and
  the dialog shows the caption before and after. When `rewrite.available` is false the dialog shows the reason instead of enabling Rewrite.
- Failure text from background work is shown by `lib/errors.ts` `readableFailure` / `failureLine` / `tidyBlocker` and
  `components/failure-text.tsx`: no internal paths, no leading image file name or "Render:", the first sentence and the advice sentence
  in full, the rest behind "Show details". The stored text is unchanged. When a post's image could not be made the post page puts the
  reason and **Make the image again** at the top of the preview column; the batch page's failed list links each post ("Open the post").
- A post card on the batch page shows the image, title, date, one status chip (plus a problem chip when there is one), the
  network icons, **Edit**, **Approve** and a **More** menu.
- **New batch** and **Draft with AI** are centred dialogs over the batch list (`/batches/new`, `/batches/ai-draft`).
- **Facts** and **Pictures**: a fact has its own page, `/vault/:id` (`/vault/new` adds one); a picture has `/library/:id`, and
  uploading is the page `/library/upload` (`/library?upload=1` redirects there). The lists keep their filters in the URL.
- **Settings:** Team and the AI provider forms are dialogs. **Channels** (`/settings/channels`, `pages/Channels.tsx`) holds the Buffer accounts (compact rows, a menu with Edit, Check key and Delete, dialogs as before; `/settings/accounts`, `/admin/accounts` and `/admin/routing` redirect here, `#accounts` scrolls to them) above the table of where each network posts. With no account the page is the "Connect Buffer" empty state and the table is disabled; with one account every row's account is preselected.
- Brand and look has eight sections at `/settings/brand/<identity|logos|colours|type|surfaces|post-types|voice|advanced>`
  (`#logos` still opens the Logos section; `/settings/brand/direction` and `#direction` go to Looks). Uploads and Advanced save the moment
  they are done; everything else waits for Save. The old Design direction tab is gone: choosing a look is **Settings, Looks**. Colours has
  **Contrast for large headlines** (Standard 4.5, High 7, or Custom 3 to 7, with a note below 4.5; `brand/contrast-display.tsx`). "Series" is
  called "Post types". "Other currencies to flag" is a list of words; a stored pattern that the list cannot show is edited under Advanced.
- **Looks** (`pages/settings/looks/`): `/settings/looks` (tabs Looks and Inspiration at `/settings/looks/inspiration`; the design references
  moved there from their own menu entry, `/settings/references` redirects), `/settings/looks/:slug` and `/settings/looks/:slug/designs/:id`
  (the design editor, below). The settings menu reads You, Brand (Brand and look, Looks, Classic layouts), Organisation (Team,
  Channels, AI and search), Records; **Classic layouts** shows only while no look is active (`useActiveLook`, from `GET /api/looks/brief`).
  An active look is edited like any other: the page says that saved changes reach posts drawn from then on (images already made stay as they are), and Duplicate still makes a copy to try changes on. Routes used are listed in
  apps/web/README.md, "The Looks pages (web)". The post editor takes kinds, design names and budgets from the active look.
  The look's **Settings tab** is choices, not configuration (`looks/settings/`): two columns on wide screens (the samples, larger and
  sticky, fed the draft look; one collapsible block first on phones) and one calm column of groups: Typeface (curated pairings of the
  font library, plus "Our own font" when the brand uploaded fonts), Headline voice (Weight, Case, Spacing), Feel (Tilt, Density, Weight
  sliders), Colour (One accent, Colour as a field, Tonal, drawn in the brand's colours, and a switch for accent colour in large
  words), Space (Tight, Standard, Airy, scaled from the look's origin), Pictures (As shot, Greyscale, Colour tint, Punchy, and Grain)
  and Logo (Off or in a corner, and a size), then Details, which has no choice. Each choice is a preset (`presets.ts`) that says which
  option the values match now and writes only the values it owns; a look that fits none shows a "Custom" chip and nothing is snapped.
  Every group has a closed "Fine-tune" link that opens that group's exact values (the catalogue-driven controls, compact, the range in
  the tooltip) with "n values changed from the original" and "Reset this group" (to the origin look, else as opened). Every catalogue
  value is in exactly one group's Fine-tune (`groups.ts`; what no group names falls to Details, so a setting the engine adds appears
  there). Font weights are not asked for: `weights.ts` works out what the type settings and designs need and writes it whenever a
  choice or a dial changes; the manual list is in Typeface's Fine-tune.
  The typeface cards load their real family: `settings/load-fonts.ts` registers the family's woff2 files (listed with each family by `GET /api/settings/looks`, served by `GET /api/settings/looks/fonts/:family/:file`) with the browser's FontFace API under the alias `Look <family>`, once per family, and shows the sample in it; where FontFace is missing nothing happens. The sample and design-preview hooks ignore an answer marked `superseded` (the server replaced that request by a newer one from the same person). A server problem on a value opens its group's Fine-tune.
- **The design editor** (`pages/settings/looks/DesignEditor.tsx`, at `/settings/looks/:slug/designs/:id`, Edit on the Designs tab) builds a look's
  design (one composition) entirely from the panel. The composition JSON is the state; `design-model.ts` (pure, specced in
  `src/web-design-editor.spec.ts` over every composition of both shipped looks) reads and writes it by the engine catalogue's descriptors and never clamps:
  a value out of range is refused with a sentence. Three panes (tabs Layers, Canvas, Properties under `lg`): **Layers** (`DesignLayers.tsx`: the
  elements back to front as a tree, an eye with a tooltip for a condition, back and forward buttons or drag, a menu to copy, remove, move into or out of a
  box; below, the library of pieces grouped Text, Pictures, Shapes and devices, Special pieces, each saying why it cannot be added when a limit is
  reached: 40 elements, 4 levels, one rows, a seam, a frame or a top label row); **Canvas** (`DesignCanvas.tsx`) and **Properties**
  (`DesignProperties.tsx`, `design-controls.tsx`: Place, Size and rotation, Content, Type, Colour, Effects, Conditions for a piece; the design's own name,
  "when to use it", page colour, fields with their budgets, accepted words and empty space with none selected).
  The canvas has two layers. The picture is the real image when the server can make one (`POST /api/settings/looks/preview-design`, about 400 ms after
  the last change, an older request aborted; Sketch or Real image toggle; copy Sample, Longest or Shortest; the switch is hidden while the answer is 501)
  and otherwise a schematic drawn from the places (boxes with their plain names, text as its field's name, brand colours as swatches). On top, a target
  for every element, the selection with eight handles and a turning handle, positioned from the page's own rectangles when it has them and from the places
  otherwise. Drag to move, handles to resize (snapped to grid cells, or 4 px for a piece placed in pixels or anchored; a readout says "Columns 5-12, rows
  2-6"), the turning handle snaps to the look's named angles; Advanced allows a free angle (-15 to 15), pixel placement and a fixed size. A piece with no place
  of its own (it flows in its box) is selected, shows "Positioned by its box" and moves by reordering. **Keyboard** on the canvas: arrows move by a cell
  (4 px when placed free), Shift with an arrow resizes, `[` and `]` send back and forward, Escape lets go, Delete removes (with Undo), Ctrl or Cmd+Z undoes,
  with Shift redoes. **Design health** (`DesignHealth.tsx`, `design-health.ts`) mirrors the engine's static rules while editing (at most 3 type sizes, a
  headline at least 2.6 times the body, at most 3 turned pieces, every needed field shown once, text over a picture with a block or fade under it) and shows
  the server's sentences when it has spoken. The header says whether the design is ready to save (each problem a link to its piece), Save draft is the one
  primary button and is refused only for what the server refuses, Publish saves first and shows the failed checks, the menu holds Discard draft, Advanced:
  JSON and Reset to the shipped original. Not looked at in a browser when this was written: it was typechecked, specced as static markup and tested through
  the model and the routes.
- A layout opens its own page, not a side sheet: `/settings/layouts/new` (with `?from=<starter>`, `?duplicate=<layout id>`
  or `?copy=<built-in id>`) and `/settings/layouts/:id`. Blocks are dragged and resized on a large canvas, snapped to the
  grid's cells, or placed with the number fields or in pixels. Keyboard: arrows move the selected block, Shift+arrows resize
  it, Escape deselects, Delete removes it. The canvas's "Real image" view is the real preview; the layout's JSON is under
  "Advanced: JSON".
