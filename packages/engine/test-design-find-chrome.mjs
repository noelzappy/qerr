// Which browser the renderer finds: CHROME_PATH first, then Chrome, then Chromium, on macOS and Linux.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findChrome, NO_CHROME } from './lib/design/chrome.mjs';

const only = (...paths) => (p) => paths.includes(p);

test('CHROME_PATH wins, and a missing one finds nothing', () => {
  assert.equal(findChrome({ env: { CHROME_PATH: '/x/chromium' }, platform: 'linux', exists: only('/x/chromium', '/usr/bin/google-chrome') }), '/x/chromium');
  assert.equal(findChrome({ env: { CHROME_PATH: '/x/none' }, platform: 'linux', exists: only('/usr/bin/google-chrome') }), null);
});

test('macOS falls back to Chromium when Chrome is not installed', () => {
  const chromium = '/Applications/Chromium.app/Contents/MacOS/Chromium';
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  assert.equal(findChrome({ env: {}, platform: 'darwin', exists: only(chromium) }), chromium);
  assert.equal(findChrome({ env: {}, platform: 'darwin', exists: only(chromium, chrome) }), chrome);
  assert.equal(findChrome({ env: {}, platform: 'darwin', exists: only() }), null);
});

test('Linux finds Chromium, including the snap', () => {
  assert.equal(findChrome({ env: {}, platform: 'linux', exists: only('/usr/bin/chromium') }), '/usr/bin/chromium');
  assert.equal(findChrome({ env: {}, platform: 'linux', exists: only('/snap/bin/chromium') }), '/snap/bin/chromium');
});

test('the message names both browsers', () => {
  assert.match(NO_CHROME, /Chrome/);
  assert.match(NO_CHROME, /Chromium/);
});
