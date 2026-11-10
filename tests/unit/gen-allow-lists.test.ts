import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { PRICE_BAND_IDS } from '../../src/content/config/allow-lists.generated';
import { bandLabel, validatePriceBands, type PriceBand } from '../../src/lib/price-bands';
import {
  CONCEPTS_DIR,
  OUTPUT_PATH,
  generateAllowLists,
  readConcepts,
  renderAllowLists,
} from '../../scripts/gen-allow-lists';

function rawYamlBands(): Record<string, PriceBand[]> {
  const out: Record<string, PriceBand[]> = {};
  for (const file of readdirSync(CONCEPTS_DIR).filter((f) => f.endsWith('.yaml'))) {
    const doc = parse(readFileSync(join(CONCEPTS_DIR, file), 'utf8')) as {
      id: string;
      priceBands: PriceBand[];
    };
    out[doc.id] = doc.priceBands;
  }
  return out;
}

describe('gen-allow-lists', () => {
  it('the checked-in generated file equals what generateAllowLists() produces now', () => {
    expect(readFileSync(OUTPUT_PATH, 'utf8')).toBe(generateAllowLists());
  });

  it('starts with a header saying the file is generated', () => {
    expect(generateAllowLists()).toMatch(/^\/\*\*\n \* GENERATED FILE\. DO NOT EDIT BY HAND\./);
  });

  it('has an entry for every Concept, with bands matching the YAML in ascending order', () => {
    const yamlBands = rawYamlBands();
    expect(Object.keys(PRICE_BAND_IDS).sort()).toEqual([...CONCEPT_IDS].sort());
    for (const id of CONCEPT_IDS) {
      const bands = yamlBands[id];
      expect(bands, `${id} YAML`).toBeDefined();
      expect(PRICE_BAND_IDS[id]).toEqual(bands!.map((b) => b.id));
      expect(validatePriceBands(bands!)).toEqual([]);
    }
  });

  it('lists ids in ascending band order (labels ascend by lower bound)', () => {
    const yamlBands = rawYamlBands();
    for (const id of CONCEPT_IDS) {
      const bands = yamlBands[id]!;
      const starts = bands.map((b) => (b.kind === 'under' ? 0 : b.lower));
      expect(starts, `${id} ${bands.map(bandLabel).join(', ')}`).toEqual([...starts].sort((a, b) => a - b));
    }
  });

  it('has unique ids within and across Concepts', () => {
    const all = CONCEPT_IDS.flatMap((id) => [...PRICE_BAND_IDS[id]]);
    expect(new Set(all).size).toBe(all.length);
    for (const id of CONCEPT_IDS) {
      expect(new Set(PRICE_BAND_IDS[id]).size).toBe(PRICE_BAND_IDS[id].length);
    }
  });

  it('fails with a clear message when a Concept has gapped bands', () => {
    const concepts = readConcepts().map((c) =>
      c.id === 'mens-cotton-shirt'
        ? {
            ...c,
            priceBands: c.priceBands.filter((b) => b.id !== 'mcs-1500-1999'),
          }
        : c,
    );
    expect(() => renderAllowLists(concepts)).toThrow(/mens-cotton-shirt: invalid priceBands: gap between mcs-1000-1499 and mcs-2000-2499/);
  });
});
