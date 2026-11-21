// Another currency in the words of a post. The brand's money.foreign (Settings, Brand: the other currencies list, stored as one
// pattern) names the currencies the brand does not use; money.local says what its money is. The caption, each network's own
// caption and the text on the image are scanned with the engine's own function (design/lint.mjs foreignMoneyWarning), so a
// post a person wrote gets the same warning as one the AI drafted. It is a warning: a person decides.
import type { Post } from '@prisma/client';
import { brandInfo } from '../brand.js';
import { engineImport } from '../engine/root.js';
import { pipelineEngine } from '../engine/pipeline.js';
import { splitNetworks } from './post-model.js';

interface EngineLint {
  foreignMoneyWarning(where: string, text: string, brand: { money: { local: string; foreign: string } }): string | null;
  textFieldsOf(spec: unknown): Array<{ field: string; text: string }>;
}
interface EngineLayoutNorm { normalisePostDesign(design: unknown, layouts: unknown[]): unknown }

export async function currencyWarnings(post: Pick<Post, 'caption' | 'networks' | 'design'>): Promise<string[]> {
  const money = brandInfo().money;
  if (!money) return [];
  const [lint, layout, engine] = await Promise.all([engineImport<EngineLint>('design/lint'), engineImport<EngineLayoutNorm>('design/layout'), pipelineEngine()]);
  const brand = { money };
  const texts: Array<{ where: string; text: string }> = [{ where: 'caption', text: post.caption }];
  for (const [n, o] of Object.entries(splitNetworks(post.networks).overrides)) if (o.caption) texts.push({ where: `${n} caption`, text: o.caption });
  if (post.design && typeof post.design === 'object') {
    // A design the engine cannot read is reported by its own checks; there are no words to scan here.
    try {
      for (const f of lint.textFieldsOf(layout.normalisePostDesign(post.design, engine.loadLayouts({ root: engine.root })))) texts.push({ where: `image text (${f.field})`, text: f.text });
    } catch { /* see above */ }
  }
  return [...new Set(texts.flatMap((t) => lint.foreignMoneyWarning(t.where, t.text, brand) ?? []))];
}
