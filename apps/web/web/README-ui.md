# Web UI: shadcn/ui, Tailwind v4

The web app UI is built from shadcn/ui components (Radix + Tailwind CSS v4 + lucide-react). The old hand-made kit and its
stylesheet are gone: everything is Tailwind utilities, the theme tokens and the components below.

## Where things are

| Path | What |
| --- | --- |
| `src/components/ui/*` | shadcn components (button, input, textarea, label, select, checkbox, switch, dialog, alert-dialog, sheet, drawer, table, badge, card, tabs, dropdown-menu, sonner, alert, skeleton, tooltip, popover). Owned by us: edit freely. |
| `src/components/kit/` | The one shared kit, imported from `@/components/kit`: `TextField`, `FormField`, `Notice`, `FormPanel` (see below), `PageHeader`, `DataList`, field wrappers, states (`RowsSkeleton`, `EmptyBlock`, `ErrorBlock`, `LoadingBlock`, `Pager`, `BusyButton`), `ConfirmAction`, badges. Add new shared composites here. `src/components/*.tsx` holds the domain pieces (activity parts, network icon, post row). Shared hooks that are not data loading are in `src/hooks/` (`use-media-query.ts`); the data hooks are in `src/hooks.ts`. |
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
| A form to create or edit something, or a detail view with editable fields | `FormPanel` (`@/components/kit`) |
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
- A page can open its panel from the route (the vault: `/vault/new` and `/vault/:id` render the list with the item panel open, and
  closing navigates back to `/vault`). Keep the panel's state in one component so a save does not re-open the panel.
- Images inside a panel: `max-w-full` with `object-contain` so they never exceed the panel width.


## Navigation, routes and the palette

- The sidebar lists **Home, Create, Facts** (`/vault`), **Pictures** (`/library`), **Publish** and **Activity**; Settings is
  reached from the account menu, and its pages show a "Back to the app" link. There are no tabs on Create: Facts and
  Pictures are their own pages. The addresses `/vault` and `/library` keep their names; only the words people see changed.
- The router is `createBrowserRouter` with one catch-all route (in `main.tsx` and `App.tsx`), so the data-router features
  (blockers, `useBlocker`) work for every page.
- **Ctrl/Cmd+K** opens the command palette (`shell/CommandPalette.tsx`). It searches pages, actions (add a fact, upload
  pictures, new batch...), batches, facts and pictures, and opens the one chosen.
- The setup checklist on Home is one card. `GET /api/overview/home` returns each step as `{ key, title, detail, to, done }`,
  and the AI step also carries `missing` (`'provider'`, `'budget'` or `null`), so the card says what is still needed.

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
- The post editor (`batches/PostEditSheet.tsx`, `batches/editor/`) has two panes: the words, date, networks and design on
  one side and a live preview on the other. Designs are edited with a layout chooser, a picture picker and structured
  editors for figures, lists, carousel pages, tables and cards; the raw design JSON is under "Advanced". The preview asks
  `POST /api/posts/preview-design`, waits a moment after the last edit, keeps the last good picture on screen and cancels a
  request that a newer edit has overtaken (`api.post` takes an optional `AbortSignal`; a cancelled request shows no error).
- Brand and look has eight sections at `/settings/brand/<identity|logos|colours|type|surfaces|post-types|voice|advanced>`
  (`#logos` still opens the Logos section). Uploads and Advanced save the moment they are done; everything else waits for
  Save. "Series" is called "Post types". "Other currencies to flag" is a list of words; a stored pattern that the list cannot
  show is edited under Advanced.
- A layout opens its own page, not a side sheet: `/settings/layouts/new` (with `?from=<starter>`, `?duplicate=<layout id>`
  or `?copy=<built-in id>`) and `/settings/layouts/:id`. Blocks are dragged and resized on a large canvas, snapped to the
  grid's cells, or placed with the number fields or in pixels. Keyboard: arrows move the selected block, Shift+arrows resize
  it, Escape deselects, Delete removes it. The canvas's "Real image" view is the real preview; the layout's JSON is under
  "Advanced: JSON".
