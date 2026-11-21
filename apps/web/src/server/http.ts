// Small HTTP helpers shared by every route: typed errors, body validation and pagination.
import type { Context } from 'hono';
import { z, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 422 | 429 | 500 | 502 | 503, message: string, public details?: unknown) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

// Only the path and the message of each problem go back to the caller, never the value that was sent.
export function validate<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'The request is not valid', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

export async function readJson<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, 'The request body must be JSON');
  }
  return validate(schema, raw);
}

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export function readQuery<T>(c: Context, schema: ZodType<T>): T {
  return validate(schema, c.req.query());
}
