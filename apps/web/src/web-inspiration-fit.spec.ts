// "Find the closest look": an honest suggestion from the stored analysis, or none (web/src/pages/settings/looks/inspiration-fit.ts).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { closestLook, lookTraits, referenceTraits } from '../web/src/pages/settings/looks/inspiration-fit';
import type { DesignReference } from '../web/src/pages/settings/brand-types';

const dir = path.join(path.dirname(createRequire(import.meta.url).resolve('@qerr/engine/package.json')), 'testlib', 'looks');
const sample = (n: string) => JSON.parse(fs.readFileSync(path.join(dir, `${n}.sample.json`), 'utf8'));
const looks = ['retail', 'swiss'].map((n) => ({ ref: `shipped:${n}`, name: n, traits: lookTraits(sample(n)) }));
const analysis = (over: Partial<NonNullable<DesignReference['analysis']>>): DesignReference['analysis'] => ({ summary: '', palette: [], typography: '', layout: '', imagery: '', mood: '', avoid: '', ...over });

describe('the traits of the shipped looks', () => {
  it('tell retail from swiss', () => {
    expect(looks[0]!.traits).toMatchObject({ heavy: true, framed: true, mono: false });
    expect(looks[1]!.traits).toMatchObject({ heavy: false, mono: true, framed: false });
  });
});

describe('the closest look', () => {
  it('suggests retail for loud, heavy, framed pictures and says why', () => {
    const a = analysis({ typography: 'Heavy black sans-serif headlines in capitals', layout: 'Full-bleed photo in a thick frame with a round sticker', proposal: { colours: {}, display: { case: 'upper', weight: 900 }, label: { case: 'upper' }, accent: 'colour', surface: 'flat', decoration: { kind: 'none' }, photo: { treatment: 'none' } } });
    const r = closestLook(referenceTraits(a), looks);
    expect(r?.ref).toBe('shipped:retail');
    expect(r?.reasons).toEqual(expect.arrayContaining(['heavy type', 'frames and stickers']));
  });

  it('suggests swiss for light type on a strict grid with monospaced labels', () => {
    const a = analysis({ typography: 'Light grotesque sans-serif with small monospace labels', layout: 'A strict twelve column grid, systematic, no frames' });
    const r = closestLook(referenceTraits(a), looks);
    expect(r?.ref).toBe('shipped:swiss');
  });

  it('says it cannot tell when the stored analysis settles fewer than two traits, or no look is clearly closer', () => {
    expect(closestLook(referenceTraits(null), looks)).toBeNull();
    expect(closestLook(referenceTraits(analysis({ typography: 'Heavy type' })), looks)).toBeNull();
    expect(closestLook({ heavy: true, mono: true }, [{ ref: 'a', name: 'a', traits: { heavy: true, mono: false } }, { ref: 'b', name: 'b', traits: { heavy: false, mono: true } }])).toBeNull();
    expect(closestLook({ heavy: true, caps: true }, [])).toBeNull();
  });
});
