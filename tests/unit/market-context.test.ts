import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { MarketScan } from '../../src/lib/market-scan-schema';
import { toPublicMarketScan } from '../../src/lib/market-scan';
import {
  MARKET_SUMMARY,
  MARKET_VARIES_NOTE,
  formatRupeeRange,
  joinChannels,
  marketRangeText,
  methodNoteText,
} from '../../src/lib/market-context';

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');
/** The file without block comments, so header notes do not trip the checks. */
const code = (p: string): string => read(p).replace(/\/\*[\s\S]*?\*\//g, '');

describe('market-context wording', () => {
  it('formats the range with en-IN grouping and an en dash', () => {
    expect(formatRupeeRange(1000, 2600)).toBe('\u20B91,000\u20132,600');
    expect(formatRupeeRange(12000, 125000)).toBe('\u20B912,000\u20131,25,000');
  });

  it('builds the exact range sentence', () => {
    expect(marketRangeText({ rangeMin: 1000, rangeMax: 2600 })).toBe(
      'Similar pieces from popular brands online and in malls: about \u20B91,000\u20132,600',
    );
  });

  it('joins channels in plain English', () => {
    expect(joinChannels(['online marketplaces'])).toBe('online marketplaces');
    expect(joinChannels(['online marketplaces', 'brand sites'])).toBe('online marketplaces and brand sites');
    expect(joinChannels(['online marketplaces', 'brand sites', 'mall high-street'])).toBe(
      'online marketplaces, brand sites and mall high-street',
    );
  });

  it('states listing count, date window and channels in the method note', () => {
    const text = methodNoteText({
      listings: 3,
      from: '2026-01-05',
      to: '2026-01-11',
      channels: ['online marketplaces', 'brand sites', 'mall high-street'],
    });
    expect(text).toBe(
      '3 listings, seen 5 Jan 2026 to 11 Jan 2026, from online marketplaces, brand sites and mall high-street',
    );
    expect(methodNoteText({ listings: 1, from: '2026-01-05', to: '2026-01-05', channels: ['brand sites'] })).toMatch(
      /^1 listing,/,
    );
  });

  it('uses the required summary and note', () => {
    expect(MARKET_SUMMARY).toBe('See what similar pieces cost');
    expect(MARKET_VARIES_NOTE).toBe('Prices vary within every brand and change often.');
  });

  it('never prints evidence for any seeded scan', () => {
    const dir = 'src/content/market-scans';
    for (const id of ['mens-cotton-shirt']) {
      const scan = MarketScan.parse(parse(read(`${dir}/${id}.yaml`)));
      const pub = toPublicMarketScan(scan);
      const text = `${marketRangeText(pub)} ${methodNoteText(pub.methodNote)}`;
      for (const e of scan.evidence) {
        expect(text).not.toContain(e.brand);
        expect(text).not.toContain(e.url);
      }
    }
  });
});

describe('MarketPriceContext.astro (source checks)', () => {
  const src = code('src/components/launch/MarketPriceContext.astro');

  it('renders a collapsed details with the reveal hooks', () => {
    expect(src).toContain('<details class="market-context"');
    expect(src).toContain('data-market-for={scan.conceptId}');
    expect(src).toContain('data-reveal="pending"');
    expect(src).not.toMatch(/<details[^>]*\sopen[\s>=]/);
    expect(src).not.toMatch(/<details[^>]*\shidden[\s>=]/);
    expect(src).toContain('<summary');
    expect(src).toContain('{MARKET_SUMMARY}');
  });

  it('takes only the public projection and shows the label', () => {
    expect(src).toContain("import type { PublicMarketScan } from '../../lib/market-scan'");
    expect(src).toContain('<ClaimLabel label={scan.label} />');
    expect(src).toContain('class="fact');
    expect(src).not.toContain('data-fact-id');
    expect(src).not.toMatch(/evidence\s*[.[]|\.brand|\.url|getCollection|market-scan-schema/);
  });

  it('holds the range, method note and the varies note', () => {
    expect(src).toContain('marketRangeText(scan)');
    expect(src).toContain('methodNoteText(scan.methodNote)');
    expect(src).toContain('{MARKET_VARIES_NOTE}');
  });
});

describe('ConceptCard.astro (source checks)', () => {
  const src = code('src/components/launch/ConceptCard.astro');
  const body = src.slice(src.indexOf('<article'));

  it('has the card root hooks', () => {
    expect(src).toMatch(/<article[\s\S]*?data-concept-card[\s\S]*?data-concept-id=\{concept\.id\}/);
  });

  it('shows the not-for-sale label', () => {
    expect(body).toContain('Concept, not for sale');
  });

  it('renders the parts in the required order', () => {
    const order = [
      'Concept, not for sale',
      '<AngleViewer',
      '<FabricNotes',
      '<QualityCard',
      '<ConceptFeedbackForm',
      '<MarketPriceContext',
    ].map((s) => body.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('passes conceptId to FabricNotes and QualityCard', () => {
    expect(body).toMatch(/<FabricNotes[^>]*conceptId=\{concept\.id\}/);
    expect(body).toMatch(/<QualityCard[^>]*conceptId=\{concept\.id\}/);
  });

  it('has no commerce wording', () => {
    expect(body).not.toMatch(/\b(buy|add to cart|add to bag|pre-?order|order now|shop now|launch price)\b/i);
    expect(body).not.toContain('!');
  });
});

describe('ConceptsSection.astro (source checks)', () => {
  const src = read('src/components/launch/ConceptsSection.astro');

  it('has the section hooks', () => {
    expect(src).toContain('data-section="concepts"');
    expect(src).toContain('id="concepts"');
  });

  it('loads both collections, sorts by order and projects scans publicly', () => {
    expect(src).toContain("getCollection('concepts')");
    expect(src).toContain("getCollection('market-scans')");
    expect(src).toContain('a.order - b.order');
    expect(src).toContain('marketScanId');
    expect(src).toContain('toPublicMarketScan(scan)');
  });

  it('keeps firstCardAboveFold false', () => {
    expect(src).toContain('FIRST_CARD_ABOVE_FOLD = false');
  });

  it('renders HowWeCheck once, after the cards', () => {
    expect(src.match(/<HowWeCheck/g)?.length).toBe(1);
    expect(src.indexOf('<HowWeCheck')).toBeGreaterThan(src.indexOf('<ConceptCard'));
  });

  it('marks the later product in the card', () => {
    const card = read('src/components/launch/ConceptCard.astro');
    expect(card).toContain('concept.laterProduct');
    expect(card).toContain('Planned for a later release');
  });
});
