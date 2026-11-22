#!/usr/bin/env node
// node scripts/export-public.mjs <out-dir> [--ref <git ref>]
//
// Writes the public copy of this repository into a new folder, ready to become the first commit of the public repository.
// It copies the files of a commit (HEAD by default; uncommitted changes never leave), leaves out every brand pack except
// the fictional public ones (brands/<name>/ for any name not in PUBLIC_PACKS), then scans what it wrote:
//   - for the words each left-out pack lists in its export-forbid.txt (one per line, # for comments; case is ignored),
//   - for strings shaped like real secrets (private keys, AWS access keys, provider API keys).
// Any finding is printed as file:line and the exit code is 1: do not publish until the scan is clean. The folder is kept so
// you can look. Nothing is pushed or committed; the commands for that are printed at the end.
// Standard library and git only, like the rest of the engine.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The packs that may be published: fictional brands only (no real company, person, place or amount). demo is the default
// pack (Acme Savings); pennyhive is the fictional finance test brand (Pennyhive); kettleworks (Kettleworks Coffee, a café) and
// saltandember (Salt & Ember, a grill restaurant) are the fictional brands of the roast and plate looks.
export const PUBLIC_PACKS = ['demo', 'pennyhive', 'kettleworks', 'saltandember'];

// Strings shaped like real secrets. Test fixtures use obvious fakes (sk-ant-TESTKEY..., AWS's documented example key), which
// these patterns do not match.
export const SECRET_PATTERNS = [
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'AWS access key', re: /\b(?:AKIA|ASIA)(?!IOSFODNN7EXAMPLE)[0-9A-Z]{16}\b/ },
  { name: 'Anthropic API key', re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI-style API key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{40,}\b/ },
  { name: 'OpenRouter API key', re: /\bsk-or-v1-[a-f0-9]{40,}\b/ },
  { name: 'GitHub token', re: /\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{30,}\b/ },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
];

const git = (root, args, opts = {}) => execFileSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024, ...opts });

// The files of a commit, as paths relative to the repository root.
export function trackedFiles(root, ref) {
  return git(root, ['ls-tree', '-r', '-z', '--name-only', ref]).toString('utf8').split('\0').filter(Boolean);
}

// A path inside brands/<name>/ for a pack that is not public.
export const isPrivatePack = (file) => { const m = /^brands\/([^/]+)\//.exec(file); return !!m && !PUBLIC_PACKS.includes(m[1]); };

export function packsOf(files) {
  return [...new Set(files.map((f) => /^brands\/([^/]+)\//.exec(f)?.[1]).filter(Boolean))];
}

// The forbidden words a private pack lists, read from the commit (not the working tree).
export function forbiddenWords(root, ref, files) {
  const words = new Set();
  for (const f of files.filter((x) => isPrivatePack(x) && x.endsWith('/export-forbid.txt'))) {
    for (const line of git(root, ['show', `${ref}:${f}`]).toString('utf8').split(/\r?\n/)) {
      const w = line.replace(/#.*$/, '').trim();
      if (w) words.add(w);
    }
  }
  return [...words];
}

const isText = (buf) => !buf.subarray(0, 8000).includes(0);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Findings in one file's text: { line, what }.
export function scanText(text, words) {
  const found = [];
  const wordRes = words.map((w) => ({ w, re: new RegExp(escapeRe(w), 'i') }));
  text.split(/\r?\n/).forEach((line, i) => {
    for (const { w, re } of wordRes) if (re.test(line)) found.push({ line: i + 1, what: `forbidden word "${w}"` });
    for (const { name, re } of SECRET_PATTERNS) if (re.test(line)) found.push({ line: i + 1, what: `looks like a ${name}` });
  });
  return found;
}

export function exportPublic({ root, out, ref = 'HEAD', log = console.log }) {
  if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error(`${out} exists and is not empty; choose a new folder`);
  const all = trackedFiles(root, ref);
  const keep = all.filter((f) => !isPrivatePack(f));
  const left = packsOf(all).filter((p) => !PUBLIC_PACKS.includes(p));
  const words = forbiddenWords(root, ref, all);
  const findings = [];
  for (const f of keep) {
    const buf = git(root, ['show', `${ref}:${f}`]);
    const dest = path.join(out, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    const mode = git(root, ['ls-tree', ref, '--', f]).toString('utf8').split(/\s/)[0];
    if (mode === '100755') fs.chmodSync(dest, 0o755);
    if (isText(buf)) for (const x of scanText(buf.toString('utf8'), words)) findings.push({ file: f, ...x });
  }
  log(`Copied ${keep.length} of ${all.length} files from ${ref} into ${out}.`);
  log(left.length ? `Left out the private brand pack(s): ${left.map((p) => `brands/${p}/`).join(', ')}.` : 'There was no private brand pack to leave out.');
  if (left.length && !words.length) log('Warning: no left-out pack has an export-forbid.txt, so only secret-shaped strings were scanned for.');
  return { copied: keep.length, total: all.length, leftOut: left, words, findings };
}

async function main(argv) {
  const args = argv.slice(2);
  const refAt = args.indexOf('--ref');
  const ref = refAt >= 0 ? args[refAt + 1] : 'HEAD';
  const outArg = args.filter((a, i) => !a.startsWith('--') && (refAt < 0 || (i !== refAt + 1)))[0];
  if (!outArg || args.includes('--help') || args.includes('-h') || (refAt >= 0 && !ref)) {
    console.log(`Usage: node scripts/export-public.mjs <out-dir> [--ref <git ref>]\n\nWrites the public copy of the repository (every brand pack but the fictional ${PUBLIC_PACKS.map((p) => `brands/${p}`).join(' and ')} left out) and scans it.`);
    return outArg ? 0 : 1;
  }
  const root = git(path.dirname(fileURLToPath(import.meta.url)), ['rev-parse', '--show-toplevel']).toString('utf8').trim();
  const out = path.resolve(outArg);
  const inside = path.relative(root, out);
  if (!inside.startsWith('..') && !path.isAbsolute(inside)) throw new Error('choose an output folder outside this repository');
  const r = exportPublic({ root, out, ref });
  if (r.findings.length) {
    console.log(`\n${r.findings.length} finding(s); do not publish until these are gone:`);
    for (const f of r.findings) console.log(`  ${f.file}:${f.line}  ${f.what}`);
    return 1;
  }
  console.log('\nThe scan is clean. To make the first commit of the public repository:');
  console.log(`  cd ${out}\n  git init -b main\n  git add -A\n  git commit -m "Initial public release"`);
  console.log('Set the author name and email you want to publish first (git config user.name / user.email in that folder).');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv).then((code) => process.exit(code), (e) => { console.error(`export-public: ${e.message}`); process.exit(2); });
}
