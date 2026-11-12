/**
 * GET /api/admin/stats.json — data for the in-site /admin dashboard page.
 *
 * Same auth/rate-limit gate as the CSV exports (`requireAdmin`): a Cloudflare Access JWT, or
 * `Authorization: Bearer <ADMIN_BEARER_SECRET>`. JSON, not CSV, because the dashboard renders it
 * directly as summary tiles, bar charts and tables instead of asking the admin to open a
 * spreadsheet — see `src/pages/admin/index.astro` and `src/islands/admin-dashboard.ts`.
 *
 * Reuses the exact same sources the CSV exports use, so the two can never disagree:
 * `queryAggregates` (per-Concept verdict/colour/band/priority counts, the same grouped SQL
 * `/api/results` uses) and `exportFeedbackRowsPaged` (every feedback row, for the free-text
 * "Any other thoughts?" comments — there is no separate comments table). `interest` (email/
 * WhatsApp signups) and `frustration` totals have no existing export; the two small counting
 * queries and the recent-signups page live in `db.ts` next to the others.
 *
 * Unlike the feedback CSV (Req 17.3, no email/phone), this endpoint does return email/phone from
 * `interest` — that is the whole point of the signups table — but it stays behind the same admin
 * gate as everything else here, never served to the public site.
 */
import { CONCEPT_IDS, type ConceptId } from '../../../src/content/config/allow-lists';
import {
  countFrustration,
  countInterest,
  queryAggregates,
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
  totals: {
    feedbackResponses: number;
    feedbackComments: number;
    emailSignups: number;
    frustrationSubmissions: number;
  };
  concepts: {
    conceptId: ConceptId;
    responses: number;
    verdictCounts: Record<string, number>;
    changeCounts: Record<string, number>;
    colourCounts: Record<string, number>;
    priceBandCounts: Record<string, number>;
    priceSkipCount: number;
    priorityCounts: Record<string, number>;
  }[];
  comments: { conceptId: ConceptId; verdict: string; comment: string; updatedAt: string }[];
  signups: {
    email: string | null;
    phone: string | null;
    size: string | null;
    linked: boolean;
    mlSync: string;
    createdAt: string;
  }[];
}

export function createAdminStatsHandler(deps: AdminExportDeps = {}) {
  return async (ctx: AdminExportContext): Promise<Response> => {
    const denied = await requireAdmin(ctx.request, ctx.env, deps);
    if (denied !== null) return denied;

    const db = deps.db ?? (ctx.env.DB as unknown as D1Like);

    const [aggregates, rows, emailSignups, signupRows, frustrationSubmissions] = await Promise.all([
      queryAggregates(db),
      exportFeedbackRowsPaged(db, deps.pageSize),
      countInterest(db),
      recentInterestSignups(db, 200),
      countFrustration(db),
    ]);

    const concepts = CONCEPT_IDS.map((conceptId) => {
      const a = aggregates.get(conceptId);
      return {
        conceptId,
        responses: a?.responses ?? 0,
        verdictCounts: a?.verdictCounts ?? {},
        changeCounts: a?.changeCounts ?? {},
        colourCounts: a?.colourCounts ?? {},
        priceBandCounts: a?.priceBandCounts ?? {},
        priceSkipCount: a?.priceSkipCount ?? 0,
        priorityCounts: a?.priorityCounts ?? {},
      };
    });

    const comments = rows
      .filter((r): r is typeof r & { comment: string } => r.comment !== null && r.comment.trim() !== '')
      .map((r) => ({ conceptId: r.conceptId, verdict: r.verdict, comment: r.comment, updatedAt: r.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const body: AdminStatsBody = {
      ok: true,
      generatedAt: new Date().toISOString(),
      totals: {
        feedbackResponses: concepts.reduce((sum, c) => sum + c.responses, 0),
        feedbackComments: comments.length,
        emailSignups,
        frustrationSubmissions,
      },
      concepts,
      comments,
      signups: signupRows.map((s) => ({
        email: s.email,
        phone: s.phone,
        size: s.size,
        linked: s.linked === 1,
        mlSync: s.ml_sync,
        createdAt: s.created_at,
      })),
    };
    return json(200, body);
  };
}

export const onRequest = withErrorBoundary<AdminExportContext>(
  'admin_stats',
  createAdminStatsHandler({ fetchImpl: (input, init) => fetch(input, init) }),
);
