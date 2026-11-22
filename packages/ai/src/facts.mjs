// Checks on the words a model wrote: numbers and quotations must come from the vault items a post cites.
import { WEB_ADDRESS } from '@qerr/engine/design/lint';
const MULT = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, b: 1e9 };
const NUM = /(?<![\w#.,])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s?(thousand|million|billion)\b|(?<=\d)([kKmMbB])(?![A-Za-z]))?/giu;
const URLS = WEB_ADDRESS;

const canon = (int, frac, mult) => {
  const v = parseFloat(`${int.replace(/,/g, '')}${frac ? `.${frac}` : ''}`);
  return String(Number((v * (mult ?? 1)).toPrecision(12)));
};

// Every number in a text, as { raw, key }. Numbers in URLs and hashtags and list numbering ("1. ") are not claims.
export function numbersIn(text) {
  const t = String(text ?? '').replace(URLS, ' ').replace(/^\s*\d+[.)]\s/gm, ' ');
  const out = [];
  for (const m of t.matchAll(NUM)) {
    const suffix = (m[3] ?? m[4] ?? '').toLowerCase();
    out.push({ raw: m[0].trim(), key: canon(m[1], m[2], MULT[suffix]) });
  }
  return out;
}

export const numberKeys = (text) => new Set(numbersIn(text).map((n) => n.key));

export function unsourcedNumbers(text, allowedKeys) {
  const seen = new Set();
  return numbersIn(text).filter((n) => !allowedKeys.has(n.key) && !seen.has(n.key) && seen.add(n.key)).map((n) => n.raw);
}

const flat = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Quoted passages of three words or more (curly or straight quotes).
export function quotesIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/[“"]([^“”"]{8,400})[”"]/gu)) if (flat(m[1]).split(' ').length >= 3) out.push(m[1]);
  return out;
}
export const quoteIsSourced = (quote, sourceText) => flat(sourceText).includes(flat(quote));

// Brand spelling fixes and emoji removal, leaving web addresses alone.
export const EMOJI_G = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}‍️]/gu;
export function fixSpelling(text, rules) {
  const keep = [];
  let t = String(text).replace(WEB_ADDRESS, (m) => { keep.push(m); return `\u0000${keep.length - 1}\u0000`; });
  for (const r of rules ?? []) t = t.replace(new RegExp(r.wrong, `${(r.flags ?? '').replace('g', '')}g`), r.right);
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
}

const US_WORDS = /\b(colou?r(?:s|ed|ful)?|organi[sz]\w*|centre|center(?:s|ed)?|favou?rite|behaviou?r|labou?r|analy[sz]\w*|recogni[sz]\w*|catalog(?:ue)?|honou?r|neighbou?r|prioriti[sz]\w*|minimi[sz]\w*|customi[sz]\w*)\b/gi;
const UK_OK = /colour|organis|centre|favourite|behaviour|labour|analys|recognis|catalogue|honour|neighbour|prioritis|minimis|customis/i;
export function usSpellings(text) {
  return [...new Set([...String(text).matchAll(US_WORDS)].map((m) => m[0]).filter((w) => !UK_OK.test(w)))];
}

export const isTitleCase = (headline) => {
  const words = flat(headline).split(' ').filter((w) => w.length > 3);
  const raw = String(headline).replace(/\*/g, '').split(/\s+/).filter((w) => w.replace(/[^\p{L}]/gu, '').length > 3);
  return raw.length >= 4 && raw.every((w) => /^\p{Lu}/u.test(w.replace(/^[^\p{L}]+/u, ''))) && words.length >= 4;
};

const sentences = (t) => t.split(/(?<=[.!?])\s+/);
// Cuts a caption to whole sentences within the limit; null when not even the first sentence fits.
export function trimToLimit(text, limit) {
  if ([...text].length <= limit) return text;
  let out = '';
  for (const s of sentences(text.replace(/\s+#\S+(\s+#\S+)*\s*$/u, ''))) {
    const next = out ? `${out} ${s}` : s;
    if ([...next].length > limit) break;
    out = next;
  }
  return out.trim() || null;
}
