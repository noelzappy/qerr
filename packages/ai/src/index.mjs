// The AI interface of Qerr (see docs/ai.md).
//   createAI({ providers, search, budget, log, prices }) -> { draftBatch, research, rewrite, analyseReference, suggestBrandFromSite, describePicture, findOccasions, designBatch }
//   occasionsFor({ country, from, to }) -> the calendar's occasions in a window (no AI, no network)
import { draftBatch } from './draft.mjs';
import { research } from './research.mjs';
import { analyseReference } from './reference.mjs';
import { rewrite } from './rewrite.mjs';
import { describePicture, suggestBrandFromSite } from './suggest.mjs';
import { createRuntime } from './runtime.mjs';
import { findOccasions } from './find-occasions.mjs';
import { designBatch } from './design.mjs';

// Extra seams for tests and the app: fetch, pageTransport, sleep, lookup (DNS), now, root.
export function createAI({ providers, search, budget, log, prices, ...seams } = {}) {
  const rt = createRuntime({ providers, search, budget, log, prices, ...seams });
  return {
    draftBatch: (input) => draftBatch(rt, input),
    research: (input) => research(rt, input),
    rewrite: (input) => rewrite(rt, input),
    analyseReference: (input) => analyseReference(rt, input),
    suggestBrandFromSite: (input) => suggestBrandFromSite(rt, input),
    describePicture: (input) => describePicture(rt, input),
    findOccasions: (input) => findOccasions(rt, input),
    designBatch: (input) => designBatch(rt, input),
    spentUsd: () => rt.spentUsd(),
  };
}

export { AIError } from './errors.mjs';
export { complete, estimateCost, IMAGE_MEDIA_TYPES } from './providers.mjs';
export { referenceBrief, MAX_REFERENCE_BYTES } from './reference.mjs';
export { createSearch } from './search.mjs';
export { fetchPage, assertPublicUrl, isPrivateAddress } from './safe-fetch.mjs';
export { BRAND_SITE_SCHEMA, BRAND_SITE_LIMITS, PICTURE_SCHEMA, PICTURE_LIMITS, siteAddress } from './suggest.mjs';
export { VAULT_KINDS, RESEARCH_KINDS } from './vault.mjs';
export { occasionsFor, cleanOccasions, OCCASION_COUNTRIES, OCCASION_KINDS, OCCASION_LIMITS } from './occasions.mjs';
export { DESIGN_SCHEMA, designCatalogue } from './design.mjs';
