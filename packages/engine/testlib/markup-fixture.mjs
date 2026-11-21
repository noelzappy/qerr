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
import { fileURLToPath } from 'node:url';

export const FIXTURE_FILE = fileURLToPath(new URL('./builtin-markup.json', import.meta.url));
const RECORD = process.env.VESK_RECORD_MARKUP === '1';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const read = () => (fs.existsSync(FIXTURE_FILE) ? JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8')) : {});

// A case's id: a readable name as it is (the harness's "<style>/<file>"), anything else by its hash.
export const caseId = (identity) => (typeof identity === 'string' ? identity : sha(JSON.stringify(identity)).slice(0, 16));
export const markupHash = (pages) => sha(typeof pages === 'string' ? pages : JSON.stringify(pages));

export function markupFixture(group) {
  const want = read()[group] ?? {};
  const got = {};
  return {
    check(identity, pages, message = caseId(identity)) {
      const id = caseId(identity), h = markupHash(pages);
      if (Object.hasOwn(got, id) && got[id] !== h) assert.fail(`${message}: the same case drew two different pages`);
      got[id] = h;
      if (RECORD) return;
      assert.ok(Object.hasOwn(want, id), `${message}: this case is not in the markup fixture (testlib/builtin-markup.json, group ${group}); record it (testlib/markup-fixture.mjs) once its pictures are checked`);
      assert.equal(h, want[id], `${message}: the page is not the one recorded in testlib/builtin-markup.json (group ${group}): a built-in layout or a page drawing changed what it draws`);
    },
    // Every recorded case of the group was checked (a test that stops covering a case fails); or, recording, writes them down.
    done() {
      if (RECORD) {
        const all = read();
        all[group] = Object.fromEntries(Object.keys(got).sort().map((k) => [k, got[k]]));
        const sorted = Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
        fs.writeFileSync(FIXTURE_FILE, `${JSON.stringify(sorted, null, 1)}\n`);
        return;
      }
      const missing = Object.keys(want).filter((k) => !Object.hasOwn(got, k));
      assert.deepEqual(missing, [], `${missing.length} recorded case(s) of group ${group} were not checked`);
      assert.ok(Object.keys(got).length > 0, `group ${group} checked nothing`);
    },
  };
}
