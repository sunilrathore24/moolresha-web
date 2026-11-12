import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  EventBody,
  FeedbackBody,
  FrustrationBody,
  InterestBody,
} from '../../functions/_shared/schemas';
import { validateBody } from '../../functions/_shared/validate';
import { PRICE_BAND_IDS } from '../../src/content/config/allow-lists.generated';
import {
  feedbackPayload,
  interestPayload,
  mutatedPayload,
  skipPayload,
} from '../generators/api-payloads';

const ANON = '3f2b8c1e-9a4d-4b7e-8f21-6c0d5e4a9b13';

const feedback = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  anonId: ANON,
  conceptId: 'mens-cotton-shirt',
  verdict: 'would_wear',
  turnstileToken: 'tok',
  ...over,
});

const interest = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  anonId: ANON,
  email: 'name@example.in',
  whatsapp: '+91 98123-45678',
  size: 'm',
  consents: { email: true, whatsapp: true, link: false, adult: true },
  noticeVersion: '2026-11-v1',
  turnstileToken: 'tok',
  ...over,
});

const ok = (schema: Parameters<typeof validateBody>[0], body: unknown): boolean =>
  schema.safeParse(body).success;

describe('FeedbackBody', () => {
  it('accepts verdict-only feedback and defaults priorities to []', () => {
    const r = FeedbackBody.safeParse(feedback());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priorities).toEqual([]);
      expect(r.data.changes).toEqual([]);
    }
  });

  it('accepts a full valid body', () => {
    const body = feedback({
      changes: ['fit', 'other'],
      otherText: ' Slightly longer sleeves ',
      colour: 'clay',
      priorities: ['softness', 'no_shrinking'],
      priceBandId: PRICE_BAND_IDS['mens-cotton-shirt'][2],
      utm: { source: 'instagram', medium: 'social', campaign: 'journey-01' },
    });
    const r = FeedbackBody.safeParse(body);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.otherText).toBe('Slightly longer sleeves');
  });

  it('accepts a price skip', () => {
    expect(ok(FeedbackBody, feedback({ priceSkipped: true }))).toBe(true);
  });

  it('rejects unknown keys, including typed prices', () => {
    expect(ok(FeedbackBody, feedback({ extra: 1 }))).toBe(false);
    expect(ok(FeedbackBody, feedback({ price: 1500 }))).toBe(false);
    expect(ok(FeedbackBody, feedback({ priceText: '1500' }))).toBe(false);
    expect(ok(FeedbackBody, feedback({ priceAmount: 1500 }))).toBe(false);
  });

  it('rejects a bad uuid', () => {
    expect(ok(FeedbackBody, feedback({ anonId: 'nope' }))).toBe(false);
    expect(ok(FeedbackBody, feedback({ anonId: '3f2b8c1e-9a4d-1b7e-8f21-6c0d5e4a9b13' }))).toBe(false);
  });

  it('rejects an unknown concept', () => {
    expect(ok(FeedbackBody, feedback({ conceptId: 'mens-silk-kurta' }))).toBe(false);
  });

  it('rejects a band that belongs to another Concept', () => {
    const other = PRICE_BAND_IDS['womens-coord-set'][0];
    const r = FeedbackBody.safeParse(feedback({ priceBandId: other }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['priceBandId']);
  });

  it('rejects a band and a skip together, with the path priceSkipped', () => {
    const r = FeedbackBody.safeParse(
      feedback({ priceBandId: PRICE_BAND_IDS['mens-cotton-shirt'][0], priceSkipped: true }),
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === 'priceSkipped')).toBe(true);
  });

  it('rejects priceSkipped: false and non-true values', () => {
    expect(ok(FeedbackBody, feedback({ priceSkipped: false }))).toBe(false);
    expect(ok(FeedbackBody, feedback({ priceSkipped: 'true' }))).toBe(false);
    expect(ok(FeedbackBody, feedback({ priceSkipped: 1 }))).toBe(false);
  });

  it('rejects duplicate chips', () => {
    expect(ok(FeedbackBody, feedback({ changes: ['fit', 'fit'] }))).toBe(false);
    expect(ok(FeedbackBody, feedback({ priorities: ['softness', 'softness'] }))).toBe(false);
  });

  it('rejects unknown or non-array priorities', () => {
    expect(ok(FeedbackBody, feedback({ priorities: ['luxury'] }))).toBe(false);
    expect(ok(FeedbackBody, feedback({ priorities: 'softness' }))).toBe(false);
  });

  it('rejects otherText without the other chip', () => {
    expect(ok(FeedbackBody, feedback({ changes: ['fit'], otherText: 'x' }))).toBe(false);
    expect(ok(FeedbackBody, feedback({ otherText: 'x' }))).toBe(false);
  });

  it('rejects over-long text and accepts exactly 200 characters', () => {
    expect(ok(FeedbackBody, feedback({ changes: ['other'], otherText: 'a'.repeat(201) }))).toBe(false);
    expect(ok(FeedbackBody, feedback({ changes: ['other'], otherText: 'a'.repeat(200) }))).toBe(true);
  });

  it('rejects a bad utm value or key', () => {
    expect(ok(FeedbackBody, feedback({ utm: { source: 'Bad Value' } }))).toBe(false);
    expect(ok(FeedbackBody, feedback({ utm: { term: 'x' } }))).toBe(false);
  });

  it('rejects a missing or over-long Turnstile token', () => {
    const { turnstileToken: _t, ...rest } = feedback();
    expect(ok(FeedbackBody, rest)).toBe(false);
    expect(ok(FeedbackBody, feedback({ turnstileToken: 't'.repeat(2049) }))).toBe(false);
  });

  it('accepts generated valid payloads and rejects single-defect mutations', () => {
    fc.assert(fc.property(feedbackPayload(), (p) => ok(FeedbackBody, p)), { numRuns: 100 });
    fc.assert(
      fc.property(skipPayload(), (p) => ok(FeedbackBody, p) && p.priceSkipped === true),
      { numRuns: 50 },
    );
    fc.assert(
      fc.property(mutatedPayload(), (m) => !ok(FeedbackBody, m.payload)),
      { numRuns: 200 },
    );
  });
});

describe('FrustrationBody', () => {
  const body = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    anonId: ANON,
    chips: ['shrinks', 'other'],
    otherText: 'Collars curl',
    turnstileToken: 'tok',
    ...over,
  });

  it('accepts a valid body', () => {
    expect(ok(FrustrationBody, body())).toBe(true);
  });

  it('rejects empty, unknown and duplicate chips', () => {
    expect(ok(FrustrationBody, body({ chips: [], otherText: undefined }))).toBe(false);
    expect(ok(FrustrationBody, body({ chips: ['itchy'] }))).toBe(false);
    expect(ok(FrustrationBody, body({ chips: ['shrinks', 'shrinks'], otherText: undefined }))).toBe(false);
  });

  it('rejects otherText without other, over-long text and unknown keys', () => {
    expect(ok(FrustrationBody, body({ chips: ['shrinks'] }))).toBe(false);
    expect(ok(FrustrationBody, body({ otherText: 'a'.repeat(201) }))).toBe(false);
    expect(ok(FrustrationBody, body({ extra: 1 }))).toBe(false);
  });
});

describe('InterestBody', () => {
  it('accepts a full valid body and normalises email and phone', () => {
    const r = InterestBody.safeParse(interest({ email: ' Name@Example.IN ' }));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('name@example.in');
      expect(r.data.whatsapp).toBe('+919812345678');
    }
  });

  it('accepts size only, without any consent', () => {
    const r = InterestBody.safeParse(
      interest({ email: undefined, whatsapp: undefined, consents: {} }),
    );
    expect(r.success).toBe(true);
  });

  it('rejects a bad email and a bad phone', () => {
    expect(ok(InterestBody, interest({ email: 'not-an-email' }))).toBe(false);
    expect(ok(InterestBody, interest({ whatsapp: '+915123456789' }))).toBe(false); // starts with 5
    expect(ok(InterestBody, interest({ whatsapp: '9812345678' }))).toBe(false); // no +91
    expect(ok(InterestBody, interest({ whatsapp: '+91 98123 4567' }))).toBe(false); // 9 digits
  });

  it('rejects an unknown size and unknown keys', () => {
    expect(ok(InterestBody, interest({ size: 'xxxl' }))).toBe(false);
    expect(ok(InterestBody, interest({ extra: 1 }))).toBe(false);
  });

  it('rejects a body with no email, WhatsApp number or size', () => {
    expect(
      ok(InterestBody, interest({ email: undefined, whatsapp: undefined, size: undefined })),
    ).toBe(false);
  });

  it('rejects an email without email consent', () => {
    const r = validateBody(
      InterestBody,
      interest({ whatsapp: undefined, consents: { email: false, whatsapp: false, link: false, adult: true } }),
    );
    expect(r.ok).toBe(false);
  });

  it('accepts generated interest payloads', () => {
    fc.assert(fc.property(interestPayload(), (p) => ok(InterestBody, p)), { numRuns: 100 });
  });
});

describe('EventBody', () => {
  it('accepts page_view and section_reached with a section', () => {
    expect(ok(EventBody, { event: 'page_view' })).toBe(true);
    expect(ok(EventBody, { event: 'section_reached', section: 'design-lab', utm: { source: 'x' } })).toBe(true);
    expect(ok(EventBody, { event: 'journal_click', conceptId: 'mens-linen-shirt' })).toBe(true);
  });

  it('rejects anonId', () => {
    expect(ok(EventBody, { event: 'page_view', anonId: ANON })).toBe(false);
  });

  it('rejects server-only events, unknown sections and a missing section', () => {
    expect(ok(EventBody, { event: 'feedback_submitted' })).toBe(false);
    expect(ok(EventBody, { event: 'section_reached', section: 'hero' })).toBe(false);
    expect(ok(EventBody, { event: 'section_reached' })).toBe(false);
  });
});

describe('validateBody', () => {
  const failure = async (schema: Parameters<typeof validateBody>[0], body: unknown) => {
    const r = validateBody(schema, body);
    if (r.ok) throw new Error('expected a failure');
    return { status: r.response.status, json: (await r.response.json()) as Record<string, unknown> };
  };

  it('returns the parsed data on success', () => {
    const r = validateBody(FeedbackBody, feedback());
    expect(r.ok).toBe(true);
  });

  it('maps schema failures to 400 invalid_request with field paths', async () => {
    const { status, json } = await failure(FeedbackBody, feedback({ priceSkipped: false, extra: 1 }));
    expect(status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('invalid_request');
    expect(Object.keys(json.fields as object)).toEqual(expect.arrayContaining(['priceSkipped', 'extra']));
  });

  it('maps band and skip together to invalid_request at priceSkipped', async () => {
    const { json } = await failure(
      FeedbackBody,
      feedback({ priceBandId: PRICE_BAND_IDS['mens-cotton-shirt'][0], priceSkipped: true }),
    );
    expect(json.error).toBe('invalid_request');
    expect(json.fields).toHaveProperty('priceSkipped');
  });

  it('maps a missing email consent to 400 consent_required at consents.email', async () => {
    const { status, json } = await failure(
      InterestBody,
      interest({ whatsapp: undefined, consents: { email: false, whatsapp: false, link: false, adult: true } }),
    );
    expect(status).toBe(400);
    expect(json.error).toBe('consent_required');
    expect(json.fields).toHaveProperty(['consents.email']);
  });

  it('maps a missing 18+ confirmation to consent_required at consents.adult', async () => {
    const { json } = await failure(
      InterestBody,
      interest({ consents: { email: true, whatsapp: true, link: false, adult: false } }),
    );
    expect(json.error).toBe('consent_required');
    expect(json.fields).toHaveProperty(['consents.adult']);
  });

  it('uses invalid_request when a consent problem comes with a format error', async () => {
    const { json } = await failure(
      InterestBody,
      interest({ email: 'bad', consents: { email: false, whatsapp: true, link: false, adult: true } }),
    );
    expect(json.error).toBe('invalid_request');
  });

  it('does not echo submitted values in the error body', async () => {
    const { json } = await failure(InterestBody, interest({ email: 'secret.person@example.in x' }));
    expect(JSON.stringify(json)).not.toContain('secret.person');
  });

  it('rejects an event that carries anonId with the field path', async () => {
    const { json } = await failure(EventBody, { event: 'page_view', anonId: ANON });
    expect(json.error).toBe('invalid_request');
    expect(json.fields).toHaveProperty('anonId');
  });
});
