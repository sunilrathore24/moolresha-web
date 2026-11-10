/**
 * fast-check generators for Fact_Registry entries (CC-01 Property 16, CC-02 Property 17).
 *
 * `completeFact()` yields a valid entry for any of the five Claim_Labels.
 * `incompleteFact()` yields a valid entry with exactly one required field removed or
 * blanked, tagged with the mutation and the phrase the CC-01 message must contain.
 * Entries are plain objects (as CC-01 receives them), not parsed through Zod.
 */
import fc from 'fast-check';
import { CLAIM_LABELS, SOURCED_LABELS, STRENGTHS } from '../../src/lib/fact-schema';
import { SAFE_WORDS } from './rendered-page';

export type RawFact = Record<string, unknown> & { id: string };

export const factId: fc.Arbitrary<string> = fc.stringMatching(/^[a-z][a-z0-9]{2,9}$/);

const sentence = fc
  .array(fc.constantFrom(...SAFE_WORDS), { minLength: 2, maxLength: 6 })
  .map((ws) => `${ws.join(' ')}.`);

const isoDate = fc
  .tuple(fc.integer({ min: 2020, max: 2030 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

const source = fc.record({
  name: fc.constantFrom('PIB', 'Textile Ministry', 'Cotton Board', 'Mill report'),
  url: fc.stringMatching(/^[a-z]{3,10}$/).map((p) => `https://example.org/${p}`),
  date: fc.constantFrom('September 2025', '2024', 'March 2026'),
});

const methodNote = fc
  .record({
    listings: fc.integer({ min: 1, max: 60 }),
    a: isoDate,
    b: isoDate,
    channels: fc.shuffledSubarray(['online marketplaces', 'brand sites', 'mall high-street'], { minLength: 1 }),
  })
  .map(({ listings, a, b, channels }) => ({ listings, from: a < b ? a : b, to: a < b ? b : a, channels }));

/** A valid entry of a given label (or any label when none is given). */
export function completeFact(
  labels: readonly (typeof CLAIM_LABELS)[number][] = CLAIM_LABELS,
): fc.Arbitrary<RawFact> {
  return fc
    .record({
      id: factId,
      text: sentence,
      strength: fc.constantFrom(...STRENGTHS),
      lastChecked: isoDate,
      label: fc.constantFrom(...labels),
      section: fc.constantFrom('journey', 'money', 'trends', 'other'),
      source,
      assumptions: fc.array(sentence, { minLength: 1, maxLength: 3 }),
      methodNote,
    })
    .map((r) => {
      const base = {
        id: r.id,
        label: r.label,
        text: r.text,
        strength: r.strength,
        lastChecked: r.lastChecked,
        verifyFlag: false,
        substantiates: [] as string[],
        section: r.section,
      };
      if ((SOURCED_LABELS as readonly string[]).includes(r.label)) return { ...base, source: r.source };
      if (r.label === 'MoolResha estimate') return { ...base, assumptions: r.assumptions };
      return { ...base, methodNote: r.methodNote };
    });
}

export interface FactMutation {
  tag: string;
  /** Text the CC-01 message for this mutation must contain. */
  problem: string;
  apply: (entry: RawFact) => RawFact;
}

function without(entry: RawFact, key: string): RawFact {
  const { [key]: _drop, ...rest } = entry;
  return rest as RawFact;
}

function withSource(entry: RawFact, patch: (s: Record<string, unknown>) => Record<string, unknown>): RawFact {
  return { ...entry, source: patch({ ...(entry.source as Record<string, unknown>) }) };
}

function omitKey(o: Record<string, unknown>, key: string): Record<string, unknown> {
  const { [key]: _drop, ...rest } = o;
  return rest;
}

const COMMON: FactMutation[] = [
  { tag: 'no-label', problem: 'Claim_Label', apply: (e) => without(e, 'label') },
  { tag: 'unknown-label', problem: 'Claim_Label', apply: (e) => ({ ...e, label: 'MADE UP LABEL' }) },
  { tag: 'no-last-checked', problem: 'last-checked', apply: (e) => without(e, 'lastChecked') },
  { tag: 'empty-last-checked', problem: 'last-checked', apply: (e) => ({ ...e, lastChecked: '' }) },
  { tag: 'blank-last-checked', problem: 'last-checked', apply: (e) => ({ ...e, lastChecked: '   ' }) },
];

const SOURCED: FactMutation[] = [
  { tag: 'no-source', problem: 'Source_Link', apply: (e) => without(e, 'source') },
  { tag: 'source-no-name', problem: 'Source_Link', apply: (e) => withSource(e, (s) => omitKey(s, 'name')) },
  { tag: 'source-empty-name', problem: 'Source_Link', apply: (e) => withSource(e, (s) => ({ ...s, name: '' })) },
  { tag: 'source-no-url', problem: 'Source_Link', apply: (e) => withSource(e, (s) => omitKey(s, 'url')) },
  { tag: 'source-empty-url', problem: 'Source_Link', apply: (e) => withSource(e, (s) => ({ ...s, url: ' ' })) },
  { tag: 'source-no-date', problem: 'Source_Link', apply: (e) => withSource(e, (s) => omitKey(s, 'date')) },
  { tag: 'source-empty-date', problem: 'Source_Link', apply: (e) => withSource(e, (s) => ({ ...s, date: '' })) },
];

const ESTIMATE: FactMutation[] = [
  { tag: 'no-assumptions', problem: 'assumptions', apply: (e) => without(e, 'assumptions') },
  { tag: 'empty-assumptions', problem: 'assumptions', apply: (e) => ({ ...e, assumptions: [] }) },
];

const SCAN: FactMutation[] = [
  { tag: 'no-method-note', problem: 'method note', apply: (e) => without(e, 'methodNote') },
];

/** The mutations that apply to an entry with this label, in a fixed order. */
export function mutationsFor(label: string): FactMutation[] {
  if ((SOURCED_LABELS as readonly string[]).includes(label)) return [...COMMON, ...SOURCED];
  if (label === 'MoolResha estimate') return [...COMMON, ...ESTIMATE];
  return [...COMMON, ...SCAN];
}

export interface IncompleteFact {
  /** The id of the entry; CC-01 must name it. */
  id: string;
  mutation: FactMutation;
  entry: RawFact;
}

/** A valid entry with one required field removed for its label. */
export function incompleteFact(): fc.Arbitrary<IncompleteFact> {
  return fc.tuple(completeFact(), fc.nat()).map(([entry, pick]) => {
    const options = mutationsFor(String(entry.label));
    const mutation = options[pick % options.length]!;
    return { id: entry.id, mutation, entry: mutation.apply(entry) };
  });
}
