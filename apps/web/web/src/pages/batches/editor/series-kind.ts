// A series as a kind of post: what choosing one does to the post's link (SeriesRef) and design, the same rules SeriesPicker had. Choosing a
// series sets its kind, its design in turn by number and its mark; another number writes that number's mark; a plain kind takes the post
// out of its series (the mark goes when it still reads as that number's) and switches to that kind. Pure (web-series-kind.spec.ts).
import { switchKind, type PostKindInfo } from '../design-model';
import { applySeries, removeSeries, type SeriesInfo, type SeriesRef } from './series-model';
import type { Json } from './types';

export interface SeriesChange { series: SeriesRef | null; design: Json | null }

export function pickSeries(list: SeriesInfo[], current: SeriesRef | null, design: Json | null, id: string, kinds?: PostKindInfo[] | null): SeriesChange | null {
  const s = list.find((x) => x.id === id);
  if (!s) return null;
  if (current?.id === id) return { series: current, design };
  const was = current ? list.find((x) => x.id === current.id) : undefined;
  const without = removeSeries(design, was, current?.number);
  return { series: { id, number: s.nextNumber }, design: applySeries(without, s, s.nextNumber, kinds) };
}

export function leaveSeries(list: SeriesInfo[], current: SeriesRef | null, design: Json | null, kind: string | null, kinds?: PostKindInfo[] | null): SeriesChange {
  const was = current ? list.find((x) => x.id === current.id) : undefined;
  const without = removeSeries(design, was, current?.number);
  const next = kind && without && without.template === 'post' && without.kind !== kind ? switchKind(without, kind, kinds) : without;
  return { series: null, design: next };
}

export function renumberSeries(list: SeriesInfo[], current: SeriesRef | null, design: Json | null, n: number, kinds?: PostKindInfo[] | null): SeriesChange | null {
  const s = current ? list.find((x) => x.id === current.id) : undefined;
  if (!current || !s || !Number.isInteger(n) || n < 1 || n > 9999) return null;
  return { series: { ...current, number: n }, design: applySeries(removeSeries(design, s, current.number), s, n, kinds) };
}
