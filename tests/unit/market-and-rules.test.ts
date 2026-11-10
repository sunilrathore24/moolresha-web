// Unit tests for task 2.8: market scans, Price_Layers, Story and word rules.
// Requirements 4.7, 5.5, 6.1-6.4, 7.1, 7.6, 7.7, 7.9, 7.10, 8C.11, 11A.1, 11A.6.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { CONCEPT_IDS } from '../../src/content/config/allow-lists';
import { MarketScan, type MarketScanInput } from '../../src/lib/market-scan-schema';
import { toPublicMarketScan } from '../../src/lib/market-scan';
import {
  PRICE_LAYER_IDS,
  PriceLayers,
  Story,
  LAUNCH_PROMISE,
} from '../../src/lib/price-layers-schema';
import {
  REQUIRED_HEALTH_TERMS,
  REQUIRED_RESTRICTED_PHRASES,
  loadBrandBlocklist,
  loadWordRules,
  parseWordRules,
} from '../../src/lib/word-rules-schema';
import { Concept } from '../../src/lib/concept-schema';

const ROOT = process.cwd();
const yaml = (rel: string): unknown => parse(readFileSync(join(ROOT, rel), 'utf8'));

const valid = (): MarketScanInput => ({
  id: 'mens-cotton-shirt',
  conceptId: 'mens-cotton-shirt',
  label: 'MoolResha market scan',
  rangeMin: 1000,
  rangeMax: 2000,
  methodNote: {
    listings: 2,
    from: '2026-01-01',
    to: '2026-01-10',
    channels: ['brand sites'],
  },
  evidence: [
    { brand: 'Brand A', url: 'https://example.com/a', price: 1000, seen: '2026-01-02' },
    { brand: 'Brand B', url: 'https://example.com/b', price: 2000, seen: '2026-01-09' },
  ],
});

describe('MarketScan schema', () => {
  it('accepts a consistent scan', () => {
    expect(MarketScan.safeParse(valid()).success).toBe(true);
  });

  it('rejects rangeMin > rangeMax', () => {
    const s = valid();
    s.rangeMin = 3000;
    expect(MarketScan.safeParse(s).success).toBe(false);
  });

  it('rejects a listings count that differs from the evidence rows', () => {
    const s = valid();
    s.methodNote.listings = 3;
    expect(MarketScan.safeParse(s).success).toBe(false);
  });

  it('rejects an evidence price outside the range', () => {
    const s = valid();
    s.evidence[1]!.price = 2500;
    expect(MarketScan.safeParse(s).success).toBe(false);
  });

  it('rejects an evidence date outside the scan window', () => {
    const s = valid();
    s.evidence[0]!.seen = '2025-12-31';
    expect(MarketScan.safeParse(s).success).toBe(false);
  });

  it('rejects an empty evidence array', () => {
    const s = valid();
    s.evidence = [];
    expect(MarketScan.safeParse(s).success).toBe(false);
  });
});

describe('toPublicMarketScan', () => {
  it('returns only range, label and method note', () => {
    const scan = MarketScan.parse(valid());
    const pub = toPublicMarketScan(scan);
    expect(Object.keys(pub).sort()).toEqual(
      ['conceptId', 'label', 'methodNote', 'rangeMax', 'rangeMin'].sort(),
    );
    const json = JSON.stringify(pub);
    expect(json).not.toContain('Brand A');
    expect(json).not.toContain('example.com');
    expect(json).not.toContain('evidence');
  });
});

describe('seeded market scans', () => {
  const dir = join(ROOT, 'src/content/market-scans');

  it('has exactly one file per Concept', () => {
    expect(readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort()).toEqual(
      CONCEPT_IDS.map((id) => `${id}.yaml`).sort(),
    );
  });

  for (const id of CONCEPT_IDS) {
    describe(id, () => {
      const raw = yaml(`src/content/market-scans/${id}.yaml`);
      const concept = Concept.parse(yaml(`src/content/concepts/${id}.yaml`));

      it('parses with the MarketScan schema', () => {
        const r = MarketScan.safeParse(raw);
        expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true);
      });

      it('matches the Concept id and its marketScanId', () => {
        const scan = MarketScan.parse(raw);
        expect(scan.conceptId).toBe(id);
        expect(scan.id).toBe(concept.marketScanId);
      });

      it('uses a reserved non-generic placeholder host for every evidence URL', () => {
        for (const e of MarketScan.parse(raw).evidence) {
          expect(new URL(e.url).hostname).toBe('evidence.invalid');
        }
      });

      it('uses generic placeholder brands and flags repo privacy', () => {
        const text = readFileSync(join(dir, `${id}.yaml`), 'utf8');
        expect(text).toContain('confirm repo privacy');
        for (const e of MarketScan.parse(raw).evidence) {
          expect(e.brand).toMatch(/^Placeholder Brand \d+$/);
        }
      });
    });
  }
});

describe('Price_Layers', () => {
  const raw = yaml('src/content/price-layers/price-layers.yaml');

  it('seed parses and has nine layers in order', () => {
    const p = PriceLayers.parse(raw);
    expect(p.layers.map((l) => l.id)).toEqual([...PRICE_LAYER_IDS]);
    expect(p.launchPromise).toBe(LAUNCH_PROMISE);
    expect(p.gstFactId).toBe('gst-cliff-2025');
  });

  // Copy was AI-drafted (2026-11-08) from general apparel-costing knowledge to replace the
  // original "⚠️ founder copy" placeholder; see the comment in price-layers.yaml. A founder/
  // lawyer pass still has to confirm the wording before PUBLIC_LAUNCH (docs/launch-checklist.md).
  // This test now guards the one invariant that must never regress: no amount, percentage or
  // currency token in any layer's name or explanation (Requirements 6.1-6.4).
  it('seed copy carries no amounts, percentages or leftover placeholder markers', () => {
    const p = PriceLayers.parse(raw);
    for (const l of p.layers) {
      expect(`${l.name} ${l.explanation}`).not.toMatch(/[₹%\d]|\bRs\b|\bINR\b/i);
      expect(l.explanation).not.toMatch(/TBD|TODO|lorem ipsum/i);
    }
  });

  it('rejects wrong order, missing layers, amount keys and a changed promise', () => {
    const p = PriceLayers.parse(raw);
    const swapped = { ...p, layers: [p.layers[1], p.layers[0], ...p.layers.slice(2)] };
    expect(PriceLayers.safeParse(swapped).success).toBe(false);
    expect(PriceLayers.safeParse({ ...p, layers: p.layers.slice(1) }).success).toBe(false);
    const withAmount = { ...p, layers: p.layers.map((l, i) => (i === 0 ? { ...l, amount: 100 } : l)) };
    expect(PriceLayers.safeParse(withAmount).success).toBe(false);
    expect(PriceLayers.safeParse({ ...p, launchPromise: 'Different.' }).success).toBe(false);
  });
});

describe('Story', () => {
  it('seed parses', () => {
    expect(Story.safeParse(yaml('src/content/story/story.yaml')).success).toBe(true);
  });

  it('rejects changed wording', () => {
    const s = yaml('src/content/story/story.yaml') as Record<string, string>;
    expect(Story.safeParse({ ...s, aimLabel: 'Our goal' }).success).toBe(false);
  });
});

describe('word rules and brand blocklist', () => {
  it('word-rules.yaml parses and holds the required health terms', () => {
    const rules = loadWordRules();
    for (const t of REQUIRED_HEALTH_TERMS) expect(rules.healthTerms).toContain(t);
    expect(rules.healthTerms).toContain('hypo-allergenic');
  });

  it('holds the required restricted phrases and greenwashing words', () => {
    const rules = loadWordRules();
    for (const p of REQUIRED_RESTRICTED_PHRASES) expect(rules.restrictedPhrases).toContain(p);
    expect(rules.restricted).toContain('sustainable');
    expect(rules.superlatives).toContain('premium');
  });

  it('rejects a rules file with a missing or unknown key', () => {
    const rules = loadWordRules();
    const { healthTerms: _h, ...rest } = rules;
    expect(() => parseWordRules(rest)).toThrow();
    expect(() => parseWordRules({ ...rules, extra: [] })).toThrow();
  });

  it('brand-blocklist.yaml parses and never lists MoolResha', () => {
    const b = loadBrandBlocklist();
    expect(b.brands.length).toBeGreaterThan(0);
    expect(b.brands.map((x) => x.toLowerCase())).not.toContain('moolresha');
  });
});
