// Reading a web page as text, safely. The address comes from search results, so it is untrusted:
// only http(s), no credentials in the URL, no private, loopback, link-local or other non-global address, a size cap, a time
// cap, and scripts and styles removed.
// The address that was checked is the address that is connected to: the real transport (node:http / node:https) gets a
// `lookup` that resolves the name, checks every answer and hands back only addresses that passed, so a DNS answer that
// changes between a check and the connection (rebinding) cannot reach an internal host. Host header and TLS SNI stay the
// original host name. Redirects are followed by hand, each hop checked again.
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { AIError } from './errors.mjs';

const defaultResolve = (host) => dns.lookup(host, { all: true, verbatim: true });

const inV4 = (a, ranges) => ranges.some(([b0, b1, mask]) => {
  const v = ((a[0] << 24) | (a[1] << 16) | (a[2] << 8) | a[3]) >>> 0;
  const base = ((b0 << 24) | (b1 << 16)) >>> 0;
  return (v & mask) >>> 0 === base;
});
// [first octet, second octet, mask] for each non-global IPv4 block.
const V4_BLOCKS = [
  [0, 0, 0xff000000], [10, 0, 0xff000000], [100, 64, 0xffc00000], [127, 0, 0xff000000], [169, 254, 0xffff0000], [172, 16, 0xfff00000],
  [192, 0, 0xffffff00], [192, 0, 0xffffff00], [192, 168, 0xffff0000], [198, 18, 0xfffe0000], [224, 0, 0xf0000000], [240, 0, 0xf0000000],
];
function v4Private(a) {
  if (a.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return true;
  if (inV4(a, V4_BLOCKS)) return true;
  const [b0, b1, b2] = a;
  return (b0 === 192 && b1 === 0 && b2 === 2) || (b0 === 192 && b1 === 88 && b2 === 99) || (b0 === 198 && b1 === 51 && b2 === 100) || (b0 === 203 && b1 === 0 && b2 === 113);
}

// Expands an IPv6 text to 8 groups of numbers, or null.
function v6Groups(ip) {
  let s = ip.split('%')[0].toLowerCase();
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const o = tail[1].split('.').map(Number);
    if (o.some((x) => !(x >= 0 && x <= 255))) return null;
    s = s.slice(0, -tail[1].length) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const h = parts[0] ? parts[0].split(':') : [];
  const r = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const fill = parts.length === 2 ? 8 - h.length - r.length : 0;
  if (fill < 0 || (parts.length === 1 && h.length !== 8) || (parts.length === 2 && fill < 1)) return null;
  const g = [...h, ...Array(fill).fill('0'), ...r].map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN));
  return g.length === 8 && g.every((x) => Number.isInteger(x)) ? g : null;
}
const v4of = (hi, lo) => [hi >> 8, hi & 255, lo >> 8, lo & 255];

// Deny by default. IPv6 is public only when it is global unicast (2000::/3) and not documentation, Teredo, 6to4 or NAT64
// with a non-public IPv4 inside, and the IPv4-mapped / compatible forms only when the IPv4 inside is public.
function v6Private(ip) {
  const g = v6Groups(ip);
  if (!g) return true;
  const zeros = (from, to) => g.slice(from, to).every((x) => x === 0);
  if (zeros(0, 6)) return v4Private(v4of(g[6], g[7])); // ::/96 (includes ::, ::1) and IPv4-compatible
  if (zeros(0, 5) && g[5] === 0xffff) return v4Private(v4of(g[6], g[7])); // ::ffff:0:0/96
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    if (zeros(2, 6)) return v4Private(v4of(g[6], g[7])); // 64:ff9b::/96
    if (g[2] === 1) { // 64:ff9b:1::/48 (RFC 6052, /48 layout skips bits 64-71)
      const b = g.flatMap((x) => [x >> 8, x & 255]);
      return v4Private([b[6], b[7], b[9], b[10]]);
    }
    return true;
  }
  if (g[0] === 0x2002) return v4Private(v4of(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return v4Private(v4of(g[2], g[3])) || v4Private(v4of(g[6] ^ 0xffff, g[7] ^ 0xffff)); // Teredo: server and client
  if (g[0] === 0x2001 && g[1] < 0x0200) return true; // 2001::/23 protocol assignments
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x3fff && g[1] < 0x1000) return true; // documentation 3fff::/20
  return (g[0] & 0xe000) !== 0x2000; // only 2000::/3 is global unicast
}

export function isPrivateAddress(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) return v4Private(ip.split('.').map(Number));
  if (kind === 6) return v6Private(ip);
  return true;
}

// Throws AIError('unsafe_url') unless the URL is a public http(s) address. Returns the parsed URL.
export async function assertPublicUrl(raw, { lookup = defaultResolve } = {}) {
  let u;
  try { u = new URL(raw); } catch { throw new AIError('Not a valid URL', { code: 'unsafe_url' }); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new AIError(`Only http and https addresses are read (got ${u.protocol})`, { code: 'unsafe_url' });
  if (u.username || u.password) throw new AIError('Addresses with a user name or password are not read', { code: 'unsafe_url' });
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || !host.includes('.') && !net.isIP(host)) {
    throw new AIError(`The host ${host || '(empty)'} is not a public address`, { code: 'unsafe_url' });
  }
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new AIError(`${host} is a private or internal address`, { code: 'unsafe_url' });
    return u;
  }
  let addrs;
  try { addrs = await lookup(host); } catch (e) { throw new AIError(`Could not resolve ${host}`, { code: 'network' }); }
  const list = (Array.isArray(addrs) ? addrs : [addrs]).map((a) => (typeof a === 'string' ? a : a.address));
  if (!list.length) throw new AIError(`Could not resolve ${host}`, { code: 'network' });
  const bad = list.find((a) => isPrivateAddress(a));
  if (bad) throw new AIError(`${host} resolves to a private or internal address`, { code: 'unsafe_url' });
  return u;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', hellip: '...' };
const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; } })
  .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ' '; } })
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

// Turns HTML into plain text for a model to read: no scripts, styles, comments or hidden blocks; invisible and control
// characters removed. Best effort, not a sanitiser: the result is still untrusted text.
export function htmlToText(html) {
  let h = String(html);
  const title = decode((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  h = h.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head|object|embed|canvas)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(\w+)\b[^>]*\b(?:hidden|aria-hidden\s*=\s*["']?true|style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden))[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|blockquote|pre)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  const text = decode(h)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/g, '')
    .replace(/[ \t\f\r]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, text };
}

// A lookup for node:http(s) / net.connect: resolves, checks every answer, returns only addresses that passed.
// A name with any non-public answer is refused outright (mixed answers are a rebinding sign).
export function pinnedLookup(resolve = defaultResolve) {
  return (hostname, options, cb) => {
    if (typeof options === 'function') { cb = options; options = {}; }
    Promise.resolve().then(() => resolve(hostname)).then((answer) => {
      const list = (Array.isArray(answer) ? answer : [answer]).map((a) => (typeof a === 'string' ? { address: a } : a)).map((a) => ({ address: a.address, family: net.isIP(a.address) }));
      if (!list.length || list.some((a) => !a.family)) throw new AIError(`Could not resolve ${hostname}`, { code: 'network' });
      if (list.some((a) => isPrivateAddress(a.address))) throw new AIError(`${hostname} resolves to a private or internal address`, { code: 'unsafe_url' });
      const usable = options?.family === 4 || options?.family === 6 ? list.filter((a) => a.family === options.family) : list;
      if (!usable.length) throw new AIError(`${hostname} has no address of the requested kind`, { code: 'network' });
      if (options?.all) cb(null, usable); else cb(null, usable[0].address, usable[0].family);
    }).catch((e) => cb(e instanceof AIError ? e : new AIError(`Could not resolve ${hostname}`, { code: 'network' })));
  };
}

// The real transport: transport(url, { headers, signal }) -> { status, headers: { get }, body: async iterable of bytes }.
export function nodeTransport({ lookup, httpModule = http, httpsModule = https } = {}) {
  const pinned = pinnedLookup(lookup);
  return (u, { headers, signal } = {}) => new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? httpsModule : httpModule;
    const req = mod.request({
      protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || undefined, path: `${u.pathname}${u.search}`,
      method: 'GET', headers, lookup: pinned, signal,
    }, (res) => resolve({ status: res.statusCode, headers: { get: (n) => { const v = res.headers[n.toLowerCase()]; return (Array.isArray(v) ? v[0] : v) ?? null; } }, body: res }));
    req.on('error', reject);
    req.end();
  });
}

// Adapts a fetch function (tests, or an app that already has one) to the transport shape. Not pinned: use only where
// the fetch function is itself trusted to connect to what it is given.
export const fromFetch = (fetchFn) => async (u, { headers, signal }) => {
  const res = await fetchFn(u.href, { redirect: 'manual', signal, headers });
  return { status: res.status, headers: res.headers, body: res.body };
};

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

// fetchPage(url) -> { url, finalUrl, title, text, truncated }, plus `html` (the raw page, capped at maxBytes) with keepHtml, for
// callers that read the page's head (meta tags, theme colour). The raw page is as untrusted as the text.
export async function fetchPage(url, { transport, lookup, timeoutMs = 15000, maxBytes = 1_000_000, maxChars = 8000, maxRedirects = 4, userAgent = 'vesk-research/1.0', keepHtml = false } = {}) {
  const send = transport ?? nodeTransport({ lookup });
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const u = await assertPublicUrl(current, { lookup });
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      let res;
      try {
        res = await send(u, { signal: ctl.signal, headers: { accept: 'text/html,application/xhtml+xml,text/plain;q=0.9', 'user-agent': userAgent } });
      } catch (e) {
        if (e instanceof AIError) throw e;
        throw new AIError(ctl.signal.aborted ? `Reading ${u.hostname} timed out` : `Could not read ${u.hostname}`, { code: ctl.signal.aborted ? 'timeout' : 'network' });
      }
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        res.body?.cancel?.().catch?.(() => {}); res.body?.destroy?.();
        current = new URL(loc, u).href;
        continue;
      }
      if (res.status < 200 || res.status >= 300) { res.body?.destroy?.(); throw new AIError(`${u.hostname} answered ${res.status}`, { code: 'http', status: res.status }); }
      const type = (res.headers.get('content-type') ?? 'text/html').toLowerCase();
      if (!/^(text\/|application\/(xhtml\+xml|json|xml))/.test(type)) { res.body?.destroy?.(); throw new AIError(`Not a text page (${type.split(';')[0]})`, { code: 'http' }); }
      let raw = '', bytes = 0, capped = false;
      const dec = new TextDecoder();
      try {
        for await (const chunk of res.body ?? []) {
          bytes += chunk.length;
          raw += dec.decode(chunk, { stream: true });
          if (bytes >= maxBytes) { capped = true; break; }
        }
      } catch (e) {
        throw new AIError(ctl.signal.aborted ? `Reading ${u.hostname} timed out` : `Could not read ${u.hostname}`, { code: ctl.signal.aborted ? 'timeout' : 'network' });
      }
      const isHtml = /html|xml/.test(type);
      const { title, text } = isHtml ? htmlToText(raw) : { title: '', text: raw.replace(CONTROL, '').trim() };
      return { url, finalUrl: u.href, title, text: text.slice(0, maxChars), truncated: capped || text.length > maxChars, ...(keepHtml ? { html: isHtml ? raw : '' } : {}) };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AIError(`Too many redirects reading ${url}`, { code: 'unsafe_url' });
}
