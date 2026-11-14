/**
 * Pure data for the frustration and interest forms (Requirements 10.1, 10.2, 12.1, 12.3,
 * 12.6, 12.10, 12.11, 21.3). Plain TypeScript, no Astro imports.
 *
 * The values are the allow-list ids the Feedback_API accepts
 * (src/content/config/allow-lists.ts). The labels are plain words.
 */
import {
  FRUSTRATION_CHIPS,
  SIZES,
  type FrustrationChip,
  type Size,
} from '../content/config/allow-lists';

export {
  NOSCRIPT_NOTE,
  OTHER_TEXT_MAX_LENGTH,
  EMAIL_CONSENT_LABEL,
  EMAIL_LABEL,
  EMAIL_MAX_LENGTH,
  EMAIL_PLACEHOLDER,
} from './feedback-form';

export const FRUSTRATION_LABELS: Record<FrustrationChip, string> = {
  see_through: 'Goes see-through',
  shrinks: 'Shrinks',
  fades: 'Fades',
  poor_fit: 'Poor fit',
  too_hot: 'Too hot',
  fake_discounts: 'Fake discounts',
  cant_judge_online: "Can't judge quality online",
  other: 'Other',
};

export const SIZE_LABELS: Record<Size, string> = {
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
  xxl: 'XXL',
  prefer_not: 'Prefer not to say',
};

/** `name` attributes on the frustration form. The island (task 16.8) reads these. */
export const FRUSTRATION_FIELDS = {
  chips: 'chips',
  otherText: 'otherText',
  email: 'email',
  emailConsent: 'emailConsent',
} as const;

// The interest field names and helpers live in a zod-free module so the interest island can
// import them without pulling zod into the browser bundle. Re-exported here for existing imports.
export {
  INTEREST_FIELDS,
  INTEREST_FIELD_ORDER,
  interestControlId,
  interestErrorId,
  whatsappForSubmit,
  type InterestFieldName,
} from './interest-fields';

export const FRUSTRATION_IDS = {
  otherField: 'frustration-other-field',
  otherInput: 'frustration-other',
  email: 'frustration-email',
  emailConsent: 'frustration-email-consent',
} as const;

export function frustrationChipId(chip: FrustrationChip): string {
  return `frustration-chip-${chip}`;
}

export interface Option {
  value: string;
  label: string;
}

/** Radio-less, multi-select group in allow-list order (Requirement 10.1). */
export function frustrationOptions(): Array<Option & { id: string; chip: FrustrationChip }> {
  return FRUSTRATION_CHIPS.map((chip) => ({
    chip,
    value: chip,
    label: FRUSTRATION_LABELS[chip],
    id: frustrationChipId(chip),
  }));
}

/** Fixed size list plus "prefer not to say" (Requirement 12.11). */
export function sizeOptions(): Option[] {
  return SIZES.map((s) => ({ value: s, label: SIZE_LABELS[s] }));
}
