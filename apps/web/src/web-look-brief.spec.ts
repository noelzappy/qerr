// The post editor reads the kinds, designs and budgets of the active look (web/src/pages/batches/editor/look-brief.ts).
import { describe, expect, it } from 'vitest';
import { POST_LIMITS, type PostKindInfo } from '../web/src/pages/batches/design-model';
import { applyLookBrief, budgetsFor } from '../web/src/pages/batches/editor/look-brief';

const base = {
  direction: null as string | null, limits: POST_LIMITS, offered: null as string[] | null,
  kinds: [
    { kind: 'statement', fields: ['label', 'headline', 'sub'], required: ['headline'], variants: [] },
    { kind: 'figure', fields: ['headline', 'big', 'unit'], required: ['big'], variants: [] },
    { kind: 'list', fields: ['headline', 'items'], required: ['headline', 'items'], variants: [] },
  ] as PostKindInfo[],
};
const brief = {
  ref: 'own:mine', id: 'mine', name: 'Mine',
  kinds: {
    statement: { variants: [
      { index: 0, name: 'Stack', describe: 'Big stack', fields: { label: { required: false, max: 28 }, headline: { required: true, max: 65 }, sub: { required: false, max: 110 } }, accepts: [] },
      { index: 1, name: 'Mantra', describe: 'Echo', fields: { headline: { required: true, max: 60 }, sub: { required: false, max: 130 } }, accepts: [] },
    ] },
    list: { variants: [{ index: 0, name: 'Blocks', describe: '', fields: { headline: { required: true, max: 44 }, items: { required: true, max: 4, min: 2 } }, accepts: [] }] },
  },
};

describe('the post editor with a look', () => {
  it('changes nothing without a look', () => {
    expect(applyLookBrief(base, null)).toBe(base);
  });

  it('offers only the kinds the look has an enabled design for, and its designs by name', () => {
    const r = applyLookBrief(base, brief);
    expect(r.offered).toEqual(['statement', 'list']);
    expect(r.kinds.map((k) => k.kind)).toEqual(['statement', 'list']);
    expect(r.direction).toBe('mine');
    expect(r.kinds[0]!.variants.map((v) => [v.variant, v.name])).toEqual([[0, 'Stack'], [1, 'Mantra']]);
    expect(r.kinds[0]!.fields).toEqual(['label', 'headline', 'sub']);
    expect(r.kinds[1]!.required).toEqual(['headline', 'items']);
  });

  it('takes the budgets of the chosen design, or the most any design takes under Automatic', () => {
    const statement = applyLookBrief(base, brief).kinds[0]!;
    expect(budgetsFor(POST_LIMITS, statement, 0).headline).toBe(65);
    expect(budgetsFor(POST_LIMITS, statement, 1).headline).toBe(60);
    expect(budgetsFor(POST_LIMITS, statement, 1).sub).toBe(130);
    expect(budgetsFor(POST_LIMITS, statement, undefined).headline).toBe(65);
    expect(budgetsFor(POST_LIMITS, statement, undefined).sub).toBe(130);
    // text this design does not use keeps the engine's own limit
    expect(budgetsFor(POST_LIMITS, statement, 0).quote).toBe(POST_LIMITS.quote);
    const list = applyLookBrief(base, brief).kinds[1]!;
    expect(budgetsFor(POST_LIMITS, list, 0).items).toEqual({ min: 2, max: 4, chars: POST_LIMITS.items.chars });
    expect(budgetsFor(POST_LIMITS, undefined, 0)).toEqual(POST_LIMITS);
    expect(POST_LIMITS.headline).toBe(70);
  });
});
