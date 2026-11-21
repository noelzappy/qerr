// The layout editor's model (web/src/pages/settings/layout-model.ts) against the engine itself: every starter and every built-in
// layout a brand may copy opens in the editor and comes back deep-equal with nothing it cannot show, and so does every layout the
// catalogue lets one build (each block type, option value, condition form and page colour on each page kind) that the engine's
// validator accepts.
import { describe, expect, it } from 'vitest';
import {
  blockControls, choicesFor, controlKeys, conditionWords, convertPage, defaultScenario, fieldsShown, fromModel, groundIn, holds, newClause, placeAs, readGround,
  readWhen, tidyBlock, toModel, uncovered, withPlace, withSamePlace, withSize, writeGround, writeWhen, specFor,
} from '../web/src/pages/settings/layout-model';
import type { Block, Catalogue, Layout } from '../web/src/pages/settings/layout-types';
import { engineImport } from './server/engine/root.js';

const engine = async () => {
  const layout = await engineImport<{ layoutCatalogue(): Catalogue; validateLayout(l: unknown): string[] }>('design/layout');
  const starters = await engineImport<{ STARTER_LAYOUTS: Layout[]; builtinLayouts(): Array<{ copyable: boolean; layout: { id: string } }>; builtinCopy(id: string): Layout }>('design/layout-starters');
  const copies = starters.builtinLayouts().filter((b) => b.copyable).map((b) => starters.builtinCopy(b.layout.id));
  return { cat: layout.layoutCatalogue(), validate: layout.validateLayout, starters: starters.STARTER_LAYOUTS, copies };
};
const roundTrips = (l: Layout, cat: Catalogue) => {
  expect(uncovered(l, cat), l.id).toEqual([]);
  expect(fromModel(toModel(structuredClone(l)))).toStrictEqual(l);
};

describe('the layout editor model', () => {
  it('opens every starter and every built-in layout a brand may copy, shows all of it and writes it back unchanged', async () => {
    const { cat, validate, starters, copies } = await engine();
    expect(copies.length).toBeGreaterThan(15);
    for (const l of [...starters, ...copies]) {
      expect(validate(l), l.id).toEqual([]);
      roundTrips(l, cat);
      // every key of every block is one of the controls the editor draws for it
      const walk = (b: Block, child: boolean) => {
        const keys = new Set(['type', ...blockControls(b, l, cat, child).flatMap(controlKeys)]);
        for (const k of Object.keys(b)) expect(keys.has(k), `${l.id} ${b.type}.${k}`).toBe(true);
        (b.children ?? []).forEach((c) => walk(c, true));
      };
      l.blocks.forEach((b) => walk(b, false));
    }
  });

  it('shows every layout the catalogue lets one build that the engine accepts: each block, option value, condition and ground', async () => {
    const { cat, validate } = await engine();
    const GRID = { columns: 12, rows: 24, margin: { top: 56, right: 70, bottom: 56, left: 70 }, gutter: 20 };
    let accepted = 0;
    for (const [p, P] of Object.entries(cat.pages)) {
      const base = (): Layout => ({ id: 'model-test', name: 'Model test', ...(p === 'grid' ? {} : { page: p }), fields: { headline: {} }, canvas: { feed: structuredClone(GRID) },
        blocks: [p === 'grid' ? { type: 'headline', slot: { col: 1, row: 1, width: 12, height: 4 } } : { type: 'headline', px: { x: 80, y: 160, w: 920, h: 200 } }] });
      const tryIt = (l: Layout) => { if (validate(l).length) return; accepted++; roundTrips(l, cat); };
      for (const [t, spec] of Object.entries(P.blocks)) {
        const make = (extra: Record<string, unknown> = {}) => {
          const l = base(), b: Block = { type: t };
          if (spec.fullWidth) Object.assign(b, { px: { x: 0, y: 900, w: 1080, h: 450 } }, spec.fullWidth);
          else if (!spec.chrome) Object.assign(b, p === 'grid' ? { slot: { col: 1, row: 10, width: 12, height: 6 } } : { px: { x: 80, y: 600, w: 920, h: 300 } });
          if (t === 'label') b.text = 'Words';
          else if (spec.kinds.length) { b.field = spec.fields.find((f) => !l.fields[f]) ?? spec.fields[0]; l.fields[b.field] = {}; }
          if (spec.children) b.children = spec.children.slice(0, 2).map((c) => ({ type: c, ...(c === 'label' ? { text: 'Tag' } : { field: c === 'sub' ? 'sub' : c === 'headline' ? 'quote' : P.blocks[c].fields[0] }) }));
          for (const c of b.children ?? []) if (c.field) l.fields[c.field] = {};
          Object.assign(b, extra);
          for (const k of ['subField', 'titleField']) if (typeof b[k] === 'string') l.fields[b[k] as string] = {};
          l.blocks.push(b);
          return l;
        };
        tryIt(make());
        for (const [k, o] of Object.entries(spec.options)) {
          const need = Object.fromEntries(Object.entries(o.needs ?? {}).map(([d, v]) => [d, v === true ? 'note' : v]));
          const values = o.type === 'enum' ? [...o.values, ...Object.keys(o.aliases ?? {})] : o.type === 'bool' ? [true, false] : [o.min, o.max];
          for (const v of values) tryIt(make({ ...need, [k]: v }));
        }
        for (const [k, bind] of Object.entries(spec.bindings)) for (const f of bind.fields ?? []) tryIt(make({ ...Object.fromEntries(Object.entries(bind.needs ?? {}).map(([d, v]) => [d, v])), [k]: f }));
        if (spec.bleed && p === 'grid') for (const e of ['left', 'right']) tryIt(make({ bleed: [e] }));
      }
      // conditions on a block and ground cases, in every form the page offers
      const C = P.conditions;
      const forms: Array<Record<string, unknown>> = [{ present: 'sub' }, { absent: 'headline' }, ...C.pages.map((v) => ({ page: v })), { present: 'sub', page: 'single' }];
      for (const [name, ch] of Object.entries(C.choices)) for (const op of ['is', 'not']) { forms.push({ field: name, [op]: ch.values[0] }, { field: name, [op]: ch.values }, { field: name, [op]: [ch.values[0]] }); }
      for (const when of forms) {
        const l = base();
        l.fields.sub = {};
        l.blocks.push(p === 'grid' ? { type: 'sub', slot: { col: 1, row: 10, width: 12, height: 6 }, when } : { type: 'sub', px: { x: 80, y: 600, w: 920, h: 300 }, when });
        if ('field' in when && C.choices[String(when.field)].declared) { l.fields.artefact = {}; l.blocks.push(p === 'grid' ? { type: 'artefact', slot: { col: 1, row: 17, width: 12, height: 6 } } : { type: 'artefact', px: { x: 70, y: 950, w: 900, h: 300 } }); }
        tryIt(l);
        tryIt({ ...l, ground: [{ when, ground: 'dark' }, { ground: 'light' }] });
        tryIt({ ...l, ground: [{ ground: 'dark', when }, { when: { page: 'first' }, ground: 'soft' }, { ground: 'series' }] });
      }
      for (const g of [...P.grounds, ...Object.keys(cat.groundAliases)]) tryIt({ ...base(), ground: g });
    }
    expect(accepted).toBeGreaterThan(250);
  });

  it('reads and writes conditions in every form, and puts them in words', () => {
    for (const w of [{ present: 'sub' }, { absent: 'image', page: 'first' }, { field: 'artefact', is: 'ledger' }, { field: 'artefact', is: ['ledger'] }, { field: 'artefact', not: ['ledger', 'passbook'] }, { field: 'register', is: true }]) {
      const r = readWhen(w);
      expect(r.rest).toEqual([]);
      expect(writeWhen(r.cond)).toStrictEqual(w);
    }
    expect(readWhen({ present: 'sub', colour: 'red' }).rest).toEqual(['when.colour']);
    expect(readWhen({}).rest).toEqual(['when']);
    expect(writeWhen({})).toBeUndefined();
    expect(conditionWords(readWhen({ present: 'sub', page: 'later' }).cond)).toBe('sub is filled and on a later page of a carousel');
    expect(conditionWords(readWhen({ field: 'artefact', not: ['ledger', 'passbook'] }).cond)).toBe('the artefact is not a ledger or passbook');
    expect(conditionWords(readWhen({ field: 'register', is: false }).cond)).toBe('the artefact has no register card');
    expect(conditionWords(readWhen({ field: 'register', not: false }).cond)).toBe('the artefact has a register card');
  });

  it('reads and writes the page colour as one ground or cases', () => {
    for (const g of [undefined, 'series', 'white', [{ when: { present: 'image' }, ground: 'photo' }, { ground: 'cool' }]]) {
      const r = readGround(g);
      expect(r.rest).toEqual([]);
      expect(writeGround(r.model)).toStrictEqual(g);
    }
    expect(readGround([{ ground: 'dark', tint: 1 }]).rest).toEqual(['ground[0].tint']);
  });

  it('lists what it cannot show instead of hiding it', async () => {
    const { cat, starters } = await engine();
    const l = structuredClone(starters[0]) as Layout & Record<string, unknown>;
    l.colour = 'red';
    l.blocks[3].size = 999;
    l.blocks[3].when = { present: 'sub', soon: true };
    (l.blocks[0] as Block).tilt = true;
    // a label with fixed words and a source: the editor shows the words, so the source is listed
    l.blocks[0].text = 'Words';
    l.fields.headline = { ...l.fields.headline, types: ['ledger'] };
    expect(uncovered(l, cat)).toEqual(['colour', 'fields.headline.types', 'blocks[0].tilt', 'blocks[0].source', 'blocks[3].size', 'blocks[3].when.soon']);
  });

  it('changes one part at a time: places, sizes, dependent options, the kind of page', async () => {
    const { cat, validate, starters, copies } = await engine();
    const quote = structuredClone(starters.find((s) => s.id === 'quote')!);
    // a size added copies each block's per-size slot; removed, it drops it
    const wide = withSize(quote, 'story', true, 'feed', cat);
    expect(validate(wide)).toEqual([]);
    expect(Object.keys(wide.blocks[1].slot as object)).toEqual(['feed', 'square', 'story']);
    expect(withSize(wide, 'story', false, 'feed', cat)).toStrictEqual(quote);
    // one place for every size, and back to one per size
    const same = withSamePlace(quote.blocks[1], true, 'feed', ['feed', 'square']);
    expect(same.slot).toEqual({ col: 1, row: 5, width: 12, height: 15 });
    expect(Object.keys(withSamePlace(same, false, 'feed', ['feed', 'square']).slot as object)).toEqual(['feed', 'square']);
    expect(withPlace(quote.blocks[1], 'slot', 'square', { col: 2, row: 4, width: 10, height: 11 }, ['feed', 'square']).slot).toEqual({ feed: { col: 1, row: 5, width: 12, height: 15 }, square: { col: 2, row: 4, width: 10, height: 11 } });
    // cells to pixels and back on a grid page
    const text = structuredClone(starters[0]);
    const asPx = placeAs(text.blocks[3], 'px', text, cat);
    expect(asPx.slot).toBeUndefined();
    expect(validate({ ...text, blocks: text.blocks.map((b, i) => (i === 3 ? asPx : b)) })).toEqual([]);
    expect(placeAs(asPx, 'slot', text, cat).slot).toEqual(text.blocks[3].slot);
    // a phone does not keep a desktop window's tilt
    const spec = specFor(cat, text, 'screen');
    expect(tidyBlock({ type: 'screen', device: 'phone', tilt: true, titleField: 'title' }, spec)).toEqual({ type: 'screen', device: 'phone' });
    // moved to another page: only what that page draws, placed as it places it
    for (const l of [...starters, ...copies]) for (const to of Object.keys(cat.pages)) {
      const { layout } = convertPage(l, to, cat);
      expect(uncovered(layout, cat), `${l.id} to ${to}`).toEqual([]);
      for (const f of Object.keys(layout.fields)) expect(fieldsShown(layout, cat)).toContain(f);
    }
    const poster = convertPage(starters.find((s) => s.id === 'myth-fact')!, 'poster', cat);
    expect(poster.dropped).toEqual(['logo', 'website', 'slab', 'label']);
  });

  it('sketches a layout as if fields were empty, on a carousel page or with a choice', async () => {
    const { cat, copies } = await engine();
    const number = copies.find((c) => c.id === 'number-copy')!;
    const sc = defaultScenario(number);
    expect(groundIn(number, sc, cat)).toBe('photo');
    expect(groundIn(number, { ...sc, empty: ['image'] }, cat)).toBe('cool');
    const l = { ...number, fields: { ...number.fields, sub: {} } };
    expect(holds({ present: 'sub' }, sc, l, cat)).toBe(true);
    expect(holds({ present: 'sub' }, { ...sc, empty: ['sub'] }, l, cat)).toBe(false);
    expect(holds({ page: 'first' }, { ...sc, page: 'first' }, l, cat)).toBe(true);
    expect(holds({ page: 'first' }, sc, l, cat)).toBe(false);
    const text = copies.find((c) => c.id === 'text-ledger-copy')!;
    const t = defaultScenario(text);
    expect(t.choices.artefact).toBe('ledger');
    expect(holds({ field: 'artefact', is: 'ledger' }, t, text, cat)).toBe(true);
    // an empty artefact matches no "is", only a "not"
    expect(holds({ field: 'artefact', is: 'ledger' }, { ...t, empty: ['artefact'] }, text, cat)).toBe(false);
    expect(holds({ field: 'artefact', not: 'ledger' }, { ...t, empty: ['artefact'] }, text, cat)).toBe(true);
    expect(newClause('choice', {}, cat.pages.grid, ['artefact']).choice).toEqual({ field: 'artefact', op: 'is', values: ['ledger'], list: false });
    // a choice that is a field is offered only once the layout declares it (the engine refuses it otherwise)
    expect(choicesFor(cat.pages.grid, ['headline'])).toEqual([]);
    expect(choicesFor(cat.pages.grid, ['headline', 'artefact'])).toEqual(['artefact']);
    expect(choicesFor(cat.pages.editorial, ['headline'])).toEqual(['register']);
    expect(newClause('choice', {}, cat.pages.editorial, ['headline']).choice).toEqual({ field: 'register', op: 'is', values: [true], list: false });
  });
});
