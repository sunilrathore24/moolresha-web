/**
 * Aggregation properties: 35 (chip sets), 2 (verdict percentages), 3 (public results gate),
 * 4 (aggregation consistency across four paths).
 *
 * Properties 3 and 4 use the configured band ids from `allow-lists.generated.ts`.
 * Property 4 is database-backed: one in-memory SQLite database is created once and emptied
 * between runs, so it stays fast (150 runs) and uses the production migrations.
 */
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  CHANGE_CHIPS,
  CONCEPT_IDS,
  PALETTE,
  PRIORITY_CHIPS,
  VERDICTS,
  type ConceptId,
} from '../../src/content/config/allow-lists';
import { PRICE_BAND_IDS } from '../../src/content/config/allow-lists.generated';
import {
  MIN_RESPONSES,
  aggregateFeedback,
  decodeChipSet,
  encodeChipSet,
  largestRemainderPercent,
  sumChipCounts,
  toPublicResult,
  topChips,
  type ConceptAggregate,
  type FeedbackRow,
} from '../../src/lib/aggregate';
import { denormalise, parseCsv } from '../../src/lib/csv';
import { buildAggregateCsv } from '../../functions/api/admin/export/aggregate.csv';
import { buildFeedbackCsv, exportFeedbackRowsPaged } from '../../functions/api/admin/export/feedback.csv';
import { queryAggregates, upsertFeedback } from '../../functions/_shared/db';
import { feedbackRow } from '../generators/feedback-rows';
import { isWellFormed } from '../generators';
import { clearAllTables, createTestD1, type SqliteD1 } from '../support/d1-sqlite';
import { counted, runSummary } from '../support/run-counter';

const configuredBands = (id: ConceptId): readonly string[] => PRICE_BAND_IDS[id];
const codePointOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

afterAll(() => {
  console.log(runSummary('aggregation.property.test.ts'));
});

// ---------------------------------------------------------------------------
// Property 35
// ---------------------------------------------------------------------------

const chipLists = [PRIORITY_CHIPS, CHANGE_CHIPS] as readonly (readonly string[])[];

const chipListAndChips = fc.constantFrom(0, 1).chain((i) =>
  fc
    .array(fc.constantFrom(...(chipLists[i] as readonly string[])), { maxLength: 14 })
    .map((xs) => ({ allow: chipLists[i] as readonly string[], xs })),
);

describe('Property 35: chip sets encode canonically and round-trip', () => {
  // Feature: launch-feedback-website, Property 35: Chip sets encode canonically and round-trip
  test.prop([chipListAndChips], { numRuns: 300 })(
    'decode(encode(xs)) is the distinct chips of xs sorted by code point',
    counted('Property 35', ({ allow, xs }) => {
      const expected = [...new Set(xs)].sort(codePointOrder);
      expect(decodeChipSet(encodeChipSet(xs), allow)).toEqual(expected);
    }),
  );

  // Feature: launch-feedback-website, Property 35: Chip sets encode canonically and round-trip
  test.prop(
    [
      chipListAndChips.chain(({ allow, xs }) =>
        fc
          .tuple(
            fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length }),
            fc.shuffledSubarray(xs, { minLength: 0, maxLength: xs.length }),
          )
          .map(([permuted, extra]) => ({ allow, xs, permuted, repeated: [...xs, ...extra] })),
      ),
    ],
    { numRuns: 300 },
  )(
    'encoding ignores order and repeats',
    counted('Property 35', ({ xs, permuted, repeated }) => {
      const canonical = encodeChipSet(xs);
      expect(encodeChipSet(permuted)).toBe(canonical);
      expect(encodeChipSet(repeated)).toBe(canonical);
    }),
  );

  // Feature: launch-feedback-website, Property 35: Chip sets encode canonically and round-trip
  test.prop([fc.constantFrom(0, 1)], { numRuns: 100 })(
    'the empty list encodes to the empty string and back',
    counted('Property 35', (i) => {
      const allow = chipLists[i] as readonly string[];
      expect(encodeChipSet([])).toBe('');
      expect(decodeChipSet('', allow)).toEqual([]);
    }),
  );

  // Feature: launch-feedback-website, Property 35: Chip sets encode canonically and round-trip
  test.prop(
    [
      fc.constantFrom(0, 1).chain((i) => {
        const allow = chipLists[i] as readonly string[];
        const unknown = fc
          .constantFrom('luxury', 'Softness', 'softness ', ' softness', 'SOFTNESS', 'x', 'fit_', 'a b', '|', '')
          .filter((t) => !allow.includes(t));
        return fc
          .tuple(
            fc.shuffledSubarray([...allow], { minLength: 0, maxLength: allow.length }),
            unknown,
            fc.nat(),
          )
          .map(([parts, token, at]) => {
            const arr = [...parts];
            arr.splice(at % (arr.length + 1), 0, token);
            // A lone empty part would be the empty string, which is a valid empty set.
            if (arr.length === 1 && arr[0] === '') arr.push('');
            return { allow, text: arr.join('|'), token };
          });
      }),
    ],
    { numRuns: 300 },
  )(
    'decode throws for a part outside the allow-list or an empty part',
    counted('Property 35', ({ allow, text }) => {
      expect(() => decodeChipSet(text, allow)).toThrow();
    }),
  );
});

// ---------------------------------------------------------------------------
// Property 2
// ---------------------------------------------------------------------------

describe('Property 2: verdict percentages sum to 100', () => {
  // Feature: launch-feedback-website, Property 2: Verdict percentages sum to 100
  test.prop(
    [
      fc
        .array(
          fc.oneof(fc.nat({ max: 5 }), fc.nat({ max: 1000 }), fc.integer({ min: 0, max: 1_000_000 })),
          { minLength: 1, maxLength: 12 },
        )
        .filter((counts) => counts.some((c) => c > 0)),
    ],
    { numRuns: 500 },
  )(
    'sums to exactly 100, stays within 1 of the exact share, and keeps zeros at 0',
    counted('Property 2', (counts) => {
      const total = counts.reduce((a, b) => a + b, 0);
      const percents = largestRemainderPercent(counts);

      expect(percents).toHaveLength(counts.length);
      expect(percents.every(Number.isInteger)).toBe(true);
      expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
      counts.forEach((c, i) => {
        const p = percents[i] as number;
        // |p - c*100/total| < 1  <=>  |p*total - c*100| < total, in exact integer arithmetic.
        expect(Math.abs(p * total - c * 100)).toBeLessThan(total);
        if (c === 0) expect(p).toBe(0);
      });
    }),
  );
});

// ---------------------------------------------------------------------------
// Property 3
// ---------------------------------------------------------------------------

const POOL: readonly ConceptId[] = ['mens-cotton-shirt', 'mens-relaxed-pant'];

/** Rows over two Concepts with counts on both sides of the 20-response gate, plus the 19/20/21 boundary. */
const gateRows = fc
  .oneof(
    fc.array(feedbackRow({ conceptIds: POOL, bandIds: configuredBands }), { maxLength: 70 }),
    fc
      .constantFrom(19, 20, 21)
      .chain((n) =>
        fc.array(feedbackRow({ conceptIds: ['womens-coord-set'], bandIds: configuredBands }), { minLength: n, maxLength: n }),
      ),
    fc.array(feedbackRow({ conceptIds: ['mens-linen-shirt'], bandIds: configuredBands }), { minLength: 20, maxLength: 45 }),
  )
  .map((rows) =>
    // Unique markers for free text and UTM so "no free text in the output" is a real check.
    rows.map(
      (r, i): FeedbackRow => ({
        ...r,
        otherText: i % 2 === 0 ? `free-text-marker-${i}-zq` : r.otherText,
        utm: { source: `utm-src-${i}-zq`, medium: `utm-med-${i}-zq`, campaign: `utm-cmp-${i}-zq` },
      }),
    ),
  );

const PUBLIC_ONLY_WHEN_ENOUGH = ['verdicts', 'leadingColour', 'topPriceBandId', 'priceAnswers', 'priceSkips', 'topPriorities'];

describe('Property 3: public results respect the minimum-response gate and expose only aggregates', () => {
  // Feature: launch-feedback-website, Property 3: Public results respect the minimum-response gate and expose only aggregates
  test.prop([gateRows], { numRuns: 300 })(
    'gate, price counts, top band, top priorities and no leaked identifiers',
    counted('Property 3', (rows) => {
      const agg = aggregateFeedback(rows);
      for (const id of CONCEPT_IDS) {
        const mine = rows.filter((r) => r.conceptId === id);
        const result = toPublicResult(agg.get(id) as ConceptAggregate, configuredBands(id));
        const serialised = JSON.stringify(result);

        // Gate. Skipped and unanswered rows still count as responses.
        expect(result.responses).toBe(mine.length);
        expect(result.enough).toBe(mine.length >= MIN_RESPONSES);

        // Never any identifier or free text.
        for (const r of rows) {
          expect(serialised).not.toContain(r.anonId);
          if (r.otherText !== null && r.otherText.startsWith('free-text-marker')) {
            expect(serialised).not.toContain(r.otherText);
          }
          expect(serialised).not.toContain(r.utm.source);
        }

        if (!result.enough) {
          for (const key of PUBLIC_ONLY_WHEN_ENOUGH) expect(result).not.toHaveProperty(key);
          expect(Object.keys(result).sort()).toEqual(['conceptId', 'enough', 'responses']);
          continue;
        }

        // Price counts.
        const withBand = mine.filter((r) => r.priceBandId !== null && !r.priceSkipped);
        const withSkip = mine.filter((r) => r.priceSkipped);
        expect(result.priceAnswers).toBe(withBand.length);
        expect(result.priceSkips).toBe(withSkip.length);
        expect((result.priceAnswers as number) + (result.priceSkips as number)).toBeLessThanOrEqual(result.responses);

        // Top band: configured id or null, never a skip value, null exactly when no row has a band.
        const configured = configuredBands(id);
        if (withBand.length === 0) {
          expect(result.topPriceBandId).toBeNull();
        } else {
          expect(configured).toContain(result.topPriceBandId);
          const counts = new Map<string, number>();
          for (const r of withBand) counts.set(r.priceBandId as string, (counts.get(r.priceBandId as string) ?? 0) + 1);
          const max = Math.max(...counts.values());
          const expectedTop = configured.find((b) => counts.get(b) === max);
          expect(result.topPriceBandId).toBe(expectedTop);
        }
        expect(result.topPriceBandId).not.toBe('skipped');

        // Verdict percentages add up and leading colour is the first colour at the maximum.
        const sum = VERDICTS.reduce((s, v) => s + (result.verdicts?.[v] ?? 0), 0);
        expect(sum).toBe(100);
        const colourCounts = PALETTE.map((c) => mine.filter((r) => r.colour === c).length);
        const maxColour = Math.max(...colourCounts);
        expect(result.leadingColour).toBe(maxColour === 0 ? null : PALETTE[colourCounts.indexOf(maxColour)]);

        // Top priorities: every chip at the maximum, in allow-list order, [] when nobody chose any.
        const priorityCounts = PRIORITY_CHIPS.map((c) => mine.filter((r) => r.priorities.includes(c)).length);
        const maxPriority = Math.max(...priorityCounts);
        const expectedPriorities = maxPriority === 0 ? [] : PRIORITY_CHIPS.filter((_, i) => priorityCounts[i] === maxPriority);
        expect(result.topPriorities).toEqual(expectedPriorities);
        expect(mine.every((r) => r.priorities.length === 0)).toBe(expectedPriorities.length === 0);
      }
    }),
  );
});

// ---------------------------------------------------------------------------
// Property 4
// ---------------------------------------------------------------------------

/** Rows over all Concepts, with unique (Anonymous_ID, Concept) keys and text that survives SQLite unchanged. */
const consistencyRows = fc.array(feedbackRow({ bandIds: configuredBands }), { maxLength: 60 }).map((rows) => {
  const seen = new Set<string>();
  const out: FeedbackRow[] = [];
  for (const r of rows) {
    const key = `${r.anonId}|${r.conceptId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, otherText: r.otherText !== null && isWellFormed(r.otherText) ? r.otherText : null });
  }
  return out;
});

const plain = (m: Map<ConceptId, ConceptAggregate>): Record<string, ConceptAggregate> => Object.fromEntries(m);

/** Reads an aggregate CSV into `concept|question|answer -> count`. */
function aggregateCsvCounts(csv: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [concept, question, answer, count] of parseCsv(csv).slice(1)) {
    out.set(`${concept}|${question}|${answer}`, Number(count));
  }
  return out;
}

/** Turns feedback CSV text back into rows, the way an analyst's script would. */
function rowsFromFeedbackCsv(csv: string): FeedbackRow[] {
  // Named by the real column order (see the identical fix + explanation in
  // tests/unit/api-admin.test.ts's own toFeedbackRowsFromCsv): a positional destructure with
  // fewer names than columns silently shifts everything after the missing name.
  return parseCsv(csv)
    .slice(1)
    .map((c): FeedbackRow => {
      const [anon, concept, verdict, changes, colour, weave, priorities, band, skipped, other, comment, us, um, uc, updated] = c;
      return {
        anonId: anon as string,
        conceptId: concept as ConceptId,
        verdict: verdict as FeedbackRow['verdict'],
        changes: decodeChipSet(changes as string, CHANGE_CHIPS),
        colour: colour ? (colour as FeedbackRow['colour']) : null,
        weave: weave ? weave : null,
        priorities: decodeChipSet(priorities as string, PRIORITY_CHIPS),
        priceBandId: band ? band : null,
        priceSkipped: skipped === '1',
        otherText: other ? denormalise(other) : null,
        comment: comment ? denormalise(comment) : null,
        utm: { source: us as string, medium: um as string, campaign: uc as string },
        updatedAt: updated as string,
      };
    });
}

async function storeRows(db: SqliteD1, rows: readonly FeedbackRow[]): Promise<void> {
  for (const r of rows) {
    await upsertFeedback(db, {
      anonId: r.anonId,
      conceptId: r.conceptId,
      verdict: r.verdict,
      changes: r.changes,
      otherText: r.otherText,
      colour: r.colour,
      priorities: r.priorities,
      priceBandId: r.priceBandId,
      priceSkipped: r.priceSkipped,
      utm: r.utm,
      now: r.updatedAt,
    });
  }
}

describe('Property 4: aggregation consistency across paths', () => {
  let db: SqliteD1;
  beforeAll(() => {
    db = createTestD1();
  });
  afterAll(() => db.close());

  // Feature: launch-feedback-website, Property 4: Aggregation consistency across paths
  test.prop([consistencyRows], { numRuns: 150 })(
    'SQL GROUP BY, in-memory, parsed feedback CSV and parsed aggregate CSV agree',
    counted('Property 4', async (rows) => {
      clearAllTables(db);
      await storeRows(db, rows);

      const inMemory = aggregateFeedback(rows);
      const viaSql = await queryAggregates(db);

      const exported = await exportFeedbackRowsPaged(db, 7);
      const viaFeedbackCsv = aggregateFeedback(rowsFromFeedbackCsv(buildFeedbackCsv(exported)));

      // Paths 1 to 3 give identical aggregates.
      expect(plain(viaSql)).toEqual(plain(inMemory));
      expect(plain(viaFeedbackCsv)).toEqual(plain(inMemory));

      // Path 4: the aggregate CSV carries the same counts.
      const csv = aggregateCsvCounts(buildAggregateCsv(rows));
      for (const id of CONCEPT_IDS) {
        const a = inMemory.get(id) as ConceptAggregate;
        for (const v of VERDICTS) expect(csv.get(`${id}|verdict|${v}`)).toBe(a.verdictCounts[v]);
        for (const c of CHANGE_CHIPS) expect(csv.get(`${id}|change|${c}`)).toBe(a.changeCounts[c]);
        for (const c of PALETTE) expect(csv.get(`${id}|colour|${c}`)).toBe(a.colourCounts[c]);
        // One priority row per chip, zeros included.
        for (const c of PRIORITY_CHIPS) expect(csv.get(`${id}|priority|${c}`)).toBe(a.priorityCounts[c]);
        // Bands appear only where counted. Skips appear only as price_skip / skipped.
        const bandKeys = [...csv.keys()].filter((k) => k.startsWith(`${id}|price_band|`));
        expect(bandKeys.sort()).toEqual(Object.keys(a.priceBandCounts).map((b) => `${id}|price_band|${b}`).sort());
        for (const [band, n] of Object.entries(a.priceBandCounts)) expect(csv.get(`${id}|price_band|${band}`)).toBe(n);
        expect(csv.get(`${id}|price_skip|skipped`)).toBe(a.priceSkipCount);
        expect(bandKeys.some((k) => k.endsWith('|skipped') || k.endsWith('|price_skip'))).toBe(false);

        // Priority counts also equal sumChipCounts over the GROUP BY result and row-level truth.
        const mine = rows.filter((r) => r.conceptId === id);
        for (const c of PRIORITY_CHIPS) {
          expect(a.priorityCounts[c]).toBe(mine.filter((r) => r.priorities.includes(c)).length);
        }
        const grouped = new Map<string, number>();
        for (const r of mine) {
          const k = encodeChipSet(r.priorities);
          grouped.set(k, (grouped.get(k) ?? 0) + 1);
        }
        const summed = sumChipCounts([...grouped].filter(([k]) => k !== '').map(([set, n]) => ({ set, n })), PRIORITY_CHIPS);
        expect(summed).toEqual(a.priorityCounts);

        // Skips are only priceSkipCount. Band counts never include them.
        expect(a.priceSkipCount).toBe(mine.filter((r) => r.priceSkipped).length);
        const bandTotal = Object.values(a.priceBandCounts).reduce((s, n) => s + n, 0);
        expect(bandTotal).toBe(mine.filter((r) => r.priceBandId !== null && !r.priceSkipped).length);

        // Top chips: every chip at the maximum, in allow-list order; [] when the maximum is 0.
        const maxP = Math.max(...PRIORITY_CHIPS.map((c) => a.priorityCounts[c]));
        expect(topChips(a.priorityCounts, PRIORITY_CHIPS)).toEqual(
          maxP === 0 ? [] : PRIORITY_CHIPS.filter((c) => a.priorityCounts[c] === maxP),
        );
      }
    }),
  );

  // Feature: launch-feedback-website, Property 4: Aggregation consistency across paths
  test.prop(
    [
      fc.array(feedbackRow({ conceptIds: ['mens-cotton-shirt'], bandIds: configuredBands }), { minLength: 20, maxLength: 40 }),
      fc.integer({ min: 0, max: 15 }),
      fc.integer({ min: 0, max: 15 }),
    ],
    { numRuns: 150 },
  )(
    'extra skip rows and extra empty-priority rows leave band counts, top band and priority counts unchanged',
    counted('Property 4', (rows, skipCount, emptyCount) => {
      const id: ConceptId = 'mens-cotton-shirt';
      const template = rows[0] as FeedbackRow;
      const skips: FeedbackRow[] = Array.from({ length: skipCount }, (_, i) => ({
        ...template,
        anonId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        priceBandId: null,
        priceSkipped: true,
        priorities: [],
      }));
      const empties: FeedbackRow[] = Array.from({ length: emptyCount }, (_, i) => ({
        ...template,
        anonId: `11111111-0000-4000-8000-${String(i).padStart(12, '0')}`,
        priorities: [],
      }));

      const before = aggregateFeedback(rows).get(id) as ConceptAggregate;
      const after = aggregateFeedback([...rows, ...skips, ...empties]).get(id) as ConceptAggregate;

      // Band counts: skip rows add nothing, and empty-priority rows keep whatever band they copied.
      const bandOfTemplate = template.priceBandId !== null && !template.priceSkipped ? template.priceBandId : null;
      const expectedBands = { ...before.priceBandCounts };
      if (bandOfTemplate !== null && emptyCount > 0) {
        expectedBands[bandOfTemplate] = (expectedBands[bandOfTemplate] ?? 0) + emptyCount;
      }
      expect(after.priceBandCounts).toEqual(expectedBands);
      expect(after.priceSkipCount).toBe(before.priceSkipCount + skipCount + (template.priceSkipped ? emptyCount : 0));
      expect(after.priorityCounts).toEqual(before.priorityCounts);
      expect(topChips(after.priorityCounts, PRIORITY_CHIPS)).toEqual(topChips(before.priorityCounts, PRIORITY_CHIPS));

      // Skip rows alone never move the top band.
      const onlySkips = aggregateFeedback([...rows, ...skips]).get(id) as ConceptAggregate;
      expect(onlySkips.priceBandCounts).toEqual(before.priceBandCounts);
      const topBefore = toPublicResult(before, configuredBands(id)).topPriceBandId;
      const topWithSkips = toPublicResult(onlySkips, configuredBands(id)).topPriceBandId;
      expect(topWithSkips).toBe(topBefore);
    }),
  );
});
