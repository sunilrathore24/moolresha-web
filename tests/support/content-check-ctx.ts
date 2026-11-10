/**
 * Helpers for building a partial `CheckContext` in tests. Rules read only some fields,
 * so a test passes just the fields it needs; the rest default to empty values.
 */
import type { CheckContext } from '../../src/lib/content-rules/types';
import type { FactEntry } from '../../src/lib/fact-schema';
import { loadWordRules } from '../../src/lib/word-rules-schema';

/** The real `word-rules.yaml`, loaded once. */
export const REAL_WORD_RULES = loadWordRules();

export function makeCtx(over: Partial<CheckContext> = {}): CheckContext {
  return {
    facts: [],
    concepts: [],
    priceLayers: {},
    story: {},
    marketScans: [],
    blocklist: [],
    wordRules: REAL_WORD_RULES,
    pages: [],
    distFiles: [],
    ...over,
  } as unknown as CheckContext;
}

const BASE = {
  text: 'A sentence.',
  strength: 'STRONG',
  lastChecked: '2026-01-01',
  verifyFlag: false,
  substantiates: [] as string[],
  section: 'other',
};

/** A `FACT` entry with a `source`. */
export function sourcedFact(id: string, over: Record<string, unknown> = {}): FactEntry {
  return {
    ...BASE,
    id,
    label: 'FACT',
    source: { name: 'Source', url: 'https://example.org/x', date: '2025-09' },
    ...over,
  } as unknown as FactEntry;
}

/** A `MoolResha estimate` entry: assumptions, no `source`. */
export function estimateFact(id: string, over: Record<string, unknown> = {}): FactEntry {
  return { ...BASE, id, label: 'MoolResha estimate', assumptions: ['an assumption'], ...over } as unknown as FactEntry;
}

/** A `MoolResha market scan` entry: method note, no `source`. */
export function scanFact(id: string, over: Record<string, unknown> = {}): FactEntry {
  return {
    ...BASE,
    id,
    label: 'MoolResha market scan',
    methodNote: { listings: 3, from: '2026-01-01', to: '2026-02-01', channels: ['brand sites'] },
    ...over,
  } as unknown as FactEntry;
}
