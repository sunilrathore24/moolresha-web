/**
 * Reusable write-endpoint pipeline (design.md, "Write request pipeline" and "API endpoints").
 *
 * Every write endpoint runs the same checks, in this order, and stores nothing until all pass:
 *
 *   1. method            -> 405 method_not_allowed (OPTIONS is answered as a CORS preflight)
 *   2. Origin            -> 403 origin_not_allowed
 *   3. Content-Type      -> 415 unsupported_media_type (an HTML page for plain form posts)
 *   4. body size cap     -> 413 payload_too_large (Content-Length, then again while reading)
 *   5. rate limit        -> 429 rate_limited + Retry-After
 *   6. validation        -> 400 invalid_request / consent_required
 *   6b. afterValidate    -> optional endpoint hook (for example interest: 409 notice_outdated)
 *   7. Turnstile         -> 403 bot_check_failed
 *   8. store             -> the endpoint's own storage step; any failure is 503 storage_unavailable
 *
 * The rate limit runs before validation and Turnstile, so a flood costs one D1 write and no
 * siteverify call. A rate-limiter failure fails closed with 503 storage_unavailable.
 *
 * Logging: only route names, status words and error classes. Never bodies, IPs, user agents,
 * Anonymous_IDs, tokens or error messages.
 *
 * Tests inject `db`, `fetchImpl`, `now` (and rate-limit options) through `PipelineDeps`.
 */
import type { z } from 'zod';
import type { D1Like } from './db';
import type { Env } from './env';
import { clientIdentity, utcDay } from './identity';
import { log } from './log';
import { ALLOWED_ORIGINS, checkOrigin } from './origin';
import {
  createD1RateLimitStore,
  rateLimit,
  type RateLimitOptions,
  type RateLimitStore,
  type RouteName,
} from './rate-limit';
import { errorResponse, json, preflightResponse, withCors, withErrorBoundary } from './respond';
import { verifyTurnstile } from './turnstile';
import { validateBody } from './validate';

/** Default body cap for write endpoints. Interest raises it to 16 KB. */
export const DEFAULT_MAX_BODY_BYTES = 8 * 1024;

/** Shown to a visitor whose browser posted a plain HTML form (no JavaScript, no Turnstile token). */
export const NO_JS_MESSAGE = 'Feedback needs JavaScript turned on. You can still read everything on this page.';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** What a Pages Function receives (a subset of `EventContext`). */
export interface PipelineContext {
  request: Request;
  env: Env;
}

/** Test seams. Production passes none of these. */
export interface PipelineDeps {
  /** Replaces `env.DB`. */
  db?: D1Like;
  /** Replaces global `fetch` for Turnstile (and, in the store step, MailerLite). */
  fetchImpl?: FetchLike;
  /** Clock. */
  now?: () => Date;
  /** Replaces the D1 rate-limit store. */
  rateLimitStore?: RateLimitStore;
  /** Overrides limits or the cleanup random source (tests). */
  rateLimitOptions?: RateLimitOptions;
}

/** Everything the store step and hooks may need. */
export interface StoreContext {
  db: D1Like;
  env: Env;
  request: Request;
  now: Date;
  /** `now` as ISO 8601 UTC. */
  nowIso: string;
  /** UTC day, `YYYY-MM-DD`, for event counters. */
  day: string;
  /** Undefined in production, so the platform `fetch` is used. */
  fetchImpl: FetchLike | undefined;
}

/**
 * What `store` may return:
 * - nothing: the pipeline answers `200 { ok: true, storedAt }`
 * - an object: its members are merged into that 200 body (for example `emailConfirmation`)
 * - a Response: sent as is (for example a 409)
 */
export type StoreResult = Response | Record<string, unknown> | void;

export interface WriteEndpointOptions<S extends z.ZodType<{ turnstileToken?: string }>> {
  /** Rate-limit route and log name. */
  route: RouteName;
  /** Strict Zod schema for the JSON body. Its output may carry `turnstileToken`. */
  schema: S;
  /** The endpoint's storage step. Throwing becomes 503 storage_unavailable. */
  store: (data: z.output<S>, ctx: StoreContext) => StoreResult | Promise<StoreResult>;
  /** Body cap in bytes. Default 8 KB. */
  maxBodyBytes?: number;
  /** Verify the Turnstile token. Default true. */
  turnstile?: boolean;
  /** Runs after validation and before Turnstile. Return a Response to stop, or null to go on. */
  afterValidate?: (data: z.output<S>, ctx: StoreContext) => Response | null | Promise<Response | null>;
}

// ---------------------------------------------------------------------------
// Helpers (exported for reuse and tests)
// ---------------------------------------------------------------------------

/** Media type of a Content-Type header, lower-cased, without parameters. */
export function mediaType(contentType: string | null): string {
  return (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

export function isJsonContentType(contentType: string | null): boolean {
  return mediaType(contentType) === 'application/json';
}

/** True for what a browser sends when a plain HTML form is submitted. */
export function isFormContentType(contentType: string | null): boolean {
  const t = mediaType(contentType);
  return t === 'application/x-www-form-urlencoded' || t === 'multipart/form-data';
}

/** The HTML 415 page for no-JavaScript form posts. Static text only, nothing from the request. */
export function noJavaScriptPage(): Response {
  const html =
    '<!doctype html><html lang="en-IN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>JavaScript needed</title></head>' +
    `<body><main><h1>JavaScript needed</h1><p>${NO_JS_MESSAGE}</p>` +
    '<p><a href="/">Back to the page</a></p></main></body></html>';
  return new Response(html, {
    status: 415,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    },
  });
}

export type BodyRead = { ok: true; text: string } | { ok: false };

/** Reads the body as UTF-8 text. `ok: false` means it is larger than `maxBytes`. */
export async function readBodyCapped(req: Request, maxBytes: number): Promise<BodyRead> {
  const declared = req.headers.get('Content-Length');
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) return { ok: false };
  }
  if (req.body === null) return { ok: true, text: '' };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false };
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(all) };
}

/** Event/UTM helper: the DB layer wants all three UTM strings. */
export function utmOrEmpty(utm: { source?: string; medium?: string; campaign?: string } | undefined): {
  source: string;
  medium: string;
  campaign: string;
} {
  return { source: utm?.source ?? '', medium: utm?.medium ?? '', campaign: utm?.campaign ?? '' };
}

function logFailure(event: string, route: string, err: unknown): void {
  log(event, { route, errorClass: err instanceof Error ? err.name : typeof err });
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

/**
 * Builds a Pages Function handler (`onRequest`) for one write endpoint.
 * The result is wrapped in `withErrorBoundary` (unexpected errors become 500 internal_error)
 * and in `withCors` (so even error responses carry `Access-Control-Allow-Origin` for allowed origins).
 */
export function createWriteHandler<S extends z.ZodType<{ turnstileToken?: string }>>(
  options: WriteEndpointOptions<S>,
  deps: PipelineDeps = {},
): (ctx: PipelineContext) => Promise<Response> {
  const { route, schema, store } = options;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const useTurnstile = options.turnstile ?? true;

  const inner = async (ctx: PipelineContext): Promise<Response> => {
    const { request, env } = ctx;

    // 1. Method. OPTIONS is the CORS preflight, answered for allowed origins only.
    if (request.method === 'OPTIONS') return preflightResponse(request, ALLOWED_ORIGINS(env));
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed');

    // 2. Origin.
    const originFailure = checkOrigin(request, env);
    if (originFailure) return originFailure;

    // 3. Content-Type. A plain form post gets the HTML page, anything else non-JSON gets JSON.
    const contentType = request.headers.get('Content-Type');
    if (!isJsonContentType(contentType)) {
      return isFormContentType(contentType) ? noJavaScriptPage() : errorResponse(415, 'unsupported_media_type');
    }

    // 4. Body cap.
    const body = await readBodyCapped(request, maxBodyBytes);
    if (!body.ok) return errorResponse(413, 'payload_too_large');

    // 5. Rate limit. The identity is an opaque hash; the raw IP and user agent go no further.
    const now = (deps.now ?? (() => new Date()))();
    const db = deps.db ?? env.DB;
    let decision;
    try {
      const identity = await clientIdentity(request, env, now);
      const rlStore = deps.rateLimitStore ?? createD1RateLimitStore(db);
      decision = await rateLimit(rlStore, route, identity, now.getTime() / 1000, deps.rateLimitOptions);
    } catch (err) {
      logFailure('rate_limit_unavailable', route, err);
      return errorResponse(503, 'storage_unavailable');
    }
    if (!decision.allowed) return errorResponse(429, 'rate_limited', { retryAfter: decision.retryAfterSec });

    // 6. Validation.
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      return errorResponse(400, 'invalid_request', { fields: { _: 'body is not valid JSON' } });
    }
    const validated = validateBody(schema, parsed);
    if (!validated.ok) return validated.response;
    const data = validated.data;

    const storeContext: StoreContext = {
      db,
      env,
      request,
      now,
      nowIso: now.toISOString(),
      day: utcDay(now),
      fetchImpl: deps.fetchImpl,
    };

    if (options.afterValidate) {
      const stop = await options.afterValidate(data, storeContext);
      if (stop) return stop;
    }

    // 7. Turnstile. Network failure, timeout and non-200 count as failure (turnstile.ts).
    if (useTurnstile) {
      const token = (data as { turnstileToken?: string }).turnstileToken ?? '';
      const ip = request.headers.get('CF-Connecting-IP') ?? '';
      const check = await verifyTurnstile(token, ip, env, deps.fetchImpl);
      if (!check.ok) {
        log('bot_check_failed', { route });
        return errorResponse(403, 'bot_check_failed');
      }
    }

    // 8. Storage. Any failure here, including D1 Free-plan limit errors, is 503.
    let result: StoreResult;
    try {
      result = await store(data, storeContext);
    } catch (err) {
      logFailure('storage_unavailable', route, err);
      return errorResponse(503, 'storage_unavailable');
    }
    if (result instanceof Response) return result;
    return json(200, { ok: true, storedAt: storeContext.nowIso, ...(result ?? {}) });
  };

  const guarded = withErrorBoundary(route, inner);
  return async (ctx: PipelineContext): Promise<Response> =>
    withCors(await guarded(ctx), ctx.request, ALLOWED_ORIGINS(ctx.env));
}
