import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CONCEPT_IDS, PRIORITY_CHIPS, type ConceptId } from '../../src/content/config/allow-lists';
import { aggregateFeedback, type FeedbackRow } from '../../src/lib/aggregate';
import { denormalise, parseCsv } from '../../src/lib/csv';
import { createAggregateCsvHandler, buildAggregateCsv } from '../../functions/api/admin/export/aggregate.csv';
import {
  FEEDBACK_CSV_HEADER,
  buildFeedbackCsv,
  createFeedbackCsvHandler,
  exportFeedbackRowsPaged,
} from '../../functions/api/admin/export/feedback.csv';
import {
  authenticateAdmin,
  timingSafeEqualStrings,
  type AdminEnv,
  type FetchLike,
  type JwksCache,
} from '../../functions/_shared/admin-auth';
import { exportFeedbackRows, upsertFeedback, type FeedbackInput } from '../../functions/_shared/db';
import { createTestD1, type SqliteD1 } from '../support/d1-sqlite';

// ---------------------------------------------------------------------------
// Fixtures: RSA keypair generated in-process, JWKS served by a mocked fetch (no network)
// ---------------------------------------------------------------------------

const TEAM = 'testteam.cloudflareaccess.com';
const AUD = 'test-audience-tag';
const KID = 'kid-1';
const BEARER = 'correct-horse-battery-staple';
const NOW = new Date('2026-11-20T10:00:00Z');
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

const enc = new TextEncoder();
const b64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlJson = (v: unknown): string => b64url(enc.encode(JSON.stringify(v)));

let keyPair: CryptoKeyPair;
let otherKeyPair: CryptoKeyPair;
let publicJwk: JsonWebKey;

async function genKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
}

beforeAll(async () => {
  keyPair = await genKeyPair();
  otherKeyPair = await genKeyPair();
  publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
});

async function signJwt(
  claims: Record<string, unknown>,
  opts: { key?: CryptoKey; kid?: string; alg?: string } = {},
): Promise<string> {
  const header = b64urlJson({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? KID, typ: 'JWT' });
  const payload = b64urlJson(claims);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    opts.key ?? keyPair.privateKey,
    enc.encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(sig)}`;
}

const goodClaims = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  aud: [AUD],
  iss: `https://${TEAM}`,
  iat: NOW_SEC - 60,
  nbf: NOW_SEC - 60,
  exp: NOW_SEC + 3600,
  email: 'admin@example.test',
  ...over,
});

interface MockFetch {
  fetchImpl: FetchLike;
  urls: string[];
}

function mockJwksFetch(): MockFetch {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (input) => {
    urls.push(input);
    if (input !== `https://${TEAM}/cdn-cgi/access/certs`) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetchImpl, urls };
}

const baseEnv = (db: SqliteD1): AdminEnv => ({
  DB: db as unknown as AdminEnv['DB'],
  TURNSTILE_SECRET: 'x',
  MAILERLITE_API_KEY: 'x',
  ADMIN_BEARER_SECRET: BEARER,
  IDENTITY_SALT_SEED: 'seed',
  ML_GROUP_ID: 'g',
  ACCESS_AUD: AUD,
  ACCESS_TEAM_DOMAIN: TEAM,
});

const URL_FEEDBACK = 'https://example.test/api/admin/export/feedback.csv';
const URL_AGG = 'https://example.test/api/admin/export/aggregate.csv';
const req = (headers: Record<string, string> = {}, method = 'GET', url = URL_FEEDBACK): Request =>
  new Request(url, { method, headers: { 'CF-Connecting-IP': '203.0.113.9', 'User-Agent': 'vitest', ...headers } });

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const dbs: SqliteD1[] = [];
afterEach(() => {
  while (dbs.length > 0) dbs.pop()?.close();
});

function newDb(): SqliteD1 {
  const db = createTestD1();
  dbs.push(db);
  return db;
}

function input(over: Partial<FeedbackInput> & { conceptId: ConceptId }): FeedbackInput {
  return {
    anonId: crypto.randomUUID(),
    verdict: 'would_wear',
    changes: [],
    otherText: null,
    colour: null,
    priorities: [],
    priceBandId: null,
    priceSkipped: false,
    utm: { source: '', medium: '', campaign: '' },
    now: '2026-11-19T09:00:00.000Z',
    ...over,
  };
}

const SHIRT_BAND = 'shirt-1500-1999';

async function seed(db: SqliteD1): Promise<void> {
  const rows: FeedbackInput[] = [
    input({
      conceptId: 'mens-cotton-shirt',
      verdict: 'would_wear',
      changes: ['fit', 'colour'],
      colour: 'flax',
      priorities: ['softness', 'easy_care'],
      priceBandId: SHIRT_BAND,
      otherText: '=cmd|\' /C calc\'!A0',
      utm: { source: 'instagram', medium: 'social', campaign: 'launch' },
    }),
    input({
      conceptId: 'mens-cotton-shirt',
      verdict: 'maybe',
      priorities: ['softness'],
      priceSkipped: true,
      otherText: 'plain, "quoted"\nsecond line',
    }),
    input({ conceptId: 'mens-cotton-shirt', verdict: 'not_for_me', priceBandId: SHIRT_BAND }),
    input({ conceptId: 'mens-relaxed-pant', verdict: 'would_wear', colour: 'clay', priceSkipped: true }),
  ];
  for (const r of rows) await upsertFeedback(db, r);
}

function toFeedbackRowsFromCsv(csv: string): FeedbackRow[] {
  const [header, ...records] = parseCsv(csv);
  expect(header).toEqual([...FEEDBACK_CSV_HEADER]);
  const split = (s: string | undefined): string[] => (s ? s.split('|') : []);
  return records.map((c) => {
    const [anon, concept, verdict, changes, colour, priorities, band, skipped, other, us, um, uc, updated] = c;
    return {
      anonId: anon as string,
      conceptId: concept as ConceptId,
      verdict: verdict as FeedbackRow['verdict'],
      changes: split(changes) as FeedbackRow['changes'],
      colour: colour ? (colour as FeedbackRow['colour']) : null,
      priorities: split(priorities) as FeedbackRow['priorities'],
      priceBandId: band ? band : null,
      priceSkipped: skipped === '1',
      otherText: other ? denormalise(other) : null,
      utm: { source: us as string, medium: um as string, campaign: uc as string },
      updatedAt: updated as string,
    };
  });
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe('admin authentication', () => {
  const deps = (m: MockFetch) => ({ fetchImpl: m.fetchImpl, now: () => NOW, jwksCache: new Map() as JwksCache });

  it('accepts a valid Access JWT and fetches the JWKS only through fetchImpl', async () => {
    const m = mockJwksFetch();
    const jwt = await signJwt(goodClaims());
    const r = await authenticateAdmin(req({ 'Cf-Access-Jwt-Assertion': jwt }), baseEnv(newDb()), deps(m));
    expect(r).toEqual({ ok: true, method: 'access' });
    expect(m.urls).toEqual([`https://${TEAM}/cdn-cgi/access/certs`]);
  });

  it('accepts a string audience', async () => {
    const jwt = await signJwt(goodClaims({ aud: AUD }));
    const r = await authenticateAdmin(req({ 'Cf-Access-Jwt-Assertion': jwt }), baseEnv(newDb()), deps(mockJwksFetch()));
    expect(r.ok).toBe(true);
  });

  it('rejects a wrong audience with 403', async () => {
    const jwt = await signJwt(goodClaims({ aud: ['some-other-app'] }));
    const r = await authenticateAdmin(req({ 'Cf-Access-Jwt-Assertion': jwt }), baseEnv(newDb()), deps(mockJwksFetch()));
    expect(r).toMatchObject({ ok: false, status: 403, reason: 'jwt_audience' });
  });

  it('rejects an expired token with 403', async () => {
    const jwt = await signJwt(goodClaims({ exp: NOW_SEC - 1 }));
    const r = await authenticateAdmin(req({ 'Cf-Access-Jwt-Assertion': jwt }), baseEnv(newDb()), deps(mockJwksFetch()));
    expect(r).toMatchObject({ ok: false, status: 403, reason: 'jwt_expired' });
  });

  it('rejects a token that is not valid yet (nbf) and a wrong issuer', async () => {
    const m = mockJwksFetch();
    const early = await signJwt(goodClaims({ nbf: NOW_SEC + 600 }));
    const r1 = await authenticateAdmin(req({ 'Cf-Access-Jwt-Assertion': early }), baseEnv(newDb()), deps(m));
    expect(r1).toMatchObject({ ok: false, status: 403, reason: 'jwt_not_yet_valid' });
    const badIss = await signJwt(goodClaims({ iss: 'https://evil.example.test' }));
    const r2 = await authenticateAdmin(req({ 'Cf-Access-Jwt-Assertion': badIss }), baseEnv(newDb()), deps(m));
    expect(r2).toMatchObject({ ok: false, status: 403, reason: 'jwt_issuer' });
  });

  it('rejects a token signed with a different key (bad signature) with 403', async () => {
    const jwt = await signJwt(goodClaims(), { key: otherKeyPair.privateKey });
    const r = await authenticateAdmin(req({ 'Cf-Access-Jwt-Assertion': jwt }), baseEnv(newDb()), deps(mockJwksFetch()));
    expect(r).toMatchObject({ ok: false, status: 403, reason: 'jwt_signature' });
  });

  it('rejects a tampered payload, a non-RS256 alg and garbage', async () => {
    const m = mockJwksFetch();
    const jwt = await signJwt(goodClaims());
    const [h, , s] = jwt.split('.') as [string, string, string];
    const forged = `${h}.${b64urlJson(goodClaims({ aud: [AUD], email: 'attacker@example.test' }))}.${s}`;
    const r1 = await authenticateAdmin(req({ 'Cf-Access-Jwt-Assertion': forged }), baseEnv(newDb()), deps(m));
    expect(r1).toMatchObject({ ok: false, status: 403, reason: 'jwt_signature' });
    const none = await signJwt(goodClaims(), { alg: 'none' });
    const r2 = await authenticateAdmin(req({ 'Cf-Access-Jwt-Assertion': none }), baseEnv(newDb()), deps(m));
    expect(r2).toMatchObject({ ok: false, status: 403, reason: 'jwt_alg' });
    const r3 = await authenticateAdmin(req({ 'Cf-Access-Jwt-Assertion': 'not.a.jwt' }), baseEnv(newDb()), deps(m));
    expect(r3).toMatchObject({ ok: false, status: 403 });
  });

  it('returns 403 when the JWKS cannot be fetched or Access is not configured', async () => {
    const jwt = await signJwt(goodClaims());
    const failing: FetchLike = async () => {
      throw new Error('offline');
    };
    const r1 = await authenticateAdmin(req({ 'Cf-Access-Jwt-Assertion': jwt }), baseEnv(newDb()), {
      fetchImpl: failing,
      now: () => NOW,
      jwksCache: new Map(),
    });
    expect(r1).toMatchObject({ ok: false, status: 403, reason: 'jwks_unavailable' });
    const env = { ...baseEnv(newDb()), ACCESS_AUD: undefined };
    const r2 = await authenticateAdmin(req({ 'Cf-Access-Jwt-Assertion': jwt }), env, deps(mockJwksFetch()));
    expect(r2).toMatchObject({ ok: false, status: 403, reason: 'access_not_configured' });
  });

  it('returns 401 when no credentials are sent', async () => {
    const m = mockJwksFetch();
    const r = await authenticateAdmin(req(), baseEnv(newDb()), deps(m));
    expect(r).toMatchObject({ ok: false, status: 401 });
    expect(m.urls).toEqual([]);
  });

  it('accepts the correct bearer secret and rejects an incorrect one with 403', async () => {
    const m = mockJwksFetch();
    const ok = await authenticateAdmin(req({ Authorization: `Bearer ${BEARER}` }), baseEnv(newDb()), deps(m));
    expect(ok).toEqual({ ok: true, method: 'bearer' });
    const bad = await authenticateAdmin(req({ Authorization: 'Bearer wrong' }), baseEnv(newDb()), deps(m));
    expect(bad).toMatchObject({ ok: false, status: 403 });
    const wrongScheme = await authenticateAdmin(req({ Authorization: `Basic ${BEARER}` }), baseEnv(newDb()), deps(m));
    expect(wrongScheme).toMatchObject({ ok: false, status: 401 });
  });

  it('never accepts a bearer when the secret is unset', async () => {
    const env = { ...baseEnv(newDb()), ADMIN_BEARER_SECRET: '' };
    const r = await authenticateAdmin(req({ Authorization: 'Bearer x' }), env, deps(mockJwksFetch()));
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it('timingSafeEqualStrings compares by value', async () => {
    expect(await timingSafeEqualStrings('abc', 'abc')).toBe(true);
    expect(await timingSafeEqualStrings('abc', 'abd')).toBe(false);
    expect(await timingSafeEqualStrings('abc', 'abcd')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

describe('export endpoints', () => {
  const bearer = { Authorization: `Bearer ${BEARER}` };

  it('answers 401 without credentials and 403 with bad ones, on both endpoints', async () => {
    const db = newDb();
    await seed(db);
    const env = baseEnv(db);
    const handlers = [
      createFeedbackCsvHandler({ now: () => NOW, db }),
      createAggregateCsvHandler({ now: () => NOW, db }),
    ];
    for (const h of handlers) {
      expect((await h({ request: req(), env })).status).toBe(401);
      expect((await h({ request: req({ Authorization: 'Bearer nope' }), env })).status).toBe(403);
    }
  });

  it('rejects non-GET methods', async () => {
    const db = newDb();
    const res = await createFeedbackCsvHandler({ now: () => NOW, db })({
      request: req(bearer, 'POST'),
      env: baseEnv(db),
    });
    expect(res.status).toBe(405);
  });

  it('serves the feedback CSV with the right headers, columns, CRLF, and no email or phone', async () => {
    const db = newDb();
    await seed(db);
    // Contact data exists in the database but must never reach the export.
    await db
      .prepare(
        `INSERT INTO interest (email, phone, ml_sync, created_at, updated_at) VALUES ('person@example.test', '+919876543210', 'none', 'x', 'x')`,
      )
      .run();
    const res = await createFeedbackCsvHandler({ now: () => NOW, db })({ request: req(bearer), env: baseEnv(db) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="feedback-20261120.csv"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const text = await res.text();

    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.split('\r\n')[0]).toBe(FEEDBACK_CSV_HEADER.join(','));
    expect(text).not.toMatch(/person@example\.test|9876543210|email|phone/i);
    expect(FEEDBACK_CSV_HEADER).toEqual([
      'anon_id', 'concept_id', 'verdict', 'changes', 'colour', 'priorities', 'price_band_id',
      'price_skipped', 'other_text', 'utm_source', 'utm_medium', 'utm_campaign', 'updated_at',
    ]);
    const records = parseCsv(text);
    expect(records).toHaveLength(1 + 4);
    for (const r of records) expect(r).toHaveLength(13);
  });

  it('neutralises formulas in free text, keeps multi-line quoted text intact, and empties band on skip', async () => {
    const db = newDb();
    await seed(db);
    const res = await createFeedbackCsvHandler({ now: () => NOW, db })({ request: req(bearer), env: baseEnv(db) });
    const records = parseCsv(await res.text()).slice(1);
    const others = records.map((r) => r[8]);
    expect(others).toContain(`'=cmd|' /C calc'!A0`);
    expect(others.some((o) => o?.startsWith('='))).toBe(false);
    expect(others).toContain('plain, "quoted"\nsecond line');
    for (const r of records) {
      if (r[7] === '1') expect(r[6]).toBe('');
      expect(['0', '1']).toContain(r[7]);
    }
    const shirt = records.find((r) => r[3] === 'colour|fit');
    expect(shirt?.[5]).toBe('easy_care|softness');
  });

  it('aggregate CSV has the right columns, one priority row per chip (zeros too), and keeps skips apart from bands', async () => {
    const db = newDb();
    await seed(db);
    const res = await createAggregateCsvHandler({ now: () => NOW, db })({ request: req(bearer, 'GET', URL_AGG), env: baseEnv(db) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="aggregate-20261120.csv"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const text = await res.text();
    expect(text).not.toMatch(/email|phone|person@/i);
    const [header, ...records] = parseCsv(text);
    expect(header).toEqual(['concept_id', 'question', 'answer', 'count']);
    for (const r of records) expect(r).toHaveLength(4);

    for (const id of CONCEPT_IDS) {
      const pr = records.filter((r) => r[0] === id && r[1] === 'priority');
      expect(pr.map((r) => r[2])).toEqual([...PRIORITY_CHIPS]);
      const skip = records.filter((r) => r[0] === id && r[1] === 'price_skip');
      expect(skip).toHaveLength(1);
      expect(skip[0]?.[2]).toBe('skipped');
    }
    const bands = records.filter((r) => r[1] === 'price_band');
    expect(bands.some((r) => r[2] === 'skipped' || r[2] === 'price_skip')).toBe(false);
    expect(bands).toContainEqual(['mens-cotton-shirt', 'price_band', SHIRT_BAND, '2']);
    expect(records).toContainEqual(['mens-cotton-shirt', 'price_skip', 'skipped', '1']);
    expect(records).toContainEqual(['mens-relaxed-pant', 'price_skip', 'skipped', '1']);
    expect(records).toContainEqual(['mens-linen-shirt', 'priority', 'softness', '0']);
  });

  it('aggregate CSV counts equal aggregateFeedback on the feedback CSV rows', async () => {
    const db = newDb();
    await seed(db);
    const env = baseEnv(db);
    const fb = await createFeedbackCsvHandler({ now: () => NOW, db })({ request: req(bearer), env });
    const ag = await createAggregateCsvHandler({ now: () => NOW, db })({ request: req(bearer, 'GET', URL_AGG), env });
    const rows = toFeedbackRowsFromCsv(await fb.text());
    const expected = aggregateFeedback(rows);
    const csvCounts = new Map<string, number>();
    for (const [c, q, a, n] of parseCsv(await ag.text()).slice(1)) csvCounts.set(`${c}|${q}|${a}`, Number(n));

    for (const [id, a] of expected) {
      for (const [v, n] of Object.entries(a.verdictCounts)) expect(csvCounts.get(`${id}|verdict|${v}`)).toBe(n);
      for (const [v, n] of Object.entries(a.changeCounts)) expect(csvCounts.get(`${id}|change|${v}`)).toBe(n);
      for (const [v, n] of Object.entries(a.colourCounts)) expect(csvCounts.get(`${id}|colour|${v}`)).toBe(n);
      for (const [v, n] of Object.entries(a.priorityCounts)) expect(csvCounts.get(`${id}|priority|${v}`)).toBe(n);
      for (const [v, n] of Object.entries(a.priceBandCounts)) expect(csvCounts.get(`${id}|price_band|${v}`)).toBe(n);
      expect(csvCounts.get(`${id}|price_skip|skipped`)).toBe(a.priceSkipCount);
    }
    // And the pure builders agree with the handlers.
    expect(buildAggregateCsv(rows)).toBe(await (await createAggregateCsvHandler({ now: () => NOW, db })({ request: req(bearer, 'GET', URL_AGG), env })).text());
  });

  it('pages through more than one batch and returns the same rows as exportFeedbackRows', async () => {
    const db = newDb();
    await seed(db);
    for (let i = 0; i < 7; i += 1) {
      await upsertFeedback(db, input({ conceptId: CONCEPT_IDS[i % CONCEPT_IDS.length] as ConceptId, verdict: 'maybe' }));
    }
    const all = await exportFeedbackRows(db);
    expect(all).toHaveLength(11);
    expect(await exportFeedbackRowsPaged(db, 3)).toEqual(all);
    expect(await exportFeedbackRowsPaged(db, 1000)).toEqual(all);
    expect(buildFeedbackCsv(all)).toBe(buildFeedbackCsv(await exportFeedbackRowsPaged(db, 4)));
  });

  it('accepts an Access JWT on the endpoint and applies the admin rate limit after auth', async () => {
    const db = newDb();
    await seed(db);
    const m = mockJwksFetch();
    const jwt = await signJwt(goodClaims());
    const handler = createFeedbackCsvHandler({
      now: () => NOW,
      db,
      fetchImpl: m.fetchImpl,
      jwksCache: new Map(),
      random: () => 0.999,
    });
    const ok = await handler({ request: req({ 'Cf-Access-Jwt-Assertion': jwt }), env: baseEnv(db) });
    expect(ok.status).toBe(200);

    // Unauthenticated requests do not use up rate-limit counters.
    await handler({ request: req(), env: baseEnv(db) });
    const count = (): number =>
      (db.raw.prepare(`SELECT COALESCE(SUM(count), 0) AS n FROM rate_limits`).get() as { n: number }).n;
    expect(count()).toBe(1);

    // 30 per hour (rate-limit.ts), then 429 with Retry-After.
    let last = ok;
    for (let i = 0; i < 30; i += 1) last = await handler({ request: req(bearer), env: baseEnv(db) });
    expect(last.status).toBe(429);
    expect(Number(last.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
  });

  it('buildFeedbackCsv is pure and neutralises formulas', () => {
    const row: FeedbackRow = {
      anonId: crypto.randomUUID(),
      conceptId: 'mens-cotton-shirt',
      verdict: 'maybe',
      changes: [],
      colour: null,
      priorities: [],
      priceBandId: null,
      priceSkipped: false,
      otherText: '=cmd',
      utm: { source: '', medium: '', campaign: '' },
      updatedAt: '2026-11-19T09:00:00.000Z',
    };
    const csv = buildFeedbackCsv([row]);
    expect(csv.split('\r\n')[1]).toContain(",'=cmd,");
    expect(buildFeedbackCsv([])).toBe(`${FEEDBACK_CSV_HEADER.join(',')}\r\n`);
  });
});
