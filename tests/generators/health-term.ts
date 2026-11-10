/**
 * fast-check generators for Health_Term_List tests (CC-20, Property 46).
 * Not re-exported from `tests/generators/index.ts`; import this file directly.
 *
 * `healthTermVariant(terms)` picks a term and rewrites it:
 *  - case: kept, upper, lower, title, alternating or random per character;
 *  - the separator at each space or hyphen of the term: nothing, or a run of 1 to 3
 *    pieces drawn from spaces, tabs, CR, LF, CRLF, NBSP and every kind in `HYPHEN_KINDS`
 *    (so "skin\r\n-\u00A0friendly" and "skin\u2013friendly" both occur);
 *  - up to three zero-width characters inserted between any two characters.
 * Every result must match `findHealthTerms(text, [term])`.
 */
import fc from 'fast-check';

/** The terms `word-rules.yaml` must hold (Requirement 8C.11). */
export const DEFAULT_HEALTH_TERMS: readonly string[] = [
  'skin-friendly',
  'hypoallergenic',
  'anti-allergy',
  'chemical-free',
  'non-toxic',
];

/** Hyphen kinds from `HYPHENS` in text-match.ts. */
export const HYPHEN_KINDS: readonly string[] = [
  '-', '\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2212', '\u00AD', '\uFE63', '\uFF0D',
];
/** Whitespace kinds a separator can use. */
export const WHITESPACE_KINDS: readonly string[] = [' ', '\t', '\r', '\n', '\r\n', '\u00A0'];
export const ZERO_WIDTH_CHARS: readonly string[] = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF'];

/** Nothing, or 1 to 3 pieces of whitespace and hyphens in any mix. */
const separator = fc
  .array(fc.constantFrom(...WHITESPACE_KINDS, ...HYPHEN_KINDS), { minLength: 0, maxLength: 3 })
  .map((a) => a.join(''));

type CaseMode = 'keep' | 'upper' | 'lower' | 'title' | 'mixed' | 'random';
const caseMode = fc.constantFrom<CaseMode>('keep', 'upper', 'lower', 'title', 'mixed', 'random');

function applyCase(s: string, mode: CaseMode, mask: readonly boolean[]): string {
  switch (mode) {
    case 'keep':
      return s;
    case 'upper':
      return s.toUpperCase();
    case 'lower':
      return s.toLowerCase();
    case 'title':
      return s.charAt(0).toUpperCase() + s.slice(1);
    case 'mixed':
      return [...s].map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase())).join('');
    case 'random':
      return [...s].map((ch, i) => (mask[i % mask.length] ? ch.toUpperCase() : ch.toLowerCase())).join('');
  }
}

/** Parts of a term, split at hyphens and spaces. */
function partsOf(term: string): string[] {
  return term.split(/[\s-]+/u).filter((p) => p.length > 0);
}

/** One term from the list with random case, separators and zero-width characters. */
export function healthTermVariant(
  terms: readonly string[] = DEFAULT_HEALTH_TERMS,
): fc.Arbitrary<{ term: string; text: string }> {
  return fc
    .tuple(
      fc.constantFrom(...terms),
      caseMode,
      fc.array(fc.boolean(), { minLength: 64, maxLength: 64 }),
      fc.array(separator, { minLength: 8, maxLength: 8 }),
      fc.array(fc.tuple(fc.nat(), fc.constantFrom(...ZERO_WIDTH_CHARS)), { minLength: 0, maxLength: 3 }),
    )
    .map(([term, mode, mask, seps, zws]) => {
      const parts = partsOf(term);
      let text = parts.map((p, i) => (i === 0 ? p : `${seps[i - 1] ?? ''}${p}`)).join('');
      text = applyCase(text, mode, mask);
      for (const [n, z] of zws) {
        if (text.length < 2) break;
        // Between two characters, never at an edge, so word boundaries stay where they were.
        const at = 1 + (n % (text.length - 1));
        text = text.slice(0, at) + z + text.slice(at);
      }
      return { term, text };
    });
}

/** The text of `healthTermVariant`, for use as `renderedPage({ insert })`. */
export function healthTermText(terms: readonly string[] = DEFAULT_HEALTH_TERMS): fc.Arbitrary<string> {
  return healthTermVariant(terms).map((v) => v.text);
}

/** Extra terms for "a new list entry is matched with no code change". Disjoint from the page vocabulary. */
export function extraHealthTerms(): fc.Arbitrary<string[]> {
  return fc.uniqueArray(fc.constantFrom('germ-proof', 'ultra pure', 'zero harm', 'pure-safe', 'allergen-free'), {
    minLength: 0,
    maxLength: 3,
  });
}
