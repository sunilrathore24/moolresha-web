/**
 * fast-check generators for Restricted_Phrase_List tests (CC-17, Property 32).
 * Not re-exported from `tests/generators/index.ts`; import this file directly.
 *
 * `restrictedPhraseVariant(phrases)` picks one of the phrases and varies its case
 * and the whitespace between its words (space, tab, line breaks, NBSP, runs of
 * them). Every result must still match `findPhrase(text, phrase)`.
 */
import fc from 'fast-check';

/** The phrases `word-rules.yaml` must hold (Requirement 11A.6). */
export const DEFAULT_RESTRICTED_PHRASES: readonly string[] = [
  'made in Bangladesh',
  'instead of Bangladesh',
  'less GST',
];

/** Whitespace runs that match a single space in a phrase. */
const WHITESPACE_RUN = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r\n', '\u00A0', '\u2003'), { minLength: 1, maxLength: 3 })
  .map((a) => a.join(''));

const caseMode = fc.constantFrom<'keep' | 'lower' | 'upper' | 'mixed'>('keep', 'lower', 'upper', 'mixed');

function applyCase(s: string, mode: 'keep' | 'lower' | 'upper' | 'mixed'): string {
  switch (mode) {
    case 'keep':
      return s;
    case 'lower':
      return s.toLowerCase();
    case 'upper':
      return s.toUpperCase();
    case 'mixed':
      return [...s].map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase())).join('');
  }
}

/** One phrase from the list, with varied case and word separators. */
export function restrictedPhraseVariant(
  phrases: readonly string[] = DEFAULT_RESTRICTED_PHRASES,
): fc.Arbitrary<{ phrase: string; text: string }> {
  return fc
    .tuple(fc.constantFrom(...phrases), caseMode, fc.array(WHITESPACE_RUN, { minLength: 8, maxLength: 8 }))
    .map(([phrase, mode, seps]) => {
      const words = phrase.split(/\s+/u);
      const joined = words.map((w, i) => (i === 0 ? w : `${seps[i - 1] ?? ' '}${w}`)).join('');
      return { phrase, text: applyCase(joined, mode) };
    });
}

/** The text of `restrictedPhraseVariant`, for use as `renderedPage({ insert })`. */
export function restrictedPhraseText(phrases: readonly string[] = DEFAULT_RESTRICTED_PHRASES): fc.Arbitrary<string> {
  return restrictedPhraseVariant(phrases).map((v) => v.text);
}

/**
 * Extra phrases for "adding an entry to the list makes the detector match it with no
 * code change". Their words are disjoint from the page vocabulary, so the clean page
 * never contains one.
 */
export function extraRestrictedPhrases(): fc.Arbitrary<string[]> {
  return fc.uniqueArray(
    fc.constantFrom('made in Atlantis', 'cheaper than Zephyria', 'zero Orbit tax', 'instead of Quartzland'),
    { minLength: 0, maxLength: 3 },
  );
}
