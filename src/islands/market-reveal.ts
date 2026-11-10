/**
 * Pure decision logic for revealing a Concept's Market_Price_Context.
 * No DOM, no storage access: the feedback island reads and writes the
 * `mr_price_answered` value and calls these functions.
 *
 * The stored value is a JSON array of Concept ids whose stored feedback holds
 * a Price_Band or a Price_Skip. It never holds the answers themselves.
 */
import { CONCEPT_IDS, type ConceptId } from '../content/config/allow-lists';

/** Name of the key used in both sessionStorage and localStorage. */
export const ANSWERED_KEY = 'mr_price_answered';

export type PriceAnswer = 'band' | 'skip' | 'none';

/** `ok` is true when /api/feedback answered HTTP 200. */
export interface SubmitOutcome {
  conceptId: ConceptId;
  ok: boolean;
  price: PriceAnswer;
}

function isConceptId(value: unknown): value is ConceptId {
  return typeof value === 'string' && (CONCEPT_IDS as readonly string[]).includes(value);
}

/** Bad JSON, non-arrays and unknown ids are ignored. */
export function parseAnswered(raw: string | null): Set<ConceptId> {
  const result = new Set<ConceptId>();
  if (raw === null || raw === undefined) return result;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return result;
  }
  if (!Array.isArray(parsed)) return result;
  for (const item of parsed) {
    if (isConceptId(item)) result.add(item);
  }
  return result;
}

/** Sorted JSON array of ids, so equal sets always serialise identically. */
export function serialiseAnswered(s: Set<ConceptId>): string {
  return JSON.stringify([...s].sort());
}

/**
 * Adds the Concept only when the submission succeeded and carried a
 * Price_Band or a Price_Skip. Returns a new set; the input is not changed.
 * The set only grows.
 */
export function nextAnswered(s: Set<ConceptId>, o: SubmitOutcome): Set<ConceptId> {
  const result = new Set(s);
  if (o.ok && (o.price === 'band' || o.price === 'skip') && isConceptId(o.conceptId)) {
    result.add(o.conceptId);
  }
  return result;
}

export function shouldReveal(conceptId: ConceptId, s: Set<ConceptId>): boolean {
  return s.has(conceptId);
}
