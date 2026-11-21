// The engine (the design renderer and the Buffer client) and the AI library are workspace packages, @vesk/engine and
// @vesk/ai. They are plain .mjs with no type declarations, so they are loaded with a dynamic import by name and
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
      return JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).name === '@vesk/web';
    } catch {
      return false;
    }
  }));
}

// Loads an engine module by its package subpath: 'client' is @vesk/engine/client (lib/client.mjs),
// 'design/chrome' is lib/design/chrome.mjs.
export async function engineImport<T = unknown>(name: string): Promise<T> {
  const specifier = `@vesk/engine/${name}`;
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

// Loads the AI library, or returns null when @vesk/ai is not installed (the stub in ai.ts then says so). A failure
// inside the package itself is not "absent" and is thrown.
export async function importAiPackage<T = unknown>(): Promise<T | null> {
  const specifier = '@vesk/ai';
  try {
    return (await import(/* @vite-ignore */ specifier)) as T;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ERR_MODULE_NOT_FOUND' && String(err.message).includes(`'${specifier}'`)) return null;
    throw e;
  }
}
