// State file, duplicate protection, the push loop and status reconciliation.
import path from 'node:path';
import { ROOT, readJson, table, writeJson } from './core.mjs';
import { BufferError, probeMedia } from './client.mjs';
import { buildRequest } from './batch.mjs';
import { LEGACY_ACCOUNT } from './accounts.mjs';

export const statePath = (name, root = ROOT) => path.join(root, 'state', `${name}.json`);
export const loadState = (file, name) => readJson(file, { batch: name, posts: {} });
export const getRecord = (state, item) => state.posts[item.postId]?.[item.network];

function setRecord(state, item, rec) {
  (state.posts[item.postId] ??= {})[item.network] = rec;
}

// Decide what push does with one item, from the state file alone.
export function decide(rec, item, { live, forceNew }) {
  if (!rec) return { action: 'create' };
  if (rec.status === 'unknown') {
    return forceNew
      ? { action: 'create', note: 'previous attempt had an unknown outcome; check Buffer for a duplicate' }
      : { action: 'refuse', reason: 'an earlier attempt got no clear answer; run "status" to see whether Buffer has it' };
  }
  // A record made in one Buffer account is not a record in another: a changed route must be handled by a person.
  if (rec.account && item.account && rec.account !== item.account) {
    return forceNew
      ? { action: 'create', note: `replaces ${rec.bufferId} in account ${rec.account}, which stays in Buffer; delete it there` }
      : { action: 'refuse', reason: `${rec.bufferId} was created in account "${rec.account}" but ${item.network} is now routed to "${item.account}"; delete it in Buffer, then use --force-new` };
  }
  if (rec.hash === item.hash) {
    if (rec.mode === 'live') return { action: 'skip', reason: `already scheduled (${rec.bufferId})` };
    if (!live) return { action: 'skip', reason: `already a draft (${rec.bufferId})` };
    return { action: 'create', promote: true, note: `draft ${rec.bufferId} stays in Buffer; delete it there` };
  }
  return forceNew
    ? { action: 'create', note: `replaces ${rec.bufferId}, which stays in Buffer; delete it there` }
    : { action: 'refuse', reason: `content changed since ${rec.bufferId} was created (${rec.mode}); fix or delete it in Buffer, then use --force-new` };
}

export function planRows(items, state, opts) {
  return items.map((item) => {
    const d = decide(getRecord(state, item), item, opts);
    return { item, ...d };
  });
}

export function describeAction(r) {
  if (r.action === 'create') return (r.promote ? 'create live (from draft)' : 'create') + (r.note ? ` - ${r.note}` : '');
  return `${r.action}: ${r.reason}`;
}

// One Buffer client per account (`clients`, by account name), or a single `client` for the one-account setup.
// Stops at the first unexpected error and says which account and channel it was, and what was left undone.
export async function runPush({ rows, client, clients, state, saveState, live, fetchImpl, log, now = Date.now }) {
  const multi = !!clients;
  const summary = { created: 0, skipped: 0, refused: 0, failed: 0, unknown: 0, stopped: null, byAccount: {}, notAttempted: [] };
  const mode = live ? 'live' : 'draft';
  const count = (item, key) => {
    summary[key]++;
    const a = (summary.byAccount[item.account ?? '-'] ??= { created: 0, skipped: 0, refused: 0, failed: 0, unknown: 0, notAttempted: 0 });
    a[key]++;
  };
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const { item } = row;
    const label = `${item.postId} / ${item.network}`;
    const where = multi ? `account "${item.account}", channel ${item.channelId}` : `channel ${item.channelId}`;
    const stop = (message) => {
      summary.stopped = message;
      for (const later of rows.slice(index + 1)) {
        if (later.action !== 'create') continue;
        summary.byAccount[later.item.account ?? '-'] ??= { created: 0, skipped: 0, refused: 0, failed: 0, unknown: 0, notAttempted: 0 };
        summary.byAccount[later.item.account ?? '-'].notAttempted++;
        summary.notAttempted.push({ postId: later.item.postId, network: later.item.network, account: later.item.account });
        log(`NOT SENT ${later.item.postId} / ${later.item.network}${multi ? ` (account "${later.item.account}")` : ''}: the run stopped before it`);
      }
    };
    if (row.action === 'skip') { count(item, 'skipped'); log(`skip    ${label}: ${row.reason}`); continue; }
    if (row.action === 'refuse') { count(item, 'refused'); log(`REFUSE  ${label}: ${row.reason}`); continue; }
    if (!item.account) { count(item, 'refused'); log(`REFUSE  ${label}: ${item.network} has no route in accounts.json (add it under "routing")`); continue; }
    if (!item.channelId) { count(item, 'refused'); log(`REFUSE  ${label}: no channel id for ${item.network} in ${multi ? 'the routing of accounts.json' : 'channels.json (copy channels.example.json to channels.json and fill it in)'}`); continue; }
    const api = multi ? clients[item.account] : client;
    if (!api) { count(item, 'refused'); log(`REFUSE  ${label}: no Buffer client for account "${item.account}"`); continue; }
    if (live && Date.parse(item.dueAt) <= now()) { count(item, 'refused'); log(`REFUSE  ${label}: dueAt ${item.dueAt} is in the past`); continue; }

    const bad = [];
    for (const m of item.media) {
      const probe = await probeMedia(m.url, fetchImpl);
      if (!probe.ok) bad.push(`${m.url} -> ${probe.reason}`);
    }
    if (bad.length) { count(item, 'refused'); log(`REFUSE  ${label}: media not reachable:\n          ${bad.join('\n          ')}`); continue; }

    const { query, variables } = buildRequest(item, { draft: !live });
    const previous = getRecord(state, item);
    const base = { account: item.account, mode, dueAt: item.dueAt, hash: item.hash, at: new Date(now()).toISOString() };
    const history = previous?.bufferId ? [...(previous.previous ?? []), { bufferId: previous.bufferId, mode: previous.mode, hash: previous.hash, ...(previous.account ? { account: previous.account } : {}) }] : previous?.previous;
    const withHistory = (rec) => (history ? { ...rec, previous: history } : rec);
    try {
      const data = await api.gql(query, variables);
      const res = data?.createPost;
      if (res?.post?.id) {
        setRecord(state, item, withHistory({ ...base, status: 'created', bufferId: res.post.id }));
        saveState();
        count(item, 'created');
        log(`created ${label}: ${mode} ${res.post.id} for ${item.dueAt}${multi ? ` (account "${item.account}")` : ''}`);
      } else if (res && typeof res.message === 'string') {
        count(item, 'failed');
        stop(`Buffer refused ${label} (${where}): ${res.message}`);
        break;
      } else {
        throw new BufferError(`createPost returned an unrecognised answer (${res?.__typename ?? 'nothing'})`, { kind: 'parse', ambiguous: true });
      }
    } catch (e) {
      if (!(e instanceof BufferError)) throw e;
      if (e.ambiguous) {
        setRecord(state, item, withHistory({ ...base, status: 'unknown', text: item.text, error: e.message }));
        saveState();
        count(item, 'unknown');
        stop(`No clear answer for ${label} (${where}): ${e.message}. It may or may not exist in Buffer. NOT retried. Run "status" before anything else.`);
      } else {
        count(item, 'failed');
        stop(`Stopped at ${label} (${where}): ${e.message}`);
      }
      break;
    }
  }
  return summary;
}

export async function resolveOrg(client, configuredId) {
  if (configuredId) return configuredId;
  const data = await client.gql('query { account { organizations { id name } } }');
  const orgs = data?.account?.organizations ?? [];
  if (orgs.length === 1) return orgs[0].id;
  throw new Error(orgs.length ? `Several organizations found; set BUFFER_ORG_ID to one of: ${orgs.map((o) => `${o.id} (${o.name})`).join(', ')}` : 'No organizations found for this key.');
}

const postsQuery = (orgId, status) => `query { posts(input: { organizationId: ${JSON.stringify(orgId)}, sort: [{ field: dueAt, direction: asc }], filter: { status: [${status}] } }) { edges { node { id text dueAt } } } }`;
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Lists what Buffer holds, per account, and reconciles it with the state file. Unknown records are resolved only on an
// unambiguous match inside the account they belong to. Either pass { client, orgId } (one account) or
// { accounts: [{ name, client, orgId }], accountOf(network) } where accountOf names the account for records that predate
// accounts (they carry no `account`).
export async function runStatus({ client, orgId, accounts, accountOf = () => LEGACY_ACCOUNT, state, saveState, log }) {
  const list = accounts ?? [{ name: LEGACY_ACCOUNT, client, orgId }];
  const multi = !!accounts;
  const remote = new Map();
  const failed = new Set();
  for (const acc of list) {
    const found = [];
    remote.set(acc.name, found);
    for (const status of ['scheduled', 'draft']) {
      try {
        const data = await acc.client.gql(postsQuery(acc.orgId, status));
        for (const e of data?.posts?.edges ?? []) found.push({ ...e.node, listedAs: status });
      } catch (e) {
        failed.add(acc.name);
        log(`Could not list "${status}" posts${multi ? ` for account "${acc.name}"` : ''}: ${e.message}${status === 'draft' ? '\n  (the draft status enum value is unverified; run check to see the real values)' : ''}`);
      }
    }
    log(`\nBuffer${multi ? ` account "${acc.name}"` : ''} holds ${found.length} scheduled/draft posts (first page only):`);
    log(table(['listed as', 'id', 'due (UTC)', 'text'], found.map((p) => [p.listedAs, p.id, p.dueAt ?? '-', norm(p.text).slice(0, 50)])));
  }

  const rows = [];
  let changed = false;
  for (const [postId, byNetwork] of Object.entries(state.posts)) {
    for (const [network, rec] of Object.entries(byNetwork)) {
      const name = rec.account ?? accountOf(network);
      const mine = remote.get(name);
      let hit = mine?.find((p) => p.id === rec.bufferId);
      if (!hit && rec.status === 'unknown' && mine) {
        const guesses = mine.filter((p) => p.dueAt === rec.dueAt && rec.text && norm(p.text) === norm(rec.text));
        if (guesses.length === 1) {
          hit = guesses[0];
          Object.assign(rec, { status: 'created', bufferId: hit.id, resolvedBy: 'status', account: name });
          delete rec.error;
          changed = true;
        }
      }
      const verdict = !mine ? `account "${name}" is not set up (see accounts.json)`
        : hit ? `in Buffer (${hit.listedAs})`
          : failed.has(name) ? `could not list account "${name}"; check Buffer by hand`
            : rec.status === 'unknown' ? 'UNKNOWN: not found; check Buffer by hand'
              : 'not in the scheduled/draft lists (published, deleted, or on a later page)';
      rows.push([postId, network, ...(multi ? [name] : []), rec.mode, rec.bufferId ?? '-', verdict]);
    }
  }
  if (changed) saveState();
  log(`\nLocal state (${rows.length} records):`);
  log(rows.length ? table(['post', 'channel', ...(multi ? ['account'] : []), 'mode', 'buffer id', 'in Buffer?'], rows) : '(nothing pushed yet)');
  return { remote: [...remote.values()].flat(), rows };
}
