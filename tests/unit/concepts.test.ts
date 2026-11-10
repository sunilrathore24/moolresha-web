// Unit tests for the Concept schema, the seeded Concept YAML files and the co-ord
// composition rule (Requirements 8.1, 8.3, 8.4, 8.5, 8A.13, 8C.1-8C.6, 9.7).
// Property 21 (task 2.6) and the seeded-content tests of task 2.7 are written separately.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  Concept,
  QUALITY_LABELS,
  QUALITY_LABEL_TEXT,
  QUALITY_ROWS,
  QUALITY_ROW_NAMES,
  QualityCard,
  QualityRow,
  type ConceptData,
} from '../../src/lib/concept-schema';
import { isValidCoordComposition } from '../../src/lib/coord-composition';
import { validatePriceBands, bandLabel, expectedBandId } from '../../src/lib/price-bands';
import { VIEW_BASES, VIEW_NAMES } from '../../src/lib/concept-views';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';

const DIR = join(process.cwd(), 'src/content/concepts');

function load(id: string): unknown {
  return parse(readFileSync(join(DIR, `${id}.yaml`), 'utf8'));
}

const loaded = CONCEPT_IDS.map((id) => ({ id, raw: load(id) }));

describe('seeded Concept files', () => {
  for (const { id, raw } of loaded) {
    describe(id, () => {
      const result = Concept.safeParse(raw);

      it('parses with the Concept schema', () => {
        expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
      });

      if (!result.success) return;
      const c: ConceptData = result.data;

      it('has an id equal to its file name', () => {
        expect(c.id).toBe(id);
      });

      it('has Price_Bands that pass validation and carry the expected ids', () => {
        expect(validatePriceBands(c.priceBands)).toEqual([]);
        for (const band of c.priceBands) expect(band.id).toBe(expectedBandId(c.id, band));
      });

      it('has eight alt texts naming the Concept and the view', () => {
        expect(Object.keys(c.views.alt).sort()).toEqual([...VIEW_BASES].sort());
        for (const view of VIEW_BASES) {
          const alt = c.views.alt[view].toLowerCase();
          expect(alt, `${id} ${view}`).toContain(c.name.toLowerCase());
          expect(alt, `${id} ${view}`).toContain(VIEW_NAMES[view].toLowerCase());
        }
      });

      it('has seven Quality_Rows in order, with no exact GSM or yarn count', () => {
        expect(c.quality.map((r) => r.row)).toEqual([...QUALITY_ROWS]);
        for (const row of c.quality) {
          expect(row.label).not.toBe('FACT'); // no Fact_Registry entry backs a Quality_Row yet
          if (row.row === 'yarn' || row.row === 'fabric') expect(row.range).toBeDefined();
        }
      });

      it('uses no yarn-quality terms and no health terms', () => {
        const text = JSON.stringify(raw).toLowerCase();
        expect(text).not.toMatch(/combed|long[- ]staple|skin[- ]friendly|hypo-?allergenic|chemical[- ]free|non[- ]toxic|anti[- ]allergy/);
        expect(c.fabricNotes.yarnQuality).toBeUndefined();
      });
    });
  }

  it('holds exactly five Concepts, cotton shirt first and featured, linen shirt a later product', () => {
    const parsed = loaded.map((l) => Concept.parse(l.raw));
    expect(parsed).toHaveLength(5);
    const ordered = [...parsed].sort((a, b) => a.order - b.order);
    expect(ordered.map((c) => c.id)).toEqual([...CONCEPT_IDS]);
    expect(ordered.filter((c) => c.featured).map((c) => c.id)).toEqual(['mens-cotton-shirt']);
    expect(parsed.filter((c) => c.laterProduct).map((c) => c.id)).toEqual(['mens-linen-shirt']);
  });

  it('matches the Requirement 9.7 Price_Band labels', () => {
    const labels = Object.fromEntries(
      loaded.map((l) => {
        const c = Concept.parse(l.raw);
        return [c.id, c.priceBands.map(bandLabel)];
      }),
    );
    expect(labels).toEqual({
      'mens-cotton-shirt': ['Under ₹1,000', '₹1,000–1,499', '₹1,500–1,999', '₹2,000–2,499', '₹2,500–2,999', '₹3,000+'],
      'mens-cotton-linen-shirt': ['Under ₹1,500', '₹1,500–1,999', '₹2,000–2,499', '₹2,500–2,999', '₹3,000–3,499', '₹3,500+'],
      'mens-linen-shirt': ['Under ₹2,000', '₹2,000–2,499', '₹2,500–2,999', '₹3,000–3,499', '₹3,500–3,999', '₹4,000+'],
      'mens-relaxed-pant': ['Under ₹1,000', '₹1,000–1,499', '₹1,500–1,999', '₹2,000–2,499', '₹2,500–2,999', '₹3,000+'],
      'womens-coord-set': ['Under ₹1,500', '₹1,500–1,999', '₹2,000–2,499', '₹2,500–2,999', '₹3,000–3,499', '₹3,500–3,999', '₹4,000+'],
    });
  });
});

describe('Quality constants', () => {
  it('names the seven rows in the Requirement 8C.1 wording', () => {
    expect(QUALITY_ROWS.map((r) => QUALITY_ROW_NAMES[r])).toEqual([
      'Fibre',
      'Yarn',
      'Fabric',
      'On your skin',
      'Shrinkage',
      'After a year of washing',
      'Care',
    ]);
  });

  it('has three labels with visible text', () => {
    expect([...QUALITY_LABELS]).toEqual(['FACT', 'Target', 'WeWillTest']);
    expect(QUALITY_LABEL_TEXT.WeWillTest).toBe("We'll test");
  });
});

describe('QualityRow rules', () => {
  const target = { row: 'care', label: 'Target', text: 'Machine wash cold' };
  const test = { what: 'colour after washes', publish: 'photos' };

  it('accepts valid Target, FACT and We\'ll test rows', () => {
    expect(QualityRow.safeParse(target).success).toBe(true);
    expect(QualityRow.safeParse({ row: 'fibre', label: 'FACT', text: '', factId: 'cotton-fibre-basics' }).success).toBe(true);
    expect(QualityRow.safeParse({ row: 'shrinkage', label: 'WeWillTest', text: 'Pre-washed', test }).success).toBe(true);
  });

  it.each([
    ['FACT without factId', { row: 'fibre', label: 'FACT', text: '' }],
    ['Target with factId', { ...target, factId: 'x' }],
    ['We\'ll test without test', { row: 'shrinkage', label: 'WeWillTest', text: 'Pre-washed' }],
    ['Target with test', { ...target, test }],
    ['range on a non-Target row', { row: 'fabric', label: 'WeWillTest', text: 't', test, range: { kind: 'gsm', min: 100, max: 120 } }],
    ['single-value range', { ...target, row: 'fabric', range: { kind: 'gsm', min: 120, max: 120 } }],
    ['empty Target text', { ...target, text: '  ' }],
    ['multi-line text', { ...target, text: 'a\nb' }],
    ['missing label', { row: 'care', text: 'x' }],
  ])('rejects %s', (_name, row) => {
    expect(QualityRow.safeParse(row).success).toBe(false);
  });

  it('requires exactly seven rows in order', () => {
    const rows = QUALITY_ROWS.map((row) => ({ row, label: 'Target', text: 'x' }));
    expect(QualityCard.safeParse(rows).success).toBe(true);
    expect(QualityCard.safeParse(rows.slice(1)).success).toBe(false);
    expect(QualityCard.safeParse([rows[1], rows[0], ...rows.slice(2)]).success).toBe(false);
  });
});

describe('Concept schema rules', () => {
  const base = () => structuredClone(load('mens-cotton-shirt')) as Record<string, any>;

  it('rejects a composition that does not sum to 100', () => {
    const c = base();
    c.fabricNotes.composition = [{ fibre: 'cotton', percent: 90 }];
    expect(Concept.safeParse(c).success).toBe(false);
  });

  it('rejects a missing alt entry', () => {
    const c = base();
    delete c.views.alt['05-back'];
    expect(Concept.safeParse(c).success).toBe(false);
  });

  it('rejects an unknown Concept id', () => {
    const c = base();
    c.id = 'mens-silk-shirt';
    expect(Concept.safeParse(c).success).toBe(false);
  });

  it('accepts a yarnQuality term only with a factId', () => {
    const c = base();
    c.fabricNotes.yarnQuality = { term: 'combed' };
    expect(Concept.safeParse(c).success).toBe(false);
    c.fabricNotes.yarnQuality = { term: 'combed', factId: 'some-fact' };
    expect(Concept.safeParse(c).success).toBe(true);
  });

  it('rejects an invalid co-ord set composition', () => {
    const c = structuredClone(load('womens-coord-set')) as Record<string, any>;
    c.fabricNotes.composition = [
      { fibre: 'cotton', percent: 70 },
      { fibre: 'linen', percent: 30 },
    ];
    expect(Concept.safeParse(c).success).toBe(false);
    c.fabricNotes.composition = [
      { fibre: 'cotton', percent: 85 },
      { fibre: 'linen', percent: 15 },
    ];
    expect(Concept.safeParse(c).success).toBe(true);
  });
});

describe('isValidCoordComposition (Requirement 8.5)', () => {
  const parts = (cotton: number, linen: number) =>
    [
      { fibre: 'cotton', percent: cotton },
      ...(linen > 0 ? [{ fibre: 'linen', percent: linen }] : []),
    ] as const;

  it('accepts 100% cotton', () => {
    expect(isValidCoordComposition([{ fibre: 'cotton', percent: 100 }])).toBe(true);
  });

  it.each([10, 15, 20])('accepts cotton with %i%% linen', (linen) => {
    expect(isValidCoordComposition(parts(100 - linen, linen))).toBe(true);
  });

  it.each([5, 9, 21, 40, 100])('rejects %i%% linen', (linen) => {
    expect(isValidCoordComposition(parts(100 - linen, linen))).toBe(false);
  });

  it('rejects empty, not-summing-to-100 and other-fibre compositions', () => {
    expect(isValidCoordComposition([])).toBe(false);
    expect(isValidCoordComposition(parts(80, 10))).toBe(false);
    expect(isValidCoordComposition([{ fibre: 'cotton', percent: 95 }, { fibre: 'elastane', percent: 5 }])).toBe(false);
  });
});
