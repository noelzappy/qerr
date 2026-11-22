// node --test   (no Chrome: the lock only.)
// One Chrome at a time on the whole machine (AGENTS.md rule 10): every render, from any checkout of the repository, takes one lock file in the
// system's temporary folder (or the one VESK_CHROME_LOCK names), waits while another live process holds it, takes over a lock left by a
// process that is gone, and never lets two processes hold it at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Browser, acquireLock, chromeLockFile, chromeLockWait } from './lib/design/chrome.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-lock-'));
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

test('the lock is one file for the whole machine, in the system temporary folder unless VESK_CHROME_LOCK names another', () => {
  assert.equal(chromeLockFile({}), path.join(os.tmpdir(), 'vesk-chrome.lock'));
  assert.equal(chromeLockFile({ VESK_CHROME_LOCK: '/var/tmp/x.lock' }), '/var/tmp/x.lock');
  assert.equal(chromeLockFile({ VESK_CHROME_LOCK: 'out/design.lock' }), path.join(os.tmpdir(), 'vesk-chrome.lock'), 'a relative path would differ per checkout');
  assert.equal(chromeLockWait({}), 30 * 60 * 1000);
  assert.equal(chromeLockWait({ VESK_CHROME_LOCK_WAIT_MS: '0' }), 0);
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
  const file = path.join(tmp, 'machine.lock'), before = process.env.VESK_CHROME_LOCK;
  process.env.VESK_CHROME_LOCK = file;
  const h = holder(file, 1500);
  try {
    await h.ready;
    await assert.rejects(Browser.launch({ chromePath: process.execPath, waitMs: 100 }), /another design run is already using Chrome/);
  } finally {
    if (before === undefined) delete process.env.VESK_CHROME_LOCK; else process.env.VESK_CHROME_LOCK = before;
    await h.done;
  }
});
