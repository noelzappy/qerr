// The seam to the @vesk/ai workspace package: the types the app uses and loadAI(), which the specs replace with a fake.
// Nothing else in the app imports the package directly.
import { aiImport } from './engine/root.js';

export interface AiProviderInput {
  id: string; kind: 'anthropic' | 'openai-compatible'; baseUrl: string; model: string; apiKey: string; tasks: string[];
  // USD per million tokens, keyed by model name; without it the library reports a call's cost as unknown.
  prices?: Record<string, { inputPerMTok: number; outputPerMTok: number }>;
}
export interface AiSearchInput { kind: 'brave' | 'tavily' | 'exa'; apiKey: string }

export interface CreateAiOptions {
  providers: AiProviderInput[];
  search?: AiSearchInput | null;
  budget?: { monthlyLimitUsd: number; spentUsd: number };
  log?: (record: Record<string, unknown>) => void;
}

export type AiProgress = { step: string; done?: number; total?: number };
export interface DraftBatchInput { vault: unknown[]; series: unknown; period: unknown; count: number; channels: string[]; brand: unknown; timezone: string; recurring?: unknown[]; onProgress?: (p: AiProgress) => void }
// notes: what the drafter reports (prompt version, model, usage, rejected posts, repairs, image suggestions, messages).
export interface DraftBatchResult { batch: Record<string, unknown>; notes?: Record<string, unknown> }
export interface ResearchInput { topics: string[]; vault: unknown[]; since?: string; onProgress?: (p: AiProgress) => void }
export interface ResearchResult {
  items: Array<{ kind: string; title: string; body: string; sourceUrls: string[]; foundAt: string }>;
  checks: Array<{ vaultItemId: string; verdict: string; sourceUrls: string[]; note: string }>;
  // What the library searched, read, skipped and dropped (topics, dropped, windowStart, model). Absent in test fakes.
  notes?: Record<string, unknown>;
}
export interface AnalyseReferenceInput { image: { mediaType: string; data: Buffer }; note?: string | null }
export interface AnalyseReferenceResult { analysis: Record<string, unknown>; brief: string; notes?: Record<string, unknown> }
// Suggestions a person reviews; nothing is saved by the library (src/suggest.mjs in @vesk/ai).
export interface SuggestBrandFromSiteInput { website: string }
export interface BrandSiteSuggestion { descriptor?: string; tagline?: string; voice?: string; visualDirection?: string; colours?: { primary?: string; accent?: string } }
export interface SuggestBrandFromSiteResult { suggestion: BrandSiteSuggestion; source?: { url: string; title: string | null }; notes?: Record<string, unknown> }
export interface DescribePictureInput { image: { mediaType: string; data: Buffer }; hints?: { title?: string; fileName?: string; role?: string } }
export interface PictureSuggestion { title?: string; description: string; tags?: string[]; peopleVisible: boolean }
export interface DescribePictureResult { suggestion: PictureSuggestion; notes?: Record<string, unknown> }
export interface RewriteInput { post: Record<string, unknown>; instruction: string; vault: unknown[]; series?: unknown[] }

export interface AI {
  draftBatch(input: DraftBatchInput): Promise<DraftBatchResult>;
  research(input: ResearchInput): Promise<ResearchResult>;
  rewrite(input: RewriteInput): Promise<Record<string, unknown>>;
  analyseReference(input: AnalyseReferenceInput): Promise<AnalyseReferenceResult>;
  suggestBrandFromSite(input: SuggestBrandFromSiteInput): Promise<SuggestBrandFromSiteResult>;
  describePicture(input: DescribePictureInput): Promise<DescribePictureResult>;
}

export interface AiModule {
  createAI(options: CreateAiOptions): AI;
}

export async function loadAI(): Promise<AiModule> {
  const { createAI } = await aiImport<AiModule>();
  return { createAI };
}
