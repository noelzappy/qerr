// The audit log. Every change that matters writes one row. `detail` is scrubbed before it is stored:
// names that look like secrets are replaced, so a careless caller cannot put a key into the log.
import type { Deps } from './deps.js';

export interface AuditActor {
  id?: string | null;
  email?: string | null;
}

const SECRET_NAME = /secret|password|passwd|token|cipher|authorization|credential|cookie/i;
// A name that is, or ends with, "key" (apiKey, accessKey, key) is a secret; these end with "key" but are identifiers.
const KEY_NAME = /(^|[^a-z])key$|[a-z]key$/i;
const SAFE_KEY_NAMES = new Set(['postkey', 'filekey', 'singletonkey', 'idempotencykey', 'mediakey', 'objectkey']);

export const isSecretName = (name: string): boolean => {
  const lower = name.toLowerCase();
  if (SAFE_KEY_NAMES.has(lower)) return false;
  return SECRET_NAME.test(name) || KEY_NAME.test(name);
};

export const REDACTED = '[redacted]';
const MAX_DEPTH = 6;
const MAX_STRING = 2000;

export function scrub(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (depth >= MAX_DEPTH) return '[too deep]';
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = isSecretName(k) ? REDACTED : scrub(v, depth + 1);
    return out;
  }
  return String(value);
}

export async function audit(
  deps: Pick<Deps, 'prisma'>,
  actor: AuditActor | null | undefined,
  action: string,
  entity?: string | null,
  entityId?: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await deps.prisma.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      action,
      entity: entity ?? null,
      entityId: entityId ?? null,
      detail: scrub(detail) as object,
    },
  });
}
