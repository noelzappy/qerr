// Drives headless Google Chrome or Chromium over the DevTools protocol through a pipe (--remote-debugging-pipe): Node built-ins only.
// One Chrome at a time by default: machine-wide lock files (chromeLockFiles; RENDER_CONCURRENCY of them, 1 unless set) make a further design run wait.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Chrome first, then Chromium: both speak the same DevTools protocol.
const MAC = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
const LINUX = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];

// CHROME_PATH wins (any Chrome or Chromium executable). Returns null when nothing is found.
export function findChrome({ env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  if (env.CHROME_PATH) return exists(env.CHROME_PATH) ? env.CHROME_PATH : null;
  return (platform === 'darwin' ? MAC : LINUX).find((p) => exists(p)) ?? null;
}
export const NO_CHROME = 'Neither Google Chrome nor Chromium was found. Install one, or set CHROME_PATH to its executable (on macOS, /Applications/Google Chrome.app/Contents/MacOS/Google Chrome or /Applications/Chromium.app/Contents/MacOS/Chromium).';

// One Chrome at a time on the whole machine by default (AGENTS.md rule 10): every render, from any checkout of the repository, takes a lock
// file in the system's temporary folder, os.tmpdir()/vesk-chrome.lock, or the file VESK_CHROME_LOCK names (an absolute path). A server that
// can afford more sets RENDER_CONCURRENCY (1 to MAX_RENDER_CONCURRENCY): there are then that many slot files (the first one, then
// <file>.2, <file>.3 ...) and that many Chromes may run on the machine at once. Each lock file holds the pid of the process using it.
export function chromeLockFile(env = process.env) {
  const f = env.VESK_CHROME_LOCK;
  return typeof f === 'string' && f && path.isAbsolute(f) ? f : path.join(os.tmpdir(), 'vesk-chrome.lock');
}
export const MAX_RENDER_CONCURRENCY = 16;
// How many Chromes may run at once on this machine: RENDER_CONCURRENCY, a whole number from 1 to MAX_RENDER_CONCURRENCY; else 1. (The web
// app refuses to start with a bad value; the engine on its own falls back to one at a time.)
export function renderConcurrency(env = process.env) {
  const v = env.RENDER_CONCURRENCY;
  if (v === undefined || String(v).trim() === '') return 1;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_RENDER_CONCURRENCY ? n : 1;
}
// The slot files: chromeLockFile() first, then <file>.2 up to <file>.N.
export function chromeLockFiles(env = process.env) {
  const first = chromeLockFile(env);
  return [first, ...Array.from({ length: renderConcurrency(env) - 1 }, (_, i) => `${first}.${i + 2}`)];
}
// How long a render waits for the machine's Chrome before giving up: VESK_CHROME_LOCK_WAIT_MS, else 30 minutes.
export function chromeLockWait(env = process.env) {
  const n = Number(env.VESK_CHROME_LOCK_WAIT_MS);
  return env.VESK_CHROME_LOCK_WAIT_MS !== undefined && Number.isFinite(n) && n >= 0 ? n : 30 * 60 * 1000;
}
const held = new Map();
const alive = (pid) => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
// One try at one slot file: 'mine' (taken now), 'free-again' (a stale lock was removed: try again), or the live holder's pid.
function tryTake(file) {
  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
    held.set(file, 1);
    return 'mine';
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  let pid = NaN;
  try { pid = Number(fs.readFileSync(file, 'utf8').trim()); } catch { return 'free-again'; }
  if (pid === process.pid) { held.set(file, 1); return 'mine'; }
  if (!alive(pid)) { try { if (Number(fs.readFileSync(file, 'utf8').trim()) === pid) fs.unlinkSync(file); } catch { /* taken or gone */ } return 'free-again'; }
  return pid;
}
// Takes a slot: `file` is one lock file or a list of slot files (chromeLockFiles). A free slot is taken first; a file is created atomically
// (wx), so two processes never both take it, and a lock left by a process that is gone (or an unreadable one) is stale and taken over. When
// every slot is taken and this process holds one of them, it takes that one again (its own browsers in turn: the web app's own render limit
// caps how many it runs); when other live processes hold them all, it waits. A slot is removed when its last taking is released. -> release()
export async function acquireLock(file, { waitMs = chromeLockWait(), pollMs = 250 } = {}) {
  const files = Array.isArray(file) ? file : [file];
  if (!files.length) throw new Error('acquireLock needs at least one lock file');
  for (const f of files) fs.mkdirSync(path.dirname(f), { recursive: true });
  const deadline = Date.now() + waitMs;
  let taken = null;
  while (!taken) {
    const holders = [];
    let retry = false;
    for (const f of files) {
      if (held.has(f)) continue;
      const r = tryTake(f);
      if (r === 'mine') { taken = f; break; }
      if (r === 'free-again') { retry = true; break; }
      holders.push(r);
    }
    if (taken || retry) continue;
    const mine = files.find((f) => held.has(f));
    if (mine) { held.set(mine, held.get(mine) + 1); taken = mine; break; }
    if (Date.now() >= deadline) {
      const what = files.length === 1 ? `(process ${holders[0]})` : `(all ${files.length} slots, processes ${holders.join(', ')})`;
      const limit = files.length === 1 ? 'one Chrome at a time on this machine' : `${files.length} Chromes at a time on this machine`;
      throw new Error(`another design run is already using Chrome ${what}; waited ${Math.round(waitMs / 1000)} s for it to finish (${limit})`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const n = (held.get(taken) ?? 1) - 1;
    if (n > 0) { held.set(taken, n); return; }
    held.delete(taken);
    try { if (fs.readFileSync(taken, 'utf8').trim() === String(process.pid)) fs.unlinkSync(taken); } catch { /* gone already */ }
  };
}

export class Browser {
  // A machine-wide slot (chromeLockFiles: one unless RENDER_CONCURRENCY says more) is always taken, waiting up to waitMs (chromeLockWait);
  // no caller names a lock file of its own.
  static async launch({ chromePath = findChrome(), waitMs } = {}) {
    if (!chromePath) throw new Error(NO_CHROME);
    const release = await acquireLock(chromeLockFiles(), waitMs === undefined ? {} : { waitMs });
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-chrome-'));
    const child = spawn(chromePath, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--host-resolver-rules=MAP * ~NOTFOUND', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--remote-debugging-pipe',
      `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
    const b = new Browser(child, profile, release);
    await b.send('Browser.getVersion').catch((e) => { b.close(); throw e; });
    return b;
  }

  constructor(child, profile, release) {
    this.child = child; this.profile = profile; this.release = release;
    this.id = 0; this.pending = new Map(); this.listeners = []; this.buf = ''; this.stderr = ''; this.closed = false;
    child.stderr.on('data', (d) => { this.stderr = (this.stderr + d).slice(-2000); });
    child.stdio[4].on('data', (d) => this.#onData(d));
    child.on('exit', () => { this.closed = true; for (const p of this.pending.values()) p.reject(new Error(`Chrome exited unexpectedly. ${this.stderr.trim().split('\n').pop() ?? ''}`)); this.pending.clear(); });
    child.on('error', (e) => { for (const p of this.pending.values()) p.reject(e); });
  }

  #onData(chunk) {
    this.buf += chunk.toString('utf8');
    let i;
    while ((i = this.buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(this.buf.slice(0, i));
      this.buf = this.buf.slice(i + 1);
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(`${msg.error.message}`)) : p.resolve(msg.result);
      } else if (msg.method) this.listeners.slice().forEach((l) => l(msg));
    }
  }

  send(method, params = {}, sessionId, timeout = 30000) {
    if (this.closed) return Promise.reject(new Error('Chrome is not running'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`Chrome did not answer ${method} within ${timeout / 1000}s`)); }, timeout);
      this.pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      this.child.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    });
  }

  waitFor(method, sessionId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.listeners = this.listeners.filter((l) => l !== fn); reject(new Error(`timed out waiting for ${method}`)); }, timeout);
      const fn = (m) => { if (m.method === method && m.sessionId === sessionId) { clearTimeout(t); this.listeners = this.listeners.filter((l) => l !== fn); resolve(m.params); } };
      this.listeners.push(fn);
    });
  }

  async page(width, height) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    await this.send('Page.enable', {}, sessionId);
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    const send = (m, p, t) => this.send(m, p, sessionId, t);
    const loadEvent = () => this.waitFor('Page.loadEventFired', sessionId);
    // Nothing the page does may leave it: every request except data: and about:blank is refused (and remembered).
    const blocked = [];
    this.listeners.push((m) => {
      if (m.method !== 'Fetch.requestPaused' || m.sessionId !== sessionId) return;
      const { requestId, request } = m.params, ok = request.url.startsWith('data:') || request.url === 'about:blank';
      if (!ok) blocked.push(request.url.slice(0, 80));
      send(ok ? 'Fetch.continueRequest' : 'Fetch.failRequest', ok ? { requestId } : { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    return {
      blocked,
      // The page is set from a string on about:blank: no file is ever opened by the browser.
      async setContent(html) {
        const loaded = loadEvent();
        await send('Page.navigate', { url: 'about:blank' });
        await loaded;
        const { frameTree } = await send('Page.getFrameTree');
        await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
      },
      async evaluate(expression) {
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, 60000);
        if (r.exceptionDetails) throw new Error(`page script failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
        return r.result.value;
      },
      async screenshotPng() {
        const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
        return Buffer.from(r.data, 'base64');
      },
      async screenshotJpeg(quality = 92) {
        const r = await send('Page.captureScreenshot', { format: 'jpeg', quality, fromSurface: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
        return Buffer.from(r.data, 'base64');
      },
      // One printed page per CSS page size the page declares (@page), backgrounds included, no header or footer.
      async pdf(extra = {}) {
        const r = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, transferMode: 'ReturnAsBase64', ...extra }, 120000);
        return Buffer.from(r.data, 'base64');
      },
      close: () => this.send('Target.closeTarget', { targetId }).catch(() => {}),
    };
  }

  close() {
    if (this.closed && !this.profile) return;
    try { this.child.kill('SIGKILL'); } catch { /* already gone */ }
    this.closed = true;
    try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch { /* temp dir, best effort */ }
    this.profile = null;
    this.release();
  }
}
