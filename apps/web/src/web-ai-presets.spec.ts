// What the AI provider dialog fills in for you, and when a filled value follows a change and when it is left as a person typed it.
import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_MODELS, PROVIDER_ADDRESS, modelSummary, newProviderDraft, presetFor, pricesFromModel, withKind, withModel, type ProviderDraft,
} from '../web/src/lib/ai-presets';

const byId = (id: string) => ANTHROPIC_MODELS.find((p) => p.id === id)!;

describe('a new provider', () => {
  it('starts as Anthropic with its address, the recommended model and that model\'s prices', () => {
    expect(newProviderDraft()).toEqual({ kind: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', inputPrice: '2', outputPrice: '10' });
  });
  it('offers three Anthropic models with their prices', () => {
    expect(ANTHROPIC_MODELS.map((p) => [p.label, p.model, p.input, p.output])).toEqual([
      ['Recommended', 'claude-sonnet-5-5', 2, 10], ['Best quality', 'claude-opus-5-5', 4, 20], ['Faster, cheaper', 'claude-haiku-5-5', 0.1, 0.5],
    ]);
    expect(presetFor('anthropic', ' claude-opus-5-5 ')?.id).toBe('best');
    expect(presetFor('openai-compatible', 'claude-opus-5-5')).toBeNull();
  });
});

describe('choosing a model', () => {
  it('brings its prices while the prices are still the filled ones', () => {
    const d = withModel(newProviderDraft(), byId('best').model);
    expect([d.model, d.inputPrice, d.outputPrice]).toEqual(['claude-opus-5-5', '4', '20']);
    expect(pricesFromModel(d)).toBe(true);
    const c = withModel(d, byId('cheaper').model);
    expect([c.inputPrice, c.outputPrice]).toEqual(['0.1', '0.5']);
  });
  it('never overwrites prices a person typed', () => {
    const typed: ProviderDraft = { ...newProviderDraft(), inputPrice: '2.5', outputPrice: '11' };
    const d = withModel(typed, byId('best').model);
    expect([d.inputPrice, d.outputPrice]).toEqual(['2.5', '11']);
    expect(pricesFromModel(d)).toBe(false);
  });
  it('clears the filled prices for a model it does not know, and fills them again for one it does', () => {
    const d = withModel(newProviderDraft(), 'claude-sonnet-5-5-custom');
    expect([d.inputPrice, d.outputPrice]).toEqual(['', '']);
    expect(withModel(d, 'claude-haiku-5-5').inputPrice).toBe('0.1');
  });
});

describe('choosing a kind', () => {
  it('fills the service address and leaves the model to be typed for an OpenAI-compatible service', () => {
    const d = withKind(newProviderDraft(), 'openai-compatible');
    expect(d).toEqual({ kind: 'openai-compatible', baseUrl: PROVIDER_ADDRESS['openai-compatible'], model: '', inputPrice: '', outputPrice: '' });
    expect(withKind(d, 'anthropic')).toEqual(newProviderDraft());
  });
  it('keeps an address and a model a person typed', () => {
    const typed: ProviderDraft = { kind: 'openai-compatible', baseUrl: 'https://llm.example.com/v1', model: 'house-model', inputPrice: '1', outputPrice: '2' };
    const d = withKind(typed, 'anthropic');
    expect(d).toEqual({ ...typed, kind: 'anthropic' });
  });
  it('changes nothing when the kind is the same', () => {
    const d = newProviderDraft();
    expect(withKind(d, 'anthropic')).toBe(d);
  });
});

describe('the line under the model choice', () => {
  it('names the exact model and its prices', () => {
    expect(modelSummary(newProviderDraft())).toBe('claude-sonnet-5-5 · $2 in, $10 out per million tokens');
    expect(modelSummary(withModel(newProviderDraft(), 'claude-haiku-5-5'))).toBe('claude-haiku-5-5 · $0.10 in, $0.50 out per million tokens');
    expect(modelSummary({ ...newProviderDraft(), inputPrice: '', outputPrice: '' })).toMatch(/no prices/);
  });
});
