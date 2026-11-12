/**
 * Single source of truth for every closed set of values used by the site and
 * by the Pages Functions (functions/_shared/schemas.ts).
 *
 * Plain TypeScript: do NOT import from 'astro' or 'astro:*' here. The Functions
 * bundle imports this file directly (see functions/tsconfig.json).
 */

export const CONCEPT_IDS = [
  'mens-cotton-shirt',
  'mens-cotton-linen-shirt',
  'mens-linen-shirt',
  'mens-relaxed-pant',
  'womens-coord-set',
] as const;
export type ConceptId = (typeof CONCEPT_IDS)[number];

export const VERDICTS = ['would_wear', 'maybe', 'not_for_me'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const CHANGE_CHIPS = ['fit', 'fabric_weight', 'colour', 'pockets', 'price', 'other'] as const;
export type ChangeChip = (typeof CHANGE_CHIPS)[number];

export const PALETTE = ['flax', 'clay', 'meadow', 'indigo_dusk', 'chalk_white', 'graphite'] as const;
export type PaletteColour = (typeof PALETTE)[number];

export const FRUSTRATION_CHIPS = [
  'see_through',
  'shrinks',
  'fades',
  'poor_fit',
  'too_hot',
  'fake_discounts',
  'cant_judge_online',
  'other',
] as const;
export type FrustrationChip = (typeof FRUSTRATION_CHIPS)[number];

export const SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'prefer_not'] as const;
export type Size = (typeof SIZES)[number];

/** Events a browser may send to POST /api/events. */
export const EVENTS_CLIENT = ['page_view', 'section_reached', 'journal_click'] as const;
export type ClientEvent = (typeof EVENTS_CLIENT)[number];

/** Events only the server records, inside the feedback, frustration and interest endpoints. */
export const EVENTS_SERVER = ['feedback_submitted', 'frustration_submitted', 'interest_submitted'] as const;
export type ServerEvent = (typeof EVENTS_SERVER)[number];

/** Every event name the Event_Counter can store. */
export type EventName = ClientEvent | ServerEvent;

/**
 * Sections that may be reported with the `section_reached` event
 * (Requirement 18.3: journey, money, concepts, interest form).
 * This is the API allow-list, not the page order: see PAGE_SECTIONS.
 */
export const SECTIONS = ['design-lab', 'nav-cards', 'why', 'beyond-label', 'trends', 'signup'] as const;
export type SectionName = (typeof SECTIONS)[number];

/**
 * The `data-section` values on the Launch_Page, in the order Requirement 2.1 fixes.
 * Used by Content_Check rule CC-15 and the page composition.
 */
export const PAGE_SECTIONS = ['hero', 'design-lab', 'nav-cards', 'footer'] as const;
export type PageSection = (typeof PAGE_SECTIONS)[number];

export const PRIORITY_CHIPS = [
  'softness',
  'no_shrinking',
  'colour_lasts',
  'breathability',
  'easy_care',
  'long_life',
] as const;
export type PriorityChip = (typeof PRIORITY_CHIPS)[number];

export const PRIORITY_LABELS: Record<PriorityChip, string> = {
  softness: 'Softness',
  no_shrinking: 'No shrinking',
  colour_lasts: 'Colour that lasts',
  breathability: 'Breathability',
  easy_care: 'Easy care',
  long_life: 'Long life',
};
