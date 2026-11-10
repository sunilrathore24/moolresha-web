import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createFeedbackHandler } from '../../functions/api/feedback';
import { createFrustrationHandler } from '../../functions/api/frustration';
import type { D1Like } from '../../functions/_shared/db';
import type { Env } from '../../functions/_shared/env';
import { NO_JS_MESSAGE, type PipelineDeps } from '../../functions/_shared/pipeline';
import { createTestD1, type SqliteD1 } from '../support/d1-sqlite';

// Test-only placeholder values. No real secrets.
const ORIGIN = 'https://www.moolresha.com';
const ANON_A = '3f2b8c1e-9a4d-4b7e-8f21-6c0d5e4a9b13';
const ANON_B = '7d1c2e4f-0b5a-4c3d-9e8f-1a2b3c4d5e6f';
const TEST_IP = '203.0.113.77';
const TEST_UA = 'TestAgent/9.9 (unit-test-ua)';
const TOKEN = 'turnstile-token-value-xyz';
const NOW = new Date('2026-11-10T10:00:00.000Z');

const env = (db: D1Like): Env =>
  ({
    DB: db,
    TURNSTILE_SECRET: 'test-secret',
    MAILERLITE_API_KEY: 'test-ml-key',
    ADMIN_BEARER_SECRET: 'test-admin',
    IDENTITY_SALT_SEED: 'test-salt-seed',
    ML_GROUP_ID: 'group-1',
  }) as unknown as Env;

const turnstileOk = () =>
  new Response(JSON.stringify({ success: true, hostname: 'www.moolresha.com', 'error-codes': [] }), { status: 200 });
const turnstileFail = () =>
  new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 });

function mockFetch(respond: () => Response = turnstileOk) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => respond());
  return fn;
}

const feedbackBody = (over: Record<string, unknown> = {}) => ({
  anonId: ANON_A,
  conceptId: 'mens-cotton-shirt',
  verdict: 'would_wear',
  changes: ['fit', 'other'],
  otherText: 'Slightly longer sleeves',
  colour: 'clay',
  priorities: ['softness', 'no_shrinking'],
  priceBandId: 'mcs-1500-1999',
  utm: { source: 'instagram', medium: 'social', campaign: 'journey-01' },
  turnstileToken: TOKEN,
  ...over,
});

const frustrationBody = (over: Record<string, unknown> = {}) => ({
  anonId: ANON_A,
  chips: ['shrinks', 'other'],
  otherText: 'Collars curl',
  turnstileToken: TOKEN,
  ...over,
});

interface ReqOptions {
  method?: string;
  origin?: string | null;
  contentType?: string | null;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}

function makeRequest(path: string, o: ReqOptions = {}): Request {
  const headers = new Headers({ 'CF-Connecting-IP': TEST_IP, 'User-Agent': TEST_UA });
  if (o.origin !== null) headers.set('Origin', o.origin ?? ORIGIN);
  if (o.contentType !== null) headers.set('Content-Type', o.contentType ?? 'application/json');
  for (const [k, v] of Object.entries(o.headers ?? {})) headers.set(k, v);
  const method = o.method ?? 'POST';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const text = o.rawBody ?? (o.body !== undefined ? JSON.stringify(o.body) : '');
  return new Request(`https://www.moolresha.com${path}`, { method, headers, body: hasBody ? text : undefined });
}

const count = (db: SqliteD1, table: string): number =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

const eventCount = (db: SqliteD1, event: string): number =>
  (db.raw.prepare(`SELECT COALESCE(SUM(count), 0) AS n FROM event_counts WHERE event = ?`).get(event) as { n: number }).n;

let db: SqliteD1;
let logSpies: MockInstance<typeof console.log>[];

beforeEach(() => {
  db = createTestD1();
  logSpies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')].map((s) =>
    s.mockImplementation(() => {}),
  );
});
afterEach(() => {
  logSpies.forEach((s) => s.mockRestore());
  db.close();
});

function feedback(over: PipelineDeps = {}) {
  const fetchImpl = over.fetchImpl ?? mockFetch();
  const handler = createFeedbackHandler({ db, fetchImpl, now: () => NOW, ...over });
  return { fetchImpl, call: (req: Request) => handler({ request: req, env: env(over.db ?? db) }) };
}
function frustration(over: PipelineDeps = {}) {
  const fetchImpl = over.fetchImpl ?? mockFetch();
  const handler = createFrustrationHandler({ db, fetchImpl, now: () => NOW, ...over });
  return { fetchImpl, call: (req: Request) => handler({ request: req, env: env(over.db ?? db) }) };
}

const allLogged = (): string => logSpies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(' '))).join('\n');

describe('POST /api/feedback: success', () => {
  it('stores one row and one feedback_submitted event, and answers 200', async () => {
    const { call, fetchImpl } = feedback();
    const res = await call(makeRequest('/api/feedback', { body: feedbackBody() }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; storedAt: string };
    expect(body.ok).toBe(true);
    expect(body.storedAt).toBe(NOW.toISOString());
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    expect(count(db, 'concept_feedback')).toBe(1);
    expect(eventCount(db, 'feedback_submitted')).toBe(1);
    const row = db.raw.prepare('SELECT * FROM concept_feedback').get() as Record<string, unknown>;
    expect(row).toMatchObject({
      anon_id: ANON_A,
      concept_id: 'mens-cotton-shirt',
      verdict: 'would_wear',
      colour: 'clay',
      price_band_id: 'mcs-1500-1999',
      price_skipped: 0,
      other_text: 'Slightly longer sleeves',
      utm_source: 'instagram',
    });
    expect(row.priorities).toBe('no_shrinking|softness');
  });

  it('stores one row when the same Anonymous_ID submits twice for a Concept (upsert), replacing the answer', async () => {
    const { call } = feedback();
    expect((await call(makeRequest('/api/feedback', { body: feedbackBody() }))).status).toBe(200);
    const second = feedbackBody({ verdict: 'maybe', priceBandId: undefined, priceSkipped: true });
    expect((await call(makeRequest('/api/feedback', { body: second }))).status).toBe(200);

    expect(count(db, 'concept_feedback')).toBe(1);
    const row = db.raw.prepare('SELECT verdict, price_band_id, price_skipped FROM concept_feedback').get();
    expect(row).toEqual({ verdict: 'maybe', price_band_id: null, price_skipped: 1 });
    expect(eventCount(db, 'feedback_submitted')).toBe(2);
  });

  it('keeps separate rows for different Concepts and different Anonymous_IDs', async () => {
    const { call } = feedback();
    await call(makeRequest('/api/feedback', { body: feedbackBody() }));
    await call(makeRequest('/api/feedback', { body: feedbackBody({ conceptId: 'mens-relaxed-pant', priceBandId: 'mrp-1500-1999' }) }));
    await call(makeRequest('/api/feedback', { body: feedbackBody({ anonId: ANON_B }) }));
    expect(count(db, 'concept_feedback')).toBe(3);
  });

  it('stores a price band answer with price_skipped 0', async () => {
    const { call } = feedback();
    await call(makeRequest('/api/feedback', { body: feedbackBody() }));
    const row = db.raw.prepare('SELECT price_band_id, price_skipped FROM concept_feedback').get();
    expect(row).toEqual({ price_band_id: 'mcs-1500-1999', price_skipped: 0 });
  });

  it('stores an explicit skip as price_skipped 1 with no band', async () => {
    const { call } = feedback();
    await call(makeRequest('/api/feedback', { body: feedbackBody({ priceBandId: undefined, priceSkipped: true }) }));
    const row = db.raw.prepare('SELECT price_band_id, price_skipped FROM concept_feedback').get();
    expect(row).toEqual({ price_band_id: null, price_skipped: 1 });
  });

  it('stores a verdict-only answer with no band, no skip and empty chip sets', async () => {
    const { call } = feedback();
    const body = {
      anonId: ANON_A,
      conceptId: 'womens-coord-set',
      verdict: 'not_for_me',
      turnstileToken: TOKEN,
    };
    const res = await call(makeRequest('/api/feedback', { body }));
    expect(res.status).toBe(200);
    const row = db.raw.prepare('SELECT * FROM concept_feedback').get() as Record<string, unknown>;
    expect(row).toMatchObject({
      verdict: 'not_for_me',
      changes: '',
      priorities: '',
      colour: null,
      other_text: null,
      price_band_id: null,
      price_skipped: 0,
      utm_source: '',
    });
  });
});

describe('POST /api/feedback: rejections store nothing', () => {
  const expectNothingStored = () => {
    expect(count(db, 'concept_feedback')).toBe(0);
    expect(count(db, 'event_counts')).toBe(0);
  };

  it('405 for a non-POST method, with Allow: POST', async () => {
    const { call, fetchImpl } = feedback();
    const res = await call(makeRequest('/api/feedback', { method: 'GET' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
    expect(((await res.json()) as { error: string }).error).toBe('method_not_allowed');
    expect(fetchImpl).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('403 origin_not_allowed for a foreign Origin and for a missing Origin', async () => {
    const { call, fetchImpl } = feedback();
    for (const origin of ['https://evil.example', null]) {
      const res = await call(makeRequest('/api/feedback', { origin, body: feedbackBody() }));
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toBe('origin_not_allowed');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('415 JSON error for a non-JSON content type', async () => {
    const { call } = feedback();
    const res = await call(makeRequest('/api/feedback', { contentType: 'text/plain', rawBody: '{}' }));
    expect(res.status).toBe(415);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(((await res.json()) as { error: string }).error).toBe('unsupported_media_type');
    expectNothingStored();
  });

  it('415 JSON error when Content-Type is missing', async () => {
    const { call } = feedback();
    const res = await call(makeRequest('/api/feedback', { contentType: null, rawBody: '{}' }));
    expect(res.status).toBe(415);
    expectNothingStored();
  });

  it('415 HTML page for a plain form post (urlencoded and multipart)', async () => {
    const { call, fetchImpl } = feedback();
    for (const contentType of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=xyz']) {
      const res = await call(makeRequest('/api/feedback', { contentType, rawBody: 'verdict=maybe' }));
      expect(res.status).toBe(415);
      expect(res.headers.get('Content-Type')).toContain('text/html');
      const html = await res.text();
      expect(html).toContain(NO_JS_MESSAGE);
      expect(html).toContain('Feedback needs JavaScript turned on. You can still read everything on this page.');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('accepts application/json with a charset parameter', async () => {
    const { call } = feedback();
    const res = await call(makeRequest('/api/feedback', { contentType: 'application/json; charset=utf-8', body: feedbackBody() }));
    expect(res.status).toBe(200);
  });

  it('413 when Content-Length is over 8 KB', async () => {
    const { call } = feedback();
    const res = await call(
      makeRequest('/api/feedback', { body: feedbackBody(), headers: { 'Content-Length': String(8 * 1024 + 1) } }),
    );
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toBe('payload_too_large');
    expectNothingStored();
  });

  it('413 when the real body is over 8 KB, whatever Content-Length says', async () => {
    const { call, fetchImpl } = feedback();
    const big = JSON.stringify({ ...feedbackBody(), padding: 'x'.repeat(9 * 1024) });
    const res = await call(makeRequest('/api/feedback', { rawBody: big, headers: { 'Content-Length': '10' } }));
    expect(res.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('429 with Retry-After once the limit is passed, storing nothing for the denied request', async () => {
    const { call } = feedback({ rateLimitOptions: { limits: { feedback: { limit: 2, windowSec: 600 } } } });
    expect((await call(makeRequest('/api/feedback', { body: feedbackBody() }))).status).toBe(200);
    expect((await call(makeRequest('/api/feedback', { body: feedbackBody() }))).status).toBe(200);
    const res = await call(makeRequest('/api/feedback', { body: feedbackBody({ anonId: ANON_B }) }));
    expect(res.status).toBe(429);
    // NOW is 10:00:00 UTC, the 600 s window started at 10:00:00, so 600 s remain.
    expect(res.headers.get('Retry-After')).toBe('600');
    const body = (await res.json()) as { error: string; retryAfter: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfter).toBe(600);
    expect(count(db, 'concept_feedback')).toBe(1);
    expect(eventCount(db, 'feedback_submitted')).toBe(2);
  });

  it('rate limits per client identity, not globally', async () => {
    const { call } = feedback({ rateLimitOptions: { limits: { feedback: { limit: 1, windowSec: 600 } } } });
    expect((await call(makeRequest('/api/feedback', { body: feedbackBody() }))).status).toBe(200);
    expect((await call(makeRequest('/api/feedback', { body: feedbackBody() }))).status).toBe(429);
    const other = makeRequest('/api/feedback', { body: feedbackBody(), headers: { 'CF-Connecting-IP': '198.51.100.9' } });
    expect((await call(other)).status).toBe(200);
  });

  it('400 invalid_request with field names for bad bodies, and the Turnstile check is not called', async () => {
    const { call, fetchImpl } = feedback();
    const bad: Record<string, unknown>[] = [
      feedbackBody({ verdict: 'love_it' }),
      feedbackBody({ anonId: 'not-a-uuid' }),
      feedbackBody({ priceBandId: 'mrp-1500-1999' }), // band of another Concept
      feedbackBody({ priceSkipped: true }), // band and skip together
      feedbackBody({ price: 1500 }), // typed price is an unknown key
      feedbackBody({ otherText: undefined, changes: ['fit'], colour: 'pink' }),
    ];
    for (const body of bad) {
      const res = await call(makeRequest('/api/feedback', { body }));
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string; fields: Record<string, string> };
      expect(json.error).toBe('invalid_request');
      expect(Object.keys(json.fields).length).toBeGreaterThan(0);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('400 for a body that is not JSON', async () => {
    const { call } = feedback();
    const res = await call(makeRequest('/api/feedback', { rawBody: '{not json' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_request');
    expectNothingStored();
  });

  it('403 bot_check_failed when Turnstile refuses the token', async () => {
    const { call, fetchImpl } = feedback({ fetchImpl: mockFetch(turnstileFail) });
    const res = await call(makeRequest('/api/feedback', { body: feedbackBody() }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('bot_check_failed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expectNothingStored();
  });

  it('403 bot_check_failed when Turnstile is unreachable (fails closed)', async () => {
    const down = vi.fn(async () => {
      throw new Error('network down');
    });
    const { call } = feedback({ fetchImpl: down });
    const res = await call(makeRequest('/api/feedback', { body: feedbackBody() }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('bot_check_failed');
    expectNothingStored();
  });

  it('503 storage_unavailable when the D1 write fails, and nothing is stored', async () => {
    const failing: D1Like = {
      prepare: (sql) => db.prepare(sql),
      batch: async () => {
        throw new Error('D1_ERROR: daily limit exceeded');
      },
    };
    const { call } = feedback({ db: failing });
    const res = await call(makeRequest('/api/feedback', { body: feedbackBody() }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('storage_unavailable');
    expectNothingStored();
  });

  it('503 storage_unavailable when D1 is entirely down (rate limiter fails closed)', async () => {
    const dead: D1Like = {
      prepare: () => {
        throw new Error('D1 unavailable');
      },
      batch: async () => {
        throw new Error('D1 unavailable');
      },
    };
    const { call, fetchImpl } = feedback({ db: dead });
    const res = await call(makeRequest('/api/feedback', { body: feedbackBody() }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('storage_unavailable');
    expect(fetchImpl).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('answers a preflight for an allowed Origin and refuses one for a foreign Origin', async () => {
    const { call } = feedback();
    const ok = await call(makeRequest('/api/feedback', { method: 'OPTIONS', contentType: null }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Methods')).toBe('POST');
    const bad = await call(makeRequest('/api/feedback', { method: 'OPTIONS', origin: 'https://evil.example', contentType: null }));
    expect(bad.status).toBe(403);
  });
});

describe('POST /api/frustration', () => {
  it('stores one row and one frustration_submitted event', async () => {
    const { call } = frustration();
    const res = await call(makeRequest('/api/frustration', { body: frustrationBody() }));
    expect(res.status).toBe(200);
    expect(count(db, 'frustration')).toBe(1);
    expect(eventCount(db, 'frustration_submitted')).toBe(1);
    const row = db.raw.prepare('SELECT * FROM frustration').get() as Record<string, unknown>;
    expect(row).toMatchObject({ anon_id: ANON_A, chips: 'other|shrinks', other_text: 'Collars curl' });
  });

  it('keeps one row per Anonymous_ID and replaces the chips', async () => {
    const { call } = frustration();
    await call(makeRequest('/api/frustration', { body: frustrationBody() }));
    const res = await call(makeRequest('/api/frustration', { body: frustrationBody({ chips: ['fades'], otherText: undefined }) }));
    expect(res.status).toBe(200);
    expect(count(db, 'frustration')).toBe(1);
    const row = db.raw.prepare('SELECT chips, other_text FROM frustration').get();
    expect(row).toEqual({ chips: 'fades', other_text: null });
  });

  it('rejects bad input (400), foreign origin (403), JSON body over cap (413) and form posts (415 HTML)', async () => {
    const { call } = frustration();
    expect((await call(makeRequest('/api/frustration', { body: frustrationBody({ chips: [] }) }))).status).toBe(400);
    expect((await call(makeRequest('/api/frustration', { body: frustrationBody({ chips: ['fades', 'fades'] }) }))).status).toBe(400);
    expect((await call(makeRequest('/api/frustration', { body: frustrationBody(), origin: 'https://evil.example' }))).status).toBe(403);
    const big = JSON.stringify({ ...frustrationBody(), padding: 'x'.repeat(9 * 1024) });
    expect((await call(makeRequest('/api/frustration', { rawBody: big }))).status).toBe(413);
    const form = await call(makeRequest('/api/frustration', { contentType: 'application/x-www-form-urlencoded', rawBody: 'a=b' }));
    expect(form.status).toBe(415);
    expect(await form.text()).toContain(NO_JS_MESSAGE);
    expect(count(db, 'frustration')).toBe(0);
    expect(count(db, 'event_counts')).toBe(0);
  });

  it('uses its own, tighter rate limit (5 per window by default)', async () => {
    const { call } = frustration();
    for (let i = 0; i < 5; i++) {
      expect((await call(makeRequest('/api/frustration', { body: frustrationBody() }))).status).toBe(200);
    }
    const res = await call(makeRequest('/api/frustration', { body: frustrationBody() }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('403 bot_check_failed and 503 storage_unavailable store nothing', async () => {
    const bot = frustration({ fetchImpl: mockFetch(turnstileFail) });
    expect((await bot.call(makeRequest('/api/frustration', { body: frustrationBody() }))).status).toBe(403);

    const failing: D1Like = {
      prepare: (sql) => db.prepare(sql),
      batch: async () => {
        throw new Error('D1 down');
      },
    };
    const down = frustration({ db: failing });
    const res = await down.call(makeRequest('/api/frustration', { body: frustrationBody() }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('storage_unavailable');
    expect(count(db, 'frustration')).toBe(0);
    expect(count(db, 'event_counts')).toBe(0);
  });
});

describe('logging', () => {
  it('writes no personal data to the logs across success and every rejection path', async () => {
    const f = feedback({ rateLimitOptions: { limits: { feedback: { limit: 1, windowSec: 600 } } } });
    await f.call(makeRequest('/api/feedback', { body: feedbackBody() })); // 200
    await f.call(makeRequest('/api/feedback', { body: feedbackBody() })); // 429
    await f.call(makeRequest('/api/feedback', { method: 'GET' })); // 405
    await f.call(makeRequest('/api/feedback', { origin: 'https://evil.example', body: feedbackBody() })); // 403

    const bot = feedback({ fetchImpl: mockFetch(turnstileFail), db: createTestD1() });
    await bot.call(makeRequest('/api/feedback', { body: feedbackBody() })); // 403 bot

    const failing: D1Like = {
      prepare: (sql) => db.prepare(sql),
      batch: async () => {
        throw new Error(`boom ${ANON_A} ${TEST_IP} someone@example.in`);
      },
    };
    const down = feedback({ db: failing });
    await down.call(makeRequest('/api/feedback', { body: feedbackBody({ anonId: ANON_B }) })); // 503

    const logged = allLogged();
    for (const secret of [ANON_A, ANON_B, TEST_IP, TEST_UA, TOKEN, 'test-secret', 'someone@example.in', 'Slightly longer sleeves', 'instagram']) {
      expect(logged).not.toContain(secret);
    }
  });
});
