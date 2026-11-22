// The headline editor's two-way converter: the stored markup (*colour*, [[pill]], {{icon}}) to runs of words and back, and the edits a
// person makes on the runs (Colour, Pill, Plain, an icon at the cursor, typing and pasting). The engine's own reading of the markup is the
// reference: every value the converter writes is checked against the engine's markProblems and fmtE.
import { describe, expect, it } from 'vitest';
import { engineImport } from './server/engine/root.js';
import {
  applyStyle, cleanInput, describeMarks, ICON_CHAR, insertIcon, markProblems, normalise, parseMarkup, plainText, replaceRange, toMarkup, type Run,
} from '../web/src/pages/batches/editor/headline-markup';

const { markProblems: engineMarkProblems, pillMarks, iconMarks } = await engineImport<{ markProblems(t: string, f: string): string[]; pillMarks(): RegExp; iconMarks(): RegExp }>('design/post-spec');
// the engine's formatter of an editorial headline (design/templates/common.mjs, outside the package's exports)
const commonUrl = new URL('../../../packages/engine/design/templates/common.mjs', import.meta.url).href;
const { fmtE } = (await import(/* @vite-ignore */ commonUrl)) as { fmtE(s: string): string };

const runsOf = (v: string): Run[] => { const p = parseMarkup(v); if (!p.ok) throw new Error(p.reason); return p.runs; };
// Where words sit in the editor's text: the offsets of `words` in plainText.
const at = (runs: Run[], words: string): [number, number] => { const i = plainText(runs).indexOf(words); expect(i, words).toBeGreaterThan(-1); return [i, i + words.length]; };
function style(value: string, words: string, s: 'em' | 'pill' | 'text') {
  const runs = runsOf(value);
  const r = applyStyle(runs, ...at(runs, words), s);
  return r.ok ? toMarkup(r.runs) : `refused: ${r.reason}`;
}

describe('markup to runs and back', () => {
  it('reads colour, pills, icons and line breaks', () => {
    expect(runsOf('Save together, *see every* [[euro]] {{arrow-right}}')).toEqual([
      { t: 'text', text: 'Save together, ' }, { t: 'em', text: 'see every' }, { t: 'text', text: ' ' }, { t: 'pill', text: 'euro' }, { t: 'text', text: ' ' }, { t: 'icon', name: 'arrow-right' },
    ]);
    expect(runsOf('Line one\n*line two*')).toEqual([{ t: 'text', text: 'Line one\n' }, { t: 'em', text: 'line two' }]);
    expect(runsOf('')).toEqual([]);
  });
  it('writes back exactly the string it read', () => {
    for (const v of [
      'Save together, *see every* [[euro]] {{arrow-right}}', 'Plain words only', '*All of it*', '{{star}} New [[blend]], *now*',
      'A [single bracket] and {brace}', 'Two [[small]] [[pills]] here', 'Line one\nline two', 'R&D <b>not html</b> "quotes"', '[[[euro]]', '{{{star}}',
      '*a\nb* c', 'Café ☕ naïve',
    ]) expect(toMarkup(runsOf(v)), v).toBe(v);
  });
  it('reads the two characters \\n as a line break, as the engine does', () => {
    expect(toMarkup(runsOf('one\\ntwo'))).toBe('one\ntwo');
  });
  it('agrees with the engine on what is coloured', () => {
    for (const v of ['Save *see every* now', '*a* and *b*', 'x *y\nz*']) {
      const em = [...fmtE(v).matchAll(/<em data-role="accent">(.*?)<\/em>/g)].map((m) => m[1]!.replace(/<br>/g, '\n'));
      expect(runsOf(v).filter((r) => r.t === 'em').map((r) => (r as { text: string }).text), v).toEqual(em);
    }
  });
  it('agrees with the engine on what is a pill and an icon', () => {
    for (const v of ['[[a]] b {{star}}', 'x [[[y]] z', 'p {{{star}}', '[[one two]], {{heart}} and [[three]]']) {
      const runs = runsOf(v);
      expect(runs.filter((r) => r.t === 'pill').map((r) => (r as { text: string }).text)).toEqual([...v.matchAll(pillMarks())].map((m) => m[1]));
      expect(runs.filter((r) => r.t === 'icon').map((r) => (r as { name: string }).name)).toEqual([...v.matchAll(iconMarks())].map((m) => m[1]));
    }
  });
  it('refuses, with a reason, what it cannot show exactly (the field is then edited as text)', () => {
    for (const v of ['5 * 3 rule', 'a ** b', '*a [[b]]*', '*{{star}} x*', 'a [[ b', 'a ]] b', 'x {{Star}}', '[[way too many letters for any pill to hold here]]']) {
      const p = parseMarkup(v);
      expect(p.ok, v).toBe(false);
      if (!p.ok) expect(p.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('normalise keeps every value safe to write', () => {
  it('takes out what would read as a mark', () => {
    expect(toMarkup(normalise([{ t: 'text', text: 'a*b [[c' }]))).toBe('ab [c');
    expect(toMarkup(normalise([{ t: 'text', text: 'a[' }, { t: 'em', text: '' }, { t: 'text', text: '[b' }]))).toBe('a[b');
    expect(toMarkup(normalise([{ t: 'pill', text: 'a]b\nc' }]))).toBe('[[ab c]]');
    expect(toMarkup(normalise([{ t: 'em', text: '  ' }, { t: 'text', text: 'x' }]))).toBe('  x');
    expect(toMarkup(normalise([{ t: 'em', text: 'a' }, { t: 'em', text: 'b' }, { t: 'pill', text: 'c' }, { t: 'pill', text: 'd' }]))).toBe('*ab*[[c]][[d]]');
  });
  it('always parses back to itself, for any runs (a seeded random walk)', () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    const alphabet = ['a', 'b', ' ', '*', '[', ']', '{', '}', '\\', 'n', '\n', 'é', '😀', ','];
    const word = () => Array.from({ length: rnd(6) }, () => alphabet[rnd(alphabet.length)]).join('');
    for (let i = 0; i < 3000; i++) {
      const runs: Run[] = Array.from({ length: 1 + rnd(6) }, () => {
        const k = rnd(4);
        return k === 3 ? { t: 'icon', name: ['star', 'heart', 'arrow-right'][rnd(3)]! } : { t: (['text', 'em', 'pill'] as const)[k]!, text: word() };
      });
      const n = normalise(runs);
      const back = parseMarkup(toMarkup(n));
      expect(back.ok, JSON.stringify(runs)).toBe(true);
      if (back.ok) expect(back.runs, JSON.stringify(runs)).toEqual(n);
      // the engine finds no stray mark in it either
      expect(engineMarkProblems(toMarkup(n), 'headline').filter((m: string) => /not closed|holds a pill or an icon/.test(m)), toMarkup(n)).toEqual([]);
    }
  });
});

describe('Colour, Pill and Plain on a selection', () => {
  it('colours the selected words, and makes them plain when pressed again', () => {
    expect(style('Save together, see every euro', 'see every', 'em')).toBe('Save together, *see every* euro');
    expect(style('Save together, *see every* euro', 'see every', 'em')).toBe('Save together, see every euro');
    expect(style('Save together, *see every* euro', 'every', 'text')).toBe('Save together, *see* every euro');
  });
  it('leaves spaces at the edges of a selection outside', () => {
    expect(style('Save together now', ' together ', 'em')).toBe('Save *together* now');
  });
  it('joins coloured words the selection touches into one run', () => {
    expect(style('Save *see* every euro', 'see every', 'em')).toBe('Save *see every* euro');
  });
  it('sets one to three whole words in a pill', () => {
    expect(style('Coffee on us today', 'on us', 'pill')).toBe('Coffee [[on us]] today');
    expect(style('Coffee on us today', 'n u', 'pill')).toBe('Coffee [[on us]] today');
    expect(style('Coffee [[on us]] today', 'on us', 'pill')).toBe('Coffee on us today');
    expect(style('Coffee [[on us]] today', 'us', 'text')).toBe('Coffee [[on]] us today');
  });
  it('refuses overlapping styles politely', () => {
    expect(style('Save *see every* euro', 'every euro', 'pill')).toMatch(/^refused: Some of these words are coloured/);
    expect(style('Save [[see every]] euro', 'every euro', 'em')).toMatch(/^refused: Some of these words are in a pill/);
    expect(style('Save {{star}} now', 'Save ' + ICON_CHAR, 'em')).toMatch(/^refused: An icon cannot be coloured/);
  });
  it('keeps to the per-look limits for pills', () => {
    expect(style('one two three four five', 'one two three four', 'pill')).toMatch(/^refused: A pill holds one to three words/);
    expect(style('extraordinarily wonderful things here', 'extraordinarily wonderful', 'pill')).toMatch(/^refused: A pill holds up to 24 letters/);
    expect(style('[[a]] [[b]] c d', 'c', 'pill')).toMatch(/^refused: A headline takes two pills at most/);
    expect(style('Coffee', 'Coffee', 'pill')).toMatch(/^refused: A pill cannot be the whole headline/);
    expect(style('one\ntwo three', 'one\ntwo', 'pill')).toMatch(/^refused: A pill stays on one line/);
    const runs = runsOf('a b c');
    const one = applyStyle(runs, ...at(runs, 'b'), 'pill', { pills: 1, icons: 1, pillWords: 1, pillChars: 10 });
    expect(one.ok && toMarkup(one.runs)).toBe('a [[b]] c');
  });
  it('asks for a selection, and says when there is nothing to make plain', () => {
    expect(style('Coffee', 'Coffee', 'text')).toBe('refused: Those words are plain already.');
    const r = applyStyle(runsOf('Coffee'), 2, 2, 'em');
    expect(r.ok ? '' : r.reason).toBe('Select some words first.');
  });
  it('returns the selection it styled', () => {
    const runs = runsOf('Coffee on us today');
    const r = applyStyle(runs, 8, 9, 'pill');
    expect(r.ok && [r.start, r.end]).toEqual([7, 9]);
  });
});

describe('icons, typing and pasting', () => {
  it('puts an icon at the cursor with a space where it touches a word', () => {
    const runs = runsOf('New blend');
    const r = insertIcon(runs, 3, 'star');
    expect(r.ok && toMarkup(r.runs)).toBe('New {{star}} blend');
    const r2 = insertIcon(runsOf('New'), 0, 'star');
    expect(r2.ok && toMarkup(r2.runs)).toBe('{{star}} New');
  });
  it('keeps to the icon limit and keeps icons out of coloured words and pills', () => {
    const two = insertIcon(runsOf('{{star}} {{heart}} x'), 0, 'leaf');
    expect(two.ok ? '' : two.reason).toMatch(/two icons at most/);
    const inEm = insertIcon(runsOf('a *bold words* c'), 5, 'leaf');
    expect(inEm.ok ? '' : inEm.reason).toMatch(/outside the coloured or pill words/);
    const inPill = insertIcon(runsOf('a [[two words]] c'), 5, 'leaf');
    expect(inPill.ok ? '' : inPill.reason).toMatch(/outside the coloured or pill words/);
    const atEdge = insertIcon(runsOf('a *bold* c'), 7, 'leaf');
    expect(atEdge.ok && toMarkup(atEdge.runs)).toBe('a *bold* {{leaf}} c');
  });
  it('typed letters take the style of where they land, never growing a pill from its edge', () => {
    const t = (v: string, words: string, text: string, end = true) => { const runs = runsOf(v); const [s, e] = at(runs, words); const p = end ? e : s; const r = replaceRange(runs, p, p, text); return r.ok && toMarkup(r.runs); };
    expect(t('a *bold* c', 'bold', 'er')).toBe('a *bolder* c');
    expect(t('a *bold* c', 'bo', 'x')).toBe('a *boxld* c');
    expect(t('a [[pill]] c', 'pill', 's')).toBe('a [[pill]]s c');
    expect(t('a [[pill]] c', 'pi', 'x')).toBe('a [[pixll]] c');
    expect(t('a [[pill]] c', 'pill', 'x', false)).toBe('a x[[pill]] c');
    expect(t('a [[two words]] c', 'two', '\n')).toBe('a [[two]]\n[[ words]] c');
  });
  it('replaces a selection and deletes across marks', () => {
    const runs = runsOf('Save *see every* [[euro]] now');
    const [s] = at(runs, 'every'); const [, e] = at(runs, 'euro');
    const r = replaceRange(runs, s, e, '');
    expect(r.ok && toMarkup(r.runs)).toBe('Save *see * now');
    expect(r.ok && [r.start, r.end]).toEqual([s, s]);
  });
  it('pastes plain text without the characters that make marks', () => {
    expect(cleanInput('Save *50%* on [[all]] {{star}}\r\nnow\tplease')).toEqual({ text: 'Save 50% on all star\nnow please', dropped: true });
    expect(cleanInput('Plain words')).toEqual({ text: 'Plain words', dropped: false });
  });
  it('counts a letter outside the basic plane as the browser does', () => {
    const runs = runsOf('😀 hi there');
    const r = applyStyle(runs, 3, 5, 'em');
    expect(r.ok && toMarkup(r.runs)).toBe('😀 *hi* there');
  });
});

describe('what the engine would refuse, in plain words', () => {
  it('names too many pills or icons, long pills, a pill that is the whole line and unknown icons', () => {
    expect(markProblems(runsOf('[[a]] [[b]] [[c]] d'))).toEqual(['It has 3 pills; a headline takes two at most.']);
    expect(markProblems(runsOf('[[one two three four]] x'))[0]).toMatch(/holds 4 words/);
    expect(markProblems(runsOf('[[a]] {{x-y}}'), undefined, ['star'])).toEqual(['A pill cannot be the whole headline. Leave some words outside it.', '"x-y" is not one of the icons.']);
    expect(markProblems(runsOf('{{star}} {{star}} {{star}} x'))).toEqual(['It has 3 icons; a headline takes two at most.']);
    expect(markProblems(runsOf('Save *see every* [[euro]] {{arrow-right}}'))).toEqual([]);
  });
  it('describes the marks for a screen reader', () => {
    expect(describeMarks(runsOf('Save *see every* [[euro]] {{arrow-right}}'))).toBe('Coloured: see every. In a pill: euro. Icon: arrow right.');
    expect(describeMarks(runsOf('Plain'))).toBe('No styled words.');
  });
});
