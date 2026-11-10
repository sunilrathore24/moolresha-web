// Property tests for market-scan projection and consistency (tasks 2.9 and 2.10).
import { describe, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import { MarketScan } from '../../src/lib/market-scan-schema';
import { toPublicMarketScan } from '../../src/lib/market-scan';
import { candidateScan, uniqueTokenScan } from '../generators/market-scans';

/** Every number found anywhere in a JSON value. */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(numbersIn);
  return [];
}

describe('market scan', () => {
  // Feature: launch-feedback-website, Property 12: Market-scan evidence never reaches the public projection
  // **Validates: Requirements 7.6, 7.7, 7.10**
  test.prop([uniqueTokenScan()], { numRuns: 200 })(
    'the public projection holds the range, label and method note, and none of the evidence',
    ({ scan, brands, urls, seenDates, prices }) => {
      const parsed = MarketScan.parse(scan);
      const pub = toPublicMarketScan(parsed);
      const json = JSON.stringify(pub);

      for (const b of brands) expect(json).not.toContain(b);
      for (const u of urls) expect(json).not.toContain(u);
      for (const d of seenDates) expect(json).not.toContain(d);
      const numbers = numbersIn(JSON.parse(json));
      for (const p of prices) expect(numbers).not.toContain(p);
      expect(json).not.toContain('evidence');

      expect(pub.rangeMin).toBe(scan.rangeMin);
      expect(pub.rangeMax).toBe(scan.rangeMax);
      expect(pub.label).toBe('MoolResha market scan');
      expect(pub.methodNote).toEqual(scan.methodNote);
    },
  );

  // Feature: launch-feedback-website, Property 13: Market-scan internal consistency
  // **Validates: Requirements 7.7, 7.9**
  test.prop([candidateScan()], { numRuns: 500 })(
    'the schema accepts a scan if and only if its four consistency rules hold',
    ({ scan, expectedValid }) => {
      expect(MarketScan.safeParse(scan).success).toBe(expectedValid);
    },
  );
});
