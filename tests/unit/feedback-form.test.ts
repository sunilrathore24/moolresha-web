import { describe, expect, it } from 'vitest';
import {
  CHANGE_CHIPS,
  PALETTE,
  PRIORITY_CHIPS,
  VERDICTS,
} from '../../src/content/config/allow-lists';
import {
  CHANGE_CHIP_LABELS,
  FIELD_NAMES,
  NOSCRIPT_NOTE,
  OTHER_TEXT_MAX_LENGTH,
  PALETTE_LABELS,
  PRICE_QUESTION,
  PRICE_SKIP_LABEL,
  VERDICT_LABELS,
  feedbackFormModel,
  fieldId,
} from '../../src/lib/feedback-form';
import { bandLabel, type PriceBand } from '../../src/lib/price-bands';

const bands: PriceBand[] = [
  { kind: 'under', id: 'mcs-under-1000', upper: 1000 },
  { kind: 'range', id: 'mcs-1000-1499', lower: 1000, upper: 1499 },
  { kind: 'over', id: 'mcs-1500-plus', lower: 1500 },
];

describe('feedbackFormModel', () => {
  const model = feedbackFormModel(bands);

  it('offers the three verdicts in the required wording and order', () => {
    expect(model.verdicts.map((o) => o.value)).toEqual([...VERDICTS]);
    expect(model.verdicts.map((o) => o.label)).toEqual(['Would wear', 'Maybe', 'Not for me']);
    expect(VERDICT_LABELS.not_for_me).toBe('Not for me');
  });

  it('labels every Change_Chip, Palette_Colour and Priority_Chip', () => {
    expect(model.changes.map((o) => o.value)).toEqual([...CHANGE_CHIPS]);
    expect(model.colours.map((o) => o.value)).toEqual([...PALETTE]);
    expect(model.colours.map((o) => o.label)).toEqual([
      'Flax',
      'Clay',
      'Meadow',
      'Indigo Dusk',
      'Chalk White',
      'Light Graphite',
    ]);
    expect(model.priorities.map((o) => o.value)).toEqual([...PRIORITY_CHIPS]);
    expect(model.priorities).toHaveLength(6);
    expect(model.priorities.map((o) => o.label)).toContain('Colour that lasts');
    for (const o of [...model.changes, ...model.colours, ...model.priorities]) {
      expect(o.label.trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(CHANGE_CHIP_LABELS)).toHaveLength(CHANGE_CHIPS.length);
    expect(Object.keys(PALETTE_LABELS)).toHaveLength(PALETTE.length);
  });

  it('builds price options from the band ids and bandLabel only', () => {
    expect(model.prices.map((o) => o.value)).toEqual(bands.map((b) => b.id));
    expect(model.prices.map((o) => o.label)).toEqual(bands.map(bandLabel));
    expect(model.prices[0]?.label).toBe('Under ₹1,000');
  });

  it('uses the exact price question and skip wording', () => {
    expect(PRICE_QUESTION).toBe(
      'If you knew exactly what went into it (fibre, yarn, fabric, stitching), what would you pay?',
    );
    expect(PRICE_SKIP_LABEL).toBe('Skip this question');
  });

  it('keeps form copy free of exclamation marks, commerce and health words', () => {
    const copy = [
      ...Object.values(VERDICT_LABELS),
      ...Object.values(CHANGE_CHIP_LABELS),
      ...Object.values(PALETTE_LABELS),
      ...model.priorities.map((o) => o.label),
      PRICE_QUESTION,
      PRICE_SKIP_LABEL,
      NOSCRIPT_NOTE,
    ].join(' ');
    expect(copy).not.toMatch(/!/);
    expect(copy).not.toMatch(/\b(buy|add to cart|pre-order|launch price|offer|discount)\b/i);
    expect(copy).not.toMatch(/skin-friendly|hypoallergenic|anti-allergy|chemical-free|non-toxic/i);
    expect(copy).not.toMatch(/\b(best|premium|luxury|amazing)\b/i);
  });

  it('exposes the field names the island reads', () => {
    expect(Object.values(FIELD_NAMES).sort()).toEqual(
      ['changes', 'colour', 'otherText', 'priceBandId', 'priorities', 'verdict'].sort(),
    );
    expect(OTHER_TEXT_MAX_LENGTH).toBe(200);
  });
});

describe('fieldId', () => {
  it('is unique per control and per Concept', () => {
    const ids = new Set<string>();
    for (const c of ['mens-cotton-shirt', 'mens-relaxed-pant']) {
      for (const v of VERDICTS) ids.add(fieldId(c, 'verdict', v));
      for (const v of CHANGE_CHIPS) ids.add(fieldId(c, 'changes', v));
      ids.add(fieldId(c, 'otherText'));
    }
    expect(ids.size).toBe(2 * (VERDICTS.length + CHANGE_CHIPS.length + 1));
  });
});
