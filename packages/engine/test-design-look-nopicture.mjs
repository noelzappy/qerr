// A design whose picture is optional must draw without one. The look gates and the per-look sheets always hand such a design a
// picture, so the "no picture" branch of a composition (a pale card or circle in the picture's place) was never drawn: an AI
// draft of an offer with no picture failed every time. Here every shipped composition with an optional picture is drawn from
// its look's sample and stress copy with the picture left out, under every page check. (Minimal copy is only the required
// fields; with no picture either, loud's event poster still leaves too much of its field empty.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './lib/core.mjs';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { loadBrand } from './lib/design/brand.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { renderImage } from './lib/design/render.mjs';
import { normaliseDesign, validateDesign } from './lib/design/spec.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
const asCopy = (l) => ({ ...clone(l), origin: `copy:shipped:${l.id}` });

// [look id, kind, variant index among the kind, composition] for every composition whose picture is optional
function optionalPictureDesigns() {
  const out = [];
  for (const [id, look] of Object.entries(shippedLooks())) {
    const seen = {};
    for (const comp of look.compositions) {
      const v = seen[comp.kind] ?? 0; seen[comp.kind] = v + 1;
      if (comp.fields?.image && !comp.fields.image.required) out.push([id, comp.kind, v, comp]);
    }
  }
  return out;
}

test('there are optional-picture designs to draw, and every one has sample and stress copy', async () => {
  const designs = optionalPictureDesigns();
  assert.ok(designs.length >= 4, 'several looks have a design whose picture is optional');
  for (const [id, kind, v] of designs) {
    const copy = await import(`./testlib/${id}-copy.mjs`);
    for (const set of ['NORMAL', 'STRESS']) assert.ok(copy[set]?.[`${id}/${kind}/${v}`], `${id}/${kind}/${v} has ${set} copy`);
  }
});

const chrome = findChrome();
test('every shipped design whose picture is optional draws without a picture, from sample and stress copy', { skip: chrome ? false : 'Google Chrome was not found' }, async () => {
  const demo = loadBrand({ file: path.join(ROOT, 'brands', 'demo', 'brand.json') });
  const looks = shippedLooks();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qerr-nopicture-'));
  const browser = await Browser.launch({ chromePath: chrome });
  const failed = [];
  try {
    for (const [id, kind, v, comp] of optionalPictureDesigns()) {
      const copy = await import(`./testlib/${id}-copy.mjs`);
      const b = { ...demo, looks: [asCopy(looks[id])], style: { ...demo.style, direction: id } };
      for (const [name, set] of [['sample', copy.NORMAL], ['stress', copy.STRESS]]) {
        const spec = { template: 'post', kind, variant: v, name: 'nopicture-test', ...set[`${id}/${kind}/${v}`] };
        delete spec.image;
        assert.deepEqual(validateDesign(spec, `${id}/${kind}/${v}`, {}), [], `${id}/${kind}/${v} ${name}`);
        try { await renderImage(browser, b, { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, `${id}-${kind}-${v}-${name}.png`) }, { tmpDir: tmp }); }
        catch (e) { failed.push(`${id}/${kind}/${v} (${comp.name}) ${name}: ${e.message}`); }
      }
    }
  } finally { browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  assert.deepEqual(failed, []);
});
