/**
 * Shared fast-check arbitraries for the launch-feedback-website tests.
 * Closed-set generators are built from the single-source allow-lists so tests
 * cannot drift from production. Later tasks add generators here or in sibling
 * files in this folder (for example price-ladder.ts).
 */
import fc from 'fast-check';
import { CONCEPT_IDS, VERDICTS, type ConceptId, type Verdict } from '../../src/content/config/allow-lists';

/** One of the five Concept ids. */
export function conceptId(): fc.Arbitrary<ConceptId> {
  return fc.constantFrom(...CONCEPT_IDS);
}

/** One of the three verdicts. */
export function verdict(): fc.Arbitrary<Verdict> {
  return fc.constantFrom(...VERDICTS);
}

/**
 * A subset of `list` (possibly empty, possibly all of it) with no duplicates,
 * in any order. The random order lets tests check that code under test
 * normalises to the canonical order.
 */
export function chipSubset<T>(list: readonly T[]): fc.Arbitrary<T[]> {
  return fc.shuffledSubarray([...list], { minLength: 0, maxLength: list.length });
}

const HTML_SNIPPETS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '</textarea><b>bold</b>',
  '&lt;b&gt;&amp;&#x27;',
  '<svg/onload=alert(1)>',
];

const QUOTE_SNIPPETS = [`"`, `'`, '`', `"'`, `\\"`, `'; DROP TABLE feedback;--`, `" OR "1"="1`];

const CONTROL_CHARS = ['\u0000', '\u0001', '\u0007', '\u0008', '\u000b', '\u000c', '\u001b', '\u007f', '\u0085', '\r\n', '\t', '\n'];

const RTL_AND_BIDI = ['\u200f', '\u200e', '\u202e', '\u202d', '\u202a', '\u202b', '\u202c', '\u2066', '\u2067', '\u2069', 'مرحبا', 'שלום'];

const ZERO_WIDTH = ['\u200b', '\u200c', '\u200d', '\u2060', '\ufeff', '\u00ad'];

const FORMULA_LEADERS = ['=', '+', '-', '@', '\t=', '\r=', "=HYPERLINK(\"http://x\",\"y\")", '=1+1', '@SUM(A1)', '+cmd|calc'];

const EMOJI = ['😀', '🧵', '👨‍👩‍👧‍👦', '🏳️‍🌈', '❤️', '🇮🇳', '👍🏽', '\u{1F9F6}'];

const PII_SNIPPETS = [
  'person@example.com',
  'first.last+tag@sub.example.co.in',
  '+91 98765 43210',
  '098765-43210',
  '9876543210',
  '192.168.0.1',
  '10.0.0.255',
  '2001:db8::1',
];

/** Strings that stress sanitising, escaping, length limits and export code. */
export function nastyString(): fc.Arbitrary<string> {
  const piece = fc.oneof(
    fc.constantFrom(...HTML_SNIPPETS),
    fc.constantFrom(...QUOTE_SNIPPETS),
    fc.constantFrom(...CONTROL_CHARS),
    fc.constantFrom(...RTL_AND_BIDI),
    fc.constantFrom(...ZERO_WIDTH),
    fc.constantFrom(...EMOJI),
    fc.constantFrom(...PII_SNIPPETS),
    fc.emailAddress(),
    fc.ipV4(),
    fc.string({ unit: 'binary', maxLength: 20 }),
  );

  const mixed = fc.array(piece, { minLength: 1, maxLength: 8 }).map((parts) => parts.join(''));
  const formulaLed = fc
    .tuple(fc.constantFrom(...FORMULA_LEADERS), fc.string({ maxLength: 20 }))
    .map(([lead, rest]) => lead + rest);
  const veryLong = fc
    .tuple(fc.constantFrom('a', 'é', '😀', '<', '\u200b', ' '), fc.integer({ min: 1000, max: 20000 }))
    .map(([ch, n]) => ch.repeat(n));
  const edge = fc.constantFrom('', ' ', '   ', '\n', '\u0000', '\u200b');

  return fc.oneof(
    { weight: 6, arbitrary: mixed },
    { weight: 2, arbitrary: formulaLed },
    { weight: 1, arbitrary: veryLong },
    { weight: 1, arbitrary: edge },
  );
}

/** True when `s` has no lone surrogate (it survives UTF-8 and SQLite unchanged). */
export function isWellFormed(s: string): boolean {
  return !/\p{Cs}/u.test(s);
}

/** The longest prefix of `s`, cut on code point boundaries, whose UTF-16 length is at most `maxUnits`. */
export function truncateUnits(s: string, maxUnits: number): string {
  let out = '';
  for (const ch of s) {
    if (out.length + ch.length > maxUnits) break;
    out += ch;
  }
  return out;
}

/**
 * Well-formed Unicode text of at most `maxUnits` UTF-16 code units (the schema counts string length).
 * Mixes plain graphemes with the nasty strings (markup, quotes, control characters, bidi, zero-width,
 * emoji, formula leaders). May be empty unless `nonEmpty` is set.
 */
export function wellFormedText(options: { maxUnits?: number; nonEmpty?: boolean } = {}): fc.Arbitrary<string> {
  const maxUnits = options.maxUnits ?? 200;
  const arb = fc
    .oneof(
      fc.string({ unit: 'grapheme', maxLength: 60 }),
      fc.string({ unit: 'grapheme-composite', maxLength: 30 }),
      nastyString(),
    )
    .map((s) => truncateUnits(s, maxUnits))
    .filter(isWellFormed);
  return options.nonEmpty ? arb.filter((s) => s.length > 0) : arb;
}
