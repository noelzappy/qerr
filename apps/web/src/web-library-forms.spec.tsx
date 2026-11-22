// Facts, Pictures and the list filters, phase 1 of the calmer forms: the fact page fills "Recorded on" with today and the
// title from the text (marked, and never over what the person typed), folds the dates into one line, offers kind as chips
// and keeps every value when the kind changes; the upload page shows the description on every card and sets the licence,
// people and tags for all pictures at once, a card keeping its own choice; tags are one chip control; small choices and
// filters are radio groups, not dropdowns; the batch page's Show menu counts each choice. Drawn as static markup and run
// through the pure helpers (no browser); how the controls behave under the pointer was looked at in screenshots.
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { addTags, SegmentedField } from '@/components/kit';
import { datesSummary, editBody, editField, editTitle, startDraft, suggestTitle, todayInput } from '../web/src/pages/vault/fact-form';
import { FactFields } from '../web/src/pages/vault/FactFields';
import { FilterBar } from '../web/src/pages/vault/FilterBar';
import { applyForAll, editRow, makeRow, NO_FOR_ALL, rowPayload, type ForAll } from '../web/src/pages/library/upload-rows';
import { ForAllBar, UploadRow } from '../web/src/pages/library/UploadPage';
import { PictureSuggestProvider } from '../web/src/components/suggest/PictureSuggest';
import { postFilterCounts } from '../web/src/pages/batches/post-filter';

const draw = (node: React.ReactNode) => renderToString(<MemoryRouter><TooltipProvider>{node}</TooltipProvider></MemoryRouter>);
const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
const TODAY = '2026-11-22';

describe('the fact form', () => {
  it('starts a new fact recorded today, and an existing one with its own date', () => {
    expect(startDraft(null, TODAY).form.recordedAt).toBe(TODAY);
    expect(todayInput(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('suggests the title from the first words of the text until the person types one', () => {
    let d = startDraft(null, TODAY);
    d = editBody(d, 'members saved 1.2 million pounds together in 2025, the annual report says. More follows.');
    expect(d.form.title).toBe('Members saved 1.2 million pounds together in 2025');
    expect(d.titleAuto).toBe(true);
    d = editTitle(d, 'Savings in 2025');
    d = editBody(d, 'Something else entirely.');
    expect(d.form.title).toBe('Savings in 2025');
    expect(d.titleAuto).toBe(false);
  });

  it('cuts a suggestion at a sentence and drops the closing punctuation', () => {
    expect(suggestTitle('Paper records. Then more.')).toBe('Paper records');
    expect(suggestTitle('   ')).toBe('');
    expect(suggestTitle('one\ntwo')).toBe('One');
  });

  it('keeps every typed value when the kind changes and changes back', () => {
    let d = startDraft(null, TODAY);
    d = editField(d, 'kind', 'photo');
    d = editField(d, 'licence', 'own');
    d = editField(d, 'licenceNotes', 'Our photographer');
    d = editField(d, 'peoplePresent', true);
    d = editBody(d, 'A jar on a stall');
    d = editField(d, 'kind', 'fact');
    d = editField(d, 'kind', 'photo');
    expect(d.form).toMatchObject({ kind: 'photo', licence: 'own', licenceNotes: 'Our photographer', peoplePresent: true, body: 'A jar on a stall', title: 'A jar on a stall' });
  });

  it('says the three dates in one line', () => {
    expect(datesSummary({ recordedAt: TODAY, validFrom: '', validUntil: '' }, TODAY)).toBe('Recorded today, no end date');
    expect(datesSummary({ recordedAt: '2026-03-01', validFrom: '2026-01-01', validUntil: '2026-12-31' }, TODAY)).toBe('Recorded 1 Mar 2026, valid 1 Jan 2026 to 31 Dec 2026');
    expect(datesSummary({ recordedAt: '', validFrom: '', validUntil: '2027-01-31' }, TODAY)).toBe('No date recorded, valid until 31 Jan 2027');
  });
});

describe('the fact page fields', () => {
  const fields = (d = startDraft(null, TODAY), autoRecordedAt: string | null = TODAY) =>
    draw(<FactFields draft={d} onDraft={() => {}} fields={{}} autoRecordedAt={autoRecordedAt} today={TODAY} />);

  it('offers the kind as radio chips, not a dropdown', () => {
    const html = fields();
    expect(html).not.toContain('role="combobox"');
    expect(html.match(/type="radio"/g)?.length).toBe(8);
    expect(html).toContain('<legend');
  });

  it('folds the dates into one closed line with their summary while no validity date is set', () => {
    const html = fields();
    expect(html).toMatch(/aria-expanded="false"[^>]*aria-controls="fact-dates"/);
    expect(html).toContain('Recorded today, no end date');
    expect(html).not.toContain('type="date"');
  });

  it('opens the dates when a validity date is set, and marks today as filled in', () => {
    const d = editField(startDraft(null, TODAY), 'validUntil', '2026-12-31');
    const html = fields(d);
    expect(html.match(/type="date"/g)?.length).toBe(3);
    expect(html).toMatch(/Recorded on<span data-filled-tag="[^"]*"[^>]*>Today<\/span>/);
  });

  it('marks the suggested title, and drops the mark once the person typed one', () => {
    const auto = editBody(startDraft(null, TODAY), 'Paper records for every group.');
    expect(fields(auto)).toContain('>From the text</span>');
    expect(fields(editTitle(auto, 'Paper'))).not.toContain('>From the text</span>');
  });

  it('puts the two source fields side by side', () => {
    const html = fields();
    const grid = html.slice(html.indexOf('aria-label="Source"'), html.indexOf('aria-label="Dates"'));
    expect(grid).toContain('md:grid-cols-2');
    expect(grid).toContain('type="url"');
    expect(grid).toContain('<textarea');
  });

  it('asks about people with switches and the licence as segmented buttons on a photo', () => {
    const d = editField(editField(startDraft(null, TODAY), 'kind', 'photo'), 'peoplePresent', true);
    const html = fields(d);
    expect(html.match(/role="switch"/g)?.length).toBe(2);
    expect(html).not.toContain('role="checkbox"');
    expect(html).toContain('Rights to confirm');
    expect(html).not.toContain('role="combobox"');
  });

  it('edits tags as chips', () => {
    const html = fields(editField(startDraft(null, TODAY), 'tags', ['news', 'numbers']));
    expect(html).toContain('aria-label="Remove the tag news"');
    expect(html).not.toContain('separate several with commas');
  });
});

describe('the one tag control', () => {
  const rules = { maxItems: 3, maxLength: 10, stripHash: true, noun: 'tag' };
  it('adds trimmed words once, ignoring case and a leading #', () => {
    expect(addTags(['News'], [' news', '#numbers', ''], rules)).toEqual({ next: ['News', 'numbers'] });
  });
  it('refuses a word that is too long or one too many', () => {
    expect(addTags([], ['a-very-long-word'], rules)).toEqual({ problem: 'A tag can be at most 10 characters.' });
    expect(addTags(['a', 'b', 'c'], ['d'], rules)).toEqual({ problem: 'There can be at most 3 tags.' });
  });
  it('keeps a # when the list asks for it (brand words)', () => {
    expect(addTags([], ['#1'], { ...rules, stripHash: false })).toEqual({ next: ['#1'] });
  });
});

describe('the upload rows', () => {
  it('starts with the title from the file name and the kind guessed, both marked as filled in', () => {
    const r = makeRow(file('phone-screen_app.jpg'), 'blob:x', 'photo');
    expect(r).toMatchObject({ title: 'Phone screen app', titleAuto: true, kind: 'screen', kindGuessed: true });
    expect(editRow(r, { title: 'App' }).titleAuto).toBe(false);
    expect(editRow(r, { kind: 'photo' }).kindGuessed).toBe(false);
  });

  it('applies the bar to every card except one that chose its own', () => {
    const a = makeRow(file('a.jpg'), 'blob:a', 'photo');
    const b = editRow(makeRow(file('b.jpg'), 'blob:b', 'photo'), { licence: 'rights_to_confirm' });
    const next: ForAll = { licence: 'own', people: 'consent', tags: ['market'] };
    const [ra, rb] = applyForAll([a, b], NO_FOR_ALL, next, 'photo');
    expect(ra).toMatchObject({ licence: 'own', peoplePresent: true, consentRecorded: true, tags: ['market'] });
    expect(rb).toMatchObject({ licence: 'rights_to_confirm', peoplePresent: true, tags: ['market'] });
    // taking the tag off the bar takes it off every card; a later licence change leaves the card's own tags alone
    const [ra2] = applyForAll([editRow(ra, { tags: ['market', 'jar'] })], next, { ...next, tags: [], licence: 'licensed' }, 'photo');
    expect(ra2).toMatchObject({ tags: ['jar'], licence: 'licensed' });
  });

  it('gives a picture added later what the bar already says', () => {
    const r = makeRow(file('c.jpg'), 'blob:c', 'photo', { licence: 'licensed', people: 'none', tags: ['x'] });
    expect(rowPayload(r, 'photo')).toMatchObject({ licence: 'licensed', peoplePresent: false, consentRecorded: false, tags: ['x'] });
  });

  it('shows the description on the card, not under More details, and tags as chips there', () => {
    const r = { ...makeRow(file('object-jar.jpg'), 'blob:x', 'photo'), tags: ['jar'], expanded: true };
    const html = draw(<ul><UploadRow row={{ ...r, expanded: false }} role="photo" disabled={false} forAll={NO_FOR_ALL} onChange={() => {}} onToggle={() => {}} onRemove={() => {}} /></ul>);
    const toggle = html.indexOf('More details');
    expect(html.indexOf('<textarea')).toBeGreaterThan(-1);
    expect(html.indexOf('<textarea')).toBeLessThan(toggle);
    expect(html).toContain('>From the file name</span>');
    expect(html).toContain('>Guessed</span>');
    expect(html).toContain('People, consent recorded');
    expect(html).not.toContain('role="combobox"');
    const open = draw(<ul><UploadRow row={r} role="photo" disabled={false} forAll={NO_FOR_ALL} onChange={() => {}} onToggle={() => {}} onRemove={() => {}} /></ul>);
    expect(open).toContain('aria-label="Remove the tag jar"');
  });

  it('offers "Describe with AI" right after the card\'s description, and "Describe all" on the bar', () => {
    const r = makeRow(file('object-jar.jpg'), 'blob:x', 'photo');
    const html = draw(<PictureSuggestProvider><ul><UploadRow row={r} role="photo" disabled={false} forAll={NO_FOR_ALL} onChange={() => {}} onToggle={() => {}} onRemove={() => {}} /></ul></PictureSuggestProvider>);
    const describe = html.indexOf('Describe with AI');
    expect(describe).toBeGreaterThan(html.indexOf('<textarea'));
    expect(describe).toBeLessThan(html.indexOf('Licence'));
    const bar = draw(<PictureSuggestProvider><ForAllBar count={3} role="photo" value={NO_FOR_ALL} disabled={false} onChange={() => {}} /></PictureSuggestProvider>);
    expect(bar).toContain('Describe all with AI');
  });

  it('marks a card value that came from the bar', () => {
    const all: ForAll = { licence: 'own', people: null, tags: [] };
    const r = makeRow(file('a.jpg'), 'blob:a', 'photo', all);
    const html = draw(<ul><UploadRow row={r} role="photo" disabled={false} forAll={all} onChange={() => {}} onToggle={() => {}} onRemove={() => {}} /></ul>);
    expect(html.match(/>For all<\/span>/g)?.length).toBe(1);
  });

  it('draws the bar with the licence as one choice and the people as three', () => {
    const html = draw(<ForAllBar count={3} role="photo" value={NO_FOR_ALL} disabled={false} onChange={() => {}} />);
    expect(html.replace(/<!-- -->/g, '')).toContain('For all 3 pictures');
    expect(html.match(/type="radio"/g)?.length).toBe(6);
    expect(html).toContain('No people');
    expect(html).toContain('People, no consent');
  });
});

describe('segmented buttons and filters', () => {
  it('are one radio group under a legend, with counts read with each choice', () => {
    const html = draw(<SegmentedField label="Status" value="a" onValueChange={() => {}} options={[{ value: 'a', label: 'Any', count: 4 }, { value: 'b', label: 'Done', count: 1 }]} />);
    const names = [...html.matchAll(/type="radio"[^>]*name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(1);
    expect(html).toContain('<legend');
    expect(html).toMatch(/Done<span[^>]*>1<\/span>/);
  });

  it('make the Facts filters one tap each, with kind as chips', () => {
    const html = draw(<FilterBar ariaLabel="Filter" search={{ value: '', onChange: () => {}, placeholder: 'Search' }} tag={{ value: '', onChange: () => {} }} active={false} onClear={() => {}}
      filters={[
        { key: 'status', label: 'Status', allLabel: 'Any', value: '', onChange: () => {}, options: [{ value: 'confirmed', label: 'Confirmed' }, { value: 'unconfirmed', label: 'Unconfirmed' }] },
        { key: 'kind', label: 'Kind', allLabel: 'All', value: 'news', onChange: () => {}, options: [{ value: 'fact', label: 'Fact' }, { value: 'news', label: 'News' }], display: 'chips' },
      ]} />);
    expect(html).not.toContain('role="combobox"');
    expect(html.match(/type="radio"/g)?.length).toBe(6);
    expect(html).toMatch(/checked="" value="news"/);
  });

  it('count the posts each Show choice keeps on the batch page', () => {
    const p = (status: 'draft' | 'approved', renderStatus: 'ok' | 'failed', warningCount: number) => ({ status, renderStatus, warningCount }) as Parameters<typeof postFilterCounts>[0][number];
    expect(postFilterCounts([p('draft', 'failed', 0), p('draft', 'ok', 2), p('approved', 'ok', 0)])).toEqual({ '': 3, draft: 2, approved: 1, 'render-failed': 1, warnings: 1 });
  });
});
