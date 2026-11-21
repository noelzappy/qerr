// node --test   deletePost against a fake Buffer (no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferError, createClient } from './lib/client.mjs';
import { DELETE_POST_QUERY, deletePost } from './lib/buffer-delete.mjs';

const KEY = 'BUFFER_KEY_that_must_never_print';
function client(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push(JSON.parse(init.body)); return respond(); };
  return { c: createClient({ apiKey: KEY, fetchImpl, sleep: async () => {} }), calls };
}
const json = (data, extra = {}) => new Response(JSON.stringify({ data, ...extra }));

test('success sends the mutation with the id and returns ok', async () => {
  const { c, calls } = client(() => json({ deletePost: { __typename: 'DeletePostSuccess' } }));
  assert.deepEqual(await deletePost(c, 'post_1'), { ok: true });
  assert.equal(calls[0].query, DELETE_POST_QUERY);
  assert.deepEqual(calls[0].variables, { input: { id: 'post_1' } });
});

test('a VoidMutationError comes back as ok:false with its message', async () => {
  const { c } = client(() => json({ deletePost: { __typename: 'VoidMutationError', message: 'Post not found' } }));
  assert.deepEqual(await deletePost(c, 'x'), { ok: false, message: 'Post not found' });
});

test('HTTP 500 stays an ambiguous BufferError', async () => {
  const { c } = client(() => new Response('boom', { status: 500 }));
  await assert.rejects(deletePost(c, 'x'), (e) => e instanceof BufferError && e.kind === 'http' && e.ambiguous === true);
});

test('a GraphQL error is thrown as kind graphql', async () => {
  const { c } = client(() => new Response(JSON.stringify({ errors: [{ message: 'Cannot query field deletePost' }] })));
  await assert.rejects(deletePost(c, 'x'), (e) => e instanceof BufferError && e.kind === 'graphql' && /deletePost/.test(e.message));
});

test('an unknown answer shape is an ambiguous parse error', async () => {
  for (const data of [{ deletePost: { __typename: 'SomethingElse' } }, { deletePost: null }, {}, null]) {
    const { c } = client(() => json(data));
    await assert.rejects(deletePost(c, 'x'), (e) => e instanceof BufferError && e.kind === 'parse' && e.ambiguous === true, JSON.stringify(data));
  }
});

test('an empty id is refused before anything is sent', async () => {
  const { c, calls } = client(() => json({}));
  await assert.rejects(deletePost(c, ''), /bufferId/);
  assert.equal(calls.length, 0);
});
