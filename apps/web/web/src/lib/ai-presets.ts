// What the AI provider dialog fills in for you: the service address that goes with a kind of provider, a short choice of models for a provider
// we know (with the exact id and prices behind it), and the rules for when a filled value follows a change and when it is left alone. A value
// follows only while it is still the one the panel filled (or empty); once a person types their own, it stays theirs. Pure, so it is specced
// without a browser (src/web-ai-presets.spec.ts). The server checks every value as before (services/ai-settings.ts).

export type ProviderKind = 'anthropic' | 'openai-compatible';

// The address each kind starts with. Anthropic's is the one the server uses when none is given.
export const PROVIDER_ADDRESS: Record<ProviderKind, string> = {
  anthropic: 'https://api.anthropic.com',
  'openai-compatible': 'https://api.openai.com/v1',
};

export interface ModelPreset { id: 'recommended' | 'best' | 'cheaper'; label: string; model: string; input: number; output: number }

// The models offered as a choice for Anthropic, with their prices in US dollars per million tokens (input, output).
export const ANTHROPIC_MODELS: readonly ModelPreset[] = [
  { id: 'recommended', label: 'Recommended', model: 'claude-sonnet-5-5', input: 2, output: 10 },
  { id: 'best', label: 'Best quality', model: 'claude-opus-5-5', input: 4, output: 20 },
  { id: 'cheaper', label: 'Faster, cheaper', model: 'claude-haiku-5-5', input: 0.1, output: 0.5 },
];

export const modelPresets = (kind: ProviderKind): readonly ModelPreset[] => (kind === 'anthropic' ? ANTHROPIC_MODELS : []);
export const presetFor = (kind: ProviderKind, model: string): ModelPreset | null => modelPresets(kind).find((p) => p.model === model.trim()) ?? null;

// The part of the dialog these rules look after. Prices are the text in the boxes.
export interface ProviderDraft { kind: ProviderKind; baseUrl: string; model: string; inputPrice: string; outputPrice: string }

const priceText = (n: number) => String(n);

// The address is the panel's while it is empty or one of the kinds' own addresses.
export const addressIsDefault = (address: string): boolean => address.trim() === '' || Object.values(PROVIDER_ADDRESS).includes(address.trim().replace(/\/+$/, ''));
// The model is the panel's while it is empty or one of the kind's choices.
export const modelIsPreset = (kind: ProviderKind, model: string): boolean => model.trim() === '' || !!presetFor(kind, model);
// The prices are the panel's while both are empty or both are the known prices of the model.
export function pricesAreDefault(d: Pick<ProviderDraft, 'kind' | 'model' | 'inputPrice' | 'outputPrice'>): boolean {
  const i = d.inputPrice.trim(), o = d.outputPrice.trim();
  if (i === '' && o === '') return true;
  const p = presetFor(d.kind, d.model);
  return !!p && Number(i) === p.input && Number(o) === p.output;
}
// Whether the prices shown are the model's known ones (for the "From the model" tag).
export const pricesFromModel = (d: ProviderDraft): boolean => !!presetFor(d.kind, d.model) && d.inputPrice.trim() !== '' && pricesAreDefault(d);

// A new provider: Anthropic, its address, the recommended model and its prices.
export function newProviderDraft(): ProviderDraft {
  const p = ANTHROPIC_MODELS[0]!;
  return { kind: 'anthropic', baseUrl: PROVIDER_ADDRESS.anthropic, model: p.model, inputPrice: priceText(p.input), outputPrice: priceText(p.output) };
}

// The prices that go with `model` when they follow, else the ones there.
function followPrices(prev: ProviderDraft, kind: ProviderKind, model: string): Pick<ProviderDraft, 'inputPrice' | 'outputPrice'> {
  if (!pricesAreDefault(prev)) return { inputPrice: prev.inputPrice, outputPrice: prev.outputPrice };
  const p = presetFor(kind, model);
  return p ? { inputPrice: priceText(p.input), outputPrice: priceText(p.output) } : { inputPrice: '', outputPrice: '' };
}

// Another kind chosen: the address, the model and the prices follow where they are still the panel's.
export function withKind(prev: ProviderDraft, kind: ProviderKind): ProviderDraft {
  if (kind === prev.kind) return prev;
  const baseUrl = addressIsDefault(prev.baseUrl) ? PROVIDER_ADDRESS[kind] : prev.baseUrl;
  const model = modelIsPreset(prev.kind, prev.model) ? (modelPresets(kind)[0]?.model ?? '') : prev.model;
  return { kind, baseUrl, model, ...followPrices(prev, kind, model) };
}

// Another model chosen or typed: the prices follow where they are still the panel's.
export function withModel(prev: ProviderDraft, model: string): ProviderDraft {
  return { ...prev, model, ...followPrices(prev, prev.kind, model) };
}

// "claude-sonnet-5-5 · $2 in, $10 out per million tokens", for the line under the model choice.
const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
export function modelSummary(d: ProviderDraft): string {
  const i = d.inputPrice.trim(), o = d.outputPrice.trim();
  const prices = i && o && Number.isFinite(Number(i)) && Number.isFinite(Number(o)) ? `${usd(Number(i))} in, ${usd(Number(o))} out per million tokens` : 'no prices, so the budget cannot count its calls';
  return [d.model.trim() || 'no model yet', prices].join(' · ');
}

// The monthly budget's presets, in US dollars, for Settings, AI and the guided setup alike (one PresetNumber), and the one the setup starts on.
export const BUDGET_PRESETS: readonly number[] = [5, 10, 25, 50, 100];
export const DEFAULT_BUDGET = 25;
