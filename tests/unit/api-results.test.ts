import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { upsertFeedback, type D1Like, type FeedbackInput } from '../../functions/_shared/db';
import {
  createResultsHandler,
  RESULTS_CACHE_CONTROL,
  type ResultsBody,
  type ResultsCache,
} from '../../functions/api/results';
import { createTestD1, type SqliteD1 } from '../support/d1-sqlite';

const ORIGIN = 'https://www.moolresha.com';
const T0 = new Date('2026-12-03T10:15:00.000Z');
const ENV = { IDENTITY_SALT_SEED: 'test-seed' };
const SECRET_TEXT = 'call me on +919876543210 or jane@example.com';

let db: SqliteD1;
beforeEach(() => {
  db = createTestD1();
});
afterEach(() => db.close());

/** In-memory stand-in for the Workers Cache API. */
function fakeCache(): ResultsCache & { size(): number } {
  const store = new Map<string, Response>();
  return {
    async match(req) {
      return store.get(req.url)?.clone();
    },
    async put(req, res) {
      store.set(req.url, res.clone());
    },
    size: () => store.size,
  };
}

/** Wraps a D1 and counts every `prepare` call. */
function counting(inner: D1Like): D1Like & { calls(): number } {
  let n = 0;
  return {
    prepare(sql) {
      n += 1;
      return inner.prepare(sql);
    },
    batch: (s) => inner.batch(s),
    calls: () => n,
  };
}

function anon(i: number): string {
  return `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
}

function row(i: number, over: Partial<FeedbackInput> = {}): FeedbackInput {
  return {
    anonId: anon(i),
    conceptId: 'mens-cotton-shirt',
    verdict: 'would_wear',
    changes: [],
    otherText: SECRET_TEXT,
    colour: null,
    priorities: [],
    priceBandId: null,
    priceSkipped: false,
    utm: { source: 'wa', medium: 'share', campaign: 'launch' },
    now: '2026-12-01T00:00:00.000Z',
    ...over,
  };
}

async function seed(n: number, make: (i: number) => Partial<FeedbackInput> = () => ({})): Promise<void> {
  for (let i = 0; i < n; i += 1) await upsertFeedback(db, row(i, make(i)));
}

function get(init: { method?: string; origin?: string } = {}): Request {
  const headers: Record<string, string> = { 'CF-Connecting-IP': '203.0.113.9', 'User-Agent': 'vitest' };
  if (init.origin) headers.Origin = init.origin;
  return new Request('https://www.moolresha.com/api/results', { method: init.method ?? 'GET', headers });
}

function handler(d: D1Like, cache: ResultsCache, now: () => Date = () => T0) {
  return createResultsHandler({ db: d, cache, now });
}

async function fetchBody(res: Response): Promise<ResultsBody> {
  return (await res.json()) as ResultsBody;
}

function shirt(body: ResultsBody) {
  const r = body.results.find((c) => c.conceptId === 'mens-cotton-shirt');
  if (!r) throw new Error('shirt result missing');
  return r;
}

describe('GET /api/results: Concepts below the threshold', () => {
  it('returns only the count and enough:false under 20 responses', async () => {
    await seed(19, () => ({ colour: 'clay', priceBandId: 'mcs-1500-1999', priorities: ['softness'] }));
    const res = await handler(db, fakeCache())({ request: get(), env: ENV });
    expect(res.status).toBe(200);
    const body = await fetchBody(res);
    expect(body.ok).toBe(true);
    expect(body.computedAt).toBe(T0.toISOString());
    expect(body.results).toHaveLength(5);
    expect(shirt(body)).toEqual({ conceptId: 'mens-cotton-shirt', responses: 19, enough: false });
    const empty = body.results.find((c) => c.conceptId === 'mens-relaxed-pant');
    expect(empty).toEqual({ conceptId: 'mens-relaxed-pant', responses: 0, enough: false });
  });
});

describe('GET /api/results: a Concept with exactly 20 responses', () => {
  beforeEach(async () => {
    await seed(20, (i) => ({
      verdict: i < 10 ? 'would_wear' : i < 16 ? 'maybe' : 'not_for_me', // 10 / 6 / 4
      colour: i < 12 ? 'clay' : 'flax',
      // 5 in the top band, 3 in another, 12 skips: skips outnumber every band but never decide it.
      priceBandId: i < 5 ? 'mcs-1500-1999' : i < 8 ? 'mcs-2000-2499' : null,
      priceSkipped: i >= 8,
      priorities: i < 10 ? ['softness', 'breathability'] : ['softness'],
    }));
  });

  it('includes percentages that sum to 100, the leading colour, top band and priorities', async () => {
    const res = await handler(db, fakeCache())({ request: get(), env: ENV });
    const r = shirt(await fetchBody(res));
    expect(r.enough).toBe(true);
    expect(r.responses).toBe(20);
    expect(r.verdicts).toEqual({ would_wear: 50, maybe: 30, not_for_me: 20 });
    expect(Object.values(r.verdicts ?? {}).reduce((a, b) => a + b, 0)).toBe(100);
    expect(r.leadingColour).toBe('clay');
    expect(r.topPriceBandId).toBe('mcs-1500-1999');
    expect(r.priceAnswers).toBe(8);
    expect(r.priceSkips).toBe(12);
    expect(r.topPriorities).toEqual(['softness']);
  });

  it('keeps the other Concepts at the threshold gate', async () => {
    const body = await fetchBody(await handler(db, fakeCache())({ request: get(), env: ENV }));
    const others = body.results.filter((c) => c.conceptId !== 'mens-cotton-shirt');
    expect(others).toHaveLength(4);
    for (const c of others) expect(c).toEqual({ conceptId: c.conceptId, responses: 0, enough: false });
  });
});

describe('GET /api/results: caching', () => {
  it('serves a second request from the cache without querying D1', async () => {
    await seed(20);
    const spy = counting(db);
    const cache = fakeCache();
    let clock = T0;
    const h = handler(spy, cache, () => clock);

    const first = await h({ request: get(), env: ENV });
    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toBe(RESULTS_CACHE_CONTROL);
    expect(RESULTS_CACHE_CONTROL).toBe('public, max-age=300');
    expect(cache.size()).toBe(1);
    const callsAfterFirst = spy.calls();
    expect(callsAfterFirst).toBeGreaterThan(0);

    // New feedback and a later clock: the cached answer must not change.
    await upsertFeedback(db, row(500, { verdict: 'not_for_me' }));
    clock = new Date(T0.getTime() + 2 * 60 * 1000);
    const second = await h({ request: get(), env: ENV });

    expect(spy.calls()).toBe(callsAfterFirst);
    expect(second.headers.get('Cache-Control')).toBe(RESULTS_CACHE_CONTROL);
    const a = await fetchBody(first);
    const b = await fetchBody(second);
    expect(b).toEqual(a);
    expect(b.computedAt).toBe(T0.toISOString());
    expect(shirt(b).responses).toBe(20);
  });

  it('does not cache an error', async () => {
    const cache = fakeCache();
    const broken: D1Like = {
      prepare() {
        throw new Error('D1 down');
      },
      batch: () => Promise.reject(new Error('D1 down')),
    };
    const res = await handler(broken, cache)({ request: get(), env: ENV });
    expect(res.status).toBe(503);
    expect(cache.size()).toBe(0);
  });

  it('rate limits cache misses with 429 and Retry-After', async () => {
    let last: Response | undefined;
    for (let i = 0; i < 31; i += 1) {
      last = await handler(db, fakeCache())({ request: get(), env: ENV }); // empty cache each time = always a miss
      if (i < 30) expect(last.status).toBe(200);
    }
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(await last?.json()).toMatchObject({ ok: false, error: 'rate_limited' });
  });
});

describe('GET /api/results: errors and methods', () => {
  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('answers %s with 405 method_not_allowed', async (method) => {
    const spy = counting(db);
    const res = await handler(spy, fakeCache())({ request: get({ method }), env: ENV });
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET');
    expect(await res.json()).toMatchObject({ ok: false, error: 'method_not_allowed' });
    expect(spy.calls()).toBe(0);
  });

  it('answers 503 results_unavailable when D1 throws', async () => {
    const broken: D1Like = {
      prepare() {
        throw new Error('D1_ERROR: daily limit');
      },
      batch: () => Promise.reject(new Error('D1_ERROR')),
    };
    const res = await handler(broken, fakeCache())({ request: get(), env: ENV });
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: false, error: 'results_unavailable' });
  });

  it('answers 503 when a query rejects after the rate limit passed', async () => {
    const failing: D1Like = {
      prepare(sql) {
        if (sql.includes('FROM concept_feedback')) throw new Error('query failed');
        return db.prepare(sql);
      },
      batch: (s) => db.batch(s),
    };
    const res = await handler(failing, fakeCache())({ request: get(), env: ENV });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'results_unavailable' });
  });
});

describe('GET /api/results: CORS', () => {
  it('echoes an allowed Origin, never *, and always sets Vary: Origin', async () => {
    const cache = fakeCache();
    const h = handler(db, cache);
    const allowed = await h({ request: get({ origin: ORIGIN }), env: ENV });
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(allowed.headers.get('Vary')).toMatch(/Origin/i);

    // Same cache, so this is a hit: another Origin must not get the first one's header.
    const other = await h({ request: get({ origin: 'https://evil.example' }), env: ENV });
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(other.headers.get('Vary')).toMatch(/Origin/i);

    const none = await h({ request: get(), env: ENV });
    expect(none.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(none.headers.get('Vary')).toMatch(/Origin/i);
  });

  it('allows the configured preview origin', async () => {
    const preview = 'https://feature.moolresha-web.pages.dev';
    const res = await handler(db, fakeCache())({
      request: get({ origin: preview }),
      env: { ...ENV, PREVIEW_ORIGIN: preview },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(preview);
  });

  it('adds CORS to error responses too', async () => {
    const res = await handler(db, fakeCache())({ request: get({ method: 'POST', origin: ORIGIN }), env: ENV });
    expect(res.status).toBe(405);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });
});

describe('GET /api/results: privacy of the public body', () => {
  it('never contains Anonymous_IDs, free text or contact strings', async () => {
    await seed(25, (i) => ({
      verdict: 'would_wear',
      colour: 'meadow',
      priceBandId: 'mcs-1000-1499',
      priorities: ['softness'],
      changes: ['other'],
      otherText: SECRET_TEXT,
      anonId: anon(i + 1000),
    }));
    await seed(3, (i) => ({ conceptId: 'womens-coord-set', anonId: anon(i + 2000) }));

    const res = await handler(db, fakeCache())({ request: get(), env: ENV });
    const text = await res.text();

    expect(text).not.toMatch(/anon/i);
    expect(text).not.toMatch(/otherText|other_text/i);
    expect(text).not.toContain('jane@example.com');
    expect(text).not.toContain('+919876543210');
    expect(text).not.toContain('call me');
    expect(text).not.toMatch(/00000000-0000-4000-8000/);
    expect(text).not.toContain('@');

    // Only the documented keys appear on a Concept result.
    const allowedKeys = new Set([
      'conceptId',
      'responses',
      'enough',
      'verdicts',
      'leadingColour',
      'topPriceBandId',
      'priceAnswers',
      'priceSkips',
      'topPriorities',
    ]);
    const body = JSON.parse(text) as ResultsBody;
    expect(Object.keys(body).sort()).toEqual(['computedAt', 'ok', 'results']);
    for (const c of body.results) for (const k of Object.keys(c)) expect(allowedKeys.has(k)).toBe(true);
  });
});
