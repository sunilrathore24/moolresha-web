/**
 * Constants and normalisers for the interest form that both sides share: the browser validator
 * (src/lib/interest-validate.ts) and the server schema (functions/_shared/schemas.ts).
 *
 * Plain TypeScript with no imports, so importing it never pulls zod into the browser bundle.
 */

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const UTM_VALUE = /^[a-z0-9._-]{1,64}$/;
/** Indian mobile after spaces and hyphens are removed: +91 then 10 digits starting 6-9 (Requirement 12.10). */
export const IN_MOBILE = /^\+91[6-9]\d{9}$/;
/** Conservative email pattern, applied after lower-casing. */
export const EMAIL_PATTERN = /^[a-z0-9._%+-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
export const NOTICE_VERSION = /^[A-Za-z0-9._-]{1,64}$/;

export const MAX_EMAIL = 254;
/** Raw length limit for the WhatsApp field, before spaces and hyphens are removed. */
export const MAX_WHATSAPP = 32;

/** Trim and lower-case, applied before EMAIL_PATTERN. */
export function normaliseEmail(s: string): string {
  return s.trim().toLowerCase();
}

/** True when a normalised email passes the pattern and the `..` and `.@` checks. */
export function isEmailShape(normalised: string): boolean {
  return EMAIL_PATTERN.test(normalised) && !normalised.includes('..') && !normalised.includes('.@');
}

/** Remove spaces and hyphens, applied before IN_MOBILE. */
export function normaliseWhatsapp(s: string): string {
  return s.replace(/[ -]/g, '');
}
