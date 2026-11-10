// Property test for Price_Band contiguity validation (task 2.4).
import { describe, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import { validatePriceBands } from '../../src/lib/price-bands';
import { mutateLadder, priceLadder } from '../generators/price-ladder';

describe('price bands', () => {
  // Feature: launch-feedback-website, Property 1: Price-band contiguity validation
  // **Validates: Requirements 9.8**
  test.prop([priceLadder()], { numRuns: 200 })('a valid ladder has no errors', (bands) => {
    expect(validatePriceBands(bands)).toEqual([]);
  });

  // Feature: launch-feedback-website, Property 1: Price-band contiguity validation
  // **Validates: Requirements 9.8**
  test.prop([mutateLadder()], { numRuns: 300 })(
    'a valid ladder with one mutation reports an error of the matching kind',
    ({ bands, expected, tag }) => {
      const kinds = validatePriceBands(bands).map((e) => e.kind);
      expect(kinds, `mutation ${tag}`).toContain(expected);
    },
  );
});
