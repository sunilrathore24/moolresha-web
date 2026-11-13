/**
 * GET /api/admin/export/feedback.csv (Requirements 17.1 to 17.4).
 * Order: method, authentication, `admin` rate limit, then the export.
 * Columns follow design.md. There is no email or phone column (Requirement 17.3).
 */
import { CHANGE_CHIPS, PRIORITY_CHIPS, type ConceptId, type PaletteColour, type Verdict } from '../../../../src/content/config/allow-lists';
import { decodeChipSet, encodeChipSet, type FeedbackRow } from '../../../../src/lib/aggregate';
import { encodeCsv } from '../../../../src/lib/csv';
import {
  EXPORT_PAGE_SIZE,
  csvResponse,
  dateStamp,
  requireAdmin,
  type AdminExportContext,
  type AdminExportDeps,
} from '../../../_shared/admin-auth';
import type { D1Like } from '../../../_shared/db';
import { withErrorBoundary } from '../../../_shared/respond';

export const FEEDBACK_CSV_HEADER = [
  'anon_id',
  'concept_id',
  'verdict',
  'changes',
  'colour',
  'weave',
  'priorities',
  'price_band_id',
  'price_skipped',
  'other_text',
  'comment_text',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'updated_at',
] as const;

/** Pure builder: feedback rows to CSV text (CRLF, formulas neutralised by `encodeCsv`). */
export function buildFeedbackCsv(rows: readonly FeedbackRow[]): string {
  return encodeCsv(
    [...FEEDBACK_CSV_HEADER],
    rows.map((r) => [
      r.anonId,
      r.conceptId,
      r.verdict,
      encodeChipSet(r.changes),
      r.colour ?? '',
      r.weave ?? '',
      encodeChipSet(r.priorities),
      // A skip never carries a band.
      r.priceSkipped ? '' : (r.priceBandId ?? ''),
      r.priceSkipped ? '1' : '0',
      r.otherText ?? '',
      r.comment ?? '',
      r.utm.source,
      r.utm.medium,
      r.utm.campaign,
      r.updatedAt,
    ]),
  );
}

// ---------------------------------------------------------------------------
// Paged read (keyset on concept_id, anon_id), shared with aggregate.csv
// ---------------------------------------------------------------------------

// Same columns and order as `exportFeedbackRows` in db.ts (no email or phone).
// Keyset paging avoids OFFSET scans and stays correct if rows change between pages.
const SQL_EXPORT_PAGE = `
SELECT anon_id, concept_id, verdict, changes, colour, weave, priorities, price_band_id, price_skipped, other_text, comment_text,
       utm_source, utm_medium, utm_campaign, created_at, updated_at
FROM concept_feedback
WHERE (concept_id, anon_id) > (?1, ?2)
ORDER BY concept_id, anon_id
LIMIT ?3`;

interface ExportRow {
  anon_id: string;
  concept_id: string;
  verdict: string;
  changes: string;
  colour: string | null;
  weave: string | null;
  priorities: string;
  price_band_id: string | null;
  price_skipped: number;
  other_text: string | null;
  comment_text: string | null;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  created_at: string;
  updated_at: string;
}

function toFeedbackRow(r: ExportRow): FeedbackRow {
  return {
    anonId: r.anon_id,
    conceptId: r.concept_id as ConceptId,
    verdict: r.verdict as Verdict,
    changes: decodeChipSet(r.changes, CHANGE_CHIPS),
    colour: r.colour as PaletteColour | null,
    weave: r.weave,
    priorities: decodeChipSet(r.priorities, PRIORITY_CHIPS),
    priceBandId: r.price_band_id,
    priceSkipped: r.price_skipped === 1,
    otherText: r.other_text,
    comment: r.comment_text,
    utm: { source: r.utm_source, medium: r.utm_medium, campaign: r.utm_campaign },
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  };
}

/** All feedback rows, read in pages of `pageSize` (default 1,000), ordered by Concept then Anonymous_ID. */
export async function exportFeedbackRowsPaged(db: D1Like, pageSize: number = EXPORT_PAGE_SIZE): Promise<FeedbackRow[]> {
  const size = Math.max(1, Math.floor(pageSize));
  const out: FeedbackRow[] = [];
  let conceptId = '';
  let anonId = '';
  for (;;) {
    const { results } = await db.prepare(SQL_EXPORT_PAGE).bind(conceptId, anonId, size).all<ExportRow>();
    for (const r of results) out.push(toFeedbackRow(r));
    if (results.length < size) break;
    const last = results[results.length - 1] as ExportRow;
    conceptId = last.concept_id;
    anonId = last.anon_id;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function createFeedbackCsvHandler(deps: AdminExportDeps = {}) {
  return async (ctx: AdminExportContext): Promise<Response> => {
    const denied = await requireAdmin(ctx.request, ctx.env, deps);
    if (denied !== null) return denied;
    const now = (deps.now ?? (() => new Date()))();
    const db = deps.db ?? (ctx.env.DB as unknown as D1Like);
    const rows = await exportFeedbackRowsPaged(db, deps.pageSize);
    return csvResponse(buildFeedbackCsv(rows), `feedback-${dateStamp(now)}.csv`);
  };
}

export const onRequest = withErrorBoundary<AdminExportContext>(
  'admin_export_feedback',
  createFeedbackCsvHandler({ fetchImpl: (input, init) => fetch(input, init) }),
);
