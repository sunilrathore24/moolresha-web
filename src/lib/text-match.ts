// Shared text matchers for the Content_Check rules.
//   - Restricted phrases and "European linen" (CC-04, CC-17): normaliseForMatch, phrasePattern, findPhrase
//   - Health_Term_List (CC-20): HYPHENS, foldForHealthMatch, healthTermPattern, findHealthTerms
//   - Brand_Blocklist (CC-05): foldForBrandMatch, brandPattern, findBrands
// Pure functions, no Astro or Node imports.
// Requirements: 7.12, 8C.12, 11A.8

/** Word-character test used for boundaries. `\b` is ASCII-only, so we use lookarounds. */
const NOT_AFTER_WORD = '(?<![\\p{L}\\p{N}_])';
const NOT_BEFORE_WORD = '(?![\\p{L}\\p{N}_])';

function escapeRegExp(s: string): string {
  // '-' is not escaped: `\-` is a syntax error outside a character class under the 'u' flag.
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** Zero-width characters: U+200B-U+200D, U+2060, U+FEFF. */
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

// ---------------------------------------------------------------------------
// Restricted phrases (CC-04, CC-17)
// ---------------------------------------------------------------------------

/** NFKC, lower case, and every Unicode whitespace run (incl. CR, LF, NBSP) becomes one space. */
export function normaliseForMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ');
}

/**
 * Builds a regex for a phrase: regex characters escaped, words joined by `\s+`,
 * word boundaries at both ends, flags 'giu'. The phrase is NFKC-normalised first.
 * Returns a new RegExp each call, so `lastIndex` is never shared.
 */
export function phrasePattern(phrase: string): RegExp {
  const words = phrase.normalize('NFKC').split(/\s+/u).filter((w) => w.length > 0);
  if (words.length === 0) {
    // Matches nothing.
    return /(?!)/giu;
  }
  const body = words.map(escapeRegExp).join('\\s+');
  return new RegExp(`${NOT_AFTER_WORD}${body}${NOT_BEFORE_WORD}`, 'giu');
}

/**
 * Finds every occurrence of `phrase` in `text`. Offsets refer to the text as given
 * (the text is not normalised, so callers can map offsets to the source). Case-insensitive;
 * any run of whitespace, line breaks or NBSP in the text matches a space in the phrase.
 */
export function findPhrase(text: string, phrase: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const m of text.matchAll(phrasePattern(phrase))) {
    const start = m.index ?? 0;
    out.push({ start, end: start + m[0].length });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Health_Term_List (CC-20)
// ---------------------------------------------------------------------------

// U+002D hyphen-minus, U+2010 hyphen, U+2011 non-breaking hyphen, U+2012 figure dash,
// U+2013 en dash, U+2014 em dash, U+2212 minus sign, U+00AD soft hyphen, U+FE63, U+FF0D
export const HYPHENS = '\\-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2212\\u00AD\\uFE63\\uFF0D';

/** NFKC, lower case, and zero-width characters removed. */
export function foldForHealthMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(ZERO_WIDTH, '');
}

/**
 * Builds a regex for a health term. The term is folded, split into parts at spaces and
 * hyphens, and the parts are joined with `(?:[\s HYPHENS]*)`: any run of whitespace
 * (incl. CR, LF, NBSP) or hyphen variants, or nothing. Separators are allowed only where the
 * term has a space or hyphen. Word boundaries at both ends; flags 'giu'.
 * Run it on text that went through `foldForHealthMatch`.
 */
export function healthTermPattern(term: string): RegExp {
  const parts = foldForHealthMatch(term)
    .split(new RegExp(`[\\s${HYPHENS}]+`, 'u'))
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    return /(?!)/giu;
  }
  const body = parts.map(escapeRegExp).join(`(?:[\\s${HYPHENS}]*)`);
  return new RegExp(`${NOT_AFTER_WORD}${body}${NOT_BEFORE_WORD}`, 'giu');
}

/**
 * Finds every health term in `text`. The text is folded first, so `start` and `end` are
 * offsets in the folded text. Results are sorted by `start`, then by term.
 */
export function findHealthTerms(
  text: string,
  terms: string[],
): { term: string; start: number; end: number }[] {
  const folded = foldForHealthMatch(text);
  const out: { term: string; start: number; end: number }[] = [];
  for (const term of terms) {
    for (const m of folded.matchAll(healthTermPattern(term))) {
      const start = m.index ?? 0;
      out.push({ term, start, end: start + m[0].length });
    }
  }
  return out.sort((a, b) => a.start - b.start || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Brand_Blocklist (CC-05)
// ---------------------------------------------------------------------------

/**
 * NFKC, lower case, zero-width characters removed, punctuation and symbols folded to a space,
 * whitespace collapsed and trimmed. So "H&M", "H & M" and "h m" all fold to "h m".
 */
export function foldForBrandMatch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(ZERO_WIDTH, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Builds a regex for a brand name to run on text folded with `foldForBrandMatch`:
 * the folded brand words joined by a single space, with word boundaries at both ends.
 */
export function brandPattern(brand: string): RegExp {
  const words = foldForBrandMatch(brand).split(' ').filter((w) => w.length > 0);
  if (words.length === 0) {
    return /(?!)/giu;
  }
  return new RegExp(`${NOT_AFTER_WORD}${words.map(escapeRegExp).join(' ')}${NOT_BEFORE_WORD}`, 'giu');
}

/**
 * Finds every blocklisted brand in `text`. The text is folded first, so `start` and `end`
 * are offsets in the folded text. Results are sorted by `start`, then by brand.
 */
export function findBrands(
  text: string,
  brands: string[],
): { brand: string; start: number; end: number }[] {
  const folded = foldForBrandMatch(text);
  const out: { brand: string; start: number; end: number }[] = [];
  for (const brand of brands) {
    for (const m of folded.matchAll(brandPattern(brand))) {
      const start = m.index ?? 0;
      out.push({ brand, start, end: start + m[0].length });
    }
  }
  return out.sort((a, b) => a.start - b.start || (a.brand < b.brand ? -1 : a.brand > b.brand ? 1 : 0));
}
