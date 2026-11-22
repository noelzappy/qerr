// The guided first setup's rules (web/src/pages/setup/flow.ts and logo-colours.ts): where a person lands and picks up again,
// what the first save of the brand keeps, the typing kept across a reload, how a suggestion fills the form, and the logo's colours.
import { describe, expect, it } from 'vitest';
import {
  aiDraftBlocker, applySuggestion, brandSettingsFor, clearDraft, cleanWebsite, DRAFT_KEY, emptyDraft, initialLook, languageFor, loadDraft, loadSiteColours,
  nextStep, prevStep, providerBody, readBudget, readSuggestion, resumeStep, saveDraft, saveSiteColours, setupLinkForHomeStep, shouldLandOnSetup, stepStates,
  typeInDraft, type SetupStatus,
} from '../web/src/pages/setup/flow';
import { dominantColours, guessRoles } from '../web/src/pages/setup/logo-colours';
import type { BrandSettings } from '../web/src/pages/settings/brand-types';

function status(over: { brandSaved?: boolean; done?: Partial<Record<keyof SetupStatus['steps'], boolean>>; skipped?: SetupStatus['progress']['skipped']; left?: boolean; finished?: boolean } = {}): SetupStatus {
  const done = over.done ?? {};
  return {
    brandSaved: over.brandSaved ?? false,
    steps: {
      brand: { done: done.brand ?? over.brandSaved ?? false },
      logo: { done: done.logo ?? false },
      look: { done: done.look ?? false, activeRef: null },
      channels: { done: done.channels ?? false, accounts: 0, routes: 0 },
      ai: { done: done.ai ?? false, missing: done.ai ? null : 'provider', providers: 0 },
      batch: { done: done.batch ?? false },
    },
    progress: { done: [], skipped: over.skipped ?? [], left: over.left ?? false, finished: over.finished ?? false },
  };
}

// A memory stand-in for sessionStorage.
function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

describe('where a person lands', () => {
  it('sends an admin with no saved brand to the setup', () => {
    expect(shouldLandOnSetup('admin', status())).toBe(true);
  });
  it('leaves editors, saved brands, a setup left for later and a finished one alone', () => {
    expect(shouldLandOnSetup('editor', status())).toBe(false);
    expect(shouldLandOnSetup('admin', status({ brandSaved: true }))).toBe(false);
    expect(shouldLandOnSetup('admin', status({ left: true }))).toBe(false);
    expect(shouldLandOnSetup('admin', status({ finished: true }))).toBe(false);
    expect(shouldLandOnSetup('admin', null)).toBe(false);
  });
  it('links Home\'s checklist into the matching step, and keeps the other links', () => {
    expect(setupLinkForHomeStep('brand', '/settings/brand')).toBe('/setup/brand');
    expect(setupLinkForHomeStep('logo', '/settings/brand#logos')).toBe('/setup/logo');
    expect(setupLinkForHomeStep('channels', '/settings/channels')).toBe('/setup/channels');
    expect(setupLinkForHomeStep('ai', '/settings/ai')).toBe('/setup/ai');
    expect(setupLinkForHomeStep('batch', '/create')).toBe('/setup/batch');
    expect(setupLinkForHomeStep('vault', '/vault')).toBe('/vault');
    expect(setupLinkForHomeStep('team', '/settings/team')).toBe('/settings/team');
  });
});

describe('picking up after a reload', () => {
  it('starts with the brand until it is saved, whatever else is done', () => {
    expect(resumeStep(status({ done: { ai: true, logo: true } }))).toBe('brand');
  });
  it('goes to the first step neither done nor skipped', () => {
    expect(resumeStep(status({ brandSaved: true }))).toBe('logo');
    expect(resumeStep(status({ brandSaved: true, skipped: ['logo'] }))).toBe('look');
    expect(resumeStep(status({ brandSaved: true, done: { logo: true, look: true }, skipped: ['channels'] }))).toBe('ai');
  });
  it('ends on the first batch when every step is settled', () => {
    expect(resumeStep(status({ brandSaved: true, done: { logo: true, look: true, channels: true, ai: true, batch: true } }))).toBe('batch');
    expect(resumeStep(status({ brandSaved: true, done: { look: true, batch: true }, skipped: ['logo', 'channels', 'ai'] }))).toBe('batch');
  });
  it('walks the steps in order and marks each one for the progress line', () => {
    expect(nextStep('brand')).toBe('logo');
    expect(nextStep('batch')).toBeNull();
    expect(prevStep('brand')).toBeNull();
    expect(prevStep('ai')).toBe('channels');
    expect(stepStates(status({ brandSaved: true, skipped: ['logo'] }), 'look')).toEqual({ brand: 'done', logo: 'skipped', look: 'current', channels: 'todo', ai: 'todo', batch: 'todo' });
  });
  it('keeps the typing of the brand step in the tab, and drops anything malformed', () => {
    const store = memory();
    const d = { ...emptyDraft('Europe/Dublin', 'British English'), name: 'Fernhill', website: 'fernhill.example', colours: ['#112233'] };
    saveDraft(store, d);
    expect(loadDraft(store)).toEqual(d);
    store.setItem(DRAFT_KEY, JSON.stringify({ name: 7, website: 'x', suggested: ['voice', 'evil'], colours: ['red', '#ABCDEF'] }));
    expect(loadDraft(store)).toMatchObject({ name: '', website: 'x', suggested: ['voice'], colours: ['#ABCDEF'] });
    store.setItem(DRAFT_KEY, '{not json');
    expect(loadDraft(store)).toBeNull();
    clearDraft(store);
    expect(loadDraft(store)).toBeNull();
    expect(loadDraft(null)).toBeNull();
  });
  it('keeps the website\'s colours for the logo step', () => {
    const store = memory();
    saveSiteColours(store, ['#0A7B4F', 'nope']);
    expect(loadSiteColours(store)).toEqual(['#0A7B4F']);
  });
});

describe('what the brand step saves', () => {
  const example = {
    name: 'Acme Savings', website: 'acmesavings.example', tagline: 'Save together', descriptor: 'A fictional brand', timezone: 'Europe/London', language: 'British English',
    money: { local: 'Euros only', foreign: '\\$' }, colours: { primary: '#2F6B5A', accent: '#FFB300', dark: '#14213D', light: '#F5F7FB' },
    roles: { grounds: { soft: '#EEEEEE' }, text: {}, accents: {}, surfaces: {}, slabs: {} }, headlineWeight: 600, corners: 'soft', contrastDisplay: null,
    style: { direction: null } as unknown as BrandSettings['style'],
    series: [{ key: 'myth-vs-fact', name: 'Myths vs facts', ground: 'dark', accent: 'colour' }], spellings: [{ wrong: 'acme', right: 'Acme' }],
    voice: 'Warm and plain', visualDirection: 'Green fields', logo: { wordmarkFrom: 0, markGap: 0 },
  } as BrandSettings;
  const typed = { ...emptyDraft('Europe/Dublin', 'British English'), name: ' Fernhill Bakery ', website: 'https://fernhill.example/', tagline: 'Bread every morning' };

  it('on the first save keeps none of the example brand\'s words', () => {
    const s = brandSettingsFor(example, typed, true);
    expect(s).toMatchObject({ name: 'Fernhill Bakery', website: 'fernhill.example', tagline: 'Bread every morning', descriptor: '', voice: '', visualDirection: '', timezone: 'Europe/Dublin', money: null, spellings: [] });
    expect(s.series).toEqual([{ key: 'posts', name: 'Posts', ground: 'light', accent: 'muted' }]);
    expect(s.roles.grounds).toEqual({});
    // the neutral start: colours, type and shapes stay until the logo and look steps change them
    expect(s.colours).toEqual(example.colours);
    expect(s.corners).toBe('soft');
  });
  it('on a later visit changes only the fields of the step', () => {
    const s = brandSettingsFor(example, { ...typed, voice: 'Friendly' }, false);
    expect(s).toMatchObject({ name: 'Fernhill Bakery', voice: 'Friendly', money: example.money, spellings: example.spellings, series: example.series, visualDirection: 'Green fields' });
  });
  it('tidies the website as posts print it', () => {
    expect(cleanWebsite(' HTTPS://www.fernhill.example/// ')).toBe('www.fernhill.example');
  });
  it('detects the language of the posts from the browser', () => {
    expect(languageFor('en-GB')).toBe('British English');
    expect(languageFor('en-US')).toBe('American English');
    expect(languageFor('fr-FR')).toBe('French');
    expect(languageFor('ja')).toBe('British English');
    expect(languageFor(undefined)).toBe('British English');
  });
});

describe('suggestions from the website', () => {
  it('reads only well-formed values and cuts them to the form\'s limits', () => {
    const s = readSuggestion({ tagline: '  Fresh bread  ', descriptor: 'x'.repeat(300), voice: 42, colours: { primary: '#0a7b4f', accent: 'teal', dark: '#111111' } });
    expect(s).toEqual({ tagline: 'Fresh bread', descriptor: 'x'.repeat(200), voice: undefined, colours: ['#0A7B4F', '#111111'] });
    expect(readSuggestion(null)).toEqual({ tagline: undefined, descriptor: undefined, voice: undefined, colours: [] });
    expect(readSuggestion({ colours: ['#ABCDEF', '#abcdef', 'x'] }).colours).toEqual(['#ABCDEF']);
  });
  it('fills empty fields and marks them, and never overwrites what a person typed', () => {
    const d = { ...emptyDraft('UTC', 'British English'), tagline: 'My own line' };
    const { draft, filled } = applySuggestion(d, { tagline: 'AI line', descriptor: 'We bake', voice: 'Warm', colours: ['#0A7B4F'] });
    expect(draft.tagline).toBe('My own line');
    expect(draft.descriptor).toBe('We bake');
    expect(draft.voice).toBe('Warm');
    expect(filled).toEqual(['descriptor', 'voice']);
    expect(draft.suggested).toEqual(['descriptor', 'voice']);
    expect(draft.colours).toEqual(['#0A7B4F']);
  });
  it('replaces an earlier suggestion, but not once the person typed in that field', () => {
    let d = applySuggestion(emptyDraft('UTC', 'British English'), { descriptor: 'First', voice: 'One', colours: [] }).draft;
    d = typeInDraft(d, 'voice', 'One, edited');
    const again = applySuggestion(d, { descriptor: 'Second', voice: 'Two', colours: [] });
    expect(again.draft.descriptor).toBe('Second');
    expect(again.draft.voice).toBe('One, edited');
    expect(again.draft.suggested).toEqual(['descriptor']);
  });
});

describe('the look, the AI and the first batch', () => {
  const shipped = [{ ref: 'shipped:retail' }, { ref: 'shipped:clean' }];
  it('preselects Clean unless a look is in use', () => {
    expect(initialLook(null, shipped)).toBe('shipped:clean');
    expect(initialLook('own:mine', shipped)).toBe('own:mine');
    expect(initialLook(null, [{ ref: 'shipped:retail' }])).toBe('shipped:retail');
    expect(initialLook(null, [])).toBeNull();
  });
  it('sends the provider with the chosen model and its prices', () => {
    expect(providerBody({ kind: 'anthropic', apiKey: ' k-123456789 ', model: 'claude-opus-5-5', input: 4, output: 20 }))
      .toEqual({ name: 'Anthropic', kind: 'anthropic', model: 'claude-opus-5-5', apiKey: 'k-123456789', tasks: ['draft', 'rewrite', 'research'], enabled: true, inputPricePerMTok: 4, outputPricePerMTok: 20 });
    expect(providerBody({ kind: 'openai-compatible', apiKey: 'k-123456789', model: 'm', baseUrl: ' https://api.example.com/v1 ', input: null, output: null }))
      .toMatchObject({ name: 'AI provider', baseUrl: 'https://api.example.com/v1', inputPricePerMTok: null });
  });
  it('reads a custom budget', () => {
    expect(readBudget('40')).toBe(40);
    expect(readBudget('$12.505')).toBe(12.51);
    expect(readBudget('0')).toBeNull();
    expect(readBudget('lots')).toBeNull();
  });
  it('says why the AI draft cannot run yet', () => {
    expect(aiDraftBlocker('provider')).toMatch(/provider/);
    expect(aiDraftBlocker('budget')).toMatch(/budget/);
    expect(aiDraftBlocker(null)).toBeNull();
  });
});

describe('colours read from a logo', () => {
  // Pixels as a canvas gives them: RGBA, four numbers each.
  const px = (list: Array<[number, number, number, number, number]>) => list.flatMap(([r, g, b, a, n]) => Array.from({ length: n }, () => [r, g, b, a]).flat());

  it('finds the main colours, coloured ones first, and ignores transparent pixels', () => {
    const data = px([[255, 255, 255, 255, 50], [10, 123, 79, 255, 30], [240, 128, 40, 255, 15], [0, 0, 0, 0, 500], [9, 9, 9, 255, 5]]);
    const found = dominantColours(data);
    expect(found[0]).toBe('#0A7B4F');
    expect(found[1]).toBe('#F08028');
    expect(found).toContain('#FFFFFF');
    expect(found).toContain('#090909');
  });
  it('drops colours too rare to matter, and gives nothing for an empty picture', () => {
    expect(dominantColours(px([[10, 123, 79, 255, 100], [200, 30, 30, 255, 1]]))).toEqual(['#0A7B4F']);
    expect(dominantColours(px([[0, 0, 0, 0, 20]]))).toEqual([]);
  });
  it('guesses the roles, keeping a role the logo has nothing for', () => {
    const current = { primary: '#2F6B5A', accent: '#FFB300', dark: '#14213D', light: '#F5F7FB' };
    expect(guessRoles(['#0A7B4F', '#F08028', '#FFFFFF', '#090909'], current)).toEqual({ primary: '#0A7B4F', accent: '#F08028', dark: '#090909', light: '#FFFFFF' });
    expect(guessRoles(['#0A7B4F'], current)).toEqual({ ...current, primary: '#0A7B4F' });
  });
});
