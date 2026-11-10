/**
 * fast-check generators for Quality_Cards (used by Properties 44 and 45).
 *
 * `qualityRows()` yields a valid seven-row card, the generated Fact_Registry it
 * points at, and an optional tagged mutation. For each mutation the result says
 * which issue kind `checkQualityCard` must report and which row it must name.
 * Rows are plain objects (not parsed by Zod), so mutations can break the schema.
 *
 * `specInsertion()` and `qualityRowsWithSpec()` insert yarn counts and GSM values
 * in every form Property 45 lists.
 */
import fc from 'fast-check';
import { QUALITY_ROWS, type QualityRowId } from '../../src/lib/concept-schema';
import type { FactEntry } from '../../src/lib/fact-schema';
import type { QualityIssue } from '../../src/lib/quality-card';

type Row = Record<string, unknown>;

/** Ids of the generated registry entries. */
export const FACT_IDS = ['gen-fact-a', 'gen-fact-b', 'gen-fact-c'] as const;
/** A complete entry that is not labelled FACT (for `fact_not_fact_label`). */
export const ESTIMATE_ID = 'gen-estimate';

export const MUTATION_TAGS = [
  'row_removed',
  'row_duplicated',
  'rows_swapped',
  'label_removed',
  'label_unknown',
  'fact_no_id',
  'fact_unknown_id',
  'fact_not_fact_label',
  'fact_incomplete',
  'test_removed',
  'test_what_empty',
  'test_publish_empty',
  'target_with_fact_id',
  'text_line_break',
] as const;
export type QualityMutationTag = (typeof MUTATION_TAGS)[number];

export interface QualityMutation {
  tag: QualityMutationTag;
  /** The issue kind that must be reported. */
  expected: QualityIssue['kind'];
  /** Rows the matching issue may name; at least one reported issue of `expected` kind must name one of them. */
  rows: QualityRowId[];
}

export interface GeneratedCard {
  rows: unknown[];
  facts: Map<string, FactEntry>;
  /** Undefined for the unmutated (valid) card. */
  mutation?: QualityMutation;
}

/* ---------- Fact registry ---------- */

function factEntry(id: string): FactEntry {
  return {
    id,
    label: 'FACT',
    text: `Generated fact ${id}.`,
    source: { name: 'Generated source', url: 'https://example.org/source', date: '2025' },
    strength: 'MODERATE',
    lastChecked: '2026-11-07',
    verifyFlag: false,
    substantiates: [],
    section: 'other',
  };
}

function estimateEntry(): FactEntry {
  return {
    id: ESTIMATE_ID,
    label: 'MoolResha estimate',
    text: 'Generated estimate.',
    assumptions: ['generated assumption'],
    strength: 'WEAK',
    lastChecked: '2026-11-07',
    verifyFlag: false,
    substantiates: [],
    section: 'other',
  };
}

function registry(): Map<string, FactEntry> {
  const m = new Map<string, FactEntry>();
  for (const id of FACT_IDS) m.set(id, factEntry(id));
  m.set(ESTIMATE_ID, estimateEntry());
  return m;
}

/* ---------- Rows ---------- */

/** Row text with no yarn count or GSM in it. */
const PLAIN_TEXT = [
  'Smooth hand feel that breathes in warm weather',
  'Pre-washed to limit shrinkage',
  'Plain weave, light to mid weight',
  'Machine wash cold, dry in shade',
  'Cotton yarn, finer count to be confirmed with our mill',
  'Colour, pilling and seams over time',
];

const plainText = fc.constantFrom(...PLAIN_TEXT);

const testShape = fc.record({
  what: fc.constantFrom('length and width after five washes', 'colour after repeated washes'),
  publish: fc.constantFrom('the measurements', 'photos after each round'),
});

type Kind = 'FACT' | 'Target' | 'WeWillTest';

function buildRow(row: QualityRowId, kind: Kind, text: string, factId: string, test: Row, range: Row | null): Row {
  switch (kind) {
    case 'FACT':
      return { row, label: 'FACT', text: '', factId };
    case 'WeWillTest':
      return { row, label: 'WeWillTest', text, test };
    case 'Target':
      return range ? { row, label: 'Target', text, range } : { row, label: 'Target', text };
  }
}

const rangeShape = fc
  .tuple(fc.constantFrom('gsm', 'count'), fc.integer({ min: 20, max: 300 }), fc.integer({ min: 1, max: 80 }))
  .map(([kind, min, extra]) => ({ kind, min, max: min + extra }));

function rowArb(row: QualityRowId): fc.Arbitrary<Row> {
  return fc
    .tuple(
      fc.constantFrom<Kind>('FACT', 'Target', 'WeWillTest'),
      plainText,
      fc.constantFrom(...FACT_IDS),
      testShape,
      fc.option(rangeShape, { nil: null }),
    )
    .map(([kind, text, factId, test, range]) => buildRow(row, kind, text, factId, test, range));
}

/** A valid seven-row card (as plain objects, in order). */
function validRows(): fc.Arbitrary<Row[]> {
  return fc.tuple(...QUALITY_ROWS.map(rowArb)) as unknown as fc.Arbitrary<Row[]>;
}

/* ---------- Mutations ---------- */

function indexOfKind(rows: Row[], kind: Kind, pick: number): number {
  const idx = rows.flatMap((r, i) => (r.label === kind ? [i] : []));
  return idx.length === 0 ? -1 : (idx[pick % idx.length] as number);
}

/**
 * Applies one tagged mutation to a copy of a valid card. When the card has no row of the kind
 * the mutation needs, the row is first turned into one (so every tag can always be applied).
 */
export function applyMutation(
  validCard: readonly Row[],
  tag: QualityMutationTag,
  pick: number,
  facts: Map<string, FactEntry>,
): GeneratedCard {
  const rows = validCard.map((r) => ({ ...r })) as Row[];
  const reg = new Map(facts);
  const at = pick % rows.length;
  const idOf = (i: number) => (rows[i] as Row).row as QualityRowId;

  const asKind = (i: number, kind: Kind): number => {
    const r = rows[i] as Row;
    if (r.label === kind) return i;
    rows[i] = buildRow(
      idOf(i),
      kind,
      kind === 'FACT' ? '' : 'Pre-washed to limit shrinkage',
      FACT_IDS[0],
      { what: 'colour after repeated washes', publish: 'photos after each round' },
      null,
    );
    return i;
  };

  let mutation: QualityMutation;
  switch (tag) {
    case 'row_removed': {
      const [removed] = rows.splice(at, 1);
      mutation = { tag, expected: 'rows', rows: [(removed as Row).row as QualityRowId] };
      break;
    }
    case 'row_duplicated': {
      rows.splice(at, 0, { ...(rows[at] as Row) });
      mutation = { tag, expected: 'rows', rows: [idOf(at)] };
      break;
    }
    case 'rows_swapped': {
      const i = at % (rows.length - 1);
      [rows[i], rows[i + 1]] = [rows[i + 1] as Row, rows[i] as Row];
      mutation = { tag, expected: 'rows', rows: [idOf(i), idOf(i + 1)] };
      break;
    }
    case 'label_removed': {
      delete (rows[at] as Row).label;
      mutation = { tag, expected: 'missing_label', rows: [idOf(at)] };
      break;
    }
    case 'label_unknown': {
      (rows[at] as Row).label = 'Verified';
      mutation = { tag, expected: 'missing_label', rows: [idOf(at)] };
      break;
    }
    case 'fact_no_id': {
      const i = asKind(at, 'FACT');
      delete (rows[i] as Row).factId;
      mutation = { tag, expected: 'fact_missing', rows: [idOf(i)] };
      break;
    }
    case 'fact_unknown_id': {
      const i = asKind(at, 'FACT');
      (rows[i] as Row).factId = 'gen-no-such-fact';
      mutation = { tag, expected: 'fact_missing', rows: [idOf(i)] };
      break;
    }
    case 'fact_not_fact_label': {
      const i = asKind(at, 'FACT');
      (rows[i] as Row).factId = ESTIMATE_ID;
      mutation = { tag, expected: 'fact_not_fact_label', rows: [idOf(i)] };
      break;
    }
    case 'fact_incomplete': {
      const i = asKind(at, 'FACT');
      const id = (rows[i] as Row).factId as string;
      const { source: _source, ...withoutSource } = reg.get(id) as FactEntry & { source: unknown };
      reg.set(id, withoutSource as unknown as FactEntry);
      mutation = { tag, expected: 'fact_incomplete', rows: [idOf(i)] };
      break;
    }
    case 'test_removed': {
      const i = asKind(at, 'WeWillTest');
      delete (rows[i] as Row).test;
      mutation = { tag, expected: 'test_missing', rows: [idOf(i)] };
      break;
    }
    case 'test_what_empty': {
      const i = asKind(at, 'WeWillTest');
      (rows[i] as Row).test = { what: '', publish: 'photos after each round' };
      mutation = { tag, expected: 'test_missing', rows: [idOf(i)] };
      break;
    }
    case 'test_publish_empty': {
      const i = asKind(at, 'WeWillTest');
      (rows[i] as Row).test = { what: 'colour after repeated washes', publish: '  ' };
      mutation = { tag, expected: 'test_missing', rows: [idOf(i)] };
      break;
    }
    case 'target_with_fact_id': {
      const i = asKind(at, 'Target');
      (rows[i] as Row).factId = FACT_IDS[0];
      // A Target row that cites a fact is reported as fact_not_fact_label (see issues in the task report).
      mutation = { tag, expected: 'fact_not_fact_label', rows: [idOf(i)] };
      break;
    }
    case 'text_line_break': {
      const i = indexOfKind(rows, 'Target', at) >= 0 ? indexOfKind(rows, 'Target', at) : asKind(at, 'Target');
      (rows[i] as Row).text = 'Smooth hand feel\nthat breathes';
      mutation = { tag, expected: 'rows', rows: [idOf(i)] };
      break;
    }
  }
  return { rows, facts: reg, mutation };
}

/** A valid card with a generated registry, plus zero or one tagged mutation. */
export function qualityRows(): fc.Arbitrary<GeneratedCard> {
  return fc
    .tuple(validRows(), fc.option(fc.constantFrom(...MUTATION_TAGS), { nil: undefined }), fc.nat())
    .map(([rows, tag, pick]) => {
      const facts = registry();
      return tag === undefined ? { rows, facts } : applyMutation(rows, tag, pick, facts);
    });
}

/** Only valid cards. */
export function validQualityRows(): fc.Arbitrary<GeneratedCard> {
  return validRows().map((rows) => ({ rows, facts: registry() }));
}

/* ---------- Spec values (Property 45) ---------- */

export interface SpecInsertion {
  /** The inserted value, exactly as it appears in `text`. */
  value: string;
  kind: 'gsm' | 'count';
  isRange: boolean;
  /** A short sentence that contains `value`. */
  text: string;
}

const SINGLE_FORMS: ((n: number) => { value: string; kind: 'gsm' | 'count' })[] = [
  (n) => ({ value: `${n} GSM`, kind: 'gsm' }),
  (n) => ({ value: `${n}gsm`, kind: 'gsm' }),
  (n) => ({ value: `${n} g/m²`, kind: 'gsm' }),
  (n) => ({ value: `${n} g/m2`, kind: 'gsm' }),
  (n) => ({ value: `${n}s`, kind: 'count' }),
  (n) => ({ value: `${n} count`, kind: 'count' }),
  (n) => ({ value: `Ne ${n}`, kind: 'count' }),
  (n) => ({ value: `${n}/1`, kind: 'count' }),
];

const RANGE_FORMS: ((a: number, b: number) => { value: string; kind: 'gsm' | 'count' })[] = [
  (a, b) => ({ value: `${a}–${b} GSM`, kind: 'gsm' }),
  (a, b) => ({ value: `${a}-${b} gsm`, kind: 'gsm' }),
  (a, b) => ({ value: `${a} to ${b} GSM`, kind: 'gsm' }),
  (a, b) => ({ value: `${a}s–${b}s`, kind: 'count' }),
];

const WRAPPERS: ((v: string) => string)[] = [
  (v) => `Fabric of about ${v}`,
  (v) => `${v} cotton poplin`,
  (v) => `Target: ${v}, to be confirmed.`,
  (v) => `Weight ${v}`,
];

export function specInsertion(): fc.Arbitrary<SpecInsertion> {
  const single = fc
    .tuple(fc.integer({ min: 20, max: 300 }), fc.integer({ min: 0, max: SINGLE_FORMS.length - 1 }), fc.integer({ min: 0, max: WRAPPERS.length - 1 }))
    .map(([n, f, w]) => {
      const { value, kind } = (SINGLE_FORMS[f] as (typeof SINGLE_FORMS)[number])(n);
      return { value, kind, isRange: false, text: (WRAPPERS[w] as (typeof WRAPPERS)[number])(value) };
    });
  const range = fc
    .tuple(
      fc.integer({ min: 20, max: 250 }),
      fc.integer({ min: 5, max: 60 }),
      fc.integer({ min: 0, max: RANGE_FORMS.length - 1 }),
      fc.integer({ min: 0, max: WRAPPERS.length - 1 }),
    )
    .map(([a, extra, f, w]) => {
      const { value, kind } = (RANGE_FORMS[f] as (typeof RANGE_FORMS)[number])(a, a + extra);
      return { value, kind, isRange: true, text: (WRAPPERS[w] as (typeof WRAPPERS)[number])(value) };
    });
  return fc.oneof(single, range);
}

export interface CardWithSpec {
  rows: unknown[];
  facts: Map<string, FactEntry>;
  /** The row whose text carries the spec value. */
  row: QualityRowId;
  label: Kind;
  spec: SpecInsertion;
  /** True when the row is a `FACT` row whose entry exists in `facts`. */
  backed: boolean;
}

/** A valid card in which one row's text carries a spec value, with a random label and fact backing. */
export function qualityRowsWithSpec(): fc.Arbitrary<CardWithSpec> {
  return fc
    .tuple(
      validRows(),
      fc.integer({ min: 0, max: QUALITY_ROWS.length - 1 }),
      fc.constantFrom<Kind>('FACT', 'Target', 'WeWillTest'),
      fc.boolean(),
      specInsertion(),
    )
    .map(([base, at, label, factExists, spec]) => {
      const rows = base.map((r) => ({ ...r })) as Row[];
      const id = QUALITY_ROWS[at] as QualityRowId;
      const row: Row =
        label === 'FACT'
          ? { row: id, label, text: spec.text, factId: factExists ? FACT_IDS[0] : 'gen-no-such-fact' }
          : label === 'WeWillTest'
            ? { row: id, label, text: spec.text, test: { what: 'colour after repeated washes', publish: 'photos' } }
            : { row: id, label, text: spec.text };
      rows[at] = row;
      return { rows, facts: registry(), row: id, label, spec, backed: label === 'FACT' && factExists };
    });
}
