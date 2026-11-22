// The choice-based Settings tab of a look (web/src/pages/settings/looks/settings/): presets over both shipped looks, which group holds
// every catalogue value, the weights a look needs, and which group a server problem belongs to. Pure logic, no database.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { getAt } from '../web/src/pages/settings/looks/look-model';
import { assignNodes, changedCount, changedPaths, GROUPS, groupOfPath, resetNodes, type GroupId } from '../web/src/pages/settings/looks/settings/groups';
import { CONTROLS, choose, detect, hasGrain, pairingsFor, setGrain, type PresetCtx } from '../web/src/pages/settings/looks/settings/presets';
import { neededWeights, snapWeight, syncWeights } from '../web/src/pages/settings/looks/settings/weights';
import type { Desc, FontFamilyInfo, Json, LookCatalogue } from '../web/src/pages/settings/looks/look-types';

const engine = await import('@vesk/engine/design/look' as string) as { lookCatalogue(): LookCatalogue };
const cat = engine.lookCatalogue();
const dir = path.join(path.dirname(createRequire(import.meta.url).resolve('@vesk/engine/package.json')), 'lib', 'design', 'looks');
const shipped = (n: string): Json & { compositions: Json[] } => JSON.parse(fs.readFileSync(path.join(dir, `${n}.look.json`), 'utf8'));
const library = JSON.parse(fs.readFileSync(path.join(path.dirname(createRequire(import.meta.url).resolve('@vesk/engine/package.json')), 'design', 'fonts', 'library.json'), 'utf8')) as Array<{ family: string; axes: Record<string, number[]>; files: Array<{ style: string }> }>;
const fonts: FontFamilyInfo[] = library.map((f) => ({ family: f.family, minWeight: f.axes.wght?.[0] ?? 400, maxWeight: f.axes.wght?.[1] ?? 400, italic: f.files.some((x) => x.style === 'italic'), stretch: !!f.axes.wdth }));

const settingsOf = (l: Json): Json => { const { compositions: _c, ...rest } = l; return JSON.parse(JSON.stringify(rest)); };
const NAMES = ['retail', 'swiss'];
const ctxFor = (name: string, ownFonts = true): PresetCtx => ({ sections: cat.sections, fonts, baseline: settingsOf(shipped(name)), ownFonts });
// The values at the paths a control owns (a path covers what is under it).
const under = (look: Json, owns: string[]) => Object.fromEntries(owns.map((p) => [p, JSON.stringify(getAt(look, p) ?? null)]));
const flat = (v: unknown, p: string, into: Record<string, string>) => { if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) flat(x, p ? `${p}.${k}` : k, into); else into[p] = JSON.stringify(v); return into; };
const diff = (a: Json, b: Json) => { const x = flat(a, '', {}), y = flat(b, '', {}); return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => x[k] !== y[k]); };
const covered = (owns: string[], p: string) => owns.some((o) => p === o || p.startsWith(`${o}.`) || p.startsWith(`${o}[`));

describe('presets on the shipped looks', () => {
  for (const name of NAMES) {
    const look = settingsOf(shipped(name));
    const ctx = ctxFor(name);
    for (const [id, control] of Object.entries(CONTROLS)) {
      it(`${name}: ${id} detects, applies the same choice unchanged, and another changes only what it owns`, () => {
        const options = control.options(ctx, look);
        if (!options.length) return;
        const now = detect(id, look, ctx);
        if (now) expect(JSON.stringify(choose(id, now, look, ctx))).toBe(JSON.stringify(look));
        for (const o of options) {
          const next = choose(id, o.id, look, ctx);
          for (const p of diff(look, next)) expect(covered(control.owns, p), `${id}/${o.id} wrote ${p}`).toBe(true);
          // What was written is now what the control detects, and choosing it again changes nothing.
          expect(detect(id, next, ctx), `${id}/${o.id}`).toBe(o.id);
          expect(JSON.stringify(choose(id, o.id, next, ctx))).toBe(JSON.stringify(next));
          expect(under(next, control.owns)).toBeDefined();
        }
      });
    }
  }

  it('knows the shipped looks: Retail is Archivo, heavy, tight-ish and one field; Swiss is Hanken with mono labels', () => {
    const r = settingsOf(shipped('retail')), s = settingsOf(shipped('swiss'));
    expect(detect('pairing', r, ctxFor('retail'))).toBe('archivo');
    expect(detect('pairing', s, ctxFor('swiss'))).toBe('hanken-mono');
    expect(detect('weight', r, ctxFor('retail'))).toBe('heavy');
    expect(detect('weight', s, ctxFor('swiss'))).toBe('heavy');
    expect(detect('logic', r, ctxFor('retail'))).toBe('field');
    expect(detect('logic', s, ctxFor('swiss'))).toBe('one-accent');
    expect(detect('treat', r, ctxFor('retail'))).toBe('punchy');
    expect(detect('treat', s, ctxFor('swiss'))).toBe('grey');
    expect(detect('space', r, ctxFor('retail'))).toBe('standard');
  });

  it('shows Custom (null) when the values fit no option, and never snaps them', () => {
    const look = settingsOf(shipped('retail'));
    const odd = JSON.parse(JSON.stringify(look)) as Json;
    (odd.type as Json & { display: Json }).display.track = -0.0451; (odd.type as Json & { display: Json }).display.lead = 1.1;
    (odd.canvas as { feed: { margin: Json } }).feed.margin.top = 61;
    (odd.photo as Json).treat = ['grey', 'punch'];
    (odd.fonts as { display: Json }).display.family = 'Not a font';
    const ctx = ctxFor('retail');
    expect(detect('spacing', odd, ctx)).toBeNull();
    expect(detect('space', odd, ctx)).toBeNull();
    expect(detect('treat', odd, ctx)).toBeNull();
    expect(detect('pairing', odd, ctx)).toBeNull();
    expect(getAt(odd, 'canvas.feed.margin.top')).toBe(61);
  });

  it('offers only pairings the font library has, and our own font only when the brand has one', () => {
    const only = fonts.filter((f) => f.family !== 'Fraunces');
    expect(pairingsFor(only).some((p) => p.display === 'Fraunces')).toBe(false);
    expect(pairingsFor(fonts).length).toBeGreaterThanOrEqual(5);
    const look = settingsOf(shipped('swiss'));
    expect(CONTROLS.pairing!.options(ctxFor('swiss', false), look).some((o) => o.id === 'own')).toBe(false);
    const own = choose('pairing', 'own', look, ctxFor('swiss', true));
    expect(getAt(own, 'fonts.text')).toEqual({ source: 'brand', role: 'sans' });
    expect(detect('pairing', own, ctxFor('swiss'))).toBe('own');
  });

  it('offers a heavy weight only where the headline font has one', () => {
    const look = settingsOf(shipped('swiss'));
    const serif = choose('pairing', 'source-hanken', look, ctxFor('swiss'));
    expect(getAt(serif, 'fonts.display')).toMatchObject({ family: 'Source Serif 4' });
    expect(CONTROLS.weight!.options(ctxFor('swiss'), serif).map((o) => o.id)).toEqual(['regular', 'bold']);
    expect(getAt(choose('weight', 'bold', serif, ctxFor('swiss')), 'type.display.weight')).toBe(600);
  });

  it('writes the grain switch beside the treatment, in the catalogue order', () => {
    const look = settingsOf(shipped('retail'));
    const ctx = ctxFor('retail');
    const g = setGrain(look, ctx, true);
    expect(getAt(g, 'photo.treat')).toEqual(['grain', 'punch']);
    expect(hasGrain(g)).toBe(true);
    expect(getAt(choose('treat', 'grey', g, ctx), 'photo.treat')).toEqual(['grey', 'grain']);
    expect(detect('treat', g, ctx)).toBe('punchy');
  });
});

describe('every catalogue value is in exactly one group', () => {
  const assignment = assignNodes(cat.sections);
  // Every value the catalogue can hold: a leaf, a list, a tuple or a font (a tagged value is one control).
  const leaves: string[] = [];
  const walk = (p: string, d: Desc) => {
    if (d.kind === 'object') for (const [k, v] of Object.entries(d.props ?? {})) walk(p ? `${p}.${k}` : k, v); else leaves.push(p);
  };
  for (const [k, d] of Object.entries(cat.sections)) walk(k, d);

  it('places each leaf under exactly one node of exactly one group', () => {
    expect(leaves.length).toBeGreaterThan(60);
    for (const leaf of leaves) {
      const hits = (Object.entries(assignment) as Array<[GroupId, string[]]>).flatMap(([g, nodes]) => nodes.filter((n) => covered([n], leaf)).map((n) => `${g}:${n}`));
      expect(hits, leaf).toHaveLength(1);
    }
  });
  it('never lists a node inside another listed node', () => {
    const all = Object.values(assignment).flat();
    for (const a of all) for (const b of all) if (a !== b) expect(b.startsWith(`${a}.`), `${b} in ${a}`).toBe(false);
    expect(new Set(all).size).toBe(all.length);
  });
  it('gives Details no choice control, only what the other groups leave', () => {
    expect(GROUPS.find((g) => g.id === 'details')!.controls).toEqual([]);
    for (const p of ['devices', 'canvas.feed.grid.rows', 'canvas.feed.grid.head', 'canvas.feed.extraLines']) expect(assignment.details).toContain(p);
    expect(assignment.space).toEqual(['canvas.feed.margin', 'canvas.feed.grid.cols', 'canvas.feed.grid.gutter']);
    expect(assignment.typeface).toContain('fonts.display');
  });
  it('has every path a choice owns inside its own group', () => {
    for (const g of GROUPS) for (const c of g.controls) for (const p of CONTROLS[c]!.owns) {
      // A pairing also brings a type weight inside the new family's range, which another group draws.
      if (g.id === 'typeface' && p.startsWith('type.') && !p.startsWith('type.label')) continue;
      expect(assignment[g.id].some((n) => covered([n], p)), `${g.id}/${c}/${p}`).toBe(true);
    }
  });
  it('puts a setting the engine adds into Details', () => {
    const more = { ...cat.sections, wild: { kind: 'object', props: { x: { kind: 'number', min: 0, max: 1 } } } as Desc };
    expect(assignNodes(more).details).toContain('wild');
  });
});

describe('what changed from the original, and reset', () => {
  const base = settingsOf(shipped('retail'));
  const a = assignNodes(cat.sections);
  it('counts the values that differ in a group and puts them back', () => {
    const ctx = ctxFor('retail');
    const next = choose('space', 'airy', base, ctx);
    expect(changedCount(next, base, a.space)).toBe(5);
    expect(changedCount(next, base, a.typeface)).toBe(0);
    expect(changedPaths(next, base, a.space)).toContain('canvas.feed.grid.gutter');
    expect(JSON.stringify(resetNodes(next, base, a.space))).toBe(JSON.stringify(base));
  });
});

describe('the weights a look needs', () => {
  for (const name of NAMES) {
    it(`${name}: the shipped weights already hold what its type settings and designs need, so syncing changes nothing`, () => {
      const l = shipped(name);
      const look = settingsOf(l);
      const used = neededWeights(look, l.compositions);
      expect(used.display?.length).toBeGreaterThan(0);
      expect(JSON.stringify(syncWeights(look, l.compositions, fonts))).toBe(JSON.stringify(look));
    });
  }
  it('adds the weight a heavier headline needs, snapped into the family, and keeps the others while there is room', () => {
    const l = shipped('swiss');
    const look = settingsOf(l);
    const heavier = choose('weight', 'regular', look, ctxFor('swiss'));
    const synced = syncWeights(heavier, l.compositions, fonts);
    expect(getAt(synced, 'fonts.display.weights')).toEqual([400, 700, 800]);
    expect(syncWeights(synced, l.compositions, fonts)).toBe(synced);
  });
  it('moves with the weight dial and never lists more than four', () => {
    const look = { ...settingsOf(shipped('swiss')), dials: { tilt: 1, density: 0, weightShift: 100 } };
    const used = neededWeights(look, []);
    expect(used.display).toContain(900);
    const many = syncWeights({ ...look, fonts: { ...(look.fonts as Json), text: { source: 'library', family: 'Hanken Grotesk', weights: [400, 500, 600, 700] } } } as Json, [], fonts);
    expect((getAt(many, 'fonts.text.weights') as number[]).length).toBeLessThanOrEqual(4);
    expect(snapWeight(900, { minWeight: 400, maxWeight: 600 })).toBe(600);
  });
});

describe('which group a problem belongs to', () => {
  const a = assignNodes(cat.sections);
  it('maps the server\'s paths, with or without its lead-in, to the group whose Fine-tune holds the value', () => {
    expect(groupOfPath('fonts.display.weights[1]', a)).toBe('typeface');
    expect(groupOfPath('look "retail": type.display.lead', a)).toBe('voice');
    expect(groupOfPath('type.label.size', a)).toBe('typeface');
    expect(groupOfPath('dials.tilt', a)).toBe('feel');
    expect(groupOfPath('colour.grounds', a)).toBe('colour');
    expect(groupOfPath('canvas.feed.margin.top', a)).toBe('space');
    expect(groupOfPath('canvas.feed.grid.rows', a)).toBe('details');
    expect(groupOfPath('devices.angles.sticker', a)).toBe('details');
    expect(groupOfPath('photo.treat', a)).toBe('pictures');
    expect(groupOfPath('logo.height', a)).toBe('logo');
    expect(groupOfPath('somewhere.unknown', a)).toBe('details');
  });
});
