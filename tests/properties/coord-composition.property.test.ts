// Property test for the co-ord composition rule (task 2.6).
import { describe, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import { isValidCoordComposition } from '../../src/lib/coord-composition';
import { composition, isCoordComposition } from '../generators/compositions';

describe('co-ord composition', () => {
  // Feature: launch-feedback-website, Property 21: Co-ord composition rule
  // **Validates: Requirements 8.5**
  test.prop([composition()], { numRuns: 500 })(
    'accepts exactly 100% cotton, or cotton plus 10 to 20% linen summing to 100',
    (parts) => {
      expect(isValidCoordComposition(parts)).toBe(isCoordComposition(parts));
    },
  );
});
