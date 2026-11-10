import { describe, expect, it } from 'vitest';
import { latestChecked } from '../../src/lib/last-updated';

describe('latestChecked', () => {
  it('returns the latest ISO date regardless of order', () => {
    expect(latestChecked(['2026-03-01', '2026-11-07', '2025-12-31'])).toBe('2026-11-07');
  });

  it('returns the only date for a single entry', () => {
    expect(latestChecked(['2026-01-02'])).toBe('2026-01-02');
  });

  it('returns undefined for an empty list', () => {
    expect(latestChecked([])).toBeUndefined();
  });
});
