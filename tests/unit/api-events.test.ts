import { afterEach, describe, expect, it } from 'vitest';
import { createEventsHandler } from '../../functions/api/events';
import { RATE_LIMITS } from '../../functions/_shared/rate-limit';
import type { Env } from '../../functions/_shared/env';
import type { D1Like } from '../../functions/_shared/db';
import { createTestD1, type SqliteD1 } from '../support/d1-sqlite';

const ORIGIN = 'https://www.moolresha.com';
const URL_ = `${ORIGIN}/api/events`;
const NOW = new Date('2026-11-02T10:00:00Z');
const DAY = '2026-11-02';

let dbs: SqliteD1[] = [];
afterEach(() => {
  for (const d of dbs) d.close();
  dbs = [];
});

function setup() {
  const db = createTestD1();
  dbs.push(db);
  const env = { DB: db, IDENTITY_SALT_SEED: 'test-seed-not-a-secret' } as unknown as Env;
  const handler = createEventsHandler({ db: db as unknown as D1Like, now: () => NOW });
  const call = (init: RequestInit & { headers?: Record<string, string> } = {}) =>
    handler({ request: new Request(URL_, init), env });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    call({
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.7',
        'User-Agent': 'TestUA/1.0',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  const rows = () =>
    db.raw
      .prepare('SELECT day, event, concept_id, section, utm_source, utm_medium, utm_campaign, count FROM event_counts ORDER BY event, concept_id, section, utm_source, utm_medium, utm_campaign')
      .all() as {
      day: string;
      event: string;
      concept_id: string;
      section: string;
      utm_source: string;
      utm_medium: string;
      utm_campaign: string;
      count: number;
    }[];
  const total = () => rows().reduce((n, r) => n + r.count, 0);
  const rateRows = () => (db.raw.prepare('SELECT COUNT(*) AS n FROM rate_limits').get() as { n: number }).n;
  return { db, env, handler, call, post, rows, total, rateRows };
}

describe('POST /api/events: accepted events', () => {
  it('page_view increments its row and returns 204 with no body', async () => {
    const t = setup();
    const res = await t.post({ event: 'page_view' });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(t.rows()).toEqual([
      {
        day: DAY,
        event: 'page_view',
        concept_id: '',
        section: '',
        utm_source: '',
        utm_medium: '',
        utm_campaign: '',
        count: 1,
      },
    ]);
  });

  it('section_reached stores the section and journal_click is counted', async () => {
    const t = setup();
    expect((await t.post({ event: 'section_reached', section: 'journey' })).status).toBe(204);
    expect((await t.post({ event: 'journal_click' })).status).toBe(204);
    const rows = t.rows();
    expect(rows.find((r) => r.event === 'section_reached')).toMatchObject({ section: 'journey', count: 1 });
    expect(rows.find((r) => r.event === 'journal_click')).toMatchObject({ section: '', count: 1 });
  });

  it('repeated identical events increment the same row', async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) expect((await t.post({ event: 'page_view' })).status).toBe(204);
    const rows = t.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(3);
  });

  it('different UTM, section and concept values are separate rows', async () => {
    const t = setup();
    await t.post({ event: 'page_view' });
    await t.post({ event: 'page_view', utm: { source: 'instagram', medium: 'social', campaign: 'journey-01' } });
    await t.post({ event: 'page_view', utm: { source: 'instagram' } });
    await t.post({ event: 'section_reached', section: 'money' });
    await t.post({ event: 'section_reached', section: 'concepts' });
    await t.post({ event: 'section_reached', section: 'concepts', conceptId: 'mens-cotton-shirt' });
    const rows = t.rows();
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.count === 1)).toBe(true);
    expect(rows.find((r) => r.utm_campaign === 'journey-01')).toMatchObject({
      utm_source: 'instagram',
      utm_medium: 'social',
    });
    expect(rows.find((r) => r.concept_id === 'mens-cotton-shirt')).toMatchObject({ section: 'concepts' });
  });

  it('uses the UTC day from the injected clock', async () => {
    const t = setup();
    const handler = createEventsHandler({
      db: t.db as unknown as D1Like,
      now: () => new Date('2026-11-02T23:59:59Z'),
    });
    await handler({
      request: new Request(URL_, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'page_view' }),
      }),
      env: t.env,
    });
    expect(t.rows()[0]!.day).toBe('2026-11-02');
  });

  it('sets CORS for an allowed origin and never stores the identity, IP or user agent in event_counts', async () => {
    const t = setup();
    const res = await t.post({ event: 'page_view' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Vary')).toContain('Origin');
    const dump = JSON.stringify(t.db.raw.prepare('SELECT * FROM event_counts').all());
    expect(dump).not.toContain('203.0.113.7');
    expect(dump).not.toContain('TestUA');
    const cols = (t.db.raw.prepare("PRAGMA table_info('event_counts')").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toEqual([
      'day',
      'event',
      'concept_id',
      'section',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'count',
    ]);
  });
});

describe('POST /api/events: rejected bodies (400, nothing stored)', () => {
  const bad: [string, unknown][] = [
    ['unknown event', { event: 'scroll' }],
    ['server-only feedback_submitted', { event: 'feedback_submitted' }],
    ['server-only frustration_submitted', { event: 'frustration_submitted' }],
    ['server-only interest_submitted', { event: 'interest_submitted' }],
    ['unknown section', { event: 'section_reached', section: 'footer' }],
    ['section_reached without a section', { event: 'section_reached' }],
    ['anonId in the body', { event: 'page_view', anonId: '3f2b8c1e-9a4d-4b7e-8f21-6c0d5e4a9b13' }],
    ['bad UTM value', { event: 'page_view', utm: { source: 'Has Spaces!' } }],
    ['UTM value too long', { event: 'page_view', utm: { campaign: 'a'.repeat(65) } }],
    ['unknown UTM key', { event: 'page_view', utm: { term: 'x' } }],
    ['unknown top-level key', { event: 'page_view', extra: 1 }],
    ['unknown concept', { event: 'page_view', conceptId: 'mens-sock' }],
    ['missing event', {}],
    ['array body', []],
    ['null body', null],
  ];

  for (const [name, body] of bad) {
    it(`rejects ${name}`, async () => {
      const t = setup();
      const res = await t.post(body);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { ok: boolean; error: string };
      expect(json).toMatchObject({ ok: false, error: 'invalid_request' });
      expect(t.rows()).toEqual([]);
    });
  }

  it('rejects malformed JSON', async () => {
    const t = setup();
    const res = await t.post('{not json');
    expect(res.status).toBe(400);
    expect(t.rows()).toEqual([]);
  });

  it('does not echo the submitted values in the error body', async () => {
    const t = setup();
    const res = await t.post({ event: 'page_view', anonId: 'SECRET-VALUE-123' });
    expect(await res.text()).not.toContain('SECRET-VALUE-123');
  });
});

describe('POST /api/events: gates that stop before storage', () => {
  it('403 for a foreign or missing Origin', async () => {
    const t = setup();
    const foreign = await t.post({ event: 'page_view' }, { Origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({ ok: false, error: 'origin_not_allowed' });
    expect(foreign.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const missing = await t.call({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'page_view' }),
    });
    expect(missing.status).toBe(403);
    expect(t.rows()).toEqual([]);
    expect(t.rateRows()).toBe(0);
  });

  it('405 with Allow: POST for other methods', async () => {
    const t = setup();
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await t.call({ method, headers: { Origin: ORIGIN } });
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('POST');
    }
    expect(t.rows()).toEqual([]);
    expect(t.rateRows()).toBe(0);
  });

  it('415 for a non-JSON content type', async () => {
    const t = setup();
    const res = await t.post({ event: 'page_view' }, { 'Content-Type': 'text/plain' });
    expect(res.status).toBe(415);
    expect(t.rows()).toEqual([]);
  });

  it('413 for an oversized body', async () => {
    const t = setup();
    const res = await t.post({ event: 'page_view', utm: { source: 'a'.repeat(9000) } });
    expect(res.status).toBe(413);
    expect(t.rows()).toEqual([]);
  });

  it('429 with Retry-After once the limit is passed, and the extra request stores nothing', async () => {
    const t = setup();
    const limit = RATE_LIMITS.events.limit;
    for (let i = 0; i < limit; i++) {
      expect((await t.post({ event: 'page_view' })).status).toBe(204);
    }
    expect(t.total()).toBe(limit);

    const res = await t.post({ event: 'page_view' });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(await res.json()).toMatchObject({ ok: false, error: 'rate_limited' });
    expect(t.total()).toBe(limit);
  });

  it('rate limits per client identity', async () => {
    const t = setup();
    const limit = RATE_LIMITS.events.limit;
    for (let i = 0; i < limit + 1; i++) await t.post({ event: 'page_view' });
    const other = await t.post({ event: 'page_view' }, { 'CF-Connecting-IP': '198.51.100.9' });
    expect(other.status).toBe(204);
  });

  it('rate limit rows hold only an opaque hash, not the IP or user agent', async () => {
    const t = setup();
    await t.post({ event: 'page_view' });
    const dump = JSON.stringify(t.db.raw.prepare('SELECT * FROM rate_limits').all());
    expect(dump).toMatch(/events:[0-9a-f]{64}/);
    expect(dump).not.toContain('203.0.113.7');
    expect(dump).not.toContain('TestUA');
  });
});

describe('POST /api/events: preflight', () => {
  it('answers OPTIONS for an allowed origin without storing anything', async () => {
    const t = setup();
    const res = await t.call({ method: 'OPTIONS', headers: { Origin: ORIGIN } });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST');
    expect(t.rateRows()).toBe(0);
  });
});
