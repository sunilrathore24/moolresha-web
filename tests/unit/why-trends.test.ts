import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TREND_CARDS, TREND_CARD_MAX, TREND_CARD_MIN, WHY_ITEMS, factIdsOf } from '../../src/lib/why-trends';

const factFile = (id: string) => join(process.cwd(), 'src/content/facts', `${id}.yaml`);

describe('why and trends content', () => {
  it('has between three and five trend cards (Requirement 11.2)', () => {
    expect(TREND_CARDS.length).toBeGreaterThanOrEqual(TREND_CARD_MIN);
    expect(TREND_CARDS.length).toBeLessThanOrEqual(TREND_CARD_MAX);
  });

  it('uses one distinct fact per card', () => {
    const ids = factIdsOf(TREND_CARDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only seeded why-* and trend-* facts that exist in the registry', () => {
    for (const w of WHY_ITEMS) {
      expect(w.factId.startsWith('why-')).toBe(true);
      expect(existsSync(factFile(w.factId))).toBe(true);
    }
    for (const t of TREND_CARDS) {
      expect(t.factId.startsWith('trend-')).toBe(true);
      expect(existsSync(factFile(t.factId))).toBe(true);
    }
  });

  it('covers softness, easy care and durability (Requirement 11.1)', () => {
    const ids = factIdsOf(WHY_ITEMS);
    expect(ids).toContain('why-softness-easy-care');
    expect(ids).toContain('why-durability');
  });

  it('keeps headings free of digits, exclamation marks and money symbols', () => {
    for (const c of [...WHY_ITEMS, ...TREND_CARDS]) {
      expect(c.heading).not.toMatch(/[\d!₹%]/);
    }
  });
});
