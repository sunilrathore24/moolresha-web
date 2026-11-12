/**
 * Header search box (2026-11): typing a few words and pressing Enter navigates straight to
 * the best-matching Concept's detail page, or to the homepage if nothing matches well enough
 * — per explicit instruction, this never lands anywhere else (no results page, no error state).
 *
 * Matching is keyword-based, not a real search index: each Concept has a short, hand-written
 * list of words someone would plausibly type for it (its fabric, garment type, "pure"/"blend"
 * etc.). A query word counts as a hit on a keyword if it's an exact match, a substring either
 * way (so a partial word like "cott" still hits "cotton"), or it's a known misheard/typo'd
 * spelling of that keyword (SYNONYMS below — e.g. "shut" for "shirt"). A generic edit-distance
 * fuzzy match was tried first and dropped: at a threshold loose enough to catch "lean" for
 * "linen", it also falsely matched unrelated same-length words like "pant" for "pure". An
 * explicit, small synonym list is more predictable than tuning a distance threshold by hand.
 *
 * A Concept's score is hits / its own keyword count (a ratio, not a raw count), so a short,
 * specific list (e.g. "linen shirt" — 3 keywords) wins over a longer, more general one (e.g.
 * "cotton linen shirt" — 4 keywords) when a query hits both equally, rather than the longer
 * list always winning just by having more chances to match.
 *
 * Plain TypeScript, no Astro import, so Vitest can load it directly.
 */
import { CONCEPT_IDS, type ConceptId } from '../content/config/allow-lists';

const KEYWORDS: Record<ConceptId, readonly string[]> = {
  'mens-cotton-shirt': ['cotton', 'shirt', 'rootweave', 'dobby', 'diamond', 'textured'],
  'mens-cotton-linen-shirt': ['cotton', 'linen', 'blend', 'shirt'],
  'mens-linen-shirt': ['linen', 'shirt', 'pure'],
  'mens-relaxed-pant': ['cotton', 'pant', 'pants', 'trouser', 'trousers', 'relaxed'],
  'womens-coord-set': ['cotton', 'coord', 'cord', 'set', 'women', 'womens'],
};

const STOPWORDS: ReadonlySet<string> = new Set([
  'and',
  'the',
  'a',
  'an',
  'for',
  'of',
  'design',
  'designs',
  'concept',
]);

/** Known misheard/typo'd spellings, e.g. from voice input — maps a keyword to the alternate
 * words that should still count as hitting it. Deliberately a short, explicit list rather than
 * a generic fuzzy-distance match (see the header comment on why). */
const SYNONYMS: Record<string, readonly string[]> = {
  linen: ['lean', 'lenin', 'linin'],
  shirt: ['shut', 'shirts'],
  cotton: ['cotten', 'caughton'],
  relaxed: ['relax'],
  trouser: ['trousers'],
  coord: ['cord', 'chord'],
};

/** True when a typed word counts as a hit on one of a Concept's keywords. */
function wordsMatch(query: string, keyword: string): boolean {
  if (query === keyword) return true;
  if (query.length >= 3 && keyword.includes(query)) return true;
  if (keyword.length >= 3 && query.includes(keyword)) return true;
  return (SYNONYMS[keyword] ?? []).includes(query);
}

/** Splits and normalises free text into the words `matchConcept` scores against. */
export function queryWords(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

/**
 * The best-matching Concept for free text, or `null` when nothing scores — the caller sends
 * `null` to the homepage, never to a dead end.
 */
export function matchConcept(rawQuery: string): ConceptId | null {
  const words = queryWords(rawQuery);
  if (words.length === 0) return null;

  let best: { id: ConceptId; score: number } | null = null;
  for (const id of CONCEPT_IDS) {
    const keywords = KEYWORDS[id];
    const hits = words.filter((w) => keywords.some((k) => wordsMatch(w, k))).length;
    if (hits === 0) continue;
    const score = hits / keywords.length;
    if (!best || score > best.score) best = { id, score };
  }
  return best?.id ?? null;
}
