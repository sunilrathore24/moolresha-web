/**
 * Typed D1 wrappers (Requirements 9.13, 9.14, 9.15, 10.3, 12.8, 12.9, 18.4).
 *
 * Every statement is a constant SQL string. Values are always passed through `bind()`,
 * never concatenated into SQL. Chip sets are stored with `encodeChipSet`, so the same
 * answer always gives the same stored row.
 *
 * `D1Like` is a small structural type. Cloudflare's `D1Database` satisfies it, and so does
 * the better-sqlite3 adapter in `tests/support/d1-sqlite.ts`.
 */
import {
  CHANGE_CHIPS,
  CONCEPT_IDS,
  PALETTE,
  PRIORITY_CHIPS,
  VERDICTS,
  type ChangeChip,
  type ConceptId,
  type EventName,
  type PaletteColour,
  type PriorityChip,
  type Size,
  type Verdict,
} from '../../src/content/config/allow-lists';
import {
  decodeChipSet,
  encodeChipSet,
  sumChipCounts,
  type ConceptAggregate,
  type FeedbackRow,
} from '../../src/lib/aggregate';

// ---------------------------------------------------------------------------
// Minimal structural D1 types
// ---------------------------------------------------------------------------

export type D1Value = string | number | null;

export interface D1RunResult {
  success?: boolean;
  meta?: { changes?: number; last_row_id?: number; [k: string]: unknown };
}

export interface D1PreparedStatementLike {
  bind(...values: D1Value[]): D1PreparedStatementLike;
  run(): Promise<D1RunResult>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
}

export interface D1Like {
  prepare(sql: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown[]>;
}

export interface Utm {
  source: string;
  medium: string;
  campaign: string;
}

// ---------------------------------------------------------------------------
// SQL (constants only)
// ---------------------------------------------------------------------------

const SQL_FEEDBACK_UPSERT = `
INSERT INTO concept_feedback (anon_id, concept_id, verdict, changes, other_text, colour, priorities, price_band_id, price_skipped,
                              utm_source, utm_medium, utm_campaign, created_at, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)
ON CONFLICT (anon_id, concept_id) DO UPDATE SET
  verdict = excluded.verdict, changes = excluded.changes, other_text = excluded.other_text,
  colour = excluded.colour, priorities = excluded.priorities,
  price_band_id = excluded.price_band_id, price_skipped = excluded.price_skipped,
  updated_at = excluded.updated_at`;

const SQL_FRUSTRATION_UPSERT = `
INSERT INTO frustration (anon_id, chips, other_text, utm_source, utm_medium, utm_campaign, created_at, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
ON CONFLICT (anon_id) DO UPDATE SET
  chips = excluded.chips, other_text = excluded.other_text, updated_at = excluded.updated_at`;

const SQL_EVENT_INCREMENT = `
INSERT INTO event_counts (day, event, concept_id, section, utm_source, utm_medium, utm_campaign, count)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)
ON CONFLICT (day, event, concept_id, section, utm_source, utm_medium, utm_campaign)
DO UPDATE SET count = count + 1`;

// Interest: a row is found by email when one is given, otherwise by phone.
// The UTM values and created_at keep the first visit. A contact value is never cleared by a later submission.
// The link to an Anonymous_ID changes only when the new request carries link consent (Req 12.8).
const SQL_INTEREST_UPSERT_BY_EMAIL = `
INSERT INTO interest (anon_id, linked, email, phone, size, ml_sync, utm_source, utm_medium, utm_campaign, created_at, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
ON CONFLICT (email) DO UPDATE SET
  anon_id = CASE WHEN excluded.linked = 1 THEN excluded.anon_id ELSE interest.anon_id END,
  linked = CASE WHEN excluded.linked = 1 THEN 1 ELSE interest.linked END,
  phone = COALESCE(excluded.phone, interest.phone),
  size = COALESCE(excluded.size, interest.size),
  ml_sync = excluded.ml_sync,
  updated_at = excluded.updated_at`;

const SQL_INTEREST_UPSERT_BY_PHONE = `
INSERT INTO interest (anon_id, linked, email, phone, size, ml_sync, utm_source, utm_medium, utm_campaign, created_at, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
ON CONFLICT (phone) DO UPDATE SET
  anon_id = CASE WHEN excluded.linked = 1 THEN excluded.anon_id ELSE interest.anon_id END,
  linked = CASE WHEN excluded.linked = 1 THEN 1 ELSE interest.linked END,
  email = COALESCE(excluded.email, interest.email),
  size = COALESCE(excluded.size, interest.size),
  ml_sync = excluded.ml_sync,
  updated_at = excluded.updated_at`;

const SQL_CONSENT_BY_EMAIL = `
INSERT INTO consents (interest_id, consent_type, granted, notice_version, recorded_at)
SELECT id, ?2, ?3, ?4, ?5 FROM interest WHERE email = ?1`;

const SQL_CONSENT_BY_PHONE = `
INSERT INTO consents (interest_id, consent_type, granted, notice_version, recorded_at)
SELECT id, ?2, ?3, ?4, ?5 FROM interest WHERE phone = ?1`;

const SQL_INTEREST_ID_BY_EMAIL = `SELECT id FROM interest WHERE email = ?1`;
const SQL_INTEREST_ID_BY_PHONE = `SELECT id FROM interest WHERE phone = ?1`;

const SQL_INTEREST_SET_ML_SYNC = `UPDATE interest SET ml_sync = ?2, updated_at = ?3 WHERE id = ?1`;

const SQL_RESULTS_VERDICT = `SELECT concept_id, verdict, COUNT(*) AS n FROM concept_feedback GROUP BY concept_id, verdict`;
const SQL_RESULTS_COLOUR = `SELECT concept_id, colour, COUNT(*) AS n FROM concept_feedback WHERE colour IS NOT NULL GROUP BY concept_id, colour`;
const SQL_RESULTS_BAND = `SELECT concept_id, price_band_id, COUNT(*) AS n FROM concept_feedback WHERE price_band_id IS NOT NULL GROUP BY concept_id, price_band_id`;
const SQL_RESULTS_SKIP = `SELECT concept_id, COUNT(*) AS n FROM concept_feedback WHERE price_skipped = 1 GROUP BY concept_id`;
const SQL_RESULTS_PRIORITIES = `SELECT concept_id, priorities, COUNT(*) AS n FROM concept_feedback WHERE priorities <> '' GROUP BY concept_id, priorities`;
const SQL_RESULTS_CHANGES = `SELECT concept_id, changes, COUNT(*) AS n FROM concept_feedback WHERE changes <> '' GROUP BY concept_id, changes`;
const SQL_RESULTS_RESPONSES = `SELECT concept_id, COUNT(*) AS n FROM concept_feedback GROUP BY concept_id`;

// Column list matches the feedback CSV (Req 17.3): no email or phone.
const SQL_EXPORT_FEEDBACK = `
SELECT anon_id, concept_id, verdict, changes, colour, priorities, price_band_id, price_skipped, other_text,
       utm_source, utm_medium, utm_campaign, updated_at
FROM concept_feedback
ORDER BY concept_id, anon_id`;

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export interface FeedbackInput {
  anonId: string;
  conceptId: ConceptId;
  verdict: Verdict;
  changes: readonly ChangeChip[];
  otherText: string | null;
  colour: PaletteColour | null;
  priorities: readonly PriorityChip[];
  priceBandId: string | null;
  /** Stored as 1 only for an explicit skip. The table CHECK rejects a skip that also has a band. */
  priceSkipped: boolean;
  utm: Utm;
  /** ISO 8601 UTC. */
  now: string;
}

/** The prepared (unexecuted) statement, for use in `db.batch`. */
export function feedbackUpsertStatement(db: D1Like, f: FeedbackInput): D1PreparedStatementLike {
  return db
    .prepare(SQL_FEEDBACK_UPSERT)
    .bind(
      f.anonId,
      f.conceptId,
      f.verdict,
      encodeChipSet(f.changes),
      f.otherText,
      f.colour,
      encodeChipSet(f.priorities),
      f.priceBandId,
      f.priceSkipped ? 1 : 0,
      f.utm.source,
      f.utm.medium,
      f.utm.campaign,
      f.now,
    );
}

/** Insert or replace the one row for (anonId, conceptId). UTM values and `created_at` keep the first write. */
export async function upsertFeedback(db: D1Like, f: FeedbackInput): Promise<void> {
  await feedbackUpsertStatement(db, f).run();
}

// ---------------------------------------------------------------------------
// Frustration
// ---------------------------------------------------------------------------

export interface FrustrationInput {
  anonId: string;
  chips: readonly string[];
  otherText: string | null;
  utm: Utm;
  now: string;
}

export function frustrationUpsertStatement(db: D1Like, f: FrustrationInput): D1PreparedStatementLike {
  return db
    .prepare(SQL_FRUSTRATION_UPSERT)
    .bind(f.anonId, encodeChipSet(f.chips), f.otherText, f.utm.source, f.utm.medium, f.utm.campaign, f.now);
}

export async function upsertFrustration(db: D1Like, f: FrustrationInput): Promise<void> {
  await frustrationUpsertStatement(db, f).run();
}

// ---------------------------------------------------------------------------
// Event counts (no personal data, Req 18.4)
// ---------------------------------------------------------------------------

export interface EventInput {
  /** YYYY-MM-DD, UTC. */
  day: string;
  event: EventName;
  /** Empty strings, not NULL, so the primary key works. */
  conceptId?: ConceptId | '';
  section?: string;
  utm?: Partial<Utm>;
}

export function eventIncrementStatement(db: D1Like, e: EventInput): D1PreparedStatementLike {
  return db
    .prepare(SQL_EVENT_INCREMENT)
    .bind(
      e.day,
      e.event,
      e.conceptId ?? '',
      e.section ?? '',
      e.utm?.source ?? '',
      e.utm?.medium ?? '',
      e.utm?.campaign ?? '',
    );
}

export async function incrementEvent(db: D1Like, e: EventInput): Promise<void> {
  await eventIncrementStatement(db, e).run();
}

// ---------------------------------------------------------------------------
// Interest and consents (Req 12.8, 12.9)
// ---------------------------------------------------------------------------

export type ConsentType = 'email' | 'whatsapp' | 'link' | 'adult';
export type MlSync = 'none' | 'pending' | 'sent' | 'failed';

export interface ConsentInput {
  type: ConsentType;
  granted: boolean;
}

export interface InterestInput {
  /** Stored only when `linked` is true; otherwise it is ignored and NULL is written. */
  anonId: string | null;
  linked: boolean;
  email: string | null;
  /** Normalised `+91XXXXXXXXXX`. */
  phone: string | null;
  size: Size | null;
  mlSync: MlSync;
  utm: Utm;
  noticeVersion: string;
  consents: readonly ConsentInput[];
  now: string;
}

/**
 * Upsert the interest row and append one consent row per entry, in a single D1 batch (one transaction).
 * The row is found by email, or by phone when there is no email. At least one of the two is required.
 * Consent rows are append-only: a repeat submission adds a new set.
 * Returns the interest row id.
 */
export async function saveInterestWithConsents(db: D1Like, i: InterestInput): Promise<number> {
  const key = i.email ?? i.phone;
  if (key === null) throw new Error('saveInterestWithConsents needs an email or a phone number');
  const byEmail = i.email !== null;
  const linked = i.linked && i.anonId !== null;

  const upsert = db
    .prepare(byEmail ? SQL_INTEREST_UPSERT_BY_EMAIL : SQL_INTEREST_UPSERT_BY_PHONE)
    .bind(
      linked ? i.anonId : null,
      linked ? 1 : 0,
      i.email,
      i.phone,
      i.size,
      i.mlSync,
      i.utm.source,
      i.utm.medium,
      i.utm.campaign,
      i.now,
    );
  const consentSql = byEmail ? SQL_CONSENT_BY_EMAIL : SQL_CONSENT_BY_PHONE;
  const consentStatements = i.consents.map((c) =>
    db.prepare(consentSql).bind(key, c.type, c.granted ? 1 : 0, i.noticeVersion, i.now),
  );
  await db.batch([upsert, ...consentStatements]);

  const row = await db
    .prepare(byEmail ? SQL_INTEREST_ID_BY_EMAIL : SQL_INTEREST_ID_BY_PHONE)
    .bind(key)
    .first<{ id: number }>();
  if (row === null) throw new Error('interest row missing after upsert');
  return row.id;
}

export async function setInterestMlSync(db: D1Like, interestId: number, status: MlSync, now: string): Promise<void> {
  await db.prepare(SQL_INTEREST_SET_ML_SYNC).bind(interestId, status, now).run();
}

// ---------------------------------------------------------------------------
// Results queries (counts only, grouped in the database)
// ---------------------------------------------------------------------------

export interface ResultCounts {
  responses: { concept_id: string; n: number }[];
  verdicts: { concept_id: string; verdict: string; n: number }[];
  colours: { concept_id: string; colour: string; n: number }[];
  bands: { concept_id: string; price_band_id: string; n: number }[];
  skips: { concept_id: string; n: number }[];
  priorities: { concept_id: string; priorities: string; n: number }[];
  changes: { concept_id: string; changes: string; n: number }[];
}

export async function queryResultCounts(db: D1Like): Promise<ResultCounts> {
  const [responses, verdicts, colours, bands, skips, priorities, changes] = await Promise.all([
    db.prepare(SQL_RESULTS_RESPONSES).all<ResultCounts['responses'][number]>(),
    db.prepare(SQL_RESULTS_VERDICT).all<ResultCounts['verdicts'][number]>(),
    db.prepare(SQL_RESULTS_COLOUR).all<ResultCounts['colours'][number]>(),
    db.prepare(SQL_RESULTS_BAND).all<ResultCounts['bands'][number]>(),
    db.prepare(SQL_RESULTS_SKIP).all<ResultCounts['skips'][number]>(),
    db.prepare(SQL_RESULTS_PRIORITIES).all<ResultCounts['priorities'][number]>(),
    db.prepare(SQL_RESULTS_CHANGES).all<ResultCounts['changes'][number]>(),
  ]);
  return {
    responses: responses.results,
    verdicts: verdicts.results,
    colours: colours.results,
    bands: bands.results,
    skips: skips.results,
    priorities: priorities.results,
    changes: changes.results,
  };
}

function zero<T extends string>(keys: readonly T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const k of keys) out[k] = 0;
  return out;
}

/** Reshapes grouped counts into the same `ConceptAggregate` that `aggregateFeedback` builds in memory. */
export function aggregatesFromCounts(c: ResultCounts): Map<ConceptId, ConceptAggregate> {
  const out = new Map<ConceptId, ConceptAggregate>();
  for (const id of CONCEPT_IDS) {
    out.set(id, {
      conceptId: id,
      responses: 0,
      verdictCounts: zero(VERDICTS),
      changeCounts: zero(CHANGE_CHIPS),
      colourCounts: zero(PALETTE),
      priceBandCounts: {},
      priceSkipCount: 0,
      priorityCounts: zero(PRIORITY_CHIPS),
    });
  }
  const get = (id: string): ConceptAggregate | undefined => out.get(id as ConceptId);

  for (const r of c.responses) {
    const a = get(r.concept_id);
    if (a) a.responses = r.n;
  }
  for (const r of c.verdicts) {
    const a = get(r.concept_id);
    if (a && (VERDICTS as readonly string[]).includes(r.verdict)) a.verdictCounts[r.verdict as Verdict] = r.n;
  }
  for (const r of c.colours) {
    const a = get(r.concept_id);
    if (a && (PALETTE as readonly string[]).includes(r.colour)) a.colourCounts[r.colour as PaletteColour] = r.n;
  }
  for (const r of c.bands) {
    const a = get(r.concept_id);
    if (a) a.priceBandCounts[r.price_band_id] = r.n;
  }
  for (const r of c.skips) {
    const a = get(r.concept_id);
    if (a) a.priceSkipCount = r.n;
  }
  for (const id of CONCEPT_IDS) {
    const a = out.get(id) as ConceptAggregate;
    a.priorityCounts = sumChipCounts(
      c.priorities.filter((r) => r.concept_id === id).map((r) => ({ set: r.priorities, n: r.n })),
      PRIORITY_CHIPS,
    );
    a.changeCounts = sumChipCounts(
      c.changes.filter((r) => r.concept_id === id).map((r) => ({ set: r.changes, n: r.n })),
      CHANGE_CHIPS,
    );
  }
  return out;
}

export async function queryAggregates(db: D1Like): Promise<Map<ConceptId, ConceptAggregate>> {
  return aggregatesFromCounts(await queryResultCounts(db));
}

// ---------------------------------------------------------------------------
// Export queries
// ---------------------------------------------------------------------------

interface ExportRow {
  anon_id: string;
  concept_id: string;
  verdict: string;
  changes: string;
  colour: string | null;
  priorities: string;
  price_band_id: string | null;
  price_skipped: number;
  other_text: string | null;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  updated_at: string;
}

/**
 * All feedback rows, ordered by Concept then Anonymous_ID, as `FeedbackRow`s.
 * The CSV and `aggregateFeedback` both start from this list, so they cannot disagree (Req 17.6).
 * Contains no email or phone (Req 17.3).
 */
export async function exportFeedbackRows(db: D1Like): Promise<FeedbackRow[]> {
  const { results } = await db.prepare(SQL_EXPORT_FEEDBACK).all<ExportRow>();
  return results.map((r) => ({
    anonId: r.anon_id,
    conceptId: r.concept_id as ConceptId,
    verdict: r.verdict as Verdict,
    changes: decodeChipSet(r.changes, CHANGE_CHIPS),
    colour: r.colour as PaletteColour | null,
    priorities: decodeChipSet(r.priorities, PRIORITY_CHIPS),
    priceBandId: r.price_band_id,
    priceSkipped: r.price_skipped === 1,
    otherText: r.other_text,
    utm: { source: r.utm_source, medium: r.utm_medium, campaign: r.utm_campaign },
    updatedAt: r.updated_at,
  }));
}
