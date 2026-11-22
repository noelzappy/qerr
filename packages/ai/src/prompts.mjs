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

// A prompt file may hold two versions of a part: lines between `<!-- if direction -->` and `<!-- else -->` are kept for a brand that
// has a design direction, lines between `<!-- else -->` and `<!-- end -->` for one that has none (the `else` part is optional).
// The marker lines stand alone on a line and do not nest. A file without markers is the same for both.
export function forDirection(text, direction) {
  const out = [];
  let mode = 'both';
  for (const line of text.split('\n')) {
    const m = /^\s*<!--\s*(if direction|else|end)\s*-->\s*$/.exec(line);
    if (!m) { if (mode === 'both' || (mode === 'with') === direction) out.push(line); continue; }
    mode = m[1] === 'if direction' ? 'with' : m[1] === 'else' ? 'without' : 'both';
  }
  return out.join('\n');
}

export function loadPrompt(name, { root = ROOT, dir = promptDir(name, { root }), direction = false } = {}) {
  const key = `${dir}/${name}/${direction ? 'direction' : 'plain'}`;
  if (cache.has(key)) return cache.get(key);
  let raw;
  try { raw = fs.readFileSync(path.join(dir, `${name}.md`), 'utf8'); } catch { throw new AIError(`Prompt file ${name}.md is missing`, { code: 'config' }); }
  const m = raw.match(/^\s*<!--\s*version:\s*([\w.-]+)\s*-->\s*/);
  if (!m) throw new AIError(`Prompt ${name}.md has no "<!-- version: ... -->" first line`, { code: 'config' });
  const out = { name, version: m[1], text: forDirection(raw.slice(m[0].length), direction).replace(/\n{3,}/g, '\n\n').trim() };
  cache.set(key, out);
  return out;
}
