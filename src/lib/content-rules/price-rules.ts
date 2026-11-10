/**
 * Content_Check price rules (task 9.11).
 *
 *  - CC-07 price-band-contiguity: runs `validatePriceBands` for each Concept
 *    and names the Concept and the error (Requirement 9.8).
 *  - CC-08 price-layers-no-amounts: no rupee amount in the Price_Layers
 *    section outside the GST fact element (Requirements 6.3, 6.7).
 */
import { validatePriceBands, type BandError } from '../price-bands';
import { extractPriceLayersSections, findRupeeAmountsOutsideFact } from './price-layers';
import type { Rule, Violation } from './types';

/** The one fact whose element may hold a rupee amount in the Price_Layers section. */
export const GST_FACT_ID = 'gst-cliff-2025';

function describeBandError(e: BandError): string {
  switch (e.kind) {
    case 'missing_under':
      return 'missing_under: the ladder has no "Under" band';
    case 'multiple_under':
      return 'multiple_under: the ladder has more than one "Under" band';
    case 'missing_over':
      return 'missing_over: the ladder has no top "+" band';
    case 'multiple_over':
      return 'multiple_over: the ladder has more than one top "+" band';
    case 'under_not_first':
      return 'under_not_first: the "Under" band is not first';
    case 'over_not_last':
      return 'over_not_last: the top "+" band is not last';
    case 'empty_range':
      return `empty_range: band ${e.id} has a lower bound above its upper bound`;
    case 'gap':
      return `gap: bands ${e.between[0]} and ${e.between[1]} leave a gap`;
    case 'overlap':
      return `overlap: bands ${e.between[0]} and ${e.between[1]} overlap`;
    case 'not_ascending':
      return `not_ascending: bands ${e.between[0]} and ${e.between[1]} are not in ascending order`;
    case 'duplicate_id':
      return `duplicate_id: band id ${e.id} is used more than once`;
  }
}

/** CC-07: every Concept's Price_Band ladder is contiguous and ordered. */
export const cc07: Rule = (ctx) => {
  const violations: Violation[] = [];
  for (const concept of ctx.concepts) {
    for (const error of validatePriceBands(concept.priceBands)) {
      violations.push({
        rule: 'CC-07',
        target: concept.id,
        detail: `Price_Bands of Concept "${concept.name}" (${concept.id}): ${describeBandError(error)}`,
      });
    }
  }
  return violations;
};

const INDEX_PATH = '/index.html';

/** CC-08: no rupee amount in `[data-section=price-layers]` outside the GST fact. */
export const cc08: Rule = (ctx) => {
  const violations: Violation[] = [];
  const page = ctx.pages.find((p) => p.path === INDEX_PATH);
  if (!page) return violations;
  for (const section of extractPriceLayersSections(page.html)) {
    for (const found of findRupeeAmountsOutsideFact(section, GST_FACT_ID)) {
      violations.push({
        rule: 'CC-08',
        target: INDEX_PATH,
        detail: `Price_Layers section has a rupee amount "${found.text}" in ${found.channel} outside the ${GST_FACT_ID} fact`,
      });
    }
  }
  return violations;
};

/** The rules this module provides, for registration in `index.ts` by the orchestrator. */
export const PRICE_RULES: Rule[] = [cc07, cc08];
