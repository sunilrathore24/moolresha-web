/**
 * Results aggregation and chip-set encoding (Requirements 9.19, 16.1, 16.2, 16.3, 16.5, 16.6).
 *
 * Pure module shared by the site, the Pages Functions and the tests: it imports
 * only the plain-TS allow-lists. No Astro, no Node or Workers APIs.
 *
 * Price skips are never a Price_Band. They are counted only in `priceSkipCount`
 * and never appear in `priceBandCounts` or the top band.
 */
import {
  CHANGE_CHIPS,
  CONCEPT_IDS,
  PALETTE,
  PRIORITY_CHIPS,
  VERDICTS,
  type ChangeChip,
  type ConceptId,
  type PaletteColour,
  type PriorityChip,
  type Verdict,
} from '../content/config/allow-lists';

/** A Concept shows results only from this many responses (Requirement 16.3). */
export const MIN_RESPONSES = 20;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface FeedbackRow {
  anonId: string;
  conceptId: ConceptId;
  verdict: Verdict;
  changes: ChangeChip[];
  colour: PaletteColour | null;
  priorities: PriorityChip[]; // duplicate-free; [] when none chosen
  priceBandId: string | null;
  priceSkipped: boolean; // never both set with priceBandId
  otherText: string | null;
  /** The general "Any other thoughts?" field — like `otherText`, admin-export-only, never
   * part of the public ConceptAggregate below. */
  comment: string | null;
  utm: { source: string; medium: string; campaign: string };
  updatedAt: string;
}

export interface ConceptAggregate {
  conceptId: ConceptId;
  responses: number;
  verdictCounts: Record<Verdict, number>;
  changeCounts: Record<ChangeChip, number>;
  colourCounts: Record<PaletteColour, number>;
  priceBandCounts: Record<string, number>;
  priceSkipCount: number; // counted apart from priceBandCounts; not a band
  priorityCounts: Record<PriorityChip, number>; // each chip a row selected counts once
}

export interface PublicConceptResult {
  conceptId: ConceptId;
  responses: number;
  enough: boolean;
  verdicts?: Record<Verdict, number>; // percentages, sum = 100
  leadingColour?: PaletteColour | null;
  topPriceBandId?: string | null; // argmax of priceBandCounts only
  priceAnswers?: number;
  priceSkips?: number;
  topPriorities?: PriorityChip[]; // every chip tied for the top count, allow-list order
}

// ---------------------------------------------------------------------------
// Chip sets
// ---------------------------------------------------------------------------

/** Compare by UTF-16 code unit order, which equals code point order for the ASCII chip ids. */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Stored form of a chip set: distinct chips, sorted by code point, joined with `|`.
 * The empty set is `''`. The same answer always produces the same string.
 */
export function encodeChipSet<T extends string>(chips: readonly T[]): string {
  return [...new Set(chips)].sort(byCodePoint).join('|');
}

/**
 * Parses a stored chip set. `''` is the empty set. A part outside `allow`, or an
 * empty part (as in `'a||b'` or a trailing `|`), throws. Repeated parts count once.
 * The result is sorted by code point, matching `encodeChipSet`.
 */
export function decodeChipSet<T extends string>(s: string, allow: readonly T[]): T[] {
  if (s === '') return [];
  const allowed = new Set<string>(allow);
  const out = new Set<T>();
  for (const part of s.split('|')) {
    if (part === '') throw new Error(`Invalid chip set "${s}": empty part`);
    if (!allowed.has(part)) throw new Error(`Invalid chip set "${s}": unknown chip "${part}"`);
    out.add(part as T);
  }
  return [...out].sort(byCodePoint);
}

function zeroCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const k of keys) out[k] = 0;
  return out;
}

/**
 * Sums per-chip counts from `GROUP BY priorities` rows: each row's `n` is added to
 * every chip in its set. Every chip in `allow` is present in the result, 0 if unused.
 */
export function sumChipCounts<T extends string>(
  rows: readonly { set: string; n: number }[],
  allow: readonly T[],
): Record<T, number> {
  const counts = zeroCounts(allow);
  for (const row of rows) {
    for (const chip of decodeChipSet(row.set, allow)) counts[chip] += row.n;
  }
  return counts;
}

/**
 * Every chip whose count equals the maximum, in `order`. `[]` when the maximum is 0.
 * Unlike colour and band, ties are not broken: all tied chips are returned (Requirement 16.6).
 */
export function topChips<T extends string>(counts: Record<T, number>, order: readonly T[]): T[] {
  let max = 0;
  for (const chip of order) max = Math.max(max, counts[chip] ?? 0);
  if (max <= 0) return [];
  return order.filter((chip) => (counts[chip] ?? 0) === max);
}

// ---------------------------------------------------------------------------
// Percentages
// ---------------------------------------------------------------------------

/**
 * Largest-remainder rounding with integer arithmetic only. The result sums to
 * exactly `total` (100 by default), each value is within 1 of its exact share
 * `count * total / sum`, and a zero count stays zero. All zeros give all zeros.
 * Remainder ties go to the lower index.
 */
export function largestRemainderPercent(counts: readonly number[], total = 100): number[] {
  for (const c of counts) {
    if (!Number.isSafeInteger(c) || c < 0) throw new RangeError(`Counts must be non-negative integers, got ${c}`);
  }
  const n = counts.reduce((a, b) => a + b, 0);
  if (n === 0) return counts.map(() => 0);

  const floors = counts.map((c) => Math.floor((c * total) / n));
  const remainders = counts.map((c) => (c * total) % n);
  const shortfall = total - floors.reduce((a, b) => a + b, 0);

  const order = counts
    .map((_, i) => i)
    .sort((a, b) => (remainders[b] as number) - (remainders[a] as number) || a - b);
  const result = [...floors];
  for (let k = 0; k < shortfall; k += 1) {
    const i = order[k] as number;
    result[i] = (result[i] as number) + 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function emptyAggregate(conceptId: ConceptId): ConceptAggregate {
  return {
    conceptId,
    responses: 0,
    verdictCounts: zeroCounts(VERDICTS),
    changeCounts: zeroCounts(CHANGE_CHIPS),
    colourCounts: zeroCounts(PALETTE),
    priceBandCounts: {},
    priceSkipCount: 0,
    priorityCounts: zeroCounts(PRIORITY_CHIPS),
  };
}

/**
 * Counts feedback rows per Concept. The map holds all five Concepts, with zero
 * counts for a Concept that has no rows.
 *
 * - `responses` counts every row, answered or not.
 * - Each Change_Chip and Priority_Chip a row selected counts once for that row.
 * - A Price_Skip is counted only in `priceSkipCount`. A row with `priceSkipped`
 *   set is never counted as a band, even if a band id is also present.
 */
export function aggregateFeedback(rows: readonly FeedbackRow[]): Map<ConceptId, ConceptAggregate> {
  const result = new Map<ConceptId, ConceptAggregate>();
  for (const id of CONCEPT_IDS) result.set(id, emptyAggregate(id));

  for (const row of rows) {
    const agg = result.get(row.conceptId);
    if (agg === undefined) continue;
    agg.responses += 1;
    agg.verdictCounts[row.verdict] += 1;
    for (const chip of new Set(row.changes)) agg.changeCounts[chip] += 1;
    if (row.colour !== null) agg.colourCounts[row.colour] += 1;
    for (const chip of new Set(row.priorities)) agg.priorityCounts[chip] += 1;
    if (row.priceSkipped) {
      agg.priceSkipCount += 1;
    } else if (row.priceBandId !== null) {
      agg.priceBandCounts[row.priceBandId] = (agg.priceBandCounts[row.priceBandId] ?? 0) + 1;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public projection
// ---------------------------------------------------------------------------

/**
 * Sort key for a band id of the form `<prefix>-under-<X>`, `<prefix>-<A>-<B>` or
 * `<prefix>-<A>-plus`: `under` first, then by lower bound. Used only when the
 * caller gives no configured order.
 */
function bandSortKey(id: string): number {
  const m = /^[a-z]+-(under|\d+)-(?:\d+|plus)$/.exec(id);
  if (m === null) return Number.POSITIVE_INFINITY;
  return m[1] === 'under' ? -1 : Number(m[1]);
}

/**
 * Top Price_Band: the band with the highest count, `null` if there are no bands.
 * Ties go to the earlier band in `bandOrder` (the configured, ascending order).
 * Without `bandOrder`, or for ids missing from it, ascending band-id order decides.
 */
function topBand(counts: Record<string, number>, bandOrder?: readonly string[]): string | null {
  const rank = (id: string): number => {
    const i = bandOrder?.indexOf(id) ?? -1;
    return i >= 0 ? i : Number.POSITIVE_INFINITY;
  };
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    if (best === null || count > bestCount) {
      best = id;
      bestCount = count;
      continue;
    }
    if (count === bestCount) {
      const better =
        rank(id) - rank(best) || bandSortKey(id) - bandSortKey(best) || byCodePoint(id, best);
      if (better < 0) best = id;
    }
  }
  return best;
}

/** Leading colour: highest count, ties broken by PALETTE order, `null` when nobody chose one. */
function leadingColour(counts: Record<PaletteColour, number>): PaletteColour | null {
  let best: PaletteColour | null = null;
  let bestCount = 0;
  for (const colour of PALETTE) {
    const c = counts[colour] ?? 0;
    if (c > bestCount) {
      best = colour;
      bestCount = c;
    }
  }
  return best;
}

/**
 * The public view of one Concept. Below `MIN_RESPONSES` it holds only the Concept
 * id, the response count and `enough: false`: no percentages, colour, band, price
 * counts or priorities are included (Requirements 16.3, 16.6). It never carries
 * Anonymous_IDs or free text, because `ConceptAggregate` holds none.
 *
 * `bandOrder` is the Concept's configured ascending band ids, used to break ties for
 * the top band. `topPriceBandId` comes from band counts only, never from skips.
 */
export function toPublicResult(agg: ConceptAggregate, bandOrder?: readonly string[]): PublicConceptResult {
  const enough = agg.responses >= MIN_RESPONSES;
  if (!enough) return { conceptId: agg.conceptId, responses: agg.responses, enough };

  const percents = largestRemainderPercent(VERDICTS.map((v) => agg.verdictCounts[v] ?? 0));
  const verdicts = {} as Record<Verdict, number>;
  VERDICTS.forEach((v, i) => {
    verdicts[v] = percents[i] as number;
  });

  const priceAnswers = Object.values(agg.priceBandCounts).reduce((a, b) => a + b, 0);

  return {
    conceptId: agg.conceptId,
    responses: agg.responses,
    enough,
    verdicts,
    leadingColour: leadingColour(agg.colourCounts),
    topPriceBandId: topBand(agg.priceBandCounts, bandOrder),
    priceAnswers,
    priceSkips: agg.priceSkipCount,
    topPriorities: topChips(agg.priorityCounts, PRIORITY_CHIPS),
  };
}
