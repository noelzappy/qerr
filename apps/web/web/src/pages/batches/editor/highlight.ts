// Wraps the selected words of a headline in *asterisks* (the words that stand out), or takes the asterisks off again.
// Pure: it takes the text and the selection and returns the new text and the new selection, or null when nothing can be done.
export interface Highlighted { text: string; start: number; end: number }

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
