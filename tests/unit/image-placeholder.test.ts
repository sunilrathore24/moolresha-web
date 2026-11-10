import { describe, expect, it } from 'vitest';
import { VIEW_BASES } from '../../src/lib/concept-views';
import {
  DEFAULT_FRAME_RATIO,
  frameAspectRatio,
  placeholderLabel,
} from '../../src/lib/image-placeholder';

describe('placeholderLabel', () => {
  it('names the Concept: no design exists yet, so there is no view to point to', () => {
    expect(placeholderLabel("Men's 100% cotton shirt", '03-side')).toBe(
      "Design coming soon: Men's 100% cotton shirt",
    );
    expect(placeholderLabel('Pant', '07-fabric-closeup')).toBe('Design coming soon: Pant');
  });

  it('gives the same message regardless of which view is asked for', () => {
    for (const v of VIEW_BASES) {
      expect(placeholderLabel('X', v)).toBe('Design coming soon: X');
    }
  });
});

describe('frameAspectRatio', () => {
  it('falls back to 4 / 5 with no present view', () => {
    expect(frameAspectRatio(undefined)).toBe(DEFAULT_FRAME_RATIO);
    expect(frameAspectRatio({ width: 0, height: 0 })).toBe('4 / 5');
  });

  it('uses the first present view size', () => {
    expect(frameAspectRatio({ width: 1600, height: 2000 })).toBe('1600 / 2000');
  });
});
