// The headline's markup and the editor's model of it, both ways. The stored value stays the markup string the engine reads
// (packages/engine/lib/design/post-spec.mjs INLINE, design/templates/common.mjs fmtE): *words* in the second colour, [[words]] in a pill,
// {{name}} an icon, and a line break as a new line (or the two characters \n). The editor works on runs of words instead, so a person
// selects words and presses Colour, Pill or Plain and never types a mark. Pure: tested without a browser (web-headline-markup.spec.ts).
//
// The rules the engine reads, mirrored here:
//   - emphasis: the asterisks pair up left to right (`\*([^*]+)\*`); an asterisk with no partner, or two side by side, is shown as itself.
//   - a pill: [[ one to 40 characters with no [ ] * { } \ or line break ]]; an icon: {{ a lowercase name }}.
//   - an emphasis holds no pill or icon; a [[ ]] {{ }} that is not part of a mark is refused.
// A value the editor cannot show exactly (an unpaired asterisk, a stray [[, a pill inside the coloured words) is not changed: parseMarkup
// says why and the field is edited as text.

export type Run = { t: 'text'; text: string } | { t: 'em'; text: string } | { t: 'pill'; text: string } | { t: 'icon'; name: string };
export type Style = 'text' | 'em' | 'pill';
export type Parsed = { ok: true; runs: Run[] } | { ok: false; reason: string };

// The engine's limits on a headline's inline marks (post-spec.mjs INLINE).
export interface MarkLimits { pills: number; icons: number; pillWords: number; pillChars: number }
export const INLINE_LIMITS: MarkLimits = { pills: 2, icons: 2, pillWords: 3, pillChars: 24 };

// An icon is one character of the editor's text (the object replacement character), so a selection counts it once.
export const ICON_CHAR = '￼';
const PILL = /\[\[([^[\]*{}\n\\]{1,40})\]\]|\{\{([a-z][a-z-]{0,19})\}\}/g;
const STRAY = /\[\[|\]\]|\{\{|\}\}/;
const ICON_NAME = /^[a-z][a-z-]{0,19}$/;

// ---- markup -> runs ----

export function parseMarkup(value: string): Parsed {
  const src = String(value ?? '').replace(/\\n/g, '\n');
  const parts = src.split('*');
  if (parts.length % 2 === 0) return { ok: false, reason: 'It has an asterisk with no partner, which the engine shows as it is.' };
  const runs: Run[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (i % 2 === 1) {
      if (part === '') return { ok: false, reason: 'It has two asterisks side by side, which the engine shows as they are.' };
      if (STRAY.test(part)) return { ok: false, reason: 'Its coloured words hold a pill or an icon, which the engine refuses.' };
      runs.push({ t: 'em', text: part });
      continue;
    }
    let at = 0;
    for (const m of part.matchAll(PILL)) {
      const before = part.slice(at, m.index);
      if (STRAY.test(before)) return { ok: false, reason: 'It has a [[ or {{ that is not a pill or an icon.' };
      if (before) runs.push({ t: 'text', text: before });
      runs.push(m[1] !== undefined ? { t: 'pill', text: m[1] } : { t: 'icon', name: m[2]! });
      at = m.index! + m[0].length;
    }
    const rest = part.slice(at);
    if (STRAY.test(rest)) return { ok: false, reason: 'It has a [[ or {{ that is not a pill or an icon.' };
    if (rest) runs.push({ t: 'text', text: rest });
  }
  return { ok: true, runs: merge(runs) };
}

// ---- runs -> markup ----

export function toMarkup(runs: readonly Run[]): string {
  return runs.map((r) => (r.t === 'icon' ? `{{${r.name}}}` : r.t === 'em' ? `*${r.text}*` : r.t === 'pill' ? `[[${r.text}]]` : r.text)).join('');
}

// Makes any runs safe to write as markup: what would read as a mark is taken out of the words, empty runs go, and runs of the same style
// that touch become one (two pills that touch stay two). toMarkup(normalise(r)) always parses back to normalise(r).
export function normalise(runs: readonly Run[]): Run[] {
  // cleaning can empty a run, and the runs either side of it then touch: so clean and join until nothing changes
  let cur = merge(runs.map((x) => ({ ...x })));
  for (let pass = 0; pass < 4; pass++) {
    const next = merge(cur.flatMap(cleanRun));
    if (toMarkup(next) === toMarkup(cur) && next.length === cur.length) return next;
    cur = next;
  }
  return cur;
}
function cleanRun(r: Run): Run[] {
  if (r.t === 'icon') return ICON_NAME.test(r.name) ? [r] : [];
  if (r.t === 'pill') {
    const text = r.text.replace(/[[\]{}*\\]/g, '').replace(/\n/g, ' ');
    if (!text.trim()) return text ? [{ t: 'text', text }] : [];
    return [...text].length > 40 ? [{ t: 'text', text: safeWords(text) }] : [{ t: 'pill', text }];
  }
  const text = safeWords(r.text);
  if (!text) return [];
  return [{ t: r.t === 'em' && !text.trim() ? 'text' : r.t, text }];
}
// Words outside a pill: no asterisk, no doubled bracket or brace, \n as a line break.
function safeWords(s: string): string {
  let t = s.replace(/\*/g, '').replace(/\\n/g, '\n');
  while (STRAY.test(t)) t = t.replace(/\[\[/g, '[').replace(/\]\]/g, ']').replace(/\{\{/g, '{').replace(/\}\}/g, '}');
  return t;
}
function merge(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (r.t !== 'icon' && r.text === '') continue;
    if (last && last.t === r.t && (r.t === 'text' || r.t === 'em')) (last as { text: string }).text += (r as { text: string }).text;
    else out.push(r);
  }
  return out;
}

// ---- the editor's text: one character per letter, one per icon ----

interface Cell { ch: string; t: Style | 'icon'; name?: string; id: number }
function toCells(runs: readonly Run[]): Cell[] {
  const cells: Cell[] = [];
  runs.forEach((r, id) => {
    if (r.t === 'icon') cells.push({ ch: ICON_CHAR, t: 'icon', name: r.name, id });
    else for (const ch of r.text) cells.push({ ch, t: r.t, id });
  });
  return cells;
}
// Cells back to runs: a pill is the cells of one pill (by id); text and emphasis join up.
function fromCells(cells: readonly Cell[]): Run[] {
  const runs: Run[] = [];
  let last: Cell | null = null;
  for (const c of cells) {
    if (c.t === 'icon') runs.push({ t: 'icon', name: c.name! });
    else {
      const cur = runs[runs.length - 1];
      if (cur && cur.t === c.t && last && last.t === c.t && (c.t !== 'pill' || last.id === c.id)) (cur as { text: string }).text += c.ch;
      else runs.push({ t: c.t, text: c.ch });
    }
    last = c;
  }
  return normalise(runs);
}
// What the editor shows as text, an icon as ICON_CHAR. Offsets of a selection are counted in this text (in UTF-16 units, as the browser does).
export const plainText = (runs: readonly Run[]): string => runs.map((r) => (r.t === 'icon' ? ICON_CHAR : r.text)).join('');
// From a browser offset (UTF-16) to a cell index, and back: a letter outside the basic plane is two units but one cell.
function cellAt(cells: readonly Cell[], offset: number): number {
  let units = 0;
  for (let i = 0; i < cells.length; i++) { if (units >= offset) return i; units += cells[i]!.ch.length; }
  return cells.length;
}
const unitsOf = (cells: readonly Cell[], index: number) => cells.slice(0, index).reduce((n, c) => n + c.ch.length, 0);

export type Edit = { ok: true; runs: Run[]; start: number; end: number } | { ok: false; reason: string };
const WS = /\s/;

// ---- typing ----

// Text a person typed or pasted, made safe to keep: the characters that make marks are left out (with `dropped` true), Windows line
// ends become plain ones and a tab a space.
export function cleanInput(s: string): { text: string; dropped: boolean } {
  const unified = String(s).replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  const text = unified.replace(/[*[\]{}\\\uFFFC]/g, '');
  return { text, dropped: text !== unified };
}

// The style typed letters take at a caret: inside a run, that run's; at the end of coloured words, coloured; never a pill's from its edge
// (a pill holds one to three words), never an icon's.
function styleAt(cells: readonly Cell[], i: number): { t: Style; id: number } {
  const left = cells[i - 1], right = cells[i];
  if (left && right && left.t === right.t && left.t !== 'icon' && left.id === right.id) return { t: left.t, id: left.id };
  if (left && left.t === 'em') return { t: 'em', id: left.id };
  return { t: 'text', id: -1 };
}

// Replaces [start, end) with `text` (already cleaned). The new letters take the style of where they land.
export function replaceRange(runs: readonly Run[], start: number, end: number, text: string): Edit {
  const cells = toCells(runs);
  const s = cellAt(cells, Math.min(start, end)), e = cellAt(cells, Math.max(start, end));
  const style = styleAt(cells, s);
  const kept = [...cells.slice(0, s), ...cells.slice(e)];
  // a pill keeps to one line: a line break typed inside one goes outside it
  const add: Cell[] = [...text].map((ch) => ({ ch, t: style.t === 'pill' && ch === '\n' ? 'text' : style.t, id: style.id }));
  const next = [...kept.slice(0, s), ...add, ...kept.slice(s)];
  const out = fromCells(next);
  const at = unitsOf(next, s + add.length);
  return { ok: true, runs: out, start: at, end: at };
}

// ---- styling a selection ----

export function applyStyle(runs: readonly Run[], start: number, end: number, style: Style, limits: MarkLimits = INLINE_LIMITS): Edit {
  const cells = toCells(runs);
  let s = cellAt(cells, Math.min(start, end)), e = cellAt(cells, Math.max(start, end));
  // spaces and line breaks at the edges stay outside
  while (s < e && WS.test(cells[s]!.ch)) s++;
  while (e > s && WS.test(cells[e - 1]!.ch)) e--;
  if (s >= e) return { ok: false, reason: 'Select some words first.' };
  const picked = cells.slice(s, e);
  if (style === 'text') {
    if (!picked.some((c) => c.t === 'em' || c.t === 'pill')) return { ok: false, reason: 'Those words are plain already.' };
    for (const c of picked) if (c.t !== 'icon') { c.t = 'text'; c.id = -1; }
    return done(cells, s, e);
  }
  if (picked.some((c) => c.t === 'icon')) return { ok: false, reason: 'An icon cannot be coloured or set in a pill. Select only words.' };
  const other = style === 'em' ? 'pill' : 'em';
  if (picked.some((c) => c.t === other)) {
    return { ok: false, reason: style === 'em' ? 'Some of these words are in a pill. Press Plain on them first, then Colour.' : 'Some of these words are coloured. Press Plain on them first, then Pill.' };
  }
  // pressed again on words that already have it: they become plain
  if (style === 'em' && picked.every((c) => c.t === 'em')) { for (const c of picked) { c.t = 'text'; c.id = -1; } return done(cells, s, e); }
  if (style === 'pill' && picked.every((c) => c.t === 'pill' && c.id === picked[0]!.id)) { for (const c of picked) { c.t = 'text'; c.id = -1; } return done(cells, s, e); }

  if (style === 'em') {
    // coloured words joined to the selection become one run
    for (const c of picked) { c.t = 'em'; c.id = -2; }
    return done(cells, s, e);
  }
  // a pill: whole words, and the whole of any pill it touches
  while (s > 0 && cells[s - 1]!.t === 'text' && !WS.test(cells[s - 1]!.ch) && !WS.test(cells[s]!.ch)) s--;
  while (e < cells.length && cells[e]!.t === 'text' && !WS.test(cells[e]!.ch) && !WS.test(cells[e - 1]!.ch)) e++;
  const touched = new Set(cells.slice(s, e).filter((c) => c.t === 'pill').map((c) => c.id));
  while (s > 0 && cells[s - 1]!.t === 'pill' && touched.has(cells[s - 1]!.id)) s--;
  while (e < cells.length && cells[e]!.t === 'pill' && touched.has(cells[e]!.id)) e++;
  const words = cells.slice(s, e).map((c) => c.ch).join('');
  if (words.includes('\n')) return { ok: false, reason: 'A pill stays on one line. Select words on one line.' };
  if (cells.slice(s, e).some((c) => c.t === 'em' || c.t === 'icon')) return { ok: false, reason: 'Some of these words are coloured. Press Plain on them first, then Pill.' };
  const count = words.trim().split(/\s+/).filter(Boolean).length;
  if (count > limits.pillWords) return { ok: false, reason: `A pill holds one to ${numberWord(limits.pillWords)} words. Select fewer words.` };
  if ([...words.trim()].length > limits.pillChars) return { ok: false, reason: `A pill holds up to ${limits.pillChars} letters. Select fewer words.` };
  const others = new Set(cells.filter((c, i) => c.t === 'pill' && (i < s || i >= e)).map((c) => c.id)).size;
  if (others + 1 > limits.pills) return { ok: false, reason: `A headline takes ${numberWord(limits.pills)} pill${limits.pills === 1 ? '' : 's'} at most. Make one plain first.` };
  const outside = cells.filter((c, i) => (i < s || i >= e) && c.t !== 'pill' && c.t !== 'icon').map((c) => c.ch).join('');
  if (!outside.trim()) return { ok: false, reason: 'A pill cannot be the whole headline. Leave some words outside it.' };
  for (let i = s; i < e; i++) { cells[i]!.t = 'pill'; cells[i]!.id = -3; }
  return done(cells, s, e);
}
function done(cells: Cell[], s: number, e: number): Edit {
  // a coloured run or a pill does not start or end with a space: what is left of one after Plain gives its edge spaces back
  for (let changed = true; changed;) {
    changed = false;
    cells.forEach((c, i) => {
      if ((c.t !== 'em' && c.t !== 'pill') || !WS.test(c.ch)) return;
      const prev = cells[i - 1], next = cells[i + 1];
      const same = (o: Cell | undefined) => !!o && o.t === c.t && (c.t === 'em' || o.id === c.id);
      if (!same(prev) || !same(next)) { c.t = 'text'; c.id = -1; changed = true; }
    });
  }
  return { ok: true, runs: fromCells(cells), start: unitsOf(cells, s), end: unitsOf(cells, e) };
}

// ---- icons ----

// Puts an icon at the caret, with a space on either side where it touches a word. Not inside coloured words or a pill.
export function insertIcon(runs: readonly Run[], at: number, name: string, limits: MarkLimits = INLINE_LIMITS): Edit {
  if (!ICON_NAME.test(name)) return { ok: false, reason: 'That is not one of the icons.' };
  const cells = toCells(runs);
  if (cells.filter((c) => c.t === 'icon').length >= limits.icons) return { ok: false, reason: `A headline takes ${numberWord(limits.icons)} icon${limits.icons === 1 ? '' : 's'} at most. Remove one first.` };
  const i = cellAt(cells, at);
  const left = cells[i - 1], right = cells[i];
  if (left && right && left.t === right.t && (left.t === 'em' || left.t === 'pill') && left.id === right.id) return { ok: false, reason: 'Put the cursor outside the coloured or pill words first.' };
  const add: Cell[] = [];
  if (left && !WS.test(left.ch)) add.push({ ch: ' ', t: 'text', id: -1 });
  add.push({ ch: ICON_CHAR, t: 'icon', name, id: -4 });
  if (right && !WS.test(right.ch)) add.push({ ch: ' ', t: 'text', id: -1 });
  const next = [...cells.slice(0, i), ...add, ...cells.slice(i)];
  const caret = unitsOf(next, i + add.length);
  return { ok: true, runs: fromCells(next), start: caret, end: caret };
}

// ---- what is wrong for the engine ----

// The problems the engine would report with a headline's marks, in plain words (empty when fine). `draws`: which marks the chosen
// design draws, when known; a mark it does not draw is not a problem, just shown plainly, so it is described by markNotes instead.
export function markProblems(runs: readonly Run[], limits: MarkLimits = INLINE_LIMITS, icons?: readonly string[]): string[] {
  const out: string[] = [];
  const pills = runs.filter((r): r is { t: 'pill'; text: string } => r.t === 'pill');
  const iconRuns = runs.filter((r): r is { t: 'icon'; name: string } => r.t === 'icon');
  if (pills.length > limits.pills) out.push(`It has ${pills.length} pills; a headline takes ${numberWord(limits.pills)} at most.`);
  for (const p of pills) {
    const words = p.text.trim().split(/\s+/).filter(Boolean).length;
    if (words > limits.pillWords) out.push(`The pill "${p.text.trim()}" holds ${words} words; a pill holds one to ${numberWord(limits.pillWords)}.`);
    else if ([...p.text.trim()].length > limits.pillChars) out.push(`The pill "${p.text.trim()}" is ${[...p.text.trim()].length} letters; a pill holds up to ${limits.pillChars}.`);
  }
  if (pills.length && !runs.some((r) => (r.t === 'text' || r.t === 'em') && r.text.trim())) out.push('A pill cannot be the whole headline. Leave some words outside it.');
  if (iconRuns.length > limits.icons) out.push(`It has ${iconRuns.length} icons; a headline takes ${numberWord(limits.icons)} at most.`);
  if (icons) for (const r of iconRuns) if (!icons.includes(r.name)) out.push(`"${r.name}" is not one of the icons.`);
  return out;
}

// A spoken summary of the marks, for screen readers: "Coloured: see every. In a pill: euro. Icons: arrow right."
export function describeMarks(runs: readonly Run[]): string {
  const of = (t: string) => runs.filter((r) => r.t === t).map((r) => (r.t === 'icon' ? r.name.replace(/-/g, ' ') : (r as { text: string }).text.trim()));
  const parts: string[] = [];
  const em = of('em'), pill = of('pill'), icon = of('icon');
  if (em.length) parts.push(`Coloured: ${em.join(', ')}.`);
  if (pill.length) parts.push(`In a pill: ${pill.join(', ')}.`);
  if (icon.length) parts.push(`Icon${icon.length > 1 ? 's' : ''}: ${icon.join(', ')}.`);
  return parts.join(' ') || 'No styled words.';
}

const numberWord = (n: number) => (['no', 'one', 'two', 'three', 'four', 'five'][n] ?? String(n));
