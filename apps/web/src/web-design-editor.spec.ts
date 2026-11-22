// The design editor's model (web/src/pages/settings/looks/design-model.ts and design-health.ts), against the engine's real catalogue and
// the looks it ships as data (retail, swiss, soft, bloom, clean, loud and ledger): every composition of each is loaded, edited and checked against the engine's validator.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as M from '../web/src/pages/settings/looks/design-model';
import { designHealth, mergeServer } from '../web/src/pages/settings/looks/design-health';
import type { Json, LookCatalogue } from '../web/src/pages/settings/looks/look-types';

type Engine = { lookCatalogue(): LookCatalogue; validateLook(l: unknown, w?: string, o?: { shipped?: boolean }): string[] };
const engine = await import('@vesk/engine/design/look' as string) as Engine;
const statics = await import('@vesk/engine/design/look-static' as string) as { gridOf(l: unknown): unknown; placeRect(p: unknown, base: unknown, look: unknown, g: unknown, mh?: number): { x0: number; y0: number; x1: number; y1: number } };
const cat = engine.lookCatalogue();
const dir = path.join(path.dirname(createRequire(import.meta.url).resolve('@vesk/engine/package.json')), 'lib', 'design', 'looks');
const load = (n: string): Json & { compositions: Json[] } => JSON.parse(fs.readFileSync(path.join(dir, `${n}.look.json`), 'utf8'));
const LOOKS = { retail: load('retail'), swiss: load('swiss'), soft: load('soft'), bloom: load('bloom'), clean: load('clean'), loud: load('loud'), ledger: load('ledger') };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const settings = (l: Json): Json => { const { compositions: _c, ...rest } = l; return rest; };
const all = Object.entries(LOOKS).flatMap(([name, look]) => look.compositions.map((comp, i) => ({ name, look, comp, i, id: `${name}/${comp.kind}/${comp.name}`, s: settings(look) })));
// The engine's verdict on a look with one composition swapped (shipped looks are "copy:" ones once they are the brand's).
const verdict = (look: Json, i: number, comp: Json): string[] => {
  const l = clone(look) as Json & { compositions: Json[] };
  l.origin = `copy:shipped:${String(look.id)}`;
  l.compositions[i] = comp;
  return engine.validateLook(l, 'look');
};
const sample = (desc: Json, cat0: LookCatalogue): unknown => {
  switch (desc.kind) {
    case 'number': return desc.int ? Math.ceil(desc.min as number) : desc.min;
    case 'enum': return (desc.values as unknown[])[0];
    case 'bool': return true;
    case 'role': return (cat0.lists.roles as string[])[0];
    case 'length': return desc.min ?? 10;
    case 'angle': return 3;
    default: return undefined;
  }
};

// The sentences the engine gives a shipped composition as written. The engine's own data and its catalogue are being brought in line (the
// retail text nudges are written past the catalogue's range today), so every edit below is judged against this baseline: it must add nothing.
const baseline = new Map(all.map((a) => [a.id, verdict(a.look, a.i, a.comp)] as const));
const added = (a: (typeof all)[number], comp: Json): string[] => verdict(a.look, a.i, comp).filter((p) => !baseline.get(a.id)!.includes(p));
describe('the shipped looks are valid as written (the baseline for every edit below)', () => {
  it.each(all.map((a) => [a.id, a] as const))('%s', (_id, a) => {
    expect(baseline.get(a.id)!.filter((p) => !/\.nudge[XY] must be/.test(p))).toEqual([]);
  });
});

describe('the tree', () => {
  it.each(all.map((a) => [a.id, a] as const))('%s: every row can be found again by its path', (_id, a) => {
    const rows = M.listTree(a.comp, cat);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const loc = M.locate(a.comp, r.path);
      expect(loc?.el).toBe(r.el);
      expect(M.parentOfPath(r.path)).toBe(r.parentPath);
    }
    expect(rows.map((r) => r.path)).toEqual([...new Set(rows.map((r) => r.path))]);
  });
  it('numbers children under their box and a seam\'s sticker after its children', () => {
    const comp = { kind: 'photo', elements: [{ type: 'photo' }, { type: 'box', children: [{ type: 'text', field: 'headline' }, { type: 'text', field: 'sub' }] }, { type: 'seam', children: [{ type: 'text', field: 'sub' }], sticker: { type: 'sticker', children: [{ type: 'text', source: 'brand' }] } }] };
    expect(M.listTree(comp, cat).map((r) => r.path)).toEqual(['0', '1', '1.0', '1.1', '2', '2.0', '2.1', '2.1.0']);
    expect(M.locate(comp, '2.1')?.slot).toBe(true);
    expect(M.locate(comp, '2.2')).toBeNull();
    expect(M.locate(comp, '5')).toBeNull();
    expect(M.locate(comp, 'x')).toBeNull();
  });
  it('names elements in plain words', () => {
    expect(M.elementName({ type: 'text', field: 'sub' }, cat)).toBe('Sub line');
    expect(M.elementName({ type: 'text', source: 'brand' }, cat)).toBe('Brand name');
    expect(M.elementName({ type: 'photo' }, cat)).toBe('Picture');
    expect(M.elementName({ type: 'fitted-stack', field: 'headline' }, cat)).toBe('Headline');
    expect(M.elementName({ type: 'sticker', field: 'tag' }, cat)).toBe('Sticker: Tag or price');
    expect(M.elementName({ type: 'block' }, cat)).toBe('Colour block');
  });
  it('summarises an element in a sentence', () => {
    const look = { devices: { angles: { block: -2 } }, dials: { tilt: 1 }, type: { body: { size: 34 } } };
    const s = M.summary({ type: 'text', field: 'headline', style: 'display', ladder: { by: 'headline', steps: [[30, 104]] }, rot: 'block', fill: 'paper' }, cat, look);
    expect(s).toBe('Headline, large, on a paper shape, tilted −2°');
    expect(M.summary({ type: 'text', field: 'sub', when: { present: 'sub' } }, cat, look)).toBe('Sub line, small, only when Sub line is filled in');
  });
});

describe('no-op edits leave the JSON exactly as it was', () => {
  it.each(all.map((a) => [a.id, a] as const))('%s', (_id, a) => {
    const before = JSON.stringify(a.comp);
    let comp = a.comp;
    for (const r of M.listTree(comp, cat)) {
      for (const [name, v] of Object.entries(r.el)) {
        if (name === 'type' || name === 'children' || name === 'sticker' || name === 'place') continue;
        const d = M.descOf(String(r.el.type), name, cat);
        if (!d || M.checkProp(d, v, cat)) continue; // a value the catalogue itself refuses is not one to write back
        const e = M.setProp(comp, r.path, name, clone(v), cat, a.s);
        expect(e.error, `${r.path}.${name}`).toBeUndefined();
        expect(e.comp).toBe(comp);
      }
      expect(M.setWhen(comp, r.path, M.readWhen(r.el), cat).comp).toBe(comp);
      if (r.el.rot === undefined) expect(M.setRotation(comp, r.path, undefined, a.s, cat).comp).toBe(comp);
    }
    for (const f of M.declaredFields(comp)) expect(M.setBudget(comp, f, {}, cat).comp).toBe(comp);
    expect(M.setAccepts(comp, M.acceptsOf(comp), cat).comp).toBe(comp);
    expect(JSON.stringify(comp)).toBe(before);
    comp = a.comp;
  });
  it('a rectangle that did not change keeps the very same place', () => {
    for (const a of all) for (const r of M.listTree(a.comp, cat)) {
      const rect = M.staticRect(a.comp, r.path, a.s);
      if (!rect || !r.placed) continue;
      expect(M.rectToPlace(r.el, rect, a.s, { current: rect })).toBe(r.el.place);
      const e = M.applyRect(a.comp, r.path, rect, a.s, cat, rect);
      if (M.placeForm(r.el) !== 'inset') expect(e.comp).toBe(a.comp);
    }
  });
});

describe('properties of every element', () => {
  it('reads and writes every property the catalogue lists for every type', () => {
    for (const type of Object.keys(cat.elements)) {
      let comp: Json = { kind: 'photo', elements: [{ type, ...(type === 'text' ? { field: 'headline' } : {}) }] };
      const info = cat.elements[type]!;
      for (const [name, desc] of Object.entries(info.properties)) {
        if (['place', 'when', 'children', 'rot'].includes(name) || desc.kind === 'place' || desc.kind === 'when' || desc.kind === 'children') continue;
        const v = sample(desc as Json, cat);
        if (v === undefined) continue;
        const e = M.setProp(comp, '0', name, v, cat);
        expect(e.error, `${type}.${name}`).toBeUndefined();
        expect(M.getProp(M.elementAt(e.comp, '0')!, name), `${type}.${name}`).toEqual(v);
        comp = e.comp;
        // removing it again leaves nothing behind (unless the type needs it)
        const gone = M.setProp(comp, '0', name, undefined, cat);
        if (!(info.required ?? []).includes(name)) expect(M.getProp(M.elementAt(gone.comp, '0')!, name)).toBeUndefined();
      }
    }
  });
  it('refuses a value out of range instead of clamping it', () => {
    const comp = { kind: 'statement', elements: [{ type: 'text', field: 'sub', style: 'body' }, { type: 'block', place: { px: { x: 0, y: 0 } } }] };
    for (const [path0, name, bad] of [['0', 'z', 12], ['0', 'z', 1.5], ['0', 'skew', 99], ['0', 'upper', 'yes'], ['0', 'shrinkFloor', 0.2], ['1', 'colour', 'fuchsia'], ['0', 'ink', '#ff0000'], ['0', 'field', 'nope'], ['0', 'weight', 'x']] as const) {
      const e = M.setProp(comp, path0, name, bad, cat);
      expect(e.error, `${name}=${bad}`).toBeTruthy();
      expect(e.comp).toBe(comp);
    }
    expect(M.setProp(comp, '0', 'z', '3', cat).comp).not.toBe(comp);
    expect(M.setProp(comp, '0', 'nothing', 1, cat).error).toMatch(/no setting/);
    expect(M.setProp(comp, '9', 'z', 1, cat).error).toMatch(/not there/);
  });
  it('coerces typed text to the descriptor\'s kind', () => {
    expect(M.coerceProp(cat.elements.text!.properties.size!, '120', cat)).toEqual({ value: 120 });
    expect(M.coerceProp(cat.elements.text!.properties.size!, '', cat)).toHaveProperty('error');
    expect(M.coerceProp(cat.elements.text!.properties.size!, '13', cat)).toHaveProperty('error');
    expect(M.coerceProp(cat.elements.box!.properties.w!, 'gutter', cat)).toEqual({ value: 'gutter' });
    expect(M.coerceProp(cat.elements.box!.properties.w!, '40', cat)).toEqual({ value: 40 });
    expect(M.coerceProp(cat.elements.box!.properties.w!, 'wide', cat)).toHaveProperty('error');
    expect(M.coerceProp(cat.elements.box!.properties.rot!, '-16', cat)).toHaveProperty('error');
    expect(M.coerceProp(cat.elements.box!.properties.rot!, 'block', cat)).toEqual({ value: 'block' });
    expect(M.coerceProp(cat.elements.box!.properties.z!, '3', cat)).toEqual({ value: 3 });
  });
});

describe('geometry', () => {
  it('resolves a place to the same rectangle the engine does', () => {
    let seen = 0;
    for (const a of all) {
      const g = statics.gridOf(a.s);
      for (const r of M.listTree(a.comp, cat)) {
        if (r.depth !== 1 || !r.placed) continue;
        const ours = M.sketchRect(a.comp, r.path, a.s);
        if (!ours || ours.approx) continue;
        // the engine gives an element that sits at the top or foot of its rows the height of its words; the editor shows the whole cell
        if ((r.el.place as Json).grid && ((r.el.place as Json).grid as Json).alignY) continue;
        const eng = statics.placeRect(r.el.place, { x0: 0, y0: 0, x1: 1080, y1: 1350 }, a.s, g, 0);
        expect(ours.rect.x, a.id + r.path).toBeCloseTo(eng.x0, 3);
        expect(ours.rect.y, a.id + r.path).toBeCloseTo(eng.y0, 3);
        expect(ours.rect.x + ours.rect.w, a.id + r.path).toBeCloseTo(eng.x1, 3);
        expect(ours.rect.y + ours.rect.h, a.id + r.path).toBeCloseTo(eng.y1, 3);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
  it('gives no static rectangle for a flow child or an element whose height is only known when drawn', () => {
    const swiss = LOOKS.swiss;
    const comp = swiss.compositions[0]!;
    const flow = { kind: 'statement', elements: [{ type: 'box', place: { grid: { col: 1, span: 4, row: 2, rowSpan: 2 } }, children: [{ type: 'text', field: 'headline', style: 'display', size: 90 }] }, { type: 'text', field: 'sub', place: { anchor: { left: 'margin', bottom: 40, w: 400 } } }] };
    expect(M.staticRect(flow, '0', settings(swiss))).not.toBeNull();
    expect(M.staticRect(flow, '0.0', settings(swiss))).toBeNull();
    expect(M.sketchRect(flow, '0.0', settings(swiss))).toBeNull();
    expect(M.staticRect(flow, '1', settings(swiss))).toBeNull();
    const guess = M.sketchRect(flow, '1', settings(swiss));
    expect(guess?.approx).toBe(true);
    expect(guess!.rect.y + guess!.rect.h).toBeCloseTo(1350 - 40, 3);
    expect(M.staticRect(comp, '0', settings(swiss))).not.toBeNull();
  });
  it('snaps a dragged rectangle to the grid and keeps the form of the place', () => {
    const look = settings(LOOKS.swiss);
    const comp = { kind: 'photo', elements: [{ type: 'photo', place: { grid: { col: 5, span: 8, row: 2, rowSpan: 5 } } }] };
    const rect = M.staticRect(comp, '0', look)!;
    const g = M.gridOf(look)!;
    const moved = M.dragRect(rect, 'move', -(g.colW + g.gutter) * 4 - 7, 3, null);
    const e = M.applyRect(comp, '0', moved, look, cat);
    expect((M.elementAt(e.comp, '0')!.place as Json).grid).toEqual({ col: 1, span: 8, row: 2, rowSpan: 5 });
    const wider = M.applyRect(comp, '0', M.dragRect(rect, 'w', -(g.colW + g.gutter) * 2, 0, null), look, cat);
    expect((M.elementAt(wider.comp, '0')!.place as Json).grid).toEqual({ col: 3, span: 10, row: 2, rowSpan: 5 });
    // rect -> place -> rect is stable
    const again = M.staticRect(e.comp, '0', look)!;
    const back = M.rectToPlace(M.elementAt(e.comp, '0')!, again, look);
    expect(M.staticRect({ kind: 'photo', elements: [{ type: 'photo', place: back }] }, '0', look)).toEqual(again);
    // pixels stay pixels, snapped to 4
    const px = { kind: 'photo', elements: [{ type: 'photo', place: { px: { x: 100, y: 200, w: 300, h: 400 } } }] };
    const pr = M.applyRect(px, '0', M.dragRect({ x: 100, y: 200, w: 300, h: 400 }, 'move', 13, 9), look, cat);
    expect((M.elementAt(pr.comp, '0')!.place as Json).px).toEqual({ x: 112, y: 208, w: 300, h: 400 });
    // an anchor keeps the sides it has
    const an = { kind: 'photo', elements: [{ type: 'photo', place: { anchor: { left: 'margin', right: 'margin', bottom: 34, h: 300 } } }] };
    const r0 = M.staticRect(an, '0', look)!;
    const ar = M.applyRect(an, '0', M.dragRect(r0, 'move', 0, -40), look, cat);
    expect((M.elementAt(ar.comp, '0')!.place as Json).anchor).toEqual({ left: 'margin', right: 'margin', bottom: 74, h: 300 });
    // an element that fills the page becomes a grid place when dragged
    const inset = M.applyRect({ kind: 'photo', elements: [{ type: 'photo', place: { inset: 'frame' } }] }, '0', { x: 100, y: 200, w: 500, h: 500 }, look, cat);
    expect(M.placeForm(M.elementAt(inset.comp, '0')!)).toBe('grid');
  });
  it('moving one element changes no other element', () => {
    for (const a of all) {
      const rows = M.listTree(a.comp, cat).filter((r) => r.placed);
      for (const r of rows) {
        for (const e of [M.moveByCells(a.comp, r.path, 1, 0, a.s, cat), M.moveByCells(a.comp, r.path, 0, 1, a.s, cat), M.resizeByCells(a.comp, r.path, 1, 0, a.s, cat), M.resizeByCells(a.comp, r.path, -1, -1, a.s, cat)]) {
          if (e.comp === a.comp) continue;
          const before = JSON.parse(JSON.stringify(a.comp)), after = JSON.parse(JSON.stringify(e.comp));
          const loc = (c: Json) => M.locate(c, r.path)!;
          delete loc(before).el.place;
          delete loc(after).el.place;
          expect(after, `${a.id} ${r.path}`).toEqual(before);
        }
      }
    }
  });
  it('moves a grid element by a cell and stops at the edges; free placement moves by 4 px', () => {
    const look = settings(LOOKS.swiss);
    const comp = { kind: 'photo', elements: [{ type: 'photo', place: { grid: { col: 1, span: 12, row: 1, rowSpan: 2 } } }, { type: 'block', place: { px: { x: 40, y: 40, w: 100, h: 100 } } }] };
    expect(M.moveByCells(comp, '0', -1, -1, look, cat).comp).toBe(comp);
    expect(M.moveByCells(comp, '0', 1, 0, look, cat).comp).toBe(comp);
    expect(((M.elementAt(M.moveByCells(comp, '0', 0, 1, look, cat).comp, '0')!.place as Json).grid as Json).row).toBe(2);
    expect(((M.elementAt(M.moveByCells(comp, '1', 1, -1, look, cat).comp, '1')!.place as Json).px as Json)).toEqual({ x: 44, y: 36, w: 100, h: 100 });
    expect(M.resizeByCells(comp, '1', 0, 1, look, cat).comp).not.toBe(comp);
  });
  it('reads a place aloud', () => {
    expect(M.placeReadout({ place: { grid: { col: 5, span: 8, row: 2, rowSpan: 5 } } })).toBe('Columns 5–12 · rows 2–6');
    expect(M.placeReadout({ place: { grid: { col: 3, span: 1 } } })).toBe('Column 3');
    expect(M.placeReadout({ place: { px: { x: 4, y: 8, w: 10, h: 20 } } })).toBe('Left 4, top 8 · 10 × 20 px');
    expect(M.placeReadout({})).toBe('Positioned by its box');
  });
  it('converts between place forms and refuses what an element cannot take', () => {
    const look = settings(LOOKS.swiss);
    const comp = { kind: 'photo', elements: [{ type: 'photo', place: { grid: { col: 5, span: 8, row: 2, rowSpan: 5 } } }, { type: 'meta-row' }, { type: 'box', place: { inset: 'margins' }, children: [{ type: 'text', field: 'headline', style: 'display', size: 90 }] }] };
    const px = M.setPlaceForm(comp, '0', 'px', look, cat);
    expect(M.placeForm(M.elementAt(px.comp, '0')!)).toBe('px');
    const was = M.staticRect(comp, '0', look)!, now = M.staticRect(px.comp, '0', look)!;
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(now[k] - was[k])).toBeLessThanOrEqual(0.5);
    const back = M.setPlaceForm(px.comp, '0', 'grid', look, cat);
    expect((M.elementAt(back.comp, '0')!.place as Json).grid).toEqual({ col: 5, span: 8, row: 2, rowSpan: 5 });
    expect(M.setPlaceForm(comp, '1', 'px', look, cat).error).toMatch(/own geometry/);
    expect(M.setPlaceForm(comp, '0', 'flow', look, cat).error).toMatch(/inside a box/);
    const flow = M.setPlaceForm({ kind: 'photo', elements: [{ type: 'box', place: { inset: 'margins' }, children: [{ type: 'text', field: 'sub', place: { px: { x: 0, y: 0 } }, z: 1 }] }] }, '0.0', 'flow', look, cat);
    expect(M.elementAt(flow.comp, '0.0')).toEqual({ type: 'text', field: 'sub' });
  });
});

describe('turning', () => {
  const look = { devices: { angles: { sticker: 6, bar: -3, block: -2, band: 0, card: 1, price: 3 } }, dials: { tilt: 1 } };
  it('turns by a named angle or a number within bounds and straightens again', () => {
    const comp = { kind: 'photo', elements: [{ type: 'block', place: { px: { x: 0, y: 0, w: 10, h: 10 } } }] };
    const t = M.setRotation(comp, '0', 'bar', look, cat);
    expect(M.elementAt(t.comp, '0')!.rot).toBe('bar');
    expect(M.elementAt(M.setRotation(t.comp, '0', 7.5, look, cat).comp, '0')!.rot).toBe(7.5);
    expect(M.elementAt(M.setRotation(t.comp, '0', undefined, look, cat).comp, '0')!.rot).toBeUndefined();
    expect(M.setRotation(comp, '0', 16, look, cat).error).toMatch(/-15 to 15/);
    expect(M.setRotation(comp, '0', 'sideways', look, cat).error).toBeTruthy();
    expect(M.setRotation(comp, '0', 'sticker', look, cat).comp).not.toBe(comp);
    expect(M.setProp(comp, '0', 'rot', 4, cat, look).comp).not.toBe(comp);
  });
  it('allows at most three turned pieces and text only gently outside a sticker', () => {
    const turned = (n: number) => ({ kind: 'photo', elements: [...Array.from({ length: n }, () => ({ type: 'block', rot: 'bar', place: { px: { x: 0, y: 0, w: 10, h: 10 } } })), { type: 'block', place: { px: { x: 0, y: 0, w: 10, h: 10 } } }, { type: 'text', field: 'sub', place: { px: { x: 0, y: 0, w: 100, h: 50 } } }] });
    expect(M.rotatedCount(turned(3), look)).toBe(3);
    expect(M.setRotation(turned(3), '3', 'block', look, cat).error).toMatch(/at most 3/);
    expect(M.setRotation(turned(2), '2', 'block', look, cat).error).toBeUndefined();
    expect(M.setRotation(turned(0), '1', 9, look, cat).error).toMatch(/at most 8 degrees/);
    expect(M.setRotation(turned(0), '1', 5, look, cat).error).toBeUndefined();
    expect(M.setRotation(turned(0), '1', 'sticker', look, cat).error).toBeUndefined();
    expect(M.setRotation(turned(0), '1', 'sticker', { ...look, dials: { tilt: 1.5 } }, cat).error).toMatch(/at most 8 degrees/);
  });
  it('snaps a free angle to a named one when close', () => {
    expect(M.nearestAngle(-2.4, look, cat)?.name).toBe('block');
    expect(M.nearestAngle(9.5, look, cat)).toBeNull();
    expect(M.nearestAngle(5.5, look, cat)?.name).toBe('sticker');
    expect(M.namedAngles(look, cat).map((a) => a.name)).toEqual(['sticker', 'bar', 'block', 'band', 'card', 'price']);
  });
  it('names the turn choices by how far they turn, not by the angle names', () => {
    const named = M.namedAngles(look, cat).filter((a) => a.deg !== 0);
    expect(M.turnOptions(named, look).map((o) => [o.value, o.label])).toEqual([
      ['card', '1° right'], ['block', '2° left'], ['bar', '3° left'], ['price', '3° right'], ['sticker', '6° right'],
    ]);
    expect(M.turnOptions(named, look).find((o) => o.value === 'price')?.title).toBe('Price angle: 3° right');
    // The tilt dial is applied, and two angles that turn alike keep their names apart.
    const tilted = { ...look, dials: { tilt: 0.5 } };
    expect(M.turnOptions(named, tilted).find((o) => o.value === 'sticker')?.label).toBe('3° right');
    const same = { devices: { angles: { sticker: 3, price: 3 } }, dials: { tilt: 1 } };
    expect(M.turnOptions(M.namedAngles(same, cat).filter((a) => a.deg !== 0), same).map((o) => o.label)).toEqual(['3° right (sticker)', '3° right (price)']);
  });
});

describe('structure', () => {
  it.each(all.map((a) => [a.id, a] as const))('%s: remove then undo, reorder there and back', (_id, a) => {
    for (const r of M.listTree(a.comp, cat)) {
      const rm = M.removeElement(a.comp, r.path);
      if (rm.error) continue;
      expect(M.listTree(rm.comp, null).length).toBeLessThan(M.listTree(a.comp, null).length);
      expect(M.restoreElement(rm.comp, rm.undo!).comp).toEqual(a.comp);
      if (!r.slot) {
        const up = M.reorderElement(a.comp, r.path, 1);
        if (up.comp !== a.comp) expect(M.reorderElement(up.comp, up.path!, -1).comp).toEqual(a.comp);
      }
    }
  });
  it('refuses to remove the last element', () => {
    expect(M.removeElement({ kind: 'photo', elements: [{ type: 'photo' }] }, '0').error).toMatch(/at least one/);
  });
  it('adds an element of every type that the engine accepts, bound and placed', () => {
    for (const a of all) {
      for (const type of Object.keys(cat.elements)) {
        const e = M.addElement(a.comp, type, a.s, cat);
        if (e.error) { expect(M.whyNotAdd(a.comp, type, cat, '', a.s), `${a.id} ${type}`).toBe(e.error); continue; }
        const i = M.parsePathEl(e.path!)[0]!;
        // the whole-design rules (type levels, scale) are shown live by Design health; here: nothing wrong with the element itself
        // (a brand graphic is added without a graphic chosen: the pane asks for one next, and until then the design says it needs one)
        const problems = added(a, e.comp).filter((p) => p.includes(`elements[${i}]`) && !/lies over a picture/.test(p) && !(type === 'graphic' && /a graphic needs ref$/.test(p)));
        expect(problems, `${a.id} + ${type}`).toEqual([]);
        expect(M.listTree(e.comp, null).length).toBe(M.listTree(a.comp, null).length + (M.elementAt(e.comp, e.path!)!.children ? 2 : 1));
        const el = M.elementAt(e.comp, e.path!)!;
        for (const b of M.bindingsOf(el, a.s)) expect(M.declaredFields(e.comp)).toContain(b.field);
      }
    }
  });
  it('puts a new element at a free spot of the grid', () => {
    const look = settings(LOOKS.swiss);
    const comp = { kind: 'statement', fields: { headline: { required: true, max: 70 } }, elements: [{ type: 'block', place: { grid: { col: 1, span: 6, row: 2, rowSpan: 1 } } }] };
    const e = M.addElement(comp, 'block', look, cat);
    const g = (M.elementAt(e.comp, e.path!)!.place as Json).grid as Json;
    expect(g.row === 2 && (g.col as number) < 7).toBe(false);
    // a look whose grid has no rows places by pixels
    const retail = settings(LOOKS.retail);
    expect(M.placeForm(M.elementAt(M.addElement(comp, 'block', retail, cat).comp, '1')!)).toBe('px');
  });
  it('respects the limits and says why', () => {
    const look = settings(LOOKS.swiss);
    let comp: Json = { kind: 'statement', fields: { headline: { required: true, max: 70 } }, elements: [{ type: 'block', place: { px: { x: 0, y: 0, w: 10, h: 10 } } }] };
    for (let i = 0; i < 39; i++) comp = M.addElement(comp, 'block', look, cat).comp;
    expect(M.countNodes(comp)).toBe(40);
    const over = M.addElement(comp, 'block', look, cat);
    expect(over.error).toMatch(/at most 40 elements/);
    expect(over.comp).toBe(comp);
    const one: Json = { kind: 'list', fields: { headline: { required: true }, items: { required: true } }, elements: [{ type: 'rows', each: 'items' }] };
    expect(M.addElement(one, 'rows', look, cat).error).toMatch(/at most one/);
    expect(M.addElement({ kind: 'statement', elements: [{ type: 'block' }] }, 'photo', look, cat).error).toMatch(/no picture/);
    // depth: four levels deep is the most
    const deep: Json = { kind: 'statement', elements: [{ type: 'box', place: { inset: 'page' }, children: [{ type: 'box', children: [{ type: 'box', children: [{ type: 'box', children: [] }] }] }] }] };
    expect(M.addElement(deep, 'text', look, cat, '0.0.0.0').error).toMatch(/4 levels/);
    expect(M.addElement(deep, 'text', look, cat, '0.0.0').error).toBeUndefined();
    expect(M.addElement(deep, 'block', look, cat, '5').error).toBeTruthy();
    expect(M.addElement(deep, 'seam', look, cat, '0').error).toMatch(/not in a box/);
  });
  it('duplicates an element after itself, at a free spot, and refuses the pieces used once', () => {
    const look = settings(LOOKS.swiss);
    const comp = LOOKS.swiss.compositions[5]!;
    const rows = M.listTree(comp, cat);
    const block = rows.find((r) => r.type === 'block')!;
    const e = M.duplicateElement(comp, block.path, look, cat);
    expect(e.error).toBeUndefined();
    expect(M.elementAt(e.comp, e.path!)!.type).toBe('block');
    expect(e.path).toBe(String(Number(block.path) + 1));
    expect(M.duplicateElement(comp, rows.find((r) => r.type === 'meta-row')!.path, look, cat).error).toMatch(/at most one/);
    const list = LOOKS.swiss.compositions.find((c) => c.kind === 'list')!;
    expect(M.duplicateElement(list, M.listTree(list, cat).find((r) => r.type === 'rows')!.path, look, cat).error).toMatch(/at most one/);
  });
  it('moves an element into a box and out again, keeping the engine content', () => {
    const look = settings(LOOKS.retail);
    const comp = clone(LOOKS.retail.compositions[5]!);
    const rows = M.listTree(comp, cat);
    const box = rows.find((r) => r.type === 'box')!;
    const text = rows.find((r) => r.type === 'text' && r.depth === 1) ?? rows.find((r) => r.type === 'sticker' && r.depth === 1)!;
    const into = M.moveInto(comp, text.path, box.path, cat);
    if (!into.error) {
      expect(M.elementAt(into.comp, into.path!)!.place).toBeUndefined();
      const out = M.moveOut(into.comp, into.path!, look, cat);
      expect(out.error).toBeUndefined();
      expect(M.elementAt(out.comp, out.path!)!.place).toBeDefined();
      expect(added(all.find((x) => x.id === 'retail/photo/Frame pop')!, out.comp)).toEqual([]);
    }
    expect(M.moveInto(comp, box.path, box.path, cat).error).toMatch(/inside itself/);
    expect(M.moveInto(comp, rows.find((r) => r.type === 'photo')!.path, box.path, cat).error).toMatch(/cannot flow/);
    expect(M.moveInto(comp, text.path, rows.find((r) => r.type === 'photo')!.path, cat).error).toMatch(/holds nothing/);
    expect(M.moveOut(comp, '0', look, cat).error).toMatch(/not inside/);
  });
  it('moves only into the right container', () => {
    const comp = { kind: 'photo', elements: [{ type: 'text', field: 'sub', place: { px: { x: 0, y: 0, w: 1, h: 1 } } }, { type: 'sticker', shape: 'circle', size: 100, children: [{ type: 'text', source: 'brand' }], place: { px: { x: 0, y: 0 } } }, { type: 'block', place: { px: { x: 0, y: 0, w: 5, h: 5 } } }] };
    expect(M.moveInto(comp, '0', '1', cat).error).toBeUndefined();
    expect(M.moveInto(comp, '2', '1', cat).error).toMatch(/text only/);
  });
  it('adds a seam\'s edge sticker once', () => {
    const look = settings(LOOKS.retail);
    const comp = { kind: 'photo', fields: { image: { required: true } }, elements: [{ type: 'seam', leftY: 900, rightY: 800, lower: 'field' }] };
    const e = M.addEdgeSticker(comp, '0', look, cat);
    expect(M.locate(e.comp, e.path!)?.slot).toBe(true);
    expect(M.addEdgeSticker(e.comp, '0', look, cat).error).toMatch(/already/);
    expect(M.restoreElement(M.removeElement(e.comp, e.path!).comp, M.removeElement(e.comp, e.path!).undo!).comp).toEqual(e.comp);
    expect(M.addEdgeSticker(comp, '0', look, cat).comp).not.toBe(comp);
  });
});

describe('fields, budgets, conditions and accepts', () => {
  const comp = (): Json => ({ kind: 'photo', fields: { image: { required: true }, headline: { required: true, max: 68 }, sub: { max: 120 } }, elements: [{ type: 'photo', place: { inset: 'page' } }, { type: 'text', field: 'headline', style: 'display', size: 90, place: { px: { x: 0, y: 0, w: 100, h: 100 } } }, { type: 'text', field: 'sub', style: 'body', place: { px: { x: 0, y: 0, w: 100, h: 100 } }, when: { present: 'sub' } }] });
  const look = settings(LOOKS.retail);
  it('binds a new field with the kind\'s budget and lists what is no longer shown', () => {
    const e = M.bindField(comp(), '2', 'tag', look, cat);
    expect(e.error).toBeUndefined();
    expect(M.elementAt(e.comp, '2')!.field).toBe('tag');
    expect((e.comp.fields as Json).tag).toEqual({ max: 16 });
    expect(e.orphans).toEqual(['sub']);
    expect(M.pruneFields(e.comp, e.orphans).fields).toEqual({ image: { required: true }, headline: { required: true, max: 68 }, tag: { max: 16 } });
    expect(M.bindField(comp(), '2', 'items', look, cat).error).toBeTruthy();
    expect(M.bindField(comp(), '2', 'quote', look, cat).error).toMatch(/not a field of this kind/);
    expect(M.bindField(comp(), '0', 'sub', look, cat).error).toMatch(/does not show a field/);
    const un = M.bindField(comp(), '2', null, look, cat);
    expect(M.elementAt(un.comp, '2')!.field).toBeUndefined();
    expect(un.orphans).toEqual(['sub']);
    expect(M.setSource(comp(), '2', 'folio', look, cat).orphans).toEqual(['sub']);
  });
  it('shows a fixed word (Myth, Fact) instead of a field or a source, and a field or source replaces it again', () => {
    const soft = LOOKS.soft, s = settings(soft);
    const i = soft.compositions.findIndex((c) => c.name === 'Myth and fact');
    const mf = soft.compositions[i]!;
    const at = M.listTree(mf, cat).find((r) => r.el.word === 'Myth')!.path;
    expect(M.elementName(M.elementAt(mf, at)!, cat)).toBe('The word Myth');
    const fact = M.setWord(mf, at, 'Fact', s, cat);
    expect(M.elementAt(fact.comp, at)).toMatchObject({ word: 'Fact' });
    expect(M.setWord(mf, at, 'Rumour', s, cat).error).toMatch(/not one of the fixed words/);
    for (const e of [M.bindField(fact.comp, at, 'label', s, cat), M.setSource(fact.comp, at, 'site', s, cat)]) {
      const el = M.elementAt(e.comp, at)!;
      expect(el.word).toBeUndefined();
      expect(el.field ?? el.source).toBeTruthy();
    }
    expect(verdict(soft, i, fact.comp)).toEqual([]);
    const t = M.addElement(mf, 'text', s, cat);
    expect(M.setWord(t.comp, t.path!, 'Yes', s, cat).comp).not.toBe(t.comp);
  });
  it('a new sticker shows a field nothing shows yet, else the brand name (never a field twice)', () => {
    const soft = LOOKS.soft, s = settings(soft);
    const photo = soft.compositions.find((c) => c.kind === 'photo')!;
    const e = M.addElement(photo, 'sticker', s, cat);
    const el = M.elementAt(e.comp, e.path!)!;
    expect(el.field).toBeUndefined();
    expect(el.children).toEqual([{ type: 'text', source: 'brand', style: 'label' }]);
  });
  it('draws the pale tint ground of a soft design in its own colour', () => {
    expect(M.backgroundRoles({ kind: 'statement', ground: 'tint', elements: [{ type: 'text', field: 'headline' }] }, '0', settings(LOOKS.soft))).toEqual(['light-tint']);
    expect(M.GROUND_WORDS.tint).toBe('Pale tint');
  });
  it('fills in the budget of a required field and lists items with min and max', () => {
    expect(M.defaultBudget('headline', 'photo', cat)).toEqual({ required: true, max: 70 });
    expect(M.defaultBudget('items', 'list', cat)).toEqual({ required: true, min: 2, max: 5 });
    expect(M.defaultBudget('image', 'photo', cat)).toEqual({ required: true });
  });
  it('edits budgets within what a post allows', () => {
    const e = M.setBudget(comp(), 'sub', { max: 100 }, cat);
    expect(((e.comp.fields as Json).sub as Json).max).toBe(100);
    expect(M.setBudget(comp(), 'sub', { max: 141 }, cat).error).toMatch(/1 to 140/);
    expect(M.setBudget(comp(), 'sub', { max: 0 }, cat).error).toBeTruthy();
    expect(M.setBudget(comp(), 'sub', { max: 1.5 }, cat).error).toBeTruthy();
    expect(M.setBudget(comp(), 'headline', { required: false }, cat).error).toMatch(/always needed/);
    expect(((M.setBudget(comp(), 'sub', { required: true }, cat).comp.fields as Json).sub as Json).required).toBe(true);
    expect(M.setBudget(comp(), 'tag', { max: 3 }, cat).error).toMatch(/not in this design/);
    expect(M.setBudget(comp(), 'image', { max: 3 }, cat).error).toMatch(/no length/);
  });
  it('adds and removes fields of the kind', () => {
    const e = M.addField(comp(), 'tag', cat);
    expect((e.comp.fields as Json).tag).toEqual({ max: 16 });
    expect(M.addField(comp(), 'quote', cat).error).toBeTruthy();
    expect(M.removeField(comp(), 'sub', look, cat).error).toMatch(/still shows/);
    expect(M.removeField(e.comp, 'tag', look, cat).comp.fields).toEqual(comp().fields);
    expect(M.removeField(comp(), 'headline', look, cat).error).toMatch(/needed/);
  });
  it('edits when, in plain words', () => {
    const e = M.setWhen(comp(), '1', { absent: 'sub' }, cat);
    expect(M.elementAt(e.comp, '1')!.when).toEqual({ absent: 'sub' });
    expect(M.setWhen(e.comp, '1', {}, cat).comp).toEqual(comp());
    expect(M.setWhen(comp(), '1', { present: 'tag' }, cat).error).toMatch(/add it first/);
    expect(M.setWhen(comp(), '1', { present: 'sub', absent: 'sub' }, cat).error).toMatch(/both/);
    expect(M.whenText({ present: 'sub' }, cat)).toBe('Shown only when Sub line is filled in');
    expect(M.whenText({ present: 'sub', absent: 'headline' }, cat)).toBe('Shown only when Sub line is filled in and Headline is empty');
    expect(M.whenText({}, cat)).toBe('Always shown');
  });
  it('writes accepts rules in plain words and checks them', () => {
    expect(M.acceptText({ field: 'headline', part: 'pre', maxChars: 22 }, cat)).toBe('Only when the first part of the headline is up to 22 characters');
    expect(M.acceptText({ field: 'headline', maxChars: 30 }, cat)).toBe('Only when the headline is up to 30 characters');
    expect(M.acceptText({ field: 'headline', part: 'phrase', maxChars: 12 }, cat)).toBe('Only when the emphasised phrase of the headline is up to 12 characters');
    expect(M.acceptText({ field: 'items', min: 3, max: 5 }, cat)).toBe('Only when there are 3 to 5 list points');
    expect(M.setAccepts(comp(), [{ field: 'headline', part: 'pre', maxChars: 22 }], cat).error).toBeUndefined();
    expect(M.setAccepts(comp(), [{ field: 'sub', part: 'pre', maxChars: 22 }], cat).error).toMatch(/emphasised/);
    expect(M.setAccepts(comp(), [{ field: 'headline', maxChars: 71 }], cat).error).toMatch(/1 to 70/);
    expect(M.setAccepts(comp(), [{ field: 'tag', maxChars: 5 }], cat).error).toMatch(/not a field/);
    expect(M.setAccepts(comp(), Array.from({ length: 7 }, () => ({ field: 'headline', maxChars: 5 })), cat).error).toMatch(/At most 6/);
    expect(M.setAccepts({ ...comp(), accepts: [{ field: 'headline', maxChars: 5 }] }, [], cat).comp.accepts).toBeUndefined();
  });
  it('edits the design\'s own settings', () => {
    expect(M.setTop(comp(), 'name', '', cat).error).toMatch(/needs a name/);
    expect(M.setTop(comp(), 'name', 'x'.repeat(41), cat).error).toMatch(/at most 40/);
    expect(M.setTop(comp(), 'describe', 'Use it for quiet posts', cat).comp.describe).toBe('Use it for quiet posts');
    expect(M.setTop({ ...comp(), describe: 'x' }, 'describe', '', cat).comp.describe).toBeUndefined();
    expect(M.setCalm(comp(), 0.5).comp.calm).toEqual({ maxShare: 0.5 });
    expect(M.setCalm(comp(), 0.9).error).toBeTruthy();
    expect(M.setCalm({ ...comp(), calm: { maxShare: 0.6 } }, undefined).comp.calm).toBeUndefined();
    expect(M.setGround(comp(), 'dark').comp.ground).toBe('dark');
    // more sizes of type: three is the rule (no setting), four or five with a ratio
    expect(M.setLevels(comp(), 4).comp.levels).toEqual({ max: 4 });
    expect(M.setLevels(comp(), 5, 1.4).comp.levels).toEqual({ max: 5, ratio: 1.4 });
    expect(M.setLevels({ ...comp(), levels: { max: 4 } }, 3).comp.levels).toBeUndefined();
    expect(M.setLevels(comp(), 6).error).toBeTruthy();
    expect(M.setLevels(comp(), 4, 1.1).error).toBeTruthy();
  });
  it('checks a size ladder', () => {
    expect(M.checkLadder([[30, 96], [70, 80]], 70, [24, 300])).toBe('');
    expect(M.checkLadder([[30, 96], [20, 80]], 70, [24, 300])).toMatch(/shortest text first/);
    expect(M.checkLadder([[30, 80], [70, 96]], 70, [24, 300])).toMatch(/must not grow/);
    expect(M.checkLadder([[30, 96], [50, 80]], 70, [24, 300])).toMatch(/must reach 70/);
    expect(M.checkLadder([[30, 500]], undefined, [24, 300])).toMatch(/24 to 300/);
    expect(M.checkLadder([], undefined, [24, 300])).toMatch(/at least one/);
  });
});

describe('what the server says, in words', () => {
  const comp = { kind: 'photo', elements: [{ type: 'photo' }, { type: 'photo' }, { type: 'box', children: [{ type: 'text', field: 'headline' }, { type: 'seam', children: [], sticker: { type: 'sticker', children: [{ type: 'text', source: 'brand' }] } }] }] };
  it('maps an engine path to an element path', () => {
    expect(M.pathOfProblem('compositions[3].elements[2].children[0].size')).toEqual({ path: '2.0', prop: 'size' });
    expect(M.pathOfProblem('elements[2]')).toEqual({ path: '2', prop: null });
    expect(M.pathOfProblem('compositions[0].elements[1].place.grid.span')).toEqual({ path: '1', prop: 'place.grid.span' });
    expect(M.pathOfProblem('compositions[0].fields.headline.max')).toEqual({ path: null, prop: 'fields.headline.max' });
    expect(M.pathOfProblem('compositions[0].elements[2].children[1].sticker.size', comp)).toEqual({ path: '2.1.0', prop: 'size' });
    expect(M.pathOfProblem('compositions[0].elements[2].children[1].sticker.children[0]', comp)).toEqual({ path: '2.1.0.0', prop: null });
  });
  it('says each problem with the element it is about', () => {
    const out = M.mapProblems([
      { path: 'compositions[2].elements[2].children[0].size', message: 'look "x": compositions[2].elements[2].children[0].size must be a whole number from 14 to 900 (got 9999)' },
      { path: 'compositions[2]', message: 'look "x": compositions[2] sets type in 4 sizes; at most 3 levels are allowed' },
    ], comp, cat);
    expect(out[0]).toMatchObject({ path: '2.0', prop: 'size' });
    expect(out[0]!.message).toMatch(/^Headline: Size: must be a whole number/);
    expect(out[1]).toMatchObject({ path: null });
    expect(out[1]!.message).toBe('Sets type in 4 sizes; at most 3 levels are allowed');
  });
});

describe('the original of a design', () => {
  it('finds it by name, then by position', () => {
    const r = LOOKS.retail;
    expect(M.findOriginal(r, { kind: 'photo', name: 'Seam' }, 0)).toBe(r.compositions[6]);
    expect(M.findOriginal(r, { kind: 'photo', name: 'Mine' }, 0)).toBe(r.compositions[5]);
    expect(M.findOriginal(r, { kind: 'photo', name: 'Mine' }, 9)).toBeNull();
    expect(M.shippedIdOf('copy:shipped:retail')).toBe('retail');
    expect(M.shippedIdOf('copy:own:mine')).toBeNull();
    expect(M.shippedIdOf('shipped')).toBeNull();
  });
});

describe('the library', () => {
  it('groups every type once, with a one-line help', () => {
    const groups = M.libraryGroups(cat);
    expect(groups.map((g) => g.title)).toEqual(['Text', 'Pictures', 'Shapes and devices', 'Special pieces']);
    const types = groups.flatMap((g) => g.types);
    expect([...types].sort()).toEqual(Object.keys(cat.elements).sort());
    for (const t of types) expect(M.oneLine(cat.elements[t]!.help)).toMatch(/\.$/);
  });
});

describe('design health', () => {
  it.each(all.map((a) => [a.id, a] as const))('%s: the shipped designs pass the guard rails the engine checks', (_id, a) => {
    const h = designHealth(a.comp, a.s, cat);
    const bad = h.items.filter((i) => i.status === 'bad');
    expect(bad.map((i) => `${i.id}: ${i.detail}`)).toEqual([]);
  });
  it('counts type levels, rotated pieces and required fields', () => {
    const look = settings(LOOKS.swiss);
    const base = (elements: Json[], fields: Json = { headline: { required: true, max: 70 } }): Json => ({ kind: 'statement', name: 'x', ground: 'paper', fields, elements });
    const t = (size: number, extra: Json = {}): Json => ({ type: 'text', field: 'headline', style: 'display', size, place: { px: { x: 0, y: 0, w: 100, h: 100 } }, ...extra });
    const get = (c: Json, id: string) => designHealth(c, look, cat).items.find((i) => i.id === id)!;
    expect(get(base([t(100)]), 'levels').status).toBe('ok');
    expect(get(base([t(100), t(60, { field: 'sub' }), t(40, { field: 'label' }), t(120, { field: 'big' })], { headline: { required: true }, sub: {}, label: {}, big: {} }), 'levels').status).toBe('bad');
    expect(get(base([t(100)]), 'required').status).toBe('ok');
    expect(get(base([{ type: 'block', place: { px: { x: 0, y: 0, w: 5, h: 5 } } }]), 'required').status).toBe('bad');
    expect(get(base([t(100), t(100)]), 'required').status).toBe('bad');
    expect(get(base([t(100), { ...t(30), part: 'pre' }]), 'required').status).toBe('ok');
    const turned = (n: number) => base([t(100), ...Array.from({ length: n }, () => ({ type: 'block', rot: 2, place: { px: { x: 0, y: 0, w: 5, h: 5 } } }))]);
    expect(get(turned(3), 'rotated').status).toBe('ok');
    expect(get(turned(4), 'rotated').status).toBe('bad');
    // scale: a headline of 100 over body text of 34 is 2.9 : 1; 70 over 34 is not enough
    expect(get(base([t(100), { type: 'text', field: 'sub', style: 'body', place: { px: { x: 0, y: 0, w: 5, h: 5 } } }], { headline: { required: true }, sub: {} }), 'scale').status).toBe('ok');
    expect(get(base([t(70), { type: 'text', field: 'sub', style: 'body', place: { px: { x: 0, y: 0, w: 5, h: 5 } } }], { headline: { required: true }, sub: {} }), 'scale').status).toBe('bad');
  });
  it('wants a block or fade under text that lies over a picture', () => {
    const look = settings(LOOKS.swiss);
    const photo: Json = { type: 'photo', place: { inset: 'page' } };
    const text: Json = { type: 'text', field: 'headline', style: 'display', size: 100, place: { px: { x: 100, y: 100, w: 600, h: 200 } } };
    const comp = (els: Json[]): Json => ({ kind: 'photo', name: 'x', ground: 'paper', fields: { image: { required: true }, headline: { required: true, max: 70 } }, elements: els });
    const get = (c: Json) => designHealth(c, look, cat).items.find((i) => i.id === 'photo-text')!;
    expect(get(comp([photo, text])).status).toBe('bad');
    expect(get(comp([photo, { type: 'scrim', place: { inset: 'page' } }, text])).status).toBe('ok');
    expect(get(comp([photo, { type: 'block', colour: 'paper', place: { px: { x: 80, y: 80, w: 700, h: 300 } } }, text])).status).toBe('ok');
    expect(get(comp([photo, { type: 'box', fill: 'paper', place: { px: { x: 80, y: 80, w: 700, h: 300 } }, children: [{ ...text, place: undefined }] }])).status).toBe('ok');
    expect(get(comp([{ ...photo, place: { px: { x: 0, y: 800, w: 1080, h: 500 } } }, text])).status).toBe('ok');
  });
});

describe('whole places, conditions and colours', () => {
  const look = settings(LOOKS.swiss);
  const comp = (): Json => ({ kind: 'photo', ground: 'dark', fields: { image: { required: true }, headline: { required: true, max: 64 }, sub: { max: 110 } }, elements: [
    { type: 'photo', place: { grid: { col: 5, span: 8, row: 2, rowSpan: 5 } } },
    { type: 'box', fill: 'paper', place: { inset: 'margins' }, children: [{ type: 'text', field: 'sub', style: 'body' }] },
    { type: 'sticker', shape: 'circle', size: 100, field: 'tag', place: { px: { x: 0, y: 0 } } },
  ] });
  it('writes a whole place, each value checked, and refuses a broken one', () => {
    const c = comp();
    expect(M.setPlace(c, '0', { grid: { col: 1, span: 4, row: 2, rowSpan: 2 } }, cat).error).toBeUndefined();
    expect(M.setPlace(c, '0', { grid: { col: 1, span: 40 } }, cat).error).toMatch(/1 to 24/);
    expect(M.setPlace(c, '0', { grid: { col: 1, span: 4 }, px: { x: 1, y: 1 } }, cat).error).toMatch(/one way/);
    expect(M.setPlace(c, '0', { grid: { col: 1, span: 4 }, dx: 900 }, cat).error).toBeTruthy();
    expect(M.setPlace(c, '0', { nonsense: 1 }, cat).error).toBeTruthy();
    expect(M.setPlace(c, '0', c.elements instanceof Array ? ((c.elements as Json[])[0]!.place as Json) : {}, cat).comp).toBe(c);
    expect(M.setProp(c, '0', 'place', { inset: 'page' }, cat).comp).not.toBe(c);
    expect(M.setProp(c, '0', 'place', undefined, cat).error).toMatch(/place controls/);
    expect(M.setProp(c, '1', 'children', [], cat).error).toMatch(/layers/);
  });
  it('writes a condition through the model so the field must be in the design', () => {
    const c = comp();
    expect(M.setProp(c, '1', 'when', { present: 'sub' }, cat).error).toBeUndefined();
    expect(M.setProp(c, '1', 'when', { present: 'tag' }, cat).error).toMatch(/add it first/);
    expect(M.elementAt(M.setProp(c, '1', 'when', { present: 'sub' }, cat).comp, '1')!.when).toEqual({ present: 'sub' });
  });
  it('finds the colours an ink may be (only those that read on its background)', () => {
    const c = comp();
    expect(M.backgroundRoles(c, '1.0', look)).toEqual(['paper']);
    expect(M.backgroundRoles(c, '0', look)).toEqual(['dark']);
    const onPaper = M.inkChoices(c, '1.0', look, cat);
    expect(onPaper).toContain('ink');
    expect(onPaper).not.toContain('white');
    const onDark = M.inkChoices(c, '0', look, cat);
    expect(onDark).toContain('white');
    expect(onDark).not.toContain('ink');
    expect(M.inkChoices(c, '1.0', look, cat, true)).toEqual(cat.lists.roles);
    expect(M.backgroundRoles(c, '2', look)).toEqual(['gold']);
  });
  it('lets the server\'s sentences replace the guesses', () => {
    const c: Json = { kind: 'statement', name: 'x', ground: 'paper', fields: { headline: { required: true, max: 70 } }, elements: [{ type: 'text', field: 'headline', style: 'display', size: 100, place: { px: { x: 0, y: 0, w: 5, h: 5 } } }] };
    const h = designHealth(c, look, cat);
    expect(h.worst).toBe('ok');
    const merged = mergeServer(h, ['compositions[0] sets type in 4 sizes; at most 3 levels are allowed', 'something else']);
    expect(merged.items.find((i) => i.id === 'levels')).toMatchObject({ status: 'bad', detail: expect.stringMatching(/4 sizes/) });
    expect(merged.items.find((i) => i.id === 'rotated')!.status).toBe('ok');
    expect(merged.worst).toBe('bad');
    expect(mergeServer(h, [])).toBe(h);
  });
});
