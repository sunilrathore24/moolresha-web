/**
 * Browser-side check for the interest form body. Dependency-free (no zod) so the island stays
 * inside the first-load JS budget (scripts/js-budget.ts).
 *
 * It applies the same rules as `InterestBody` in functions/_shared/schemas.ts. The constants and
 * normalisers come from src/lib/interest-rules.ts, which the server schema imports too, so they
 * cannot drift. The remaining logic is mirrored by hand, and tests/unit/interest-validate.test.ts
 * checks both against each other.
 *
 * Differences from the server schema, on purpose:
 * - Unknown keys (in the body, `consents` and `utm`) are not an issue here.
 * - `turnstileToken` is not checked. The island adds it just before sending.
 */
import { SIZES } from '../content/config/allow-lists';
import {
  isEmailShape,
  IN_MOBILE,
  MAX_EMAIL,
  MAX_WHATSAPP,
  normaliseEmail,
  normaliseWhatsapp,
  NOTICE_VERSION,
  UTM_VALUE,
  UUID_V4,
} from './interest-rules';
import type { InterestFieldName } from './interest-fields';

/**
 * `none`: the "give at least one of email, WhatsApp number or size" rule, which has no field.
 * `other`: a problem with a part of the body the visitor does not edit (anonId, noticeVersion,
 * utm, or the shape of `consents`).
 */
export type InterestIssueField = InterestFieldName | 'none' | 'other';

export interface InterestIssue {
  field: InterestIssueField;
  /** Short machine-readable reason, e.g. `invalid`, `consent_required`, `contact_required`. */
  code: string;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function emailOk(v: string): boolean {
  return v.length <= MAX_EMAIL && isEmailShape(normaliseEmail(v));
}

function whatsappOk(v: string): boolean {
  return v.length <= MAX_WHATSAPP && IN_MOBILE.test(normaliseWhatsapp(v));
}

/** Returns one issue per problem found. An empty array means the server schema accepts the body. */
export function validateInterest(body: unknown): InterestIssue[] {
  if (!isObject(body)) return [{ field: 'other', code: 'type' }];
  const issues: InterestIssue[] = [];
  const add = (field: InterestIssueField, code: string) => issues.push({ field, code });
  // A wrong type stops the server's cross-field rules from running, so it does here too.
  let typeError = false;

  const { anonId, email, whatsapp, size, consents, noticeVersion, utm } = body;

  if (typeof anonId !== 'string') {
    add('other', 'type');
    typeError = true;
  } else if (!UUID_V4.test(anonId)) add('other', 'invalid');

  if (email !== undefined) {
    if (typeof email !== 'string') {
      add('email', 'type');
      typeError = true;
    } else if (!emailOk(email)) add('email', 'invalid');
  }

  if (whatsapp !== undefined) {
    if (typeof whatsapp !== 'string') {
      add('whatsapp', 'type');
      typeError = true;
    } else if (!whatsappOk(whatsapp)) add('whatsapp', 'invalid');
  }

  if (size !== undefined && (typeof size !== 'string' || !(SIZES as readonly string[]).includes(size))) {
    add('size', 'invalid');
    typeError = true;
  }

  // Missing consent flags default to false; a flag of another type is an error.
  const flags = { email: false, whatsapp: false, link: false, adult: false };
  if (!isObject(consents)) {
    add('other', 'type');
    typeError = true;
  } else {
    for (const key of Object.keys(flags) as Array<keyof typeof flags>) {
      const v = consents[key];
      if (v === undefined) continue;
      if (typeof v === 'boolean') flags[key] = v;
      else {
        add(`consent-${key}`, 'type');
        typeError = true;
      }
    }
  }

  if (typeof noticeVersion !== 'string') {
    add('other', 'type');
    typeError = true;
  } else if (!NOTICE_VERSION.test(noticeVersion)) add('other', 'invalid');

  if (utm !== undefined) {
    if (!isObject(utm)) {
      add('other', 'type');
      typeError = true;
    } else {
      for (const k of ['source', 'medium', 'campaign']) {
        const v = utm[k];
        if (v === undefined) continue;
        if (typeof v !== 'string') {
          add('other', 'type');
          typeError = true;
        } else if (!UTM_VALUE.test(v)) add('other', 'invalid');
      }
    }
  }

  if (!typeError) {
    const hasEmail = email !== undefined;
    const hasWhatsapp = whatsapp !== undefined;
    if (hasEmail && !flags.email) add('consent-email', 'consent_required');
    if (hasWhatsapp && !flags.whatsapp) add('consent-whatsapp', 'consent_required');
    if ((hasEmail || hasWhatsapp) && !flags.adult) add('consent-adult', 'consent_required');
    if (!hasEmail && !hasWhatsapp && size === undefined) add('none', 'contact_required');
  }

  return issues;
}
