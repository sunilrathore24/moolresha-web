import { describe, expect, it } from 'vitest';
import {
  nextAnswered,
  parseAnswered,
  serialiseAnswered,
  shouldReveal,
  type SubmitOutcome,
} from '../../src/islands/market-reveal';
import { CONCEPT_IDS, type ConceptId } from '../../src/content/config/allow-lists';
import fc from 'fast-check';
import { revealScenario } from '../generators/reveal-scenario';

const SHIRT: ConceptId = 'mens-cotton-shirt';
const PANT: ConceptId = 'mens-relaxed-pant';
const empty = () => new Set<ConceptId>();
const outcome = (o: Partial<SubmitOutcome>): SubmitOutcome => ({
  conceptId: SHIRT,
  ok: true,
  price: 'band',
  ...o,
});

describe('serialiseAnswered / parseAnswered', () => {
  it('round-trips every subset of known ids', () => {
    for (const ids of [[], [SHIRT], [PANT, SHIRT], [...CONCEPT_IDS]]) {
      const s = new Set<ConceptId>(ids);
      expect(parseAnswered(serialiseAnswered(s))).toEqual(s);
    }
  });

  it('serialises as a sorted JSON array regardless of insertion order', () => {
    const a = serialiseAnswered(new Set<ConceptId>([PANT, SHIRT]));
    const b = serialiseAnswered(new Set<ConceptId>([SHIRT, PANT]));
    expect(a).toBe(b);
    expect(JSON.parse(a)).toEqual([...JSON.parse(a)].sort());
  });

  it('returns an empty set for absent, garbled or non-array values', () => {
    for (const raw of [null, '', '[', 'not json', '{"a":1}', 'null', '42', '"mens-cotton-shirt"']) {
      expect(parseAnswered(raw).size).toBe(0);
    }
  });

  it('drops unknown ids and non-string items but keeps known ids', () => {
    const raw = JSON.stringify([SHIRT, 'mens-sock', 7, null, { id: PANT }, PANT]);
    expect(parseAnswered(raw)).toEqual(new Set([SHIRT, PANT]));
  });
});

describe('union of session and local storage', () => {
  it('reveals a Concept found in either storage', () => {
    const session = parseAnswered(JSON.stringify([SHIRT]));
    const local = parseAnswered(JSON.stringify([PANT, 'unknown']));
    const start = new Set<ConceptId>([...session, ...local]);
    expect(shouldReveal(SHIRT, start)).toBe(true);
    expect(shouldReveal(PANT, start)).toBe(true);
    expect(shouldReveal('womens-coord-set', start)).toBe(false);
  });

  it('still uses the valid storage when the other one is garbled', () => {
    const start = new Set<ConceptId>([...parseAnswered('garbage'), ...parseAnswered(JSON.stringify([SHIRT]))]);
    expect([...start]).toEqual([SHIRT]);
  });
});

describe('revealScenario generator', () => {
  it('produces scenarios that the module handles without throwing', () => {
    for (const sc of fc.sample(revealScenario(), 200)) {
      const start = new Set<ConceptId>([...parseAnswered(sc.session), ...parseAnswered(sc.local)]);
      const end = sc.outcomes.reduce(nextAnswered, start);
      for (const id of start) expect(shouldReveal(id, end)).toBe(true);
      expect(parseAnswered(serialiseAnswered(end))).toEqual(end);
    }
  });
});

describe('nextAnswered', () => {
  it('does not add the Concept after a non-ok response', () => {
    for (const price of ['band', 'skip', 'none'] as const) {
      const s = nextAnswered(empty(), outcome({ ok: false, price }));
      expect(shouldReveal(SHIRT, s)).toBe(false);
    }
  });

  it('does not add the Concept after an ok response with no price answer', () => {
    const s = nextAnswered(empty(), outcome({ ok: true, price: 'none' }));
    expect(shouldReveal(SHIRT, s)).toBe(false);
  });

  it('adds the Concept after an ok response with a band', () => {
    expect(shouldReveal(SHIRT, nextAnswered(empty(), outcome({ price: 'band' })))).toBe(true);
  });

  it('adds the Concept after an ok response with a skip', () => {
    expect(shouldReveal(SHIRT, nextAnswered(empty(), outcome({ price: 'skip' })))).toBe(true);
  });

  it('reveals only the answered Concept', () => {
    const s = nextAnswered(empty(), outcome({ conceptId: SHIRT }));
    expect(shouldReveal(PANT, s)).toBe(false);
  });

  it('keeps an already revealed Concept after a later submission without a price', () => {
    const revealed = nextAnswered(empty(), outcome({ price: 'band' }));
    const after = nextAnswered(revealed, outcome({ ok: false, price: 'none' }));
    expect(shouldReveal(SHIRT, after)).toBe(true);
  });

  it('does not change the input set', () => {
    const start = empty();
    nextAnswered(start, outcome({}));
    expect(start.size).toBe(0);
  });
});
