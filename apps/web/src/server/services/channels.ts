// Channel lists per Buffer account, fetched through the key check and kept for 60 seconds so the routing page
// does not hit Buffer on every visit. An account's entry is dropped when the account is saved (its updatedAt is
// part of the cache key), so a replaced key never serves the old key's answer.
import type { BufferAccount } from '@prisma/client';
import { decrypt } from '../crypto.js';
import type { Deps } from '../deps.js';
import { checkAccount, type CheckResult } from './buffer-accounts.js';

const TTL_MS = 60_000;
type Entry = { at: number; stamp: string; result: CheckResult };
const caches = new WeakMap<object, Map<string, Entry>>();

const cacheOf = (deps: Deps) => {
  let m = caches.get(deps);
  if (!m) caches.set(deps, (m = new Map()));
  return m;
};
const stampOf = (a: BufferAccount) => `${a.updatedAt.getTime()}:${a.keyCipher.length}`;

// Runs the key check for one account and remembers the answer.
export async function checkAndCache(deps: Deps, account: BufferAccount): Promise<CheckResult> {
  let result: CheckResult;
  try {
    const apiKey = decrypt(account.keyCipher, deps.config.keyring);
    result = await checkAccount(deps, { name: account.name, apiKey, organizationId: account.organizationId ?? '', captionLimits: {} });
  } catch (e) {
    // The stored key cannot be opened (the encryption key changed); the message names no secret.
    result = { ok: false, organizations: [], channels: [], error: String((e as Error).message).slice(0, 300) };
  }
  cacheOf(deps).set(account.id, { at: deps.now().getTime(), stamp: stampOf(account), result });
  return result;
}

// The remembered answer when it is still fresh, else null.
export function cachedCheck(deps: Deps, account: BufferAccount): CheckResult | null {
  const hit = cacheOf(deps).get(account.id);
  if (!hit || hit.stamp !== stampOf(account) || deps.now().getTime() - hit.at > TTL_MS) return null;
  return hit.result;
}

// Every account's channels. One account failing is reported on its own row; the others still answer.
export async function allChannels(deps: Deps, refresh = false) {
  const accounts = await deps.prisma.bufferAccount.findMany({ orderBy: { name: 'asc' } });
  const rows = [];
  for (const account of accounts) {
    const result = (!refresh && cachedCheck(deps, account)) || (await checkAndCache(deps, account));
    rows.push({ accountId: account.id, accountName: account.name, ...result });
  }
  return rows;
}
