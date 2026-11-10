// Unit tests for src/lib/price-bands.ts (Requirements 9.5, 9.7, 9.8) and the ladder generators.
// Property 1 (task 2.4) is written separately.
import { describe, expect, it } from 'vitest';
import { test } from '@fast-check/vitest';
import {
  PriceBandSchema,
  bandId,
  bandLabel,
  expectedBandId,
  validatePriceBands,
  type PriceBand,
} from '../../src/lib/price-bands';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { MUTATION_TAGS, applyMutation, mutateLadder, priceLadder } from '../generators/price-ladder';

const under = (upper: number, id = `u-${upper}`): PriceBand => ({ kind: 'under', id, upper });
const range = (lower: number, upper: number, id = `r-${lower}-${upper}`): PriceBand => ({ kind: 'range', id, lower, upper });
const over = (lower: number, id = `o-${lower}`): PriceBand => ({ kind: 'over', id, lower });

/** The five initial ladders from Requirement 9.7, as [under, range lowers..., over]. */
const CONFIGURED: Record<(typeof CONCEPT_IDS)[number], PriceBand[]> = {
  'mens-cotton-shirt': ladder(1000, [1000, 1500, 2000, 2500], 3000),
  'mens-cotton-linen-shirt': ladder(1500, [1500, 2000, 2500, 3000], 3500),
  'mens-linen-shirt': ladder(2000, [2000, 2500, 3000, 3500], 4000),
  'mens-relaxed-pant': ladder(1000, [1000, 1500, 2000, 2500], 3000),
  'womens-coord-set': ladder(1500, [1500, 2000, 2500, 3000, 3500], 4000),
};

function ladder(underAt: number, rangeLowers: number[], overAt: number): PriceBand[] {
  return [
    under(underAt),
    ...rangeLowers.map((lower) => range(lower, lower + 499)),
    over(overAt),
  ];
}

describe('bandLabel', () => {
  it('labels an under band', () => expect(bandLabel(under(1000))).toBe('Under ₹1,000'));
  it('labels a range band with an en dash', () => {
    const label = bandLabel(range(1500, 1999));
    expect(label).toBe('₹1,500–1,999');
    expect(label).toContain('\u2013');
    expect(label).not.toContain('-');
  });
  it('labels an over band', () => expect(bandLabel(over(3000))).toBe('₹3,000+'));
  it('uses Indian digit grouping above one lakh', () => {
    expect(bandLabel(over(100000))).toBe('₹1,00,000+');
    expect(bandLabel(under(250000))).toBe('Under ₹2,50,000');
  });
  it('labels the Requirement 9.7 co-ord set ladder exactly', () => {
    expect(CONFIGURED['womens-coord-set'].map(bandLabel)).toEqual([
      'Under ₹1,500',
      '₹1,500–1,999',
      '₹2,000–2,499',
      '₹2,500–2,999',
      '₹3,000–3,499',
      '₹3,500–3,999',
      '₹4,000+',
    ]);
  });
});

describe('bandId', () => {
  it('builds ids as <prefix>-<lower|under>-<upper|plus>', () => {
    expect(bandId('mcs', under(1000))).toBe('mcs-under-1000');
    expect(bandId('mcs', range(1000, 1499))).toBe('mcs-1000-1499');
    expect(bandId('mcs', range(1500, 1999))).toBe('mcs-1500-1999');
    expect(bandId('mcs', over(3000))).toBe('mcs-3000-plus');
  });
  it('uses the fixed prefix of each Concept', () => {
    expect(expectedBandId('mens-cotton-shirt', over(3000))).toBe('mcs-3000-plus');
    expect(expectedBandId('mens-cotton-linen-shirt', over(3500))).toBe('mcl-3500-plus');
    expect(expectedBandId('mens-linen-shirt', under(2000))).toBe('mls-under-2000');
    expect(expectedBandId('mens-relaxed-pant', range(1000, 1499))).toBe('mrp-1000-1499');
    expect(expectedBandId('womens-coord-set', range(3500, 3999))).toBe('wcs-3500-3999');
  });
});

describe('PriceBandSchema', () => {
  it('accepts the three kinds', () => {
    for (const band of [under(1000), range(1000, 1499), over(3000)]) {
      expect(PriceBandSchema.safeParse(band).success).toBe(true);
    }
  });
  it('rejects an unknown kind, a missing bound and a non-integer bound', () => {
    expect(PriceBandSchema.safeParse({ kind: 'exact', id: 'x', price: 1 }).success).toBe(false);
    expect(PriceBandSchema.safeParse({ kind: 'range', id: 'x', lower: 1000 }).success).toBe(false);
    expect(PriceBandSchema.safeParse({ kind: 'under', id: 'x', upper: 999.5 }).success).toBe(false);
  });
});

describe('validatePriceBands: valid ladders', () => {
  for (const [concept, bands] of Object.entries(CONFIGURED)) {
    it(`accepts the configured ladder for ${concept} (Requirement 9.7)`, () => {
      expect(validatePriceBands(bands)).toEqual([]);
    });
  }

  it('accepts an adjacent join of +0 and of +1', () => {
    expect(validatePriceBands([under(1000), range(1000, 1499), range(1500, 1999), over(2000)])).toEqual([]);
    expect(validatePriceBands([under(1000), range(1000, 1499), range(1499, 1999), over(1999)])).toEqual([]);
  });

  it('accepts a ladder with only under and over', () => {
    expect(validatePriceBands([under(1000), over(1000)])).toEqual([]);
    expect(validatePriceBands([under(1000), over(1001)])).toEqual([]);
  });
});

describe('validatePriceBands: invalid ladders', () => {
  const kinds = (bands: PriceBand[]) => validatePriceBands(bands).map((e) => e.kind);

  it('reports a gap and names the two bands', () => {
    const errors = validatePriceBands([under(1000), range(1000, 1499), range(1501, 1999), over(2000)]);
    expect(errors).toContainEqual({ kind: 'gap', between: ['r-1000-1499', 'r-1501-1999'] });
  });

  it('reports a gap between the under band and the first range', () => {
    expect(kinds([under(1000), range(1002, 1499), over(1500)])).toContain('gap');
  });

  it('reports an overlap', () => {
    const errors = validatePriceBands([under(1000), range(1000, 1499), range(1400, 1999), over(2000)]);
    expect(errors).toContainEqual({ kind: 'overlap', between: ['r-1000-1499', 'r-1400-1999'] });
  });

  it('reports an overlap with the under band', () => {
    expect(kinds([under(1000), range(900, 1499), over(1500)])).toContain('overlap');
  });

  it('reports bands that are not ascending', () => {
    expect(kinds([under(1000), range(1500, 1999), range(1000, 1499), over(2000)])).toContain('not_ascending');
  });

  it('reports a missing under or over band', () => {
    expect(kinds([range(1000, 1499), over(1500)])).toContain('missing_under');
    expect(kinds([under(1000), range(1000, 1499)])).toContain('missing_over');
  });

  it('reports a second under or over band', () => {
    expect(kinds([under(1000), under(1500), over(2000)])).toContain('multiple_under');
    expect(kinds([under(1000), over(1500), over(2000)])).toContain('multiple_over');
  });

  it('reports an under band that is not first and an over band that is not last', () => {
    expect(kinds([range(1000, 1499), under(1000), over(1500)])).toContain('under_not_first');
    expect(kinds([under(1000), over(1500), range(1000, 1499)])).toContain('over_not_last');
  });

  it('reports a range with lower greater than upper', () => {
    const errors = validatePriceBands([under(1000), range(1500, 1499, 'bad'), over(1500)]);
    expect(errors).toContainEqual({ kind: 'empty_range', id: 'bad' });
  });

  it('reports a duplicate id once', () => {
    const errors = validatePriceBands([under(1000, 'same'), range(1000, 1499, 'same'), over(1500, 'same')]);
    expect(errors.filter((e) => e.kind === 'duplicate_id')).toEqual([{ kind: 'duplicate_id', id: 'same' }]);
  });

  it('reports an empty list as missing both ends', () => {
    expect(kinds([])).toEqual(['missing_under', 'missing_over']);
  });
});

describe('ladder generators', () => {
  test.prop([priceLadder()], { numRuns: 200 })('priceLadder() yields ladders with no errors and 4 to 7 bands', (bands) => {
    expect(validatePriceBands(bands)).toEqual([]);
    expect(bands.length).toBeGreaterThanOrEqual(4);
    expect(bands.length).toBeLessThanOrEqual(7);
    expect(PriceBandSchema.array().safeParse(bands).success).toBe(true);
  });

  test.prop([mutateLadder()], { numRuns: 300 })('mutateLadder() yields a ladder with the tagged error', (m) => {
    expect(validatePriceBands(m.bands).map((e) => e.kind)).toContain(m.expected);
  });

  it('every mutation tag is reachable and detected on a fixed ladder', () => {
    const base = CONFIGURED['mens-cotton-shirt'];
    for (const tag of MUTATION_TAGS) {
      const m = applyMutation(base, tag, 1, 1);
      expect(m.tag).toBe(tag);
      expect(validatePriceBands(m.bands).map((e) => e.kind), tag).toContain(m.expected);
    }
  });
});
