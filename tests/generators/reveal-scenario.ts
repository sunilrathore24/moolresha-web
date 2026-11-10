/**
 * fast-check arbitrary for the market reveal module (Property 34).
 * A scenario is the raw `mr_price_answered` value in each storage (absent,
 * valid, with unknown ids, or malformed) and a sequence of submission outcomes.
 */
import fc from 'fast-check';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import type { SubmitOutcome, PriceAnswer } from '../../src/islands/market-reveal';

export interface RevealScenario {
  session: string | null;
  local: string | null;
  outcomes: SubmitOutcome[];
}

const knownId = fc.constantFrom(...CONCEPT_IDS);

/** One raw storage value. */
export function storedValue(): fc.Arbitrary<string | null> {
  const unknownId = fc.string({ maxLength: 12 }).filter((s) => !(CONCEPT_IDS as readonly string[]).includes(s));
  return fc.oneof(
    fc.constant<string | null>(null),
    fc.uniqueArray(knownId).map((ids) => JSON.stringify(ids)),
    fc
      .tuple(fc.array(knownId), fc.array(fc.oneof(unknownId, fc.integer(), fc.constant(null))))
      .chain(([known, junk]) => fc.shuffledSubarray([...known, ...junk]).map((a) => JSON.stringify(a))),
    fc.constantFrom('', '[', '{"a":1}', 'null', '"mens-cotton-shirt"', '42', 'not json', '[mens-cotton-shirt]'),
    fc.string({ maxLength: 30 }),
  );
}

export function submitOutcome(): fc.Arbitrary<SubmitOutcome> {
  return fc.record({
    conceptId: knownId,
    ok: fc.boolean(),
    price: fc.constantFrom<PriceAnswer>('band', 'skip', 'none'),
  });
}

export function revealScenario(): fc.Arbitrary<RevealScenario> {
  return fc.record({
    session: storedValue(),
    local: storedValue(),
    outcomes: fc.array(submitOutcome(), { minLength: 0, maxLength: 30 }),
  });
}
