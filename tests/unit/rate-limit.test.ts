import { afterEach, describe, expect, it } from 'vitest';
import {
  CLEANUP_ONE_IN,
  RATE_LIMITS,
  createD1RateLimitStore,
  createMemoryRateLimitStore,
  rateLimit,
  windowStart,
  type RateLimitDecision,
  type RateLimitStore,
  type RouteName,
} from '../../functions/_shared/rate-limit';
import { createTestD1, type SqliteD1 } from '../support/d1-sqlite';

const NEVER_CLEAN = { random: () => 0.999 };
const ALWAYS_CLEAN = { random: () => 0 };

const dbs: SqliteD1[] = [];
afterEach(() => {
  while (dbs.length > 0) dbs.pop()?.close();
});

function d1Store(): { store: RateLimitStore; db: SqliteD1 } {
  const db = createTestD1();
  dbs.push(db);
  return { store: createD1RateLimitStore(db), db };
}

const stores: [string, () => RateLimitStore][] = [
  ['memory', () => createMemoryRateLimitStore()],
  ['d1', () => d1Store().store],
];

describe('windowStart', () => {
  it('rounds down to the window boundary', () => {
    expect(windowStart(1_000_000, 600)).toBe(999_600);
    expect(windowStart(999_600, 600)).toBe(999_600);
    expect(windowStart(999_599, 600)).toBe(999_000);
  });
});

describe.each(stores)('rateLimit with the %s store', (_name, make) => {
  const route: RouteName = 'frustration'; // 5 per 10 min
  const { limit, windowSec } = RATE_LIMITS[route];
  const t0 = windowStart(1_800_000_000, windowSec);

  it('allows up to the limit and then blocks', async () => {
    const store = make();
    for (let k = 1; k <= limit; k++) {
      const d = await rateLimit(store, route, 'id-a', t0 + k, NEVER_CLEAN);
      expect(d).toEqual({ allowed: true, limit, remaining: limit - k });
    }
    for (let k = 0; k < 3; k++) {
      const d = await rateLimit(store, route, 'id-a', t0 + 10 + k, NEVER_CLEAN);
      expect(d.allowed).toBe(false);
    }
  });

  it('starts counting from 1 again in the next window', async () => {
    const store = make();
    for (let k = 0; k <= limit; k++) await rateLimit(store, route, 'id-a', t0 + 1, NEVER_CLEAN);
    expect((await rateLimit(store, route, 'id-a', t0 + windowSec - 1, NEVER_CLEAN)).allowed).toBe(false);
    const next = await rateLimit(store, route, 'id-a', t0 + windowSec, NEVER_CLEAN);
    expect(next).toEqual({ allowed: true, limit, remaining: limit - 1 });
  });

  it('keeps identities independent', async () => {
    const store = make();
    for (let k = 0; k <= limit; k++) await rateLimit(store, route, 'id-a', t0, NEVER_CLEAN);
    expect((await rateLimit(store, route, 'id-a', t0, NEVER_CLEAN)).allowed).toBe(false);
    expect((await rateLimit(store, route, 'id-b', t0, NEVER_CLEAN)).allowed).toBe(true);
  });

  it('keeps routes independent', async () => {
    const store = make();
    for (let k = 0; k <= limit; k++) await rateLimit(store, route, 'id-a', t0, NEVER_CLEAN);
    expect((await rateLimit(store, route, 'id-a', t0, NEVER_CLEAN)).allowed).toBe(false);
    expect((await rateLimit(store, 'feedback', 'id-a', t0, NEVER_CLEAN)).allowed).toBe(true);
  });

  it('sends Retry-After equal to the rest of the window, at least 1 s', async () => {
    const store = make();
    for (let k = 0; k < limit; k++) await rateLimit(store, route, 'id-a', t0, NEVER_CLEAN);

    const early = await rateLimit(store, route, 'id-a', t0 + 100, NEVER_CLEAN);
    expect(early).toEqual({ allowed: false, limit, retryAfterSec: windowSec - 100 });

    const last = await rateLimit(store, route, 'id-a', t0 + windowSec - 1, NEVER_CLEAN);
    expect(last).toEqual({ allowed: false, limit, retryAfterSec: 1 });

    const fractional = await rateLimit(store, route, 'id-a', t0 + windowSec - 0.4, NEVER_CLEAN);
    expect(fractional.allowed).toBe(false);
    if (!fractional.allowed) expect(fractional.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it('throws for a route with no configured limit', async () => {
    const store = make();
    await expect(rateLimit(store, 'nope' as RouteName, 'id-a', t0)).rejects.toThrow(/No rate limit/);
  });

  it('honours custom limits', async () => {
    const store = make();
    const limits = { feedback: { limit: 1, windowSec: 30 } };
    expect((await rateLimit(store, 'feedback', 'x', 100, { ...NEVER_CLEAN, limits })).allowed).toBe(true);
    expect((await rateLimit(store, 'feedback', 'x', 101, { ...NEVER_CLEAN, limits })).allowed).toBe(false);
  });
});

describe('route config', () => {
  it('has a positive limit and window for every route', () => {
    for (const cfg of Object.values(RATE_LIMITS)) {
      expect(cfg.limit).toBeGreaterThan(0);
      expect(cfg.windowSec).toBeGreaterThan(0);
    }
  });
});

describe('in-memory and D1 stores agree', () => {
  it('gives the same decision for a mixed request sequence', async () => {
    const mem = createMemoryRateLimitStore();
    const { store: d1 } = d1Store();
    const limits = { events: { limit: 3, windowSec: 60 }, feedback: { limit: 2, windowSec: 120 } };
    const ids = ['a', 'b', 'c'];
    const routes: RouteName[] = ['events', 'feedback'];

    // Deterministic pseudo-random sequence (no Math.random, so the test is repeatable).
    let seed = 12345;
    const next = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };

    let now = 1_800_000_000;
    let denied = 0;
    for (let i = 0; i < 300; i++) {
      now += next(25);
      const route = routes[next(routes.length)] as RouteName;
      const id = ids[next(ids.length)] as string;
      const a: RateLimitDecision = await rateLimit(mem, route, id, now, { ...NEVER_CLEAN, limits });
      const b: RateLimitDecision = await rateLimit(d1, route, id, now, { ...NEVER_CLEAN, limits });
      expect(b).toEqual(a);
      if (!a.allowed) denied += 1;
    }
    expect(denied).toBeGreaterThan(0);
  });
});

describe('expiry cleanup', () => {
  const countRows = (db: SqliteD1): number =>
    (db.raw.prepare('SELECT COUNT(*) AS n FROM rate_limits').get() as { n: number }).n;

  it('D1 store deletes only expired rows', async () => {
    const { store, db } = d1Store();
    const now = 10_000;
    await store.increment('old1', 0, 600); // expires_at 600
    await store.increment('old2', 3_000, 600); // expires 3,600
    await store.increment('edge', now - 600, 600); // expires_at == now: not yet expired
    await store.increment('live', now, 600); // expires 10,600
    expect(countRows(db)).toBe(4);

    const deleted = await store.deleteExpired?.(now, 100);
    expect(deleted).toBe(2);
    const left = (db.raw.prepare('SELECT key FROM rate_limits ORDER BY key').all() as { key: string }[]).map((r) => r.key);
    expect(left).toEqual(['edge', 'live']);
  });

  it('D1 store respects the batch limit', async () => {
    const { store, db } = d1Store();
    for (let i = 0; i < 5; i++) await store.increment(`old${i}`, 0, 10);
    expect(await store.deleteExpired?.(1_000, 2)).toBe(2);
    expect(countRows(db)).toBe(3);
  });

  it('memory store deletes only expired rows', async () => {
    const store = createMemoryRateLimitStore();
    await store.increment('old', 0, 600);
    await store.increment('live', 10_000, 600);
    expect(await store.deleteExpired?.(10_000, 100)).toBe(1);
    expect(store.size()).toBe(1);
  });

  it('rateLimit runs cleanup when the draw hits, and keeps the current window', async () => {
    const { store, db } = d1Store();
    const { windowSec } = RATE_LIMITS.events;
    const now = 1_800_000_000;
    await store.increment('events:stale', now - 10 * windowSec, windowSec);

    await rateLimit(store, 'events', 'fresh', now, NEVER_CLEAN);
    expect(countRows(db)).toBe(2); // no cleanup on a missed draw

    await rateLimit(store, 'events', 'fresh', now, ALWAYS_CLEAN);
    const keys = (db.raw.prepare('SELECT key, count FROM rate_limits').all() as { key: string; count: number }[]);
    expect(keys).toEqual([{ key: 'events:fresh', count: 2 }]);
  });

  it('the cleanup draw uses a 1-in-N chance', async () => {
    let calls = 0;
    const store: RateLimitStore = {
      increment: async () => 1,
      deleteExpired: async () => {
        calls += 1;
        return 0;
      },
    };
    await rateLimit(store, 'events', 'a', 1000, { random: () => 1 / CLEANUP_ONE_IN - 1e-9 });
    await rateLimit(store, 'events', 'a', 1000, { random: () => 1 / CLEANUP_ONE_IN });
    expect(calls).toBe(1);
  });

  it('a failing cleanup does not fail the request', async () => {
    const store: RateLimitStore = {
      increment: async () => 1,
      deleteExpired: async () => {
        throw new Error('boom');
      },
    };
    const d = await rateLimit(store, 'events', 'a', 1000, ALWAYS_CLEAN);
    expect(d.allowed).toBe(true);
  });
});
