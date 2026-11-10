// Property 40: only a first card's front view above the fold loads eagerly (task 5.6).
import { describe, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { VIEW_BASES } from '../../src/lib/concept-views';
import { loadingFor } from '../../src/lib/image-loading';

describe('Property 40: eager loading is limited to one image', () => {
  // Feature: launch-feedback-website, Property 40: Only a first card's front view above the fold loads eagerly
  test.prop(
    [
      fc.integer({ min: 0, max: 4 }),
      fc.constantFrom(...VIEW_BASES),
      fc.constantFrom('stage', 'grid' as const),
      fc.boolean(),
    ],
    { numRuns: 100 },
  )('eager if and only if stage, 01-front, first Concept and above the fold', (conceptIndex, view, slot, firstCardAboveFold) => {
    const result = loadingFor({ conceptIndex, view, slot: slot as 'stage' | 'grid', firstCardAboveFold });
    const expectedEager = slot === 'stage' && view === '01-front' && conceptIndex === 0 && firstCardAboveFold;
    expect(result).toBe(expectedEager ? 'eager' : 'lazy');
    if (view !== '01-front' || slot === 'grid') expect(result).toBe('lazy');
  });
});
