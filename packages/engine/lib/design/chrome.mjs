// Drives headless Google Chrome over the DevTools protocol through a pipe (--remote-debugging-pipe): Node built-ins only.
// One Chrome at a time: the machine has 8 GB of RAM, so a lock file stops a second design run from starting another.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LINUX = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

// CHROME_PATH wins. Returns null when nothing is found.
export function findChrome({ env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  if (env.CHROME_PATH) return exists(env.CHROME_PATH) ? env.CHROME_PATH : null;
  if (platform === 'darwin') return exists(MAC) ? MAC : null;
  return LINUX.find((p) => exists(p)) ?? null;
}
export const NO_CHROME = 'Google Chrome was not found. Install it, or set CHROME_PATH to the Chrome executable (on macOS it is /Applications/Google Chrome.app/Contents/MacOS/Google Chrome).';

export function acquireLock(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const pid = Number(fs.readFileSync(file, 'utf8'));
    let alive = false;
    try { process.kill(pid, 0); alive = pid !== process.pid; } catch { alive = false; }
    if (alive) throw new Error(`another design run is already using Chrome (process ${pid}); wait for it to finish (one Chrome at a time)`);
  }
  fs.writeFileSync(file, String(process.pid));
  return () => { try { if (fs.readFileSync(file, 'utf8') === String(process.pid)) fs.unlinkSync(file); } catch { /* gone already */ } };
}

export class Browser {
  static async launch({ chromePath = findChrome(), lockFile } = {}) {
    if (!chromePath) throw new Error(NO_CHROME);
    const release = lockFile ? acquireLock(lockFile) : () => {};
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
