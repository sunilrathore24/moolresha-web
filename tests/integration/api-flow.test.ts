/**
 * Task 18.2 (optional): API flow integration tests.
 *
 * IMPORTANT: THIS IS NOT THE WORKERS RUNTIME.
 * The design asks for Miniflare or @cloudflare/vitest-pool-workers. Neither package is installed in
 * this repo and this task must not install packages, so these are HANDLER-LEVEL integration tests:
 *   - They import the real Pages Function handlers from functions/ (feedback, interest, results, admin
 *     exports) and run them in Node with the real shared pipeline (origin, content type, body cap,
 *     rate limit, validation, Turnstile, storage).
 *   - The database is the real migrations/0001_init.sql, applied to better-sqlite3 through
 *     tests/support/d1-sqlite.ts (a D1-shaped adapter). It is SQLite, not workerd's D1.
 *   - Turnstile and MailerLite are an injected fake fetch. Any other URL makes the fake throw, and the
 *     global fetch is replaced with a function that throws, so a test cannot reach the network.
 *   - The Cache API is an in-memory fake with the same match/put shape as caches.default.
 * What this does NOT prove: workerd compatibility, real D1 behaviour and limits, the real Cache API,
 * Pages routing, headers added by Cloudflare, or the Turnstile always-pass test keys. Those still need a
 * Miniflare / `wrangler pages dev` run or the staging check in the launch checklist.
 *
 * Requirements 9.15, 12.7, 16.4, 17.1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCsv } from '../../src/lib/csv';
import { NOTICE_VERSION } from '../../src/lib/notice-version';
import { createAggregateCsvHandler } from '../../functions/api/admin/export/aggregate.csv';
import { createFeedbackCsvHandler, FEEDBACK_CSV_HEADER } from '../../functions/api/admin/export/feedback.csv';
import { createFeedbackHandler } from '../../functions/api/feedback';
import { createInterestHandler } from '../../functions/api/interest';
import { createResultsHandler, type ResultsBody, type ResultsCache } from '../../functions/api/results';
import type { D1Like } from '../../functions/_shared/db';
import type { Env } from '../../functions/_shared/env';
import { TURNSTILE_VERIFY_URL } from '../../functions/_shared/turnstile';
import { createTestD1, type SqliteD1 } from '../support/d1-sqlite';

// ---------------------------------------------------------------------------
// Test-only values. No real secrets, people or hosts.
// ---------------------------------------------------------------------------

const ORIGIN = 'https://www.moolresha.com';
const NOW = new Date('2026-11-20T10:00:00.000Z');
const BEARER = 'integration-test-bearer-not-a-secret';
const ANON = '3f2b8c1e-9a4d-4b7e-8f21-6c0d5e4a9b13';
const EMAIL = 'reader@example.test';
const PHONE = '+919812345678';
const BAND = 'mcs-1500-1999';

const anon = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

const env = (db: D1Like): Env =>
  ({
    DB: db,
    TURNSTILE_SECRET: 'test-turnstile-secret',
    MAILERLITE_API_KEY: 'test-ml-key',
    ADMIN_BEARER_SECRET: BEARER,
    IDENTITY_SALT_SEED: 'test-salt-seed',
    ML_GROUP_ID: 'group-1',
  }) as unknown as Env;

// ---------------------------------------------------------------------------
// Fake network: Turnstile and MailerLite only. Anything else throws.
// ---------------------------------------------------------------------------

interface FakeNet {
  turnstile: () => Response;
  mailerlite: () => Response | Promise<Response>;
}

const turnstileOk = () =>
  new Response(JSON.stringify({ success: true, hostname: 'www.moolresha.com', 'error-codes': [] }), { status: 200 });
const turnstileFail = () =>
  new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 });
const mlOk = () => new Response('{}', { status: 200 });

function fakeFetch(net: Partial<FakeNet> = {}) {
  const behave: FakeNet = { turnstile: turnstileOk, mailerlite: mlOk, ...net };
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === TURNSTILE_VERIFY_URL) return behave.turnstile();
    if (url.startsWith('https://connect.mailerlite.com/')) return behave.mailerlite();
    throw new Error(`integration test tried an unexpected URL: ${url}`);
  });
}
const mlCalls = (f: ReturnType<typeof fakeFetch>) => f.mock.calls.filter(([u]) => String(u).includes('mailerlite'));
const tsCalls = (f: ReturnType<typeof fakeFetch>) => f.mock.calls.filter(([u]) => u === TURNSTILE_VERIFY_URL);

/** In-memory stand-in for caches.default. */
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

/** Counts every prepare() call, so a cache hit can be shown to leave D1 alone. */
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

interface ReqInit {
  method?: string;
  body?: unknown;
  ip?: string;
  headers?: Record<string, string>;
  origin?: string | null;
}
function request(path: string, o: ReqInit = {}): Request {
  const method = o.method ?? 'POST';
  const headers = new Headers({ 'CF-Connecting-IP': o.ip ?? '203.0.113.10', 'User-Agent': 'integration-test' });
  if (o.origin !== null) headers.set('Origin', o.origin ?? ORIGIN);
  if (method === 'POST') headers.set('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(o.headers ?? {})) headers.set(k, v);
  return new Request(`https://www.moolresha.com${path}`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(o.body ?? {}) : undefined,
  });
}

const feedbackBody = (over: Record<string, unknown> = {}) => ({
  anonId: ANON,
  conceptId: 'mens-cotton-shirt',
  verdict: 'would_wear',
  changes: [],
  priorities: [],
  turnstileToken: 'token-1',
  ...over,
});

const interestBody = (over: Record<string, unknown> = {}) => ({
  anonId: ANON,
  email: EMAIL,
  size: 'm',
  consents: { email: true, whatsapp: false, link: false, adult: true },
  noticeVersion: NOTICE_VERSION,
  turnstileToken: 'token-1',
  ...over,
});

const count = (db: SqliteD1, table: string): number =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

let db: SqliteD1;
let realFetch: typeof fetch;
beforeEach(() => {
  db = createTestD1();
  // Belt and braces: nothing in these tests may use the real network.
  realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('the global fetch must not be used in integration tests');
    }),
  );
  for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  globalThis.fetch = realFetch;
  db.close();
});

// ===========================================================================
// 1. Feedback twice, then results, served from cache
// ===========================================================================

describe('feedback posted twice, then GET /api/results', () => {
  it('stores one row for the same Anonymous_ID and Concept, and the second answer wins', async () => {
    const net = fakeFetch();
    const feedback = createFeedbackHandler({ db, fetchImpl: net, now: () => NOW });

    const first = await feedback({ request: request('/api/feedback', { body: feedbackBody() }), env: env(db) });
    expect(first.status).toBe(200);
    const second = await feedback({
      request: request('/api/feedback', {
        body: feedbackBody({ verdict: 'maybe', priceBandId: BAND, turnstileToken: 'token-2' }),
      }),
      env: env(db),
    });
    expect(second.status).toBe(200);

    expect(count(db, 'concept_feedback')).toBe(1);
    const row = db.raw.prepare('SELECT verdict, price_band_id, price_skipped FROM concept_feedback').get() as {
      verdict: string;
      price_band_id: string | null;
      price_skipped: number;
    };
    expect(row).toEqual({ verdict: 'maybe', price_band_id: BAND, price_skipped: 0 });
    // Both submissions passed through Turnstile once each, and nothing else was called.
    expect(tsCalls(net)).toHaveLength(2);
    expect(net.mock.calls).toHaveLength(2);
    // Each successful submission counted one server-side event.
    const events = db.raw.prepare(`SELECT SUM(count) AS n FROM event_counts WHERE event = 'feedback_submitted'`).get() as {
      n: number;
    };
    expect(events.n).toBe(2);
  });

  it('a skip after a band replaces it: the row keeps price_skipped = 1 and no band', async () => {
    const feedback = createFeedbackHandler({ db, fetchImpl: fakeFetch(), now: () => NOW });
    await feedback({ request: request('/api/feedback', { body: feedbackBody({ priceBandId: BAND }) }), env: env(db) });
    await feedback({ request: request('/api/feedback', { body: feedbackBody({ priceSkipped: true }) }), env: env(db) });
    expect(count(db, 'concept_feedback')).toBe(1);
    expect(db.raw.prepare('SELECT price_band_id, price_skipped FROM concept_feedback').get()).toEqual({
      price_band_id: null,
      price_skipped: 1,
    });
  });

  it('results reflect the single stored response, and the second GET comes from the cache without touching D1', async () => {
    const feedback = createFeedbackHandler({ db, fetchImpl: fakeFetch(), now: () => NOW });
    await feedback({ request: request('/api/feedback', { body: feedbackBody() }), env: env(db) });
    await feedback({ request: request('/api/feedback', { body: feedbackBody({ verdict: 'maybe' }) }), env: env(db) });

    const spy = counting(db);
    const cache = fakeCache();
    let clock = NOW;
    const results = createResultsHandler({ db: spy, cache, now: () => clock });
    const get = () => results({ request: request('/api/results', { method: 'GET', origin: null }), env: env(db) });

    const a = await get();
    expect(a.status).toBe(200);
    const bodyA = (await a.json()) as ResultsBody;
    const shirt = bodyA.results.find((r) => r.conceptId === 'mens-cotton-shirt')!;
    expect(shirt).toEqual({ conceptId: 'mens-cotton-shirt', responses: 1, enough: false });
    expect(bodyA.computedAt).toBe(NOW.toISOString());
    expect(cache.size()).toBe(1);
    const callsAfterFirst = spy.calls();
    expect(callsAfterFirst).toBeGreaterThan(0);

    // More feedback arrives and time passes, but the cached answer is served unchanged.
    await feedback({
      request: request('/api/feedback', { body: feedbackBody({ anonId: anon(2) }), ip: '203.0.113.20' }),
      env: env(db),
    });
    clock = new Date(NOW.getTime() + 2 * 60_000);
    const b = await get();
    expect(spy.calls()).toBe(callsAfterFirst);
    expect(b.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect((await b.json()) as ResultsBody).toEqual(bodyA);
    expect(count(db, 'concept_feedback')).toBe(2);
  });

  it('from 20 different people results show percentages that sum to 100 and carry no identifiers', async () => {
    const feedback = createFeedbackHandler({ db, fetchImpl: fakeFetch(), now: () => NOW });
    for (let i = 0; i < 20; i += 1) {
      const res = await feedback({
        request: request('/api/feedback', {
          ip: `198.51.100.${i + 1}`, // a different client each time, so the per-client limit is not hit
          body: feedbackBody({
            anonId: anon(i),
            verdict: i < 10 ? 'would_wear' : i < 16 ? 'maybe' : 'not_for_me',
            priceBandId: i < 5 ? BAND : undefined,
            priceSkipped: i >= 5 && i < 8 ? true : undefined,
            otherText: i === 0 ? 'call me on +919876543210' : undefined,
            changes: i === 0 ? ['other'] : [],
          }),
        }),
        env: env(db),
      });
      expect(res.status, `post ${i}`).toBe(200);
    }
    const results = createResultsHandler({ db, cache: fakeCache(), now: () => NOW });
    const res = await results({ request: request('/api/results', { method: 'GET', origin: null }), env: env(db) });
    const text = await res.text();
    const body = JSON.parse(text) as ResultsBody;
    const shirt = body.results.find((r) => r.conceptId === 'mens-cotton-shirt')!;
    expect(shirt.enough).toBe(true);
    expect(shirt.responses).toBe(20);
    expect(shirt.verdicts).toEqual({ would_wear: 50, maybe: 30, not_for_me: 20 });
    expect(shirt.topPriceBandId).toBe(BAND);
    expect(shirt.priceAnswers).toBe(5);
    expect(shirt.priceSkips).toBe(3);
    // Public results never hold an Anonymous_ID or free text.
    expect(text).not.toContain('00000000-0000-4000');
    expect(text).not.toContain('+919876543210');
  });

  it('rejects a feedback post from another origin and from a missing Turnstile pass, storing nothing', async () => {
    const bad = fakeFetch({ turnstile: turnstileFail });
    const feedback = createFeedbackHandler({ db, fetchImpl: bad, now: () => NOW });
    const wrongOrigin = await feedback({
      request: request('/api/feedback', { body: feedbackBody(), origin: 'https://evil.example' }),
      env: env(db),
    });
    expect(wrongOrigin.status).toBe(403);
    expect(((await wrongOrigin.json()) as { error: string }).error).toBe('origin_not_allowed');
    expect(tsCalls(bad)).toHaveLength(0);

    const botCheck = await feedback({ request: request('/api/feedback', { body: feedbackBody() }), env: env(db) });
    expect(botCheck.status).toBe(403);
    expect(((await botCheck.json()) as { error: string }).error).toBe('bot_check_failed');
    expect(count(db, 'concept_feedback')).toBe(0);
  });
});

// ===========================================================================
// 2. Interest with stubbed Turnstile and MailerLite
// ===========================================================================

describe('POST /api/interest with stubbed Turnstile and MailerLite', () => {
  it('stores the interest row and consents, and subscribes the email as unconfirmed with no IP', async () => {
    const net = fakeFetch();
    const interest = createInterestHandler({ db, fetchImpl: net, now: () => NOW });
    const res = await interest({ request: request('/api/interest', { body: interestBody() }), env: env(db) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; emailConfirmation: string };
    expect(body).toMatchObject({ ok: true, emailConfirmation: 'sent' });

    // Database
    const row = db.raw.prepare('SELECT email, phone, size, ml_sync, linked, anon_id FROM interest').get() as Record<
      string,
      unknown
    >;
    expect(row).toEqual({ email: EMAIL, phone: null, size: 'm', ml_sync: 'sent', linked: 0, anon_id: null });
    const consents = db.raw
      .prepare('SELECT consent_type, granted, notice_version FROM consents ORDER BY id')
      .all() as Array<{ consent_type: string; granted: number; notice_version: string }>;
    expect(consents).toEqual([
      { consent_type: 'email', granted: 1, notice_version: NOTICE_VERSION },
      { consent_type: 'adult', granted: 1, notice_version: NOTICE_VERSION },
    ]);
    const events = db.raw.prepare(`SELECT SUM(count) AS n FROM event_counts WHERE event = 'interest_submitted'`).get() as {
      n: number;
    };
    expect(events.n).toBe(1);

    // Turnstile was asked once, MailerLite once, and the request was built as designed.
    expect(tsCalls(net)).toHaveLength(1);
    const ml = mlCalls(net);
    expect(ml).toHaveLength(1);
    const [url, init] = ml[0] as [string, RequestInit];
    expect(url).toBe('https://connect.mailerlite.com/api/subscribers');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-ml-key');
    const sentToMl = JSON.parse(init.body as string);
    expect(sentToMl).toEqual({ email: EMAIL, groups: ['group-1'], status: 'unconfirmed', fields: { size: 'm' } });
    expect(JSON.stringify(sentToMl)).not.toContain('203.0.113');
  });

  it('keeps the answer anonymous without link consent, and links it only with link consent', async () => {
    const interest = createInterestHandler({ db, fetchImpl: fakeFetch(), now: () => NOW });
    await interest({ request: request('/api/interest', { body: interestBody() }), env: env(db) });
    expect((db.raw.prepare('SELECT anon_id, linked FROM interest').get() as { anon_id: unknown; linked: number })).toEqual({
      anon_id: null,
      linked: 0,
    });

    const db2 = createTestD1();
    try {
      const interest2 = createInterestHandler({ db: db2, fetchImpl: fakeFetch(), now: () => NOW });
      await interest2({
        request: request('/api/interest', {
          body: interestBody({ consents: { email: true, whatsapp: false, link: true, adult: true } }),
        }),
        env: env(db2),
      });
      expect(db2.raw.prepare('SELECT anon_id, linked FROM interest').get()).toEqual({ anon_id: ANON, linked: 1 });
    } finally {
      db2.close();
    }
  });

  it('a WhatsApp-only submission stores the normalised number and never calls MailerLite', async () => {
    const net = fakeFetch();
    const interest = createInterestHandler({ db, fetchImpl: net, now: () => NOW });
    const res = await interest({
      request: request('/api/interest', {
        body: interestBody({
          email: undefined,
          whatsapp: '+91 98123-45678', // the island always sends the +91 prefix (whatsappForSubmit)
          consents: { email: false, whatsapp: true, link: false, adult: true },
        }),
      }),
      env: env(db),
    });
    expect(res.status).toBe(200);
    expect(db.raw.prepare('SELECT email, phone, ml_sync FROM interest').get()).toEqual({
      email: null,
      phone: PHONE,
      ml_sync: 'none',
    });
    expect(mlCalls(net)).toHaveLength(0);
  });

  it('a MailerLite 500 still answers 200, marks the row pending and says the email may be delayed', async () => {
    const net = fakeFetch({ mailerlite: () => new Response('{}', { status: 500 }) });
    const interest = createInterestHandler({ db, fetchImpl: net, now: () => NOW });
    const res = await interest({ request: request('/api/interest', { body: interestBody() }), env: env(db) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { emailConfirmation: string }).emailConfirmation).toBe('delayed');
    expect((db.raw.prepare('SELECT ml_sync FROM interest').get() as { ml_sync: string }).ml_sync).toBe('pending');
  });

  it('a failed Turnstile check stores nothing and never reaches MailerLite', async () => {
    const net = fakeFetch({ turnstile: turnstileFail });
    const interest = createInterestHandler({ db, fetchImpl: net, now: () => NOW });
    const res = await interest({ request: request('/api/interest', { body: interestBody() }), env: env(db) });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('bot_check_failed');
    expect(count(db, 'interest')).toBe(0);
    expect(count(db, 'consents')).toBe(0);
    expect(mlCalls(net)).toHaveLength(0);
  });

  it('an old notice version gets 409 before Turnstile is called; a missing consent gets 400 consent_required', async () => {
    const net = fakeFetch();
    const interest = createInterestHandler({ db, fetchImpl: net, now: () => NOW });
    const stale = await interest({
      request: request('/api/interest', { body: interestBody({ noticeVersion: 'old-version' }) }),
      env: env(db),
    });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: string }).error).toBe('notice_outdated');
    expect(tsCalls(net)).toHaveLength(0);

    const noConsent = await interest({
      request: request('/api/interest', {
        body: interestBody({ consents: { email: false, whatsapp: false, link: false, adult: true } }),
      }),
      env: env(db),
    });
    expect(noConsent.status).toBe(400);
    expect(((await noConsent.json()) as { error: string }).error).toBe('consent_required');
    expect(count(db, 'interest')).toBe(0);
  });

  it('answers 429 after three submissions from one client within the hour', async () => {
    const interest = createInterestHandler({ db, fetchImpl: fakeFetch(), now: () => NOW });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await interest({
        request: request('/api/interest', { body: interestBody({ email: `p${i}@example.test` }) }),
        env: env(db),
      });
      statuses.push(res.status);
      if (res.status === 429) expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

// ===========================================================================
// 3. Admin export with and without the bearer token
// ===========================================================================

describe('admin CSV export', () => {
  const bearer = { Authorization: `Bearer ${BEARER}` };
  const adminGet = (path: string, headers: Record<string, string> = {}) =>
    request(path, { method: 'GET', origin: null, headers });

  async function seedViaHandlers(): Promise<void> {
    const feedback = createFeedbackHandler({ db, fetchImpl: fakeFetch(), now: () => NOW });
    const fb = await feedback({
      request: request('/api/feedback', {
        body: feedbackBody({ changes: ['other'], otherText: '=HYPERLINK("x")', priceBandId: BAND, colour: 'clay' }),
      }),
      env: env(db),
    });
    expect(fb.status).toBe(200);
    const interest = createInterestHandler({ db, fetchImpl: fakeFetch(), now: () => NOW });
    const int = await interest({
      request: request('/api/interest', {
        body: interestBody({
          whatsapp: '+91 98123-45678',
          consents: { email: true, whatsapp: true, link: true, adult: true },
        }),
      }),
      env: env(db),
    });
    expect(int.status).toBe(200);
    expect(count(db, 'interest')).toBe(1);
  }

  it('answers 401 without a token and 403 with a wrong one, on both endpoints, and returns no data', async () => {
    await seedViaHandlers();
    const handlers = [
      ['/api/admin/export/feedback.csv', createFeedbackCsvHandler({ now: () => NOW, db })],
      ['/api/admin/export/aggregate.csv', createAggregateCsvHandler({ now: () => NOW, db })],
    ] as const;
    for (const [path, h] of handlers) {
      const none = await h({ request: adminGet(path), env: env(db) });
      expect(none.status, path).toBe(401);
      const wrong = await h({ request: adminGet(path, { Authorization: 'Bearer nope' }), env: env(db) });
      expect(wrong.status, path).toBe(403);
      const text = (await none.text()) + (await wrong.text());
      expect(text).not.toContain(ANON);
    }
  });

  it('with the bearer token returns the feedback CSV: header, the stored row, no email or phone', async () => {
    await seedViaHandlers();
    const h = createFeedbackCsvHandler({ now: () => NOW, db });
    const res = await h({ request: adminGet('/api/admin/export/feedback.csv', bearer), env: env(db) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="feedback-20261120.csv"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const text = await res.text();
    const rows = parseCsv(text);
    expect(rows[0]).toEqual([...FEEDBACK_CSV_HEADER]);
    expect(rows).toHaveLength(2);
    const r = rows[1]!;
    expect(r[0]).toBe(ANON);
    expect(r[1]).toBe('mens-cotton-shirt');
    expect(r[7]).toBe(BAND);
    // Contact details from the interest form never appear in the feedback export.
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain('9812345678');
    // A spreadsheet formula in free text is neutralised, not exported raw at the start of a cell.
    expect(r[9]).not.toMatch(/^=/);
    expect(r[9]).toContain('HYPERLINK');
  });

  it('with the bearer token returns the aggregate CSV with the counts of what was posted', async () => {
    await seedViaHandlers();
    const h = createAggregateCsvHandler({ now: () => NOW, db });
    const res = await h({ request: adminGet('/api/admin/export/aggregate.csv', bearer), env: env(db) });
    expect(res.status).toBe(200);
    const rows = parseCsv(await res.text());
    expect(rows[0]).toEqual(['concept_id', 'question', 'answer', 'count']);
    const find = (q: string, a: string) =>
      rows.find((r) => r[0] === 'mens-cotton-shirt' && r[1] === q && r[2] === a)?.[3];
    expect(find('verdict', 'would_wear')).toBe('1');
    expect(find('price_band', BAND)).toBe('1');
    expect(find('price_skip', 'skipped')).toBe('0');
    expect(find('colour', 'clay')).toBe('1');
  });

  it('rejects a POST to an export with 405 even with a valid token', async () => {
    const h = createFeedbackCsvHandler({ now: () => NOW, db });
    const res = await h({
      request: request('/api/admin/export/feedback.csv', { method: 'POST', origin: null, headers: bearer }),
      env: env(db),
    });
    expect(res.status).toBe(405);
  });
});
