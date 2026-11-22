// The engine (the design renderer and the Buffer client) and the AI library are workspace packages, @qerr/engine and
// @qerr/ai. They are plain .mjs with no type declarations, so they are loaded with a dynamic import by name and
// the caller casts the result to the interface it uses, kept next to the wrapper that needs it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function walkUp(start: string, test: (dir: string) => boolean): string | null {
  let dir = start;
  for (;;) {
    if (test(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));

let cachedApp: string | null | undefined;
// The web app directory (the one with this package.json), whether the server runs from src/ (tsx, tests) or dist/.
export function appRoot(): string | null {
  if (cachedApp !== undefined) return cachedApp;
  return (cachedApp = walkUp(here, (d) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).name === '@qerr/web';
    } catch {
      return false;
    }
  }));
}

// Loads an engine module by its package subpath: 'client' is @qerr/engine/client (lib/client.mjs),
// 'design/chrome' is lib/design/chrome.mjs.
export async function engineImport<T = unknown>(name: string): Promise<T> {
  const specifier = `@qerr/engine/${name}`;
  return (await import(/* @vite-ignore */ specifier)) as T;
}

// Whether an engine module exists in this install.
export async function engineHas(name: string): Promise<boolean> {
  try {
    await engineImport(name);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' || (e as NodeJS.ErrnoException).code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') return false;
    throw e;
  }
}

// Loads the AI library, @qerr/ai.
export async function aiImport<T = unknown>(): Promise<T> {
  const specifier = '@qerr/ai';
  return (await import(/* @vite-ignore */ specifier)) as T;
}

// The workspace packages must be this repository's own. In a second checkout of the repository (a git worktree) without its own
// install, Node finds @qerr/engine and @qerr/ai by walking up the folders and may load ANOTHER checkout's engine: the tests then run
// this app against an older renderer and report design checks that are not this code's. Returns one sentence per package that
// resolves outside `repoRoot` (resolve: a package specifier -> its file path; it throws when nothing is found).
export function workspaceLinkProblems(repoRoot: string, resolve: (specifier: string) => string): string[] {
  const out: string[] = [];
  for (const [name, dir] of [['@qerr/engine', 'packages/engine'], ['@qerr/ai', 'packages/ai']] as const) {
    let file: string;
    try { file = fs.realpathSync(resolve(`${name}/package.json`)); } catch { continue; }
    const want = fs.realpathSync(path.join(repoRoot, dir));
    if (path.dirname(file) !== want) out.push(`${name} resolves to ${path.dirname(file)}, not this repository's ${dir}: run npm install in this checkout (or link node_modules/${name} to ../../${dir}) before running the tests`);
  }
  return out;
}

