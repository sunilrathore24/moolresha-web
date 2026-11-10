/**
 * POST /api/frustration (design.md, "POST /api/frustration"; Requirements 10.3, 14.x).
 *
 * One row per Anonymous_ID: a repeat submission replaces the chips. The row and the
 * `frustration_submitted` event counter are written in one D1 batch.
 */
import { eventIncrementStatement, frustrationUpsertStatement, type D1Like } from '../_shared/db';
import {
  createWriteHandler,
  utmOrEmpty,
  type PipelineContext,
  type PipelineDeps,
  type StoreContext,
} from '../_shared/pipeline';
import { FrustrationBody, type FrustrationData } from '../_shared/schemas';
import type { ServerEvent } from '../../src/content/config/allow-lists';

const EVENT: ServerEvent = 'frustration_submitted';

export async function storeFrustration(data: FrustrationData, ctx: StoreContext): Promise<void> {
  const db: D1Like = ctx.db;
  const utm = utmOrEmpty(data.utm);
  await db.batch([
    frustrationUpsertStatement(db, {
      anonId: data.anonId,
      chips: data.chips,
      otherText: data.otherText ? data.otherText : null,
      utm,
      now: ctx.nowIso,
    }),
    eventIncrementStatement(db, { day: ctx.day, event: EVENT, utm }),
  ]);
}

/** Builds the handler. Tests pass `deps`; Pages uses `onRequest` below. */
export function createFrustrationHandler(deps: PipelineDeps = {}): (ctx: PipelineContext) => Promise<Response> {
  return createWriteHandler({ route: 'frustration', schema: FrustrationBody, store: storeFrustration }, deps);
}

export const onRequest = createFrustrationHandler();
