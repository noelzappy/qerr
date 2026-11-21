// Web search behind one interface: search(query, { count, since }) -> [{ title, url, snippet, publishedAt }].
// Docs read on 20 November 2026:
//   Brave   https://api-dashboard.search.brave.com/app/documentation/web-search/get-started
//           GET https://api.search.brave.com/res/v1/web/search?q=&count=(max 20)&freshness=, header X-Subscription-Token,
//           results in web.results[] with title, url, description. `page_age` / `age` are NOT in the docs page read; used when present.
//   Tavily  https://docs.tavily.com/documentation/api-reference/endpoint/search
//           POST https://api.tavily.com/search, header Authorization: Bearer <key> (the page documents no api_key body field),
//           body query, max_results (0-20), topic, start_date; results[] with title, url, content, published_date (news / when requested).
//   Exa     https://docs.exa.ai/reference/search
//           POST https://api.exa.ai/search, header x-api-key (Authorization: Bearer also works), body query, numResults,
//           startPublishedDate, contents; results[] with title, url, publishedDate, text, highlights, summary.
//           The exact `contents.text.maxCharacters` shape was not confirmed from the page text read.
import { AIError } from './errors.mjs';
import { describeError, request } from './http.mjs';
import { fetchPage } from './safe-fetch.mjs';

export const SEARCH_KINDS = ['brave', 'tavily', 'exa'];

const clip = (s, n) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const isoDate = (v) => {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const httpUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

export function normaliseBrave(json) {
  return (json?.web?.results ?? []).filter((r) => httpUrl(r.url)).map((r) => ({
    title: clip(r.title, 200), url: r.url, snippet: clip([r.description, ...(r.extra_snippets ?? [])].filter(Boolean).join(' '), 600), publishedAt: isoDate(r.page_age) ?? isoDate(r.age),
  }));
}
export function normaliseTavily(json) {
  return (json?.results ?? []).filter((r) => httpUrl(r.url)).map((r) => ({
    title: clip(r.title, 200), url: r.url, snippet: clip(r.content, 600), publishedAt: isoDate(r.published_date),
  }));
}
export function normaliseExa(json) {
  return (json?.results ?? []).filter((r) => httpUrl(r.url)).map((r) => ({
    title: clip(r.title, 200), url: r.url, snippet: clip((Array.isArray(r.highlights) && r.highlights.join(' ')) || r.summary || r.text, 600), publishedAt: isoDate(r.publishedDate),
  }));
}

const dayOf = (since) => (since ? String(since).slice(0, 10) : null);

export function createSearch({ kind, apiKey, fetch, pageTransport, timeoutMs = 30000, maxRetries = 2, sleep, lookup, now = () => new Date() } = {}) {
  if (!SEARCH_KINDS.includes(kind)) throw new AIError(`Search provider must be one of ${SEARCH_KINDS.join(', ')}`, { code: 'config' });
  if (!apiKey) throw new AIError('The search provider has no apiKey', { code: 'config' });
  const common = { fetch, timeoutMs, maxRetries, sleep, secrets: [apiKey] };

  async function search(query, { count = 5, since } = {}) {
    const q = String(query ?? '').trim().slice(0, 300);
    if (!q) throw new AIError('Empty search query', { code: 'config' });
    const n = Math.max(1, Math.min(10, count));
    const from = dayOf(since);
    let res, normalise;
    if (kind === 'brave') {
      const p = new URLSearchParams({ q, count: String(n) });
      if (from) p.set('freshness', `${from}to${now().toISOString().slice(0, 10)}`);
      res = await request(`https://api.search.brave.com/res/v1/web/search?${p}`, { ...common, headers: { accept: 'application/json', 'x-subscription-token': apiKey } });
      normalise = normaliseBrave;
    } else if (kind === 'tavily') {
      const body = { query: q, max_results: n, topic: 'general', include_published_date: true };
      if (from) body.start_date = from;
      res = await request('https://api.tavily.com/search', { ...common, method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
      normalise = normaliseTavily;
    } else {
      const body = { query: q, numResults: n, contents: { text: { maxCharacters: 1200 } } };
      if (from) body.startPublishedDate = `${from}T00:00:00.000Z`;
      res = await request('https://api.exa.ai/search', { ...common, method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify(body) });
      normalise = normaliseExa;
    }
    if (!res.ok) throw new AIError(`${kind} search answered ${res.status}: ${describeError(res, [apiKey])}`, { code: 'http', status: res.status });
    if (res.json === undefined) throw new AIError(`${kind} search returned something that is not JSON`, { code: 'http' });
    return normalise(res.json).slice(0, n);
  }

  return { kind, search, // Pages are read through the pinned node transport unless a test or the app passes its own `pageTransport`.
    fetchPage: (url, opts) => fetchPage(url, { transport: pageTransport, lookup, ...opts }) };
}
