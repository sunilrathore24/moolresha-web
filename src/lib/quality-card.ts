/**
 * Pure Quality_Card rule checks (Requirements 8C.1 to 8C.3, 8C.5 to 8C.8).
 *
 * `checkQualityCard` takes `unknown[]` so it can be tested on raw, unparsed rows,
 * including rows the Zod schema would reject. Every issue except a wrong row
 * count names the row it belongs to. CC-18 and CC-19 call these functions, and
 * so do the Concept schema tests.
 *
 * No Astro imports.
 */
import { QUALITY_LABELS, QUALITY_ROWS, type QualityRowId } from './concept-schema';
import { CLAIM_LABELS, SOURCED_LABELS, type FactEntry } from './fact-schema';

export type QualityIssue =
  /** Wrong row count, a missing, duplicated or misplaced row, or a row text that is not one line. `row` names the row when one is affected. */
  | { kind: 'rows'; detail: string; row?: QualityRowId }
  | { kind: 'missing_label'; row: QualityRowId }
  /** A FACT row with no `factId`, or a `factId` that is not in the registry. */
  | { kind: 'fact_missing'; row: QualityRowId }
  /** A FACT row whose entry is not labelled `FACT`, or a non-FACT row that carries a `factId`. */
  | { kind: 'fact_not_fact_label'; row: QualityRowId }
  /** A FACT row whose entry fails the Requirement 3.6 completeness rules (CC-01). */
  | { kind: 'fact_incomplete'; row: QualityRowId }
  | { kind: 'test_missing'; row: QualityRowId }
  | { kind: 'exact_spec_without_fact'; row: QualityRowId; value: string }
  | { kind: 'range_not_target'; row: QualityRowId; value: string };

export interface SpecValue {
  /** The matched text, for example `140 GSM` or `30s–40s`. */
  value: string;
  kind: 'gsm' | 'count';
  /** True when two numbers are joined by a dash, `to` or `/` with a unit. `40/1` is a single count. */
  isRange: boolean;
}

/* ---------- Fact completeness (Requirement 3.6) ---------- */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * Why a registry entry fails the Requirement 3.6 rules, or `null` when it is complete:
 * a Claim_Label, a Source_Link (sourced labels), assumptions (`MoolResha estimate`),
 * a method note (`MoolResha market scan`) and a last-checked date.
 */
export function factEntryProblem(entry: unknown): string | null {
  if (!isRecord(entry)) return 'entry is not an object';
  const label = entry.label;
  if (typeof label !== 'string' || !(CLAIM_LABELS as readonly string[]).includes(label)) {
    return 'no Claim_Label';
  }
  if (!isNonEmptyString(entry.lastChecked)) return 'no last-checked date';
  if ((SOURCED_LABELS as readonly string[]).includes(label)) {
    const s = entry.source;
    if (!isRecord(s) || !isNonEmptyString(s.name) || !isNonEmptyString(s.url) || !isNonEmptyString(s.date)) {
      return 'no Source_Link';
    }
  } else if (label === 'MoolResha estimate') {
    if (!Array.isArray(entry.assumptions) || entry.assumptions.length === 0) return 'no stated assumptions';
  } else if (label === 'MoolResha market scan') {
    if (!isRecord(entry.methodNote)) return 'no method note';
  }
  return null;
}

/* ---------- Spec values (GSM and yarn counts) ---------- */

const NUM = String.raw`\d{1,4}(?:\.\d+)?`;
const NUM3 = String.raw`\d{1,3}(?:\.\d+)?`;
const DASH = String.raw`[-\u2010-\u2015\u2212]`;
/** Range separators: a dash, "to", and (only where a unit follows) a slash. */
const SEP = String.raw`(?:\s*${DASH}\s*|\s+to\s+)`;
const SEP_SLASH = String.raw`(?:\s*${DASH}\s*|\s+to\s+|\s*\/\s*)`;
const GSM_UNIT = String.raw`(?:gsm|g\s*\/\s*m(?:²|2|\^2))`;
const START = String.raw`(?<![\p{L}\p{N}]|\d[.,])`;
const END = String.raw`(?![\p{L}\p{N}])`;

interface Pattern {
  re: RegExp;
  kind: 'gsm' | 'count';
  /** Decides from the match whether this is a range, or `null` to reject the match. */
  classify: (m: RegExpMatchArray) => boolean | null;
}

/** A slash only counts as a range separator when the second number is larger (`130/150 GSM`, not `40/1`). */
function slashRange(m: RegExpMatchArray, sepIdx: number, aIdx: number, bIdx: number): boolean | null {
  const sep = m[sepIdx] ?? '';
  if (sep.includes('/') && !(Number(m[bIdx]) > Number(m[aIdx]))) return null;
  return true;
}

const PATTERNS: Pattern[] = [
  // Ranges first, so the single-value patterns never split them.
  {
    kind: 'gsm',
    re: new RegExp(String.raw`${START}(${NUM})\s*(?:${GSM_UNIT})?(${SEP_SLASH})(${NUM})\s*${GSM_UNIT}${END}`, 'giu'),
    classify: (m) => slashRange(m, 2, 1, 3),
  },
  {
    kind: 'count',
    re: new RegExp(String.raw`${START}(${NUM3})(${SEP_SLASH})(${NUM3})\s*-?\s*counts?${END}`, 'giu'),
    classify: (m) => slashRange(m, 2, 1, 3),
  },
  {
    kind: 'count',
    re: new RegExp(String.raw`${START}(${NUM3})s?(${SEP_SLASH})(${NUM3})s${END}`, 'giu'),
    classify: (m) => slashRange(m, 2, 1, 3),
  },
  {
    kind: 'count',
    re: new RegExp(String.raw`(?<![\p{L}])Ne\.?\s*(${NUM3})(?:(${SEP})(${NUM3}))?${END}`, 'giu'),
    classify: (m) => m[2] !== undefined,
  },
  // Single values.
  {
    kind: 'gsm',
    re: new RegExp(String.raw`${START}(${NUM})\s*${GSM_UNIT}${END}`, 'giu'),
    classify: () => false,
  },
  {
    kind: 'count',
    re: new RegExp(String.raw`${START}(${NUM3})\s*-?\s*counts?${END}`, 'giu'),
    classify: () => false,
  },
  {
    kind: 'count',
    re: new RegExp(String.raw`${START}(${NUM3})s${END}`, 'giu'),
    classify: () => false,
  },
  // `40/1`: a count with a ply, never a range.
  {
    kind: 'count',
    re: new RegExp(String.raw`${START}(\d{2,3})\/([1-9])(?![\/\p{L}\p{N}])`, 'giu'),
    classify: () => false,
  },
];

/**
 * Find yarn counts and fabric weights in free text: `140 GSM`, `140gsm`, `140 g/m²`,
 * `140 g/m2`, `40s`, `40 count`, `Ne 40`, `40/1`, and ranges such as `130–150 GSM`,
 * `130 to 150 GSM` or `30s–40s`. Results are in text order.
 */
export function findSpecValues(text: string): SpecValue[] {
  const found: (SpecValue & { index: number; end: number })[] = [];
  for (const { re, kind, classify } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const index = m.index ?? 0;
      const end = index + m[0].length;
      if (found.some((f) => index < f.end && f.index < end)) continue; // inside an earlier match
      const isRange = classify(m);
      if (isRange === null) continue;
      found.push({ value: m[0], kind, isRange, index, end });
    }
  }
  return found
    .sort((a, b) => a.index - b.index)
    .map(({ value, kind, isRange }) => ({ value, kind, isRange }));
}

/* ---------- Quality_Card checks ---------- */

const isRowId = (v: unknown): v is QualityRowId =>
  typeof v === 'string' && (QUALITY_ROWS as readonly string[]).includes(v);

function structureIssues(rows: readonly unknown[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const ids = rows.map((r) => (isRecord(r) && isRowId(r.row) ? r.row : null));

  if (rows.length !== QUALITY_ROWS.length) {
    issues.push({ kind: 'rows', detail: `expected ${QUALITY_ROWS.length} rows, found ${rows.length}` });
  }
  for (const id of QUALITY_ROWS) {
    const n = ids.filter((x) => x === id).length;
    if (n === 0) issues.push({ kind: 'rows', row: id, detail: `row "${id}" is missing` });
    if (n > 1) issues.push({ kind: 'rows', row: id, detail: `row "${id}" appears ${n} times` });
  }
  const unknownCount = ids.filter((x) => x === null).length;
  if (unknownCount > 0) issues.push({ kind: 'rows', detail: `${unknownCount} entries are not a known row` });

  // Right rows, wrong order.
  const sameSet = rows.length === QUALITY_ROWS.length && QUALITY_ROWS.every((id) => ids.includes(id));
  if (sameSet) {
    QUALITY_ROWS.forEach((id, i) => {
      if (ids[i] !== id) issues.push({ kind: 'rows', row: id, detail: `row "${id}" is out of order` });
    });
  }
  return issues;
}

/**
 * Check a Quality_Card against the Fact_Registry. Returns `[]` for a valid card.
 *
 * - Exactly the seven rows, in order (8C.1).
 * - Each row has one known label and one line of text (8C.2).
 * - A `FACT` row names a complete registry entry labelled `FACT` (8C.3, 8C.8).
 * - A `WeWillTest` row states what is tested and what is published (8C.5, 8C.8).
 * - A non-FACT row does not carry a `factId`.
 * - A single exact yarn count or GSM needs a `FACT` row backed by an existing `FACT` entry (8C.7).
 * - A range needs a `Target` or `FACT` row (8C.6).
 */
export function checkQualityCard(rows: unknown[], facts: Map<string, FactEntry>): QualityIssue[] {
  const issues: QualityIssue[] = structureIssues(rows);

  rows.forEach((raw, index) => {
    if (!isRecord(raw)) return; // already reported by the structure check
    const row: QualityRowId | undefined = isRowId(raw.row) ? raw.row : QUALITY_ROWS[index];
    if (!row) return;

    const label = raw.label;
    const knownLabel = typeof label === 'string' && (QUALITY_LABELS as readonly string[]).includes(label);
    if (!knownLabel) issues.push({ kind: 'missing_label', row });

    // FACT rows
    const factId = raw.factId;
    const entry = isNonEmptyString(factId) ? facts.get(factId) : undefined;
    if (label === 'FACT') {
      if (!entry) {
        issues.push({ kind: 'fact_missing', row });
      } else if (entry.label !== 'FACT') {
        issues.push({ kind: 'fact_not_fact_label', row });
      } else if (factEntryProblem(entry) !== null) {
        issues.push({ kind: 'fact_incomplete', row });
      }
    } else if (knownLabel && factId !== undefined) {
      issues.push({ kind: 'fact_not_fact_label', row });
    }

    // We'll test rows
    if (label === 'WeWillTest') {
      const t = raw.test;
      if (!isRecord(t) || !isNonEmptyString(t.what) || !isNonEmptyString(t.publish)) {
        issues.push({ kind: 'test_missing', row });
      }
    }

    // One line of text
    if (raw.text !== undefined && (typeof raw.text !== 'string' || /[\r\n]/.test(raw.text))) {
      issues.push({ kind: 'rows', row, detail: `row "${row}" text must be one line` });
    }

    // Exact yarn counts and GSM
    if (typeof raw.text === 'string') {
      const backed = label === 'FACT' && entry?.label === 'FACT';
      const mayShowRange = label === 'Target' || label === 'FACT';
      for (const spec of findSpecValues(raw.text)) {
        if (!spec.isRange && !backed) {
          issues.push({ kind: 'exact_spec_without_fact', row, value: spec.value });
        }
        if (spec.isRange && !mayShowRange) {
          issues.push({ kind: 'range_not_target', row, value: spec.value });
        }
      }
    }
  });

  return issues;
}
