// Sanity check for the shared generators in tests/generators (not a design property).
import { describe, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import { CHANGE_CHIPS, CONCEPT_IDS, VERDICTS } from '../../src/content/config/allow-lists';
import { chipSubset, conceptId, nastyString, verdict } from '../generators';

describe('shared generators', () => {
  test.prop([conceptId()], { numRuns: 100 })('conceptId() only yields values in CONCEPT_IDS', (id) => {
    expect(CONCEPT_IDS).toContain(id);
  });

  test.prop([verdict()], { numRuns: 100 })('verdict() only yields values in VERDICTS', (v) => {
    expect(VERDICTS).toContain(v);
  });

  test.prop([chipSubset(CHANGE_CHIPS)], { numRuns: 100 })(
    'chipSubset() only yields unique values from the given list',
    (chips) => {
      for (const chip of chips) expect(CHANGE_CHIPS).toContain(chip);
      expect(new Set(chips).size).toBe(chips.length);
    },
  );

  test.prop([nastyString()], { numRuns: 100 })('nastyString() yields strings', (s) => {
    expect(typeof s).toBe('string');
  });
});
