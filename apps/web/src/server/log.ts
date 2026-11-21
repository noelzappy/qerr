// One JSON line per event on stdout/stderr. Callers pass plain fields; nothing here is meant for secrets.
// The single deliberate exception is the bootstrap invite link, which is logged once (see bootstrap.ts).
export type LogFn = (event: string, fields?: Record<string, unknown>) => void;

export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

const write = (level: string, stream: NodeJS.WriteStream) => (event: string, fields: Record<string, unknown> = {}) => {
  stream.write(`${JSON.stringify({ at: new Date().toISOString(), level, event, ...fields })}\n`);
};

export const logger: Logger = {
  info: write('info', process.stdout),
  warn: write('warn', process.stderr),
  error: write('error', process.stderr),
};

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

// Error text for logs: type and code, and a message with known secrets removed and cut short.
export function describeError(err: unknown, secrets: string[] = []): { name: string; code?: string; message: string } {
  const e = err as { name?: string; code?: unknown; message?: unknown };
  let message = String(e?.message ?? err ?? '');
  for (const s of secrets) if (s && s.length >= 6) message = message.split(s).join('[hidden]');
  return { name: e?.name ?? 'Error', code: typeof e?.code === 'string' ? e.code : undefined, message: message.slice(0, 300) };
}
