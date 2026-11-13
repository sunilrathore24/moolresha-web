/**
 * POST /api/feedback (design.md, "POST /api/feedback"; Requirements 9.13, 9.14, 9.15, 9.19, 14.x).
 *
 * One row per (Anonymous_ID, Concept): a repeat submission replaces the answer, including the
 * price answer. `priceSkipped` is stored as 1 only for an explicit skip. The row and the
 * `feedback_submitted` event counter are written in one D1 batch (one transaction).
 */
import { eventIncrementStatement, feedbackUpsertStatement, type D1Like } from '../_shared/db';
import {
  createWriteHandler,
  utmOrEmpty,
  type PipelineContext,
  type PipelineDeps,
  type StoreContext,
} from '../_shared/pipeline';
import { FeedbackBody, type FeedbackData } from '../_shared/schemas';
import type { ServerEvent } from '../../src/content/config/allow-lists';

const EVENT: ServerEvent = 'feedback_submitted';

export async function storeFeedback(data: FeedbackData, ctx: StoreContext): Promise<void> {
  const db: D1Like = ctx.db;
  const utm = utmOrEmpty(data.utm);
  await db.batch([
    feedbackUpsertStatement(db, {
      anonId: data.anonId,
      conceptId: data.conceptId,
      verdict: data.verdict,
      changes: data.changes,
      otherText: data.otherText ? data.otherText : null,
      comment: data.comment ? data.comment : null,
      colour: data.colour ?? null,
      weave: data.weave ?? null,
      priorities: data.priorities,
      priceBandId: data.priceBandId ?? null,
      priceSkipped: data.priceSkipped === true,
      utm,
      now: ctx.nowIso,
    }),
    eventIncrementStatement(db, { day: ctx.day, event: EVENT, conceptId: data.conceptId, utm }),
  ]);
}

/** Builds the handler. Tests pass `deps`; Pages uses `onRequest` below. */
export function createFeedbackHandler(deps: PipelineDeps = {}): (ctx: PipelineContext) => Promise<Response> {
  return createWriteHandler({ route: 'feedback', schema: FeedbackBody, store: storeFeedback }, deps);
}

export const onRequest = createFeedbackHandler();
