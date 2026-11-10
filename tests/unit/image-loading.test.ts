import { describe, expect, it } from 'vitest';
import { loadingFor } from '../../src/lib/image-loading';
import { VIEW_BASES } from '../../src/lib/concept-views';

describe('loadingFor', () => {
  it('is eager only for the first card front view in the stage above the fold', () => {
    expect(
      loadingFor({ conceptIndex: 0, view: '01-front', slot: 'stage', firstCardAboveFold: true }),
    ).toBe('eager');
  });

  it('is lazy when the first card is below the fold (v1 homepage)', () => {
    expect(
      loadingFor({ conceptIndex: 0, view: '01-front', slot: 'stage', firstCardAboveFold: false }),
    ).toBe('lazy');
  });

  it('is lazy for grid images and for other Concepts', () => {
    expect(
      loadingFor({ conceptIndex: 0, view: '01-front', slot: 'grid', firstCardAboveFold: true }),
    ).toBe('lazy');
    expect(
      loadingFor({ conceptIndex: 1, view: '01-front', slot: 'stage', firstCardAboveFold: true }),
    ).toBe('lazy');
  });

  it('is lazy for views 02 to 08 in every slot', () => {
    for (const view of VIEW_BASES.slice(1)) {
      for (const slot of ['stage', 'grid'] as const) {
        expect(loadingFor({ conceptIndex: 0, view, slot, firstCardAboveFold: true })).toBe('lazy');
      }
    }
  });

  it('is eager for exactly one combination across the whole input space', () => {
    let eager = 0;
    for (let conceptIndex = 0; conceptIndex < 5; conceptIndex++) {
      for (const view of VIEW_BASES) {
        for (const slot of ['stage', 'grid'] as const) {
          for (const firstCardAboveFold of [true, false]) {
            if (loadingFor({ conceptIndex, view, slot, firstCardAboveFold }) === 'eager') eager++;
          }
        }
      }
    }
    expect(eager).toBe(1);
  });
});
