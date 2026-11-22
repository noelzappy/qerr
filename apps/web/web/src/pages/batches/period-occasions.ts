// "This period" in Draft with AI: the occasions of the chosen dates as chips. The calendar's come ticked; the person may untick any,
// add up to five of their own (a short text each) and, with a search key, add what a web search found (unticked, marked "from the
// web"). The ticked ones go into the draft brief as `occasions`. Pure, so it is specced without a browser (src/web-period-occasions.spec.ts).

export type OccasionKind = 'holiday' | 'observance' | 'season' | 'commerce';
export interface OccasionChip {
  key: string;
  name: string;
  date?: string;
  end?: string;
  observed?: string;
  kind: OccasionKind;
  note?: string;
  source?: string;
  origin: 'calendar' | 'own' | 'web';
  ticked: boolean;
}
export interface CalendarOccasion { id: string; name: string; date: string; end?: string; observed?: string; kind: OccasionKind; note: string }
export interface WebOccasion { name: string; date: string; end?: string; kind: OccasionKind; note: string; source: string }

export const MAX_OWN = 5;
export const MAX_NAME = 80;

const flat = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export const fromCalendar = (list: CalendarOccasion[]): OccasionChip[] =>
  list.map((o) => ({ key: `cal:${o.id}`, name: o.name, date: o.date, ...(o.end ? { end: o.end } : {}), ...(o.observed ? { observed: o.observed } : {}), kind: o.kind, note: o.note, origin: 'calendar', ticked: true }));

// The calendar's chips for new dates, keeping what the person did: their own chips, web finds still in the period, and the ticks.
export function mergeCalendar(current: OccasionChip[], list: CalendarOccasion[], period: { from: string; to: string }): OccasionChip[] {
  const was = new Map(current.map((c) => [c.key, c.ticked]));
  const cal = fromCalendar(list).map((c) => (was.has(c.key) ? { ...c, ticked: was.get(c.key)! } : c));
  const inPeriod = (c: OccasionChip) => !c.date || ((c.end ?? c.date) >= period.from && c.date <= period.to);
  return [...cal, ...current.filter((c) => c.origin !== 'calendar' && inPeriod(c))];
}

// Why a text cannot be added as the person's own occasion, or '' when it can.
export function ownProblem(chips: OccasionChip[], text: string): string {
  const name = text.replace(/\s+/g, ' ').trim();
  if (!name) return 'Type the occasion first';
  if ([...name].length > MAX_NAME) return `Keep it to ${MAX_NAME} characters`;
  if (chips.filter((c) => c.origin === 'own').length >= MAX_OWN) return `You can add up to ${MAX_OWN} of your own`;
  if (chips.some((c) => flat(c.name) === flat(name))) return 'That one is already in the list';
  return '';
}
export function addOwn(chips: OccasionChip[], text: string): OccasionChip[] {
  if (ownProblem(chips, text)) return chips;
  const name = text.replace(/\s+/g, ' ').trim();
  return [...chips, { key: `own:${flat(name)}`, name, kind: 'observance', origin: 'own', ticked: true }];
}

// What a web search found: added unticked (a person decides), never twice, and never one the list already names.
export function addWeb(chips: OccasionChip[], found: WebOccasion[]): OccasionChip[] {
  const names = new Set(chips.map((c) => flat(c.name)));
  const extra: OccasionChip[] = [];
  for (const o of found) {
    if (names.has(flat(o.name))) continue;
    names.add(flat(o.name));
    extra.push({ key: `web:${flat(o.name)}`, name: o.name, date: o.date, ...(o.end ? { end: o.end } : {}), kind: o.kind, note: o.note, source: o.source, origin: 'web', ticked: false });
  }
  return [...chips, ...extra];
}

export const toggle = (chips: OccasionChip[], key: string): OccasionChip[] => chips.map((c) => (c.key === key ? { ...c, ticked: !c.ticked } : c));
export const removeChip = (chips: OccasionChip[], key: string): OccasionChip[] => chips.filter((c) => c.key !== key || c.origin === 'calendar');

// The brief's `occasions`: the ticked chips, as the server takes them.
export const chosenOccasions = (chips: OccasionChip[]) => chips.filter((c) => c.ticked).map(({ name, date, end, observed, kind, note, source, origin }) => ({
  name, kind, origin, ...(date ? { date } : {}), ...(end ? { end } : {}), ...(observed ? { observed } : {}), ...(note ? { note: note.slice(0, 300) } : {}), ...(source ? { source } : {}),
}));

// "25 Dec", or "1 Dec – 28 Feb" for a stretch of days.
export function chipDate(c: Pick<OccasionChip, 'date' | 'end'>): string {
  if (!c.date) return '';
  const f = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return c.end ? `${f(c.date)} – ${f(c.end)}` : f(c.date);
}
