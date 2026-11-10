import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  eventIncrementStatement,
  exportFeedbackRows,
  incrementEvent,
  queryAggregates,
  saveInterestWithConsents,
  upsertFeedback,
  upsertFrustration,
  type FeedbackInput,
} from '../../functions/_shared/db';
import { createTestD1, type SqliteD1 } from '../support/d1-sqlite';

const ANON_A = '11111111-1111-4111-8111-111111111111';
const ANON_B = '22222222-2222-4222-8222-222222222222';
const T1 = '2026-01-01T10:00:00.000Z';
const T2 = '2026-01-02T10:00:00.000Z';

function feedback(over: Partial<FeedbackInput> = {}): FeedbackInput {
  return {
    anonId: ANON_A,
    conceptId: 'mens-cotton-shirt',
    verdict: 'would_wear',
    changes: ['pockets', 'fit'],
    otherText: null,
    colour: 'flax',
    priorities: ['softness', 'easy_care'],
    priceBandId: 'shirt-1500-1999',
    priceSkipped: false,
    utm: { source: 'wa', medium: 'share', campaign: 'launch' },
    now: T1,
    ...over,
  };
}

let db: SqliteD1;
beforeEach(() => {
  db = createTestD1();
});
afterEach(() => db.close());

const count = (table: string): number =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('feedback upsert', () => {
  it('keeps one row for the same (anonId, concept) and replaces the answer', async () => {
    await upsertFeedback(db, feedback());
    await upsertFeedback(
      db,
      feedback({ verdict: 'maybe', priorities: [], now: T2, utm: { source: 'later', medium: '', campaign: '' } }),
    );
    expect(count('concept_feedback')).toBe(1);
    const row = db.raw.prepare('SELECT * FROM concept_feedback').get() as Record<string, unknown>;
    expect(row.verdict).toBe('maybe');
    expect(row.priorities).toBe(''); // a replacement with no chips clears them
    expect(row.created_at).toBe(T1); // unchanged on replace
    expect(row.updated_at).toBe(T2);
    expect(row.utm_source).toBe('wa'); // first visit's attribution is kept
  });

  it('stores chip sets sorted and joined with |', async () => {
    await upsertFeedback(db, feedback());
    const row = db.raw.prepare('SELECT changes, priorities FROM concept_feedback').get() as Record<string, string>;
    expect(row.changes).toBe('fit|pockets');
    expect(row.priorities).toBe('easy_care|softness');
  });

  it('keeps separate rows per Concept and per Anonymous_ID', async () => {
    await upsertFeedback(db, feedback());
    await upsertFeedback(db, feedback({ conceptId: 'mens-relaxed-pant' }));
    await upsertFeedback(db, feedback({ anonId: ANON_B }));
    expect(count('concept_feedback')).toBe(3);
  });

  it('stores a skip as price_skipped = 1 with no band', async () => {
    await upsertFeedback(db, feedback({ priceBandId: null, priceSkipped: true }));
    const row = db.raw.prepare('SELECT price_band_id, price_skipped FROM concept_feedback').get() as Record<string, unknown>;
    expect(row).toEqual({ price_band_id: null, price_skipped: 1 });
  });

  it('rejects a skip that also carries a band (CHECK)', async () => {
    await expect(upsertFeedback(db, feedback({ priceBandId: 'shirt-1500-1999', priceSkipped: true }))).rejects.toThrow(
      /CHECK/i,
    );
    expect(count('concept_feedback')).toBe(0);
  });

  it('rejects an invalid verdict and an over-long other_text', async () => {
    await expect(upsertFeedback(db, feedback({ verdict: 'love_it' as never }))).rejects.toThrow(/CHECK/i);
    await expect(upsertFeedback(db, feedback({ otherText: 'x'.repeat(201) }))).rejects.toThrow(/CHECK/i);
  });

  it('a later answer with a band replaces an earlier skip', async () => {
    await upsertFeedback(db, feedback({ priceBandId: null, priceSkipped: true }));
    await upsertFeedback(db, feedback({ priceBandId: 'shirt-2000-2499', priceSkipped: false, now: T2 }));
    const row = db.raw.prepare('SELECT price_band_id, price_skipped FROM concept_feedback').get() as Record<string, unknown>;
    expect(row).toEqual({ price_band_id: 'shirt-2000-2499', price_skipped: 0 });
  });
});

describe('frustration upsert', () => {
  it('writes one row per Anonymous_ID and replaces the chips', async () => {
    await upsertFrustration(db, { anonId: ANON_A, chips: ['shrinks', 'see_through'], otherText: null, utm: { source: '', medium: '', campaign: '' }, now: T1 });
    await upsertFrustration(db, { anonId: ANON_A, chips: ['shrinks'], otherText: 'pilling', utm: { source: 'x', medium: '', campaign: '' }, now: T2 });
    expect(count('frustration')).toBe(1);
    const row = db.raw.prepare('SELECT * FROM frustration').get() as Record<string, unknown>;
    expect(row.chips).toBe('shrinks');
    expect(row.other_text).toBe('pilling');
    expect(row.created_at).toBe(T1);
    expect(row.updated_at).toBe(T2);
  });

  it('rejects an Anonymous_ID that is not 36 characters', async () => {
    await expect(
      upsertFrustration(db, { anonId: 'short', chips: ['shrinks'], otherText: null, utm: { source: '', medium: '', campaign: '' }, now: T1 }),
    ).rejects.toThrow(/CHECK/i);
  });
});

describe('event counter', () => {
  it('increments the same key and separates different keys', async () => {
    const e = { day: '2026-01-01', event: 'page_view' as const, utm: { source: 'wa' } };
    await incrementEvent(db, e);
    await incrementEvent(db, e);
    await incrementEvent(db, e);
    await incrementEvent(db, { day: '2026-01-01', event: 'section_reached', section: 'concepts' });
    await incrementEvent(db, { day: '2026-01-02', event: 'page_view', utm: { source: 'wa' } });

    const rows = db.raw.prepare('SELECT day, event, section, utm_source, count FROM event_counts ORDER BY day, event').all();
    expect(rows).toEqual([
      { day: '2026-01-01', event: 'page_view', section: '', utm_source: 'wa', count: 3 },
      { day: '2026-01-01', event: 'section_reached', section: 'concepts', utm_source: '', count: 1 },
      { day: '2026-01-02', event: 'page_view', section: '', utm_source: 'wa', count: 1 },
    ]);
  });

  it('has no column that could hold an Anonymous_ID', () => {
    const cols = (db.raw.prepare('PRAGMA table_info(event_counts)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).not.toContain('anon_id');
  });

  it('can be sent in a batch with a feedback upsert', async () => {
    await db.batch([
      eventIncrementStatement(db, { day: '2026-01-01', event: 'feedback_submitted', conceptId: 'mens-cotton-shirt' }),
      eventIncrementStatement(db, { day: '2026-01-01', event: 'feedback_submitted', conceptId: 'mens-cotton-shirt' }),
    ]);
    const row = db.raw.prepare('SELECT count FROM event_counts').get() as { count: number };
    expect(row.count).toBe(2);
  });
});

describe('interest batch', () => {
  const base = {
    anonId: null,
    linked: false,
    email: 'a@example.com',
    phone: null,
    size: 'm' as const,
    mlSync: 'pending' as const,
    utm: { source: '', medium: '', campaign: '' },
    noticeVersion: '2026-01',
    consents: [
      { type: 'adult' as const, granted: true },
      { type: 'email' as const, granted: true },
    ],
    now: T1,
  };

  it('writes the interest row and one consent row per consent', async () => {
    const id = await saveInterestWithConsents(db, base);
    expect(count('interest')).toBe(1);
    const consents = db.raw
      .prepare('SELECT interest_id, consent_type, granted, notice_version FROM consents ORDER BY id')
      .all();
    expect(consents).toEqual([
      { interest_id: id, consent_type: 'adult', granted: 1, notice_version: '2026-01' },
      { interest_id: id, consent_type: 'email', granted: 1, notice_version: '2026-01' },
    ]);
  });

  it('stores no Anonymous_ID without link consent (NULL anon_id, linked = 0)', async () => {
    await saveInterestWithConsents(db, { ...base, anonId: ANON_A, linked: false });
    const row = db.raw.prepare('SELECT anon_id, linked FROM interest').get();
    expect(row).toEqual({ anon_id: null, linked: 0 });
  });

  it('links the Anonymous_ID only with link consent', async () => {
    await saveInterestWithConsents(db, {
      ...base,
      anonId: ANON_A,
      linked: true,
      consents: [...base.consents, { type: 'link', granted: true }],
    });
    const row = db.raw.prepare('SELECT anon_id, linked FROM interest').get();
    expect(row).toEqual({ anon_id: ANON_A, linked: 1 });
  });

  it('updates the same email instead of duplicating, and appends a new consent set', async () => {
    const id1 = await saveInterestWithConsents(db, base);
    const id2 = await saveInterestWithConsents(db, { ...base, now: T2, consents: [{ type: 'email', granted: false }] });
    expect(id2).toBe(id1);
    expect(count('interest')).toBe(1);
    expect(count('consents')).toBe(3);
    const last = db.raw.prepare('SELECT consent_type, granted FROM consents ORDER BY id DESC LIMIT 1').get();
    expect(last).toEqual({ consent_type: 'email', granted: 0 });
  });

  it('writes nothing when a statement in the batch fails (atomic)', async () => {
    await expect(
      saveInterestWithConsents(db, { ...base, consents: [{ type: 'bogus' as never, granted: true }] }),
    ).rejects.toThrow(/CHECK/i);
    expect(count('interest')).toBe(0);
    expect(count('consents')).toBe(0);
  });

  it('rejects a phone number outside the +91 mobile pattern', async () => {
    await expect(saveInterestWithConsents(db, { ...base, email: null, phone: '12345' })).rejects.toThrow(/CHECK/i);
  });
});

describe('results and export queries', () => {
  it('aggregates from SQL counts and returns export rows without contact data', async () => {
    await upsertFeedback(db, feedback());
    await upsertFeedback(db, feedback({ anonId: ANON_B, verdict: 'maybe', priorities: ['softness'], priceBandId: null, priceSkipped: true, colour: 'clay' }));

    const agg = (await queryAggregates(db)).get('mens-cotton-shirt');
    expect(agg?.responses).toBe(2);
    expect(agg?.verdictCounts).toEqual({ would_wear: 1, maybe: 1, not_for_me: 0 });
    expect(agg?.priorityCounts.softness).toBe(2);
    expect(agg?.priorityCounts.easy_care).toBe(1);
    expect(agg?.priceSkipCount).toBe(1);
    expect(agg?.priceBandCounts).toEqual({ 'shirt-1500-1999': 1 });

    const rows = await exportFeedbackRows(db);
    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toHaveProperty('email');
    expect(rows.find((r) => r.anonId === ANON_B)?.priceSkipped).toBe(true);
  });
});
