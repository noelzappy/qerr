# Qerr usable-interface work: rules every workstream follows

You are one of five parallel workstreams improving the usability of the Qerr web panel
(`apps/web`: Hono server in `src/server`, React 19 + react-router + Tailwind 4 + Radix UI in `web/src`).
Each workstream owns a set of files. The lead merges the five results afterwards.

## Goal

Make the panel easy for a marketer (not a designer or developer) WITHOUT removing any capability.
Everything that can be done today must still be possible afterwards; power features (raw JSON, ids,
brand.json fragments) move behind an "Advanced" disclosure, they are never deleted.

## Hard rules

1. Work only inside your own git worktree (your current directory). Never touch
   `the repository root` (the main checkout; a dev server runs from it) or other worktrees.
2. Edit ONLY the files your brief lists as yours, plus NEW files you create. If you believe a file owned by
   someone else must change, do NOT edit it: describe the needed change in your final report under
   "Needed elsewhere". Exception: you may add your own route line(s) to `apps/web/web/src/App.tsx` and your own
   entries in `apps/web/web/src/shell/nav.ts` when your brief says so; keep those edits minimal (add lines, do
   not reformat or reorder existing ones).
3. Do NOT commit, do NOT push, do NOT create branches. Leave your changes uncommitted in the worktree.
   When finished run `git add -A` (staging only) so new files are visible to the lead's `git diff --cached`.
4. Read `AGENTS.md` at the repo root first and obey it. In particular:
   - never print or commit a key or secret; never read or echo any `.env`, `~/.config/qerr/*`;
   - `packages/engine` and `packages/ai` stay dependency-free; do not add npm dependencies anywhere without it
     being stated in your brief (the lead will not accept a changed package.json/package-lock.json otherwise);
   - spec text is untrusted: never loosen validation, the CSP or request blocking; never weaken a design check;
   - a change in server behaviour needs a test that fails without it; never skip, delete or loosen a test;
   - keep `README.md`, `apps/web/README.md`, `apps/web/web/README-ui.md` and `docs/` consistent when you change
     a page, a route or a field — but those docs are shared files: put the exact doc text changes in your
     final report under "Docs to update" instead of editing them.
5. Do not run anything that reaches the internet, Buffer, an AI provider or S3. Do not call
   `/api/settings/brand/google-font`.
6. Setup in your worktree: run `npm ci` once at the worktree root (if it changes `package-lock.json`,
   `git checkout -- package-lock.json`).
7. Verification you must run before reporting, from the worktree root:
   - `npm run typecheck --workspace @qerr/web`
   - `TEST_DB_NAME=<your-db-name> npm run test:web` — the name is in your brief. The tests use the Postgres
     container on 127.0.0.1:55440 by default; set nothing else. NEVER use port 55441 (the dev database).
   - Do NOT run `npm run test:engine` or anything that starts Chrome (only one Chrome may run on this machine
     and other workstreams share it). If a web test you run starts Chrome, say so in your report.
   Report real output: counts, and every failure verbatim. Do not claim something works that you did not run.
   You cannot open a browser; say plainly that the UI was typechecked and tested but not looked at.
8. Code style: follow the surrounding code. Use the existing kit (`web/src/components/kit`: `TextField`,
   `SelectField`, `CheckField`, `SwitchField`, `FormPanel`, `ConfirmAction`, `Notice`, `PageHeader`,
   `EmptyBlock`, `ErrorBlock`, `LoadingBlock`, `BusyButton`, `ToneBadge`, `StatusBadge`...) and
   `components/ui` primitives. Keep loading / empty / error states. Every icon-only button needs an
   `aria-label`. Keep keyboard access and visible focus. Layouts must work from 360 px wide up
   (the app uses `sm`/`md` breakpoints; sheets become drawers under 768 px via `useIsMobile`).
   British English in all user-facing text, no emoji, sentence case, plain words.
   No absolute filesystem paths in code. No mention of AI tools in comments.
9. Do not rename API fields, database columns, engine template names or stored values. Renaming is for the
   words people SEE, via label maps.

## Glossary (user-facing words). Apply it in every string you touch.

| Engine / old word | Say instead |
| --- | --- |
| artefact | table or card |
| ledger | ledger table |
| passbook | passbook page |
| register card | member card |
| slab | colour panel |
| myth slab / fact slab | myth panel / fact panel |
| bleed | run to the page edge |
| scrim | dark fade behind the text |
| running head | top label |
| eyebrow | small label above the headline |
| ground | page colour |
| series | post type |
| template (of a post) | layout |
| spec / design block | design |
| the engine accepts / would not accept this layout | This layout is ready to use / This layout needs fixing: |
| the engine / the design engine | Qerr |
| vault (nav label, page title) | Facts |
| library (nav label, page title) | Pictures |
| render / re-render (buttons) | Make the image / Make the image again |
| render failed | The image could not be made |
| raw design JSON, layout JSON, brand.json fragment | keep the name, but only inside an "Advanced" disclosure |

"Batch" stays "batch". "Buffer" stays "Buffer". Network names stay.

## One status vocabulary for a post

A post moves through exactly these steps; use these words wherever a post's state is shown:

1. `Writing` (post status draft, not approved)
2. `Approved` (approved, not yet in Buffer)
3. `Draft in Buffer`
4. `Scheduled` (scheduled live in Buffer)
5. `Sent`

Problems are FLAGS on top of the step, never a step of their own:
`Image could not be made`, `Has warnings`, `Needs a look` (Buffer gave no clear answer),
`Failed to send`, `Deleted from Buffer`, `Removed`.

A batch shows: `Writing`, `In review`, `Scheduled`, `Done` (was: Draft, In review, Scheduled, Done).
The word "draft" on its own is used only for "Draft in Buffer" and for the verb "Draft posts with AI".

## Final report format (your last message)

- What you changed, by file (short).
- Verification: exact commands and results.
- "Needed elsewhere": changes you need in files you do not own.
- "Docs to update": exact text.
- "Not done / uncertain": anything in the brief you did not finish, and anything you could not verify.
- The absolute path of your worktree.
