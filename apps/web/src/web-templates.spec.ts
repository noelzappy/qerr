// The post editor's layout list (web/src/pages/batches/labels.ts) must offer exactly what the design engine accepts in a batch.
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../web/src/pages/batches/labels';
import { engineImport } from './server/engine/root.js';

describe('the layout list', () => {
  it('names every template the engine accepts in a batch, and nothing else', async () => {
    const { TEMPLATE_FNS } = await import('../../../packages/engine/lib/design/builtin-layouts.mjs' as string) as { TEMPLATE_FNS: Record<string, unknown> };
    const engine = [...Object.keys(TEMPLATE_FNS).filter((t) => t !== 'pagecover'), 'carousel'].sort();
    expect(TEMPLATES.map((t) => t.value).sort()).toEqual(engine);
    const { designBlockProblems } = await engineImport<{ designBlockProblems(d: unknown): string[] }>('design-render');
    expect(designBlockProblems({ template: 'pagecover', kind: 'profile' }).some((e) => /page-cover/.test(e))).toBe(true);
  });
});
