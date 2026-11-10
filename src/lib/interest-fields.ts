/**
 * Field names and small helpers for the interest form (Requirements 12.1, 12.6, 12.10).
 *
 * Plain TypeScript with no imports. The interest island imports this directly instead of
 * `launch-forms.ts`, because `launch-forms.ts` re-exports from `feedback-form.ts`, which pulls
 * zod (via `price-bands.ts`) into the browser bundle. `launch-forms.ts` re-exports everything
 * here, so existing imports keep working.
 */

/** `name` attributes on the interest form. The island (task 16.8) reads these. */
export const INTEREST_FIELDS = {
  email: 'email',
  whatsapp: 'whatsapp',
  size: 'size',
  consentEmail: 'consent-email',
  consentWhatsapp: 'consent-whatsapp',
  consentLink: 'consent-link',
  consentAdult: 'consent-adult',
} as const;
export type InterestFieldName = (typeof INTEREST_FIELDS)[keyof typeof INTEREST_FIELDS];

/** The order the fields appear in, which is also the order errors are announced in. */
export const INTEREST_FIELD_ORDER: readonly InterestFieldName[] = [
  'email',
  'whatsapp',
  'size',
  'consent-email',
  'consent-whatsapp',
  'consent-link',
  'consent-adult',
];

/** Id of the control for a field. */
export function interestControlId(name: InterestFieldName): string {
  return `interest-${name}`;
}

/** Id of the field-level error slot for a field. Used in `aria-describedby`. */
export function interestErrorId(name: InterestFieldName): string {
  return `interest-${name}-error`;
}

/**
 * The WhatsApp input shows a fixed "+91" and takes the 10 digits. The Feedback_API wants
 * "+91" then 10 digits (spaces and hyphens are allowed and stripped). This builds that value from
 * whatever the visitor typed or pasted. It does not validate: the shared Zod schema does.
 * Returns '' for blank input so the island can omit the field.
 */
export function whatsappForSubmit(raw: string): string {
  const s = raw.replace(/[\s-]/g, '');
  if (s === '') return '';
  if (s.startsWith('+')) return s;
  if (/^91\d{10}$/.test(s)) return `+${s}`;
  return `+91${s.replace(/^0/, '')}`;
}
