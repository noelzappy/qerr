// node --test   The brand pack: BRAND_DIR picks the folder with brand.json, the logos and the optional map, vault and prompts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_BRAND_DIR, ROOT, brandDir, brandFile } from './lib/core.mjs';
import { loadBrand, loadSeries, validateBrand } from './lib/design/brand.mjs';
import { lintText } from './lib/design/lint.mjs';
import { lbl } from './design/templates/editorial.mjs';

const good = () => JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));

const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ss-brand-'));

test('without BRAND_DIR the default pack is used, and it is a complete brand', () => {
  assert.equal(brandDir({ env: {} }), path.join(ROOT, DEFAULT_BRAND_DIR));
  assert.equal(brandFile('brand.json', { env: {} }), path.join(ROOT, DEFAULT_BRAND_DIR, 'brand.json'));
  const brand = loadBrand();
  assert.ok(brand.name && brand.logoFullSrc.startsWith('data:image/png;base64,') && brand.logoMarkSrc.startsWith('data:image/png;base64,'));
  assert.ok(loadSeries().length > 0);
});

test('BRAND_DIR comes from the environment or .env (the environment wins), relative to the repository root', () => {
  const root = tmpRoot();
  try {
    assert.equal(brandDir({ root, env: { BRAND_DIR: 'brands/acme' } }), path.join(root, 'brands', 'acme'));
    fs.writeFileSync(path.join(root, '.env'), 'BRAND_DIR=brands/from-file\n');
    assert.equal(brandDir({ root, env: {} }), path.join(root, 'brands', 'from-file'));
    assert.equal(brandDir({ root, env: { BRAND_DIR: 'brands/acme' } }), path.join(root, 'brands', 'acme'));
    assert.equal(brandDir({ root, env: { BRAND_DIR: '  ' } }), path.join(root, 'brands', 'from-file'), 'a blank value falls back');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('BRAND_DIR must stay inside the repository', () => {
  for (const bad of ['..', '../elsewhere', '/etc', 'brands/../../x', '.']) {
    assert.throws(() => brandDir({ root: ROOT, env: { BRAND_DIR: bad } }), /inside the repository/, bad);
  }
});

test('a missing brand pack says which file is missing and how to choose a pack', () => {
  assert.throws(() => loadBrand({ file: brandFile('brand.json', { env: { BRAND_DIR: 'brands/does-not-exist' } }) }), /brand file not found: brands\/does-not-exist\/brand.json \(set BRAND_DIR/);
});

test('brand.json: timezone and money are optional, and checked when present', () => {
  const problems = (f) => { const b = good(); f(b); return validateBrand(b).join('\n'); };
  assert.equal(problems((b) => { delete b.timezone; delete b.money; }), '');
  assert.equal(problems((b) => { b.timezone = 'Europe/London'; b.money = { local: 'Our money is the pound', foreign: '\\$|€' }; }), '');
  assert.match(problems((b) => { b.timezone = 'Mars/Olympus'; }), /timezone must be an IANA time zone/);
  assert.match(problems((b) => { b.money = 'euro'; }), /money must be an object/);
  assert.match(problems((b) => { b.money = { local: '', foreign: '\\$' }; }), /money.local/);
  assert.match(problems((b) => { b.money = { local: 'x', foreign: '(' }; }), /money.foreign must be a pattern/);
});

test('brand.json: the voice, language, visual direction and reference briefs are optional texts for the AI', () => {
  const problems = (f) => { const b = good(); f(b); return validateBrand(b).join('\n'); };
  assert.equal(problems((b) => { b.voice = 'Warm.'; b.language = 'American English'; b.visualDirection = 'Quiet.'; b.references = ['Pastel grounds']; }), '');
  assert.match(problems((b) => { b.voice = 'x'.repeat(4001); }), /voice must be a text/);
  assert.match(problems((b) => { b.language = 7; }), /language must be a text/);
  assert.match(problems((b) => { b.references = 'one'; }), /references must be a list/);
  assert.match(problems((b) => { b.references = ['']; }), /references must be a list/);
  assert.match(problems((b) => { b.references = Array(25).fill('x'); }), /references must be a list/);
});

test('web addresses are left alone by the spelling rules, whatever the brand\'s domain', () => {
  const brand = { spelling: [{ wrong: 'Acmesavings', flags: 'i', right: 'AcmeSavings' }] };
  const w = (t) => lintText([{ field: 'sub', text: t }], 'feed', { ...brand, lint: good().lint });
  assert.deepEqual(w('See acmesavings.example.com/start today').filter((x) => /should be written/.test(x)), []);
  assert.deepEqual(w('See https://acmesavings.example.org/a?b=1').filter((x) => /should be written/.test(x)), []);
  assert.match(w('Acmesavings is here').join('\n'), /"Acmesavings" should be written "AcmeSavings"/);
});

test('mono labels keep the case of camel-cased names and web addresses, and upper-case the rest', () => {
  assert.match(lbl('About AcmeSavings'), /class="lbl n"/);
  assert.match(lbl('Watch on YouTube'), /class="lbl n"/);
  assert.match(lbl('acme.example.com'), /class="lbl n"/);
  assert.match(lbl('The numbers'), /class="lbl"/);
  assert.match(lbl('MYTH'), /class="lbl"/);
});
