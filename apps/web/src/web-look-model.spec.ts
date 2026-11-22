// The logic of the Looks pages (web/src/pages/settings/looks/look-model.ts), against the engine's real catalogue and the two sample looks.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  addOptions, blankFor, budgetsText, checkValue, collectControls, controlFor, descAt, designFields, designIndex, designStatus, getAt, groupByKind, groupSections, kindsSummary, kindOrder,
  lookForPreview, lookStatus, mapProblems, movedPosition, outline, rangeText, setAt, settingsOf, settingsProblems, valueLabel, writeSetting, labelFor,
} from '../web/src/pages/settings/looks/look-model';
import type { Composition, Desc, Json, LookCatalogue } from '../web/src/pages/settings/looks/look-types';

const engine = await import('@vesk/engine/design/look' as string) as { lookCatalogue(): LookCatalogue; validateLook(l: unknown, w?: string, o?: { shipped?: boolean }): string[]; lookBrief(l: unknown): { kinds: Record<string, { variants: unknown[] }> } };
const cat = engine.lookCatalogue();
const dir = path.join(path.dirname(createRequire(import.meta.url).resolve('@vesk/engine/package.json')), 'testlib', 'looks');
const sample = (n: string): Json & { compositions: Json[] } => JSON.parse(fs.readFileSync(path.join(dir, `${n}.sample.json`), 'utf8'));
const SAMPLES = ['retail', 'swiss'];

describe('paths', () => {
  it('reads and writes by path, immutably, creating what is missing', () => {
    const o = { a: { b: [{ c: 1 }, { c: 2 }] }, x: 1 };
    expect(getAt(o, 'a.b[1].c')).toBe(2);
    expect(getAt(o, 'a.nope.c')).toBeUndefined();
    const n = setAt(o, 'a.b[0].c', 9);
    expect(getAt(n, 'a.b[0].c')).toBe(9);
    expect(getAt(o, 'a.b[0].c')).toBe(1);
    expect(setAt({}, 'p.q[1]', 5)).toEqual({ p: { q: [undefined, 5] } });
    expect(setAt(o, 'x', undefined)).toEqual({ a: o.a });
    expect(getAt(setAt(o, 'a.b[0]', undefined), 'a.b')).toEqual([{ c: 2 }]);
  });
});

describe('descriptors and range checks', () => {
  it('finds the descriptor of any setting, following a font\'s own form', () => {
    expect(descAt(cat.sections, 'canvas.feed.grid.cols')?.max).toBe(24);
    expect(descAt(cat.sections, 'devices.angles.sticker')).toMatchObject({ kind: 'number', min: -15, max: 15 });
    const look = sample('retail');
    expect(descAt(cat.sections, 'fonts.display.weights', look)?.kind).toBe('list');
    expect(descAt(cat.sections, 'devices.highlight.pad[2]')?.kind).toBe('number');
    expect(descAt(cat.sections, 'nope.x')).toBeNull();
  });

  it('refuses what is out of range, never clamping, and says the range', () => {
    const cols = descAt(cat.sections, 'canvas.feed.grid.cols')!;
    expect(rangeText(cols)).toBe('1 to 24');
    expect(checkValue(cols, 12)).toBe('');
    expect(checkValue(cols, 25)).toBe('Use 1 to 24');
    expect(checkValue(cols, 0)).toBe('Use 1 to 24');
    expect(checkValue(cols, 2.5)).toBe('Use a whole number');
    expect(checkValue(cols, Number.NaN)).toBe('Enter a number');
    const tilt = descAt(cat.sections, 'dials.tilt')!;
    expect(checkValue(tilt, 1.5)).toBe('');
    expect(checkValue(tilt, 1.51)).toMatch(/^Use 0 to 1.5/);
    const logic = descAt(cat.sections, 'colour.logic')!;
    expect(checkValue(logic, 'field')).toBe('');
    expect(checkValue(logic, 'red;background:url(x)')).not.toBe('');
    const weights = descAt(cat.sections, 'fonts.display.weights', sample('retail'))!;
    expect(checkValue(weights, [])).toBe('Add at least 1');
    expect(checkValue(weights, [100, 200, 300, 400, 500])).toBe('Keep at most 4');
    expect(checkValue(weights, [400, 400])).toBe('Each can be used once');
    expect(checkValue(weights, [400, 1000])).toMatch(/^Use /);
  });

  it('writes one setting into a look, seeding an object that is not there yet', () => {
    const look = settingsOf(sample('retail'));
    delete (look.devices as Json).shadow;
    const next = writeSetting(look, cat.sections, 'devices.shadow.x', 6);
    expect((next.devices as Json).shadow).toEqual({ x: 6, y: 0, colour: 'ink' });
    expect(getAt(look, 'devices.shadow')).toBeUndefined();
    expect(getAt(writeSetting(look, cat.sections, 'dials.tilt', 0.5), 'dials.tilt')).toBe(0.5);
  });
});

describe('the Settings form', () => {
  it('groups the catalogue sections in plain order, dials first, and keeps a section it does not know', () => {
    const groups = groupSections(cat.sections);
    expect(groups.map((g) => g.title)).toEqual(['Dials', 'Typefaces', 'Type', 'Page', 'Colour', 'Devices', 'Pictures', 'Logo']);
    expect(groups.flatMap((g) => g.sections).sort()).toEqual(Object.keys(cat.sections).sort());
    const more = groupSections({ ...cat.sections, spacing: { kind: 'object', label: 'Spacing', props: {} } });
    expect(more.at(-1)).toMatchObject({ id: 'spacing', title: 'Spacing', sections: ['spacing'] });
  });

  it('names things for someone who is not a designer', () => {
    expect(labelFor('fonts.display', {} as Desc)).toBe('Headlines');
    expect(labelFor('x.y', { kind: 'number', label: 'Gutter' })).toBe('Gutter');
    expect(valueLabel('colour.logic', 'one-accent')).toBe('One accent');
    expect(valueLabel('colour.logic', 'field')).toBe('Colour as a field');
    expect(valueLabel('colour.logic', 'tonal')).toBe('Tonal');
    expect(valueLabel('devices.wordmark.sep', 'dash')).toBe('Dash');
    expect(valueLabel('x.unlisted', 'two-words')).toBe('Two words');
  });

  for (const name of SAMPLES) {
    it(`round-trips the ${name} sample: every setting reads back and writes back unchanged, and nothing is out of range`, () => {
      const look = sample(name);
      expect(engine.validateLook(look, 'look', { shipped: true })).toEqual([]);
      const settings = settingsOf(look);
      expect(settings.compositions).toBeUndefined();
      expect(settingsProblems(cat.sections, settings)).toEqual({});
      let copy: Json = settings;
      for (const p of collectControls(cat.sections, settings)) {
        const d = descAt(cat.sections, p, settings);
        const v = getAt(settings, p);
        if (d && v !== undefined && !['object', 'tagged'].includes(d.kind)) copy = writeSetting(copy, cat.sections, p, JSON.parse(JSON.stringify(v)));
      }
      expect(copy).toEqual(settings);
      // the settings plus the compositions are the look again
      expect({ ...settings, compositions: look.compositions }).toEqual(look);
    });
  }

  it('lists a control for every setting present, including the cells of the top label row', () => {
    const controls = collectControls(cat.sections, sample('swiss'));
    expect(controls).toEqual(expect.arrayContaining(['fonts.display', 'type.display.lead', 'canvas.feed.margin.top', 'devices.angles.sticker', 'dials.density']));
    expect(controls.some((c) => /^devices\.metaRow\.cells\[0\]\.col$/.test(c))).toBe(true);
  });

  it('names what is wrong with the settings as they stand', () => {
    const bad = writeSetting(writeSetting(settingsOf(sample('retail')), cat.sections, 'canvas.feed.grid.cols', 40), cat.sections, 'dials.tilt', 3);
    expect(settingsProblems(cat.sections, bad)).toEqual({ 'canvas.feed.grid.cols': 'Use 1 to 24', 'dials.tilt': 'Use 0 to 1.5' });
    expect(Object.keys(settingsProblems(cat.sections, { ...settingsOf(sample('retail')), fonts: { display: { source: 'nowhere' } } }))).toContain('fonts.display');
  });

  it('makes a blank entry for a list of objects from its required properties', () => {
    const cell = descAt(cat.sections, 'devices.metaRow.cells')!.of!;
    const blank = blankFor(cell) as Json;
    expect(Object.keys(blank).sort()).toEqual(['align', 'col', 'source', 'span']);
    expect(checkValue(cell.props!.col!, blank.col)).toBe('');
  });
});

describe('server problems and controls', () => {
  const controls = new Set(['dials.tilt', 'fonts.display', 'devices.angles.sticker', 'type']);
  it('maps a problem to the nearest control that shows it', () => {
    expect(controlFor('dials.tilt', controls)).toBe('dials.tilt');
    expect(controlFor('fonts.display.weights[1]', controls)).toBe('fonts.display');
    expect(controlFor('type.nope.deeper', controls)).toBe('type');
    expect(controlFor('compositions[0].elements', controls)).toBeNull();
  });
  it('keeps the first message per control and returns the rest for the form', () => {
    const r = mapProblems([
      { path: 'dials.tilt', message: 'look "x": dials.tilt must be 0 to 1.5' }, { path: 'dials.tilt', message: 'second' },
      { path: 'fonts.display.weights[0]', message: 'not in the font' }, { path: 'definition', message: 'too big' },
    ], controls);
    expect(r.byControl).toEqual({ 'dials.tilt': 'look "x": dials.tilt must be 0 to 1.5', 'fonts.display': 'not in the font' });
    expect(r.other).toEqual(['too big']);
  });
});

describe('status and designs in plain words', () => {
  const comps = (): Composition[] => {
    const l = sample('retail');
    const per: Record<string, number> = {};
    return l.compositions.map((c, i) => ({ id: `id${i}`, kind: String(c.kind), position: (per[String(c.kind)] = (per[String(c.kind)] ?? -1) + 1), name: String(c.name), definition: c, draft: null, hasDraft: false, enabled: true, gate: null }));
  };

  it('derives the status of a look and of a design', () => {
    expect(lookStatus({ status: 'draft', needsAttention: false })).toBe('draft');
    expect(lookStatus({ status: 'ready', needsAttention: false })).toBe('ready');
    expect(lookStatus({ status: 'ready', needsAttention: true })).toBe('attention');
    expect(designStatus({ gate: null, hasDraft: false })).toBe('published');
    expect(designStatus({ gate: null, hasDraft: true })).toBe('draft-pending');
    expect(designStatus({ gate: { passed: false, checks: [] }, hasDraft: true })).toBe('check-failed');
    expect(designStatus({ gate: { passed: true, checks: [] }, hasDraft: false })).toBe('published');
  });

  it('counts kinds and designs, groups by kind in the catalogue order and moves one place', () => {
    expect(kindsSummary({ statement: 2, photo: 1, list: 0 })).toBe('2 kinds · 3 designs');
    expect(kindsSummary({ quote: 1 })).toBe('1 kind · 1 design');
    const all = comps();
    const groups = groupByKind(all, kindOrder(cat));
    expect(groups.map((g) => g.kind)).toEqual(['statement', 'list', 'photo']);
    const statements = groups[0]!.designs;
    expect(movedPosition(statements, statements[0]!.id, -1)).toBeNull();
    expect(movedPosition(statements, statements[0]!.id, 1)).toBe(1);
    expect(movedPosition(statements, statements[1]!.id, 1)).toBeNull();
    expect(designIndex(all, statements[1]!)).toBe(1);
  });

  it('summarises the fields and budgets, and the elements as an outline in plain words', () => {
    const photo = sample('retail').compositions.find((c) => c.kind === 'photo')!;
    expect(budgetsText(photo, cat)).toBe('Picture · Headline up to 68 · Sub line up to 120 · Tag or price up to 16');
    expect(designFields(photo, cat).filter((f) => f.required).map((f) => f.name)).toEqual(['image', 'headline']);
    const list = sample('retail').compositions.find((c) => c.kind === 'list')!;
    expect(budgetsText(list, cat)).toMatch(/List points 2 to 5/);
    const lines = outline(photo, cat);
    expect(lines.map((l) => l.depth)).toEqual([0, 0, 0, 1, 1, 0].slice(0, lines.length));
    expect(lines[0]).toMatchObject({ type: 'photo', label: cat.elements.photo!.label });
    expect(lines.find((l) => l.type === 'text')!.text).toContain('shows the headline');
    expect(lines.find((l) => l.type === 'sticker')!.text).toContain('turned by the sticker angle');
    expect(lines.find((l) => l.type === 'sticker')!.text).toContain('only when tag is given');
  });

  it('offers the designs of every look for a kind, numbered the way the server numbers them', () => {
    const o = addOptions('statement', [
      { ref: 'shipped:retail', name: 'Retail', designs: sample('retail').compositions.map((c) => ({ kind: String(c.kind), name: String(c.name) })) },
      { ref: 'own:mine', name: 'Mine', designs: [{ kind: 'photo', name: 'P' }] },
    ]);
    expect(o.map((x) => [x.source, x.index, x.name])).toEqual([['shipped:retail', 0, 'Stack'], ['shipped:retail', 1, 'Mantra']]);
  });

  it('builds the look a preview draws from the settings in hand and the enabled designs, in order', () => {
    const all = comps();
    all[1] = { ...all[1]!, enabled: false };
    const look = lookForPreview(settingsOf(sample('retail')), all, kindOrder(cat));
    expect((look.compositions as Json[]).map((c) => c.name)).toEqual(['Mantra', 'Blocks', 'Frame pop']);
    expect(engine.validateLook(look, 'look', { shipped: true })).toEqual([]);
  });
});
