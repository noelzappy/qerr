// The AI stores everything it wants a person to know about a post in one list. Some of it is information (why a post has no
// picture, that a layout carries none, a reminder to check before publishing); some of it needs action (a design check that
// failed, a fact nobody has confirmed, a date that has passed). Only the second kind raises "Has warnings".
// Be conservative: a line that is not clearly information stays a warning.

// Things a person must act on. These win over the information patterns below.
const ACTION = /contrast|shr[au]nk|shrink|too (?:long|small|big|wide)|not confirmed|unconfirmed|not been confirmed|stale|valid until|expired|out of date|\b(?:currency|currencies)\b|[£$€]\s?\d|rights|licen[cs]e|missing|not found|not in the|no longer|exceed|\ballows? \d|hashtags|title case|us spelling|cannot|can't|could not|failed|must\b|before this post can be approved/i;

// Things that only inform.
const INFORMATION = [
  /^no (?:picture|photo|image)\b/i,
  /\bwithout (?:a |an )?(?:picture|photo|image)\b/i,
  /\b(?:carries|has|uses|needs|shows) no (?:picture|photo|image)\b/i,
  /^(?:this )?layout (?:has|carries|uses|shows) no\b/i,
  /^demo (?:figure|number|data|value)s?\b/i,
  /\bas the vault item states\b/i,
  /^picture (?:wanted|suggestion)\b/i,
  /^(?:please |remember to )?(?:check|review|verify|confirm)\b.*\bbefore (?:publishing|posting|approving|sending|going live)\b/i,
];

export const isNote = (text: string): boolean => !ACTION.test(text) && INFORMATION.some((re) => re.test(text.trim()));

// `all` is every warning the server reports for the post; `stored` is the part the AI wrote when it drafted the post.
// Whatever the server worked out itself (not in `stored`) is always a warning.
export function splitNotes(all: string[], stored: string[]): { notes: string[]; warnings: string[] } {
  const fromAi = new Set(stored);
  const notes: string[] = [];
  const warnings: string[] = [];
  for (const w of all) (fromAi.has(w) && isNote(w) ? notes : warnings).push(w);
  return { notes, warnings };
}
