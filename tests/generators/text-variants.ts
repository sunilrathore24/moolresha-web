/**
 * Small text-variant generators shared by the Content_Check property tests:
 * random case and whitespace runs (space, tab, CR, LF, CRLF, NBSP).
 * Import this file directly; it is not re-exported from `tests/generators/index.ts`.
 */
import fc from 'fast-check';

export type CaseMode = 'keep' | 'upper' | 'lower' | 'title' | 'mixed' | 'random';

export function applyCase(s: string, mode: CaseMode, mask: readonly boolean[] = [true, false]): string {
  switch (mode) {
    case 'keep':
      return s;
    case 'upper':
      return s.toUpperCase();
    case 'lower':
      return s.toLowerCase();
    case 'title':
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    case 'mixed':
      return [...s].map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase())).join('');
    case 'random':
      return [...s].map((ch, i) => (mask[i % mask.length] ? ch.toUpperCase() : ch.toLowerCase())).join('');
  }
}

/** `s` in a random case: kept, upper, lower, title, alternating or random per character. */
export function caseVariant(s: string): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom<CaseMode>('keep', 'upper', 'lower', 'title', 'mixed', 'random'),
      fc.array(fc.boolean(), { minLength: 16, maxLength: 16 }),
    )
    .map(([mode, mask]) => applyCase(s, mode, mask));
}

/** One to three whitespace pieces that all count as a single space in a phrase. */
export const whitespaceRun: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '\r\n', '\u00A0'), { minLength: 1, maxLength: 3 })
  .map((a) => a.join(''));
