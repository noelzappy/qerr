// node --test   renderDesignBlock / designBlockProblems. The real render needs Google Chrome and is skipped without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { designBlockProblems, renderDesignBlock } from './lib/design-render.mjs';
import { ROOT } from './lib/core.mjs';
import { findChrome } from './lib/design/chrome.mjs';
import { SIZES } from './lib/design/sizes.mjs';

const root = ROOT;
const batch = JSON.parse(fs.readFileSync(path.join(root, 'batches', 'example-editorial.json'), 'utf8'));

test('designBlockProblems lists validation errors and is empty for a good block', () => {
  assert.deepEqual(designBlockProblems(batch.posts[0].design, { root }), []);
  const bad = designBlockProblems({ template: 'nope' }, { root });
  assert.equal(bad.length, 1);
  assert.match(bad[0], /template must be one of/);
  assert.ok(designBlockProblems(null, { root })[0].includes('must be an object'));
  assert.ok(designBlockProblems({ template: 'pagecover', kind: 'profile' }, { root }).some((e) => /page-cover/.test(e)));
  assert.ok(designBlockProblems({ template: 'text', headline: 'x', name: 'Bad Name' }, { root }).some((e) => /name must use/.test(e)));
});

test('an invalid block returns ok:false with the errors and renders nothing', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-dr-'));
  try {
    const r = await renderDesignBlock({ root, design: { template: 'nope' }, postId: 'p', outDir: out });
    assert.equal(r.ok, false);
    assert.match(r.error, /template must be one of/);
    assert.deepEqual(r.files, []);
    assert.deepEqual(fs.readdirSync(out), []);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('real render of the first example post design', { skip: findChrome() ? false : 'Google Chrome not found' }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-dr-'));
  try {
    const design = batch.posts[0].design;
    const r = await renderDesignBlock({ root, design, postId: batch.posts[0].id, outDir: out });
    assert.equal(r.ok, true, r.error);
    assert.ok(r.files.length >= 2);
    for (const f of r.files) {
      assert.ok(fs.existsSync(f.abs), f.abs);
      assert.equal(path.dirname(f.abs), out);
      assert.equal(f.w, SIZES[f.size].w);
      assert.equal(f.h, SIZES[f.size].h);
    }
    assert.equal(r.files[0].file, `${batch.posts[0].id}-1.jpg`);
    assert.ok(r.pdf && fs.existsSync(r.pdf.abs) && r.pdf.pages === r.files.length);
    assert.ok(!fs.existsSync(path.join(root, 'out', 'design.lock')), 'the lock is released');
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
