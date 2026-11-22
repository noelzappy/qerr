// The design editor's surfaces: a pattern piece is added at the back of the page with a quiet setting the engine accepts, every ready-made
// setting is one the engine accepts, and a text's "Crosses a shape" choice names the shape and sets the pairing in one step, never a box
// the words sit in.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as M from '../web/src/pages/settings/looks/design-model';
import { PATTERN_PRESETS, crossableShapes, takes } from '../web/src/pages/settings/looks/design/surfaces';
import type { Json, LookCatalogue } from '../web/src/pages/settings/looks/look-types';

type Engine = { lookCatalogue(): LookCatalogue; validateLook(l: unknown, w?: string, o?: { shipped?: boolean }): string[] };
const engine = await import('@vesk/engine/design/look' as string) as Engine;
const prims = await import('@vesk/engine/design/directions/primitives/backdrop' as string) as { PRESETS: Record<string, Json> };
const cat = engine.lookCatalogue();
const dir = path.join(path.dirname(createRequire(import.meta.url).resolve('@vesk/engine/package.json')), 'lib', 'design', 'looks');
const soft = JSON.parse(fs.readFileSync(path.join(dir, 'soft.look.json'), 'utf8')) as Json & { compositions: Json[] };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const verdict = (comp: Json): string[] => { const l = clone(soft); l.origin = 'copy:shipped:soft'; l.compositions[0] = comp; return engine.validateLook(l, 'look'); };

describe('a pattern piece', () => {
  it('is added first, over the whole page, quiet, and the engine takes it', () => {
    const comp = clone(soft.compositions[0]!);
    const e = M.addElement(comp, 'backdrop', soft, cat);
    expect(e.error).toBeUndefined();
    expect(e.path).toBe('0');
    const el = (e.comp.elements as Json[])[0]!;
    expect(el).toMatchObject({ type: 'backdrop', pattern: 'dots', place: { inset: 'page' } });
    expect(el.opacity as number).toBeLessThanOrEqual(0.1);
    expect(verdict(e.comp)).toEqual([]);
  });
  it('is never added inside a box', () => {
    const comp = clone(soft.compositions[0]!);
    const box = (comp.elements as Json[]).findIndex((x) => x.type === 'box' && Array.isArray(x.children));
    expect(M.addElement(comp, 'backdrop', soft, cat, String(box)).error).toMatch(/goes on the page/);
  });
  it('offers the engine\'s own ready-made settings, each one the engine accepts', () => {
    expect(Object.fromEntries(PATTERN_PRESETS.map((p) => [p.id, p.set]))).toEqual(prims.PRESETS);
    for (const p of PATTERN_PRESETS) {
      const comp = clone(soft.compositions[0]!);
      (comp.elements as Json[]).unshift({ type: 'backdrop', place: { inset: 'page' }, ...p.set });
      expect(verdict(comp), p.id).toEqual([]);
      for (const k of Object.keys(p.set)) expect(takes(String(p.set.pattern), k), `${p.id}.${k}`).toBe(true);
    }
  });
});

describe('words that cross a shape', () => {
  const comp = (): Json => ({
    ...clone(soft.compositions[0]!),
    fields: { headline: { required: true, max: 70 }, sub: { max: 125 } },
    elements: [
      { type: 'box', place: { px: { x: 48, y: 210, w: 770, h: 770 } }, fill: 'paper', radius: 'full' },
      { type: 'box', place: { px: { x: 72, y: 1100, w: 600, h: 160 } }, flow: 'column', children: [{ type: 'text', field: 'sub', style: 'body' }] },
      { type: 'text', field: 'headline', style: 'display', size: 128, place: { px: { x: 156, y: 400, w: 852 } } },
    ],
  });
  it('lists the filled shapes, never the box the words sit in', () => {
    const c = comp();
    expect(crossableShapes(c, '2').map((s) => s.path)).toEqual(['0']);
    expect(crossableShapes(c, '1.0').map((s) => s.path)).toEqual(['0']);
  });
  it('names the shape and sets the pairing in one valid step', () => {
    let c = comp();
    let e = M.setProp(c, '0', 'key', 'a', cat, soft);
    expect(e.error).toBeUndefined();
    e = M.setProp(e.comp, '2', 'overlap', { with: 'a', allow: true }, cat, soft);
    expect(e.error).toBeUndefined();
    c = e.comp;
    expect(verdict(c)).toEqual([]);
    expect(M.setProp(c, '2', 'overlap', { with: 'a', allow: true, outline: { colour: '#000000', w: 4 } }, cat, soft).error).toBeTruthy();
  });
});
