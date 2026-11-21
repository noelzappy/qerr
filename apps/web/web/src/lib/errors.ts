// Turns whatever a request threw into plain words, and server field problems into a map the forms can show.
import { ApiError } from '../api';

export function errorMessage(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'The server could not be reached. Check your connection and try again.';
    if (err.status === 429) return err.retryAfter ? `Too many attempts. Try again in ${waitText(err.retryAfter)}.` : 'Too many attempts. Wait a few minutes and try again.';
    return err.message;
  }
  return fallback;
}

// "3 minutes", "40 seconds": the retry-after header says seconds.
function waitText(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 90 ? `${minutes} minutes` : `${Math.ceil(minutes / 60)} hours`;
}

// The server answers validation problems as details: [{ path, message }]. Anything else is not a field problem.
export function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (err instanceof ApiError && Array.isArray(err.details)) {
    for (const d of err.details as Array<{ path?: unknown; message?: unknown }>) {
      if (d && typeof d.path === 'string' && typeof d.message === 'string' && !(d.path in out)) out[d.path] = d.message;
    }
  }
  return out;
}

// For the banner above a form: the message, plus the problems that no field on the form shows.
export function formProblem(err: unknown, shownFields: string[]): string {
  const base = errorMessage(err);
  const unshown = Object.entries(fieldErrors(err)).filter(([path]) => !shownFields.includes(path));
  if (!unshown.length) return Object.keys(fieldErrors(err)).length ? 'Check the highlighted fields and try again.' : base;
  return `${base}: ${unshown.map(([p, m]) => (p ? `${p} - ${m}` : m)).join('; ')}`;
}

// ---- failure text from background work (an image that could not be made, a failed run) ----

export interface ReadableFailure {
  // The first sentence, whole.
  summary: string;
  // The sentence that tells the person what to do, when there is one after the first.
  advice: string | null;
  // Everything else, behind "Show details".
  details: string | null;
}

const IMAGE_FILE = '[\\w.-]+\\.(?:jpe?g|png|webp|gif|mp4)';
// "out/app-render/<run>/in/1-screen-desk.png": a temporary copy; the name after the number is the file's own.
const TEMP_PATH = /["'\u201c]?(?:[\w.-]+\/)*out\/app-render(?:\/[^/\s"']+\/in\/(?:\d+-)?([^/\s"']+))?[^\s"']*["'\u201d]?/g;
const ADVICE_START = /^(?:Use|Add|Choose|Pick|Fix|Check|Try|Change|Replace|Upload|Make|Set|Remove|Shorten|Write|Link|Open|Ask|Save|Select|Edit|Turn|Switch|Give|Keep)\b/;

const withoutPaths = (text: string): string => text.replace(TEMP_PATH, (_m, name?: string) => (name ? `"${name}"` : 'the picture'));

// A line from the list of what stops a post being approved, made readable: the image failure the server adds is cleaned like
// any other failure, and no line shows an internal path.
export function tidyBlocker(text: string): string {
  const m = /^The images? could not be made:\s*/i.exec(text);
  return m ? `The image could not be made: ${failureLine(text.slice(m[0].length))}` : withoutPaths(text);
}

// Plain words for a stored error: no internal paths, no leading image file name or "Render:", and cut only at sentence
// ends. The stored text is not changed; this is how it is shown.
export function readableFailure(raw: string | null | undefined): ReadableFailure {
  let text = (raw ?? '').replace(/\s+/g, ' ').trim();
  text = withoutPaths(text);
  text = text.replace(/^Render:\s*/i, '').replace(new RegExp(`^${IMAGE_FILE}:\\s*`, 'i'), '').replace(/^The images? could not be made:\s*/i, '').trim();
  if (!text) return { summary: 'No reason was given.', advice: null, details: null };
  const sentences = text.split(/(?<=[.!?])\s+(?=["'“(]?[A-Z])/);
  const [first = text, ...rest] = sentences;
  const at = rest.findIndex((s) => ADVICE_START.test(s));
  const advice = at >= 0 ? rest[at]! : null;
  const others = rest.filter((_, i) => i !== at);
  return { summary: first, advice, details: others.length ? others.join(' ') : null };
}

// One line for lists: the first sentence and the advice, with no disclosure.
export function failureLine(raw: string | null | undefined): string {
  const f = readableFailure(raw);
  return f.advice ? `${f.summary} ${f.advice}` : f.summary;
}
