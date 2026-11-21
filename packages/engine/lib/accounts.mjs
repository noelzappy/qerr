// Buffer accounts and channel routing. Two setups:
//   accounts.json present  -> several accounts, keys from the environment variables it names, routing per network.
//   accounts.json absent   -> the original setup: BUFFER_API_KEY + BUFFER_ORG_ID + channels.json, one account "default".
// Keys are never read from accounts.json and never stored on disk by this tool.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv, readJson } from './core.mjs';
import { NETWORKS } from './networks.mjs';

export const LEGACY_ACCOUNT = 'default';

export class ConfigError extends Error {
  constructor(errors) {
    super(`accounts.json is not valid:\n  - ${errors.join('\n  - ')}`);
    this.errors = errors;
  }
}

const KEYISH = /^(api_?key|key|token|secret|password)$/i;
const ACCOUNT_FIELDS = ['name', 'keyEnv', 'organizationId', 'captionLimits'];
const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
const ENV_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

export const accountsFile = (root = ROOT) => path.join(root, 'accounts.json');

// Validates accounts.json. Messages never repeat a value from the file, so a key pasted by mistake is not echoed.
export function validateAccountsConfig(raw, env = {}) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['the file must be a JSON object with "accounts" and "routing"'] };
  for (const k of Object.keys(raw)) if (!['accounts', 'routing'].includes(k)) errors.push(`unknown top-level field "${k}" (use accounts and routing)`);
  if (!Array.isArray(raw.accounts) || !raw.accounts.length) errors.push('accounts must be a non-empty list');
  const accounts = [];
  const names = new Set();
  (Array.isArray(raw.accounts) ? raw.accounts : []).forEach((a, i) => {
    const where = `account #${i + 1}`;
    if (!a || typeof a !== 'object' || Array.isArray(a)) return errors.push(`${where} must be an object`);
    for (const k of Object.keys(a)) {
      if (KEYISH.test(k)) errors.push(`${where}: "${k}" is not allowed here. Keys are read from the environment variable named in keyEnv; never put a key in this file`);
      else if (!ACCOUNT_FIELDS.includes(k)) errors.push(`${where}: unknown field "${k}" (use ${ACCOUNT_FIELDS.join(', ')})`);
    }
    if (typeof a.name !== 'string' || !NAME_RE.test(a.name)) return errors.push(`${where}: name is required (letters, digits, _ -, up to 32 characters)`);
    if (names.has(a.name)) return errors.push(`account "${a.name}": duplicate name`);
    names.add(a.name);
    if (typeof a.keyEnv !== 'string' || !ENV_NAME_RE.test(a.keyEnv)) errors.push(`account "${a.name}": keyEnv must be the NAME of an environment variable in capitals, such as BUFFER_KEY_MAIN, not a key`);
    if (a.organizationId !== undefined && typeof a.organizationId !== 'string') errors.push(`account "${a.name}": organizationId must be a string`);
    const limits = a.captionLimits ?? {};
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) errors.push(`account "${a.name}": captionLimits must look like { "x": 280 }`);
    else {
      for (const [n, v] of Object.entries(limits)) {
        if (!NETWORKS.includes(n)) errors.push(`account "${a.name}": captionLimits has an unknown network "${n}"`);
        else if (!Number.isInteger(v) || v < 1 || v > 1_000_000) errors.push(`account "${a.name}": captionLimits.${n} must be a whole number of characters`);
      }
    }
    accounts.push({
      name: a.name, keyEnv: a.keyEnv, apiKey: ENV_NAME_RE.test(a.keyEnv ?? '') ? String(env[a.keyEnv] ?? '').trim() : '',
      organizationId: a.organizationId || '', captionLimits: { ...limits },
    });
  });
  const routing = {};
  const r = raw.routing ?? {};
  if (!r || typeof r !== 'object' || Array.isArray(r)) errors.push('routing must be an object: { "x": { "account": "main", "channelId": "..." } }');
  else {
    for (const [network, entry] of Object.entries(r)) {
      if (!NETWORKS.includes(network)) { errors.push(`routing: unknown network "${network}" (use ${NETWORKS.join(', ')})`); continue; }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { errors.push(`routing.${network} must be { "account": "...", "channelId": "..." }`); continue; }
      for (const k of Object.keys(entry)) if (!['account', 'channelId'].includes(k)) errors.push(`routing.${network}: unknown field "${k}"`);
      if (typeof entry.account !== 'string' || !names.has(entry.account)) errors.push(`routing.${network}: account must be one of the accounts listed above (${[...names].join(', ') || 'none'})`);
      else if (entry.channelId !== undefined && typeof entry.channelId !== 'string') errors.push(`routing.${network}: channelId must be a string`);
      else routing[network] = { account: entry.account, channelId: entry.channelId || null };
    }
  }
  return { errors, accounts, routing };
}

// Returns { mode, accounts, routing }. routing[network] = { account, channelId } (channelId may be null while not filled in).
export function loadAccountsConfig({ root = ROOT, env = process.env } = {}) {
  const all = loadEnv({ root, env });
  const file = accountsFile(root);
  if (fs.existsSync(file)) {
    const raw = readJson(file, null);
    const { errors, accounts, routing } = validateAccountsConfig(raw, all);
    if (errors.length) throw new ConfigError(errors);
    return { mode: 'accounts', accounts, routing };
  }
  const channels = readJson(path.join(root, 'channels.json'), {});
  const account = {
    name: LEGACY_ACCOUNT, keyEnv: 'BUFFER_API_KEY', apiKey: String(all.BUFFER_API_KEY ?? '').trim(),
    organizationId: String(all.BUFFER_ORG_ID ?? '').trim(), captionLimits: {},
  };
  const routing = Object.fromEntries(NETWORKS.map((n) => [n, { account: LEGACY_ACCOUNT, channelId: channels[n] || null }]));
  return { mode: 'legacy', accounts: [account], routing };
}

export const findAccount = (cfg, name) => cfg.accounts.find((a) => a.name === name);

// The key of an account, or an error that names the variable (never its value).
export function requireKey(account) {
  if (!account.apiKey) throw new Error(`no Buffer key for account "${account.name}": set ${account.keyEnv} in .env (see .env.example)`);
  return account.apiKey;
}

// Every secret this tool may hold, for masking error messages. Never throws: it runs while reporting another error.
export function collectSecrets({ root = ROOT, env = process.env } = {}) {
  const out = [];
  try {
    const all = loadEnv({ root, env });
    for (const k of ['BUFFER_API_KEY', 'S3_SECRET_ACCESS_KEY']) if (all[k]) out.push(String(all[k]).trim());
    const file = accountsFile(root);
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const a of raw?.accounts ?? []) if (typeof a?.keyEnv === 'string' && all[a.keyEnv]) out.push(String(all[a.keyEnv]).trim());
    }
  } catch { /* masking is best effort; the caller still masks Bearer tokens */ }
  return out.filter(Boolean);
}

// Caption limit for one network on one account: the account's own setting, else the built-in default.
export const captionLimitFor = (account, network, defaults) => account?.captionLimits?.[network] ?? defaults[network].chars;
