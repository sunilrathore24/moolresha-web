// Unit tests for the seeded Quality_Cards and word rules (task 3.5).
// Requirements 8C.1-8C.5, 8C.11, 11A.6.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { Concept } from '../../src/lib/concept-schema';
import { Fact, type FactEntry } from '../../src/lib/fact-schema';
import { checkQualityCard } from '../../src/lib/quality-card';
import { loadWordRules } from '../../src/lib/word-rules-schema';

const ROOT = process.cwd();

function loadRegistry(): Map<string, FactEntry> {
  const dir = join(ROOT, 'src/content/facts');
  const facts = new Map<string, FactEntry>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml'))) {
    const entry = Fact.parse(parse(readFileSync(join(dir, f), 'utf8')));
    facts.set(entry.id, entry);
  }
  return facts;
}

describe('seeded Quality_Cards', () => {
  const facts = loadRegistry();

  it('loads a non-empty Fact_Registry', () => {
    expect(facts.size).toBeGreaterThan(0);
  });

  for (const id of CONCEPT_IDS) {
    it(`${id}: the Quality_Card passes checkQualityCard against the real Fact_Registry`, () => {
      const concept = Concept.parse(parse(readFileSync(join(ROOT, 'src/content/concepts', `${id}.yaml`), 'utf8')));
      expect(checkQualityCard(concept.quality, facts)).toEqual([]);
    });
  }
});

describe('word-rules.yaml', () => {
  const rules = loadWordRules();

  it('lists the five required health terms', () => {
    for (const term of ['skin-friendly', 'hypoallergenic', 'anti-allergy', 'chemical-free', 'non-toxic']) {
      expect(rules.healthTerms, term).toContain(term);
    }
  });

  it('lists the three required restricted phrases', () => {
    for (const phrase of ['made in Bangladesh', 'instead of Bangladesh', 'less GST']) {
      expect(rules.restrictedPhrases, phrase).toContain(phrase);
    }
  });
});
