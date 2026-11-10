import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PRIORITY_CHIPS, type ConceptId } from '../../src/content/config/allow-lists';
import {
  MIN_RESPONSES,
  aggregateFeedback,
  decodeChipSet,
  encodeChipSet,
  largestRemainderPercent,
  sumChipCounts,
  toPublicResult,
  topChips,
  type FeedbackRow,
} from '../../src/lib/aggregate';
import { defaultBandIds, feedbackRow, priceAnswer, prioritySet } from '../generators/feedback-rows';

const CONCEPT: ConceptId = 'mens-cotton-shirt';
const BANDS = defaultBandIds(CONCEPT);

let seq = 0;
function row(over: Partial<FeedbackRow> = {}): FeedbackRow {
  seq += 1;
  return {
    anonId: `anon-${seq}`,
    conceptId: CONCEPT,
    verdict: 'would_wear',
    changes: [],
    colour: null,
    priorities: [],
    priceBandId: null,
    priceSkipped: false,
    otherText: null,
    utm: { source: '', medium: '', campaign: '' },
    updatedAt: '2026-12-01T00:00:00.000Z',
    ...over,
  };
}

function many(n: number, over: Partial<FeedbackRow> = {}): FeedbackRow[] {
  return Array.from({ length: n }, () => row(over));
}

describe('chip sets', () => {
  it('encodes sorted, de-duplicated and joined with |', () => {
    expect(encodeChipSet(['softness', 'easy_care', 'softness'])).toBe('easy_care|softness');
    expect(encodeChipSet([])).toBe('');
  });

  it('decodes back to the sorted distinct chips', () => {
    expect(decodeChipSet('', PRIORITY_CHIPS)).toEqual([]);
    expect(decodeChipSet('softness|easy_care', PRIORITY_CHIPS)).toEqual(['easy_care', 'softness']);
  });

  it('throws on unknown or empty parts', () => {
    expect(() => decodeChipSet('softness|nope', PRIORITY_CHIPS)).toThrow();
    expect(() => decodeChipSet('softness||easy_care', PRIORITY_CHIPS)).toThrow();
    expect(() => decodeChipSet('softness|', PRIORITY_CHIPS)).toThrow();
  });

  it('round-trips generated sets', () => {
    fc.assert(
      fc.property(prioritySet(), (xs) => {
        const expected = [...new Set(xs)].sort();
        expect(decodeChipSet(encodeChipSet(xs), PRIORITY_CHIPS)).toEqual(expected);
        expect(encodeChipSet([...xs].reverse())).toBe(encodeChipSet(xs));
      }),
      { numRuns: 100 },
    );
  });

  it('sums GROUP BY rows into per-chip counts', () => {
    const counts = sumChipCounts(
      [
        { set: 'softness|easy_care', n: 3 },
        { set: 'softness', n: 2 },
      ],
      PRIORITY_CHIPS,
    );
    expect(counts.softness).toBe(5);
    expect(counts.easy_care).toBe(3);
    expect(counts.long_life).toBe(0);
  });

  it('topChips returns every tied chip in allow-list order, [] when the max is 0', () => {
    const counts = sumChipCounts([{ set: 'long_life|softness', n: 4 }, { set: 'easy_care', n: 1 }], PRIORITY_CHIPS);
    expect(topChips(counts, PRIORITY_CHIPS)).toEqual(['softness', 'long_life']);
    expect(topChips(sumChipCounts([], PRIORITY_CHIPS), PRIORITY_CHIPS)).toEqual([]);
  });
});

describe('largestRemainderPercent', () => {
  it('sums to 100 and keeps zeros at zero', () => {
    expect(largestRemainderPercent([1, 1, 1])).toEqual([34, 33, 33]);
    expect(largestRemainderPercent([0, 5, 0])).toEqual([0, 100, 0]);
    expect(largestRemainderPercent([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('stays within 1 of the exact share for generated counts', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 6 }), (counts) => {
        const n = counts.reduce((a, b) => a + b, 0);
        const out = largestRemainderPercent(counts);
        if (n === 0) {
          expect(out.every((v) => v === 0)).toBe(true);
          return;
        }
        expect(out.reduce((a, b) => a + b, 0)).toBe(100);
        counts.forEach((c, i) => {
          expect(Math.abs((out[i] as number) - (c * 100) / n)).toBeLessThan(1);
          if (c === 0) expect(out[i]).toBe(0);
        });
      }),
      { numRuns: 100 },
    );
  });
});

describe('aggregateFeedback', () => {
  it('counts skips only in priceSkipCount, never as a band', () => {
    const rows = [
      row({ priceBandId: BANDS[1] as string }),
      row({ priceSkipped: true }),
      row({ priceSkipped: true }),
      row(),
    ];
    const agg = aggregateFeedback(rows).get(CONCEPT)!;
    expect(agg.responses).toBe(4);
    expect(agg.priceSkipCount).toBe(2);
    expect(agg.priceBandCounts).toEqual({ [BANDS[1] as string]: 1 });
  });

  it('counts each selected chip once per row and holds all five Concepts', () => {
    const agg = aggregateFeedback([
      row({ priorities: ['softness', 'easy_care'], changes: ['fit', 'colour'], colour: 'clay' }),
      row({ priorities: ['softness'] }),
    ]);
    expect(agg.size).toBe(5);
    const a = agg.get(CONCEPT)!;
    expect(a.priorityCounts.softness).toBe(2);
    expect(a.priorityCounts.easy_care).toBe(1);
    expect(a.changeCounts.fit).toBe(1);
    expect(a.colourCounts.clay).toBe(1);
    expect(agg.get('mens-linen-shirt')!.responses).toBe(0);
  });

  it('keeps band counts unchanged when skip rows are added (generated)', () => {
    fc.assert(
      fc.property(fc.array(feedbackRow({ conceptIds: [CONCEPT] }), { maxLength: 40 }), fc.integer({ min: 0, max: 10 }), (rows, extra) => {
        const before = aggregateFeedback(rows).get(CONCEPT)!;
        const after = aggregateFeedback([...rows, ...many(extra, { priceSkipped: true })]).get(CONCEPT)!;
        expect(after.priceBandCounts).toEqual(before.priceBandCounts);
        expect(after.priceSkipCount).toBe(before.priceSkipCount + extra);
      }),
      { numRuns: 100 },
    );
  });

  it('generated price answers never set both a band and a skip', () => {
    fc.assert(
      fc.property(priceAnswer(BANDS), (a) => {
        expect(a.priceBandId !== null && a.priceSkipped).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe('toPublicResult', () => {
  it('omits all details below the minimum', () => {
    const agg = aggregateFeedback(many(MIN_RESPONSES - 1, { colour: 'clay', priorities: ['softness'], priceBandId: BANDS[0] as string })).get(CONCEPT)!;
    const res = toPublicResult(agg);
    expect(res).toEqual({ conceptId: CONCEPT, responses: MIN_RESPONSES - 1, enough: false });
    expect(Object.keys(res).sort()).toEqual(['conceptId', 'enough', 'responses']);
  });

  it('shows details at exactly the minimum', () => {
    const rows = many(MIN_RESPONSES, { colour: 'flax', priorities: ['softness', 'long_life'], priceBandId: BANDS[2] as string });
    const res = toPublicResult(aggregateFeedback(rows).get(CONCEPT)!);
    expect(res.enough).toBe(true);
    expect(res.verdicts).toEqual({ would_wear: 100, maybe: 0, not_for_me: 0 });
    expect(res.leadingColour).toBe('flax');
    expect(res.topPriceBandId).toBe(BANDS[2]);
    expect(res.priceAnswers).toBe(MIN_RESPONSES);
    expect(res.priceSkips).toBe(0);
    expect(res.topPriorities).toEqual(['softness', 'long_life']);
  });

  it('never lets skips decide the top band', () => {
    const rows = [...many(3, { priceBandId: BANDS[1] as string }), ...many(MIN_RESPONSES, { priceSkipped: true })];
    const res = toPublicResult(aggregateFeedback(rows).get(CONCEPT)!);
    expect(res.topPriceBandId).toBe(BANDS[1]);
    expect(res.priceSkips).toBe(MIN_RESPONSES);
    expect(res.priceAnswers).toBe(3);
  });

  it('gives a null top band when nobody chose a band, and [] priorities when none chosen', () => {
    const res = toPublicResult(aggregateFeedback(many(MIN_RESPONSES, { priceSkipped: true })).get(CONCEPT)!);
    expect(res.topPriceBandId).toBeNull();
    expect(res.topPriorities).toEqual([]);
    expect(res.leadingColour).toBeNull();
  });

  it('breaks band ties by configured order, and colour ties by palette order', () => {
    const rows = [
      ...many(5, { priceBandId: BANDS[3] as string, colour: 'meadow' }),
      ...many(5, { priceBandId: BANDS[1] as string, colour: 'clay' }),
      ...many(10),
    ];
    const agg = aggregateFeedback(rows).get(CONCEPT)!;
    expect(toPublicResult(agg, BANDS).topPriceBandId).toBe(BANDS[1]);
    expect(toPublicResult(agg).topPriceBandId).toBe(BANDS[1]);
    expect(toPublicResult(agg, [...BANDS].reverse()).topPriceBandId).toBe(BANDS[3]);
    expect(toPublicResult(agg).leadingColour).toBe('clay');
  });

  it('exposes no anonymous ids or free text', () => {
    const rows = many(MIN_RESPONSES, { otherText: 'secret-free-text' });
    const json = JSON.stringify(toPublicResult(aggregateFeedback(rows).get(CONCEPT)!));
    expect(json).not.toContain('secret-free-text');
    expect(json).not.toContain('anon-');
  });
});
