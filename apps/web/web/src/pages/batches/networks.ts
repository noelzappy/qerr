// A post's networks the way the API stores them: per-network overrides, and the networks to leave out under `skip`.
import { NETWORKS } from './labels';
import type { NetworkOverride, PostView } from './types';

export interface NetworkState {
  skip: string[];
  overrides: Record<string, NetworkOverride>;
}

export function readNetworks(networks: PostView['networks'] | undefined): NetworkState {
  const skip = Array.isArray(networks?.skip) ? networks.skip : [];
  const overrides: Record<string, NetworkOverride> = {};
  for (const n of NETWORKS) {
    const o = networks?.[n];
    if (o && typeof o === 'object' && !Array.isArray(o)) overrides[n] = o;
  }
  return { skip, overrides };
}

// A post goes to a network when it is not skipped and the batch sends there by default or the post names it.
export const goesTo = (state: NetworkState, defaults: string[], n: string) => !state.skip.includes(n) && (defaults.includes(n) || n in state.overrides);

export const captionFor = (caption: string, state: NetworkState, n: string) => state.overrides[n]?.caption ?? caption;

// The networks block to send. Other fields of an override (type, first comment, media) are kept as they were.
export function buildNetworks(base: NetworkState, on: Record<string, boolean>, captions: Record<string, string>, defaults: string[]) {
  const out: Record<string, unknown> = {};
  const skip = NETWORKS.filter((n) => !on[n]);
  if (skip.length) out.skip = skip;
  for (const n of NETWORKS) {
    const o: NetworkOverride = { ...(base.overrides[n] ?? {}) };
    if (captions[n]?.trim()) o.caption = captions[n];
    else delete o.caption;
    // A network the batch does not send to by default needs an (even empty) entry to be switched on.
    if (Object.keys(o).length > 0 || (on[n] && !defaults.includes(n))) out[n] = o;
  }
  return out;
}

export function currentFlags(state: NetworkState, defaults: string[]): Record<string, boolean> {
  return Object.fromEntries(NETWORKS.map((n) => [n, goesTo(state, defaults, n)]));
}

export function currentCaptions(state: NetworkState): Record<string, string> {
  return Object.fromEntries(NETWORKS.map((n) => [n, state.overrides[n]?.caption ?? '']));
}
