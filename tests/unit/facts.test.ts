// Unit tests for the Fact_Registry seed data and fact helpers (task 2.1).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { Fact, type FactEntry } from '../../src/lib/fact-schema';
import { factViewModel, getFact, resolveFact } from '../../src/lib/facts';

const FACTS_DIR = join(__dirname, '../../src/content/facts');
const files = readdirSync(FACTS_DIR).filter((f) => f.endsWith('.yaml'));

function load(file: string): unknown {
  return parse(readFileSync(join(FACTS_DIR, file), 'utf8'));
}

const parsed: FactEntry[] = files.map((f) => Fact.parse(load(f)));

describe('seeded Fact_Registry', () => {
  it('has seed entries', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s parses with the Fact schema and its id matches the file name', (file) => {
    const entry = Fact.parse(load(file));
    expect(entry.id).toBe(file.replace(/\.yaml$/, ''));
  });

  it('has unique ids', () => {
    const ids = parsed.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('seeds the GST cliff as a PIB FACT (Requirement 6.6)', () => {
    const gst = parsed.find((e) => e.id === 'gst-cliff-2025');
    expect(gst).toBeDefined();
    if (!gst || gst.label !== 'FACT') throw new Error('gst-cliff-2025 must be a FACT');
    expect(gst.source.name).toBe('PIB');
    expect(gst.source.date).toBe('September 2025');
    expect(gst.text).toContain('₹2,500');
    expect(gst.text).toContain('5%');
    expect(gst.text).toContain('18%');
    expect(gst.verifyFlag).toBe(false);
  });

  it('has an entry for each of the eight journey stops', () => {
    const stops = [
      'field',
      'ginning',
      'spinning',
      'weaving',
      'processing',
      'stitching',
      'warehousing-distribution',
      'retail',
    ];
    for (const stop of stops) {
      expect(parsed.some((e) => e.id === `journey-${stop}`), `journey-${stop}`).toBe(true);
    }
  });

  it('covers money, why-it-matters and three to five trend facts', () => {
    const count = (section: string) => parsed.filter((e) => e.section === section).length;
    expect(count('money')).toBeGreaterThan(0);
    expect(count('why')).toBeGreaterThan(0);
    expect(count('trends')).toBeGreaterThanOrEqual(3);
    expect(count('trends')).toBeLessThanOrEqual(5);
  });

  it('flags every unsourced placeholder as UNVERIFIED with verifyFlag', () => {
    for (const e of parsed.filter((x) => x.label === 'MoolResha estimate')) {
      expect(e.verifyFlag, e.id).toBe(true);
      expect(e.strength, e.id).toBe('UNVERIFIED');
    }
  });

  it('contains no brand names or health-term words', () => {
    const banned =
      /uniqlo|myntra|reliance|abfrl|arvind|amazon|flipkart|h&m|ramraj|fynd|skin-friendly|hypoallergenic|anti-allergy|chemical-free|non-toxic/i;
    for (const file of files) {
      expect(readFileSync(join(FACTS_DIR, file), 'utf8'), file).not.toMatch(banned);
    }
  });
});

describe('getFact / resolveFact', () => {
  it('resolveFact returns the entry for a known id', () => {
    expect(resolveFact('gst-cliff-2025', parsed).id).toBe('gst-cliff-2025');
  });

  it('resolveFact throws on an unknown id', () => {
    expect(() => resolveFact('no-such-fact', parsed)).toThrow(/Unknown fact id "no-such-fact"/);
  });

  it('getFact rejects on an unknown id', async () => {
    // Outside Astro the `astro:content` module may not resolve; either way a bad id never yields an entry.
    await expect(getFact('no-such-fact')).rejects.toThrow();
  });
});

describe('factViewModel', () => {
  const gst = parsed.find((e) => e.id === 'gst-cliff-2025') as FactEntry;

  it('gives a Source_Link with rel noopener noreferrer for a FACT', () => {
    const vm = factViewModel(gst);
    expect(vm.label).toBe('FACT');
    expect(vm.id).toBe('gst-cliff-2025');
    if (!('sourceLink' in vm)) throw new Error('expected sourceLink');
    expect(vm.sourceLink.rel).toBe('noopener noreferrer');
    expect(vm.sourceLink.text).toBe('PIB, September 2025');
    expect('assumptions' in vm).toBe(false);
    expect('methodNote' in vm).toBe(false);
  });

  it('gives assumptions only for a MoolResha estimate', () => {
    const est = parsed.find((e) => e.label === 'MoolResha estimate') as FactEntry;
    const vm = factViewModel(est);
    expect('assumptions' in vm && vm.assumptions.length > 0).toBe(true);
    expect('sourceLink' in vm).toBe(false);
  });

  it('gives a method note only for a MoolResha market scan', () => {
    const scan = Fact.parse({
      id: 'market-test',
      label: 'MoolResha market scan',
      text: 'Similar pieces: about X to Y.',
      methodNote: {
        listings: 12,
        from: '2026-11-01',
        to: '2026-11-07',
        channels: ['online marketplaces', 'brand sites'],
      },
      strength: 'MODERATE',
      lastChecked: '2026-11-07',
      section: 'concepts',
    });
    const vm = factViewModel(scan);
    if (!('methodNote' in vm)) throw new Error('expected methodNote');
    expect(vm.methodNote.text).toBe(
      '12 listings, 1 Nov 2026 to 7 Nov 2026, online marketplaces, brand sites',
    );
    expect('sourceLink' in vm).toBe(false);
  });
});

describe('Fact schema rejects incomplete entries', () => {
  const base = { id: 'x', text: 't', strength: 'STRONG', lastChecked: '2026-11-07', section: 'other' };

  it('rejects a FACT with no source', () => {
    expect(Fact.safeParse({ ...base, label: 'FACT' }).success).toBe(false);
  });
  it('rejects a MoolResha estimate with no assumptions', () => {
    expect(Fact.safeParse({ ...base, label: 'MoolResha estimate' }).success).toBe(false);
  });
  it('rejects an entry with no label', () => {
    expect(Fact.safeParse(base).success).toBe(false);
  });
  it('rejects an entry with no lastChecked', () => {
    const { lastChecked: _omit, ...rest } = base;
    expect(
      Fact.safeParse({ ...rest, label: 'MoolResha estimate', assumptions: ['a'] }).success,
    ).toBe(false);
  });
});
