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
export function waitText(seconds: number): string {
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
