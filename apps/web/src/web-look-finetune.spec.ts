// Fine-tune's grouped controls (web/src/pages/settings/looks/settings/fine-controls.ts and the weight strips of weights.ts): how each
// labelled number maps onto the catalogue values it stands for, over every shipped look. Writing a preset or any number in range
// writes only what the control owns, reads back as that number, and leaves a look the engine's validateLook accepts. Pure, no database.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { getAt, setAt } from '../web/src/pages/settings/looks/look-model';
import { assignNodes, GROUPS, leafCount } from '../web/src/pages/settings/looks/settings/groups';
import { FINE_CONTROLS, FINE_LAYOUT, fineAvailable, fineProblem, finePresets, newProblems, readFine, WEIGHTS_CONTROL, writeFine, type FineCtx } from '../web/src/pages/settings/looks/settings/fine-controls';
import { toggleWeight, weightStrip } from '../web/src/pages/settings/looks/settings/weights';
import type { FontFamilyInfo, Json, LookCatalogue } from '../web/src/pages/settings/looks/look-types';

const engine = await import('@qerr/engine/design/look' as string) as { lookCatalogue(): LookCatalogue; validateLook(l: unknown, w?: string, o?: { shipped?: boolean }): string[] };
const cat = engine.lookCatalogue();
const enginePkg = path.dirname(createRequire(import.meta.url).resolve('@qerr/engine/package.json'));
const dir = path.join(enginePkg, 'lib', 'design', 'looks');
const NAMES = fs.readdirSync(dir).filter((f) => f.endsWith('.look.json')).map((f) => f.replace('.look.json', '')).sort();
const shipped = (n: string): Json & { compositions: Json[] } => JSON.parse(fs.readFileSync(path.join(dir, `${n}.look.json`), 'utf8'));
const library = JSON.parse(fs.readFileSync(path.join(enginePkg, 'design', 'fonts', 'library.json'), 'utf8')) as Array<{ family: string; axes: Record<string, number[]>; files: Array<{ style: string }> }>;
const fonts: FontFamilyInfo[] = library.map((f) => ({ family: f.family, minWeight: f.axes.wght?.[0] ?? 400, maxWeight: f.axes.wght?.[1] ?? 400, italic: f.files.some((x) => x.style === 'italic'), stretch: !!f.axes.wdth }));

const settingsOf = (l: Json): Json => { const { compositions: _c, ...rest } = l; return JSON.parse(JSON.stringify(rest)); };
const ctxFor = (name: string): FineCtx => ({ sections: cat.sections, fonts, baseline: settingsOf(shipped(name)), ownFonts: true, comps: shipped(name).compositions, catalogue: cat });
// The whole definition (settings and designs) as the engine checks it.
const problems = (name: string, settings: Json) => engine.validateLook({ ...settings, compositions: shipped(name).compositions }, 'look', { shipped: true });
const flat = (v: unknown, p: string, into: Record<string, string>) => { if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) flat(x, p ? `${p}.${k}` : k, into); else into[p] = JSON.stringify(v); return into; };
const diff = (a: Json, b: Json) => { const x = flat(a, '', {}), y = flat(b, '', {}); return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => x[k] !== y[k]); };
const covered = (owns: string[], p: string) => owns.some((o) => p === o || p.startsWith(`${o}.`) || p.startsWith(`${o}[`));
const stepsOf = (c: { min: number; max: number; step: number }) => { const out: number[] = []; for (let i = 0; c.min + i * c.step <= c.max + 1e-9; i++) out.push(Number((c.min + i * c.step).toFixed(6))); return out; };

describe('the grouped controls of Fine-tune', () => {
  it('are a dozen, laid out in the groups whose values they write', () => {
    const all = Object.values(FINE_LAYOUT).flat();
    expect(all.length).toBe(12);
    expect(new Set(all).size).toBe(12);
    const assignment = assignNodes(cat.sections);
    for (const [group, ids] of Object.entries(FINE_LAYOUT)) {
      for (const id of ids) {
        if (id === WEIGHTS_CONTROL) { expect(group).toBe('typeface'); continue; }
        const c = FINE_CONTROLS[id]!;
        expect(c.group, id).toBe(group);
        for (const p of c.owns) expect(covered(assignment[c.group], p), `${id} owns ${p} outside ${c.group}`).toBe(true);
      }
    }
    expect(Object.keys(FINE_CONTROLS).sort()).toEqual(all.filter((x) => x !== WEIGHTS_CONTROL).sort());
  });

  it('keep every value of every group countable under Exact values: 68 in all, as the catalogue has', () => {
    const assignment = assignNodes(cat.sections);
    expect(GROUPS.reduce((n, g) => n + leafCount(cat.sections, assignment[g.id]), 0)).toBe(68);
  });

  for (const name of NAMES) {
    const look = settingsOf(shipped(name));
    const ctx = ctxFor(name);
    for (const [id, c] of Object.entries(FINE_CONTROLS)) {
      it(`${name}: ${id} writes each preset and every step in range as only what it owns, and reads it back`, () => {
        expect(fineAvailable(id, look, ctx), `${id} offered`).toBe(true);
        // What the look holds now reads back as a number in range, and writing it changes nothing when its values follow it.
        const now = readFine(id, look, ctx);
        expect(now.value).not.toBeNull();
        expect(now.value!).toBeGreaterThanOrEqual(c.min);
        expect(now.value!).toBeLessThanOrEqual(c.max);
        if (now.linked) expect(writeFine(id, now.value!, look, ctx)).toBe(look);
        for (const n of [...c.presets(look, ctx).map((p) => p.value), ...stepsOf(c)]) {
          const next = writeFine(id, n, look, ctx);
          for (const p of diff(look, next)) expect(covered(c.owns, p), `${id}=${n} wrote ${p}`).toBe(true);
          const back = readFine(id, next, ctx);
          expect(back.linked, `${id}=${n}`).toBe(true);
          // Text size moves to the nearest allowed sizes, so two percentages can give the same sizes: those read as the first.
          if (id === 'textSize') expect(writeFine(id, back.value!, next, ctx), `${id}=${n}`).toBe(next);
          else expect(back.value, `${id}=${n}`).toBeCloseTo(n, 9);
          expect(writeFine(id, n, next, ctx), `${id}=${n} again`).toBe(next);
        }
      });

      it(`${name}: ${id} never leaves a look validateLook refuses: what the guard and the engine let through is valid`, () => {
        const base = problems(name, look);
        expect(base).toEqual([]);
        // The engine's say, as the server gives it to the page (POST /api/settings/looks/validate).
        const engineTakes = (n: number) => newProblems(base, problems(name, writeFine(id, n, look, ctx))).length === 0;
        for (const n of stepsOf(c)) {
          const local = fineProblem(id, n, look, ctx);
          const valid = problems(name, writeFine(id, n, look, ctx)).length === 0;
          // The browser's guard alone is enough for every control but Text size, whose sizes the designs' buttons and photo rows
          // also count; for that one the engine is asked before anything is written.
          if (!local && id !== 'textSize') expect(valid, `${id}=${n} passed the guard but the engine refuses it`).toBe(true);
          if (!local && engineTakes(n)) expect(valid, `${id}=${n}`).toBe(true);
          if (local) expect(local, `${id}=${n}`).toMatch(/^(Use a number|The |A design|That would break)/);
        }
        // The presets offered: each one valid; the look's own value is never refused.
        for (const p of finePresets(id, look, ctx).filter((x) => engineTakes(x.value))) expect(problems(name, writeFine(id, p.value, look, ctx)), `${id} preset ${p.label}`).toEqual([]);
        const own = readFine(id, look, ctx).value;
        if (own !== null) expect(fineProblem(id, own, look, ctx)).toBe('');
      });
    }
  }

  it('refuses a number outside the range, or none, by changing nothing (it never clamps)', () => {
    const look = settingsOf(shipped('retail')), ctx = ctxFor('retail');
    for (const [id, c] of Object.entries(FINE_CONTROLS)) {
      expect(writeFine(id, c.max + c.step, look, ctx), id).toBe(look);
      expect(writeFine(id, c.min - c.step, look, ctx), id).toBe(look);
      expect(writeFine(id, Number.NaN, look, ctx), id).toBe(look);
    }
  });

  it('reads the shipped values: Retail\'s 56 px margins are a custom number, its frame is Bold, its body lines do not follow one number', () => {
    const r = settingsOf(shipped('retail')), ctx = ctxFor('retail');
    expect(readFine('margins', r, ctx)).toEqual({ value: 56, linked: true });
    expect(readFine('frame', r, ctx)).toEqual({ value: 70, linked: true });
    expect(readFine('shadow', r, ctx)).toEqual({ value: 14, linked: true });
    expect(readFine('textSize', r, ctx)).toEqual({ value: 100, linked: true });
    expect(readFine('displayTrack', r, ctx)).toEqual({ value: -0.025, linked: true });
    // 1.2222 and 1.087 are not one line height and the list's 0.2 closer: Custom, and the values are left alone.
    expect(readFine('bodyLead', r, ctx)).toEqual({ value: 1.2222, linked: false });
    expect(getAt(r, 'type.item.lead')).toBe(1.087);
  });

  it('moves the three text sizes together, each to the nearest size allowed', () => {
    const r = settingsOf(shipped('retail')), ctx = ctxFor('retail');
    const larger = writeFine('textSize', 110, r, ctx);
    // 36, 46 and 24 at 110 %: 39.6, 50.6 and 26.4, so 40, 52 and 26.
    expect([getAt(larger, 'type.body.size'), getAt(larger, 'type.item.size'), getAt(larger, 'type.label.size')]).toEqual([40, 52, 26]);
    const smaller = writeFine('textSize', 90, r, ctx);
    // 32.4, 41.4 and 21.6: 32, 40 and 22.
    expect([getAt(smaller, 'type.body.size'), getAt(smaller, 'type.item.size'), getAt(smaller, 'type.label.size')]).toEqual([32, 40, 22]);
    expect(readFine('textSize', smaller, ctx)).toEqual({ value: 90, linked: true });
  });

  it('refuses, with a sentence, what would break the grid, a frame a design draws, or a design\'s rules', () => {
    const r = settingsOf(shipped('retail')), ctx = ctxFor('retail');
    // Retail's designs draw the look's frame, so None is not offered.
    expect(fineProblem('frame', 0, r, ctx)).toBe('A design draws the look\'s frame, so the frame needs a thickness.');
    expect(finePresets('frame', r, ctx).map((p) => p.label)).toEqual(['Thin', 'Bold']);
    const s = settingsOf(shipped('studio')), sc = ctxFor('studio');
    expect(fineProblem('gutter', 80, s, sc)).toMatch(/^The 12 columns would be \d+ px wide; each needs at least 16 px\.$/);
    expect(fineProblem('gutter', 24, s, sc)).toBe('');
  });

  it('shows Custom when one of the values no longer follows the number', () => {
    const r = settingsOf(shipped('retail')), ctx = ctxFor('retail');
    const uneven = setAt(r, 'canvas.feed.margin.left', 80);
    expect(readFine('margins', uneven, ctx)).toEqual({ value: 56, linked: false });
    const sized = setAt(r, 'type.label.size', 34);
    expect(readFine('textSize', sized, ctx).linked).toBe(false);
    // Writing the number puts them all back in step.
    expect(readFine('margins', writeFine('margins', 64, uneven, ctx), ctx)).toEqual({ value: 64, linked: true });
  });
});

describe('the weight strips', () => {
  it('offer the weights the family has, mark the ones the look uses, and list what is chosen', () => {
    const r = shipped('retail'), look = settingsOf(r);
    const strip = weightStrip(look, r.compositions, 'display', fonts)!;
    expect(strip.family).toBe('Archivo');
    expect(strip.chosen).toEqual([900]);
    expect(strip.needed).toContain(900);
    expect(strip.offered).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900]);
    // A brand font has no strip: its weights are the files the brand uploaded.
    expect(weightStrip(setAt(look, 'fonts.display', { source: 'brand', role: 'display' }), r.compositions, 'display', fonts)).toBeNull();
  });

  it('switch a weight on or off within one to four, never off a weight a type setting or a design is at, and what they write is valid', () => {
    const name = 'studio', st = shipped(name), look = settingsOf(st);
    const strip = weightStrip(look, st.compositions, 'display', fonts)!;
    expect(strip.chosen).toEqual([300, 600, 700]);
    // 700 is the headline weight; designs set pieces at 300 and 600.
    expect(strip.locked).toEqual([300, 600, 700]);
    // Inter has 300 to 700, and only those are offered.
    expect(strip.offered).toEqual([300, 400, 500, 600, 700]);
    const four = toggleWeight(strip, 500);
    expect(four).toEqual([300, 500, 600, 700]);
    expect(toggleWeight({ ...strip, chosen: four }, 400)).toEqual(four);
    expect(toggleWeight(strip, 700)).toBe(strip.chosen);
    expect(toggleWeight({ ...strip, chosen: [700], locked: [] }, 700)).toEqual([700]);
    expect(toggleWeight(strip, 300)).toBe(strip.chosen);
    expect(toggleWeight(strip, 600)).toBe(strip.chosen);
    // A weight nothing uses comes off again.
    expect(toggleWeight({ ...strip, chosen: four }, 500)).toEqual([300, 600, 700]);
    expect(problems(name, setAt(look, 'fonts.display.weights', four))).toEqual([]);
  });
});
