/**
 * fast-check generators for the Brand_Blocklist property (CC-05, Property 11).
 *
 * `brandVariant(brand)` rewrites a brand with random case and a random separator
 * between its words: any non-empty mix of spaces, tabs, NBSP, line breaks and
 * punctuation or symbols, so "H&M" also becomes "h & m", "H M", "H.M" or "h-m".
 * Every result folds (`foldForBrandMatch`) to the same text as the brand.
 *
 * `brandScenario()` builds the configured blocklist and the market-scan evidence
 * brands (overlapping, with "MoolResha" sometimes in either) and picks one brand to
 * insert, with its variant text.
 */
import fc from 'fast-check';
import { foldForBrandMatch } from '../../src/lib/text-match';
import { caseVariant } from './text-variants';

/** Names with punctuation, spaces and apostrophes. None share a word with the page vocabulary. */
export const BRAND_POOL: readonly string[] = [
  'H&M',
  'Marks & Spencer',
  'Zara',
  "Levi's",
  'W for Woman',
  'Van Heusen',
  'Fab India',
  'Allen Solly',
  'Pantaloons',
  'Qorvex Mills',
];

const SEPARATOR_PIECES = [' ', '\t', '\u00A0', '\n', '&', '-', '.', ',', '/', '_', '+', '\u00B7'] as const;

/** A non-empty separator that folds to one space. */
export const brandSeparator: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...SEPARATOR_PIECES), { minLength: 1, maxLength: 3 })
  .map((a) => a.join(''));

/** The folded words of a brand: "H&M" -> ["h", "m"]. */
export function brandWords(brand: string): string[] {
  return foldForBrandMatch(brand).split(' ').filter((w) => w.length > 0);
}

export function brandVariant(brand: string): fc.Arbitrary<string> {
  const words = brandWords(brand);
  return fc
    .tuple(fc.array(brandSeparator, { minLength: words.length, maxLength: words.length }), caseVariant('x'))
    .chain(([seps]) => {
      const joined = words.map((w, i) => (i === 0 ? w : `${seps[i - 1]}${w}`)).join('');
      return caseVariant(joined);
    });
}

export interface BrandScenario {
  /** `brand-blocklist.yaml#brands`. May contain "MoolResha". */
  blocklist: string[];
  /** One market scan per entry, each with evidence rows of brands. May contain "MoolResha". */
  marketScans: { evidence: { brand: string }[] }[];
  /** Every brand that must be blocked (configured plus evidence), without "MoolResha". */
  blocked: string[];
  /** The brand chosen for insertion and the text to insert. */
  insert: { brand: string; text: string };
}

export function brandScenario(): fc.Arbitrary<BrandScenario> {
  return fc
    .record({
      configured: fc.shuffledSubarray([...BRAND_POOL]),
      evidence: fc.shuffledSubarray([...BRAND_POOL]),
      own: fc.constantFrom('none', 'blocklist', 'evidence', 'both'),
      ownSpelling: fc.constantFrom('MoolResha', 'moolresha', 'MOOLRESHA'),
    })
    .filter((r) => r.configured.length + r.evidence.length > 0)
    .chain((r) => {
      const blocklist = [...r.configured, ...(r.own === 'blocklist' || r.own === 'both' ? [r.ownSpelling] : [])];
      const evidenceBrands = [...r.evidence, ...(r.own === 'evidence' || r.own === 'both' ? [r.ownSpelling] : [])];
      const blocked = [...new Set([...r.configured, ...r.evidence])];
      // Split the evidence over one or two market scans.
      const marketScans = [
        { evidence: evidenceBrands.slice(0, Math.ceil(evidenceBrands.length / 2)).map((brand) => ({ brand })) },
        { evidence: evidenceBrands.slice(Math.ceil(evidenceBrands.length / 2)).map((brand) => ({ brand })) },
      ];
      return fc.constantFrom(...blocked).chain((brand) =>
        brandVariant(brand).map((text) => ({ blocklist, marketScans, blocked, insert: { brand, text } })),
      );
    });
}
