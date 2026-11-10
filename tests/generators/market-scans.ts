/**
 * fast-check generators for market scans (Properties 12 and 13).
 *
 * `uniqueTokenScan()` yields a valid scan whose evidence brands, URLs and seen
 * dates cannot occur anywhere else in the public projection.
 * `candidateScan()` yields a scan, valid or not, with an independent oracle for
 * the four consistency rules.
 */
import fc from 'fast-check';
import type { MarketScanInput } from '../../src/lib/market-scan-schema';
import { isoDay } from './fact-entries';

const CHANNELS = ['online marketplaces', 'brand sites', 'mall high-street'] as const;
const channels = fc.uniqueArray(fc.constantFrom(...CHANNELS), { minLength: 1, maxLength: 3 });
const conceptId = fc.constantFrom(
  'mens-cotton-shirt',
  'mens-cotton-linen-shirt',
  'mens-linen-shirt',
  'mens-relaxed-pant',
  'womens-coord-set',
) as fc.Arbitrary<MarketScanInput['conceptId']>;

export interface UniqueTokenScan {
  scan: MarketScanInput;
  brands: string[];
  urls: string[];
  seenDates: string[];
  prices: number[];
}

/**
 * Valid scan. Brands and URLs carry a unique token. Seen dates lie strictly inside the
 * window (so they differ from `from` and `to`) and are unique. Prices lie strictly inside
 * the range, are unique, and are far above the listings count.
 */
export function uniqueTokenScan(): fc.Arbitrary<UniqueTokenScan> {
  return fc
    .record({
      conceptId,
      channels,
      rangeMin: fc.integer({ min: 1000, max: 3000 }),
      width: fc.integer({ min: 20, max: 2000 }),
      windowStart: fc.integer({ min: 0, max: 300 }),
      windowLength: fc.integer({ min: 10, max: 40 }),
      n: fc.integer({ min: 1, max: 8 }),
    })
    .chain((r) =>
      fc
        .record({
          prices: fc.uniqueArray(fc.integer({ min: r.rangeMin + 1, max: r.rangeMin + r.width - 1 }), {
            minLength: r.n,
            maxLength: r.n,
          }),
          days: fc.uniqueArray(fc.integer({ min: r.windowStart + 1, max: r.windowStart + r.windowLength - 1 }), {
            minLength: r.n,
            maxLength: r.n,
          }),
          tokens: fc.uniqueArray(fc.stringMatching(/^[a-z]{10}$/), { minLength: r.n, maxLength: r.n }),
        })
        .map(({ prices, days, tokens }) => {
          const evidence = tokens.map((t, i) => ({
            brand: `Brand${t}Zq`,
            url: `https://evidence.invalid/${t}/listing`,
            price: prices[i] as number,
            seen: isoDay(days[i] as number),
          }));
          const scan: MarketScanInput = {
            id: r.conceptId,
            conceptId: r.conceptId,
            label: 'MoolResha market scan',
            rangeMin: r.rangeMin,
            rangeMax: r.rangeMin + r.width,
            methodNote: {
              listings: r.n,
              from: isoDay(r.windowStart),
              to: isoDay(r.windowStart + r.windowLength),
              channels: r.channels,
            },
            evidence,
          };
          return {
            scan,
            brands: evidence.map((e) => e.brand),
            urls: evidence.map((e) => e.url),
            seenDates: evidence.map((e) => e.seen),
            prices,
          };
        }),
    );
}

export interface CandidateScan {
  scan: MarketScanInput;
  /** Independent statement of the four rules in Property 13. */
  expectedValid: boolean;
}

/** The four rules of Property 13, stated directly on the generated object. */
export function scanIsConsistent(s: MarketScanInput): boolean {
  return (
    s.rangeMin <= s.rangeMax &&
    s.methodNote.listings === s.evidence.length &&
    s.evidence.every((e) => e.price >= s.rangeMin && e.price <= s.rangeMax) &&
    s.evidence.every((e) => e.seen >= s.methodNote.from && e.seen <= s.methodNote.to)
  );
}

/**
 * A scan that is otherwise schema-valid (positive integer prices, ISO dates, at least one
 * evidence row), with each rule independently kept or possibly broken.
 */
export function candidateScan(): fc.Arbitrary<CandidateScan> {
  return fc
    .record({
      conceptId,
      channels,
      n: fc.integer({ min: 1, max: 5 }),
      keepOrder: fc.boolean(),
      keepCount: fc.boolean(),
      keepPrices: fc.boolean(),
      keepDates: fc.boolean(),
      a: fc.integer({ min: 1, max: 5000 }),
      b: fc.integer({ min: 1, max: 5000 }),
      wFrom: fc.integer({ min: 0, max: 200 }),
      wLen: fc.integer({ min: 0, max: 60 }),
      listingsAlt: fc.integer({ min: 1, max: 8 }),
    })
    .chain((r) => {
      const rangeMin = r.keepOrder ? Math.min(r.a, r.b) : Math.max(r.a, r.b);
      const rangeMax = r.keepOrder ? Math.max(r.a, r.b) : Math.min(r.a, r.b);
      const lo = Math.min(rangeMin, rangeMax);
      const hi = Math.max(rangeMin, rangeMax);
      const price = r.keepPrices ? fc.integer({ min: lo, max: hi }) : fc.integer({ min: 1, max: 5000 });
      const day = r.keepDates
        ? fc.integer({ min: r.wFrom, max: r.wFrom + r.wLen })
        : fc.integer({ min: 0, max: 300 });
      return fc
        .array(fc.record({ price, day, token: fc.stringMatching(/^[a-z]{8}$/) }), {
          minLength: r.n,
          maxLength: r.n,
        })
        .map((rows) => {
          const scan: MarketScanInput = {
            id: r.conceptId,
            conceptId: r.conceptId,
            label: 'MoolResha market scan',
            rangeMin,
            rangeMax,
            methodNote: {
              listings: r.keepCount ? r.n : r.listingsAlt,
              from: isoDay(r.wFrom),
              to: isoDay(r.wFrom + r.wLen),
              channels: r.channels,
            },
            evidence: rows.map((row) => ({
              brand: `Brand ${row.token}`,
              url: `https://evidence.invalid/${row.token}`,
              price: row.price,
              seen: isoDay(row.day),
            })),
          };
          return { scan, expectedValid: scanIsConsistent(scan) };
        });
    });
}
