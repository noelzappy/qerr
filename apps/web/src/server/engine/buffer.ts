// Typed access to the engine pieces the settings pages share: the Buffer client, the account name rule, the network
// list and secret masking. Loaded once, lazily, because the engine is plain .mjs outside this package.
import { engineImport } from './root.js';

export interface EngineClient {
  gql(query: string, variables?: Record<string, unknown>): Promise<any>;
}

interface ClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries429?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface BufferEngine {
  networks: readonly string[];
  createClient(options: ClientOptions): EngineClient;
  maskSecrets(text: string, secrets?: string[]): string;
  // The engine's own account name rule (^[A-Za-z0-9_-]{1,32}$), asked of the engine so the two cannot drift.
  isValidAccountName(name: string): boolean;
  // Which network a Buffer channel's `service` belongs to, or null.
  networkOf(service: unknown): string | null;
}

let cached: Promise<BufferEngine> | null = null;

export function bufferEngine(): Promise<BufferEngine> {
  cached ??= (async () => {
    const [client, core, networks, accounts] = await Promise.all([
      engineImport<{ createClient: BufferEngine['createClient'] }>('client'),
      engineImport<{ maskSecrets: BufferEngine['maskSecrets'] }>('core'),
      engineImport<{ NETWORKS: string[] }>('networks'),
      engineImport<{ isValidAccountName(name: unknown): boolean }>('accounts'),
    ]);
    const list = [...networks.NETWORKS];
    return {
      networks: list,
      createClient: client.createClient,
      maskSecrets: core.maskSecrets,
      isValidAccountName: accounts.isValidAccountName,
      // x also answers to twitter: Buffer names X channels `twitter` (seen in a real check, 22 Nov 2026).
      networkOf: (service) => {
        const s = String(service ?? '').toLowerCase();
        return list.find((n) => (n === 'x' ? s === 'x' || s.includes('twitter') : s.includes(n))) ?? null;
      },
    };
  })();
  return cached;
}
