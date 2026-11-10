/**
 * Women's co-ord set composition rule (Requirement 8.5).
 *
 * Valid when the set is 100% cotton, or cotton plus 10-20% linen, summing to 100.
 * Pure module: no Astro imports, so Vitest, the Concept schema and Content_Check
 * rule CC-13 can all reuse it.
 */

export interface CompositionPart {
  readonly fibre: string;
  readonly percent: number;
}

export const COORD_LINEN_MIN = 10;
export const COORD_LINEN_MAX = 20;

export function isValidCoordComposition(parts: readonly CompositionPart[]): boolean {
  if (parts.length === 0) return false;

  let cotton = 0;
  let linen = 0;
  for (const part of parts) {
    if (!Number.isFinite(part.percent) || part.percent <= 0) return false;
    if (part.fibre === 'cotton') cotton += part.percent;
    else if (part.fibre === 'linen') linen += part.percent;
    else return false; // any other fibre is outside the rule
  }

  if (cotton + linen !== 100) return false;
  if (linen === 0) return cotton === 100;
  return linen >= COORD_LINEN_MIN && linen <= COORD_LINEN_MAX;
}
