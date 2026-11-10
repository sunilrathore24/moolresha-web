/**
 * fast-check generators for Price_Band ladders (used by Property 1 and the unit tests).
 *
 * `priceLadder()` yields valid ladders: one `under` band, 2 to 5 closed `range`
 * bands, one `over` band, joined by +0 or +1 as Requirement 9.8 allows.
 * `mutateLadder()` applies one tagged mutation to a valid ladder, so a test can
 * check that `validatePriceBands` reports an error of the matching kind.
 */
import fc from 'fast-check';
import { bandId, type BandError, type PriceBand } from '../../src/lib/price-bands';

/** Prefix for generated band ids. Any prefix works; ids only need to be unique. */
const PREFIX = 'gen';

/** Valid ladders. Start ₹500–2,000, 2–5 closed bands, widths ₹100–1,500, joins +0 or +1. */
export function priceLadder(): fc.Arbitrary<PriceBand[]> {
  const closedBand = fc.record({
    width: fc.integer({ min: 100, max: 1500 }),
    join: fc.constantFrom(0, 1),
  });
  return fc
    .record({
      start: fc.integer({ min: 500, max: 2000 }),
      firstJoin: fc.constantFrom(0, 1),
      closed: fc.array(closedBand, { minLength: 2, maxLength: 5 }),
      overJoin: fc.constantFrom(0, 1),
    })
    .map(({ start, firstJoin, closed, overJoin }) => {
      const bands: PriceBand[] = [{ kind: 'under', id: bandId(PREFIX, { kind: 'under', id: '', upper: start }), upper: start }];
      let lower = start + firstJoin;
      let upper = start;
      closed.forEach(({ width, join }, i) => {
        if (i > 0) lower = upper + join;
        upper = lower + width;
        bands.push({ kind: 'range', id: bandId(PREFIX, { kind: 'range', id: '', lower, upper }), lower, upper });
      });
      const overLower = upper + overJoin;
      bands.push({ kind: 'over', id: bandId(PREFIX, { kind: 'over', id: '', lower: overLower }), lower: overLower });
      return bands;
    });
}

export const MUTATION_TAGS = [
  'gap',
  'overlap',
  'swapped',
  'missing_under',
  'missing_over',
  'duplicate_under',
  'duplicate_over',
  'under_not_first',
  'over_not_last',
  'empty_range',
  'duplicate_id',
] as const;
export type MutationTag = (typeof MUTATION_TAGS)[number];

export interface MutatedLadder {
  tag: MutationTag;
  /** The error kind `validatePriceBands` must report for this mutation. */
  expected: BandError['kind'];
  bands: PriceBand[];
}

const EXPECTED: Record<MutationTag, BandError['kind']> = {
  gap: 'gap',
  overlap: 'overlap',
  swapped: 'not_ascending',
  missing_under: 'missing_under',
  missing_over: 'missing_over',
  duplicate_under: 'multiple_under',
  duplicate_over: 'multiple_over',
  under_not_first: 'under_not_first',
  over_not_last: 'over_not_last',
  empty_range: 'empty_range',
  duplicate_id: 'duplicate_id',
};

/** Same band with a new lower bound and a fresh id. `under` has no lower bound and is returned as is. */
function withLower(band: PriceBand, lower: number): PriceBand {
  if (band.kind === 'under') return band;
  const moved = { ...band, lower };
  return { ...moved, id: bandId(PREFIX, moved) };
}

/** Same band shifted up by `by` rupees, with a fresh id. */
function shifted(band: PriceBand, by: number): PriceBand {
  switch (band.kind) {
    case 'under':
      return { ...band, upper: band.upper + by, id: bandId(PREFIX, { ...band, upper: band.upper + by }) };
    case 'range': {
      const moved = { ...band, lower: band.lower + by, upper: band.upper + by };
      return { ...moved, id: bandId(PREFIX, moved) };
    }
    case 'over': {
      const moved = { ...band, lower: band.lower + by };
      return { ...moved, id: bandId(PREFIX, moved) };
    }
  }
}

function pick<T>(items: readonly T[], r: number): T {
  return items[r % items.length] as T;
}

/** Applies the mutation `tag` to a copy of the valid ladder `bands`. `r1` and `r2` choose where. */
export function applyMutation(bands: readonly PriceBand[], tag: MutationTag, r1: number, r2: number): MutatedLadder {
  const out = bands.map((b) => ({ ...b })) as PriceBand[];
  const last = out.length - 1;
  const rangeIdx = out.flatMap((b, i) => (b.kind === 'range' ? [i] : []));

  switch (tag) {
    case 'gap': {
      // Shift band i and everything after it up by 2 or more, so the pair (i-1, i) has a gap of ₹2 or more.
      const i = 1 + (r1 % last);
      const by = 2 + (r2 % 1000);
      for (let j = i; j <= last; j += 1) out[j] = shifted(out[j] as PriceBand, by);
      break;
    }
    case 'overlap': {
      // Pull the lower bound of band i below the upper bound of band i-1, but not below the lower bound of i-1.
      const i = 1 + (r1 % last);
      const a = out[i - 1] as PriceBand;
      const hiA = a.kind === 'over' ? 0 : a.upper;
      const loA = a.kind === 'range' ? a.lower : 1;
      const k = 1 + (r2 % (hiA - loA));
      out[i] = withLower(out[i] as PriceBand, hiA - k);
      break;
    }
    case 'swapped': {
      // Swap two neighbouring closed bands (the generator always makes at least two).
      const pairs = rangeIdx.slice(0, -1).filter((i) => out[i + 1]?.kind === 'range');
      const i = pick(pairs, r1);
      [out[i], out[i + 1]] = [out[i + 1] as PriceBand, out[i] as PriceBand];
      break;
    }
    case 'missing_under':
      out.shift();
      break;
    case 'missing_over':
      out.pop();
      break;
    case 'duplicate_under': {
      const under = out[0] as PriceBand;
      out.splice(1, 0, { ...under, id: `${under.id}-copy` });
      break;
    }
    case 'duplicate_over': {
      const over = out[last] as PriceBand;
      out.push({ ...over, id: `${over.id}-copy` });
      break;
    }
    case 'under_not_first': {
      const [under] = out.splice(0, 1);
      out.splice(1 + (r1 % last), 0, under as PriceBand);
      break;
    }
    case 'over_not_last': {
      const [over] = out.splice(last, 1);
      out.splice(r1 % last, 0, over as PriceBand);
      break;
    }
    case 'empty_range': {
      const i = pick(rangeIdx, r1);
      const band = out[i];
      if (band?.kind === 'range') out[i] = { ...band, lower: band.upper + 1 + (r2 % 500) };
      break;
    }
    case 'duplicate_id': {
      const j = 1 + (r1 % last);
      const i = r2 % j;
      out[j] = { ...(out[j] as PriceBand), id: (out[i] as PriceBand).id };
      break;
    }
  }
  return { tag, expected: EXPECTED[tag], bands: out };
}

/** A valid ladder with one tagged mutation applied. */
export function mutateLadder(): fc.Arbitrary<MutatedLadder> {
  return fc
    .tuple(priceLadder(), fc.constantFrom(...MUTATION_TAGS), fc.nat(), fc.nat())
    .map(([bands, tag, r1, r2]) => applyMutation(bands, tag, r1, r2));
}
