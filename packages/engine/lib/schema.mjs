// `check`: key test, organizations, channels, GraphQL introspection and mismatch detection.
import path from 'node:path';
import { ROOT, table, writeJson } from './core.mjs';
import { NETWORKS } from './networks.mjs';
import { LEGACY_ACCOUNT } from './accounts.mjs';

const R = 'kind name ofType { kind name ofType { kind name ofType { kind name } } }';
const TYPE_FIELDS = `name kind
  inputFields { name defaultValue type { ${R} } }
  fields { name args { name type { ${R} } } type { ${R} } }
  enumValues { name }`;

export const unwrap = (t) => (t?.ofType ? unwrap(t.ofType) : t);
const isRequired = (f) => f.type?.kind === 'NON_NULL' && (f.defaultValue === null || f.defaultValue === undefined);

export async function introspect(client, names) {
  const wanted = [...new Set(names)];
  if (!wanted.length) return {};
  const body = wanted.map((n, i) => `t${i}: __type(name: ${JSON.stringify(n)}) { ${TYPE_FIELDS} }`).join('\n');
  const data = await client.gql(`query { ${body} }`);
  return Object.fromEntries(wanted.map((n, i) => [n, data[`t${i}`] ?? null]));
}

// What the tool sends, per input type, and which enum values it relies on.
export function expectations({ facebookTypes = ['post'], image = 'ImageAssetInput', video = 'VideoAssetInput' } = {}) {
  return {
    inputs: {
      CreatePostInput: ['text', 'channelId', 'schedulingType', 'mode', 'dueAt', 'assets', 'metadata', 'saveToDraft'],
      AssetInput: ['image', 'video'],
      [image]: ['url'],
      [video]: ['url', 'metadata'],
      PostInputMetaData: ['instagram', 'facebook', 'linkedin'],
      InstagramPostMetadataInput: ['type', 'shouldShareToFeed', 'firstComment'],
      FacebookPostMetadataInput: ['type', 'firstComment'],
      LinkedInPostMetadataInput: ['firstComment'],
    },
    enums: {
      ShareMode: ['customScheduled'],
      SchedulingType: ['automatic'],
      PostType: ['post', 'reel', 'story', 'carousel'],
      PostTypeFacebook: facebookTypes,
    },
  };
}

// Returns human-readable mismatches between what we send and what the schema says.
export function compareSchema(types, exp) {
  const out = [];
  for (const [name, sent] of Object.entries(exp.inputs)) {
    const t = types[name];
    if (!t) { out.push(`type ${name} not found in the schema`); continue; }
    const have = new Map((t.inputFields ?? []).map((f) => [f.name, f]));
    for (const s of sent) if (!have.has(s)) out.push(`${name}: field "${s}" is sent but does not exist`);
    for (const f of have.values()) if (isRequired(f) && !sent.includes(f.name)) out.push(`${name}: required field "${f.name}" is not sent`);
  }
  for (const [name, values] of Object.entries(exp.enums)) {
    const t = types[name];
    if (!t) { out.push(`enum ${name} not found in the schema`); continue; }
    const have = (t.enumValues ?? []).map((v) => v.name);
    for (const v of values) if (!have.includes(v)) out.push(`${name}: value "${v}" is used but the enum has [${have.join(', ')}]`);
  }
  return out;
}

const typeSummary = (t) => (t.enumValues
  ? `${t.name} = ${t.enumValues.map((v) => v.name).join(' | ')}`
  : `${t.name}: ${(t.inputFields ?? t.fields ?? []).map((f) => f.name + (isRequired(f) ? '!' : '')).join(', ')}`);

// Buffer's name for X is unverified ("twitter" in older docs); both spellings are matched.
const serviceMatches = (service, network) => {
  const s = String(service ?? '').toLowerCase();
  return network === 'x' ? s === 'x' || s.includes('twitter') : s.includes(network);
};

export function suggestChannels(channels) {
  const out = {};
  for (const c of channels) {
    const net = NETWORKS.find((n) => serviceMatches(c.service, n));
    if (net && !out[net]) out[net] = c.id;
  }
  return out;
}

// What one account holds, by network, for the routing suggestion and the misrouting report.
async function listAccount({ name, client, orgId }, log, multi) {
  const title = multi ? `Account "${name}"` : 'Buffer';
  const acct = await client.gql('query { account { organizations { id name } } }');
  const orgs = acct?.account?.organizations ?? [];
  log(multi ? `${title}: the key works.\n` : 'The key works.\n');
  log(`Organizations${multi ? ` of "${name}"` : ''} (${orgs.length}):`);
  log(table(['id', 'name'], orgs.map((o) => [o.id, o.name])));
  const org = orgId || (orgs.length === 1 ? orgs[0].id : null);
  let channels = [];
  if (!org) log(`\nSeveral organizations: set ${multi ? `"organizationId" for "${name}" in accounts.json` : 'BUFFER_ORG_ID'} to choose one, then run check again for channels.`);
  else {
    const data = await client.gql(`query { channels(input: { organizationId: ${JSON.stringify(org)} }) { id name displayName service isQueuePaused } }`);
    channels = data?.channels ?? [];
    log(`\nChannels in ${org}${multi ? ` (account "${name}")` : ''} (${channels.length}):`);
    log(table(['id', 'service', 'name', 'display name', 'queue paused'], channels.map((c) => [c.id, c.service, c.name, c.displayName, c.isQueuePaused])));
  }
  return { name, orgs, org, channels };
}

// Channels routed to an account that does not hold them, and routes with no channel yet.
export function routingProblems(routing, held) {
  const problems = [];
  for (const [network, route] of Object.entries(routing)) {
    if (!route.channelId) continue;
    const mine = held.get(route.account);
    if (!mine) continue; // that account could not be read; the failure was reported already
    if (mine.some((c) => c.id === route.channelId)) continue;
    const other = [...held].find(([name, list]) => name !== route.account && list.some((c) => c.id === route.channelId));
    problems.push(other
      ? `${network}: channel ${route.channelId} is routed to account "${route.account}" but account "${other[0]}" holds it`
      : `${network}: channel ${route.channelId} is not in account "${route.account}" (nor in any account that could be read)`);
  }
  return problems;
}

// `accounts`: [{ name, client, orgId }]. One account behaves like the original single-key check.
export async function runCheckAccounts({ accounts, routing = {}, facebookTypes, log, root = ROOT }) {
  const multi = accounts.length > 1 || accounts[0]?.name !== LEGACY_ACCOUNT;
  const held = new Map();
  const failures = [];
  let firstClient = null;
  const allChannels = [];
  for (const acc of accounts) {
    try {
      const r = await listAccount(acc, log, multi);
      held.set(acc.name, r.channels);
      allChannels.push(...r.channels.map((c) => ({ ...c, account: acc.name })));
      firstClient ??= acc.client;
      if (multi) log('');
    } catch (e) {
      failures.push(`account "${acc.name}": ${e.message}`);
      log(`\nAccount "${acc.name}": check FAILED: ${e.message}\n`);
    }
  }
  if (!firstClient) {
    return { mismatches: [], discovered: null, channels: [], failures, routingProblems: [] };
  }

  if (!multi) {
    const sug = suggestChannels(allChannels);
    log('\nSuggested channels.json (check each one is the right account):');
    log(JSON.stringify(Object.fromEntries(NETWORKS.map((n) => [n, sug[n] ?? ''])), null, 2));
  } else {
    const sug = {};
    for (const n of NETWORKS) {
      const hit = allChannels.find((c) => serviceMatches(c.service, n));
      if (hit) sug[n] = { account: hit.account, channelId: hit.id };
    }
    log('Suggested routing for accounts.json (check each channel is the right profile):');
    log(JSON.stringify({ routing: Object.fromEntries(NETWORKS.map((n) => [n, sug[n] ?? { account: '', channelId: '' }])) }, null, 2));
  }
  const misrouted = routingProblems(routing, held);
  if (multi) log(misrouted.length ? `\nROUTING PROBLEMS:\n${misrouted.map((m) => `  - ${m}`).join('\n')}` : '\nRouting: every channel in accounts.json is held by the account it is routed to.');

  // The schema is the same API for every account, so it is read once, with the first account that worked.
  const schema = await checkSchema({ client: firstClient, facebookTypes, log, root });
  return { ...schema, channels: allChannels, failures, routingProblems: misrouted };
}

export async function runCheck({ client, orgId, facebookTypes, log, root = ROOT }) {
  return runCheckAccounts({ accounts: [{ name: LEGACY_ACCOUNT, client, orgId }], facebookTypes, log, root });
}

async function checkSchema({ client, facebookTypes, log, root }) {
  // Round 1: the fixed names from the docs. Round 2: names we can only learn from round 1.
  const fixed = ['CreatePostInput', 'AssetInput', 'PostInputMetaData', 'InstagramPostMetadataInput', 'FacebookPostMetadataInput', 'LinkedInPostMetadataInput', 'ShareMode', 'SchedulingType', 'PostType', 'PostTypeFacebook', 'Query', 'Mutation', 'Channel'];
  const types = await introspect(client, fixed);
  const assetField = (n) => unwrap((types.AssetInput?.inputFields ?? []).find((f) => f.name === n)?.type)?.name;
  const image = assetField('image') ?? 'ImageAssetInput';
  const video = assetField('video') ?? 'VideoAssetInput';
  Object.assign(types, await introspect(client, [image, video]));
  const videoMeta = unwrap((types[video]?.inputFields ?? []).find((f) => f.name === 'metadata')?.type)?.name;
  const postsInput = unwrap((types.Query?.fields ?? []).find((f) => f.name === 'posts')?.args?.find((a) => a.name === 'input')?.type)?.name;
  const serviceType = unwrap((types.Channel?.fields ?? []).find((f) => f.name === 'service')?.type)?.name;
  Object.assign(types, await introspect(client, [videoMeta, postsInput, serviceType].filter(Boolean)));
  const filterType = unwrap((types[postsInput]?.inputFields ?? []).find((f) => f.name === 'filter')?.type)?.name;
  if (filterType) Object.assign(types, await introspect(client, [filterType]));
  const statusType = unwrap((types[filterType]?.inputFields ?? []).find((f) => f.name === 'status')?.type)?.name;
  if (statusType) Object.assign(types, await introspect(client, [statusType]));

  const enumNames = (n) => (types[n]?.enumValues ?? []).map((v) => v.name);
  const mutations = (types.Mutation?.fields ?? []).map((f) => f.name).filter((n) => /post/i.test(n));
  const discovered = {
    imageInput: image, videoInput: video, postStatusEnum: statusType ?? null, postStatusValues: enumNames(statusType),
    serviceEnum: serviceType ?? null, serviceValues: enumNames(serviceType),
    altTextFields: (types[image]?.inputFields ?? []).map((f) => f.name).filter((n) => /alt|description/i.test(n)),
    postMutations: mutations,
  };
  const mismatches = compareSchema(types, expectations({ facebookTypes, image, video }));

  log('\nSchema (! = required):');
  for (const n of [...fixed.filter((n) => !['Query', 'Mutation', 'Channel'].includes(n)), image, video, videoMeta, statusType, serviceType]) {
    if (n) log('  ' + (types[n] ? typeSummary(types[n]) : `${n}: NOT FOUND`));
  }
  log(`\nMutations containing "post": ${mutations.join(', ') || '(none)'}`);
  log(`Post status values: ${discovered.postStatusValues.join(', ') || 'unknown'}   Service values: ${discovered.serviceValues.join(', ') || 'unknown (see channel list above)'}`);
  log(`Alt text field on images: ${discovered.altTextFields.join(', ') || 'none found'}`);
  log(mismatches.length ? `\nMISMATCHES (the tool would send something Buffer will reject):\n${mismatches.map((m) => `  - ${m}`).join('\n')}` : '\nMismatches: none');

  const trimmed = Object.fromEntries(Object.entries(types).filter(([n]) => !['Query', 'Mutation', 'Channel'].includes(n)));
  writeJson(path.join(root, 'schema-cache.json'), { fetchedAt: new Date().toISOString(), types: trimmed, discovered, mismatches });
  log('\nSaved schema-cache.json');
  return { mismatches, discovered };
}
