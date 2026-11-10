/**
 * Pure data for the Concept feedback form (Requirements 9.1 to 9.6, 9.9, 9.18).
 *
 * Plain TypeScript, no Astro imports, so Vitest and the component share it.
 * The labels are plain words; the values are the allow-list ids the Feedback_API
 * accepts (src/content/config/allow-lists.ts).
 */
import {
  CHANGE_CHIPS,
  PALETTE,
  PRIORITY_CHIPS,
  PRIORITY_LABELS,
  VERDICTS,
  type ChangeChip,
  type PaletteColour,
  type PriorityChip,
  type Verdict,
} from '../content/config/allow-lists';
import { bandLabel, type PriceBand } from './price-bands';

export const VERDICT_LABELS: Record<Verdict, string> = {
  would_wear: 'Would wear',
  maybe: 'Maybe',
  not_for_me: 'Not for me',
};

export const CHANGE_CHIP_LABELS: Record<ChangeChip, string> = {
  fit: 'Fit',
  fabric_weight: 'Fabric weight',
  colour: 'Colour',
  pockets: 'Pockets',
  price: 'Price',
  other: 'Other',
};

export const PALETTE_LABELS: Record<PaletteColour, string> = {
  flax: 'Flax',
  clay: 'Clay',
  meadow: 'Meadow',
  indigo_dusk: 'Indigo Dusk',
  chalk_white: 'Chalk White',
  graphite: 'Light Graphite',
};

/** Swatch fill only. The visible text name is the real signal (Requirement 9.4). */
export const PALETTE_SWATCH: Record<PaletteColour, string> = {
  flax: '#d9cbb3',
  clay: '#c08a6a',
  meadow: '#9aa78c',
  indigo_dusk: '#3f4668',
  chalk_white: '#f7f4ee',
  graphite: '#6b6d66',
};

/** The `name` attributes the island reads (task 16.6). */
export const FIELD_NAMES = {
  verdict: 'verdict',
  changes: 'changes',
  colour: 'colour',
  priorities: 'priorities',
  priceBandId: 'priceBandId',
  otherText: 'otherText',
} as const;

/** Requirement 9.6, exact wording. */
export const PRICE_QUESTION =
  'If you knew exactly what went into it (fibre, yarn, fabric, stitching), what would you pay?';

/** Requirement 9.9, exact wording. */
export const PRICE_SKIP_LABEL = 'Skip this question';

export const PRIORITY_QUESTION = 'What matters most to you?';

/** Requirement 9.3. */
export const OTHER_TEXT_MAX_LENGTH = 200;

/** The same sentence the server's 415 page uses. */
export const NOSCRIPT_NOTE =
  'Feedback needs JavaScript turned on. You can still read everything on this page.';

export interface FormOption {
  value: string;
  label: string;
}

export interface SwatchOption extends FormOption {
  swatch: string;
}

export interface FeedbackFormModel {
  verdicts: FormOption[];
  changes: FormOption[];
  colours: SwatchOption[];
  priorities: FormOption[];
  prices: FormOption[];
}

/** Stable, unique DOM id for a control inside one Concept's form. */
export function fieldId(conceptId: string, name: string, value?: string): string {
  return value === undefined ? `${conceptId}-${name}` : `${conceptId}-${name}-${value}`;
}

export function feedbackFormModel(
  priceBands: readonly PriceBand[],
  colours: readonly PaletteColour[] = PALETTE,
): FeedbackFormModel {
  return {
    verdicts: VERDICTS.map((v) => ({ value: v, label: VERDICT_LABELS[v] })),
    changes: CHANGE_CHIPS.map((c) => ({ value: c, label: CHANGE_CHIP_LABELS[c] })),
    colours: colours.map((c) => ({
      value: c,
      label: PALETTE_LABELS[c],
      swatch: PALETTE_SWATCH[c],
    })),
    priorities: PRIORITY_CHIPS.map((p: PriorityChip) => ({ value: p, label: PRIORITY_LABELS[p] })),
    prices: priceBands.map((b) => ({ value: b.id, label: bandLabel(b) })),
  };
}
