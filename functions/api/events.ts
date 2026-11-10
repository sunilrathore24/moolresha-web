/**
 * POST /api/events: the Event_Counter (Requirements 18.2, 18.3, 18.4, 18.5).
 *
 * Order of checks (nothing is stored until all pass):
 *   method (405) -> Origin (403) -> Content-Type (415) -> Content-Length (413)
 *   -> rate limit (429) -> body read and size cap (413) -> strict EventBody (400) -> day-level increment.
 *
 * Success is `204` with no body. There is no Turnstile check (design.md, Key design decisions).
 *
 * Privacy: the only thing written to `event_counts` is (UTC day, event, concept, section, UTM)
 * and a count. The body schema is strict, so an `anonId` or any other unknown key is refused.
 * The client identity used for rate limiting is an opaque salted hash, kept in `rate_limits`
 * only. Request bodies, IPs and user agents are never logged.
 */
import type { Env } from '../_shared/env';
import { incrementEvent, type D1Like } from '../_shared/db';
import { clientIdentity, utcDay } from '../_shared/identity';
import { log } from '../_shared/log';
import { ALLOWED_ORIGINS, checkOrigin } from '../_shared/origin';
import { createD1RateLimitStore, rateLimit } from '../_shared/rate-limit';
import { errorResponse, preflightResponse, withCors, withErrorBoundary } from '../_shared/respond';
import { EventBody } from '../_shared/schemas';
import { validateBody } from '../_shared/validate';

/** Events carry a handful of short fields. 8 KB is the common write-endpoint cap. */
export const MAX_BODY_BYTES = 8 * 1024;

export interface EventsDeps {
  /** Overrides `env.DB` (tests). */
  db?: D1Like;
  /** Clock (tests). */
  now?: () => Date;
}

export interface EventsContext {
  request: Request;
  env: Env;
}

function isJson(req: Request): boolean {
  const type = req.headers.get('Content-Type') ?? '';
  return type.split(';')[0]!.trim().toLowerCase() === 'application/json';
}

export function createEventsHandler(deps: EventsDeps = {}): (ctx: EventsContext) => Promise<Response> {
  const now = deps.now ?? (() => new Date());

  return withErrorBoundary<EventsContext>('events', async ({ request, env }) => {
    const allowed = ALLOWED_ORIGINS(env);
    const cors = (res: Response): Response => withCors(res, request, allowed);

    if (request.method === 'OPTIONS') return preflightResponse(request, allowed);
    if (request.method !== 'POST') return cors(errorResponse(405, 'method_not_allowed'));

    const denied = checkOrigin(request, env);
    if (denied) return cors(denied);

    if (!isJson(request)) return cors(errorResponse(415, 'unsupported_media_type'));
    const declared = Number(request.headers.get('Content-Length') ?? '0');
    if (declared > MAX_BODY_BYTES) return cors(errorResponse(413, 'payload_too_large'));

    const db = deps.db ?? (env.DB as unknown as D1Like);
    const at = now();

    // Rate limit before any parsing, so floods cost one counter write (design: write pipeline).
    try {
      const identity = await clientIdentity(request, env, at);
      const decision = await rateLimit(createD1RateLimitStore(db), 'events', identity, at.getTime() / 1000);
      if (!decision.allowed) {
        return cors(errorResponse(429, 'rate_limited', { retryAfter: decision.retryAfterSec }));
      }
    } catch {
      log('rate_limit_unavailable', { route: 'events' });
      return cors(errorResponse(503, 'storage_unavailable'));
    }

    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_BODY_BYTES) return cors(errorResponse(413, 'payload_too_large'));

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return cors(errorResponse(400, 'invalid_request', { fields: { _: 'invalid JSON' } }));
    }

    const result = validateBody(EventBody, parsed);
    if (!result.ok) return cors(result.response);
    const e = result.data;

    try {
      await incrementEvent(db, {
        day: utcDay(at),
        event: e.event,
        conceptId: e.conceptId ?? '',
        section: e.section ?? '',
        utm: e.utm ?? {},
      });
    } catch {
      log('event_store_failed', { route: 'events' });
      return cors(errorResponse(503, 'storage_unavailable'));
    }

    return cors(new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } }));
  });
}

export const onRequest = createEventsHandler();
