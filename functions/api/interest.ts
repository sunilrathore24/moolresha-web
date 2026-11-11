/**
 * POST /api/interest (design.md, "POST /api/interest"; Requirements 12.7, 12.8, 12.9, 14.3, 14.6).
 *
 * Order after the shared pipeline checks (Origin, JSON, 16 KB cap, rate limit, strict schema):
 *   1. `noticeVersion` must equal `NOTICE_VERSION`, else `409 notice_outdated` (before Turnstile).
 *   2. Turnstile (pipeline).
 *   3. D1 write: the interest row first (`RETURNING id`, own round trip), then one consent row per
 *      ticked consent bound to that literal id (`saveInterestWithConsents`). Email is stored only
 *      with email consent, the phone only with WhatsApp consent (the schema refuses anything
 *      else), and `anon_id` only with link consent.
 *   4. The `interest_submitted` event.
 *   5. MailerLite for a consented email. A MailerLite failure never fails the request: the status
 *      goes to `interest.ml_sync` and the body carries `emailConfirmation`.
 *
 * Which consents are recorded: one row for each consent the visitor ticked (granted = 1), in the
 * order email, whatsapp, link, adult. An unticked box writes no row (design: "one row per consent
 * given"). A later withdrawal is a new row with granted = 0 (migrations/0001_init.sql).
 *
 * A size-only submission has no email or phone to key the row on, so it is written here with its own
 * statements, following the same two-round-trip, literal-id pattern.
 *
 * Logging: only event names, route and error classes. Never emails, phones, tokens or anonymous ids.
 */
import {
  eventIncrementStatement,
  saveInterestWithConsents,
  setInterestMlSync,
  type ConsentInput,
  type ConsentType,
  type D1Like,
  type D1PreparedStatementLike,
  type MlSync,
} from '../_shared/db';
import { log } from '../_shared/log';
import { subscribeToMailerLite } from '../_shared/mailerlite';
import {
  createWriteHandler,
  utmOrEmpty,
  type PipelineContext,
  type PipelineDeps,
  type StoreContext,
} from '../_shared/pipeline';
import { errorResponse } from '../_shared/respond';
import { InterestBody, type InterestData } from '../_shared/schemas';
import type { ServerEvent } from '../../src/content/config/allow-lists';
import { NOTICE_VERSION } from '../../src/lib/notice-version';

const EVENT: ServerEvent = 'interest_submitted';
const MAX_BODY_BYTES = 16 * 1024;
const CONSENT_ORDER: readonly ConsentType[] = ['email', 'whatsapp', 'link', 'adult'];

// Size-only rows (no email, no phone). Constant SQL, values only through bind().
// RETURNING id: see db.ts's saveInterestWithConsents for why the consent rows below are bound to
// this literal value rather than a subquery — a subquery here would have the same production-only
// failure as the one that was silently dropping every interest submission.
const SQL_SIZE_ONLY_UNLINKED = `
INSERT INTO interest (anon_id, linked, email, phone, size, ml_sync, utm_source, utm_medium, utm_campaign, created_at, updated_at)
VALUES (NULL, 0, NULL, NULL, ?1, 'none', ?2, ?3, ?4, ?5, ?5)
RETURNING id`;

const SQL_SIZE_ONLY_LINKED = `
INSERT INTO interest (anon_id, linked, email, phone, size, ml_sync, utm_source, utm_medium, utm_campaign, created_at, updated_at)
VALUES (?1, 1, NULL, NULL, ?2, 'none', ?3, ?4, ?5, ?6, ?6)
ON CONFLICT (anon_id) DO UPDATE SET size = excluded.size, updated_at = excluded.updated_at
RETURNING id`;

const SQL_SIZE_ONLY_CONSENT = `
INSERT INTO consents (interest_id, consent_type, granted, notice_version, recorded_at)
VALUES (?1, ?2, 1, ?3, ?4)`;

/** 409 when the visitor's page carries an older Privacy_Notice version. */
export function checkNoticeVersion(data: InterestData): Response | null {
  return data.noticeVersion === NOTICE_VERSION ? null : errorResponse(409, 'notice_outdated');
}

function ticked(data: InterestData): ConsentInput[] {
  return CONSENT_ORDER.filter((t) => data.consents[t] === true).map((type) => ({ type, granted: true }));
}

/**
 * Inserts the size-only interest row (own round trip, `RETURNING id`), then returns the consent
 * statements bound to that literal id, ready to batch with the event-count statement. Not fully
 * atomic with the caller's batch — see db.ts's saveInterestWithConsents for why that is an
 * acceptable, documented trade-off.
 */
async function insertSizeOnly(
  db: D1Like,
  data: InterestData,
  consents: readonly ConsentInput[],
  ctx: StoreContext,
): Promise<D1PreparedStatementLike[]> {
  const utm = utmOrEmpty(data.utm);
  const size = data.size ?? null;
  const linked = data.consents.link === true;
  const row = await (linked
    ? db.prepare(SQL_SIZE_ONLY_LINKED).bind(data.anonId, size, utm.source, utm.medium, utm.campaign, ctx.nowIso)
    : db.prepare(SQL_SIZE_ONLY_UNLINKED).bind(size, utm.source, utm.medium, utm.campaign, ctx.nowIso)
  ).first<{ id: number }>();
  if (row === null) throw new Error('size-only interest upsert returned no id');
  return consents.map((c) => db.prepare(SQL_SIZE_ONLY_CONSENT).bind(row.id, c.type, NOTICE_VERSION, ctx.nowIso));
}

export async function storeInterest(data: InterestData, ctx: StoreContext): Promise<Record<string, unknown>> {
  const db: D1Like = ctx.db;
  const utm = utmOrEmpty(data.utm);
  const linked = data.consents.link === true;
  const email = data.email ?? null;
  const phone = data.whatsapp ?? null;
  const consents = ticked(data);
  const eventStatement = (): D1PreparedStatementLike =>
    eventIncrementStatement(db, { day: ctx.day, event: EVENT, utm });

  if (email === null && phone === null) {
    // Size only: interest row first (own round trip), then its consent rows and the event together.
    const consentStatements = await insertSizeOnly(db, data, consents, ctx);
    await db.batch([...consentStatements, eventStatement()]);
    return {};
  }

  const initialSync: MlSync = email !== null ? 'pending' : 'none';
  const interestId = await saveInterestWithConsents(db, {
    anonId: linked ? data.anonId : null,
    linked,
    email,
    phone,
    size: data.size ?? null,
    mlSync: initialSync,
    utm,
    noticeVersion: NOTICE_VERSION,
    consents,
    now: ctx.nowIso,
  });

  // The helper cannot add the event to its batch, so it is a second call. The data is already
  // saved, so a failed counter must not turn the request into a 503.
  try {
    await db.batch([eventStatement()]);
  } catch (err) {
    log('event_count_failed', { route: 'interest', errorClass: err instanceof Error ? err.name : typeof err });
  }

  if (email === null) return {};

  const result = await subscribeToMailerLite(email, data.size ?? null, ctx.env, ctx.fetchImpl);
  try {
    await setInterestMlSync(db, interestId, result.mlSync, ctx.nowIso);
  } catch (err) {
    // The row stays 'pending', which is the state the admin retry script picks up.
    log('ml_sync_update_failed', { route: 'interest', errorClass: err instanceof Error ? err.name : typeof err });
  }
  return { emailConfirmation: result.ok ? 'sent' : 'delayed' };
}

/** Builds the handler. Tests pass `deps`; Pages uses `onRequest` below. */
export function createInterestHandler(deps: PipelineDeps = {}): (ctx: PipelineContext) => Promise<Response> {
  return createWriteHandler(
    {
      route: 'interest',
      schema: InterestBody,
      maxBodyBytes: MAX_BODY_BYTES,
      afterValidate: (data) => checkNoticeVersion(data),
      store: storeInterest,
    },
    deps,
  );
}

export const onRequest = createInterestHandler();
