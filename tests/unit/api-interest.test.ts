import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createInterestHandler } from '../../functions/api/interest';
import type { D1Like } from '../../functions/_shared/db';
import type { Env } from '../../functions/_shared/env';
import { NO_JS_MESSAGE, type PipelineDeps } from '../../functions/_shared/pipeline';
import { NOTICE_VERSION } from '../../src/lib/notice-version';
import { createTestD1, type SqliteD1 } from '../support/d1-sqlite';

// Test-only placeholder values. No real secrets, no real people.
const ORIGIN = 'https://www.moolresha.com';
const ANON_A = '3f2b8c1e-9a4d-4b7e-8f21-6c0d5e4a9b13';
const ANON_B = '7d1c2e4f-0b5a-4c3d-9e8f-1a2b3c4d5e6f';
const TEST_IP = '203.0.113.77';
const TEST_UA = 'TestAgent/9.9 (unit-test-ua)';
const TOKEN = 'turnstile-token-value-xyz';
const EMAIL = 'a@example.test';
const PHONE_RAW = '+91 98123-45678';
const PHONE = '+919812345678';
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

type MlBehaviour = () => Response | Promise<Response>;

/** Routes Turnstile and MailerLite calls to separate behaviours. Nothing reaches the network. */
function mockFetch(opts: { turnstile?: () => Response; ml?: MlBehaviour } = {}) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes('mailerlite')) return (opts.ml ?? (() => new Response('{}', { status: 200 })))();
    return (opts.turnstile ?? turnstileOk)();
  });
}

const mlCalls = (f: ReturnType<typeof mockFetch>) => f.mock.calls.filter(([u]) => String(u).includes('mailerlite'));

const interestBody = (over: Record<string, unknown> = {}) => ({
  anonId: ANON_A,
  email: EMAIL,
  whatsapp: PHONE_RAW,
  size: 'm',
  consents: { email: true, whatsapp: true, link: false, adult: true },
  noticeVersion: NOTICE_VERSION,
  utm: { source: 'instagram', medium: 'social', campaign: 'journey-01' },
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

function makeRequest(o: ReqOptions = {}): Request {
  const headers = new Headers({ 'CF-Connecting-IP': TEST_IP, 'User-Agent': TEST_UA });
  if (o.origin !== null) headers.set('Origin', o.origin ?? ORIGIN);
  if (o.contentType !== null) headers.set('Content-Type', o.contentType ?? 'application/json');
  for (const [k, v] of Object.entries(o.headers ?? {})) headers.set(k, v);
  const method = o.method ?? 'POST';
  const text = o.rawBody ?? (o.body !== undefined ? JSON.stringify(o.body) : '');
  return new Request('https://www.moolresha.com/api/interest', {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : text,
  });
}

const count = (db: SqliteD1, table: string): number =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

const eventCount = (db: SqliteD1, event: string): number =>
  (db.raw.prepare(`SELECT COALESCE(SUM(count), 0) AS n FROM event_counts WHERE event = ?`).get(event) as { n: number }).n;

const interestRows = (db: SqliteD1) => db.raw.prepare('SELECT * FROM interest ORDER BY id').all() as Record<string, unknown>[];

const consentRows = (db: SqliteD1) =>
  db.raw
    .prepare('SELECT consent_type, granted, notice_version, recorded_at FROM consents ORDER BY id')
    .all() as { consent_type: string; granted: number; notice_version: string; recorded_at: string }[];

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

function interest(over: PipelineDeps = {}) {
  const fetchImpl = over.fetchImpl ?? mockFetch();
  const handler = createInterestHandler({ db, fetchImpl, now: () => NOW, ...over });
  return {
    fetchImpl: fetchImpl as ReturnType<typeof mockFetch>,
    call: (req: Request) => handler({ request: req, env: env(over.db ?? db) }),
  };
}

const post = (body: unknown) => makeRequest({ body });
const allLogged = (): string => logSpies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(' '))).join('\n');

describe('POST /api/interest: what is stored', () => {
  it('email only: stores email, no phone, subscribes at MailerLite and sets ml_sync sent', async () => {
    const { call, fetchImpl } = interest();
    const body = interestBody({
      whatsapp: undefined,
      size: undefined,
      consents: { email: true, whatsapp: false, link: false, adult: true },
    });
    const res = await call(post(body));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; storedAt: string; emailConfirmation: string };
    expect(json).toMatchObject({ ok: true, storedAt: NOW.toISOString(), emailConfirmation: 'sent' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const rows = interestRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: EMAIL, phone: null, size: null, ml_sync: 'sent', linked: 0, anon_id: null });
    expect(mlCalls(fetchImpl)).toHaveLength(1);
    expect(eventCount(db, 'interest_submitted')).toBe(1);
  });

  it('WhatsApp only: stores the normalised phone, no email, and makes no MailerLite call', async () => {
    const { call, fetchImpl } = interest();
    const body = interestBody({
      email: undefined,
      size: undefined,
      consents: { email: false, whatsapp: true, link: false, adult: true },
    });
    const res = await call(post(body));
    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, unknown>).emailConfirmation).toBeUndefined();

    expect(interestRows(db)[0]).toMatchObject({ email: null, phone: PHONE, ml_sync: 'none' });
    expect(mlCalls(fetchImpl)).toHaveLength(0);
    expect(eventCount(db, 'interest_submitted')).toBe(1);
  });

  it('size only: stores a row with no contact data, no consent rows and no MailerLite call', async () => {
    const { call, fetchImpl } = interest();
    const body = interestBody({
      email: undefined,
      whatsapp: undefined,
      consents: { email: false, whatsapp: false, link: false, adult: false },
    });
    const res = await call(post(body));
    expect(res.status).toBe(200);
    expect(interestRows(db)).toHaveLength(1);
    expect(interestRows(db)[0]).toMatchObject({ email: null, phone: null, size: 'm', ml_sync: 'none', anon_id: null, linked: 0 });
    expect(consentRows(db)).toHaveLength(0);
    expect(mlCalls(fetchImpl)).toHaveLength(0);
    expect(eventCount(db, 'interest_submitted')).toBe(1);
  });

  it('size only with link consent stores the anon_id and one link consent row', async () => {
    const { call } = interest();
    const body = interestBody({
      email: undefined,
      whatsapp: undefined,
      consents: { email: false, whatsapp: false, link: true, adult: false },
    });
    expect((await call(post(body))).status).toBe(200);
    expect(interestRows(db)[0]).toMatchObject({ anon_id: ANON_A, linked: 1, size: 'm' });
    expect(consentRows(db).map((c) => c.consent_type)).toEqual(['link']);
  });

  it('both email and WhatsApp: stores both on one row', async () => {
    const { call, fetchImpl } = interest();
    const res = await call(post(interestBody()));
    expect(res.status).toBe(200);
    const rows = interestRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: EMAIL, phone: PHONE, size: 'm', utm_source: 'instagram', ml_sync: 'sent' });
    expect(mlCalls(fetchImpl)).toHaveLength(1);
  });

  it('sends only email, group, status and size to MailerLite, never the phone or anonymous id', async () => {
    const { call, fetchImpl } = interest();
    await call(post(interestBody({ consents: { email: true, whatsapp: true, link: true, adult: true } })));
    const [url, init] = mlCalls(fetchImpl)[0] as [string, RequestInit];
    expect(url).toBe('https://connect.mailerlite.com/api/subscribers');
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent).toEqual({ email: EMAIL, groups: ['group-1'], status: 'unconfirmed', fields: { size: 'm' } });
    expect(String(init.body)).not.toContain('98123');
    expect(String(init.body)).not.toContain(ANON_A);
  });

  it('stores anon_id only with link consent, and NULL without it', async () => {
    const withLink = interest();
    await withLink.call(post(interestBody({ consents: { email: true, whatsapp: true, link: true, adult: true } })));
    expect(interestRows(db)[0]).toMatchObject({ anon_id: ANON_A, linked: 1 });

    const db2 = createTestD1();
    const noLink = interest({ db: db2 });
    await noLink.call(post(interestBody({ anonId: ANON_B })));
    expect(interestRows(db2)[0]).toMatchObject({ anon_id: null, linked: 0 });
    expect(JSON.stringify(interestRows(db2))).not.toContain(ANON_B);
    db2.close();
  });

  it('records one consent row per ticked consent, with the notice version and timestamp', async () => {
    const { call } = interest();
    await call(post(interestBody({ consents: { email: true, whatsapp: true, link: true, adult: true } })));
    const rows = consentRows(db);
    expect(rows.map((r) => r.consent_type)).toEqual(['email', 'whatsapp', 'link', 'adult']);
    for (const r of rows) {
      expect(r).toMatchObject({ granted: 1, notice_version: NOTICE_VERSION, recorded_at: NOW.toISOString() });
    }
  });

  it('records no row for a consent left unticked', async () => {
    const { call } = interest();
    await call(post(interestBody({ consents: { email: true, whatsapp: true, link: false, adult: true } })));
    expect(consentRows(db).map((r) => r.consent_type)).toEqual(['email', 'whatsapp', 'adult']);
  });

  it('email-only submission records email and adult consents, not WhatsApp or link', async () => {
    const { call } = interest();
    const body = interestBody({
      whatsapp: undefined,
      consents: { email: true, whatsapp: false, link: false, adult: true },
    });
    await call(post(body));
    expect(consentRows(db).map((r) => r.consent_type)).toEqual(['email', 'adult']);
  });

  it('a repeat submission with the same email keeps one interest row and appends a new consent set', async () => {
    const { call } = interest();
    await call(post(interestBody()));
    await call(post(interestBody({ whatsapp: undefined, size: 'l' })));
    expect(interestRows(db)).toHaveLength(1);
    expect(consentRows(db).length).toBeGreaterThan(3);
    expect(eventCount(db, 'interest_submitted')).toBe(2);
  });
});

describe('POST /api/interest: MailerLite outcomes never fail the request', () => {
  const emailOnly = () =>
    interestBody({ whatsapp: undefined, consents: { email: true, whatsapp: false, link: false, adult: true } });

  const cases: { name: string; ml: MlBehaviour; mlSync: string; confirmation: string }[] = [
    { name: '200 created', ml: () => new Response('{}', { status: 200 }), mlSync: 'sent', confirmation: 'sent' },
    { name: '201 created', ml: () => new Response('{}', { status: 201 }), mlSync: 'sent', confirmation: 'sent' },
    { name: '422 rejected', ml: () => new Response('{}', { status: 422 }), mlSync: 'failed', confirmation: 'delayed' },
    { name: '500 server error', ml: () => new Response('{}', { status: 500 }), mlSync: 'pending', confirmation: 'delayed' },
    {
      name: 'network failure',
      ml: () => {
        throw new Error('network down');
      },
      mlSync: 'pending',
      confirmation: 'delayed',
    },
  ];

  for (const c of cases) {
    it(`${c.name}: answers 200, ml_sync ${c.mlSync}, data kept`, async () => {
      const { call } = interest({ fetchImpl: mockFetch({ ml: c.ml }) });
      const res = await call(post(emailOnly()));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; emailConfirmation: string };
      expect(json.ok).toBe(true);
      expect(json.emailConfirmation).toBe(c.confirmation);
      expect(interestRows(db)[0]).toMatchObject({ email: EMAIL, ml_sync: c.mlSync });
      expect(consentRows(db).length).toBe(2);
      expect(eventCount(db, 'interest_submitted')).toBe(1);
    });
  }

  it('makes no MailerLite call without email consent (WhatsApp and size only)', async () => {
    const { call, fetchImpl } = interest();
    const body = interestBody({
      email: undefined,
      consents: { email: false, whatsapp: true, link: false, adult: true },
    });
    expect((await call(post(body))).status).toBe(200);
    expect(mlCalls(fetchImpl)).toHaveLength(0);
  });
});

describe('POST /api/interest: notice_outdated', () => {
  it('409 notice_outdated for a stale notice version, storing nothing and skipping Turnstile', async () => {
    const { call, fetchImpl } = interest();
    const res = await call(post(interestBody({ noticeVersion: '0.0-old' })));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('notice_outdated');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(count(db, 'interest')).toBe(0);
    expect(count(db, 'consents')).toBe(0);
    expect(count(db, 'event_counts')).toBe(0);
  });
});

describe('POST /api/interest: rejections store nothing', () => {
  const expectNothingStored = () => {
    expect(count(db, 'interest')).toBe(0);
    expect(count(db, 'consents')).toBe(0);
    expect(count(db, 'event_counts')).toBe(0);
  };

  it('400 invalid_request for bad bodies, with no Turnstile or MailerLite call', async () => {
    const { call, fetchImpl } = interest({ rateLimitOptions: { limits: { interest: { limit: 50, windowSec: 3600 } } } });
    const bad: Record<string, unknown>[] = [
      interestBody({ email: 'not-an-email' }),
      interestBody({ whatsapp: '+911234567890' }),
      interestBody({ anonId: 'nope' }),
      interestBody({ size: 'huge' }),
      interestBody({ extra: 1 }),
      interestBody({ email: undefined, whatsapp: undefined, size: undefined }),
    ];
    for (const body of bad) {
      const res = await call(post(body));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('invalid_request');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('400 consent_required for an email without email consent, a phone without WhatsApp consent, and no 18+ confirmation', async () => {
    const { call, fetchImpl } = interest({ rateLimitOptions: { limits: { interest: { limit: 50, windowSec: 3600 } } } });
    const bad = [
      interestBody({ consents: { email: false, whatsapp: true, link: false, adult: true } }),
      interestBody({ consents: { email: true, whatsapp: false, link: false, adult: true } }),
      interestBody({ consents: { email: true, whatsapp: true, link: false, adult: false } }),
    ];
    for (const body of bad) {
      const res = await call(post(body));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('consent_required');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('403 bot_check_failed when Turnstile refuses the token, with no MailerLite call', async () => {
    const fetchImpl = mockFetch({ turnstile: turnstileFail });
    const { call } = interest({ fetchImpl });
    const res = await call(post(interestBody()));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('bot_check_failed');
    expect(mlCalls(fetchImpl)).toHaveLength(0);
    expectNothingStored();
  });

  it('403 origin_not_allowed for a foreign Origin', async () => {
    const { call, fetchImpl } = interest();
    const res = await call(makeRequest({ origin: 'https://evil.example', body: interestBody() }));
    expect(res.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('429 with Retry-After once the limit is passed, storing nothing for the denied request', async () => {
    const { call, fetchImpl } = interest({ rateLimitOptions: { limits: { interest: { limit: 1, windowSec: 3600 } } } });
    expect((await call(post(interestBody()))).status).toBe(200);
    const res = await call(post(interestBody({ email: 'b@example.test', whatsapp: undefined })));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect(((await res.json()) as { error: string }).error).toBe('rate_limited');
    expect(count(db, 'interest')).toBe(1);
    expect(mlCalls(fetchImpl)).toHaveLength(1);
  });

  it('uses the default interest limit of 3 per hour', async () => {
    const { call } = interest();
    for (let i = 0; i < 3; i++) expect((await call(post(interestBody()))).status).toBe(200);
    expect((await call(post(interestBody()))).status).toBe(429);
  });

  it('413 when the body is over 16 KB, and accepts a body between 8 KB and 16 KB', async () => {
    const { call, fetchImpl } = interest();
    const big = JSON.stringify({ ...interestBody(), padding: 'x'.repeat(17 * 1024) });
    const over = await call(makeRequest({ rawBody: big, headers: { 'Content-Length': '10' } }));
    expect(over.status).toBe(413);
    expect(((await over.json()) as { error: string }).error).toBe('payload_too_large');
    expect(fetchImpl).not.toHaveBeenCalled();
    expectNothingStored();

    // 12 KB passes the size cap (it then fails strict validation for the unknown key, i.e. 400, not 413).
    const mid = JSON.stringify({ ...interestBody(), padding: 'x'.repeat(12 * 1024) });
    const res = await call(makeRequest({ rawBody: mid }));
    expect(res.status).toBe(400);
  });

  it('413 when Content-Length is over 16 KB', async () => {
    const { call } = interest();
    const res = await call(makeRequest({ body: interestBody(), headers: { 'Content-Length': String(16 * 1024 + 1) } }));
    expect(res.status).toBe(413);
    expectNothingStored();
  });

  it('415 JSON error for a non-JSON content type, and an HTML page for a plain form post', async () => {
    const { call, fetchImpl } = interest();
    const text = await call(makeRequest({ contentType: 'text/plain', rawBody: '{}' }));
    expect(text.status).toBe(415);
    expect(((await text.json()) as { error: string }).error).toBe('unsupported_media_type');

    const form = await call(makeRequest({ contentType: 'application/x-www-form-urlencoded', rawBody: 'email=a' }));
    expect(form.status).toBe(415);
    expect(form.headers.get('Content-Type')).toContain('text/html');
    expect(await form.text()).toContain(NO_JS_MESSAGE);
    expect(fetchImpl).not.toHaveBeenCalled();
    expectNothingStored();
  });

  it('503 storage_unavailable when the D1 write fails, with no MailerLite call and nothing stored', async () => {
    const failing: D1Like = {
      prepare: (sql) => db.prepare(sql),
      batch: async () => {
        throw new Error('D1_ERROR: daily limit exceeded');
      },
    };
    const fetchImpl = mockFetch();
    const { call } = interest({ db: failing, fetchImpl });
    const res = await call(post(interestBody()));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('storage_unavailable');
    expect(mlCalls(fetchImpl)).toHaveLength(0);
    expectNothingStored();
  });
});

describe('logging', () => {
  it('writes no personal data to the logs across success, MailerLite failure and rejections', async () => {
    const f = interest({ rateLimitOptions: { limits: { interest: { limit: 3, windowSec: 3600 } } } });
    await f.call(post(interestBody({ consents: { email: true, whatsapp: true, link: true, adult: true } }))); // 200
    await f.call(post(interestBody({ email: 'bad' }))); // 400
    await f.call(post(interestBody({ noticeVersion: 'old' }))); // 409

    const mlDown = interest({ db: createTestD1(), fetchImpl: mockFetch({ ml: () => new Response('{}', { status: 500 }) }) });
    await mlDown.call(post(interestBody({ anonId: ANON_B, email: 'c@example.test' }))); // 200, pending
    const mlThrows = interest({
      db: createTestD1(),
      fetchImpl: mockFetch({
        ml: () => {
          throw new Error(`boom ${EMAIL} ${PHONE} ${ANON_A}`);
        },
      }),
    });
    await mlThrows.call(post(interestBody({ email: 'd@example.test' }))); // 200, pending

    const bot = interest({ db: createTestD1(), fetchImpl: mockFetch({ turnstile: turnstileFail }) });
    await bot.call(post(interestBody())); // 403

    const failing: D1Like = {
      prepare: (sql) => db.prepare(sql),
      batch: async () => {
        throw new Error(`boom ${ANON_A} ${TEST_IP} ${EMAIL}`);
      },
    };
    await interest({ db: failing }).call(post(interestBody({ anonId: ANON_B }))); // 503

    const logged = allLogged();
    expect(logged.length).toBeGreaterThan(0);
    for (const secret of [
      ANON_A,
      ANON_B,
      TEST_IP,
      TEST_UA,
      TOKEN,
      'test-secret',
      'test-ml-key',
      EMAIL,
      'b@example.test',
      'c@example.test',
      'd@example.test',
      PHONE,
      '98123',
      'instagram',
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});
