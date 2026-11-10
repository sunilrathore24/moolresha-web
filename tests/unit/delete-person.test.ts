import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  saveInterestWithConsents,
  upsertFeedback,
  upsertFrustration,
  type D1Like,
} from '../../functions/_shared/db';
import {
  buildDeletionPlan,
  buildLookupCommand,
  parseIdentifier,
  renderRunnableSql,
  run,
  type DeletionPlan,
} from '../../scripts/delete-person';
import { createTestD1, type SqliteD1 } from '../support/d1-sqlite';

const ANON_A = '11111111-1111-4111-8111-111111111111';
const ANON_B = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-01-01T10:00:00.000Z';
const UTM = { source: '', medium: '', campaign: '' };

let db: SqliteD1;
beforeEach(() => {
  db = createTestD1();
});
afterEach(() => db.close());

const count = (table: string, where = '1=1', ...p: unknown[]): number =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`) as unknown as {
    get(...a: unknown[]): { n: number };
  }).get(...p).n;

async function seedPerson(
  email: string,
  anonId: string,
  linked: boolean,
  withFeedback: boolean,
): Promise<number> {
  const id = await saveInterestWithConsents(db as D1Like, {
    anonId,
    linked,
    email,
    phone: null,
    size: 'm',
    mlSync: 'sent',
    utm: UTM,
    noticeVersion: 'v1',
    consents: [
      { type: 'email', granted: true },
      { type: 'adult', granted: true },
      ...(linked ? [{ type: 'link' as const, granted: true }] : []),
    ],
    now: NOW,
  });
  if (withFeedback) {
    await upsertFeedback(db, {
      anonId,
      conceptId: 'mens-cotton-shirt',
      verdict: 'would_wear',
      changes: [],
      otherText: null,
      colour: null,
      priorities: [],
      priceBandId: null,
      priceSkipped: true,
      utm: UTM,
      now: NOW,
    });
    await upsertFeedback(db, {
      anonId,
      conceptId: 'mens-relaxed-pant',
      verdict: 'maybe',
      changes: [],
      otherText: null,
      colour: null,
      priorities: [],
      priceBandId: null,
      priceSkipped: false,
      utm: UTM,
      now: NOW,
    });
    await upsertFrustration(db, { anonId, chips: ['fit'], otherText: null, utm: UTM, now: NOW });
  }
  return id;
}

/** Applies a plan the way `wrangler d1 execute` would: each statement with its bound values. */
async function apply(plan: DeletionPlan): Promise<void> {
  for (const s of plan.statements) await db.prepare(s.sql).bind(...s.params).run();
}

describe('buildDeletionPlan', () => {
  it('linked person: feedback, frustration, consents, interest, in that order, with bound parameters', () => {
    const plan = buildDeletionPlan({ id: 7, anon_id: ANON_A, linked: 1 });
    expect(plan.statements.map((s) => s.sql)).toEqual([
      'DELETE FROM concept_feedback WHERE anon_id = ?1',
      'DELETE FROM frustration WHERE anon_id = ?1',
      'DELETE FROM consents WHERE interest_id = ?1',
      'DELETE FROM interest WHERE id = ?1',
    ]);
    expect(plan.statements.map((s) => s.params)).toEqual([[ANON_A], [ANON_A], [7], [7]]);
    for (const s of plan.statements) expect(s.sql).not.toContain(ANON_A);
  });

  it('unlinked person: only consents and interest', () => {
    const plan = buildDeletionPlan({ id: 3, anon_id: null, linked: 0 });
    expect(plan.statements.map((s) => s.sql)).toEqual([
      'DELETE FROM consents WHERE interest_id = ?1',
      'DELETE FROM interest WHERE id = ?1',
    ]);
  });

  it('includes the MailerLite forget step as POST, not DELETE', () => {
    const text = buildDeletionPlan({ id: 1, anon_id: null, linked: 0 }).mailerLite.join(' ');
    expect(text).toContain('POST /api/subscribers/:id/forget');
    expect(text).toContain('Do not use DELETE');
  });

  it('rejects inconsistent or malformed rows', () => {
    expect(() => buildDeletionPlan({ id: 0, anon_id: null, linked: 0 })).toThrow();
    expect(() => buildDeletionPlan({ id: 1, anon_id: null, linked: 1 })).toThrow();
    expect(() => buildDeletionPlan({ id: 1, anon_id: "x'; DROP TABLE interest;--", linked: 1 })).toThrow();
    expect(() => buildDeletionPlan({ id: 1, anon_id: ANON_A, linked: 0 })).toThrow();
  });
});

describe('applying the plan to the SQLite adapter', () => {
  it('removes the requested linked person and leaves the other person untouched', async () => {
    const idA = await seedPerson('a@example.com', ANON_A, true, true);
    const idB = await seedPerson('b@example.com', ANON_B, true, true);
    expect(count('concept_feedback')).toBe(4);

    await apply(buildDeletionPlan({ id: idA, anon_id: ANON_A, linked: 1 }));

    expect(count('concept_feedback', 'anon_id = ?', ANON_A)).toBe(0);
    expect(count('frustration', 'anon_id = ?', ANON_A)).toBe(0);
    expect(count('consents', 'interest_id = ?', idA)).toBe(0);
    expect(count('interest', 'id = ?', idA)).toBe(0);
    expect(count('interest', 'email = ?', 'a@example.com')).toBe(0);

    expect(count('concept_feedback', 'anon_id = ?', ANON_B)).toBe(2);
    expect(count('frustration', 'anon_id = ?', ANON_B)).toBe(1);
    expect(count('consents', 'interest_id = ?', idB)).toBe(3);
    expect(count('interest', 'id = ?', idB)).toBe(1);
  });

  it('an unlinked interest row deletes no feedback', async () => {
    // Feedback exists under ANON_A, but the person did not give link consent, so nothing ties them to it.
    const idA = await seedPerson('a@example.com', ANON_A, false, true);
    const idB = await seedPerson('b@example.com', ANON_B, true, true);
    const row = db.raw.prepare('SELECT anon_id, linked FROM interest WHERE id = ?') as unknown as {
      get(id: number): { anon_id: string | null; linked: number };
    };
    expect(row.get(idA)).toEqual({ anon_id: null, linked: 0 });

    await apply(buildDeletionPlan({ id: idA, anon_id: null, linked: 0 }));

    expect(count('interest', 'id = ?', idA)).toBe(0);
    expect(count('consents', 'interest_id = ?', idA)).toBe(0);
    expect(count('concept_feedback', 'anon_id = ?', ANON_A)).toBe(2);
    expect(count('frustration', 'anon_id = ?', ANON_A)).toBe(1);
    expect(count('concept_feedback', 'anon_id = ?', ANON_B)).toBe(2);
    expect(count('interest', 'id = ?', idB)).toBe(1);
  });

  it('the runnable SQL file has the same effect as the bound statements', async () => {
    const idA = await seedPerson('a@example.com', ANON_A, true, true);
    await seedPerson('b@example.com', ANON_B, true, true);
    const plan = buildDeletionPlan({ id: idA, anon_id: ANON_A, linked: 1 });
    const sql = renderRunnableSql(plan);
    expect(sql).not.toContain('@');
    expect(sql).not.toContain('?');
    db.raw.exec(sql);
    expect(count('interest')).toBe(1);
    expect(count('concept_feedback')).toBe(2);
    expect(count('frustration')).toBe(1);
    expect(count('consents', 'interest_id = ?', idA)).toBe(0);
  });
});

describe('lookup and CLI text', () => {
  it('classifies email and phone and prints the wrangler SELECT', () => {
    expect(parseIdentifier('a@example.com')).toEqual({ kind: 'email', value: 'a@example.com' });
    expect(parseIdentifier('9876543210')).toEqual({ kind: 'phone', value: '+919876543210' });
    expect(parseIdentifier("a'b@example.com")).toBeNull();
    expect(parseIdentifier('not an id')).toBeNull();
    const cmd = buildLookupCommand({ kind: 'phone', value: '+919876543210' });
    expect(cmd).toBe(
      `npx wrangler d1 execute moolresha_feedback --remote --command "SELECT id, anon_id, linked FROM interest WHERE phone = '+919876543210'"`,
    );
  });

  it('the plan command prints SQL, parameters and MailerLite steps without personal data', () => {
    const out = run(['plan', '--id', '5', '--linked', '1', '--anon-id', ANON_A]);
    expect(out).toContain('DELETE FROM interest WHERE id = ?1');
    expect(out).toContain('-- ?1 = 5');
    expect(out).toContain(`-- ?1 = "${ANON_A}"`);
    expect(out).toContain('POST /api/subscribers/:id/forget');
    expect(() => run(['plan', '--id', '5; DROP TABLE interest', '--linked', '0'])).toThrow();
    expect(() => run(['lookup', "x'; --"])).toThrow();
  });
});
