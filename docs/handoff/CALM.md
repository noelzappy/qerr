# Vesk "calm interface" rules (round 3)

The owner's verdict on the current UI: too busy, a strain on the eyes, too much descriptive text on screen,
whole workflows cramped into side drawers. Wanted: compact, polished, quiet; dedicated pages with breadcrumbs for
real work; descriptions in tooltips. No capability may be removed.

Read `COMMON.md` in this folder too: its hard rules (no commits, no secrets, no new dependencies, glossary,
status vocabulary, British English, accessibility, 360 px minimum) all still apply.

## 1. Text on screen

- A page has a title and at most ONE short sentence under it (often none). No paragraph intros.
- Field help ("hint") is NOT printed under the field. It lives in an info icon beside the label that opens a
  tooltip on hover AND on focus AND on tap (use the kit's hint support; never a bare `title=` attribute).
  The hint text stays connected to the control for screen readers (`aria-describedby` to visually hidden text).
- Stay visible, never in a tooltip: errors, warnings, blockers, anything about sending to Buffer or going live,
  destructive consequences, "saved straight away" confirmations, character counters, empty-state guidance
  (one sentence + one button).
- Section descriptions: gone, or one info icon beside the section title.
- No sentence may repeat on every card/row of a list. Say it once above the list or in a tooltip.
- Placeholders show an example value, never instructions.
- "(optional)" markers stay; required fields get no extra text beyond the existing marker.

## 2. Density and shape

- Controls: 32 px high on `sm` and up (`h-8`), 44 px on phones (the kit handles this). Labels 12.5–13 px medium.
  Body text 13–13.5 px. Page title 18–20 px semibold. Section title 13.5–14 px semibold.
- Vertical rhythm: 12 px between fields, 24–28 px between sections, 16 px page top padding below the header.
- Two columns for short fields on `md`+ where it reads naturally (date + time, name + id); long text full width.
- Reading width for forms: about 640–720 px. Lists and boards may use the full content width.

## 3. Borders, boxes, colour

- No box inside a box. A page section is separated by space and, where needed, ONE hairline (`border-t`);
  it does not get its own bordered card unless it is an item in a list/grid of like items.
- `fieldset` borders: remove (keep `fieldset`/`legend` semantics; style the legend as a section title).
- Lists: rows separated by hairlines inside one bordered container, or cards in a grid — never both.
- Badges: at most ONE status chip per item plus, only when present, ONE problem chip. Counts are plain text.
  Neutral things are not badges.
- Colour is for meaning only: primary action, current step, problems. Everything else is neutral.
- Shadows: only on overlays (dialog, popover, menu).

## 4. Actions

- ONE primary (filled) button per view. Everything else is `outline`/`ghost`, and beyond two visible secondary
  actions the rest go in a "More" menu (the kit dropdown, icon button with `aria-label="More actions"`).
- Destructive actions live in the More menu (red text), still behind the existing confirm.
- Never weaken a safety step: sending to Buffer and going live keep their explicit confirm dialogs listing rows.
- Sticky action bar only on long forms; it holds Save (primary), Cancel, and the unsaved indicator.

## 5. Pages instead of drawers

- A workflow with more than about six fields, or with a preview, is a PAGE with its own URL, a breadcrumb trail
  (`Create / March posts / Edit post`), a title, and Save/Cancel in the header or a sticky bar. Browser Back works;
  refresh keeps you there; unknown ids show a not-found state with a link back.
- Small one-off forms (up to about six fields, no preview) are a centred DIALOG, not a side drawer.
- Side drawers remain only for read-only detail peeks (e.g. an activity run) and the phone menu.
- Use the unsaved-changes guard (`hooks/use-unsaved-guard.tsx`) on every page form and dialog form.
- Old URLs that opened a drawer must keep working (redirect or render the new page).

## 6. Breadcrumbs

Use the kit `Breadcrumbs` (in `PageHeader`'s `crumbs` prop): each crumb a link except the last (current page,
`aria-current="page"`); on phones show only a "← Parent" back link. Trails:

- `Create / <batch title>` · `Create / <batch title> / <post title or "New post">`
- `Facts / <fact title or "New fact">` · `Pictures / <picture title>`
- `Settings / Layouts / <layout name or "New layout">` · `Settings / <page>` for settings pages
