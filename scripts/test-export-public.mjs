// node --test   scripts/export-public.mjs: the public copy leaves out private brand packs and refuses to look clean when a
// private word or a secret-shaped string is left behind.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { exportPublic, scanText, isPrivatePack } from './export-public.mjs';

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-export-'));
  const g = (...a) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...a], { cwd: root });
  g('init', '-q', '-b', 'main');
  for (const [f, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), text); }
  g('add', '-A'); g('commit', '-q', '-m', 'files');
  return root;
}

const FILES = {
  'README.md': 'A tool for any brand.\n',
  'brands/demo/brand.json': '{"name":"Acme Savings"}\n',
  'brands/globex/brand.json': '{"name":"Globex"}\n',
  'brands/globex/export-forbid.txt': '# words that must not leave\nGlobex\nglobex.example\n',
  'brands/globex/vault.json': '{"secret plans": true}\n',
};

test('private packs are left out, the demo pack and everything else are copied byte for byte', () => {
  const root = repo(FILES);
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ss-out-')), 'public');
  try {
    const r = exportPublic({ root, out, log() {} });
    assert.deepEqual(r.leftOut, ['globex']);
    assert.equal(r.copied, 2);
    assert.deepEqual(r.findings, []);
    assert.equal(fs.readFileSync(path.join(out, 'README.md'), 'utf8'), FILES['README.md']);
    assert.ok(fs.existsSync(path.join(out, 'brands/demo/brand.json')));
    assert.ok(!fs.existsSync(path.join(out, 'brands/globex')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(path.dirname(out), { recursive: true, force: true }); }
});

test('the fictional Pennyhive and Tallyho packs are public like the demo, and a private pack is still left out', () => {
  const root = repo({ ...FILES, 'brands/pennyhive/brand.json': '{"name":"Pennyhive"}\n', 'brands/pennyhive/logos/logo-mark.svg': '<svg/>\n', 'brands/tallyho/brand.json': '{"name":"Tallyho"}\n' });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ss-out-')), 'public');
  try {
    const r = exportPublic({ root, out, log() {} });
    assert.deepEqual(r.leftOut, ['globex']);
    assert.deepEqual(r.findings, []);
    assert.ok(fs.existsSync(path.join(out, 'brands/pennyhive/brand.json')));
    assert.ok(fs.existsSync(path.join(out, 'brands/pennyhive/logos/logo-mark.svg')));
    assert.ok(!fs.existsSync(path.join(out, 'brands/globex')));
    assert.equal(isPrivatePack('brands/pennyhive/brand.json'), false);
    assert.ok(fs.existsSync(path.join(out, 'brands/tallyho/brand.json')));
    assert.equal(isPrivatePack('brands/tallyho/brand.json'), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(path.dirname(out), { recursive: true, force: true }); }
});

test('a forbidden word or a secret-shaped string outside the private pack is reported with its file and line', () => {
  const root = repo({ ...FILES, 'docs/guide.md': 'Intro\nDeploy to social.GLOBEX.example\n', 'src/config.mjs': `const key = 'sk-ant-api03-${'a'.repeat(40)}';\n` });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ss-out-')), 'public');
  try {
    const r = exportPublic({ root, out, log() {} });
    const seen = r.findings.map((f) => `${f.file}:${f.line} ${f.what}`);
    assert.ok(seen.includes('docs/guide.md:2 forbidden word "Globex"'), seen.join('\n'));
    assert.ok(seen.includes('docs/guide.md:2 forbidden word "globex.example"'), seen.join('\n'));
    assert.ok(seen.includes('src/config.mjs:1 looks like a Anthropic API key'), seen.join('\n'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(path.dirname(out), { recursive: true, force: true }); }
});

test('uncommitted changes never leave, and an output folder that is not empty is refused', () => {
  const root = repo(FILES);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-out-'));
  try {
    fs.writeFileSync(path.join(root, 'README.md'), 'Globex draft, not committed\n');
    const r = exportPublic({ root, out: path.join(parent, 'public'), log() {} });
    assert.deepEqual(r.findings, []);
    assert.equal(fs.readFileSync(path.join(parent, 'public', 'README.md'), 'utf8'), FILES['README.md']);
    assert.throws(() => exportPublic({ root, out: path.join(parent, 'public'), log() {} }), /not empty/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(parent, { recursive: true, force: true }); }
});

test('test fixtures\' fake keys are not reported, real-looking ones are', () => {
  assert.deepEqual(scanText("const KEY = 'sk-ant-TESTKEY-1234567890abcdef'; const id = 'AKIAIOSFODNN7EXAMPLE';", []), []);
  assert.equal(scanText('AKIA' + 'Q'.repeat(16), [])[0].what, 'looks like a AWS access key');
  assert.equal(scanText(['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' '), [])[0].what, 'looks like a private key');
  assert.equal(isPrivatePack('brands/demo/brand.json'), false);
  assert.equal(isPrivatePack('brands/acme/brand.json'), true);
  assert.equal(isPrivatePack('brands.md'), false);
});
