// Unit tests for the Quality_Card checks (task 3.2).
// Requirements 8C.1, 8C.2, 8C.3, 8C.5, 8C.6, 8C.7, 8C.8.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { Concept, QUALITY_ROWS } from '../../src/lib/concept-schema';
import { Fact, type FactEntry } from '../../src/lib/fact-schema';
import { checkQualityCard, factEntryProblem, findSpecValues } from '../../src/lib/quality-card';
import { qualityRows, qualityRowsWithSpec, validQualityRows } from '../generators/quality-rows';

const ROOT = process.cwd();

function loadFacts(): Map<string, FactEntry> {
  const dir = join(ROOT, 'src/content/facts');
  const map = new Map<string, FactEntry>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml'))) {
    const entry = Fact.parse(parse(readFileSync(join(dir, f), 'utf8')));
    map.set(entry.id, entry);
  }
  return map;
}

function target(row: string, text: string, extra: Record<string, unknown> = {}) {
  return { row, label: 'Target', text, ...extra };
}

/** A valid all-Target card with the given row overrides. */
function card(overrides: Record<string, Record<string, unknown>> = {}): Record<string, unknown>[] {
  return QUALITY_ROWS.map((row) => ({ row, label: 'Target', text: 'Plain text', ...overrides[row] }));
}

const FACTS = loadFacts();

describe('seeded Concepts', () => {
  for (const id of CONCEPT_IDS) {
    it(`${id}: Quality_Card passes checkQualityCard against the real facts`, () => {
      const raw = parse(readFileSync(join(ROOT, 'src/content/concepts', `${id}.yaml`), 'utf8'));
      const concept = Concept.parse(raw);
      expect(checkQualityCard(concept.quality, FACTS)).toEqual([]);
      // Also on the unparsed YAML rows.
      expect(checkQualityCard(raw.quality, FACTS)).toEqual([]);
    });
  }
});

describe('checkQualityCard structure', () => {
  it('accepts a valid card', () => {
    expect(checkQualityCard(card(), FACTS)).toEqual([]);
  });

  it('reports a wrong row count and names the missing row', () => {
    const rows = card().filter((r) => r.row !== 'care');
    const issues = checkQualityCard(rows, FACTS);
    expect(issues.some((i) => i.kind === 'rows' && i.row === 'care')).toBe(true);
  });

  it('reports a duplicated row', () => {
    const rows = card();
    rows.splice(1, 0, { ...(rows[1] as object) } as Record<string, unknown>);
    const issues = checkQualityCard(rows, FACTS);
    expect(issues.some((i) => i.kind === 'rows' && i.row === 'yarn')).toBe(true);
  });

  it('reports swapped rows and names both', () => {
    const rows = card();
    [rows[0], rows[1]] = [rows[1] as Record<string, unknown>, rows[0] as Record<string, unknown>];
    const named = checkQualityCard(rows, FACTS).flatMap((i) => (i.kind === 'rows' && i.row ? [i.row] : []));
    expect(named).toEqual(expect.arrayContaining(['fibre', 'yarn']));
  });

  it('reports a text with a line break', () => {
    const issues = checkQualityCard(card({ care: { text: 'a\nb' } }), FACTS);
    expect(issues).toContainEqual(expect.objectContaining({ kind: 'rows', row: 'care' }));
  });
});

describe('checkQualityCard labels and facts', () => {
  it('reports a missing and an unknown label', () => {
    const rows = card();
    delete (rows[2] as Record<string, unknown>).label;
    (rows[3] as Record<string, unknown>).label = 'Verified';
    const issues = checkQualityCard(rows, FACTS);
    expect(issues).toContainEqual({ kind: 'missing_label', row: 'fabric' });
    expect(issues).toContainEqual({ kind: 'missing_label', row: 'on_your_skin' });
  });

  it('accepts a FACT row backed by a complete FACT entry', () => {
    const facts = new Map(FACTS);
    const issues = checkQualityCard(
      card({ fibre: { label: 'FACT', text: '', factId: 'gst-cliff-2025' } }),
      facts,
    );
    expect(issues).toEqual([]);
  });

  it('reports a FACT row with no factId or an unknown factId', () => {
    const none = checkQualityCard(card({ fibre: { label: 'FACT', text: '' } }), FACTS);
    expect(none).toContainEqual({ kind: 'fact_missing', row: 'fibre' });
    const unknown = checkQualityCard(card({ fibre: { label: 'FACT', factId: 'nope' } }), FACTS);
    expect(unknown).toContainEqual({ kind: 'fact_missing', row: 'fibre' });
  });

  it('reports a FACT row whose entry is not labelled FACT', () => {
    const estimate = [...FACTS.values()].find((e) => e.label === 'MoolResha estimate') as FactEntry;
    const issues = checkQualityCard(card({ fibre: { label: 'FACT', factId: estimate.id } }), FACTS);
    expect(issues).toContainEqual({ kind: 'fact_not_fact_label', row: 'fibre' });
  });

  it('reports a FACT row whose entry has no Source_Link', () => {
    const facts = new Map(FACTS);
    const { source: _s, ...broken } = facts.get('gst-cliff-2025') as FactEntry & { source: unknown };
    facts.set('gst-cliff-2025', broken as unknown as FactEntry);
    expect(factEntryProblem(broken)).toBe('no Source_Link');
    const issues = checkQualityCard(card({ fibre: { label: 'FACT', factId: 'gst-cliff-2025' } }), facts);
    expect(issues).toContainEqual({ kind: 'fact_incomplete', row: 'fibre' });
  });

  it("reports a We'll test row with no test or an empty part", () => {
    const wwt = { label: 'WeWillTest', text: 'Pre-washed' };
    const issues = checkQualityCard(
      card({
        shrinkage: { ...wwt },
        after_a_year: { ...wwt, test: { what: '', publish: 'photos' } },
        care: { ...wwt, test: { what: 'x', publish: ' ' } },
      }),
      FACTS,
    );
    for (const row of ['shrinkage', 'after_a_year', 'care']) {
      expect(issues).toContainEqual({ kind: 'test_missing', row });
    }
  });

  it("accepts a We'll test row with a full test", () => {
    const issues = checkQualityCard(
      card({ shrinkage: { label: 'WeWillTest', test: { what: 'size after washes', publish: 'numbers' } } }),
      FACTS,
    );
    expect(issues).toEqual([]);
  });

  it('reports a Target row that carries a factId', () => {
    const issues = checkQualityCard(card({ care: { factId: 'gst-cliff-2025' } }), FACTS);
    expect(issues).toContainEqual({ kind: 'fact_not_fact_label', row: 'care' });
  });
});

describe('findSpecValues', () => {
  const one = (text: string) => {
    const found = findSpecValues(text);
    expect(found, text).toHaveLength(1);
    return found[0] as ReturnType<typeof findSpecValues>[number];
  };

  it.each([
    ['140 GSM', 'gsm'],
    ['140gsm', 'gsm'],
    ['140 g/m²', 'gsm'],
    ['140 g/m2', 'gsm'],
  ])('finds the single GSM value %s', (text, kind) => {
    expect(one(`Fabric of ${text} cotton`)).toMatchObject({ kind, isRange: false });
  });

  it.each(['40s', '40 count', 'Ne 40', '40/1'])('finds the single yarn count %s', (text) => {
    expect(one(`Cotton yarn, ${text}.`)).toMatchObject({ kind: 'count', isRange: false });
  });

  it('treats 40/1 as one count, not a range', () => {
    expect(one('40/1')).toEqual({ value: '40/1', kind: 'count', isRange: false });
  });

  it.each([
    ['130–150 GSM', 'gsm'],
    ['130-150 gsm', 'gsm'],
    ['130 to 150 GSM', 'gsm'],
    ['130/150 GSM', 'gsm'],
    ['30s–40s', 'count'],
    ['30s to 40s', 'count'],
    ['Ne 30-40', 'count'],
    ['40–60 count', 'count'],
  ])('finds the range %s', (text, kind) => {
    expect(one(text)).toEqual({ value: text, kind, isRange: true });
  });

  it('finds nothing in text without a spec value', () => {
    for (const text of [
      'Plain weave, light to mid weight',
      'Pre-washed; 5 home washes',
      'Machine wash at 30 degrees',
      'Cotton yarn, count to be confirmed',
      'Sizes 38 to 44',
      'Costs ₹2,000',
      'ones, twos and threes',
    ]) {
      expect(findSpecValues(text), text).toEqual([]);
    }
  });

  it('finds several values in text order', () => {
    const found = findSpecValues('Yarn 40s, fabric 130–150 GSM');
    expect(found.map((f) => [f.kind, f.isRange])).toEqual([
      ['count', false],
      ['gsm', true],
    ]);
  });
});

describe('exact spec values and ranges (Requirements 8C.6, 8C.7)', () => {
  it('reports an exact GSM on a Target row', () => {
    const issues = checkQualityCard(card({ fabric: { text: 'Poplin, 120 GSM' } }), FACTS);
    expect(issues).toContainEqual({ kind: 'exact_spec_without_fact', row: 'fabric', value: '120 GSM' });
  });

  it('accepts an exact value on a FACT row backed by a FACT entry', () => {
    const issues = checkQualityCard(
      card({ fabric: { label: 'FACT', text: 'Poplin, 120 GSM', factId: 'gst-cliff-2025' } }),
      FACTS,
    );
    expect(issues).toEqual([]);
  });

  it('reports an exact value on a FACT row whose fact is missing', () => {
    const issues = checkQualityCard(
      card({ yarn: { label: 'FACT', text: '40s', factId: 'nope' } }),
      FACTS,
    );
    expect(issues.map((i) => i.kind)).toEqual(expect.arrayContaining(['fact_missing', 'exact_spec_without_fact']));
  });

  it('accepts a range on a Target row and reports it on a We\'ll test row', () => {
    expect(checkQualityCard(card({ yarn: { text: '40s–60s count' } }), FACTS)).toEqual([]);
    const issues = checkQualityCard(
      card({
        shrinkage: { label: 'WeWillTest', text: '110–130 GSM', test: { what: 'a', publish: 'b' } },
      }),
      FACTS,
    );
    expect(issues).toContainEqual({ kind: 'range_not_target', row: 'shrinkage', value: '110–130 GSM' });
  });

  it('ignores the structured range field (it is always a range)', () => {
    const rows = card({ yarn: { range: { kind: 'count', min: 40, max: 60 } } });
    expect(checkQualityCard(rows, FACTS)).toEqual([]);
  });
});

describe('generated cards', () => {
  it('accepts valid cards and names the row for each mutation', () => {
    fc.assert(
      fc.property(qualityRows(), ({ rows, facts, mutation }) => {
        const issues = checkQualityCard(rows, facts);
        if (!mutation) return issues.length === 0;
        return issues.some(
          (i) => i.kind === mutation.expected && 'row' in i && i.row !== undefined && mutation.rows.includes(i.row),
        );
      }),
      { numRuns: 200 },
    );
  });

  it('valid generated cards produce no issues', () => {
    fc.assert(fc.property(validQualityRows(), ({ rows, facts }) => checkQualityCard(rows, facts).length === 0), {
      numRuns: 100,
    });
  });

  it('finds an inserted spec value and applies the label rules', () => {
    fc.assert(
      fc.property(qualityRowsWithSpec(), ({ rows, facts, row, label, spec, backed }) => {
        const found = findSpecValues(spec.text);
        if (found.length !== 1) return false;
        const f = found[0]!;
        if (f.kind !== spec.kind || f.isRange !== spec.isRange) return false;

        const issues = checkQualityCard(rows, facts).filter((i) => 'row' in i && i.row === row);
        const exact = issues.some((i) => i.kind === 'exact_spec_without_fact');
        const range = issues.some((i) => i.kind === 'range_not_target');
        const expectExact = !spec.isRange && !backed;
        const expectRange = spec.isRange && label !== 'Target' && label !== 'FACT';
        return exact === expectExact && range === expectRange;
      }),
      { numRuns: 200 },
    );
  });
});
