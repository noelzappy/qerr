// node --test   (emoji in the words of a post: off unless the brand turns them on; then real emoji only, at most three per text, drawn with the
// engine's own colour emoji font and measured like any other letter)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EMOJI_MAX, emojiIn, emojiProblem, hasEmoji, limitEmoji } from './lib/design/emoji.mjs';
import { postProblems, seenText } from './lib/design/post-spec.mjs';
import { validateDesign, normaliseDesign } from './lib/design/spec.mjs';
import { loadBrand, validateBrand } from './lib/design/brand.mjs';
import { emojiFacesFor, emojiLibrary, emojiLibraryProblems } from './lib/design/font-library.mjs';
import { lintText } from './lib/design/lint.mjs';
import { renderPostWithLook, shippedLooks } from './lib/design/directions/index.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { renderImage } from './lib/design/render.mjs';

const brand = loadBrand();
const ZWJ_FAMILY = '👨‍👩‍👧', TONE = '👍🏽', FLAG = '🇬🇭', KEYCAP = '1️⃣', TAG_FLAG = '🏴󠁧󠁢󠁳󠁣󠁴󠁿';

test('emojiIn: real emoji (single, skin tones, flags, keycaps, ZWJ sequences, tag flags) are counted; broken clusters are not emoji', () => {
  assert.deepEqual(emojiIn(`Hi 🎉 ${TONE} ${FLAG} ${KEYCAP} ${ZWJ_FAMILY} ${TAG_FLAG}`).emoji, ['🎉', TONE, FLAG, KEYCAP, ZWJ_FAMILY, TAG_FLAG]);
  assert.deepEqual(emojiIn('© 2026 Tallyho™ ☺ ❤ ↔'), { emoji: [], bad: 0 }, 'plain text symbols stay text');
  assert.deepEqual(emojiIn('\u{1F3FD}').emoji, ['\u{1F3FD}'], 'a skin tone swatch on its own is a standard emoji');
  for (const broken of ['a‍b', '\u{1F1EC}', 'x\u{E0067}\u{E007F}', `${TONE}\u{1F3FD}`, '️', 'a⃣'])
    assert.ok(emojiIn(broken).bad > 0, `broken: ${JSON.stringify(broken)}`);
  assert.equal(hasEmoji('plain words'), false);
  assert.equal(hasEmoji('yes 🎉'), true);
});

test('emoji in a post: refused when the brand has them off; on, at most three real ones per text', () => {
  const post = (fields, on) => postProblems({ template: 'post', kind: 'statement', headline: 'Count every voice', ...fields }, 'design', { emoji: on });
  assert.match(post({ headline: 'Vote now 🗳️' }, false).join(), /headline has an emoji; emoji are off for this brand \(turn them on in Settings, Brand, Emoji in post images\)/);
  assert.match(post({ headline: 'Vote now 🗳️' }, undefined).join(), /emoji are off/, 'off unless turned on');
  assert.deepEqual(post({ headline: `Vote now 🗳️ ${TONE}${ZWJ_FAMILY}` }, true), []);
  assert.match(post({ headline: 'Vote 🗳️🎉🙌🔥' }, true).join(), /headline has 4 emoji; the most is 3/);
  assert.match(post({ sub: 'a‍b' }, true).join(), /sub has a character that is not a standard emoji/);
  assert.match(post({ sub: 'a‍b' }, false).join(), /sub has an emoji; emoji are off/);
  // every text field, the list items, info values and picture captions
  for (const [k, v] of [['label', 'New 🎉'], ['tag', '🎉'], ['cta', 'Join 🙌']]) assert.match(post({ [k]: v }, false).join(), new RegExp(`${k} has an emoji`));
  assert.match(postProblems({ template: 'post', kind: 'list', headline: 'Steps', items: ['One 🎉', 'Two'] }, 'design', {}).join(), /items\[0\] has an emoji/);
  assert.match(postProblems({ template: 'post', kind: 'statement', headline: 'H', info: [{ key: 'When', value: 'Friday 🎉' }] }, 'design', {}).join(), /info\[0\]\.value has an emoji/);
  // an emoji counts as two characters toward a field's limit, whatever its code points
  assert.equal([...seenText(`${ZWJ_FAMILY}x`)].length, 3);
  assert.deepEqual(post({ tag: `${'x'.repeat(14)}${ZWJ_FAMILY}` }, true), [], '14 letters and a family are 16');
  assert.match(post({ tag: `${'x'.repeat(15)}🎉` }, true).join(), /tag is 17 characters; the most is 16/);
  // validateDesign passes the setting through
  assert.deepEqual(validateDesign({ template: 'post', kind: 'statement', headline: 'Hi 🎉' }, 'design', { direction: 'editorial', emoji: true }), []);
  assert.match(validateDesign({ template: 'post', kind: 'statement', headline: 'Hi 🎉' }, 'design', { direction: 'editorial' }).join(), /emoji are off/);
});

test('emoji messages never echo the text; hostile and odd input is refused cleanly', () => {
  const nasty = `</style><script>x</script>🎉🎉🎉🎉 ${'‮'}`;
  for (const on of [true, false]) {
    const m = emojiProblem(nasty, 'headline', on);
    assert.ok(m && !m.includes('<') && !m.includes('🎉') && m.length < 200, m);
  }
  assert.equal(emojiProblem('plain', 'headline', false), null);
  assert.equal(limitEmoji('A 🎉 B 🙌 C 🔥 D 💥', { on: true }), 'A 🎉 B 🙌 C 🔥 D');
  assert.equal(limitEmoji('A 🎉 B', { on: false }), 'A B');
  assert.equal(limitEmoji('a‍b 🎉', { on: true }), 'ab 🎉', 'a stray joiner is dropped');
  assert.equal(limitEmoji(42), 42);
  assert.equal(EMOJI_MAX, 3);
});

test('the brand setting: emoji is true or false, and never in the brand name; lint stops warning when it is on', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), '..', '..', 'brands', 'demo', 'brand.json'), 'utf8'));
  assert.deepEqual(validateBrand({ ...raw, emoji: true }), []);
  for (const v of ['yes', 1, null, {}]) assert.match(validateBrand({ ...raw, emoji: v }).join(), /emoji must be true or false/);
  assert.match(validateBrand({ ...raw, name: 'Demo 🎉' }).join(), /name takes no emoji/);
  assert.match(validateBrand({ ...raw, emoji: true, name: 'Demo 🎉' }).join(), /name takes no emoji/, 'not even when emoji are on');
  assert.match(lintText([{ field: 'headline', text: 'Vote 🎉' }], 'feed', brand).join(), /contains an emoji/);
  assert.doesNotMatch(lintText([{ field: 'headline', text: 'Vote 🎉' }], 'feed', { ...brand, emoji: true }).join(), /emoji/);
});

test('the emoji font: an OFL COLRv1 build in slices, checked; a page embeds only the slices its emoji need', () => {
  assert.deepEqual(emojiLibraryProblems(), []);
  assert.equal(emojiLibrary().license, 'OFL-1.1');
  assert.deepEqual(emojiFacesFor('no emoji here ©'), { css: '', files: [] });
  const one = emojiFacesFor('Vote 🎉');
  assert.ok(one.files.length >= 1 && one.files.length <= 2 && one.files.every((f) => f.bytes < 300000), 'only the slices that hold it');
  assert.match(one.css, /^(@font-face\{font-family:"VF Emoji";src:url\("data:font\/woff2;base64,[A-Za-z0-9+/=]+"\) format\("woff2"\);font-weight:100 900;font-style:normal;unicode-range:[U+0-9A-F, -]+\})+$/);
  assert.ok(emojiFacesFor(`${FLAG}`).files.some((f) => f.bytes > 500000), 'flags come from their own slice');
  // a look page with emoji names the emoji font in its stacks and embeds it; one without emoji is unchanged
  const look = { ...shippedLooks().loud, origin: 'copy:shipped:loud' };
  const draw = (headline) => renderPostWithLook(look, { template: 'post', name: 'e', kind: 'statement', variant: 0, headline }, { size: SIZES.feed, brand: { ...brand, emoji: true }, image: () => '', imageSize: () => null });
  const with_ = draw('We counted *every* vote 🗳️'), without = draw('We counted *every* vote');
  assert.match(with_.css, /font-family:"VF Emoji"/);
  assert.match(with_.body, /--f-display:'VF [A-Za-z ]+','VF Emoji',/);
  assert.doesNotMatch(without.css, /VF Emoji/);
  assert.doesNotMatch(without.body, /VF Emoji/);
  // the emoji reach the page as text, escaped like any other
  assert.match(draw('<b>x</b> 🗳️').body, /&lt;b&gt;x&lt;\/b&gt; 🗳️/);
});

// ---- in Chrome ----
const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-emoji-'));
let browser;
test.before(async () => { if (chrome) browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(tmp, 'design.lock') }); });
test.after(() => { browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('in Chrome: emoji are drawn in colour from the embedded font, measured by the fit, and nothing is fetched', { skip }, async () => {
  const look = { ...shippedLooks().loud, origin: 'copy:shipped:loud' };
  const b = { ...brand, emoji: true, looks: [look], style: { ...brand.style, direction: 'loud' } };
  const r = await renderImage(browser, b, { spec: normaliseDesign({ template: 'post', name: 'emo', kind: 'statement', variant: 0, headline: 'We counted *every* vote 🗳️🎉' }), sizeName: 'feed', outFile: path.join(tmp, 'emo.png') }, { tmpDir: tmp });
  assert.ok(!r.warnings.some((w) => /outside resource/.test(w)), r.warnings.join(' | '));
  assert.ok(r.post.fonts.some((f) => f.family === 'Noto Color Emoji'), 'the emoji slices are embedded');
  // the glyphs come from the emoji font: a page that draws one emoji large has colour pixels far from the brand's own
  const page = await browser.page(400, 200);
  try {
    const face = emojiFacesFor('🎉').css;
    await page.setContent(`<!doctype html><style>${face}</style><div id="e" style="font:160px 'VF Emoji';line-height:1">🎉</div>`);
    const w = await page.evaluate("document.fonts.load(\"160px 'VF Emoji'\", '🎉').then(() => document.fonts.check(\"160px 'VF Emoji'\", '🎉'))");
    assert.equal(w, true, 'the emoji face loads from its data: URI');
    const width = await page.evaluate("document.getElementById('e').getBoundingClientRect().width");
    assert.ok(width > 120, `measured as a wide glyph (${width})`);
  } finally { await page.close(); }
});
