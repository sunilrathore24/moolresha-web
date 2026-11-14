/**
 * Request validation schemas for the write endpoints (design.md, "API endpoints").
 *
 * Rules that apply to every schema here:
 * - Built from the single-source allow-lists, so the client options and the server
 *   allow-list cannot drift (Requirement 14.6).
 * - Every object is strict: unknown keys are rejected. That is how a typed price
 *   (`price`, `priceText`, `priceAmount`) and an `anonId` on an event are refused
 *   (Requirements 9.5, 18.4).
 * - Imports `zod` (not `astro/zod`) and uses no Node or Workers-only API, so the
 *   interest schema can be shared with the browser island.
 *
 * Error classification lives in `validate.ts`. Consent problems are tagged here with
 * `params.code = 'consent_required'` so `validate.ts` can return `consent_required`.
 */
import { z } from 'zod';
import {
  CHANGE_CHIPS,
  CONCEPT_IDS,
  EVENTS_CLIENT,
  FRUSTRATION_CHIPS,
  PALETTE,
  PRIORITY_CHIPS,
  SECTIONS,
  SIZES,
  VERDICTS,
  WEAVE_IDS,
} from '../../src/content/config/allow-lists';
import { PRICE_BAND_IDS } from '../../src/content/config/allow-lists.generated';
import { EMAIL_PATTERN, IN_MOBILE, MAX_EMAIL, UTM_VALUE, UUID_V4 } from '../../src/lib/interest-rules';

/** Marker placed in `issue.params.code` for consent and 18+ failures. */
export const CONSENT_REQUIRED = 'consent_required';

// Shared with the browser validator. Re-exported so existing imports from this file keep working.
export { UUID_V4, UTM_VALUE, IN_MOBILE, EMAIL_PATTERN, MAX_EMAIL };

export const MAX_FREE_TEXT = 200;
export const MAX_COMMENT_LENGTH = 250;
export const MAX_TOKEN = 2048;

/** NFC, line breaks and tabs to a space, other control characters removed, trimmed. */
export function normaliseText(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Shared field schemas
// ---------------------------------------------------------------------------

/** Anonymous_ID: UUID v4 (Requirement 15.3). */
export const AnonId = z.string().regex(UUID_V4);

const UtmVal = z.string().regex(UTM_VALUE);
export const Utm = z.strictObject({ source: UtmVal, medium: UtmVal, campaign: UtmVal }).partial();

/** Turnstile token, at most 2,048 characters. */
export const Token = z.string().min(1).max(MAX_TOKEN);

/** Free text: at most 200 characters, stored as plain text. */
export const FreeText = z.string().max(MAX_FREE_TEXT).transform(normaliseText);

/** The general "Any other thoughts?" comment: at most 250 characters, stored as plain text.
 * Distinct from FreeText/otherText, which stays tied to the "other" Change_Chip. */
export const CommentText = z.string().max(MAX_COMMENT_LENGTH).transform(normaliseText);

export const ConceptId = z.enum(CONCEPT_IDS);

const hasDuplicates = (xs: readonly unknown[]): boolean => new Set(xs).size !== xs.length;

/** Same shape the Interest form's email uses (defined once here, re-used by Feedback,
 * Frustration and Interest below) — trimmed, lower-cased, one conservative pattern. */
const Email = z
  .string()
  .max(MAX_EMAIL)
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().regex(EMAIL_PATTERN).refine((s) => !s.includes('..') && !s.includes('.@')));

/** Shared by FeedbackBody and FrustrationBody: an optional, NOT required, email the person can
 * leave so MoolResha can follow up about this specific answer — distinct from the Interest
 * form's standing "email me about launch" signup. Requires its own consent tick whenever an
 * email is given (never implied by the general Turnstile/submit action), same spirit as the
 * Interest form's `consents.email`, but as a single combined "contact me about this" checkbox
 * rather than that form's separate email/WhatsApp/adult consents — this is a narrower, one-off
 * purpose tied to one feedback row, not a standing subscription. */
function requireEmailConsent<T extends { email?: string; emailConsent?: boolean }>(
  b: T,
  ctx: z.RefinementCtx,
): void {
  if (b.email !== undefined && b.emailConsent !== true) {
    ctx.addIssue({
      code: 'custom',
      path: ['emailConsent'],
      message: 'tick the consent box to let us store your email',
      params: { code: CONSENT_REQUIRED },
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/feedback
// ---------------------------------------------------------------------------

export const FeedbackBody = z
  .strictObject({
    anonId: AnonId,
    conceptId: ConceptId,
    verdict: z.enum(VERDICTS),
    changes: z.array(z.enum(CHANGE_CHIPS)).max(CHANGE_CHIPS.length).default([]),
    otherText: FreeText.optional(),
    /** General "Any other thoughts?" field — optional, not tied to any chip. */
    comment: CommentText.optional(),
    colour: z.enum(PALETTE).optional(),
    /** Which weave the person was looking at (only concepts with more than one weave send
     * this — see src/lib/concept-weave-variants.ts). Omitted, never an empty string. */
    weave: z.enum(WEAVE_IDS).optional(),
    priorities: z.array(z.enum(PRIORITY_CHIPS)).max(PRIORITY_CHIPS.length).default([]),
    // The price answer is a band id for this Concept, the literal `true` skip, or nothing.
    // There is deliberately no free-text or numeric price field (Requirement 9.5).
    priceBandId: z.string().max(64).optional(),
    priceSkipped: z.literal(true).optional(),
    /** Optional — see `requireEmailConsent` above. Not stored anywhere public; admin-only. */
    email: Email.optional(),
    emailConsent: z.boolean().default(false),
    utm: Utm.optional(),
    turnstileToken: Token,
  })
  .superRefine((b, ctx) => {
    const changes = Array.isArray(b.changes) ? b.changes : [];
    const priorities = Array.isArray(b.priorities) ? b.priorities : [];

    if (b.priceBandId !== undefined && b.priceSkipped !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['priceSkipped'], message: 'band and skip are exclusive' });
    }
    if (b.priceBandId !== undefined) {
      const allowed: readonly string[] = PRICE_BAND_IDS[b.conceptId as keyof typeof PRICE_BAND_IDS] ?? [];
      if (!allowed.includes(b.priceBandId)) {
        ctx.addIssue({ code: 'custom', path: ['priceBandId'], message: 'unknown band for concept' });
      }
    }
    if (hasDuplicates(changes)) {
      ctx.addIssue({ code: 'custom', path: ['changes'], message: 'duplicate chip' });
    }
    if (hasDuplicates(priorities)) {
      ctx.addIssue({ code: 'custom', path: ['priorities'], message: 'duplicate priority' });
    }
    if (b.otherText !== undefined && !changes.includes('other')) {
      ctx.addIssue({ code: 'custom', path: ['otherText'], message: 'other text needs the other chip' });
    }
    requireEmailConsent(b, ctx);
  });
export type FeedbackInput = z.input<typeof FeedbackBody>;
export type FeedbackData = z.output<typeof FeedbackBody>;

// ---------------------------------------------------------------------------
// POST /api/frustration
// ---------------------------------------------------------------------------

export const FrustrationBody = z
  .strictObject({
    anonId: AnonId,
    chips: z.array(z.enum(FRUSTRATION_CHIPS)).min(1).max(FRUSTRATION_CHIPS.length),
    otherText: FreeText.optional(),
    email: Email.optional(),
    emailConsent: z.boolean().default(false),
    utm: Utm.optional(),
    turnstileToken: Token,
  })
  .superRefine((b, ctx) => {
    const chips = Array.isArray(b.chips) ? b.chips : [];
    if (hasDuplicates(chips)) {
      ctx.addIssue({ code: 'custom', path: ['chips'], message: 'duplicate chip' });
    }
    if (b.otherText !== undefined && !chips.includes('other')) {
      ctx.addIssue({ code: 'custom', path: ['otherText'], message: 'other text needs the other chip' });
    }
    requireEmailConsent(b, ctx);
  });
export type FrustrationInput = z.input<typeof FrustrationBody>;
export type FrustrationData = z.output<typeof FrustrationBody>;

// ---------------------------------------------------------------------------
// POST /api/interest (shared with the browser island)
// ---------------------------------------------------------------------------

/** Spaces and hyphens are removed before the Indian mobile check. */
const Whatsapp = z
  .string()
  .max(32)
  .transform((s) => s.replace(/[ -]/g, ''))
  .pipe(z.string().regex(IN_MOBILE));

const Consents = z.strictObject({
  email: z.boolean().default(false),
  whatsapp: z.boolean().default(false),
  link: z.boolean().default(false),
  adult: z.boolean().default(false),
});

export const InterestBody = z
  .strictObject({
    anonId: AnonId,
    email: Email.optional(),
    whatsapp: Whatsapp.optional(),
    size: z.enum(SIZES).optional(),
    consents: Consents,
    noticeVersion: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
    utm: Utm.optional(),
    turnstileToken: Token,
  })
  .superRefine((b, ctx) => {
    const consent = (path: string, message: string): void => {
      ctx.addIssue({ code: 'custom', path: ['consents', path], message, params: { code: CONSENT_REQUIRED } });
    };
    const hasEmail = b.email !== undefined;
    const hasWhatsapp = b.whatsapp !== undefined;

    if (hasEmail && b.consents?.email !== true) {
      consent('email', 'tick the email consent to let us store your email');
    }
    if (hasWhatsapp && b.consents?.whatsapp !== true) {
      consent('whatsapp', 'tick the WhatsApp consent to let us store your number');
    }
    if ((hasEmail || hasWhatsapp) && b.consents?.adult !== true) {
      consent('adult', 'confirm you are 18 or older');
    }
    if (!hasEmail && !hasWhatsapp && b.size === undefined) {
      ctx.addIssue({ code: 'custom', path: [], message: 'give at least one of email, WhatsApp number or size' });
    }
  });
export type InterestInput = z.input<typeof InterestBody>;
export type InterestData = z.output<typeof InterestBody>;

// ---------------------------------------------------------------------------
// POST /api/events
// ---------------------------------------------------------------------------

/** No `anonId` (or any other identifier): the strict schema rejects it (Requirement 18.4). */
export const EventBody = z
  .strictObject({
    event: z.enum(EVENTS_CLIENT),
    conceptId: ConceptId.optional(),
    section: z.enum(SECTIONS).optional(),
    utm: Utm.optional(),
  })
  .superRefine((b, ctx) => {
    if (b.event === 'section_reached' && b.section === undefined) {
      ctx.addIssue({ code: 'custom', path: ['section'], message: 'section is required for section_reached' });
    }
  });
export type EventInput = z.input<typeof EventBody>;
export type EventData = z.output<typeof EventBody>;
