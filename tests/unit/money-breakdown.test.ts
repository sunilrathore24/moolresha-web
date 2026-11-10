import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { barWidth, parseShares, sharesLeaveRemainder } from '../../src/lib/money-breakdown';

const SEEDED =
  "In a widely cited breakdown of a T-shirt's retail price, about 60% of the price went to the retailer, 12% to brand profit, 12% to materials and 8% to transport.";

describe('parseShares', () => {
  it('reads the four shares of the seeded breakdown fact, in order', () => {
    expect(parseShares(SEEDED)).toEqual([
      { label: 'Retailer', percent: 60, display: '60%' },
      { label: 'Brand profit', percent: 12, display: '12%' },
      { label: 'Materials', percent: 12, display: '12%' },
      { label: 'Transport', percent: 8, display: '8%' },
    ]);
  });

  it('returns nothing for text without shares', () => {
    expect(parseShares('Under 1% of the price, nothing else.')).toEqual([]);
    expect(parseShares('')).toEqual([]);
  });

  // Feature: launch-feedback-website, parseShares round trip
  // **Validates: Requirements 5.1, 5.3**
  it('recovers every share from a sentence in the fact format', () => {
    const share = fc.record({
      percent: fc.integer({ min: 1, max: 99 }),
      // A label that starts with "the" would be read as the article, so keep it out.
      label: fc.stringMatching(/^[a-z]{3,10}( [a-z]{3,10})?$/).filter((l) => !/^the\b/.test(l)),
    });
    fc.assert(
      fc.property(fc.array(share, { minLength: 2, maxLength: 6 }), (items) => {
        const parts = items.map((s, i) =>
          i === 0 ? `${s.percent}% of the price went to the ${s.label}` : `${s.percent}% to ${s.label}`,
        );
        const parsed = parseShares(`Example, ${parts.join(', ')}.`);
        expect(parsed.map((p) => p.percent)).toEqual(items.map((s) => s.percent));
        expect(parsed.map((p) => p.label.toLowerCase())).toEqual(items.map((s) => s.label));
      }),
      { numRuns: 100 },
    );
  });
});

describe('barWidth and remainder', () => {
  it('clamps widths to 0 to 100', () => {
    expect(barWidth(60)).toBe(60);
    expect(barWidth(-5)).toBe(0);
    expect(barWidth(140)).toBe(100);
    expect(barWidth(Number.NaN)).toBe(0);
  });

  it('flags shares that do not cover the whole price', () => {
    expect(sharesLeaveRemainder(parseShares(SEEDED))).toBe(true);
    expect(sharesLeaveRemainder([{ label: 'All', percent: 100, display: '100%' }])).toBe(false);
  });
});
