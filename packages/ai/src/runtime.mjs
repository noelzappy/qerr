// What every task shares: provider choice per task, the monthly budget, one log record per call, fetch and clock seams.
import { AIError, redact } from './errors.mjs';
import { complete } from './providers.mjs';
import { createSearch } from './search.mjs';
import { fetchPage } from './safe-fetch.mjs';

export const TASKS = ['draft', 'research', 'rewrite'];

export function createRuntime({ providers = [], search, budget, log, prices = {}, fetch, pageTransport, sleep, lookup, now = () => new Date(), root, timeoutMs } = {}) {
  const list = Array.isArray(providers) ? providers : [];
  const state = { spentUsd: Number(budget?.spentUsd) || 0 };
  const limit = budget?.monthlyLimitUsd;
  const secrets = [...list.map((p) => p?.apiKey), search?.apiKey].filter(Boolean);
  const searcher = search ? createSearch({ ...search, fetch, pageTransport, sleep, lookup, now }) : null;

  const emit = (rec) => {
    try { log?.({ at: now().toISOString(), ...rec }); } catch { /* a failing logger must not fail the task */ }
  };
  const guard = () => {
    if (Number.isFinite(limit) && state.spentUsd >= limit) {
      throw new AIError(`The monthly AI budget is used up (${state.spentUsd.toFixed(2)} of ${limit} USD). New calls are stopped until it is raised or the month turns.`, { code: 'budget' });
    }
  };
  const newMeter = () => ({ calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, costKnown: true, tokensKnown: true });
  const summarise = (m) => ({ calls: m.calls, inputTokens: m.tokensKnown ? m.inputTokens : null, outputTokens: m.tokensKnown ? m.outputTokens : null, costUsd: m.costKnown ? m.costUsd : null, cost: m.costKnown ? m.costUsd : 'unknown' });

  // `using` names the provider's task when it differs from the task logged (a reference analysis uses the draft provider).
  async function llm(task, { system, messages, schema, maxTokens, temperature, validate, using = task }, meter) {
    const provider = list.find((p) => p?.tasks?.includes(using));
    if (!provider) throw new AIError(`No AI provider is set up for the "${using}" task`, { code: 'config' });
    guard();
    try {
      return await complete({
        provider, system, messages, schema, maxTokens, temperature: temperature ?? provider.temperature, validate, task, prices: { ...(provider.prices ?? {}), ...prices }, fetch, sleep, timeoutMs,
        onCall: (r) => {
          if (r.ok) {
            if (meter) {
              meter.calls++;
              if (r.tokensIn === null || r.tokensOut === null) meter.tokensKnown = false; else { meter.inputTokens += r.tokensIn; meter.outputTokens += r.tokensOut; }
              if (r.costUsd === null) meter.costKnown = false; else meter.costUsd += r.costUsd;
            }
            if (r.costUsd !== null) state.spentUsd += r.costUsd;
          }
          emit({ kind: 'llm', provider: r.provider, model: r.model, task: r.task, tokensIn: r.tokensIn, tokensOut: r.tokensOut, cost: r.costUsd === null ? 'unknown' : r.costUsd, ms: r.ms, ok: r.ok, ...(r.error ? { error: r.error } : {}) });
        },
      });
    } catch (e) {
      if (e instanceof AIError) { e.message = redact(e.message, secrets); throw e; }
      throw new AIError(redact(e?.message, secrets), { code: 'error' });
    }
  }

  async function web(task, fn, label) {
    if (!searcher) throw new AIError('No search provider is set up', { code: 'config' });
    guard();
    const t0 = Date.now();
    try {
      const out = await fn(searcher);
      emit({ kind: label, provider: searcher.kind, model: null, task, tokensIn: null, tokensOut: null, cost: 'unknown', ms: Date.now() - t0, ok: true });
      return out;
    } catch (e) {
      emit({ kind: label, provider: searcher.kind, model: null, task, tokensIn: null, tokensOut: null, cost: 'unknown', ms: Date.now() - t0, ok: false, error: redact(e?.message, secrets) });
      throw e;
    }
  }

  return {
    llm, newMeter, summarise, now, root,
    searchWeb: (task, query, opts) => web(task, (s) => s.search(query, opts), 'search'),
    // Page reads are not logged one by one as paid calls (they cost nothing), only as "fetch".
    readPage: async (url) => {
      if (!searcher) throw new AIError('No search provider is set up', { code: 'config' });
      const t0 = Date.now();
      try { const p = await searcher.fetchPage(url); emit({ kind: 'fetch', provider: null, model: null, task: 'research', tokensIn: null, tokensOut: null, cost: 0, ms: Date.now() - t0, ok: true }); return p; }
      catch (e) { emit({ kind: 'fetch', provider: null, model: null, task: 'research', tokensIn: null, tokensOut: null, cost: 0, ms: Date.now() - t0, ok: false, error: redact(e?.message, secrets) }); throw e; }
    },
    // A page named by a person (a brand's own website), read through the same safe reader as research pages: public http(s)
    // only, every redirect checked again, the connection pinned to the checked address, size and time capped. It needs no search
    // provider. The budget is checked first, since the page is only read to be sent to a model. Logged as a "fetch".
    readSite: async (task, url, opts = {}) => {
      guard();
      const t0 = Date.now();
      try {
        const p = await fetchPage(url, { transport: pageTransport, lookup, keepHtml: true, ...opts });
        emit({ kind: 'fetch', provider: null, model: null, task, tokensIn: null, tokensOut: null, cost: 0, ms: Date.now() - t0, ok: true });
        return p;
      } catch (e) {
        emit({ kind: 'fetch', provider: null, model: null, task, tokensIn: null, tokensOut: null, cost: 0, ms: Date.now() - t0, ok: false, error: redact(e?.message, secrets) });
        throw e;
      }
    },
    spentUsd: () => state.spentUsd,
    hasSearch: Boolean(searcher),
  };
}
