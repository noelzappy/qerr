// The "other currencies" list in Brand settings. The engine stores it as one regex source (money.foreign, matched without regard
// to case, at most 300 characters); people see and edit a plain list of words and symbols. These two functions convert between
// the two, and refuse (null) a stored pattern that is more than a plain list.

export const CURRENCY_PATTERN_MAX = 300;

const META = new Set(['.', '*', '+', '?', '^', '$', '(', ')', '[', ']', '{', '}', '|']);
const ESCAPABLE = new Set([...META, '\\', '-', '/']);

export function parseCurrencyPattern(pattern: string): string[] | null {
  try {
    if (typeof pattern !== 'string') return null;
    const out: string[] = [];
    let cur = '';
    let any = false;
    const flush = (): boolean => {
      if (!any) return false;
      out.push(cur);
      cur = '';
      any = false;
      return true;
    };
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '\\') {
        const n = pattern[i + 1];
        if (n === undefined || !ESCAPABLE.has(n)) return null;
        cur += n; any = true; i++;
      } else if (c === '|') {
        if (!flush()) return null;
      } else if (META.has(c)) {
        return null;
      } else {
        cur += c; any = true;
      }
    }
    if (!flush()) return null;
    return out;
  } catch {
    return null;
  }
}

const escapeWord = (w: string) => w.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

function clean(words: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const w = String(raw).trim();
    const k = w.toLowerCase();
    if (!w || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

export function buildCurrencyPattern(words: string[]): string {
  return clean(words).map(escapeWord).join('|');
}

export function currencyListProblem(words: string[]): string {
  if (!clean(words).length) return 'Add at least one currency word or symbol';
  if (buildCurrencyPattern(words).length > CURRENCY_PATTERN_MAX) return 'The list is too long: remove a few words';
  return '';
}
