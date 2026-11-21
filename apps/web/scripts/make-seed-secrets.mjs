#!/usr/bin/env node
// Builds the SEED_SECRETS_B64 value for a new deployment from files on this machine and writes it
// (as SEED_SECRETS_B64; the vault seed needs no variable) to deploy/staging.env.local (git-ignored) so it can be pasted into Dokploy. Keys never pass through chat or git.
//
//   node apps/web/scripts/make-seed-secrets.mjs [--anthropic-env <file>] [--root <dir>] [--out <file>]
//
// Reads <root>/.env (Buffer keys, and optionally BRAVE_SEARCH_API_KEY / TAVILY_API_KEY / EXA_API_KEY), <root>/accounts.json
// (account names, the variables that hold their keys, routing; the format is in apps/web/README.md, "Seeding a new
// deployment") and, with --anthropic-env, AI_ANTHROPIC_API_KEY from that file. Both root files are git-ignored. It prints
// only which parts it included, never a value. Plain Node, no dependencies.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The networks the app routes (packages/engine/lib/networks.mjs NETWORKS).
const NETWORKS = ['instagram', 'linkedin', 'facebook', 'x'];
const AI_MODEL = 'claude-sonnet-5-5';
const SEARCH_VARS = [['brave', 'BRAVE_SEARCH_API_KEY'], ['tavily', 'TAVILY_API_KEY'], ['exa', 'EXA_API_KEY']];

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { root: path.resolve(here, '..', '..', '..'), anthropicEnv: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const value = () => {
      if (!argv[i + 1]) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--anthropic-env') out.anthropicEnv = expandHome(value());
    else if (a === '--root') out.root = path.resolve(value());
    else if (a === '--out') out.out = path.resolve(value());
    else throw new Error(`Unknown option ${a}. Use --anthropic-env <file>, --root <dir>, --out <file>`);
  }
  out.out ??= path.join(out.root, 'deploy', 'staging.env.local');
  return out;
}

const expandHome = (p) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : path.resolve(p));

// KEY=value lines; blank lines and # comments ignored; optional `export `; one pair of quotes removed.
function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    env[m[1]] = v;
  }
  return env;
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export function buildSeed({ root, anthropicEnv }) {
  const notes = [];
  const envText = readIfExists(path.join(root, '.env'));
  const env = envText ? parseEnv(envText) : {};
  if (envText === null) notes.push('.env not found: no Buffer or search keys');

  const seed = { bufferAccounts: [], routing: [], aiProviders: [] };
  const accountsText = readIfExists(path.join(root, 'accounts.json'));
  let accountsJson = null;
  if (accountsText === null) notes.push('accounts.json not found: no Buffer accounts or routing');
  else {
    try { accountsJson = JSON.parse(accountsText); } catch { notes.push('accounts.json is not valid JSON: no Buffer accounts or routing'); }
  }

  const included = new Set();
  for (const a of Array.isArray(accountsJson?.accounts) ? accountsJson.accounts : []) {
    const key = String(env[a.keyEnv] ?? '').trim();
    if (!key) { notes.push(`Buffer account ${a.name}: ${a.keyEnv} is empty or missing in .env, left out`); continue; }
    seed.bufferAccounts.push({
      name: a.name, apiKey: key,
      ...(a.organizationId ? { organizationId: a.organizationId } : {}),
      ...(a.captionLimits && Object.keys(a.captionLimits).length ? { captionLimits: a.captionLimits } : {}),
    });
    included.add(a.name);
  }
  for (const [network, r] of Object.entries(accountsJson?.routing ?? {})) {
    if (!NETWORKS.includes(network)) { notes.push(`routing for ${network}: the app does not support this network, left out`); continue; }
    if (!r?.channelId || !included.has(r.account)) { notes.push(`routing for ${network}: no channel id or its account is not included, left out`); continue; }
    seed.routing.push({ network, account: r.account, channelId: r.channelId });
  }

  if (anthropicEnv) {
    const text = readIfExists(anthropicEnv);
    const key = text === null ? '' : String(parseEnv(text).AI_ANTHROPIC_API_KEY ?? '').trim();
    if (key) seed.aiProviders.push({ kind: 'anthropic', model: AI_MODEL, apiKey: key, tasks: ['draft', 'research', 'rewrite'] });
    else notes.push('AI provider: AI_ANTHROPIC_API_KEY not found in the --anthropic-env file, left out');
  } else notes.push('AI provider: no --anthropic-env file given, left out');

  for (const [kind, name] of SEARCH_VARS) {
    const key = String(env[name] ?? '').trim();
    if (key) { seed.search = { kind, apiKey: key }; break; }
  }
  if (!seed.search) notes.push('search: no BRAVE_SEARCH_API_KEY, TAVILY_API_KEY or EXA_API_KEY in .env, left out');

  for (const k of ['bufferAccounts', 'routing', 'aiProviders']) if (!seed[k].length) delete seed[k];
  const parts = [
    ...(seed.bufferAccounts ? [`Buffer accounts: ${seed.bufferAccounts.map((a) => a.name).join(', ')}`] : []),
    ...(seed.routing ? [`routing: ${seed.routing.map((r) => `${r.network} -> ${r.account}`).join(', ')}`] : []),
    ...(seed.aiProviders ? [`AI provider: anthropic ${AI_MODEL} (draft, research, rewrite)`] : []),
    ...(seed.search ? [`search: ${seed.search.kind}`] : []),
  ];
  return { seed, parts, notes };
}

// Replaces any SEED_ lines and appends the new one. The file holds secrets, so it is created private.
export function writeSeedLines(file, b64) {
  const existing = readIfExists(file) ?? '';
  const kept = existing.split('\n').filter((l) => !/^\s*(export\s+)?SEED_[A-Z0-9_]*\s*=/.test(l));
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${kept.join('\n')}${kept.length ? '\n' : ''}SEED_SECRETS_B64=${b64}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { seed, parts, notes } = buildSeed(args);
  if (!parts.length) {
    for (const n of notes) console.log(`- ${n}`);
    console.error('Nothing to seed: no secrets were found. Nothing was written.');
    process.exitCode = 1;
    return;
  }
  writeSeedLines(args.out, Buffer.from(JSON.stringify(seed)).toString('base64'));
  console.log(`Wrote SEED_SECRETS_B64 to ${path.relative(process.cwd(), args.out) || args.out}`);
  console.log('Included:');
  for (const p of parts) console.log(`  - ${p}`);
  if (notes.length) {
    console.log('Left out:');
    for (const n of notes) console.log(`  - ${n}`);
  }
  console.log('No key values were printed. Paste the line into the Dokploy environment, deploy, then remove it.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(`make-seed-secrets: ${e.message}`); process.exitCode = 1; }
}
