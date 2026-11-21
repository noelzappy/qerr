# Contributing

Thank you for helping. This file says how to set the project up, how to check a change, and what a pull request needs.
The rules that every change follows are in [AGENTS.md](AGENTS.md); read them first. They apply to people and to AI tools
alike.

## Set up

You need:

- Node.js 22.12 or newer.
- Google Chrome or Chromium, for the design engine (set `CHROME_PATH` if it is not found).
- Postgres 16 for the web app's tests. The quickest way is a throwaway container:

  ```sh
  docker run -d --name vesk-test-pg -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:55440:5432 postgres:16
  ```

Then, from the repository root:

```sh
npm ci
npm test          # the engine and AI tests (node --test), then the web app's vitest against Postgres
```

`npm test` needs no keys and no network: Buffer, the AI providers and storage are faked in the tests. Nothing in a
fresh clone is missing: the demo brand pack (`brands/demo`) and its pictures are in the repository.

To run the web app locally, see [apps/web/README.md](apps/web/README.md). To use the command-line tool, see
[README.md](README.md).

## Making a change

- One logical change per commit. Commit messages are imperative and conventional, for example
  `fix(engine): refuse live pushes in the past`.
- A change in behaviour comes with a test that fails without it. Do not skip, delete or loosen a test to get green.
- Keep `packages/engine` and `packages/ai` free of dependencies (Node's standard library only).
- Keep `README.md`, the `--help` texts and `docs/` in step with the code when you change a command, a flag or a field.
- Never commit keys, `.env`, `accounts.json`, media, rendered images or photographs of people (see AGENTS.md, rules 1
  and 7).
- Brand-specific things (names, colours, logos, prompts, facts) belong in the brand (Settings in the web app, or a brand pack under `brands/`), never in the
  engine, the AI library or the web app. Use the demo pack, `brands/demo`, in examples and tests.
- Before you open a pull request, run `npm test` and `npm run typecheck --workspace @vesk/web`.

## Pull requests

Describe what changed and why, how you tested it, and anything a reviewer should look at closely. Link the issue it
closes, if there is one. Small pull requests are reviewed faster than large ones.

## Reporting bugs and security issues

Open an issue for bugs and ideas. Report security problems privately, as [SECURITY.md](SECURITY.md) explains; never in a
public issue.

## Licence

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE).
