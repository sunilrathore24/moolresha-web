/**
 * Fixed-window rate limiter (Requirements 14.1, 14.2, 18.5; docs/rate-limiting.md).
 *
 * The counter lives behind `RateLimitStore`. Production uses D1 (`createD1RateLimitStore`),
 * tests can use `createMemoryRateLimitStore`. Both give the same decisions.
 *
 * Key shape is `route:identity`, where `identity` is the opaque SHA-256 hash from
 * `identity.ts`. No IP, user agent or other personal data reaches this module or the table.
 *
 * Why D1 and not KV: a fixed-window counter writes once per request, and KV Free allows about
 * 1,000 writes a day. See design.md, "Key design decisions".
 */
import type { D1Like } from './db';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type RouteName = 'feedback' | 'frustration' | 'interest' | 'events' | 'results' | 'admin';

export interface RouteLimit {
  /** Requests allowed per window, per identity. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

/**
 * Per-route limits.
 * ⚠️ align with docs/rate-limiting.md. These are the design's proposals. The doc only fixes
 * values for its own like/subscribe/comment endpoints (30/60 s, 5/60 s, 3/60 s), which do not
 * match this site's routes one to one. Change them here only; nothing else hard-codes them.
 */
export const RATE_LIMITS: Readonly<Record<RouteName, RouteLimit>> = {
  feedback: { limit: 20, windowSec: 10 * 60 }, // ⚠️ align with docs/rate-limiting.md
  frustration: { limit: 5, windowSec: 10 * 60 }, // ⚠️ align with docs/rate-limiting.md
  interest: { limit: 3, windowSec: 60 * 60 }, // ⚠️ align with docs/rate-limiting.md
  events: { limit: 60, windowSec: 10 * 60 }, // ⚠️ align with docs/rate-limiting.md
  results: { limit: 30, windowSec: 60 }, // ⚠️ align with docs/rate-limiting.md (applied on cache miss only)
  admin: { limit: 30, windowSec: 60 * 60 }, // ⚠️ align with docs/rate-limiting.md (after auth)
};

/** About 1 in this many requests also deletes a batch of expired rows (design.md). */
export const CLEANUP_ONE_IN = 50;
/** Most rows one cleanup pass deletes, so a pass stays cheap. */
export const CLEANUP_BATCH = 100;

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface RateLimitStore {
  /**
   * Adds one to the counter for (key, windowStart) and returns the new count (1 for the first
   * request in a window). The row expires at `windowStart + ttlSec`.
   */
  increment(key: string, windowStart: number, ttlSec: number): Promise<number>;
  /**
   * Deletes up to `limit` rows whose `expires_at` is before `nowSec`. Returns how many were deleted.
   * Optional: a store without it is simply never cleaned.
   */
  deleteExpired?(nowSec: number, limit: number): Promise<number>;
}

// ---------------------------------------------------------------------------
// D1 store
// ---------------------------------------------------------------------------

// One statement, so the increment is atomic per row. Constant SQL, values only through bind().
const SQL_INCREMENT = `
INSERT INTO rate_limits (key, window_start, count, expires_at) VALUES (?1, ?2, 1, ?3)
ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1
RETURNING count`;

// `rate_limits` is WITHOUT ROWID and DELETE ... LIMIT is not compiled into every SQLite build,
// so the batch is picked with a sub-select on the primary key. `idx_rate_limits_expiry` serves it.
const SQL_DELETE_EXPIRED = `
DELETE FROM rate_limits
WHERE (key, window_start) IN (
  SELECT key, window_start FROM rate_limits WHERE expires_at < ?1 LIMIT ?2
)`;

export function createD1RateLimitStore(db: D1Like): RateLimitStore {
  return {
    async increment(key, windowStart, ttlSec) {
      const row = await db
        .prepare(SQL_INCREMENT)
        .bind(key, windowStart, windowStart + ttlSec)
        .first<{ count: number }>();
      if (row === null) throw new Error('rate_limits increment returned no row');
      return row.count;
    },
    async deleteExpired(nowSec, limit) {
      const res = await db.prepare(SQL_DELETE_EXPIRED).bind(nowSec, limit).run();
      return res.meta?.changes ?? 0;
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory store (tests)
// ---------------------------------------------------------------------------

export interface MemoryRateLimitStore extends RateLimitStore {
  /** Number of rows currently held. */
  size(): number;
}

export function createMemoryRateLimitStore(): MemoryRateLimitStore {
  const rows = new Map<string, { count: number; expiresAt: number }>();
  const rowKey = (key: string, windowStart: number): string => `${windowStart}\u0000${key}`;
  return {
    async increment(key, windowStart, ttlSec) {
      const k = rowKey(key, windowStart);
      const row = rows.get(k);
      if (row === undefined) {
        rows.set(k, { count: 1, expiresAt: windowStart + ttlSec });
        return 1;
      }
      row.count += 1;
      return row.count;
    },
    async deleteExpired(nowSec, limit) {
      let deleted = 0;
      for (const [k, row] of rows) {
        if (deleted >= limit) break;
        if (row.expiresAt < nowSec) {
          rows.delete(k);
          deleted += 1;
        }
      }
      return deleted;
    },
    size: () => rows.size,
  };
}

// ---------------------------------------------------------------------------
// Limiter
// ---------------------------------------------------------------------------

/** Start (unix seconds) of the fixed window that contains `nowSec`. */
export function windowStart(nowSec: number, windowSec: number): number {
  return nowSec - (nowSec % windowSec);
}

export type RateLimitDecision =
  | { allowed: true; limit: number; remaining: number }
  | { allowed: false; limit: number; retryAfterSec: number };

export interface RateLimitOptions {
  /** Random source in [0, 1) for the cleanup draw. Tests pass a fixed value. */
  random?: () => number;
  /** Overrides the config table (tests). */
  limits?: Readonly<Record<string, RouteLimit>>;
}

/**
 * Counts this request against `route` for `identity` and decides.
 * The k-th request in a window is allowed if and only if k <= limit. A denied request still
 * increments the counter, so it costs one write like any other (design: one D1 write per request).
 * `retryAfterSec` is `windowStart + windowSec - now`, never below 1.
 *
 * A failing cleanup never fails the request. A failing increment throws, and the caller decides
 * whether to fail closed.
 */
export async function rateLimit(
  store: RateLimitStore,
  route: RouteName,
  identity: string,
  nowSec: number,
  options: RateLimitOptions = {},
): Promise<RateLimitDecision> {
  const cfg = (options.limits ?? RATE_LIMITS)[route];
  if (cfg === undefined) throw new Error(`No rate limit configured for route "${route}"`);
  const now = Math.floor(nowSec);
  const start = windowStart(now, cfg.windowSec);

  const count = await store.increment(`${route}:${identity}`, start, cfg.windowSec);

  const random = options.random ?? Math.random;
  if (store.deleteExpired !== undefined && random() < 1 / CLEANUP_ONE_IN) {
    try {
      await store.deleteExpired(now, CLEANUP_BATCH);
    } catch {
      // Cleanup is best effort. Expired rows are harmless and the next draw tries again.
    }
  }

  if (count <= cfg.limit) {
    return { allowed: true, limit: cfg.limit, remaining: cfg.limit - count };
  }
  return { allowed: false, limit: cfg.limit, retryAfterSec: Math.max(1, start + cfg.windowSec - now) };
}
