/**
 * Generators for the request bodies of the write endpoints (task 13.6).
 * Valid payloads are built from the allow-lists, so tests follow production rules.
 * `mutatedPayload()` produces payloads that are invalid in exactly one way.
 */
import fc from 'fast-check';
import {
  CHANGE_CHIPS,
  CONCEPT_IDS,
  PALETTE,
  PRIORITY_CHIPS,
  SIZES,
  type ConceptId,
} from '../../src/content/config/allow-lists';
import { PRICE_BAND_IDS } from '../../src/content/config/allow-lists.generated';
import { chipSubset, conceptId, verdict, wellFormedText } from './index';

export const TEST_NOTICE_VERSION = '2026-11-v1';

type Json = Record<string, unknown>;

/** UUID v4 in lower case. */
export function anonId(): fc.Arbitrary<string> {
  return fc.uuid({ version: 4 }).map((s) => s.toLowerCase());
}

/** A UTM object whose values match the UTM pattern. */
export function utm(): fc.Arbitrary<Json> {
  const val = fc.stringMatching(/^[a-z0-9._-]{1,64}$/);
  return fc.record({ source: val, medium: val, campaign: val }, { requiredKeys: [] });
}

const token = (): fc.Arbitrary<string> => fc.string({ minLength: 1, maxLength: 64, unit: 'grapheme-ascii' });

/** Printable text of 1 to 200 characters with a non-space first and last character. */
function otherText(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ,.'-]{0,150}[A-Za-z0-9]$/);
}

/** Price answer for a Concept: nothing, a band of that Concept, or a skip. */
function priceAnswer(id: ConceptId): fc.Arbitrary<Json> {
  const bands = PRICE_BAND_IDS[id];
  return fc.oneof(
    fc.constant<Json>({}),
    fc.constantFrom(...bands).map((priceBandId): Json => ({ priceBandId })),
    fc.constant<Json>({ priceSkipped: true }),
  );
}

export interface PayloadOptions {
  /** Draw Anonymous_IDs from this pool (default: any UUID v4). Small pools force repeat keys. */
  anonIds?: readonly string[];
  /** Draw Concepts from this pool (default: all five). */
  conceptIds?: readonly ConceptId[];
  /** Use arbitrary well-formed Unicode for free text (default: printable ASCII). */
  unicodeText?: boolean;
}

function anonIdFrom(options: PayloadOptions): fc.Arbitrary<string> {
  return options.anonIds ? fc.constantFrom(...options.anonIds) : anonId();
}

function freeText(options: PayloadOptions): fc.Arbitrary<string> {
  return options.unicodeText ? wellFormedText({ maxUnits: 200 }) : otherText();
}

function feedbackWith(
  price: (id: ConceptId) => fc.Arbitrary<Json>,
  options: PayloadOptions = {},
): fc.Arbitrary<Json> {
  const concept = options.conceptIds ? fc.constantFrom(...options.conceptIds) : conceptId();
  return concept.chain((id) =>
    fc
      .record(
        {
          anonId: anonIdFrom(options),
          verdict: verdict(),
          changes: chipSubset(CHANGE_CHIPS),
          colour: fc.constantFrom(...PALETTE),
          priorities: chipSubset(PRIORITY_CHIPS),
          utm: utm(),
          otherText: freeText(options),
        },
        { requiredKeys: ['anonId', 'verdict'] },
      )
      .chain((base) =>
        fc.tuple(price(id), fc.constant(base)).map(([p, b]): Json => {
          const out: Json = { ...b, conceptId: id, ...p, turnstileToken: 'token' };
          // otherText is allowed only together with the "other" chip.
          const changes = (out.changes as string[] | undefined) ?? [];
          if (!changes.includes('other')) delete out.otherText;
          return out;
        }),
      )
      .chain((p) => token().map((t): Json => ({ ...p, turnstileToken: t }))),
  );
}

/** A valid feedback body. Covers verdict-only, band-only and skip-only price answers. */
export function feedbackPayload(options: PayloadOptions = {}): fc.Arbitrary<Json> {
  return feedbackWith(priceAnswer, options);
}

/** A valid feedback body whose price answer is the explicit skip. */
export function skipPayload(): fc.Arbitrary<Json> {
  return feedbackWith(() => fc.constant<Json>({ priceSkipped: true }));
}

export interface Mutated {
  /** Name of the single mutation applied. */
  mutation: string;
  /** A feedback body that the server must reject. */
  payload: Json;
}

/** A valid feedback body with exactly one defect. */
export function mutatedPayload(): fc.Arbitrary<Mutated> {
  const base = feedbackWith(() => fc.constant<Json>({}));
  const m = (mutation: string, fn: (p: Json) => Json): fc.Arbitrary<Mutated> =>
    base.map((p) => ({ mutation, payload: fn({ ...p }) }));

  const otherConcept = (id: ConceptId): ConceptId => CONCEPT_IDS.find((c) => c !== id) as ConceptId;

  return fc.oneof(
    m('unknown_key', (p) => ({ ...p, extra: 1 })),
    m('typed_price', (p) => ({ ...p, price: 1500 })),
    m('typed_price_text', (p) => ({ ...p, priceText: '1500' })),
    m('typed_price_amount', (p) => ({ ...p, priceAmount: 1500 })),
    m('bad_uuid', (p) => ({ ...p, anonId: 'not-a-uuid' })),
    m('uuid_v1', (p) => ({ ...p, anonId: '3f2b8c1e-9a4d-1b7e-8f21-6c0d5e4a9b13' })),
    m('missing_anon_id', (p) => {
      delete p.anonId;
      return p;
    }),
    m('unknown_concept', (p) => ({ ...p, conceptId: 'mens-silk-kurta' })),
    m('bad_verdict', (p) => ({ ...p, verdict: 'love_it' })),
    m('unknown_change', (p) => ({ ...p, changes: ['sleeves'] })),
    m('duplicate_change', (p) => ({ ...p, changes: ['fit', 'fit'] })),
    m('unknown_colour', (p) => ({ ...p, colour: 'pink' })),
    m('unknown_priority', (p) => ({ ...p, priorities: ['luxury'] })),
    m('duplicate_priority', (p) => ({ ...p, priorities: ['softness', 'softness'] })),
    m('priorities_not_array', (p) => ({ ...p, priorities: 'softness' })),
    m('band_from_other_concept', (p) => ({
      ...p,
      priceBandId: PRICE_BAND_IDS[otherConcept(p.conceptId as ConceptId)][0],
    })),
    m('unknown_band', (p) => ({ ...p, priceBandId: 'mcs-9999-plus' })),
    m('band_and_skip', (p) => ({
      ...p,
      priceBandId: PRICE_BAND_IDS[p.conceptId as ConceptId][0],
      priceSkipped: true,
    })),
    m('skip_false', (p) => ({ ...p, priceSkipped: false })),
    m('skip_string', (p) => ({ ...p, priceSkipped: 'true' })),
    m('other_text_without_other', (p) => ({ ...p, changes: ['fit'], otherText: 'longer sleeves' })),
    m('other_text_too_long', (p) => ({ ...p, changes: ['other'], otherText: 'a'.repeat(201) })),
    m('bad_utm_value', (p) => ({ ...p, utm: { source: 'Insta Gram!' } })),
    m('unknown_utm_key', (p) => ({ ...p, utm: { term: 'x' } })),
    m('missing_token', (p) => {
      delete p.turnstileToken;
      return p;
    }),
    m('token_too_long', (p) => ({ ...p, turnstileToken: 't'.repeat(2049) })),
  );
}

/** Indian mobile number, possibly written with spaces and hyphens. */
function whatsappNumber(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom('6', '7', '8', '9'),
      fc.stringMatching(/^[0-9]{9}$/),
      fc.constantFrom('', ' ', '-', ' - '),
    )
    .map(([lead, rest, sep]) => `+91${sep}${lead}${rest.slice(0, 4)}${sep}${rest.slice(4)}`);
}

function emailAddress(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.stringMatching(/^[a-z0-9]{1,10}$/), fc.stringMatching(/^[a-z]{2,10}$/), fc.constantFrom('in', 'com', 'co.in'))
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);
}

/**
 * A valid interest body: at least one of email, WhatsApp or size; each contact detail comes with
 * its consent and the 18+ confirmation.
 */
export function interestPayload(): fc.Arbitrary<Json> {
  return fc
    .record(
      {
        email: emailAddress(),
        whatsapp: whatsappNumber(),
        size: fc.constantFrom(...SIZES),
      },
      { requiredKeys: [] },
    )
    .filter((c) => c.email !== undefined || c.whatsapp !== undefined || c.size !== undefined)
    .chain((contact) =>
      fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()).chain(([link, extraEmail, extraWhatsapp]) =>
        fc.tuple(anonId(), token(), utm()).map(([id, t, u]): Json => {
          const hasEmail = contact.email !== undefined;
          const hasWhatsapp = contact.whatsapp !== undefined;
          return {
            anonId: id,
            ...contact,
            consents: {
              email: hasEmail || extraEmail,
              whatsapp: hasWhatsapp || extraWhatsapp,
              link,
              adult: hasEmail || hasWhatsapp || link,
            },
            noticeVersion: TEST_NOTICE_VERSION,
            utm: u,
            turnstileToken: t,
          };
        }),
      ),
    );
}
