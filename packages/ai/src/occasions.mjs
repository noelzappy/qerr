// A calendar of occasions: public holidays, widely known observances, seasons and money moments, for the brand's country, so a
// batch can be planned around what is happening in its period. Standard library only. Every date is a rule (fixed, "first Friday
// of December", Easter-based, the Umm al-Qura Islamic calendar or the Hebrew calendar through Intl) or a short table checked by
// hand; what was not certain was left out (docs/ai.md, "Occasions", lists the sources and what is not covered).
//
//   occasionsFor({ country, from, to }) -> [{ id, name, date, end?, kind, note, observed?, country }]
//
// kind: 'holiday' (a public holiday where the brand is), 'observance' (a day people mark), 'season' (a stretch of the year) or
// 'commerce' (a shopping or money moment). A country the calendar does not cover gets the global occasions only.
import { AIError } from './errors.mjs';

export const OCCASION_KINDS = ['holiday', 'observance', 'season', 'commerce'];
export const OCCASION_COUNTRIES = ['GH', 'NG', 'KE', 'ZA', 'GB', 'IE', 'US', 'CA', 'IN', 'AU', 'DE', 'FR', 'NL', 'ES', 'IT'];
// The widest window asked for at once (a little over a year).
export const MAX_OCCASION_DAYS = 400;

// ---- dates (all UTC, all whole days) ----
const DAY = 86_400_000;
const at = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const iso = (t) => t.toISOString().slice(0, 10);
const plus = (t, n) => new Date(t.getTime() + n * DAY);
const SUN = 0, MON = 1, TUE = 2, THU = 4, FRI = 5, SAT = 6;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const spoken = (t) => `${WEEKDAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;

// The n-th given weekday of a month (n = 1 the first, -1 the last).
export function nthWeekday(y, m, weekday, n) {
  if (n > 0) {
    const first = at(y, m, 1);
    return plus(first, ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
  }
  const last = at(y, m + 1, 0);
  return plus(last, -((last.getUTCDay() - weekday + 7) % 7) + (n + 1) * 7);
}
// The last given weekday on or before a day ("the Monday before 25 May" is the last Monday on or before 24 May).
const onOrBefore = (t, weekday) => plus(t, -((t.getUTCDay() - weekday + 7) % 7));
const onOrAfter = (t, weekday) => plus(t, (weekday - t.getUTCDay() + 7) % 7);

// Western (Gregorian) Easter Sunday: the anonymous Gregorian algorithm (Meeus, Astronomical Algorithms, chapter 8).
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return at(y, month, day);
}

// Days of another calendar inside a Gregorian year, read through Intl (ICU). Islamic dates use the Umm al-Qura calendar, the
// reference most announcements start from; the day a country marks can still differ by one, which every note says. When this
// Node has no such calendar the occasions are left out rather than guessed.
const calendarCache = new Map();
function calendarDays(calendar, year) {
  const key = `${calendar}:${year}`;
  if (calendarCache.has(key)) return calendarCache.get(key);
  let fmt;
  try { fmt = new Intl.DateTimeFormat(`en-u-ca-${calendar}`, { timeZone: 'UTC', day: 'numeric', month: calendar === 'hebrew' ? 'long' : 'numeric', year: 'numeric' }); } catch { fmt = null; }
  const out = new Map();
  if (fmt && fmt.resolvedOptions().calendar === calendar) {
    for (let t = at(year, 1, 1); t.getUTCFullYear() === year; t = plus(t, 1)) {
      const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
      const k = `${p.month}-${p.day}`;
      if (!out.has(k)) out.set(k, []);
      out.get(k).push(t);
    }
  }
  calendarCache.set(key, out);
  return out;
}
const islamic = (month, day) => (y) => calendarDays('islamic-umalqura', y).get(`${month}-${day}`) ?? [];
const hebrew = (month, day) => (y) => calendarDays('hebrew', y).get(`${month}-${day}`) ?? [];

// Diwali (Lakshmi Puja), as India's central government holiday lists and the major panchangs give it. A lunar date with no rule
// Intl can follow, so a table, each date the new moon of Kartika (amanta Ashvin); the tests check every one against a computed
// new moon. Outside these years Diwali is left out.
const DIWALI = { 2025: '10-20', 2026: '11-08', 2027: '10-29', 2028: '10-17', 2029: '11-05', 2030: '10-26' };

// ---- rules: each takes a year and gives the start days in it ----
const fixed = (m, d) => (y) => [at(y, m, d)];
const nth = (m, weekday, n) => (y) => [nthWeekday(y, m, weekday, n)];
const fromEaster = (k) => (y) => [plus(easter(y), k)];
const table = (t) => (y) => (t[y] ? [new Date(`${y}-${t[y]}T00:00:00Z`)] : []);
// The last working day (Monday to Friday) of each month.
const monthEnds = (y) => Array.from({ length: 12 }, (_, i) => { const last = at(y, i + 2, 0); const wd = last.getUTCDay(); return plus(last, wd === SAT ? -1 : wd === SUN ? -2 : 0); });
const thanksgivingUs = (y) => nthWeekday(y, 11, THU, 4);

// One occasion. `days` makes it a range; `sub` is the substitute-day rule of a public holiday: 'weekend-next' (Saturday or Sunday ->
// the next working day that is not already a holiday), 'sunday-next' (Sunday -> Monday) or 'us' (Saturday -> Friday, Sunday ->
// Monday, as US federal holidays are observed).
const o = (id, name, kind, rule, note, extra = {}) => ({ id, name, kind, rule, note, ...extra });

// ---- the global occasions: every country gets these, and a country's own entry of the same id replaces one ----
const GLOBAL = [
  o('new-year', "New Year's Day", 'observance', fixed(1, 1), 'The first day of the year: fresh starts, plans and resolutions.'),
  o('valentines', "Valentine's Day", 'observance', fixed(2, 14), 'A day for love, couples and friendship.'),
  o('womens-day', "International Women's Day", 'observance', fixed(3, 8), "The United Nations' day for women's rights and achievements."),
  o('easter-sunday', 'Easter Sunday', 'observance', fromEaster(0), 'The main Christian feast of the spring.'),
  o('ramadan', 'Ramadan begins', 'observance', islamic(9, 1), 'The Muslim month of fasting is expected to begin (by the Umm al-Qura calendar; the day depends on the moon and may differ by one locally).', { untilNext: islamic(10, 1) }),
  o('eid-al-fitr', 'Eid al-Fitr', 'observance', islamic(10, 1), 'The festival at the end of Ramadan. Expected date (Umm al-Qura calendar); it depends on the moon and may differ by a day locally.'),
  o('eid-al-adha', 'Eid al-Adha', 'observance', islamic(12, 10), 'The festival of sacrifice. Expected date (Umm al-Qura calendar); it depends on the moon and may differ by a day locally.'),
  o('black-friday', 'Black Friday', 'commerce', (y) => [plus(thanksgivingUs(y), 1)], 'A day of shop discounts, the Friday after US Thanksgiving, now marketed in many countries.'),
  o('cyber-monday', 'Cyber Monday', 'commerce', (y) => [plus(thanksgivingUs(y), 4)], 'Online discounts on the Monday after Black Friday.'),
  o('christmas-eve', 'Christmas Eve', 'observance', fixed(12, 24), 'The day before Christmas.'),
  o('christmas', 'Christmas Day', 'observance', fixed(12, 25), 'The Christian feast of the birth of Jesus, and a day for family and gifts.'),
  o('new-years-eve', "New Year's Eve", 'observance', fixed(12, 31), 'The last day of the year: looking back, and celebrations at midnight.'),
  o('month-end', 'Month-end payday', 'commerce', monthEnds, 'Many people on a monthly salary are paid around the last working day of the month.'),
];

// Shared pieces of the country lists.
const H = (id, name, rule, note, extra) => o(id, name, 'holiday', rule, note, extra);
const OBS = (id, name, rule, note, extra) => o(id, name, 'observance', rule, note, extra);
const newYearH = (note = 'A public holiday.', extra) => H('new-year', "New Year's Day", fixed(1, 1), note, extra);
const goodFridayH = (note = 'A public holiday: the Friday before Easter.') => H('good-friday', 'Good Friday', fromEaster(-2), note);
const easterMondayH = (name = 'Easter Monday', note = 'A public holiday: the day after Easter Sunday.') => H('easter-monday', name, fromEaster(1), note);
const christmasH = (name = 'Christmas Day', note = 'A public holiday.', extra) => H('christmas', name, fixed(12, 25), note, extra);
const boxingH = (name = 'Boxing Day', note = 'A public holiday, the day after Christmas.', extra) => H('boxing-day', name, fixed(12, 26), note, extra);
const workersH = (name = "Workers' Day", note = 'A public holiday for working people.', extra) => H('workers-day', name, fixed(5, 1), note, extra);
const ascensionH = (name, note) => H('ascension', name, fromEaster(39), note);
const whitMondayH = (name, note) => H('whit-monday', name, fromEaster(50), note);
const mothersMay2 = (name = "Mother's Day") => OBS('mothers-day', name, nth(5, SUN, 2), 'Mothers are celebrated on the second Sunday of May.');
const fathersJune3 = (name = "Father's Day") => OBS('fathers-day', name, nth(6, SUN, 3), 'Fathers are celebrated on the third Sunday of June.');
const halloween = (note = 'Costumes, pumpkins and trick-or-treating on the evening of 31 October.') => OBS('halloween', 'Halloween', fixed(10, 31), note);
const diwaliObs = (note = 'The Hindu, Sikh and Jain festival of lights, celebrated by many families here.') => OBS('diwali', 'Diwali', table(DIWALI), note);
const eidH = (id, name, note) => H(id, name, GLOBAL.find((g) => g.id === id).rule, note);
// Summer time in the EU and the UK: from the last Sunday of March to the last Sunday of October.
const clocksEu = [
  o('clocks-forward', 'Clocks go forward', 'season', nth(3, SUN, -1), 'Summer time starts: the clocks go forward an hour and evenings get lighter.'),
  o('clocks-back', 'Clocks go back', 'season', nth(10, SUN, -1), 'Summer time ends: the clocks go back an hour and evenings get darker.'),
];
const clocksNa = (where) => [
  o('clocks-forward', 'Clocks go forward', 'season', nth(3, SUN, 2), `Daylight saving time starts${where}: the clocks go forward an hour.`),
  o('clocks-back', 'Clocks go back', 'season', nth(11, SUN, 1), `Daylight saving time ends${where}: the clocks go back an hour.`),
];
// Meteorological seasons (whole months).
const seasons = (south) => {
  const s = (id, name, m, note) => o(id, name, 'season', fixed(m, 1), note, { endRule: (y) => at(y, m + 3, 0) });
  return south
    ? [s('summer', 'Summer', 12, 'Summer in the southern hemisphere: the longest days of the year.'), s('autumn', 'Autumn', 3, 'Autumn in the southern hemisphere: the days grow shorter.'), s('winter', 'Winter', 6, 'Winter in the southern hemisphere: the shortest days of the year.'), s('spring', 'Spring', 9, 'Spring in the southern hemisphere: the days grow longer.')]
    : [s('winter', 'Winter', 12, 'Winter in the northern hemisphere: the shortest days of the year.'), s('spring', 'Spring', 3, 'Spring in the northern hemisphere: the days grow longer.'), s('summer', 'Summer', 6, 'Summer in the northern hemisphere: the longest days of the year.'), s('autumn', 'Autumn', 9, 'Autumn in the northern hemisphere: the days grow shorter.')];
};
const range = (fromMonth, fromDay, toMonth, toDay) => ({ endRule: (y) => at(toMonth < fromMonth ? y + 1 : y, toMonth, toDay) });

// France's Mother's Day: the last Sunday of May, or the first Sunday of June when that Sunday is Pentecost (Code de l'action sociale).
const fetesDesMeres = (y) => { const last = nthWeekday(y, 5, SUN, -1); return [iso(last) === iso(plus(easter(y), 49)) ? nthWeekday(y, 6, SUN, 1) : last]; };
// France's sales (Code de commerce, art. D310-15-2): winter sales from the second Wednesday of January (the first when the second
// falls after the 12th), summer sales from the last Wednesday of June (the second to last when the last falls after the 28th); four weeks each.
const soldesHiver = (y) => { const w = nthWeekday(y, 1, 3, 2); return [w.getUTCDate() > 12 ? nthWeekday(y, 1, 3, 1) : w]; };
const soldesEte = (y) => { const w = nthWeekday(y, 6, 3, -1); return [w.getUTCDate() > 28 ? plus(w, -7) : w]; };
// The Netherlands: King's Day on 27 April, or on Saturday 26 April when the 27th is a Sunday.
const kingsDay = (y) => { const d = at(y, 4, 27); return [d.getUTCDay() === SUN ? at(y, 4, 26) : d]; };
// Ireland: St Brigid's Day bank holiday on the first Monday of February, or on 1 February when that is a Friday (since 2023).
const stBrigid = (y) => { const f = at(y, 2, 1); return y < 2023 ? [] : [f.getUTCDay() === FRI ? f : nthWeekday(y, 2, MON, 1)]; };
// Oktoberfest in Munich: from the first Saturday after 15 September to the first Sunday of October, or to 3 October when that is later.
const oktoberfest = (y) => [onOrAfter(at(y, 9, 16), SAT)];
const oktoberfestEnd = (y) => { const sun = nthWeekday(y, 10, SUN, 1); return sun.getUTCDate() >= 3 ? sun : at(y, 10, 3); };
// Canada's Victoria Day: the last Monday before 25 May.
const victoriaDay = (y) => [onOrBefore(at(y, 5, 24), MON)];
// The first Sunday of Advent: the fourth Sunday before Christmas Day.
const advent = (y) => [plus(onOrBefore(at(y, 12, 24), SUN), -21)];

const COUNTRIES = {
  GH: [
    newYearH(), H('independence-day', 'Independence Day', fixed(3, 6), "Ghana's independence, on 6 March 1957."), goodFridayH(), easterMondayH(),
    workersH('May Day', "A public holiday for working people (Workers' Day)."),
    eidH('eid-al-fitr', 'Eid al-Fitr', 'A public holiday at the end of Ramadan. Expected date (Umm al-Qura calendar); the government announces the day.'),
    eidH('eid-al-adha', 'Eid al-Adha', 'A public holiday, the festival of sacrifice. Expected date (Umm al-Qura calendar); the government announces the day.'),
    H('farmers-day', "National Farmers' Day", nth(12, FRI, 1), "A public holiday on the first Friday of December honouring Ghana's farmers and fishers."),
    christmasH(), boxingH(),
  ],
  NG: [
    newYearH(), goodFridayH(), easterMondayH(), workersH(), H('democracy-day', 'Democracy Day', fixed(6, 12), 'A public holiday for democracy, on 12 June.'),
    H('independence-day', 'Independence Day', fixed(10, 1), "Nigeria's independence, on 1 October 1960."),
    eidH('eid-al-fitr', 'Eid al-Fitr', 'A public holiday at the end of Ramadan. Expected date (Umm al-Qura calendar); the government announces the days off.'),
    eidH('eid-al-adha', 'Eid al-Adha', 'A public holiday, the festival of sacrifice. Expected date (Umm al-Qura calendar); the government announces the days off.'),
    H('mawlid', 'Eid-el-Maulud', islamic(3, 12), "A public holiday for the Prophet's birthday. Expected date (Umm al-Qura calendar); the government announces the day."),
    christmasH(), boxingH(),
  ],
  KE: [
    newYearH(), goodFridayH(), easterMondayH(), workersH('Labour Day'),
    H('madaraka-day', 'Madaraka Day', fixed(6, 1), 'A public holiday marking self-rule, which began on 1 June 1963.'),
    H('mashujaa-day', 'Mashujaa Day', fixed(10, 20), "Heroes' Day, a public holiday honouring those who fought for independence."),
    H('jamhuri-day', 'Jamhuri Day', fixed(12, 12), "A public holiday marking Kenya's independence (1963) and the republic (1964)."),
    eidH('eid-al-fitr', 'Idd-ul-Fitr', 'A public holiday at the end of Ramadan. Expected date (Umm al-Qura calendar); the government announces the day.'),
    christmasH(), diwaliObs(),
  ],
  ZA: [
    newYearH(undefined, { sub: 'sunday-next' }), H('human-rights-day', 'Human Rights Day', fixed(3, 21), 'A public holiday for human rights, remembering Sharpeville (21 March 1960).', { sub: 'sunday-next' }),
    goodFridayH(), easterMondayH('Family Day', 'A public holiday on Easter Monday.'),
    H('freedom-day', 'Freedom Day', fixed(4, 27), 'A public holiday marking the first democratic election, on 27 April 1994.', { sub: 'sunday-next' }),
    workersH(undefined, undefined, { sub: 'sunday-next' }), H('youth-day', 'Youth Day', fixed(6, 16), 'A public holiday remembering the Soweto uprising of 16 June 1976.', { sub: 'sunday-next' }),
    H('womens-day-za', "National Women's Day", fixed(8, 9), 'A public holiday remembering the women\'s march of 9 August 1956.', { sub: 'sunday-next' }),
    H('heritage-day', 'Heritage Day', fixed(9, 24), "A public holiday for South Africa's cultures and heritage.", { sub: 'sunday-next' }),
    H('reconciliation-day', 'Day of Reconciliation', fixed(12, 16), 'A public holiday for national unity.', { sub: 'sunday-next' }),
    christmasH(undefined, undefined, { sub: 'sunday-next' }), boxingH('Day of Goodwill', 'A public holiday, the day after Christmas.', { sub: 'sunday-next' }),
    mothersMay2(), fathersJune3(), diwaliObs(), ...seasons(true),
  ],
  GB: [
    newYearH('A bank holiday.', { sub: 'weekend-next' }), goodFridayH('A bank holiday: the Friday before Easter.'),
    easterMondayH(undefined, 'A bank holiday in England, Wales and Northern Ireland (not in Scotland).'),
    H('early-may', 'Early May bank holiday', nth(5, MON, 1), 'A bank holiday on the first Monday of May.'),
    H('spring-bank', 'Spring bank holiday', nth(5, MON, -1), 'A bank holiday on the last Monday of May.'),
    H('summer-bank', 'Summer bank holiday', nth(8, MON, -1), 'A bank holiday on the last Monday of August in England, Wales and Northern Ireland (Scotland has its own on the first Monday of August).'),
    christmasH(undefined, 'A bank holiday.', { sub: 'weekend-next' }), boxingH(undefined, 'A bank holiday, the day after Christmas, and the start of the Boxing Day sales.', { sub: 'weekend-next' }),
    OBS('burns-night', 'Burns Night', fixed(1, 25), "Scotland's evening for the poet Robert Burns."),
    OBS('st-davids-day', "St David's Day", fixed(3, 1), "Wales's national day."),
    OBS('st-patricks-day', "St Patrick's Day", fixed(3, 17), 'Ireland\'s national day; a bank holiday in Northern Ireland.'),
    OBS('shrove-tuesday', 'Pancake Day', fromEaster(-47), 'Shrove Tuesday, the day before Lent begins, when people make pancakes.'),
    OBS('mothering-sunday', 'Mothering Sunday', fromEaster(-21), "The UK's Mother's Day, three weeks before Easter Sunday."),
    OBS('st-georges-day', "St George's Day", fixed(4, 23), "England's national day."), fathersJune3(), halloween(),
    OBS('bonfire-night', 'Bonfire Night', fixed(11, 5), 'Guy Fawkes Night: fireworks and bonfires.'),
    OBS('remembrance-sunday', 'Remembrance Sunday', nth(11, SUN, 2), 'The day the war dead are remembered, with two minutes of silence at 11am.'),
    OBS('st-andrews-day', "St Andrew's Day", fixed(11, 30), "Scotland's national day."), diwaliObs(),
    o('self-assessment', 'Self Assessment deadline', 'commerce', fixed(1, 31), 'Online Self Assessment tax returns for the last tax year, and the tax owed, are due by midnight.'),
    o('tax-year-end', 'End of the tax year', 'commerce', fixed(4, 5), 'The UK tax year ends; the new one starts on 6 April.'),
    o('back-to-school', 'Back to school', 'season', fixed(9, 1), 'Most schools in England, Wales and Northern Ireland go back in the first week of September (in Scotland, in mid-August).', range(9, 1, 9, 7)),
    ...clocksEu, ...seasons(false),
  ],
  IE: [
    newYearH('A public holiday.'), H('st-brigids-day', "St Brigid's Day", stBrigid, 'A bank holiday on the first Monday of February (or on 1 February when that is a Friday).'),
    H('st-patricks-day', "St Patrick's Day", fixed(3, 17), "Ireland's national holiday, with parades across the country."), easterMondayH(undefined, 'A bank holiday: the day after Easter Sunday.'),
    H('may-bank', 'May bank holiday', nth(5, MON, 1), 'A bank holiday on the first Monday of May.'),
    H('june-bank', 'June bank holiday', nth(6, MON, 1), 'A bank holiday on the first Monday of June.'),
    H('august-bank', 'August bank holiday', nth(8, MON, 1), 'A bank holiday on the first Monday of August.'),
    H('october-bank', 'October bank holiday', nth(10, MON, -1), 'A bank holiday on the last Monday of October.'),
    christmasH(undefined, 'A public holiday.'), boxingH("St Stephen's Day", 'A public holiday, the day after Christmas.'),
    OBS('nollaig-na-mban', 'Nollaig na mBan', fixed(1, 6), "Women's Christmas, the traditional end of the Christmas season."),
    OBS('good-friday', 'Good Friday', fromEaster(-2), 'The Friday before Easter; not a public holiday.'),
    OBS('shrove-tuesday', 'Pancake Tuesday', fromEaster(-47), 'Shrove Tuesday, the day before Lent begins, when people make pancakes.'),
    OBS('mothering-sunday', "Mother's Day", fromEaster(-21), "Ireland's Mother's Day (Mothering Sunday), three weeks before Easter Sunday."),
    OBS('bloomsday', 'Bloomsday', fixed(6, 16), "Dublin's day for James Joyce's Ulysses."), fathersJune3(),
    halloween('Halloween, which has its roots in the Celtic festival of Samhain: costumes, bonfires and trick-or-treating.'),
    o('income-tax-return', 'Income tax return deadline', 'commerce', fixed(10, 31), 'Self-assessed income tax returns on paper are due by 31 October; Revenue usually sets a later date for returns filed online.'),
    o('back-to-school', 'Back to school', 'season', fixed(8, 24), 'Most schools go back in late August or the first days of September.', range(8, 24, 9, 7)),
    ...clocksEu, ...seasons(false),
  ],
  US: [
    newYearH('A federal holiday.', { sub: 'us' }), H('mlk-day', 'Martin Luther King Jr. Day', nth(1, MON, 3), 'A federal holiday on the third Monday of January.'),
    H('presidents-day', "Presidents' Day", nth(2, MON, 3), "Washington's Birthday, a federal holiday on the third Monday of February."),
    H('memorial-day', 'Memorial Day', nth(5, MON, -1), 'A federal holiday on the last Monday of May, honouring those who died serving in the military.'),
    H('juneteenth', 'Juneteenth', fixed(6, 19), 'A federal holiday marking the end of slavery.', { sub: 'us' }),
    H('independence-day', 'Independence Day', fixed(7, 4), 'The Fourth of July, a federal holiday: fireworks and cookouts.', { sub: 'us' }),
    H('labor-day', 'Labor Day', nth(9, MON, 1), 'A federal holiday on the first Monday of September, the unofficial end of summer.'),
    H('columbus-day', 'Columbus Day', nth(10, MON, 2), "A federal holiday on the second Monday of October, also marked as Indigenous Peoples' Day."),
    H('veterans-day', 'Veterans Day', fixed(11, 11), 'A federal holiday honouring military veterans.', { sub: 'us' }),
    H('thanksgiving', 'Thanksgiving', (y) => [thanksgivingUs(y)], 'A federal holiday on the fourth Thursday of November: family, food and gratitude.'),
    christmasH(undefined, 'A federal holiday.', { sub: 'us' }),
    OBS('st-patricks-day', "St Patrick's Day", fixed(3, 17), 'Parades and green for Ireland\'s national day.'), mothersMay2(), fathersJune3(), halloween(),
    o('small-business-saturday', 'Small Business Saturday', 'commerce', (y) => [plus(thanksgivingUs(y), 2)], 'The Saturday after Thanksgiving, for shopping at local small businesses.'),
    o('giving-tuesday', 'Giving Tuesday', 'observance', (y) => [plus(thanksgivingUs(y), 5)], 'A day of giving to good causes, the Tuesday after Thanksgiving.'),
    OBS('hanukkah', 'Hanukkah', hebrew('Kislev', 25), 'The Jewish festival of lights, eight nights from the evening before this day.', { days: 8 }), diwaliObs(),
    o('back-to-school', 'Back to school', 'season', fixed(8, 10), 'Schools go back between mid-August and early September, depending on the state.', range(8, 10, 9, 7)),
    ...clocksNa(' in most of the US'), ...seasons(false),
  ],
  CA: [
    newYearH('A statutory holiday.'), goodFridayH('A statutory holiday: the Friday before Easter.'),
    H('victoria-day', 'Victoria Day', victoriaDay, 'A holiday on the last Monday before 25 May, the unofficial start of summer.'),
    H('canada-day', 'Canada Day', fixed(7, 1), "Canada's national day.", { sub: 'sunday-next' }),
    H('labour-day', 'Labour Day', nth(9, MON, 1), 'A statutory holiday on the first Monday of September.'),
    H('thanksgiving', 'Thanksgiving', nth(10, MON, 2), 'A holiday on the second Monday of October: family, food and gratitude.'),
    christmasH(undefined, 'A statutory holiday.'),
    OBS('family-day', 'Family Day', nth(2, MON, 3), 'A holiday on the third Monday of February in several provinces, including Ontario, Alberta and British Columbia.'),
    OBS('civic-holiday', 'Civic Holiday', nth(8, MON, 1), 'The first Monday of August, a holiday in most provinces under different names.'),
    OBS('truth-reconciliation', 'National Day for Truth and Reconciliation', fixed(9, 30), 'A federal holiday honouring residential school survivors (Orange Shirt Day).'),
    OBS('remembrance-day', 'Remembrance Day', fixed(11, 11), 'The day the war dead are remembered; a holiday for federal workers and in most provinces.'),
    OBS('boxing-day', 'Boxing Day', fixed(12, 26), 'A holiday for federal workers and in Ontario, and a big day for sales.'),
    mothersMay2(), fathersJune3(), halloween(), OBS('hanukkah', 'Hanukkah', hebrew('Kislev', 25), 'The Jewish festival of lights, eight nights from the evening before this day.', { days: 8 }), diwaliObs(),
    o('tax-deadline', 'Income tax deadline', 'commerce', fixed(4, 30), 'Personal income tax returns are due by 30 April for most people (the next business day when it falls on a weekend or holiday).'),
    o('back-to-school', 'Back to school', 'season', fixed(9, 1), 'Most schools go back in the week after Labour Day.', range(9, 1, 9, 10)),
    ...clocksNa(' in most of Canada'), ...seasons(false),
  ],
  IN: [
    OBS('new-year', "New Year's Day", fixed(1, 1), 'The first day of the calendar year.'),
    H('republic-day', 'Republic Day', fixed(1, 26), 'A national holiday marking the constitution, which came into force on 26 January 1950.'),
    H('independence-day', 'Independence Day', fixed(8, 15), "A national holiday marking India's independence on 15 August 1947."),
    H('gandhi-jayanti', 'Gandhi Jayanti', fixed(10, 2), "A national holiday for Mahatma Gandhi's birthday."),
    goodFridayH('A central government holiday: the Friday before Easter.'),
    eidH('eid-al-fitr', 'Id-ul-Fitr', 'A central government holiday at the end of Ramadan. Expected date (Umm al-Qura calendar); the day in India is often one later.'),
    eidH('eid-al-adha', 'Bakrid (Id-ul-Zuha)', 'A central government holiday. Expected date (Umm al-Qura calendar); the day in India is often one later.'),
    H('diwali', 'Diwali', table(DIWALI), 'The festival of lights, a central government holiday: lamps, sweets, gifts and new beginnings.'),
    christmasH(undefined, 'A central government holiday.'),
    mothersMay2(), fathersJune3(), OBS('teachers-day', "Teachers' Day", fixed(9, 5), 'A day to thank teachers.'), OBS('childrens-day', "Children's Day", fixed(11, 14), 'A day for children, on Jawaharlal Nehru\'s birthday.'),
  ],
  AU: [
    newYearH('A public holiday.'), H('australia-day', 'Australia Day', fixed(1, 26), "Australia's national day; when it falls on a weekend, the Monday after is the holiday.", { sub: 'weekend-next' }),
    goodFridayH(), easterMondayH(), H('anzac-day', 'Anzac Day', fixed(4, 25), 'A public holiday remembering those who served and died in war, with dawn services.'),
    H('kings-birthday', "King's Birthday", nth(6, MON, 2), 'A public holiday on the second Monday of June in most states and territories (not Western Australia or Queensland).'),
    christmasH(undefined, 'A public holiday.'), boxingH(undefined, 'A public holiday, the day after Christmas, and the start of the Boxing Day sales.'),
    mothersMay2(), OBS('fathers-day', "Father's Day", nth(9, SUN, 1), 'Fathers are celebrated on the first Sunday of September.'),
    OBS('melbourne-cup', 'Melbourne Cup', nth(11, TUE, 1), 'The horse race that stops the nation, on the first Tuesday of November; a public holiday in metropolitan Melbourne.'),
    o('eofy', 'End of the financial year', 'commerce', fixed(6, 30), 'The financial year ends on 30 June: tax time, and the EOFY sales.'),
    o('tax-return', 'Tax return deadline', 'commerce', fixed(10, 31), 'Tax returns people lodge themselves are due by 31 October.'),
    o('back-to-school', 'Back to school', 'season', fixed(1, 27), 'The school year starts in late January or early February, depending on the state.', range(1, 27, 2, 7)),
    ...seasons(true),
  ],
  DE: [
    newYearH('A public holiday (Neujahr).'), goodFridayH('A public holiday (Karfreitag): the Friday before Easter.'), easterMondayH(undefined, 'A public holiday (Ostermontag).'),
    workersH('Labour Day', 'A public holiday (Tag der Arbeit).'),
    ascensionH('Ascension Day', 'A public holiday (Christi Himmelfahrt), also Father\'s Day (Vatertag).'), whitMondayH('Whit Monday', 'A public holiday (Pfingstmontag).'),
    H('unity-day', 'Day of German Unity', fixed(10, 3), 'The national holiday (Tag der Deutschen Einheit), marking reunification in 1990.'),
    christmasH('Christmas Day', 'A public holiday (Erster Weihnachtstag).'), boxingH('Second Day of Christmas', 'A public holiday (Zweiter Weihnachtstag).'),
    OBS('christmas-eve', 'Christmas Eve', fixed(12, 24), 'Heiligabend: the evening when most families celebrate Christmas and give presents.'),
    OBS('rosenmontag', 'Rose Monday', fromEaster(-48), 'Rosenmontag, the height of carnival, with parades in the Rhineland.'), mothersMay2('Mother\'s Day (Muttertag)'),
    OBS('oktoberfest', 'Oktoberfest', oktoberfest, 'The Munich beer festival.', { endRule: oktoberfestEnd }),
    OBS('st-martin', "St Martin's Day", fixed(11, 11), 'Sankt Martin: lantern processions for children.'),
    OBS('advent', 'First Sunday of Advent', advent, 'The start of Advent: Advent wreaths, calendars and Christmas markets.'),
    OBS('nikolaus', "St Nicholas' Day", fixed(12, 6), 'Nikolaustag: children find sweets in their boots.'),
    ...clocksEu, ...seasons(false),
  ],
  FR: [
    newYearH('A public holiday (Jour de l\'an).'), easterMondayH(undefined, 'A public holiday (Lundi de Pâques).'), workersH('Labour Day', 'A public holiday (Fête du Travail), when people give lily of the valley.'),
    H('victory-day', 'Victory in Europe Day', fixed(5, 8), 'A public holiday (Victoire 1945) marking the end of the Second World War in Europe.'),
    ascensionH('Ascension Day', 'A public holiday (Ascension).'), whitMondayH('Whit Monday', 'A public holiday (Lundi de Pentecôte), though many employers make it a working day of solidarity.'),
    H('bastille-day', 'Bastille Day', fixed(7, 14), 'The national holiday (Fête nationale): parades and fireworks.'), H('assumption', 'Assumption Day', fixed(8, 15), 'A public holiday (Assomption), in the middle of the summer holidays.'),
    H('all-saints', "All Saints' Day", fixed(11, 1), 'A public holiday (Toussaint).'), H('armistice', 'Armistice Day', fixed(11, 11), 'A public holiday (Armistice 1918).'),
    christmasH('Christmas Day', 'A public holiday (Noël).'),
    OBS('epiphany', 'Epiphany', fixed(1, 6), 'Épiphanie: the galette des rois is shared through January.'), OBS('chandeleur', 'Chandeleur', fixed(2, 2), 'Candlemas: the day for crêpes.'),
    OBS('mothers-day', "Mother's Day", fetesDesMeres, 'Fête des mères: the last Sunday of May (or the first Sunday of June when Pentecost falls on it).'), fathersJune3('Father\'s Day (Fête des pères)'),
    OBS('fete-musique', 'Fête de la Musique', fixed(6, 21), 'Free music in the streets on the longest day.'),
    OBS('beaujolais', 'Beaujolais Nouveau', nth(11, THU, 3), 'The new Beaujolais wine is released on the third Thursday of November.'),
    o('soldes-hiver', 'Winter sales', 'commerce', soldesHiver, 'Les soldes d\'hiver: four weeks of sales in most of France.', { days: 28 }),
    o('soldes-ete', 'Summer sales', 'commerce', soldesEte, 'Les soldes d\'été: four weeks of sales in most of France.', { days: 28 }),
    o('back-to-school', 'La rentrée', 'season', fixed(9, 1), 'Back to school and back to work at the start of September.', range(9, 1, 9, 7)),
    ...clocksEu, ...seasons(false),
  ],
  NL: [
    newYearH('A public holiday (Nieuwjaarsdag).'), easterMondayH(undefined, 'A public holiday (Tweede Paasdag).'),
    H('kings-day', "King's Day", kingsDay, 'Koningsdag: orange everywhere, street markets and parties (on Saturday 26 April when the 27th is a Sunday).'),
    H('liberation-day', 'Liberation Day', fixed(5, 5), 'Bevrijdingsdag, a national holiday marking the end of the occupation in 1945; not every employer gives the day off.'),
    ascensionH('Ascension Day', 'A public holiday (Hemelvaartsdag).'), whitMondayH('Whit Monday', 'A public holiday (Tweede Pinksterdag).'),
    christmasH('Christmas Day', 'A public holiday (Eerste Kerstdag).'), boxingH('Second Day of Christmas', 'A public holiday (Tweede Kerstdag).'),
    OBS('good-friday', 'Good Friday', fromEaster(-2), 'Goede Vrijdag; not a day off for most people.'), mothersMay2('Mother\'s Day (Moederdag)'), fathersJune3('Father\'s Day (Vaderdag)'),
    OBS('prinsjesdag', 'Prinsjesdag', nth(9, TUE, 3), "The King's speech opens the parliamentary year and the budget is presented, on the third Tuesday of September."),
    OBS('sinterklaas', 'Sinterklaas', fixed(12, 5), 'Pakjesavond: the evening of Sinterklaas presents and poems.'),
    ...clocksEu, ...seasons(false),
  ],
  ES: [
    newYearH('A national holiday (Año Nuevo).'), H('epiphany', 'Epiphany', fixed(1, 6), 'A national holiday (Día de Reyes), when children get their presents from the Three Kings.'),
    goodFridayH('A national holiday (Viernes Santo).'), workersH('Labour Day', 'A national holiday (Fiesta del Trabajo).'),
    H('assumption', 'Assumption Day', fixed(8, 15), 'A national holiday (Asunción de la Virgen).'), H('national-day', 'National Day of Spain', fixed(10, 12), 'A national holiday (Fiesta Nacional de España).'),
    H('all-saints', "All Saints' Day", fixed(11, 1), 'A national holiday (Todos los Santos).'), H('constitution-day', 'Constitution Day', fixed(12, 6), 'A national holiday (Día de la Constitución).'),
    H('immaculate-conception', 'Immaculate Conception', fixed(12, 8), 'A national holiday (Inmaculada Concepción).'), christmasH('Christmas Day', 'A national holiday (Navidad).'),
    OBS('reyes-eve', 'Three Kings parades', fixed(1, 5), 'Cabalgatas de Reyes: parades on the evening before Epiphany.'),
    OBS('fathers-day', "Father's Day", fixed(3, 19), 'Día del Padre, on St Joseph\'s Day.'), OBS('mothers-day', "Mother's Day", nth(5, SUN, 1), 'Día de la Madre, on the first Sunday of May.'),
    OBS('san-juan', 'Noche de San Juan', fixed(6, 23), 'Bonfires and beach parties on the shortest night.'),
    OBS('loteria', 'Christmas lottery draw', fixed(12, 22), 'El Gordo, the Christmas lottery, is drawn on 22 December.'),
    OBS('new-years-eve', "New Year's Eve", fixed(12, 31), 'Nochevieja: twelve grapes at the twelve chimes of midnight.'),
    o('back-to-school', 'Back to school', 'season', fixed(9, 1), 'Schools go back in the first half of September, on dates each region sets.', range(9, 1, 9, 15)),
    ...clocksEu, ...seasons(false),
  ],
  IT: [
    newYearH('A national holiday (Capodanno).'), H('epiphany', 'Epiphany', fixed(1, 6), 'A national holiday (Epifania), when the Befana brings sweets.'), easterMondayH('Easter Monday', 'A national holiday (Pasquetta), for picnics and trips out.'),
    H('liberation-day', 'Liberation Day', fixed(4, 25), 'A national holiday (Festa della Liberazione).'), workersH('Labour Day', 'A national holiday (Festa dei Lavoratori).'),
    H('republic-day', 'Republic Day', fixed(6, 2), 'A national holiday (Festa della Repubblica).'), H('ferragosto', 'Ferragosto', fixed(8, 15), 'A national holiday at the height of the summer holidays.'),
    H('all-saints', "All Saints' Day", fixed(11, 1), 'A national holiday (Ognissanti).'), H('immaculate-conception', 'Immaculate Conception', fixed(12, 8), "A national holiday (Immacolata), when many put up the Christmas tree."),
    christmasH('Christmas Day', 'A national holiday (Natale).'), boxingH("St Stephen's Day", 'A national holiday (Santo Stefano).'),
    OBS('fathers-day', "Father's Day", fixed(3, 19), 'Festa del papà, on St Joseph\'s Day.'), mothersMay2('Mother\'s Day (Festa della mamma)'),
    OBS('carnevale', 'Carnival Tuesday', fromEaster(-47), 'Martedì grasso, the last day of carnival.'),
    o('back-to-school', 'Back to school', 'season', fixed(9, 8), 'Schools go back in mid-September, on dates each region sets.', range(9, 8, 9, 20)),
    ...clocksEu, ...seasons(false),
  ],
};

// The day off of a public holiday that falls on a weekend, by the rule the entry names, avoiding days already taken by holidays.
function substitute(day, rule, taken) {
  const wd = day.getUTCDay();
  if (rule === 'us') return wd === SAT ? plus(day, -1) : wd === SUN ? plus(day, 1) : null;
  if (rule === 'sunday-next' && wd !== SUN) return null;
  if (rule === 'weekend-next' && wd !== SAT && wd !== SUN) return null;
  let t = plus(day, 1);
  while (t.getUTCDay() === SAT || t.getUTCDay() === SUN || taken.has(iso(t))) t = plus(t, 1);
  return t;
}

function entriesFor(country) {
  const own = COUNTRIES[country] ?? [];
  const ids = new Set(own.map((e) => e.id));
  return [...GLOBAL.filter((g) => !ids.has(g.id)), ...own];
}

function occurrences(entry, year) {
  return entry.rule(year).filter(Boolean).map((start) => {
    let end = null;
    if (entry.endRule) end = entry.endRule(year);
    else if (entry.untilNext) { const next = [...entry.untilNext(year), ...entry.untilNext(year + 1)].find((t) => t > start); end = next ? plus(next, -1) : null; }
    else if (entry.days > 1) end = plus(start, entry.days - 1);
    return { entry, start, end: end && end > start ? end : null };
  });
}

const DAY_OK = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (s) => typeof s === 'string' && DAY_OK.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && iso(new Date(`${s}T00:00:00Z`)) === s;
export const isCoveredCountry = (c) => OCCASION_COUNTRIES.includes(c);

// The occasions that touch the window [from, to] (YYYY-MM-DD, both included), sorted by date. `country` is an ISO 3166-1 alpha-2
// code; without one, or for a country the calendar does not cover, only the global occasions come back.
export function occasionsFor({ country, from, to } = {}) {
  if (!realDay(from) || !realDay(to) || from > to) throw new AIError('occasions need a window: from and to as real YYYY-MM-DD dates, from before to', { code: 'config' });
  const a = new Date(`${from}T00:00:00Z`), b = new Date(`${to}T00:00:00Z`);
  if ((b - a) / DAY > MAX_OCCASION_DAYS) throw new AIError(`occasions are given for at most ${MAX_OCCASION_DAYS} days at a time`, { code: 'config' });
  const cc = typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : null;
  const entries = entriesFor(cc);
  const out = [];
  for (let y = a.getUTCFullYear() - 1; y <= b.getUTCFullYear(); y++) {
    const all = entries.flatMap((e) => occurrences(e, y));
    // substitute days, in date order, so a moved Christmas pushes Boxing Day on
    const taken = new Set(all.filter((x) => x.entry.kind === 'holiday').map((x) => iso(x.start)));
    for (const x of all.filter((z) => z.entry.sub).sort((p, q) => p.start - q.start)) {
      const s = substitute(x.start, x.entry.sub, taken);
      if (s) { x.observed = s; taken.add(iso(s)); }
    }
    for (const x of all) {
      const last = x.end ?? x.start;
      if (last < a || x.start > b) continue;
      const moved = x.observed ? ` In ${x.start.getUTCFullYear()} it falls on a ${WEEKDAYS[x.start.getUTCDay()]}, so the day off is ${spoken(x.observed)}.` : '';
      out.push({
        id: `${x.entry.id}-${iso(x.start)}`, name: x.entry.name, date: iso(x.start), ...(x.end ? { end: iso(x.end) } : {}), kind: x.entry.kind,
        note: `${x.entry.note}${moved}`, ...(x.observed ? { observed: iso(x.observed) } : {}), country: COUNTRIES[cc] && !GLOBAL.includes(x.entry) ? cc : null,
      });
    }
  }
  const rank = { holiday: 0, observance: 1, commerce: 2, season: 3 };
  return [...new Map(out.map((x) => [x.id, x])).values()].sort((p, q) => p.date.localeCompare(q.date) || rank[p.kind] - rank[q.kind] || p.name.localeCompare(q.name));
}

// ---- occasions as a draft takes them: chosen by a person in the app, or found on the web and ticked ----
export const OCCASION_LIMITS = { max: 40, name: 80, note: 300, source: 600 };
// Checks and trims the list a draft request carries: { name, date, end?, kind, note?, source? }. Returns { occasions, problems }.
export function cleanOccasions(list, period) {
  if (list === undefined) return { occasions: [], problems: [] };
  if (!Array.isArray(list)) return { occasions: [], problems: ['occasions must be a list'] };
  const problems = [], occasions = [];
  list.slice(0, OCCASION_LIMITS.max).forEach((x, i) => {
    const name = typeof x?.name === 'string' ? x.name.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (!name || [...name].length > OCCASION_LIMITS.name) { problems.push(`occasions[${i}]: name must be a text of 1 to ${OCCASION_LIMITS.name} characters`); return; }
    if (x.date !== undefined && !realDay(x.date)) { problems.push(`occasions[${i}]: date must be a real YYYY-MM-DD date`); return; }
    if (x.end !== undefined && (!realDay(x.end) || !x.date || x.end < x.date)) { problems.push(`occasions[${i}]: end must be a date on or after date`); return; }
    const kind = OCCASION_KINDS.includes(x.kind) ? x.kind : 'observance';
    const source = typeof x.source === 'string' && /^https?:\/\/\S+$/i.test(x.source) ? x.source.slice(0, OCCASION_LIMITS.source) : undefined;
    if (period && x.date && (x.end ?? x.date) < period.from) return;
    if (period && x.date && x.date > period.to) return;
    occasions.push({ name, ...(x.date ? { date: x.date } : {}), ...(x.end ? { end: x.end } : {}), kind, ...(typeof x.note === 'string' && x.note.trim() ? { note: x.note.trim().slice(0, OCCASION_LIMITS.note) } : {}), ...(source ? { source } : {}) });
  });
  return { occasions, problems };
}
