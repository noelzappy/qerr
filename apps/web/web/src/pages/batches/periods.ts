// Date ranges offered as one tap (next week, next month, the month after) and the batch title a range suggests ("December 2026",
// "Week of 30 November"). Dates are ISO calendar days (YYYY-MM-DD) in the brand's time zone. Pure, specced in
// src/web-periods.spec.ts.

export type PeriodChoice = 'week' | 'month' | 'after' | 'custom';
export interface Period { from: string; to: string }

const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime());

// Today in a time zone, as YYYY-MM-DD.
export function todayIn(tz: string, now: Date = new Date()): string {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const g = (t: string) => p.find((x) => x.type === t)?.value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  } catch {
    return iso(now);
  }
}

// The first and last day of the month `offset` months after today's.
export function monthFrom(today: string, offset: number): Period {
  const d = parse(today);
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset + 1, 0));
  return { from: iso(from), to: iso(to) };
}

// Monday to Sunday of the week after this one (weeks start on Monday).
export function nextWeek(today: string): Period {
  const back = (parse(today).getUTCDay() + 6) % 7;
  const from = addDays(today, 7 - back);
  return { from, to: addDays(from, 6) };
}

export function periodFor(choice: Exclude<PeriodChoice, 'custom'>, today: string): Period {
  return choice === 'week' ? nextWeek(today) : monthFrom(today, choice === 'month' ? 1 : 2);
}

// The chip a range matches, else Custom.
export function choiceOf(p: Period, today: string): PeriodChoice {
  for (const c of ['week', 'month', 'after'] as const) {
    const r = periodFor(c, today);
    if (r.from === p.from && r.to === p.to) return c;
  }
  return 'custom';
}

const MONTH = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
// "December", or "January 2027" when the year is not this one.
export function monthName(today: string, offset: number): string {
  const r = parse(monthFrom(today, offset).from);
  return r.getUTCFullYear() === parse(today).getUTCFullYear() ? MONTH(r) : `${MONTH(r)} ${r.getUTCFullYear()}`;
}

// The title a range suggests: "December 2026" for a whole month, "Week of 30 November" for Monday to Sunday, "8 to 21 December
// 2026" otherwise; '' while a day is missing.
export function periodTitle(p: Period): string {
  if (!isIso(p.from) || !isIso(p.to) || p.to < p.from) return '';
  const a = parse(p.from);
  const b = parse(p.to);
  const month = monthFrom(p.from, 0);
  if (month.from === p.from && month.to === p.to) return `${MONTH(a)} ${a.getUTCFullYear()}`;
  if (a.getUTCDay() === 1 && addDays(p.from, 6) === p.to) return `Week of ${a.getUTCDate()} ${MONTH(a)}`;
  const day = (d: Date, withMonth: boolean, withYear: boolean) => `${d.getUTCDate()}${withMonth ? ` ${MONTH(d)}` : ''}${withYear ? ` ${d.getUTCFullYear()}` : ''}`;
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth();
  if (p.from === p.to) return day(a, true, true);
  return `${day(a, !sameMonth, !sameYear)} to ${day(b, true, true)}`;
}

// "Tue 1 Dec – Thu 31 Dec 2026", the line under the chips.
export function periodLine(p: Period): string {
  if (!isIso(p.from) || !isIso(p.to)) return '';
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const f = (d: Date, year: boolean) => `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}${year ? ` ${d.getUTCFullYear()}` : ''}`;
  const a = parse(p.from);
  const b = parse(p.to);
  return `${f(a, a.getUTCFullYear() !== b.getUTCFullYear())} – ${f(b, true)}`;
}
