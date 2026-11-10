/**
 * fast-check generators for feedback rows (used by the aggregation properties 3 and 4,
 * the CSV round trip and the chip-set properties).
 *
 * - `prioritySet()`: duplicate-free Priority_Chip lists in random order, biased towards
 *   empty sets, single chips and the full set so that ties for the top count are common.
 * - `priceAnswer()`: exactly one of a Price_Band, a Price_Skip or no answer.
 * - `feedbackRow()`: a whole row. Band ids default to a fixture ladder per Concept built
 *   with the design's id scheme; pass `bandIds` to use the configured ones.
 */
import fc from 'fast-check';
import {
  CHANGE_CHIPS,
  CONCEPT_IDS,
  PALETTE,
  PRIORITY_CHIPS,
  VERDICTS,
  type ConceptId,
  type PriorityChip,
} from '../../src/content/config/allow-lists';
import { BAND_ID_PREFIXES } from '../../src/lib/price-bands';
import type { FeedbackRow } from '../../src/lib/aggregate';
import { chipSubset, nastyString } from './index';

export interface PriceAnswerValue {
  priceBandId: string | null;
  priceSkipped: boolean;
}

/** Fixture band ids for a Concept, in ascending order, using the `<prefix>-<lower|under>-<upper|plus>` scheme. */
export function defaultBandIds(conceptId: ConceptId): string[] {
  const p = BAND_ID_PREFIXES[conceptId];
  return [`${p}-under-1000`, `${p}-1000-1499`, `${p}-1500-1999`, `${p}-2000-2499`, `${p}-2500-2999`, `${p}-3000-plus`];
}

/**
 * A Priority_Chip set: no duplicates, any order. Empty, single-chip and all-chip sets
 * are weighted up so rows often tie.
 */
export function prioritySet(): fc.Arbitrary<PriorityChip[]> {
  return fc.oneof(
    { weight: 3, arbitrary: fc.constant<PriorityChip[]>([]) },
    { weight: 3, arbitrary: fc.constantFrom(...PRIORITY_CHIPS).map((c): PriorityChip[] => [c]) },
    { weight: 1, arbitrary: fc.shuffledSubarray([...PRIORITY_CHIPS], { minLength: PRIORITY_CHIPS.length, maxLength: PRIORITY_CHIPS.length }) },
    { weight: 4, arbitrary: chipSubset(PRIORITY_CHIPS) },
  );
}

/** One price answer: a band from `bandIds`, an explicit skip, or no answer. Never a band and a skip together. */
export function priceAnswer(bandIds: readonly string[] = defaultBandIds('mens-cotton-shirt')): fc.Arbitrary<PriceAnswerValue> {
  const band = fc.constantFrom(...bandIds).map((id): PriceAnswerValue => ({ priceBandId: id, priceSkipped: false }));
  const skip = fc.constant<PriceAnswerValue>({ priceBandId: null, priceSkipped: true });
  const none = fc.constant<PriceAnswerValue>({ priceBandId: null, priceSkipped: false });
  return fc.oneof({ weight: 3, arbitrary: band }, { weight: 2, arbitrary: skip }, { weight: 2, arbitrary: none });
}

export interface FeedbackRowOptions {
  /** Limit rows to these Concepts (default: all five). */
  conceptIds?: readonly ConceptId[];
  /** Band ids per Concept (default: `defaultBandIds`). */
  bandIds?: (conceptId: ConceptId) => readonly string[];
}

const utmValue = fc.constantFrom('', 'instagram', 'whatsapp', 'newsletter', 'cpc', 'launch-2026');

/** A complete feedback row. Free text may be nasty; Anonymous_IDs are UUIDs. */
export function feedbackRow(options: FeedbackRowOptions = {}): fc.Arbitrary<FeedbackRow> {
  const ids = options.conceptIds ?? CONCEPT_IDS;
  const bandsFor = options.bandIds ?? defaultBandIds;
  return fc
    .constantFrom(...ids)
    .chain((conceptId) =>
      fc.record({
        anonId: fc.uuid(),
        conceptId: fc.constant(conceptId),
        verdict: fc.constantFrom(...VERDICTS),
        changes: chipSubset(CHANGE_CHIPS),
        colour: fc.option(fc.constantFrom(...PALETTE), { nil: null }),
        priorities: prioritySet(),
        price: priceAnswer(bandsFor(conceptId)),
        otherText: fc.option(
          fc.oneof(fc.string({ maxLength: 40 }), nastyString().map((s) => s.slice(0, 200))),
          { nil: null },
        ),
        utm: fc.record({ source: utmValue, medium: utmValue, campaign: utmValue }),
        updatedAt: fc
          .integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2027, 11, 31) })
          .map((ms) => new Date(ms).toISOString()),
      }),
    )
    .map(({ price, ...rest }): FeedbackRow => ({ ...rest, priceBandId: price.priceBandId, priceSkipped: price.priceSkipped }));
}
