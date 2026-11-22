// Wraps the selected words of a headline in *asterisks* (the words that stand out), or takes the asterisks off again.
// Pure: it takes the text and the selection and returns the new text and the new selection, or null when nothing can be done.
export interface Highlighted { text: string; start: number; end: number }

// Wraps the selected words in [[double brackets]] (a pill, where the look draws pills), or takes them off. One to three words, no
// asterisk or bracket inside; null when that cannot be done. The engine is the authority on the rest (at most two pills, never the whole line).
export function togglePill(text: string, start: number, end: number): Highlighted | null {
  let s = Math.max(0, Math.min(start, end));
  let e = Math.min(text.length, Math.max(start, end));
  while (s < e && /\s/.test(text[s]!)) s++;
  while (e > s && /\s/.test(text[e - 1]!)) e--;
  if (s >= e) return null;
  const picked = text.slice(s, e);
  if (picked.startsWith('[[') && picked.endsWith(']]') && picked.length > 4) return { text: text.slice(0, s) + picked.slice(2, -2) + text.slice(e), start: s, end: e - 4 };
  if (text.slice(s - 2, s) === '[[' && text.slice(e, e + 2) === ']]') return { text: text.slice(0, s - 2) + picked + text.slice(e + 2), start: s - 2, end: e - 2 };
  if (/[*[\]{}]/.test(picked) || picked.split(/\s+/).length > 3) return null;
  return { text: `${text.slice(0, s)}[[${picked}]]${text.slice(e)}`, start: s + 2, end: e + 2 };
}

// Puts an icon mark ({{name}}) at the caret, with a space on either side where it touches a word.
export function insertIcon(text: string, at: number, name: string): Highlighted {
  const i = Math.max(0, Math.min(at, text.length));
  const before = i > 0 && !/\s/.test(text[i - 1]!) ? ' ' : '', after = i < text.length && !/\s/.test(text[i]!) ? ' ' : '';
  const mark = `${before}{{${name}}}${after}`;
  return { text: text.slice(0, i) + mark + text.slice(i), start: i + mark.length, end: i + mark.length };
}

export function toggleHighlight(text: string, start: number, end: number): Highlighted | null {
  let s = Math.max(0, Math.min(start, end));
  let e = Math.min(text.length, Math.max(start, end));
  // Spaces at the edges of the selection stay outside the asterisks.
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  if (s >= e) return null;
  const picked = text.slice(s, e);
  // The selection is exactly *words*: take the asterisks off.
  if (picked.length >= 3 && picked.startsWith('*') && picked.endsWith('*') && !picked.slice(1, -1).includes('*')) {
    return { text: text.slice(0, s) + picked.slice(1, -1) + text.slice(e), start: s, end: e - 2 };
  }
  // The selection sits directly inside asterisks: take those off.
  if (text[s - 1] === '*' && text[e] === '*' && !picked.includes('*')) {
    return { text: text.slice(0, s - 1) + picked + text.slice(e + 1), start: s - 1, end: e - 1 };
  }
  // Asterisks that do not frame the selection would leave the pairs unbalanced.
  if (picked.includes('*')) return null;
  return { text: `${text.slice(0, s)}*${picked}*${text.slice(e)}`, start: s + 1, end: e + 1 };
}
