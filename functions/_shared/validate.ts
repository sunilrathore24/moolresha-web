/**
 * Maps Zod validation failures to API error responses (design.md, Error codes):
 * - `400 invalid_request` with `fields` (field path -> short message), or
 * - `400 consent_required` when the only problems are the consent and 18+ rules of the
 *   interest schema (Requirements 12.4, 12.5, 12.6).
 *
 * `fields` is a `Record<string, string>` (see `ErrorExtra` in respond.ts). Nested paths are
 * joined with dots, for example `consents.email`. A failure on the object itself uses the
 * key `_`. Messages never repeat the submitted values, so no personal data is echoed back.
 */
import type { z } from 'zod';
import { CONSENT_REQUIRED } from './schemas';
import { errorResponse } from './respond';

export type FieldErrors = Record<string, string>;

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; response: Response };

const ROOT_KEY = '_';

function pathKey(path: readonly PropertyKey[]): string {
  return path.length === 0 ? ROOT_KEY : path.map((p) => String(p)).join('.');
}

function isConsentIssue(issue: z.core.$ZodIssue): boolean {
  if (issue.code !== 'custom') return false;
  const params = (issue as { params?: Record<string, unknown> }).params;
  return params?.code === CONSENT_REQUIRED;
}

/** Messages come from our own schema for custom issues. Everything else gets a generic message. */
function messageFor(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'custom':
      return issue.message || 'invalid value';
    case 'unrecognized_keys':
      return 'unknown field';
    case 'invalid_type':
      return 'wrong type';
    case 'too_big':
      return 'too long or too many';
    case 'too_small':
      return 'too short or too few';
    case 'invalid_format':
      return 'wrong format';
    case 'invalid_value':
      return 'not an allowed value';
    default:
      return 'invalid value';
  }
}

/** Collapses Zod issues into a `{ path: message }` map. The first message for a path wins. */
export function toFieldErrors(issues: readonly z.core.$ZodIssue[]): FieldErrors {
  const fields: FieldErrors = {};
  const put = (key: string, message: string): void => {
    if (!(key in fields)) fields[key] = message;
  };
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      // One entry per unknown key. The key name is not echoed in the message.
      const keys = (issue as { keys?: readonly string[] }).keys ?? [];
      for (const k of keys) put(pathKey([...issue.path, k]), messageFor(issue));
      if (keys.length === 0) put(pathKey(issue.path), messageFor(issue));
      continue;
    }
    put(pathKey(issue.path), messageFor(issue));
  }
  return fields;
}

/** Builds the 400 response for a failed parse. */
export function validationErrorResponse(error: z.ZodError): Response {
  const issues = error.issues;
  const fields = toFieldErrors(issues);
  const consentOnly = issues.length > 0 && issues.every(isConsentIssue);
  return errorResponse(400, consentOnly ? 'consent_required' : 'invalid_request', { fields });
}

/**
 * Validates an already-parsed JSON value. Returns the parsed data (defaults applied, free text
 * normalised) or the 400 response to send.
 */
export function validateBody<S extends z.ZodType>(schema: S, body: unknown): ValidationResult<z.output<S>> {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, response: validationErrorResponse(result.error) };
}
