// Deleting a Buffer post by id. UNVERIFIED: the mutation name, the DeletePostInput { id } shape and the DeletePostSuccess /
// VoidMutationError result types are assumptions from Buffer's naming of other mutations; nothing here has run against real
// Buffer (see docs/buffer-api-notes.md). An answer that does not look like either result is a parse error, never a guess.
import { BufferError } from './client.mjs';

export const DELETE_POST_QUERY = 'mutation DeletePost($input: DeletePostInput!) { deletePost(input: $input) { __typename ... on DeletePostSuccess { __typename } ... on VoidMutationError { message } } }';

// -> { ok: true } | { ok: false, message }. Transport and GraphQL errors from the client are thrown unchanged, so an
// ambiguous BufferError stays ambiguous and the caller decides what to do about it.
export async function deletePost(client, bufferId) {
  if (typeof bufferId !== 'string' || !bufferId) throw new Error('deletePost: bufferId must be a non-empty string');
  const data = await client.gql(DELETE_POST_QUERY, { input: { id: bufferId } });
  const r = data?.deletePost;
  if (r?.__typename === 'DeletePostSuccess') return { ok: true };
  if (r?.__typename === 'VoidMutationError' && typeof r.message === 'string') return { ok: false, message: r.message };
  throw new BufferError(`Buffer answered the delete with a shape this tool does not know (${JSON.stringify(r ?? null).slice(0, 200)}); the post may or may not be deleted.`, { kind: 'parse', status: 200, ambiguous: true });
}
