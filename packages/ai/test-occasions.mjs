// The calendar of occasions (src/occasions.mjs): date rules against known dates, substitute days, the Islamic and Hebrew
// calendars through Intl, the Diwali table, the window, and the list a draft takes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { OCCASION_COUNTRIES, OCCASION_KINDS, cleanOccasions, easter, nthWeekday, occasionsFor } from './src/occasions.mjs';

const find = (country, from, to, name) => occasionsFor({ country, from, to }).filter((x) => x.name === name);
const dateOf = (country, year, name) => find(country, `${year}-01-01`, `${year}-12-31`, name).map((x) => x.date);

test('occasions: Easter by computation', () => {
  const known = { 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28', 2028: '2028-04-16', 2029: '2029-04-01', 2030: '2030-04-21' };
  for (const [y, d] of Object.entries(known)) assert.equal(easter(Number(y)).toISOString().slice(0, 10), d, y);
  assert.deepEqual(dateOf('GB', 2026, 'Good Friday'), ['2026-04-03']);
  assert.deepEqual(dateOf('IE', 2026, 'Easter Monday'), ['2026-04-06']);
  assert.deepEqual(dateOf('DE', 2026, 'Ascension Day'), ['2026-05-14']);
  assert.deepEqual(dateOf('NL', 2026, 'Whit Monday'), ['2026-05-25']);
  assert.deepEqual(dateOf('GB', 2026, 'Mothering Sunday'), ['2026-03-15']);
  assert.deepEqual(dateOf('GB', 2026, 'Pancake Day'), ['2026-02-17']);
});

test('occasions: weekday rules', () => {
  assert.equal(nthWeekday(2026, 12, 5, 1).toISOString().slice(0, 10), '2026-12-04');
  assert.equal(nthWeekday(2026, 5, 1, -1).toISOString().slice(0, 10), '2026-05-25');
  // the owner's example: the first Friday of December is Farmers' Day in Ghana
  assert.deepEqual(dateOf('GH', 2025, "National Farmers' Day"), ['2025-12-05']);
  assert.deepEqual(dateOf('GH', 2026, "National Farmers' Day"), ['2026-12-04']);
  assert.deepEqual(dateOf('US', 2026, 'Thanksgiving'), ['2026-11-26']);
  assert.deepEqual(dateOf('US', 2026, 'Black Friday'), ['2026-11-27']);
  assert.deepEqual(dateOf('IE', 2026, 'Cyber Monday'), ['2026-11-30']);
  assert.deepEqual(dateOf('US', 2026, 'Martin Luther King Jr. Day'), ['2026-01-19']);
  assert.deepEqual(dateOf('US', 2026, 'Labor Day'), ['2026-09-07']);
  assert.deepEqual(dateOf('CA', 2026, 'Thanksgiving'), ['2026-10-12']);
  assert.deepEqual(dateOf('CA', 2025, 'Victoria Day'), ['2025-05-19']);
  assert.deepEqual(dateOf('CA', 2026, 'Victoria Day'), ['2026-05-18']);
  assert.deepEqual(dateOf('GB', 2026, 'Early May bank holiday'), ['2026-05-04']);
  assert.deepEqual(dateOf('GB', 2026, 'Summer bank holiday'), ['2026-08-31']);
  assert.deepEqual(dateOf('IE', 2026, 'October bank holiday'), ['2026-10-26']);
  assert.deepEqual(dateOf('AU', 2026, 'Melbourne Cup'), ['2026-11-03']);
  assert.deepEqual(dateOf('DE', 2026, 'First Sunday of Advent'), ['2026-11-29']);
  assert.deepEqual(dateOf('DE', 2027, 'First Sunday of Advent'), ['2027-11-28']);
  assert.deepEqual(dateOf('NL', 2026, 'Prinsjesdag'), ['2026-09-15']);
});

test('occasions: the special rules (St Brigid, King\'s Day, Fête des mères, Oktoberfest, French sales)', () => {
  assert.deepEqual(dateOf('IE', 2026, "St Brigid's Day"), ['2026-02-02']);
  assert.deepEqual(dateOf('IE', 2030, "St Brigid's Day"), ['2030-02-01'], '1 February is a Friday');
  assert.deepEqual(dateOf('NL', 2025, "King's Day"), ['2025-04-26'], '27 April 2025 is a Sunday');
  assert.deepEqual(dateOf('NL', 2026, "King's Day"), ['2026-04-27']);
  assert.deepEqual(dateOf('FR', 2026, "Mother's Day"), ['2026-05-31']);
  assert.deepEqual(dateOf('FR', 2023, "Mother's Day"), ['2023-06-04'], 'Pentecost fell on the last Sunday of May 2023');
  const okt = find('DE', '2026-09-01', '2026-10-31', 'Oktoberfest')[0];
  assert.deepEqual([okt.date, okt.end], ['2026-09-19', '2026-10-04']);
  const okt23 = find('DE', '2023-09-01', '2023-10-31', 'Oktoberfest')[0];
  assert.deepEqual([okt23.date, okt23.end], ['2023-09-16', '2023-10-03']);
  assert.deepEqual(dateOf('FR', 2026, 'Winter sales'), ['2026-01-07']);
  assert.deepEqual(dateOf('FR', 2026, 'Summer sales'), ['2026-06-24']);
});

test('occasions: substitute days for holidays on a weekend (GB, ZA, US)', () => {
  const gb26 = find('GB', '2026-12-20', '2026-12-31', 'Boxing Day')[0];
  assert.equal(gb26.observed, '2026-12-28');
  assert.match(gb26.note, /Saturday, so the day off is Monday 28 December/);
  const gb27 = occasionsFor({ country: 'GB', from: '2027-12-20', to: '2028-01-05' });
  assert.equal(gb27.find((x) => x.name === 'Christmas Day').observed, '2027-12-27');
  assert.equal(gb27.find((x) => x.name === 'Boxing Day').observed, '2027-12-28');
  assert.equal(gb27.find((x) => x.name === "New Year's Day").observed, '2028-01-03');
  assert.equal(find('ZA', '2027-12-20', '2027-12-31', 'Day of Goodwill')[0].observed, '2027-12-27');
  assert.equal(find('ZA', '2027-12-20', '2027-12-31', 'Christmas Day')[0].observed, undefined, 'Saturday holidays do not move in South Africa');
  assert.equal(find('US', '2026-07-01', '2026-07-31', 'Independence Day')[0].observed, '2026-07-03');
  assert.equal(find('US', '2027-12-20', '2027-12-31', 'Christmas Day')[0].observed, '2027-12-24');
  assert.equal(find('IE', '2026-12-20', '2026-12-31', "St Stephen's Day")[0].observed, undefined);
});

test('occasions: the Islamic and Hebrew calendars, and the Diwali table', () => {
  assert.deepEqual(dateOf('GH', 2026, 'Eid al-Fitr'), ['2026-03-20']);
  assert.deepEqual(dateOf('NG', 2026, 'Eid al-Adha'), ['2026-05-27']);
  assert.deepEqual(dateOf('GB', 2025, 'Eid al-Fitr'), ['2025-03-30']);
  const ramadan = find('IE', '2026-01-01', '2026-12-31', 'Ramadan begins')[0];
  assert.deepEqual([ramadan.date, ramadan.end], ['2026-02-18', '2026-03-19']);
  assert.equal(find('GH', '2026-01-01', '2026-12-31', 'Eid al-Fitr')[0].kind, 'holiday');
  assert.equal(find('IE', '2026-01-01', '2026-12-31', 'Eid al-Fitr')[0].kind, 'observance');
  assert.match(find('IE', '2026-01-01', '2026-12-31', 'Eid al-Fitr')[0].note, /may differ by a day/);
  const han = find('US', '2026-12-01', '2026-12-31', 'Hanukkah')[0];
  assert.deepEqual([han.date, han.end], ['2026-12-05', '2026-12-12']);
  assert.deepEqual(dateOf('IN', 2026, 'Diwali'), ['2026-11-08']);
  assert.deepEqual(dateOf('IN', 2031, 'Diwali'), [], 'no guess outside the table');
  // every Diwali in the table is on, or a day or two before, a new moon (mean lunation; the true moon is within about 14 hours of it)
  const ref = Date.UTC(2000, 0, 6, 18, 14), syn = 29.530588853 * 86_400_000;
  for (let y = 2025; y <= 2030; y++) {
    const [d] = dateOf('IN', y, 'Diwali');
    const t = Date.parse(`${d}T12:00:00Z`), moon = ref + Math.round((t - ref) / syn) * syn;
    const off = (t - moon) / 86_400_000;
    assert.ok(off > -2.2 && off < 1, `${d} is ${off.toFixed(2)} days from a new moon`);
    assert.ok(d >= `${y}-10-13` && d <= `${y}-11-14`, d);
  }
});

test('occasions: month ends, seasons, ranges that cross the window', () => {
  assert.deepEqual(dateOf('IE', 2026, 'Month-end payday').slice(0, 3), ['2026-01-30', '2026-02-27', '2026-03-31']);
  const winter = find('IE', '2027-01-10', '2027-01-20', 'Winter')[0];
  assert.deepEqual([winter.date, winter.end, winter.kind], ['2026-12-01', '2027-02-28', 'season']);
  assert.equal(find('AU', '2026-12-01', '2026-12-31', 'Summer')[0].date, '2026-12-01', 'the southern hemisphere');
  assert.deepEqual(find('GH', '2026-12-01', '2026-12-31', 'Winter'), [], 'no temperate seasons near the equator');
});

test('occasions: every country covered, every entry well formed, an unknown country gets the global ones', () => {
  assert.deepEqual(OCCASION_COUNTRIES, ['GH', 'NG', 'KE', 'ZA', 'GB', 'IE', 'US', 'CA', 'IN', 'AU', 'DE', 'FR', 'NL', 'ES', 'IT']);
  for (const c of OCCASION_COUNTRIES) {
    const year = occasionsFor({ country: c, from: '2026-01-01', to: '2026-12-31' });
    assert.ok(year.filter((x) => x.kind === 'holiday').length >= 6, `${c} has its public holidays`);
    assert.ok(year.some((x) => x.name.startsWith('Christmas') && x.kind === 'holiday'), `${c}: Christmas`);
    for (const x of year) {
      assert.ok(x.name && x.note && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && OCCASION_KINDS.includes(x.kind), JSON.stringify(x));
      assert.ok(!x.end || x.end > x.date);
      assert.ok(x.note.length <= 300 && x.name.length <= 80);
    }
    assert.equal(new Set(year.map((x) => x.id)).size, year.length, `${c}: ids are unique`);
  }
  const other = occasionsFor({ country: 'BR', from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual(other.map((x) => x.name), ['Christmas Eve', 'Christmas Day', "New Year's Eve", 'Month-end payday']);
  assert.ok(other.every((x) => x.kind !== 'holiday' && x.country === null));
  assert.deepEqual(occasionsFor({ from: '2026-02-14', to: '2026-02-14' }).map((x) => x.name), ["Valentine's Day"]);
  assert.throws(() => occasionsFor({ country: 'IE', from: '2026-12-31', to: '2026-12-01' }), /from before to/);
  assert.throws(() => occasionsFor({ country: 'IE', from: '2026-02-30', to: '2026-03-01' }), /real YYYY-MM-DD/);
  assert.throws(() => occasionsFor({ country: 'IE', from: '2026-01-01', to: '2028-01-01' }), /at most 400 days/);
});

test('occasions: the list a draft takes is checked and trimmed', () => {
  const period = { from: '2026-12-01', to: '2026-12-31' };
  const { occasions, problems } = cleanOccasions([
    { name: '  Christmas\nDay ', date: '2026-12-25', kind: 'holiday', note: 'A public holiday.' },
    { name: 'Our winter market', kind: 'nonsense' },
    { name: 'Too early', date: '2026-11-02' },
    { name: 'Web find', date: '2026-12-12', kind: 'observance', source: 'https://example.org/x' },
    { name: 'Bad source', date: '2026-12-13', source: 'javascript:alert(1)' },
    { name: 'x'.repeat(81) },
    { name: 'Bad date', date: '2026-02-30' },
  ], period);
  assert.deepEqual(occasions, [
    { name: 'Christmas Day', date: '2026-12-25', kind: 'holiday', note: 'A public holiday.' },
    { name: 'Our winter market', kind: 'observance' },
    { name: 'Web find', date: '2026-12-12', kind: 'observance', source: 'https://example.org/x' },
    { name: 'Bad source', date: '2026-12-13', kind: 'observance' },
  ]);
  assert.equal(problems.length, 2);
  assert.deepEqual(cleanOccasions(undefined), { occasions: [], problems: [] });
  assert.deepEqual(cleanOccasions('x').problems, ['occasions must be a list']);
});
