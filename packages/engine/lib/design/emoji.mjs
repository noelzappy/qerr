// Emoji in the words of a post. Off unless the brand turns them on (brand.json "emoji": true, Settings, Brand). When on, a text field may
// carry at most EMOJI_MAX emoji, and only real ones: every character cluster that looks like an emoji must be one of Unicode's recommended
// emoji (RGI: single emoji, skin tones, flags, keycaps, ZWJ sequences such as families), never a stray joiner, a doubled skin tone, a lone
// regional indicator or a tag run. A plain text symbol (©, ™, ☺ without the emoji selector) is text, as before. Emoji are drawn with the
// engine's own colour emoji font (design/fonts/noto-color-emoji, font-library.mjs emojiFacesFor); nothing is fetched. Pure.

export const EMOJI_MAX = 3;
// one RGI emoji, the whole cluster
const RGI = /^\p{RGI_Emoji}$/v;
const RGI_G = /\p{RGI_Emoji}/gv;
// what makes a cluster look like an emoji: a pictograph, a regional indicator, a joiner, the emoji selector, the keycap mark, a skin tone, a tag
const MARKS = /[\p{Extended_Pictographic}\p{Regional_Indicator}‍️⃣\p{Emoji_Modifier}\u{E0020}-\u{E007F}]/u;
const MARKS_G = new RegExp(MARKS.source, 'gu');
const PLAIN_SYMBOL =/^\p{Extended_Pictographic}$/u;
const PRESENTED = /\p{Emoji_Presentation}/u;
const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });

// The emoji of a text: { emoji: [clusters], bad: number } (bad: clusters that look like emoji but are not real ones).
export function emojiIn(text) {
  const out = { emoji: [], bad: 0 };
  if (typeof text !== 'string' || !MARKS.test(text)) return out;
  for (const { segment: s } of seg.segment(text)) {
    if (!MARKS.test(s)) continue;
    if (RGI.test(s)) out.emoji.push(s);
    else if (PLAIN_SYMBOL.test(s) && !PRESENTED.test(s)) continue;
    else out.bad += 1;
  }
  return out;
}

// The problem with the emoji of one text field (a sentence, or null). on: whether the brand turns emoji on. The text is never echoed.
export function emojiProblem(text, what, on) {
  const { emoji, bad } = emojiIn(text);
  if (!emoji.length && !bad) return null;
  if (!on) return `${what} has an emoji; emoji are off for this brand (turn them on in Settings, Brand, Emoji in post images)`;
  if (bad) return `${what} has a character that is not a standard emoji (a stray joiner, skin tone, flag letter or tag); use whole emoji only`;
  if (emoji.length > EMOJI_MAX) return `${what} has ${emoji.length} emoji; the most is ${EMOJI_MAX}`;
  return null;
}

// The text with what the brand does not allow taken out: every emoji when they are off, else broken clusters and any past the first `max`.
export function limitEmoji(text, { on = false, max = EMOJI_MAX } = {}) {
  if (typeof text !== 'string' || !MARKS.test(text)) return text;
  let kept = 0, out = '';
  for (const { segment: s } of seg.segment(text)) {
    if (!MARKS.test(s)) { out += s; continue; }
    if (RGI.test(s)) { if (on && kept < max) { out += s; kept++; } continue; }
    if (PLAIN_SYMBOL.test(s) && !PRESENTED.test(s)) { out += s; continue; }
    // a broken cluster: its letters stay, the marks go
    out += s.replace(MARKS_G, '');
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

// Whether a text holds a real emoji (the page then embeds the emoji font).
export const hasEmoji = (text) => typeof text === 'string' && MARKS.test(text) && emojiIn(text).emoji.length > 0;
// Each real emoji counted as two characters (as wide as two letters), for the length limits.
export const emojiAsTwo = (text) => String(text).replace(RGI_G, '■■');
