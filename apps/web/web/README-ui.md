# Web UI: shadcn/ui, Tailwind v4

The web app UI is built from shadcn/ui components (Radix + Tailwind CSS v4 + lucide-react). The old hand-made kit and its
stylesheet are gone: everything is Tailwind utilities, the theme tokens and the components below.

## Where things are

| Path | What |
| --- | --- |
| `src/components/ui/*` | shadcn components (button, input, textarea, label, select, checkbox, switch, dialog, alert-dialog, sheet, drawer, table, badge, card, tabs, dropdown-menu, sonner, alert, skeleton, separator, tooltip, scroll-area, popover). Owned by us: edit freely. |
| `src/components/*.tsx` | Our own composites built on those: `text-field.tsx` (`TextField`, `FormField`), `notice.tsx` (`Notice`, an inline message), `form-panel.tsx` (`FormPanel`, see below). Add new shared composites here. Shared hooks that are not data loading are in `src/hooks/` (`use-media-query.ts`); the data hooks are in `src/hooks.ts`. |
| `src/index.css` | Tailwind import, fonts, theme tokens (light and dark). |
| `src/lib/utils.ts` | `cn()` for class names. |
| `src/lib/theme.ts` | `initTheme()`, `setTheme('light' \| 'dark' \| 'system')`, `useTheme()`. |
| `src/pages/kit/` | Page-level pieces shared by the pages: `PageHeader`, `DataList`, field wrappers, states (`RowsSkeleton`, `EmptyBlock`, `ErrorBlock`, `LoadingBlock`, `Pager`, `BusyButton`), `ConfirmAction`. |
| `src/shell/` | `Shell` (sidebar on desktop, Sheet menu on a phone), `nav.ts` (the one navigation list), `AuthLayout`, `PasswordFields`, `ErrorBoundary`. |
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
  (`font-mono text-[11px] uppercase tracking-wider text-muted-foreground`). Files are served from `/fonts`; no font CDN.
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
- Lists: `Table` on desktop, cards on a phone (`pages/kit/data-list.tsx` shows the pattern).
- Status uses `Badge` with the `success | warning | info | destructive | quiet` variants (or `secondary`, `outline`).
- Responsive down to **360 px** with no sideways scroll; tap targets at least 44 px on a phone (`max-sm:min-h-11`).
- Copy: sentence case, plain words. Money, dates and enums go through `lib/format.ts` and `lib/labels.ts`.
- Navigation lives only in `shell/nav.ts`; add a route in `App.tsx` and a nav entry together.
- Do not add or change anything under `src/server`; the UI only calls the API through `src/api.ts` and `hooks.ts`.

## Panels, dialogs and confirms

| Need | Use |
| --- | --- |
| A form to create or edit something, or a detail view with editable fields | `FormPanel` (`@/components/form-panel`) |
| "Are you sure?" before a destructive or irreversible action | `AlertDialog`, through `ConfirmAction` (`pages/kit/confirm-action.tsx`) |
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
    <BusyButton type="submit" form="account-form" busy={saving}>Add account</BusyButton>
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

