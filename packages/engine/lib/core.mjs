// Small shared helpers: paths, .env, secret masking, time zones, hashing, JSON files, tables.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ENGINE_DIR is this package (it holds design/: the brand, templates, fonts, logos and stock assets). ROOT is the repository
// root, two levels up: it holds .env, accounts.json, batches/, media/, state/ and out/, which are the owner's data and not part
// of any package.
export const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.resolve(ENGINE_DIR, '..', '..');

// A path named in a spec or in the brand file. Paths are relative to the repository root, except that design/... files
// (brand.json, fonts, logos, the stock photos and screens) ship with the engine package, so a design/... path that does
// not exist under the root is looked up in the package. The result always stays inside the root or the package.
export function repoPath(rel, root = ROOT) {
  const abs = path.resolve(root, rel);
  if (typeof rel !== 'string' || !/^design[\\/]/.test(rel) || fs.existsSync(abs)) return abs;
  const own = path.resolve(ENGINE_DIR, rel);
  const inside = path.relative(ENGINE_DIR, own);
  return inside.startsWith('..') || path.isAbsolute(inside) ? abs : own;
}

// The brand pack: one folder with brand.json, the logos, and optionally map.json (the dot map), vault.json (the web app's
// first vault), prompts/ (the AI's prompts) and example batches. BRAND_DIR names it, relative to the repository root, in the
// environment or .env; it must stay inside the repository.
export const DEFAULT_BRAND_DIR = 'brands/demo';

export function brandDir({ root = ROOT, env = process.env } = {}) {
  // A blank value in the environment (as compose files pass an unset variable) counts as unset, so .env still applies.
  const rel = (env.BRAND_DIR ?? '').trim() || (loadEnv({ root, env: {} }).BRAND_DIR ?? '').trim() || DEFAULT_BRAND_DIR;
  const abs = path.resolve(root, rel);
  const inside = path.relative(root, abs);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new Error('BRAND_DIR must name a folder inside the repository, for example brands/demo');
  return abs;
}

// A file of the brand pack, for example brandFile('brand.json').
export const brandFile = (name, opts = {}) => path.join(brandDir(opts), name);

export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

// Real environment variables win over the .env file. The merged map holds secrets: never print it.
export function loadEnv({ root = ROOT, env = process.env } = {}) {
  const file = path.join(root, '.env');
  const fromFile = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {};
  return { ...fromFile, ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) };
}

export function loadConfig({ root = ROOT, env = process.env } = {}) {
  const all = loadEnv({ root, env });
  const get = (k) => (all[k] ?? '').trim();
  return { apiKey: get('BUFFER_API_KEY'), orgId: get('BUFFER_ORG_ID'), mediaBaseUrl: get('MEDIA_BASE_URL') };
}

// The key must never reach a terminal, a log or a file. Every message passes through here.
export function maskSecrets(text, secrets = []) {
  let s = String(text);
  for (const secret of secrets) if (secret && secret.length >= 4) s = s.split(secret).join('***');
  return s.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1***');
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function validTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function offsetMs(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// "2026-12-01" + "09:00" in an IANA zone -> UTC ISO string. Two passes handle DST changes.
export function zonedToUtcIso(date, time, timeZone) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone)).toISOString();
}

export function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${e.message}`);
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)));
  const fmt = (r) => r.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ').trimEnd();
  return [fmt(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(fmt)].join('\n');
}

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
