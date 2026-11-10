// Property tests for Quality_Card checks (tasks 3.3 and 3.4).
import { describe, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import { checkQualityCard, findSpecValues } from '../../src/lib/quality-card';
import { qualityRows, qualityRowsWithSpec, validQualityRows } from '../generators/quality-rows';

describe('quality card checks', () => {
  // Feature: launch-feedback-website, Property 44: Quality_Card checks accept exactly the valid cards and name the row
  // **Validates: Requirements 8C.1, 8C.2, 8C.3, 8C.5, 8C.8**
  test.prop([qualityRows()], { numRuns: 400 })(
    'no issues for an unmutated card; the matching issue naming the row for each mutation',
    ({ rows, facts, mutation }) => {
      const issues = checkQualityCard(rows, facts);
      if (!mutation) {
        expect(issues).toEqual([]);
        return;
      }
      const matching = issues.filter((i) => i.kind === mutation.expected);
      expect(matching.length, `${mutation.tag}: ${JSON.stringify(issues)}`).toBeGreaterThan(0);
      expect(
        matching.some((i) => 'row' in i && i.row !== undefined && mutation.rows.includes(i.row)),
        `${mutation.tag} must name one of ${mutation.rows.join(', ')}; got ${JSON.stringify(matching)}`,
      ).toBe(true);
    },
  );

  // Feature: launch-feedback-website, Property 45: Exact yarn counts and GSM need a FACT; ranges need a Target
  // **Validates: Requirements 8C.6, 8C.7**
  test.prop([qualityRowsWithSpec()], { numRuns: 400 })(
    'finds the inserted value with the right kind and range flag, and applies the label rules',
    ({ rows, facts, row, label, spec, backed }) => {
      const found = findSpecValues(spec.text);
      expect(found, spec.text).toHaveLength(1);
      expect(found[0]).toEqual({ value: spec.value, kind: spec.kind, isRange: spec.isRange });

      const issues = checkQualityCard(rows, facts);
      const exact = issues.filter((i) => i.kind === 'exact_spec_without_fact');
      const range = issues.filter((i) => i.kind === 'range_not_target');

      // Only the row that carries the value can raise either issue.
      for (const i of [...exact, ...range]) expect('row' in i && i.row).toBe(row);

      const expectExact = !spec.isRange && !backed;
      const expectRange = spec.isRange && label !== 'Target' && label !== 'FACT';
      expect(exact.length > 0, `${label} ${spec.value} exact`).toBe(expectExact);
      expect(range.length > 0, `${label} ${spec.value} range`).toBe(expectRange);
    },
  );

  // Feature: launch-feedback-website, Property 45: Exact yarn counts and GSM need a FACT; ranges need a Target
  // **Validates: Requirements 8C.6, 8C.7**
  test.prop([validQualityRows()], { numRuns: 100 })(
    'text with no spec value produces neither issue',
    ({ rows, facts }) => {
      for (const r of rows as { text?: string }[]) expect(findSpecValues(r.text ?? '')).toEqual([]);
      const kinds = checkQualityCard(rows, facts).map((i) => i.kind);
      expect(kinds).not.toContain('exact_spec_without_fact');
      expect(kinds).not.toContain('range_not_target');
    },
  );
});
