/**
 * GET /api/admin/stats.json — data for the in-site /admin dashboard page.
 *
 * Same auth/rate-limit gate as the CSV exports (`requireAdmin`): a Cloudflare Access JWT, or
 * `Authorization: Bearer <ADMIN_BEARER_SECRET>`. JSON, not CSV, because the dashboard renders it
 * directly as trend tiles, charts and tables instead of asking the admin to open a spreadsheet —
 * see `src/pages/admin/index.astro` and `src/islands/admin-dashboard.ts`.
 *
 * Optional `?from=YYYY-MM-DD&to=YYYY-MM-DD` (both inclusive) scope every number in the response
 * to that window; missing/invalid falls back to the last 30 days ending today (UTC) — see
 * `resolveRange` in `src/lib/admin-stats.ts`. The resolved range is echoed back in `range` so
 * the dashboard's date inputs always reflect what the numbers actually cover.
 *
 * Reuses the exact same sources the CSV exports and `/api/results` already use, so none of them
 * can disagree: `exportFeedbackRowsPaged` (every feedback row — filtered here to the selected
 * range, then re-aggregated per `rows` entry, one per Concept or per-Concept-per-weave, with the
 * same pure `aggregateFeedback` `/api/results` uses) plus two small timestamp-only queries for
 * `interest` and `frustration` (no existing export covered those). Sums across rows (top
 * priorities, what they'd change, price bands) and the price-band-by-label donut are left to
 * the client, which already has every row's breakdown and the label maps baked in at build time
 * (`src/pages/admin/index.astro`) — no need to duplicate that here.
 */
import { aggregateFeedback, type FeedbackRow } from '../../../src/lib/aggregate';
import {
  bucketByDay,
  dailyBuckets,
  previousRange,
  resolveRange,
  toDateOnly,
  trend,
  UNSPECIFIED_WEAVE,
  type Trend,
} from '../../../src/lib/admin-stats';
import { CONCEPT_IDS, type ConceptId } from '../../../src/content/config/allow-lists';
import { CONCEPT_WEAVE_VARIANTS } from '../../../src/lib/concept-weave-variants';
import {
  allFrustrationCreatedAt,
  allInterestCreatedAt,
  recentInterestSignups,
  type D1Like,
} from '../../_shared/db';
import {
  requireAdmin,
  type AdminExportContext,
  type AdminExportDeps,
} from '../../_shared/admin-auth';
import { json, withErrorBoundary } from '../../_shared/respond';
import { exportFeedbackRowsPaged } from './export/feedback.csv';

export interface AdminStatsBody {
  ok: true;
  generatedAt: string;
  range: { from: string; to: string };
  totals: {
    feedbackResponses: Trend;
    feedbackComments: Trend;
    emailSignups: Trend;
    frustrationSubmissions: Trend;
  };
  series: {
    days: string[];
    feedback: number[];
    comments: number[];
    signups: number[];
  };
  /** One row per Concept, EXCEPT a Concept with weave variants (today, only mens-cotton-shirt —
   * see concept-weave-variants.ts) contributes one row per weave instead of one combined row,
   * so every chart (Feedback by Concept, Verdict, Price Band Interest, and the sums behind Top
   * Priorities / What They Would Change) differentiates Micro-Dobby from Cotton Slub rather than
   * folding both under one "RootWeave 01" number. This scales to however many weaves a Concept
   * ever has — nothing here assumes a fixed count. `weaveId` is `null` for a Concept with no
   * weave variants (its one row), a real weave id for a split row, or `UNSPECIFIED_WEAVE` for
   * the leftover rows of a Concept that has weave variants but whose `weave` wasn't tagged
   * (legacy rows from before the weave field existed) — kept as its own row rather than being
   * silently dropped or folded into one weave, so every row's responses still sum to the
   * Concept's real total. */
  rows: {
    conceptId: ConceptId;
    weaveId: string | null;
    responses: number;
    verdictCounts: Record<string, number>;
    changeCounts: Record<string, number>;
    colourCounts: Record<string, number>;
    priceBandCounts: Record<string, number>;
    priceSkipCount: number;
    priorityCounts: Record<string, number>;
  }[];
  comments: { conceptId: ConceptId; verdict: string; comment: string; weave: string | null; updatedAt: string }[];
  /** The free-text box that opens under the "What would you change?" question's "Other" chip —
   * distinct from `comments`' general "Any other thoughts?" field. Previously collected
   * (CSV-exportable) but never shown anywhere in this dashboard. */
  otherTextEntries: { conceptId: ConceptId; verdict: string; otherText: string; weave: string | null; updatedAt: string }[];
  signups: {
    email: string | null;
    phone: string | null;
    size: string | null;
    linked: boolean;
    mlSync: string;
    createdAt: string;
  }[];
}

function inMs(iso: string, fromMs: number, toMs: number): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= fromMs && t < toMs;
}

export function createAdminStatsHandler(deps: AdminExportDeps = {}) {
  return async (ctx: AdminExportContext): Promise<Response> => {
    const denied = await requireAdmin(ctx.request, ctx.env, deps);
    if (denied !== null) return denied;

    const db = deps.db ?? (ctx.env.DB as unknown as D1Like);
    const now = (deps.now ?? (() => new Date()))();
    const url = new URL(ctx.request.url);
    const range = resolveRange(url.searchParams.get('from'), url.searchParams.get('to'), now.getTime());
    const prev = previousRange(range);

    const [rows, interestTimestamps, signupRows, frustrationTimestamps] = await Promise.all([
      exportFeedbackRowsPaged(db, deps.pageSize),
      allInterestCreatedAt(db),
      // Most-recent-200 convenience list, same as the signups TABLE always used — fine while
      // total signups stay well under 200 (true today); documented in db.ts.
      recentInterestSignups(db, 200),
      allFrustrationCreatedAt(db),
    ]);

    // Feedback "when it happened" uses createdAt (first submission) for the stat tile and the
    // time series — a resubmission editing an existing answer shouldn't look like a brand new
    // respondent. Comments use updatedAt (when that specific comment text was written), since a
    // comment can be added/changed on a resubmission after the original createdAt.
    const rowsInRange = rows.filter((r) => r.createdAt !== undefined && inMs(r.createdAt, range.fromMs, range.toMs));
    const rowsInPrev = rows.filter((r) => r.createdAt !== undefined && inMs(r.createdAt, prev.fromMs, prev.toMs));

    const commentsAll = rows.filter((r) => r.comment !== null && r.comment.trim() !== '');
    const commentsInRange = commentsAll.filter((r) => inMs(r.updatedAt, range.fromMs, range.toMs));
    const commentsInPrev = commentsAll.filter((r) => inMs(r.updatedAt, prev.fromMs, prev.toMs));

    const otherTextAll = rows.filter((r) => r.otherText !== null && r.otherText.trim() !== '');
    const otherTextInRange = otherTextAll.filter((r) => inMs(r.updatedAt, range.fromMs, range.toMs));

    const signupsInRangeCount = interestTimestamps.filter((t) => inMs(t, range.fromMs, range.toMs)).length;
    const signupsInPrevCount = interestTimestamps.filter((t) => inMs(t, prev.fromMs, prev.toMs)).length;

    const frustrationInRangeCount = frustrationTimestamps.filter((t) => inMs(t, range.fromMs, range.toMs)).length;
    const frustrationInPrevCount = frustrationTimestamps.filter((t) => inMs(t, prev.fromMs, prev.toMs)).length;

    // One row per (Concept, weave) combination actually present — see the `rows` doc comment
    // on AdminStatsBody above. `aggregateFeedback` is the exact same pure function /api/results
    // and the CSV exports already use; it's just called once per row here instead of once per
    // Concept, on whatever subset of `rowsInRange` that row covers.
    function toStatRow(conceptId: ConceptId, weaveId: string | null, subset: FeedbackRow[]) {
      const a = aggregateFeedback(subset).get(conceptId);
      return {
        conceptId,
        weaveId,
        responses: a?.responses ?? 0,
        verdictCounts: a?.verdictCounts ?? {},
        changeCounts: a?.changeCounts ?? {},
        colourCounts: a?.colourCounts ?? {},
        priceBandCounts: a?.priceBandCounts ?? {},
        priceSkipCount: a?.priceSkipCount ?? 0,
        priorityCounts: a?.priorityCounts ?? {},
      };
    }

    const statRows = CONCEPT_IDS.flatMap((conceptId) => {
      const conceptRowsInRange = rowsInRange.filter((r) => r.conceptId === conceptId);
      const variants = CONCEPT_WEAVE_VARIANTS[conceptId];
      if (!variants) return [toStatRow(conceptId, null, conceptRowsInRange)];

      const weaveIds = new Set(variants.map((v) => v.id));
      const out = variants.map((v) => toStatRow(conceptId, v.id, conceptRowsInRange.filter((r) => r.weave === v.id)));
      const leftover = conceptRowsInRange.filter((r) => !weaveIds.has(r.weave ?? ''));
      if (leftover.length > 0) out.push(toStatRow(conceptId, UNSPECIFIED_WEAVE, leftover));
      return out;
    });

    const days = dailyBuckets(range);
    const feedbackByDay = bucketByDay(
      rowsInRange.map((r) => r.createdAt as string),
      days,
    );
    const commentsByDay = bucketByDay(
      commentsInRange.map((r) => r.updatedAt),
      days,
    );
    const signupsByDay = bucketByDay(interestTimestamps, days);

    const comments = commentsInRange
      .map((r) => ({
        conceptId: r.conceptId,
        verdict: r.verdict,
        comment: r.comment as string,
        weave: r.weave ?? null,
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const otherTextEntries = otherTextInRange
      .map((r) => ({
        conceptId: r.conceptId,
        verdict: r.verdict,
        otherText: r.otherText as string,
        weave: r.weave ?? null,
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const signups = signupRows
      .filter((s) => inMs(s.created_at, range.fromMs, range.toMs))
      .map((s) => ({
        email: s.email,
        phone: s.phone,
        size: s.size,
        linked: s.linked === 1,
        mlSync: s.ml_sync,
        createdAt: s.created_at,
      }));

    const body: AdminStatsBody = {
      ok: true,
      generatedAt: now.toISOString(),
      range: { from: toDateOnly(range.fromMs), to: toDateOnly(range.toMs - 1) },
      totals: {
        feedbackResponses: trend(rowsInRange.length, rowsInPrev.length),
        feedbackComments: trend(commentsInRange.length, commentsInPrev.length),
        emailSignups: trend(signupsInRangeCount, signupsInPrevCount),
        frustrationSubmissions: trend(frustrationInRangeCount, frustrationInPrevCount),
      },
      series: {
        days,
        feedback: days.map((d) => feedbackByDay[d] ?? 0),
        comments: days.map((d) => commentsByDay[d] ?? 0),
        signups: days.map((d) => signupsByDay[d] ?? 0),
      },
      rows: statRows,
      comments,
      otherTextEntries,
      signups,
    };
    return json(200, body);
  };
}

export const onRequest = withErrorBoundary<AdminExportContext>(
  'admin_stats',
  createAdminStatsHandler({ fetchImpl: (input, init) => fetch(input, init) }),
);
