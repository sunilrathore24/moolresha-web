/**
 * Pure view models for FabricNotes.astro and QualityCard.astro
 * (Requirements 8.3, 8.4, 8C.1 to 8C.6).
 *
 * The Astro components only loop over these objects, so the label, note and
 * range wording can be tested without a browser. No Astro imports.
 */
import {
  QUALITY_LABEL_TEXT,
  QUALITY_ROW_NAMES,
  type FabricNotesData,
  type QualityCardData,
  type QualityLabel,
  type QualityRowData,
  type QualityRowId,
} from './concept-schema';

/**
 * The note every Target row shows (Requirement 8C.4). Kept equal to
 * `TARGET_NOTE` in `content-rules/story-quality-rules.ts` by a unit test; it is
 * repeated here so the component does not import the Content_Check rules.
 */
export const TARGET_NOTE_TEXT = 'Target spec, to be confirmed with our mill';

/** Link text and target of the "How we check this" link (Requirement 8C.9). */
export const HOW_WE_CHECK_ID = 'how-we-check';
export const HOW_WE_CHECK_LINK_TEXT = 'How we check this';

type Range = NonNullable<QualityRowData['range']>;

/** "130–150 GSM" for fabric weight, "40s–60s count" for yarn count (Requirement 8C.6). */
export function formatRange(range: Range): string {
  return range.kind === 'gsm'
    ? `${range.min}\u2013${range.max} GSM`
    : `${range.min}s\u2013${range.max}s count`;
}

const stripEndingStops = (s: string): string => s.trim().replace(/[.\s]+$/u, '');

/** "What we'll test: {what}. What we'll publish: {publish}." (Requirement 8C.5). */
export function testText(test: { what: string; publish: string }): string {
  return `What we'll test: ${stripEndingStops(test.what)}. What we'll publish: ${stripEndingStops(test.publish)}.`;
}

export interface QualityRowView {
  row: QualityRowId;
  /** Row name shown in the `<dt>` (Requirement 8C.1). */
  name: string;
  /** The stored label, written to `data-quality-label`. */
  label: QualityLabel;
  /** Visible tag text for Target and We'll test rows. FACT rows show the ClaimLabel instead. */
  labelText: string;
  /** FACT rows only: the registry entry rendered through FactText. */
  factId?: string;
  text: string;
  /** Target rows only. */
  rangeText?: string;
  /** Target rows only: the exact note. */
  note?: string;
  /** We'll test rows only. */
  testText?: string;
}

/** One view per row, in the order given (the Concept schema fixes it to `QUALITY_ROWS`). */
export function qualityRowViews(rows: QualityCardData): QualityRowView[] {
  return rows.map((r): QualityRowView => {
    const view: QualityRowView = {
      row: r.row,
      name: QUALITY_ROW_NAMES[r.row],
      label: r.label,
      labelText: QUALITY_LABEL_TEXT[r.label],
      text: r.text,
    };
    if (r.label === 'FACT' && r.factId) view.factId = r.factId;
    if (r.label === 'Target') {
      view.note = TARGET_NOTE_TEXT;
      if (r.range) view.rangeText = formatRange(r.range);
    }
    if (r.label === 'WeWillTest' && r.test) view.testText = testText(r.test);
    return view;
  });
}

/* ---------- Fabric_Notes ---------- */

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "100% cotton", "88% cotton, 12% linen" (Requirements 8.3, 8.5). */
export function compositionText(parts: FabricNotesData['composition']): string {
  return parts.map((p) => `${p.percent}% ${p.fibre}`).join(', ');
}

export interface FabricNoteItem {
  key: 'composition' | 'yarnQuality' | 'weave' | 'weight' | 'handFeel' | 'softness' | 'care';
  term: string;
  text?: string;
  /** Yarn quality only: rendered through FactText. */
  factId?: string;
}

/**
 * The Fabric_Notes lines in the order of Requirement 8.3. Yarn quality is included
 * only when `yarnQuality.factId` exists (Requirement 8.4).
 */
export function fabricNoteItems(notes: FabricNotesData): FabricNoteItem[] {
  const items: FabricNoteItem[] = [
    { key: 'composition', term: 'Composition', text: compositionText(notes.composition) },
  ];
  if (notes.yarnQuality?.factId) {
    items.push({ key: 'yarnQuality', term: 'Yarn quality', factId: notes.yarnQuality.factId });
  }
  items.push(
    { key: 'weave', term: 'Weave', text: capitalise(notes.weave) },
    { key: 'weight', term: 'Weight', text: capitalise(notes.weight) },
    { key: 'handFeel', term: 'Hand feel', text: capitalise(notes.handFeel) },
    { key: 'softness', term: 'Softness', text: capitalise(notes.softness) },
    { key: 'care', term: 'Care', text: capitalise(notes.care) },
  );
  return items;
}
