// One error type for everything the AI layer can refuse or fail at. `code` is stable and meant for callers.
// Codes: config, budget, timeout, network, http, invalid_output, truncated, unsafe_url, rejected, no_valid_posts, site (a
// website named by a person could not be read).
export class AIError extends Error {
  constructor(message, { code = 'error', status, details, notes } = {}) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    if (status !== undefined) this.status = status;
    if (details !== undefined) this.details = details;
    if (notes !== undefined) this.notes = notes;
  }
}

// Removes secrets from any text that may reach a log, an error or a report.
export function redact(text, secrets = []) {
  let out = String(text ?? '');
  for (const s of secrets) if (typeof s === 'string' && s.length >= 6) out = out.split(s).join('***');
  return out
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|tvly-[A-Za-z0-9_-]{8,}|BSA[A-Za-z0-9_-]{16,})\b/g, '***')
    .replace(/(authorization|x-api-key|x-subscription-token)\s*[:=]\s*\S+/gi, '$1: ***');
}
