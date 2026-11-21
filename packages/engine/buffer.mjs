#!/usr/bin/env node
// Schedules a batch of social posts into Buffer. See README.md.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadConfig, loadEnv, maskSecrets, readJson, table, writeJson } from './lib/core.mjs';
import { createClient, probeMedia } from './lib/client.mjs';
import { BatchError, buildRequest, loadBatch, resolveItems } from './lib/batch.mjs';
import { NETWORKS } from './lib/networks.mjs';
import { ConfigError, collectSecrets, loadAccountsConfig, requireKey } from './lib/accounts.mjs';
import { describeAction, loadState, planRows, resolveOrg, runPush, runStatus, statePath } from './lib/push.mjs';
import { runCheckAccounts } from './lib/schema.mjs';
import { createS3, loadS3Config } from './lib/storage/s3.mjs';
import { UploadError, planUploads, runUpload } from './lib/storage/upload.mjs';
import { runDesign } from './lib/design/cli.mjs';

const USAGE = `Schedules a batch of social posts into Buffer (drafts by default).

Usage:
  npm run buffer -- check [batch.json]
  npm run buffer -- plan <batch.json> [--only <postId>] [--channel <name>]
  npm run buffer -- media <batch.json> [--verify] [--only <postId>] [--channel <name>]
  npm run buffer -- upload <batch.json> [--only <postId>] [--yes]
  npm run buffer -- push <batch.json> [--live] [--yes] [--only <postId>] [--channel <name>] [--force-new]
  npm run buffer -- status <batch.json>
  npm run buffer -- design <photo|card|stats|screen|carousel|page-cover|render|lint> ...   (make the images; see npm run design -- --help)
  npm run buffer -- help | --help | -h

Commands:
  check     Test each account's API key, list organizations and channels, check the routing, compare the Buffer schema with what this tool sends.
  plan      Show the table of posts and warnings, and write out/<name>-plan.json. No network, no key.
  media     List media files and their sizes. With --verify, HEAD-check each public URL. No key needed.
  upload    Put the batch's media into S3-compatible storage (S3_* in .env) and record the public URLs in state/. Without --yes it only lists.
  push      Create Buffer drafts. Without --yes it only prints what it would do.
  status    List what Buffer holds and compare it with state/<name>.json.
  design    Make the post images with headless Chrome, from your texts and pictures. Run: npm run buffer -- design --help

Flags:
  --yes         Actually send. Without it, push sends nothing.
  --live        Create scheduled posts instead of drafts. Needs --yes as well.
  --only ID     Only the post with this id.
  --channel N   Only one network: instagram, linkedin, facebook or x.
  --force-new   Create again a post that changed or has an unknown outcome (the old one stays in Buffer).
  --verify      With media: check each URL over the network.

Files: .env (keys, storage settings), accounts.json (several Buffer accounts and routing) or channels.json (one account), state/ (what was sent and uploaded), out/ (plans), schema-cache.json (from check).`;

function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only' || a === '--channel') flags[a.slice(2)] = argv[++i];
    else if (a.startsWith('--')) flags[a.slice(2)] = true;
    else pos.push(a);
  }
  return { flags, pos };
}

const readCache = () => readJson(path.join(ROOT, 'schema-cache.json'), null);
const dayFmt = (date, time) => `${new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })} ${time}`;
const mediaCell = (media) => (media.length ? `${media.length > 1 ? `${media.length}x ` : ''}${media[0].rel}${media.length > 1 ? '...' : ''}` : '(none)');

function printItems(items, extra, { accounts = false } = {}) {
  const rows = items.map((it, i) => [
    it.postId, dayFmt(it.date, it.time), it.dueAt.replace('T', ' ').slice(0, 16), it.network, ...(accounts ? [it.account ?? '(none)'] : []), it.type ?? '-',
    mediaCell(it.media), `${[...it.text].length}/${it.charLimit}`,
    ...(extra ? [extra[i]] : []),
  ]);
  console.log(table(['post', 'local', 'UTC', 'channel', ...(accounts ? ['account'] : []), 'type', 'media', 'caption', ...(extra ? ['action'] : [])], rows));
  const warned = items.filter((i) => i.warnings.length);
  if (warned.length) {
    console.log('\nWarnings:');
    for (const it of warned) for (const w of it.warnings) console.log(`  ${it.postId} / ${it.network}: ${w}`);
  }
}

function setup(file, flags) {
  const config = loadConfig();
  const cfg = loadAccountsConfig();
  const batch = loadBatch(file);
  const file_ = statePath(batch.name);
  const state = loadState(file_, batch.name);
  const items = resolveItems(batch, {
    routing: cfg.routing, accounts: cfg.accounts, mediaBaseUrl: config.mediaBaseUrl, uploaded: state.media,
    only: flags.only, network: flags.channel, schemaCache: readCache(),
  });
  if (flags.only && !batch.posts.some((p) => p.id === flags.only)) throw new Error(`no post with id "${flags.only}" in this batch`);
  if (flags.channel && !NETWORKS.includes(flags.channel)) throw new Error(`--channel must be one of ${NETWORKS.join(', ')}`);
  return { config, cfg, batch, items, state, stateFile: file_, multi: cfg.mode === 'accounts' };
}

// One Buffer client per account named in `names`. A missing key stops here, before anything is sent.
function clientsFor(cfg, names) {
  const clients = {};
  for (const name of names) {
    const account = cfg.accounts.find((a) => a.name === name);
    if (cfg.mode === 'legacy' && !account.apiKey) throw new Error('BUFFER_API_KEY is not set (put it in .env, see .env.example)');
    clients[name] = createClient({ apiKey: requireKey(account) });
  }
  return clients;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, pos } = parseArgs(rest);
  const log = (s) => console.log(s);

  if (!cmd || ['help', '--help', '-h'].includes(cmd)) { console.log(USAGE); return 0; }
  if (cmd === 'design') return runDesign(rest);

  if (cmd === 'check') {
    const cfg = loadAccountsConfig();
    const accounts = [];
    const unreadable = [];
    for (const a of cfg.accounts) {
      if (a.apiKey) accounts.push({ name: a.name, client: createClient({ apiKey: a.apiKey }), orgId: a.organizationId });
      else if (cfg.mode === 'legacy') throw new Error('BUFFER_API_KEY is not set (put it in .env, see .env.example)');
      else unreadable.push(`account "${a.name}": ${a.keyEnv} is not set in .env, so it was not checked`);
    }
    for (const u of unreadable) log(u);
    if (!accounts.length) return 1;
    const facebookTypes = pos[0] ? [...new Set(resolveItems(loadBatch(pos[0])).filter((i) => i.network === 'facebook').map((i) => i.type))] : ['post'];
    const r = await runCheckAccounts({ accounts, routing: cfg.mode === 'accounts' ? cfg.routing : {}, facebookTypes, log });
    return r.mismatches.length || r.failures.length || r.routingProblems.length || unreadable.length ? 1 : 0;
  }

  if (!pos[0] || !['plan', 'media', 'upload', 'push', 'status'].includes(cmd)) { console.log(USAGE); return 1; }

  if (cmd === 'plan') {
    const { batch, items, config, multi, cfg } = setup(pos[0], flags);
    console.log(`Batch ${batch.name}  timezone ${batch.timezone}  ${items.length} channel posts (no network used)`);
    if (multi) console.log(`Buffer accounts from accounts.json: ${cfg.accounts.map((a) => a.name).join(', ')} (channels.json is not used)`);
    const hosted = items.flatMap((i) => i.media).filter((m) => m.hosted === 'upload').length;
    if (hosted) console.log(`${hosted} media references use an uploaded URL from state/${batch.name}.json.`);
    if (!config.mediaBaseUrl && items.some((i) => i.media.some((m) => m.hosted === 'base-url'))) console.log('MEDIA_BASE_URL is not set; media URLs are shown as <MEDIA_BASE_URL>/<path>.');
    console.log('');
    printItems(items, undefined, { accounts: multi });
    const out = path.join(ROOT, 'out', `${batch.name}-plan.json`);
    writeJson(out, {
      batch: batch.name, timezone: batch.timezone, endpoint: 'POST https://api.buffer.com',
      note: 'Headers: Content-Type: application/json, Authorization: Bearer <BUFFER_API_KEY> (never stored here). "draft" is what push sends; "live" is what push --live sends.',
      requests: items.map((it) => ({ postId: it.postId, network: it.network, ...(multi ? { account: it.account } : {}), channelId: it.channelId, hash: it.hash, draft: buildRequest(it, { draft: true }), live: buildRequest(it, { draft: false }) })),
    });
    if (multi) {
      const per = {};
      for (const it of items) per[it.account ?? '(no route)'] = (per[it.account ?? '(no route)'] ?? 0) + 1;
      console.log(`\nBuffer requests needed: ${items.length} creates (${Object.entries(per).map(([a, n]) => `${a}: ${n}`).join(', ')}); the free plan allows 150 per 15 minutes per account.`);
    } else console.log(`\nBuffer requests needed: ${items.length} creates (the free plan allows 150 per 15 minutes).`);
    console.log(`Wrote ${path.relative(process.cwd(), out)}`);
    return 0;
  }

  if (cmd === 'media') {
    const { batch, items } = setup(pos[0], flags);
    const files = new Map();
    for (const it of items) for (const m of it.media) files.set(m.rel, m);
    const rows = [];
    let bad = 0;
    for (const m of files.values()) {
      const size = fs.existsSync(m.abs) ? `${(fs.statSync(m.abs).size / 1048576).toFixed(2)} MB` : 'MISSING';
      let verdict = '';
      if (size === 'MISSING') bad++;
      if (flags.verify) {
        if (m.url.startsWith('<')) { verdict = 'MEDIA_BASE_URL not set'; bad++; } else {
          const p = await probeMedia(m.url);
          verdict = p.ok ? `ok (${p.type})` : `FAIL ${p.reason}`;
          if (!p.ok) bad++;
        }
      }
      rows.push([path.relative(ROOT, m.abs), size, m.url, ...(flags.verify ? [verdict] : [])]);
    }
    const uploaded = [...files.values()].filter((m) => m.hosted === 'upload').length;
    console.log(`Media for ${batch.name}: ${files.size} files, ${uploaded ? `${uploaded} at their uploaded URL, the rest ` : ''}to be hosted under the folder that MEDIA_BASE_URL points at.\n`);
    console.log(table(['local file', 'size', 'must be reachable at', ...(flags.verify ? ['check'] : [])], rows));
    return bad ? 1 : 0;
  }

  if (cmd === 'upload') {
    const { batch, items, state, stateFile } = setup(pos[0], { only: flags.only });
    const env = loadEnv();
    let config = null;
    let configError = null;
    try { config = loadS3Config(env); } catch (e) { configError = e; }
    const plan = planUploads({ batch, items, prefix: config?.prefix, publicBaseUrl: config?.publicBaseUrl });
    console.log(`Batch ${batch.name}: ${plan.length} media files to put in the bucket${config ? ` ${config.bucket} under ${config.prefix}${batch.name}/` : ''}\n`);
    console.log(table(['local file', 'size', 'type', 'key', 'public URL'], plan.map((f) => [f.rel, `${(f.size / 1048576).toFixed(2)} MB`, f.contentType, f.key, f.url ?? '(S3_PUBLIC_BASE_URL not set)'])));
    if (!flags.yes) {
      console.log(`\nNothing was uploaded. With --yes each file is checked in the bucket first and uploaded only when missing.${configError ? `\n${configError.message}` : ''}`);
      return 0;
    }
    if (configError) throw configError;
    const s3 = createS3({ config });
    const summary = await runUpload({ plan, s3, config, state, saveState: () => writeJson(stateFile, state), log });
    console.log(`\nDone: ${summary.uploaded} uploaded, ${summary.skipped} already there, ${summary.notPublic} not publicly readable. URLs are recorded in ${path.relative(process.cwd(), stateFile)}; push uses them from now on.`);
    if (summary.stopped) console.log(`STOPPED: ${summary.stopped}`);
    return summary.stopped || summary.notPublic ? 1 : 0;
  }

  if (cmd === 'status') {
    const { batch, cfg, state, stateFile } = setup(pos[0], flags);
    const wanted = new Set();
    for (const byNet of Object.values(state.posts)) for (const [network, rec] of Object.entries(byNet)) wanted.add(rec.account ?? cfg.routing[network]?.account);
    wanted.delete(undefined);
    const names = wanted.size ? [...wanted] : cfg.accounts.map((a) => a.name);
    const clients = clientsFor(cfg, names);
    const accounts = [];
    for (const name of names) accounts.push({ name, client: clients[name], orgId: await resolveOrg(clients[name], cfg.accounts.find((a) => a.name === name)?.organizationId) });
    await runStatus({ accounts, accountOf: (network) => cfg.routing[network]?.account, state, saveState: () => writeJson(stateFile, state), log });
    return 0;
  }

  // push
  const live = !!flags.live;
  const { batch, config, cfg, items, state, stateFile, multi } = setup(pos[0], flags);
  const rows = planRows(items, state, { live, forceNew: !!flags['force-new'] });
  console.log(`Batch ${batch.name}: ${live ? 'LIVE, posts will be scheduled' : 'DRAFTS, nothing will publish'}\n`);
  printItems(items, rows.map(describeAction), { accounts: multi });
  const todoRows = rows.filter((r) => r.action === 'create');
  const todo = todoRows.length;
  if (!flags.yes) {
    console.log(`\nNothing was sent. ${todo} request(s) would be made. Add --yes to send.`);
    return 0;
  }
  const names = [...new Set(todoRows.map((r) => r.item.account).filter(Boolean))];
  if (!names.length && cfg.mode === 'legacy' && !cfg.accounts[0].apiKey) throw new Error('BUFFER_API_KEY is not set (put it in .env, see .env.example)');
  const clients = clientsFor(cfg, names);
  const unhosted = todoRows.flatMap((r) => r.item.media).filter((m) => m.url.startsWith('<'));
  if (unhosted.length) throw new Error('MEDIA_BASE_URL is not set and the media has not been uploaded, so Buffer would get no usable media links (set MEDIA_BASE_URL, or run "upload")');
  if (!todo) { console.log('\nNothing to create.'); return 0; }
  const summary = await runPush({ rows, ...(multi ? { clients } : { client: clients[names[0]] }), state, saveState: () => writeJson(stateFile, state), live, fetchImpl: globalThis.fetch, log });
  const requests = Object.values(clients).reduce((n, c) => n + c.requestCount, 0);
  console.log(`\nDone: ${summary.created} created, ${summary.skipped} skipped, ${summary.refused} refused, ${summary.failed} failed, ${summary.unknown} unknown. ${requests} Buffer requests.`);
  if (multi) {
    for (const [name, a] of Object.entries(summary.byAccount)) {
      console.log(`  account "${name}": ${a.created} created, ${a.skipped} skipped, ${a.refused} refused, ${a.failed} failed, ${a.unknown} unknown, ${a.notAttempted} not sent${clients[name] ? `, ${clients[name].requestCount} requests` : ''}`);
    }
  }
  if (summary.stopped) console.log(`STOPPED: ${summary.stopped}${summary.notAttempted.length ? `\n${summary.notAttempted.length} item(s) were not sent; run push again after fixing the cause (finished items are skipped).` : ''}`);
  return summary.stopped || summary.refused ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }, (e) => {
  const plain = e instanceof BatchError || e instanceof ConfigError || e instanceof UploadError;
  console.error(maskSecrets(plain ? e.message : `Error: ${e.message}`, collectSecrets()));
  process.exitCode = 1;
});
