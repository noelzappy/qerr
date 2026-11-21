// Which Buffer account and channel a network posts to. Shared by the routing page's route and the one-time seed.
import type { ChannelRoute } from '@prisma/client';
import type { Deps } from '../deps.js';
import { bufferEngine } from '../engine/buffer.js';
import { badRequest } from '../http.js';

export async function networkOrThrow(network: string): Promise<string> {
  const engine = await bufferEngine();
  if (!engine.networks.includes(network)) throw badRequest('The request is not valid', [{ path: 'network', message: `Use one of ${engine.networks.join(', ')}` }]);
  return network;
}

// Sets (or replaces) the route for a network. The caller checks the account exists and writes the audit entry.
export function saveChannelRoute(deps: Pick<Deps, 'prisma'>, route: { network: string; accountId: string; channelId: string; channelName: string | null }): Promise<ChannelRoute> {
  const { network, ...fields } = route;
  return deps.prisma.channelRoute.upsert({ where: { network }, create: { network, ...fields }, update: fields });
}
