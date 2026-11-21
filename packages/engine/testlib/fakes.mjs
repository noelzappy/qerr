// Shared fakes for the tests: a fake Buffer plus media host, played by an injectable fetch. No network.
export const ok = (id, dueAt = '2026-12-01T09:00:00.000Z') => new Response(JSON.stringify({ data: { createPost: { __typename: 'PostActionSuccess', post: { id, text: 't', dueAt } } } }));
export const mediaOk = () => new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } });

// `api(n, call)` answers POSTs to the Buffer API (n counts all POSTs so far); anything else goes to `media(url, init)`.
export function fakeServer({ api, media = mediaOk }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null, headers: init.headers });
    return url.startsWith('https://api.buffer.com') ? api(calls.filter((c) => c.method === 'POST').length, calls.at(-1)) : media(url, init);
  };
  return { fetchImpl, calls, posts: () => calls.filter((c) => c.method === 'POST' && c.url.startsWith('https://api.buffer.com')) };
}
