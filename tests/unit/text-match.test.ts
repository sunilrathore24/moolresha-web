// Unit tests for src/lib/text-match.ts (Requirements 7.12, 8C.12, 11A.8).
import { describe, expect, it } from 'vitest';
import {
  HYPHENS,
  findBrands,
  findHealthTerms,
  findPhrase,
  foldForBrandMatch,
  foldForHealthMatch,
  healthTermPattern,
  normaliseForMatch,
  phrasePattern,
} from '../../src/lib/text-match';

describe('normaliseForMatch', () => {
  it('lower-cases and collapses every whitespace run (incl. CR, LF, NBSP) to one space', () => {
    expect(normaliseForMatch('Made \r\n in\u00A0\u00A0 Bangladesh')).toBe('made in bangladesh');
  });
  it('applies NFKC', () => {
    expect(normaliseForMatch('ＬＥＳＳ GST')).toBe('less gst');
  });
});

describe('phrasePattern / findPhrase', () => {
  it('has flags giu', () => {
    expect(phrasePattern('less GST').flags).toBe('giu');
  });
  it('matches case-insensitively across whitespace runs, line breaks and NBSP', () => {
    const text = 'We pay LESS\n  GST and Less\u00A0GST and less\r\nGST.';
    expect(findPhrase(text, 'less GST')).toHaveLength(3);
  });
  it('returns offsets into the original text', () => {
    const text = 'a European  linen shirt';
    const [hit] = findPhrase(text, 'European linen');
    expect(text.slice(hit.start, hit.end)).toBe('European  linen');
  });
  it('respects word boundaries', () => {
    expect(findPhrase('unless GSTs', 'less GST')).toEqual([]);
    expect(findPhrase('endless GST', 'less GST')).toEqual([]);
  });
  it('escapes regex characters in the phrase', () => {
    expect(findPhrase('cost (approx.) here', '(approx.)')).toHaveLength(1);
    expect(findPhrase('cost approxX here', 'approx.')).toEqual([]);
  });
  it('accepts phrases containing hyphens', () => {
    expect(findPhrase('an eco-friendly shirt', 'eco-friendly')).toHaveLength(1);
  });
  it('finds nothing for an empty phrase', () => {
    expect(findPhrase('anything', '   ')).toEqual([]);
  });
});

describe('foldForHealthMatch', () => {
  it('applies NFKC, lower case and strips zero-width characters', () => {
    expect(foldForHealthMatch('Skin\u200B-Frie\u2060ndly\uFEFF')).toBe('skin-friendly');
    expect(foldForHealthMatch('ＳＫＩＮ')).toBe('skin');
  });
});

describe('healthTermPattern / findHealthTerms', () => {
  const TERMS = ['skin-friendly', 'hypoallergenic', 'anti-allergy', 'chemical-free', 'non-toxic', 'hypo-allergenic'];

  it('exports the hyphen class and builds a giu regex', () => {
    expect(HYPHENS).toContain('\\u2011');
    expect(healthTermPattern('skin-friendly').flags).toBe('giu');
  });

  it.each([
    'skin-friendly',
    'Skin-Friendly',
    'SKIN-Friendly',
    'skin friendly',
    'skinfriendly',
    'skin\u2011friendly', // non-breaking hyphen
    'skin \u2013 friendly', // en dash with spaces
    'skin\nfriendly',
    'skin\r\nfriendly',
    'skin\u00A0friendly',
    'skin\tfriendly',
    'skin\u00ADfriendly', // soft hyphen
    'sk\u200Bin-fri\u200Dendly', // zero-width inside
  ])('matches variant %j', (variant) => {
    const hits = findHealthTerms(`This shirt is ${variant} cotton.`, TERMS);
    expect(hits.map((h) => h.term)).toEqual(['skin-friendly']);
  });

  it('matches a one-word term only as written', () => {
    // The one-word term has no separator slot, so only the exact spelling matches it.
    expect(findHealthTerms('hypoallergenic', ['hypoallergenic']).map((h) => h.term)).toEqual(['hypoallergenic']);
    expect(findHealthTerms('hypo allergenic', ['hypoallergenic'])).toEqual([]);
    expect(findHealthTerms('hyp oallergenic', TERMS)).toEqual([]);
    // The hyphenated spelling is its own entry; its separator may also be empty.
    expect(findHealthTerms('hypo allergenic', TERMS).map((h) => h.term)).toEqual(['hypo-allergenic']);
  });

  it('does not match inside a longer word', () => {
    expect(findHealthTerms('unskin-friendlyish', TERMS)).toEqual([]);
    expect(findHealthTerms('nonnon-toxicity', TERMS)).toEqual([]);
  });

  it('matches a term split across flattened inline elements', () => {
    // CC-20 flattens inline elements before matching: skin-<em>friendly</em> becomes "skin-friendly".
    expect(findHealthTerms('skin-friendly', TERMS)).toHaveLength(1);
  });

  it('returns sorted, non-overlapping-by-term results', () => {
    const hits = findHealthTerms('non-toxic and skin-friendly', TERMS);
    expect(hits.map((h) => h.term)).toEqual(['non-toxic', 'skin-friendly']);
    expect(hits[0].start).toBeLessThan(hits[1].start);
  });

  it('ignores empty terms', () => {
    expect(findHealthTerms('anything', ['', '  '])).toEqual([]);
  });
});

describe('foldForBrandMatch / findBrands', () => {
  it('folds punctuation to space and collapses whitespace', () => {
    expect(foldForBrandMatch('H&M')).toBe('h m');
    expect(foldForBrandMatch('H & M')).toBe('h m');
    expect(foldForBrandMatch('  Ｈ\u200B&\nM  ')).toBe('h m');
  });

  it('matches "H&M" against "h m" and "H & M"', () => {
    expect(findBrands('Sold at h m stores', ['H&M'])).toHaveLength(1);
    expect(findBrands('Sold at H & M stores', ['H&M'])).toHaveLength(1);
    expect(findBrands('Sold at H&M.', ['H&M'])).toHaveLength(1);
  });

  it('uses word boundaries', () => {
    expect(findBrands('a thm store', ['H&M'])).toEqual([]);
    expect(findBrands('Zara-like fit', ['Zara'])).toHaveLength(1);
    expect(findBrands('Zarathustra', ['Zara'])).toEqual([]);
  });

  it('reports the matched blocklist entry', () => {
    expect(findBrands('Levi\u2019s jeans', ["Levi's"]).map((h) => h.brand)).toEqual(["Levi's"]);
  });
});
