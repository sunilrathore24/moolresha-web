// Unit tests for the seeded Concept content (task 2.7).
// Requirements 8.1, 8A.13, 9.7.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { Concept, type ConceptData } from '../../src/lib/concept-schema';
import { VIEW_BASES, VIEW_NAMES } from '../../src/lib/concept-views';
import { validatePriceBands } from '../../src/lib/price-bands';

const DIR = join(process.cwd(), 'src/content/concepts');
const concepts: ConceptData[] = CONCEPT_IDS.map((id) =>
  Concept.parse(parse(readFileSync(join(DIR, `${id}.yaml`), 'utf8'))),
);

describe('seeded Concepts', () => {
  it('has exactly five Concepts', () => {
    expect(concepts).toHaveLength(5);
    expect(new Set(concepts.map((c) => c.id)).size).toBe(5);
  });

  it('puts mens-cotton-shirt first and featured', () => {
    const [first] = [...concepts].sort((a, b) => a.order - b.order);
    expect(first?.id).toBe('mens-cotton-shirt');
    expect(first?.featured).toBe(true);
    expect(concepts.filter((c) => c.featured).map((c) => c.id)).toEqual(['mens-cotton-shirt']);
  });

  it('marks mens-linen-shirt as a later product', () => {
    expect(concepts.find((c) => c.id === 'mens-linen-shirt')?.laterProduct).toBe(true);
  });

  for (const c of concepts) {
    it(`${c.id}: the Price_Band table passes validatePriceBands`, () => {
      expect(validatePriceBands(c.priceBands)).toEqual([]);
    });

    it(`${c.id}: every alt text contains the Concept name and the view name`, () => {
      for (const view of VIEW_BASES) {
        const alt = c.views.alt[view].toLowerCase();
        expect(alt, `${c.id} ${view}`).toContain(c.name.toLowerCase());
        expect(alt, `${c.id} ${view}`).toContain(VIEW_NAMES[view].toLowerCase());
      }
    });
  }
});
