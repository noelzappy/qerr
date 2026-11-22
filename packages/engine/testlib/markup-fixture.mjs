// The built-in layouts' markup, recorded: a sha256 of each page the built-in tests draw, so that a change to a built-in layout
// (lib/design/builtin/*.mjs) or to a page's drawings shows up as a failing test. The hashes were first taken from the template
// functions the layouts replaced (design/templates/*.mjs before they were removed), so the layouts still draw exactly what those
// drew. The fixture holds no markup, no picture and no data: URI: per group, an id (a hash of what the case is: its spec, style,
// carousel page and picture size) and the hash of the pages drawn for it.
//
//   const fx = markupFixture('poster');
//   fx.check({ s, style, counter }, pages, 'object h *x*');   in a test: the pages for that case are the recorded ones
//   test('the markup fixture ...', () => fx.done());          last: every recorded case of the group was checked
//
// When a change of look is intended, record the fixture again and review the pictures (testlib/template-baseline.mjs):
//   VESK_RECORD_MARKUP=1 npm test --workspace @vesk/engine
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE_FILE = fileURLToPath(new URL('./builtin-markup.json', import.meta.url));
// A fixture file of another family (the retail direction's: testlib/retail-markup.json) is its own file with its own record switch, so
// recording one never rewrites the other: markupFixture(group, { file, recordEnv }).
export const RETAIL_FIXTURE_FILE = fileURLToPath(new URL('./retail-markup.json', import.meta.url));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const readFile = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {});

// The markup of a direction page, as it is compared: ONLY volatile ids are normalised, nothing else is touched.
//  - the value of every id="..." attribute becomes "~", and every same-document reference to one (href="#...", url(#...)) becomes "#~":
//    an id is a name the code generates, not part of what the page draws, so a renamed id must not fail the fixture;
//  - with { noEl: true } the data-el="2.0" addresses are dropped too (the index path a builder's element gets, kit.mjs numberElements),
//    for a data version that numbers its elements differently.
// Everything else (every style, class, data- attribute, word and number) is compared exactly.
export function stableMarkup(html, { noEl = false } = {}) {
  let out = String(html).replace(/(\sid=)"[^"]*"/g, '$1"~"').replace(/(\shref=)"#[^"]*"/g, '$1"#~"').replace(/url\(#[^)]*\)/g, 'url(#~)');
  if (noEl) out = out.replace(/\sdata-el="[^"]*"/g, '');
  return out;
}

// A case's id: a readable name as it is (the harness's "<style>/<file>"), anything else by its hash.
export const caseId = (identity) => (typeof identity === 'string' ? identity : sha(JSON.stringify(identity)).slice(0, 16));
export const markupHash = (pages) => sha(typeof pages === 'string' ? pages : JSON.stringify(pages));

export function markupFixture(group, { file = FIXTURE_FILE, recordEnv = 'VESK_RECORD_MARKUP' } = {}) {
  const RECORD = process.env[recordEnv] === '1', read = () => readFile(file), where = path.basename(file);
  const want = read()[group] ?? {};
  const got = {};
  return {
    check(identity, pages, message = caseId(identity)) {
      const id = caseId(identity), h = markupHash(pages);
      if (Object.hasOwn(got, id) && got[id] !== h) assert.fail(`${message}: the same case drew two different pages`);
      got[id] = h;
      if (RECORD) return;
      assert.ok(Object.hasOwn(want, id), `${message}: this case is not in the markup fixture (testlib/${where}, group ${group}); record it (testlib/markup-fixture.mjs) once its pictures are checked`);
      assert.equal(h, want[id], `${message}: the page is not the one recorded in testlib/${where} (group ${group}): a layout or a page drawing changed what it draws`);
    },
    // Every recorded case of the group was checked (a test that stops covering a case fails); or, recording, writes them down.
    done() {
      if (RECORD) {
        const all = read();
        all[group] = Object.fromEntries(Object.keys(got).sort().map((k) => [k, got[k]]));
        const sorted = Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
        fs.writeFileSync(file, `${JSON.stringify(sorted, null, 1)}\n`);
        return;
      }
      const missing = Object.keys(want).filter((k) => !Object.hasOwn(got, k));
      assert.deepEqual(missing, [], `${missing.length} recorded case(s) of group ${group} were not checked`);
      assert.ok(Object.keys(got).length > 0, `group ${group} checked nothing`);
    },
  };
}

// A group of recorded DATA (not hashes): geometry and the like. check(id, value, { same(a, b) }) compares with the recorded value by `same`
// (default deep equality); done() fails when a recorded case was not checked, or, recording, writes the values down.
export function dataFixture(group, { file = FIXTURE_FILE, recordEnv = 'VESK_RECORD_MARKUP' } = {}) {
  const RECORD = process.env[recordEnv] === '1', where = path.basename(file);
  const want = readFile(file)[group] ?? {};
  const got = {};
  return {
    check(id, value, { same, message = id } = {}) {
      got[id] = value;
      if (RECORD) return;
      assert.ok(Object.hasOwn(want, id), `${message}: this case is not in the fixture (testlib/${where}, group ${group}); record it once it has been looked at`);
      if (same) assert.ok(same(value, want[id]), `${message}: differs from the one recorded in testlib/${where} (group ${group})`);
      else assert.deepEqual(value, want[id], `${message}: differs from the one recorded in testlib/${where} (group ${group})`);
    },
    done() {
      if (RECORD) {
        const all = readFile(file);
        all[group] = Object.fromEntries(Object.keys(got).sort().map((k) => [k, got[k]]));
        fs.writeFileSync(file, `${JSON.stringify(Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]])), null, 1)}\n`);
        return;
      }
      const missing = Object.keys(want).filter((k) => !Object.hasOwn(got, k));
      assert.deepEqual(missing, [], `${missing.length} recorded case(s) of group ${group} were not checked`);
      assert.ok(Object.keys(got).length > 0, `group ${group} checked nothing`);
    },
  };
}
