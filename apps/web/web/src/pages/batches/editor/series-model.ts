// A post in one of the brand's named series (Settings, Looks, Series), as plain functions the post editor uses. The series is a link the
// server keeps (post.series); what the reader sees is the mark ("Tip #12") the editor writes into the design's own label or tag, held to
// that field's limits like any other words. The same rules as the engine's seriesMark and seriesVariant (lib/design/series.mjs).
import { switchKind, type PostKindInfo } from '../design-model';
import type { Json } from './types';

// What GET /api/series answers for each series (services/series.ts SeriesView).
export interface SeriesInfo {
  id: string; slug: string; name: string; kind: string; variants: number[]; mark: string | null; markField: string;
  cadence: string; weekday: number | null; nextNumber: number; nextMark: string | null; designsInLook: boolean; problems: string[]; enabled: boolean;
}
export interface SeriesRef { id: string; number: number }

// "Tip #{n}", 12 -> "Tip #12"; {nn} pads to two digits.
export const seriesMark = (mark: string, n: number): string => mark.replace(/\{(n|nn)\}/g, (_, t: string) => (t === 'nn' ? String(n).padStart(2, '0') : String(n)));

// A post design put in a series as its number `n`: the series' kind (the words the new kind keeps stay), its design in turn by number when
// it chose some in the look in use, and its mark in its field. Anything that is not a post design is returned as it is.
export function applySeries(d: Json | null, s: SeriesInfo, n: number, kinds?: PostKindInfo[] | null): Json | null {
  if (!d || d.template !== 'post') return d;
  let next: Json = d.kind === s.kind ? { ...d } : switchKind(d, s.kind, kinds);
  if (s.designsInLook && s.variants.length) next = { ...next, variant: s.variants[(n - 1) % s.variants.length] };
  if (s.mark) next = { ...next, [s.markField || 'label']: seriesMark(s.mark, n) };
  return next;
}

// The design with the series' mark taken off (when it still reads as the mark of that number), for a post taken out of a series.
export function removeSeries(d: Json | null, s: SeriesInfo | undefined, n: number | undefined): Json | null {
  if (!d || !s?.mark || n === undefined) return d;
  const field = s.markField || 'label';
  if (d[field] !== seriesMark(s.mark, n)) return d;
  const { [field]: _gone, ...rest } = d;
  return rest;
}

// A one-line summary of a series: "Statement · weekly on Tuesdays · next Tip #15".
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CADENCE: Record<string, string> = { weekly: 'weekly', fortnightly: 'every two weeks', monthly: 'monthly' };
export function seriesSummary(s: Pick<SeriesInfo, 'kind' | 'cadence' | 'weekday' | 'nextMark' | 'nextNumber'>): string {
  const day = s.weekday !== null && s.weekday !== undefined ? WEEKDAYS[s.weekday] : undefined;
  const when = !day ? CADENCE[s.cadence] ?? s.cadence : s.cadence === 'monthly' ? `monthly on the first ${day}` : `${CADENCE[s.cadence] ?? s.cadence} on ${day}s`;
  return [s.kind.charAt(0).toUpperCase() + s.kind.slice(1), when, `next ${s.nextMark ?? `#${s.nextNumber}`}`].join(' · ');
}
