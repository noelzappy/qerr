// The AI interface of Vesk (see docs/ai.md).
//   createAI({ providers, search, budget, log, prices }) -> { draftBatch, research, rewrite, analyseReference }
import { draftBatch } from './draft.mjs';
import { research } from './research.mjs';
import { analyseReference } from './reference.mjs';
import { rewrite } from './rewrite.mjs';
import { createRuntime } from './runtime.mjs';

// Extra seams for tests and the app: fetch, pageTransport, sleep, lookup (DNS), now, root.
export function createAI({ providers, search, budget, log, prices, ...seams } = {}) {
  const rt = createRuntime({ providers, search, budget, log, prices, ...seams });
  return {
    draftBatch: (input) => draftBatch(rt, input),
    research: (input) => research(rt, input),
    rewrite: (input) => rewrite(rt, input),
    analyseReference: (input) => analyseReference(rt, input),
    spentUsd: () => rt.spentUsd(),
  };
}

export { AIError } from './errors.mjs';
export { complete, estimateCost, IMAGE_MEDIA_TYPES } from './providers.mjs';
export { referenceBrief, MAX_REFERENCE_BYTES } from './reference.mjs';
export { createSearch } from './search.mjs';
export { fetchPage, assertPublicUrl, isPrivateAddress } from './safe-fetch.mjs';
export { VAULT_KINDS, RESEARCH_KINDS } from './vault.mjs';
