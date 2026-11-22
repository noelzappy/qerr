// Where a brand graphic or cut-out is used, so it is not deleted from under a post or a look. Returns plain phrases for a message
// ("2 posts"); empty when nothing uses it. The engine step adds the place a look's pieces name a graphic to this list.
import type { Deps } from '../deps.js';

export async function graphicUsage(deps: Pick<Deps, 'prisma'>, id: string): Promise<string[]> {
  const like = `%${id}%`;
  const [posts, looks] = await Promise.all([
    deps.prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM posts WHERE status <> 'removed' AND (design::text LIKE ${like} OR ${id} = ANY(sources))`,
    deps.prisma.$queryRaw<Array<{ n: bigint }>>`SELECT (SELECT count(*) FROM brand_looks WHERE definition::text LIKE ${like}) + (SELECT count(*) FROM brand_look_compositions WHERE definition::text LIKE ${like} OR draft::text LIKE ${like}) AS n`,
  ]);
  const out: string[] = [];
  const p = Number(posts[0]?.n ?? 0);
  const l = Number(looks[0]?.n ?? 0);
  if (p) out.push(`${p} ${p === 1 ? 'post' : 'posts'}`);
  if (l) out.push(l === 1 ? '1 look design' : `${l} look designs`);
  return out;
}
