/**
 * Small JSON client for the Feedback_API. It adds the visit's UTM values to
 * every body, gives each request a 10 s timeout, and turns every failure into
 * a plain-language message. The client never shows raw server text; unknown
 * codes and network errors map to the "temporarily unavailable" message.
 * Requirements 18.2, 22.2.
 */

import { captureUtm, type Utm } from './utm';

export const REQUEST_TIMEOUT_MS = 10_000;

export const MSG_UNAVAILABLE =
  'Feedback is temporarily unavailable. Everything on this page is still here to read.';
const MSG_INVALID = "Something in your answer didn't go through. Please check and try again.";

/** Error code to client message (design.md, Error Handling). */
export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_request: MSG_INVALID,
  invalid_anon_id: 'Something went wrong on our side. Please try again.',
  consent_required:
    'Please tick the consent box for each contact detail you entered, and confirm you are 18 or older.',
  origin_not_allowed: 'Feedback can only be sent from moolresha.com.',
  bot_check_failed: "We couldn't confirm you're not a bot. Please try again.",
  notice_outdated:
    'Our privacy notice was updated. Please reload the page to see it before signing up.',
  payload_too_large: MSG_INVALID,
  unsupported_media_type: 'Feedback needs JavaScript turned on. You can still read everything on this page.',
  storage_unavailable: MSG_UNAVAILABLE,
  results_unavailable: 'Results unavailable right now',
};

export function rateLimitedMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return "You've sent a lot of answers in a short time. Please try again in a few minutes.";
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const unit = minutes === 1 ? 'minute' : 'minutes';
  return `You've sent a lot of answers in a short time. Please try again in ${minutes} ${unit}.`;
}

/**
 * Used when the response has no known `error` code. Unknown codes map to the
 * "temporarily unavailable" message; only a 429 is still recognisable.
 */
function messageForStatus(status: number, retryAfter: number | null): string {
  if (status === 429) return rateLimitedMessage(retryAfter);
  return MSG_UNAVAILABLE;
}

export interface ApiOk<T> {
  ok: true;
  status: number;
  data: T;
}

export interface ApiNetworkError {
  ok: false;
  kind: 'network';
  /** `timeout` when the 10 s limit passed, `offline` for any other fetch rejection. */
  reason: 'timeout' | 'offline';
  message: string;
}

export interface ApiHttpError {
  ok: false;
  kind: 'http';
  status: number;
  /** Server error code when it is a known string, otherwise undefined. */
  code?: string;
  /** Field paths from a 400 `invalid_request`. */
  fields?: string[];
  /** Seconds from the `Retry-After` header on a 429. */
  retryAfter?: number;
  message: string;
}

export type ApiResult<T> = ApiOk<T> | ApiNetworkError | ApiHttpError;

export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface PostOptions {
  /** Injected in tests. Defaults to the global `fetch`. */
  fetchImpl?: FetchImpl;
  /** Defaults to 10 s. */
  timeoutMs?: number;
  /** Defaults to the visit's captured UTM values. */
  utm?: Utm;
}

function hasUtm(utm: Utm): boolean {
  return utm.source !== undefined || utm.medium !== undefined || utm.campaign !== undefined;
}

function parseRetryAfter(res: Response): number | null {
  const raw = res.headers?.get('Retry-After');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function post<T>(
  path: string,
  body: Record<string, unknown> = {},
  options: PostOptions = {},
): Promise<ApiResult<T>> {
  const fetchImpl: FetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const utm = options.utm ?? captureUtm();

  const payload: Record<string, unknown> = { ...body };
  if (payload.utm === undefined && hasUtm(utm)) payload.utm = utm;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return { ok: false, kind: 'network', reason: timedOut ? 'timeout' : 'offline', message: MSG_UNAVAILABLE };
  }

  try {
    // Parse inside the timer window: a stalled body read is also aborted.
    let json: unknown = undefined;
    let parsed = true;
    try {
      json = await res.json();
    } catch (err) {
      parsed = false;
      if (timedOut) {
        return { ok: false, kind: 'network', reason: 'timeout', message: MSG_UNAVAILABLE };
      }
      void err;
    }

    if (res.ok) {
      if (!parsed) {
        // A 2xx without readable JSON is not something the islands can use.
        return { ok: false, kind: 'http', status: res.status, message: MSG_UNAVAILABLE };
      }
      return { ok: true, status: res.status, data: json as T };
    }

    const retryAfter = parseRetryAfter(res);
    const record = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
    const rawCode = typeof record.error === 'string' ? record.error : undefined;
    const fields = Array.isArray(record.fields)
      ? record.fields.filter((f): f is string => typeof f === 'string')
      : undefined;

    let message: string;
    let code: string | undefined;
    if (rawCode === 'rate_limited') {
      code = rawCode;
      message = rateLimitedMessage(retryAfter);
    } else if (rawCode !== undefined && Object.hasOwn(ERROR_MESSAGES, rawCode)) {
      code = rawCode;
      message = ERROR_MESSAGES[rawCode];
    } else {
      message = messageForStatus(res.status, retryAfter);
    }

    const err: ApiHttpError = { ok: false, kind: 'http', status: res.status, message };
    if (code !== undefined) err.code = code;
    if (fields !== undefined && fields.length > 0) err.fields = fields;
    if (retryAfter !== null) err.retryAfter = retryAfter;
    return err;
  } finally {
    clearTimeout(timer);
  }
}
