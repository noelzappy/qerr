// Prompts live in src/prompts/*.md as versioned files (first line: <!-- version: name-N -->), read at run time. A brand pack
// may replace any of them with its own prompts/<name>.md (see BRAND_DIR in the engine's core.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, brandFile } from '@vesk/engine/core';
import { AIError } from './errors.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'prompts');
const cache = new Map();

// The folder a prompt is read from: the brand pack's prompts/ when it has this prompt, otherwise the library's own.
export function promptDir(name, { root = ROOT } = {}) {
  const own = path.dirname(brandFile(path.join('prompts', `${name}.md`), { root }));
  return fs.existsSync(path.join(own, `${name}.md`)) ? own : DIR;
}

export function loadPrompt(name, { root = ROOT, dir = promptDir(name, { root }) } = {}) {
  const key = `${dir}/${name}`;
  if (cache.has(key)) return cache.get(key);
  let raw;
  try { raw = fs.readFileSync(path.join(dir, `${name}.md`), 'utf8'); } catch { throw new AIError(`Prompt file ${name}.md is missing`, { code: 'config' }); }
  const m = raw.match(/^\s*<!--\s*version:\s*([\w.-]+)\s*-->\s*/);
  if (!m) throw new AIError(`Prompt ${name}.md has no "<!-- version: ... -->" first line`, { code: 'config' });
  const out = { name, version: m[1], text: raw.slice(m[0].length).trim() };
  cache.set(key, out);
  return out;
}
