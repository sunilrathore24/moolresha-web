import type { Env } from "./env";
import { log } from "./log";

/** Error codes returned in the `error` field of every API error body (design.md, Error codes). */
export type ErrorCode =
  | "invalid_request"
  | "invalid_anon_id"
  | "consent_required"
  | "origin_not_allowed"
  | "bot_check_failed"
  | "method_not_allowed"
  | "notice_outdated"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rate_limited"
  | "internal_error"
  | "storage_unavailable"
  | "results_unavailable";

/** Extra members allowed in an error body, next to `ok` and `error`. */
export interface ErrorExtra {
  fields?: Record<string, string>;
  retryAfter?: number;
}

/**
 * JSON response. Defaults: `Content-Type: application/json` and `Cache-Control: no-store`.
 * `Vary: Origin` is always set, because CORS headers depend on the request Origin.
 * Headers passed in `headers` override the defaults (for example `/api/results` caching).
 */
export function json(status: number, body: unknown, headers?: HeadersInit): Response {
  const h = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      if (key.toLowerCase() === "vary") h.append("Vary", value);
      else h.set(key, value);
    });
  }
  appendVaryOrigin(h);
  return new Response(JSON.stringify(body), { status, headers: h });
}

/** Error response with the body shape `{ ok: false, error, fields?, retryAfter? }`. */
export function errorResponse(status: number, code: ErrorCode, extra: ErrorExtra = {}): Response {
  const headers: Record<string, string> = {};
  if (status === 429 && typeof extra.retryAfter === "number") {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(extra.retryAfter)));
  }
  if (status === 405) headers["Allow"] = "POST";
  return json(status, { ok: false, error: code, ...extra }, headers);
}

function appendVaryOrigin(h: Headers): void {
  const current = h.get("Vary");
  if (!current) {
    h.set("Vary", "Origin");
    return;
  }
  const has = current
    .split(",")
    .some((v) => v.trim().toLowerCase() === "origin" || v.trim() === "*");
  if (!has) h.set("Vary", `${current}, Origin`);
}

/**
 * Adds CORS headers. `Access-Control-Allow-Origin` is the request Origin, and only when that
 * Origin is in `allowed`. Never `*`. `Vary: Origin` is always present.
 */
export function withCors(res: Response, req: Request, allowed: ReadonlySet<string>): Response {
  const out = new Response(res.body, res);
  const origin = req.headers.get("Origin");
  if (origin && allowed.has(origin)) {
    out.headers.set("Access-Control-Allow-Origin", origin);
  }
  appendVaryOrigin(out.headers);
  return out;
}

/** Answers an OPTIONS preflight. Allowed origins get 204 with the allowed method and header. */
export function preflightResponse(req: Request, allowed: ReadonlySet<string>): Response {
  const origin = req.headers.get("Origin");
  const headers = new Headers({ "Cache-Control": "no-store" });
  appendVaryOrigin(headers);
  if (!origin || !allowed.has(origin)) {
    return new Response(null, { status: 403, headers });
  }
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "POST");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers });
}

/**
 * Wraps a handler. Unexpected exceptions become `500 internal_error` and are logged with the
 * route, error class and a request id. Request bodies, IPs, user agents and error messages are
 * never logged.
 */
export function withErrorBoundary<C extends { request: Request; env?: Env }>(
  route: string,
  handler: (ctx: C) => Response | Promise<Response>,
): (ctx: C) => Promise<Response> {
  return async (ctx: C): Promise<Response> => {
    try {
      return await handler(ctx);
    } catch (err) {
      const requestId = crypto.randomUUID();
      const errorClass = err instanceof Error ? err.name : typeof err;
      log("unhandled_error", { route, errorClass, requestId });
      const res = errorResponse(500, "internal_error");
      res.headers.set("X-Request-Id", requestId);
      return res;
    }
  };
}
