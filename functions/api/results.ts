/**
 * GET /api/results (Requirements 16.1 to 16.6; design.md, "GET /api/results").
 *
 * Public aggregates only: per Concept the response count and, from 20 responses, verdict
 * percentages, leading colour, top Price_Band, price counts and top Priority_Chips. All of that
 * comes from `toPublicResult`, which holds no Anonymous_IDs or free text to begin with.
 *
 * Flow: method check, cache lookup, and only on a miss: rate limit (route `results`), the
 * grouped queries, projection, cache write. A hit never touches D1.
 *
 * The cache holds the JSON body without CORS headers. CORS and `Vary: Origin` are added to every
 * outgoing response, so a hit for one Origin never leaks `Access-Control-Allow-Origin` to another.
 */
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { PRICE_BAND_IDS } from '../../src/content/config/allow-lists.generated';
import { toPublicResult, type PublicConceptResult } from '../../src/lib/aggregate';
import { queryAggregates, type D1Like } from '../_shared/db';
import type { Env } from '../_shared/env';
import { clientIdentity } from '../_shared/identity';
import { log } from '../_shared/log';
import { ALLOWED_ORIGINS } from '../_shared/origin';
import { createD1RateLimitStore, rateLimit } from '../_shared/rate-limit';
import { errorResponse, json, withCors, withErrorBoundary } from '../_shared/respond';

/** Browsers and the Cache API keep a result for five minutes (Requirement 16.4). */
export const RESULTS_MAX_AGE_SEC = 300;
export const RESULTS_CACHE_CONTROL = `public, max-age=${RESULTS_MAX_AGE_SEC}`;

/** One fixed key for the whole site: the response does not depend on the request. */
export const RESULTS_CACHE_KEY_URL = 'https://www.moolresha.com/api/results';

/** The part of the Cache API this endpoint uses. `caches.default` satisfies it. */
export interface ResultsCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface ResultsDeps {
  db: D1Like;
  cache: ResultsCache;
  now: () => Date;
}

export interface ResultsBody {
  ok: true;
  computedAt: string;
  results: PublicConceptResult[];
}

export interface ResultsContext {
  request: Request;
  env: Pick<Env, 'IDENTITY_SALT_SEED'> & { PREVIEW_ORIGIN?: string };
  waitUntil?: (promise: Promise<unknown>) => void;
}

function cacheKey(): Request {
  return new Request(RESULTS_CACHE_KEY_URL, { method: 'GET' });
}

/** Reads a cached body, or null when it is missing or not the expected shape. */
async function readCached(cache: ResultsCache): Promise<ResultsBody | null> {
  try {
    const hit = await cache.match(cacheKey());
    if (hit === undefined) return null;
    const body = (await hit.json()) as Partial<ResultsBody>;
    if (body.ok !== true || typeof body.computedAt !== 'string' || !Array.isArray(body.results)) return null;
    return body as ResultsBody;
  } catch {
    return null; // a broken cache entry is treated as a miss
  }
}

/** The stored copy has no CORS or Vary headers: those are added per request on the way out. */
function storedCopy(body: ResultsBody): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': RESULTS_CACHE_CONTROL },
  });
}

export function createResultsHandler(deps: ResultsDeps): (ctx: ResultsContext) => Promise<Response> {
  return async (ctx) => {
    const { request, env } = ctx;
    const allowed = ALLOWED_ORIGINS(env as Env);
    const reply = (res: Response): Response => withCors(res, request, allowed);

    if (request.method !== 'GET') {
      const res = errorResponse(405, 'method_not_allowed');
      res.headers.set('Allow', 'GET');
      return reply(res);
    }

    const cached = await readCached(deps.cache);
    if (cached !== null) return reply(json(200, cached, { 'Cache-Control': RESULTS_CACHE_CONTROL }));

    try {
      const now = deps.now();

      const identity = await clientIdentity(request, env, now);
      const decision = await rateLimit(createD1RateLimitStore(deps.db), 'results', identity, now.getTime() / 1000);
      if (!decision.allowed) {
        return reply(errorResponse(429, 'rate_limited', { retryAfter: decision.retryAfterSec }));
      }

      const aggregates = await queryAggregates(deps.db);
      const results: PublicConceptResult[] = CONCEPT_IDS.map((id) => {
        const agg = aggregates.get(id);
        if (agg === undefined) throw new Error(`missing aggregate for ${id}`);
        return toPublicResult(agg, PRICE_BAND_IDS[id]);
      });
      const body: ResultsBody = { ok: true, computedAt: now.toISOString(), results };

      // Writing the cache is best effort and must not delay or fail the response.
      const put = deps.cache.put(cacheKey(), storedCopy(body)).catch(() => undefined);
      if (ctx.waitUntil) ctx.waitUntil(put);
      else await put;

      return reply(json(200, body, { 'Cache-Control': RESULTS_CACHE_CONTROL }));
    } catch (err) {
      log('results_unavailable', { route: 'results', errorClass: err instanceof Error ? err.name : typeof err });
      return reply(errorResponse(503, 'results_unavailable'));
    }
  };
}

export const onRequest = withErrorBoundary(
  'results',
  (ctx: { request: Request; env: Env; waitUntil?: (p: Promise<unknown>) => void }) =>
    createResultsHandler({
      db: ctx.env.DB as unknown as D1Like,
      cache: (caches as unknown as { default: ResultsCache }).default,
      now: () => new Date(),
    })(ctx),
);
