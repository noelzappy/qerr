// node --test   (no Chrome: the lock only.)
// One Chrome at a time on the whole machine (AGENTS.md rule 10): every render, from any checkout of the repository, takes one lock file in the
// system's temporary folder (or the one QERR_CHROME_LOCK names), waits while another live process holds it, takes over a lock left by a
// process that is gone, and never lets two processes hold it at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Browser, MAX_RENDER_CONCURRENCY, acquireLock, chromeLockFile, chromeLockFiles, chromeLockWait, renderConcurrency } from './lib/design/chrome.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qerr-lock-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// another process that takes the lock, says so, and holds it for `ms`
function holder(file, ms) {
  const code = `import { acquireLock } from ${JSON.stringify(path.join(HERE, 'lib/design/chrome.mjs'))};
    const release = await acquireLock(${JSON.stringify(file)}, { waitMs: 0 }); process.stdout.write('held\\n');
    setTimeout(() => { release(); process.exit(0); }, ${ms});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'inherit'] });
  const ready = new Promise((resolve, reject) => { child.stdout.on('data', (d) => { if (String(d).includes('held')) resolve(); }); child.on('exit', (c) => reject(new Error(`holder exited ${c}`))); });
  const done = new Promise((resolve) => child.on('exit', resolve));
  return { child, ready, done };
}

test('the lock is one file for the whole machine, in the system temporary folder unless QERR_CHROME_LOCK names another', () => {
  assert.equal(chromeLockFile({}), path.join(os.tmpdir(), 'qerr-chrome.lock'));
  assert.equal(chromeLockFile({ QERR_CHROME_LOCK: '/var/tmp/x.lock' }), '/var/tmp/x.lock');
  assert.equal(chromeLockFile({ QERR_CHROME_LOCK: 'out/design.lock' }), path.join(os.tmpdir(), 'qerr-chrome.lock'), 'a relative path would differ per checkout');
  assert.equal(chromeLockWait({}), 30 * 60 * 1000);
  assert.equal(chromeLockWait({ QERR_CHROME_LOCK_WAIT_MS: '0' }), 0);
});

test('taking and releasing: the pid is written, the file goes with the last release, a process may take it more than once', async () => {
  const file = path.join(tmp, 'a.lock');
  const r1 = await acquireLock(file, { waitMs: 0 });
  assert.equal(fs.readFileSync(file, 'utf8'), String(process.pid));
  const r2 = await acquireLock(file, { waitMs: 0 });
  r1();
  assert.ok(fs.existsSync(file), 'still held by the second taking');
  r2();
  assert.ok(!fs.existsSync(file));
  r2();
  assert.ok(!fs.existsSync(file), 'a second release changes nothing');
});

test('a lock left by a process that is gone is taken over', async () => {
  const file = path.join(tmp, 'stale.lock');
  const gone = spawn(process.execPath, ['-e', '0']);
  await new Promise((r) => gone.on('exit', r));
  fs.writeFileSync(file, String(gone.pid));
  const release = await acquireLock(file, { waitMs: 0 });
  assert.equal(fs.readFileSync(file, 'utf8'), String(process.pid));
  release();
});

test('while another live process holds it, a render waits for it, or gives up with the reason when the wait is over', async () => {
  const file = path.join(tmp, 'busy.lock');
  const h = holder(file, 1500);
  await h.ready;
  await assert.rejects(acquireLock(file, { waitMs: 200, pollMs: 50 }), /another design run is already using Chrome \(process \d+\); waited 0 s/);
  const t0 = Date.now();
  const release = await acquireLock(file, { waitMs: 10000, pollMs: 50 });
  assert.ok(Date.now() - t0 >= 500, 'it waited for the other process');
  assert.equal(fs.readFileSync(file, 'utf8'), String(process.pid));
  release();
  await h.done;
});

test('Browser.launch takes the machine-wide lock before it starts Chrome', async () => {
  const file = path.join(tmp, 'machine.lock'), before = process.env.QERR_CHROME_LOCK;
  process.env.QERR_CHROME_LOCK = file;
  const h = holder(file, 1500);
  try {
    await h.ready;
    await assert.rejects(Browser.launch({ chromePath: process.execPath, waitMs: 100 }), /another design run is already using Chrome/);
  } finally {
    if (before === undefined) delete process.env.QERR_CHROME_LOCK; else process.env.QERR_CHROME_LOCK = before;
    await h.done;
  }
});

test('RENDER_CONCURRENCY sets how many Chromes may run on the machine: 1 to 16, else one at a time', () => {
  assert.equal(MAX_RENDER_CONCURRENCY, 16);
  assert.equal(renderConcurrency({}), 1);
  assert.equal(renderConcurrency({ RENDER_CONCURRENCY: '' }), 1);
  assert.equal(renderConcurrency({ RENDER_CONCURRENCY: '3' }), 3);
  assert.equal(renderConcurrency({ RENDER_CONCURRENCY: '16' }), 16);
  for (const bad of ['0', '17', '2.5', '-1', 'many', 'Infinity', 'NaN']) assert.equal(renderConcurrency({ RENDER_CONCURRENCY: bad }), 1, bad);
  const first = path.join(os.tmpdir(), 'qerr-chrome.lock');
  assert.deepEqual(chromeLockFiles({}), [first]);
  assert.deepEqual(chromeLockFiles({ RENDER_CONCURRENCY: '3' }), [first, `${first}.2`, `${first}.3`]);
  assert.deepEqual(chromeLockFiles({ RENDER_CONCURRENCY: '2', QERR_CHROME_LOCK: '/var/tmp/x.lock' }), ['/var/tmp/x.lock', '/var/tmp/x.lock.2']);
});

test('with several slots, other processes take free slots side by side, and a render waits only when every slot is taken', async () => {
  const slots = [path.join(tmp, 'n.lock'), path.join(tmp, 'n.lock.2')];
  const h1 = holder(slots, 1500);
  await h1.ready;
  const h2 = holder(slots, 1500);
  await h2.ready;
  assert.ok(fs.existsSync(slots[0]) && fs.existsSync(slots[1]), 'each process took its own slot');
  assert.notEqual(fs.readFileSync(slots[0], 'utf8'), fs.readFileSync(slots[1], 'utf8'));
  await assert.rejects(acquireLock(slots, { waitMs: 100, pollMs: 50 }), /another design run is already using Chrome \(all 2 slots, processes \d+, \d+\); waited 0 s for it to finish \(2 Chromes at a time on this machine\)/);
  const release = await acquireLock(slots, { waitMs: 10000, pollMs: 50 });
  assert.ok(slots.some((f) => fs.existsSync(f) && fs.readFileSync(f, 'utf8') === String(process.pid)));
  release();
  await Promise.all([h1.done, h2.done]);
});

test('one process takes a free slot for each of its renders, then takes its own again rather than wait for itself', async () => {
  const slots = [path.join(tmp, 'm.lock'), path.join(tmp, 'm.lock.2')];
  const r1 = await acquireLock(slots, { waitMs: 0 });
  const r2 = await acquireLock(slots, { waitMs: 0 });
  assert.ok(fs.existsSync(slots[0]) && fs.existsSync(slots[1]), 'a second render took the second slot');
  const r3 = await acquireLock(slots, { waitMs: 0 });
  r1(); r2();
  assert.equal(slots.filter((f) => fs.existsSync(f)).length, 1, 'the slot taken twice stays until its last release');
  r3();
  assert.ok(!slots.some((f) => fs.existsSync(f)));
});
