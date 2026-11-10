/**
 * GET /api/admin/export/aggregate.csv (Requirements 17.1 to 17.3, 17.6).
 * Built with `aggregateFeedback` over the same rows the feedback CSV is built from, so the two cannot
 * disagree. Columns: concept_id, question, answer, count.
 *
 * Rows per Concept: every verdict, Change_Chip, Palette_Colour and Priority_Chip (zeros included, so a
 * chip nobody chose shows as 0); one `price_band` row per band that has answers; one `price_skip` row
 * with the answer `skipped`. Skips are never written as a `price_band` answer.
 */
import {
  CHANGE_CHIPS,
  CONCEPT_IDS,
  PALETTE,
  PRIORITY_CHIPS,
  VERDICTS,
} from '../../../../src/content/config/allow-lists';
import { aggregateFeedback, type FeedbackRow } from '../../../../src/lib/aggregate';
import { encodeCsv } from '../../../../src/lib/csv';
import {
  csvResponse,
  dateStamp,
  requireAdmin,
  type AdminExportContext,
  type AdminExportDeps,
} from '../../../_shared/admin-auth';
import type { D1Like } from '../../../_shared/db';
import { withErrorBoundary } from '../../../_shared/respond';
import { exportFeedbackRowsPaged } from './feedback.csv';

export const AGGREGATE_CSV_HEADER = ['concept_id', 'question', 'answer', 'count'] as const;

/** Pure builder: feedback rows to aggregate CSV text. */
export function buildAggregateCsv(rows: readonly FeedbackRow[]): string {
  const agg = aggregateFeedback(rows);
  const out: string[][] = [];
  for (const id of CONCEPT_IDS) {
    const a = agg.get(id);
    if (a === undefined) continue;
    for (const v of VERDICTS) out.push([id, 'verdict', v, String(a.verdictCounts[v])]);
    for (const c of CHANGE_CHIPS) out.push([id, 'change', c, String(a.changeCounts[c])]);
    for (const c of PALETTE) out.push([id, 'colour', c, String(a.colourCounts[c])]);
    for (const c of PRIORITY_CHIPS) out.push([id, 'priority', c, String(a.priorityCounts[c])]);
    for (const band of Object.keys(a.priceBandCounts).sort()) {
      out.push([id, 'price_band', band, String(a.priceBandCounts[band])]);
    }
    out.push([id, 'price_skip', 'skipped', String(a.priceSkipCount)]);
  }
  return encodeCsv([...AGGREGATE_CSV_HEADER], out);
}

export function createAggregateCsvHandler(deps: AdminExportDeps = {}) {
  return async (ctx: AdminExportContext): Promise<Response> => {
    const denied = await requireAdmin(ctx.request, ctx.env, deps);
    if (denied !== null) return denied;
    const now = (deps.now ?? (() => new Date()))();
    const db = deps.db ?? (ctx.env.DB as unknown as D1Like);
    const rows = await exportFeedbackRowsPaged(db, deps.pageSize);
    return csvResponse(buildAggregateCsv(rows), `aggregate-${dateStamp(now)}.csv`);
  };
}

export const onRequest = withErrorBoundary<AdminExportContext>(
  'admin_export_aggregate',
  createAggregateCsvHandler({ fetchImpl: (input, init) => fetch(input, init) }),
);
