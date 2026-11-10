/**
 * Price_Band schema, labels, ids and contiguity validation (Requirements 9.5, 9.7, 9.8).
 *
 * Pure module: it imports Zod and a type from the plain-TS allow-lists only,
 * never Astro, so Vitest, the Content_Check script and the Concept schema
 * (src/content.config.ts) can all import it.
 */
import { z } from 'zod';
import type { ConceptId } from '../content/config/allow-lists';

/**
 * - `under`: "Under ₹X", X exclusive.
 * - `range`: "₹A–B", both ends inclusive.
 * - `over`:  "₹Y+".
 */
export const PriceBandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('under'), id: z.string(), upper: z.number().int().positive() }),
  z.object({
    kind: z.literal('range'),
    id: z.string(),
    lower: z.number().int().positive(),
    upper: z.number().int().positive(),
  }),
  z.object({ kind: z.literal('over'), id: z.string(), lower: z.number().int().positive() }),
]);
export type PriceBand = z.infer<typeof PriceBandSchema>;

/** The list a Concept holds. Contiguity is checked by `validatePriceBands`, not by the schema. */
export const PriceBandsSchema = z.array(PriceBandSchema).min(2);

export type BandError =
  | { kind: 'missing_under' }
  | { kind: 'multiple_under' }
  | { kind: 'missing_over' }
  | { kind: 'multiple_over' }
  | { kind: 'under_not_first' }
  | { kind: 'over_not_last' }
  | { kind: 'empty_range'; id: string }
  | { kind: 'gap'; between: [string, string] }
  | { kind: 'overlap'; between: [string, string] }
  | { kind: 'not_ascending'; between: [string, string] }
  | { kind: 'duplicate_id'; id: string };

/** Upper bound of a band. For `under` this is the exclusive bound. `over` has none. */
function hi(band: PriceBand): number | undefined {
  return band.kind === 'over' ? undefined : band.upper;
}

/** Lower bound of a band. `under` has none. */
function lo(band: PriceBand): number | undefined {
  return band.kind === 'under' ? undefined : band.lower;
}

/**
 * Checks one Concept's Price_Bands against Requirement 9.8. Returns an empty
 * list when the ladder is valid. The caller (Content_Check CC-07) names the Concept.
 *
 * 1. Exactly one `under` band, first. Exactly one `over` band, last. Unique ids.
 * 2. Every `range` band has lower <= upper.
 * 3. Each adjacent pair (a, b) is contiguous when lo(b) = hi(a) or hi(a) + 1.
 *    Otherwise it is a gap (lo(b) > hi(a) + 1), not ascending (lo(b) < lo(a)),
 *    or an overlap (lo(a) <= lo(b) < hi(a)). `under` has no lower bound, so
 *    anything below its exclusive bound overlaps it.
 *
 * Pairs with an undefined bound (an `over` band followed by another band, or
 * a band followed by an `under` band) are reported by rule 1 and skipped here.
 */
export function validatePriceBands(bands: readonly PriceBand[]): BandError[] {
  const errors: BandError[] = [];

  const unders = bands.filter((b) => b.kind === 'under').length;
  const overs = bands.filter((b) => b.kind === 'over').length;
  if (unders === 0) errors.push({ kind: 'missing_under' });
  if (unders > 1) errors.push({ kind: 'multiple_under' });
  if (overs === 0) errors.push({ kind: 'missing_over' });
  if (overs > 1) errors.push({ kind: 'multiple_over' });
  if (bands.some((b, i) => b.kind === 'under' && i !== 0)) errors.push({ kind: 'under_not_first' });
  if (bands.some((b, i) => b.kind === 'over' && i !== bands.length - 1)) {
    errors.push({ kind: 'over_not_last' });
  }

  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const band of bands) {
    if (seen.has(band.id) && !reported.has(band.id)) {
      errors.push({ kind: 'duplicate_id', id: band.id });
      reported.add(band.id);
    }
    seen.add(band.id);
  }

  for (const band of bands) {
    if (band.kind === 'range' && band.lower > band.upper) {
      errors.push({ kind: 'empty_range', id: band.id });
    }
  }

  for (let i = 1; i < bands.length; i += 1) {
    const a = bands[i - 1];
    const b = bands[i];
    if (a === undefined || b === undefined) continue;
    const hiA = hi(a);
    const loB = lo(b);
    if (hiA === undefined || loB === undefined) continue;
    const loA = lo(a) ?? Number.NEGATIVE_INFINITY;
    const between: [string, string] = [a.id, b.id];

    if (loB === hiA || loB === hiA + 1) continue;
    if (loB > hiA + 1) errors.push({ kind: 'gap', between });
    else if (loB < loA) errors.push({ kind: 'not_ascending', between });
    else errors.push({ kind: 'overlap', between });
  }

  return errors;
}

const rupees = new Intl.NumberFormat('en-IN');

/**
 * The visible label, generated from data and never written by hand:
 * "Under ₹1,000", "₹1,500–1,999" (en dash), "₹3,000+".
 * Indian digit grouping comes from `Intl.NumberFormat('en-IN')`.
 */
export function bandLabel(band: PriceBand): string {
  switch (band.kind) {
    case 'under':
      return `Under ₹${rupees.format(band.upper)}`;
    case 'range':
      return `₹${rupees.format(band.lower)}–${rupees.format(band.upper)}`;
    case 'over':
      return `₹${rupees.format(band.lower)}+`;
  }
}

/** Band id prefix for each Concept, as fixed in the design. */
export const BAND_ID_PREFIXES: Record<ConceptId, string> = {
  'mens-cotton-shirt': 'mcs',
  'mens-cotton-linen-shirt': 'mcl',
  'mens-linen-shirt': 'mls',
  'mens-relaxed-pant': 'mrp',
  'womens-coord-set': 'wcs',
};

/**
 * The deterministic id `<prefix>-<lower|under>-<upper|plus>`, for example
 * `mcs-under-1000`, `mcs-1000-1499`, `mcs-3000-plus`.
 */
export function bandId(prefix: string, band: PriceBand): string {
  switch (band.kind) {
    case 'under':
      return `${prefix}-under-${band.upper}`;
    case 'range':
      return `${prefix}-${band.lower}-${band.upper}`;
    case 'over':
      return `${prefix}-${band.lower}-plus`;
  }
}

/** The id a band of this Concept is expected to have. */
export function expectedBandId(conceptId: ConceptId, band: PriceBand): string {
  return bandId(BAND_ID_PREFIXES[conceptId], band);
}
