/**
 * Parity between the browser validator (src/lib/interest-validate.ts) and the server schema
 * (functions/_shared/schemas.ts, InterestBody). The client copy exists so the island does not ship
 * zod; this test is what keeps the two sets of rules equal.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { InterestBody } from '../../functions/_shared/schemas';
import { validateInterest, type InterestIssueField } from '../../src/lib/interest-validate';
import { SIZES } from '../../src/content/config/allow-lists';
import { anonId, interestPayload, TEST_NOTICE_VERSION } from '../generators/api-payloads';

type Body = Record<string, unknown>;

/** The server sees the token; the client ignores it. */
const forServer = (b: unknown): unknown =>
  typeof b === 'object' && b !== null && !Array.isArray(b) ? { turnstileToken: 'check', ...(b as Body) } : b;

const serverAccepts = (b: unknown): boolean => InterestBody.safeParse(forServer(b)).success;

/** Field that a server issue path belongs to. */
function serverField(path: readonly PropertyKey[]): InterestIssueField {
  if (path.length === 0) return 'none';
  const [head, second] = path;
  if (head === 'consents' && typeof second === 'string') return `consent-${second}` as InterestIssueField;
  if (head === 'email' || head === 'whatsapp' || head === 'size') return head;
  return 'other';
}

function serverFields(b: unknown): Set<InterestIssueField> {
  const r = InterestBody.safeParse(forServer(b));
  return new Set(r.success ? [] : r.error.issues.map((i) => serverField(i.path)));
}

const clientFields = (b: unknown): Set<InterestIssueField> =>
  new Set(validateInterest(b).map((i) => i.field));

/** Checks both directions of the contract for one body. */
function expectParity(b: unknown): void {
  const issues = validateInterest(b);
  expect(issues.length === 0, JSON.stringify(b)).toBe(serverAccepts(b));
  // Every field the server flags is also flagged by the client. The server skips the cross-field
  // rules after a type error, and reports "none" when a contact value was given but was invalid,
  // so those are the only places where the client may flag more or fewer fields.
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return; // no field to compare
  const body = b as Body;
  const contactGiven = body.email !== undefined || body.whatsapp !== undefined || body.size !== undefined;
  const client = clientFields(b);
  for (const f of serverFields(b)) {
    if (f === 'none' && contactGiven) continue;
    expect(client.has(f), `${f} in ${JSON.stringify(b)}`).toBe(true);
  }
}

const RE_UUID_BAD = ['', 'not-a-uuid', '3f2b8c1e-9a4d-1b7e-8f21-6c0d5e4a9b13', '3F2B8C1E-9A4D-4B7E-8F21-6C0D5E4A9B13'];

/** A valid body with one change applied. */
function variant(base: Body, change: (b: Body) => void): Body {
  const copy = structuredClone(base);
  change(copy);
  return copy;
}

const consentsOf = (b: Body) => b.consents as Record<string, unknown>;

describe('interest-validate parity with InterestBody', () => {
  it('accepts every generated valid body, as the server does', () => {
    fc.assert(
      fc.property(interestPayload(), (b) => {
        expect(serverAccepts(b)).toBe(true);
        expect(validateInterest(b)).toEqual([]);
      }),
      { numRuns: 200 },
    );
  }, 30_000);

  it('matches the server on hand-made invalid variants of valid bodies', () => {
    const changes: Array<[string, (b: Body) => void]> = [
      ['bad email', (b) => { b.email = 'not-an-email'; }],
      ['email with ..', (b) => { b.email = 'a..b@example.com'; }],
      ['email with .@', (b) => { b.email = 'a.@example.com'; }],
      ['email too long', (b) => { b.email = `${'a'.repeat(60)}@${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.com`; }],
      ['email upper case with spaces', (b) => { b.email = '  Name@Example.COM '; }],
      ['phone without +91', (b) => { b.whatsapp = '9876543210'; }],
      ['phone starting with 5', (b) => { b.whatsapp = '+915876543210'; }],
      ['phone with 9 digits', (b) => { b.whatsapp = '+91987654321'; }],
      ['phone with 11 digits', (b) => { b.whatsapp = '+9198765432101'; }],
      ['phone with spaces and hyphens', (b) => { b.whatsapp = '+91 98765-43210'; }],
      ['phone with tab', (b) => { b.whatsapp = '+91\t9876543210'; }],
      ['unknown size', (b) => { b.size = 'xxxl'; }],
      ['size of wrong type', (b) => { b.size = 3; }],
      ['no email consent', (b) => { consentsOf(b).email = false; }],
      ['no whatsapp consent', (b) => { consentsOf(b).whatsapp = false; }],
      ['no 18+', (b) => { consentsOf(b).adult = false; }],
      ['consent of wrong type', (b) => { consentsOf(b).adult = 'yes'; }],
      ['consents missing', (b) => { delete b.consents; }],
      ['consents empty', (b) => { b.consents = {}; }],
      ['empty contact set', (b) => { delete b.email; delete b.whatsapp; delete b.size; }],
      ['bad uuid', (b) => { b.anonId = 'not-a-uuid'; }],
      ['uuid v1', (b) => { b.anonId = '3f2b8c1e-9a4d-1b7e-8f21-6c0d5e4a9b13'; }],
      ['missing anonId', (b) => { delete b.anonId; }],
      ['bad notice version', (b) => { b.noticeVersion = 'has space'; }],
      ['empty notice version', (b) => { b.noticeVersion = ''; }],
      ['long notice version', (b) => { b.noticeVersion = 'v'.repeat(65); }],
      ['missing notice version', (b) => { delete b.noticeVersion; }],
      ['bad utm value', (b) => { b.utm = { source: 'Insta Gram!' }; }],
      ['utm of wrong type', (b) => { b.utm = 'x'; }],
    ];
    fc.assert(
      fc.property(interestPayload(), fc.constantFrom(...changes), (base, [, change]) => {
        expectParity(variant(base, change));
      }),
      { numRuns: 400 },
    );
  }, 30_000);

  it('flags the expected field for each named defect', () => {
    const base: Body = {
      anonId: '3f2b8c1e-9a4d-4b7e-8f21-6c0d5e4a9b13',
      email: 'a@b.in',
      whatsapp: '+919876543210',
      size: 'm',
      consents: { email: true, whatsapp: true, link: false, adult: true },
      noticeVersion: TEST_NOTICE_VERSION,
    };
    const cases: Array<[InterestIssueField, (b: Body) => void]> = [
      ['email', (b) => { b.email = 'nope'; }],
      ['whatsapp', (b) => { b.whatsapp = '+915876543210'; }],
      ['size', (b) => { b.size = 'huge'; }],
      ['consent-email', (b) => { consentsOf(b).email = false; }],
      ['consent-whatsapp', (b) => { consentsOf(b).whatsapp = false; }],
      ['consent-adult', (b) => { consentsOf(b).adult = false; }],
      ['none', (b) => { delete b.email; delete b.whatsapp; delete b.size; }],
      ['other', (b) => { b.anonId = 'x'; }],
      ['other', (b) => { b.noticeVersion = '!'; }],
    ];
    expect(validateInterest(base)).toEqual([]);
    expect(serverAccepts(base)).toBe(true);
    for (const [field, change] of cases) {
      const b = variant(base, change);
      expect(clientFields(b).has(field), field).toBe(true);
      expect(serverFields(b).has(field), field).toBe(true);
      expect(validateInterest(b).length === 0).toBe(serverAccepts(b));
    }
  });

  it('treats a size-only body, with or without consents, like the server', () => {
    for (const size of SIZES) {
      expectParity({ anonId: '3f2b8c1e-9a4d-4b7e-8f21-6c0d5e4a9b13', size, consents: {}, noticeVersion: 'v1' });
    }
    expect(
      validateInterest({ anonId: '3f2b8c1e-9a4d-4b7e-8f21-6c0d5e4a9b13', size: 'm', consents: {}, noticeVersion: 'v1' }),
    ).toEqual([]);
  });

  it('matches the server on non-object bodies', () => {
    for (const b of [null, undefined, 'x', 3, true, [], [{}]]) expectParity(b);
  });

  it('matches the server on generated bodies with arbitrary field values', () => {
    const text = fc.oneof(
      fc.string({ maxLength: 40 }),
      fc.constantFrom(
        '', ' ', 'a@b.in', ' A@B.IN ', 'a..b@c.in', 'a.@c.in', 'x@y', 'x@y.z', 'ab@c-.in',
        '+919876543210', '+91 98765 43210', '+91-98765-43210', '9876543210', '+915876543210', '+91987654321',
        'm', 'xl', 'prefer_not', 'M', 'huge',
      ),
    );
    const flag = fc.oneof(fc.boolean(), fc.boolean(), fc.constantFrom<unknown>('true', 1, null));
    const maybe = <T>(a: fc.Arbitrary<T>): fc.Arbitrary<T | undefined> => fc.oneof(a, a, fc.constant(undefined));
    const consents = fc.oneof(
      fc.record({ email: maybe(flag), whatsapp: maybe(flag), link: maybe(flag), adult: maybe(flag) }),
      fc.constantFrom<unknown>({}, null, 'x', []),
    );
    const body = fc.record({
      anonId: fc.oneof(anonId(), fc.constantFrom<unknown>(...RE_UUID_BAD), fc.constant(undefined)),
      email: maybe(text),
      whatsapp: maybe(text),
      size: maybe(fc.oneof(fc.constantFrom<unknown>(...SIZES), text)),
      consents,
      noticeVersion: fc.oneof(
        fc.constant(TEST_NOTICE_VERSION),
        fc.constantFrom<unknown>('', 'v 1', 'v1'),
        fc.constant(undefined),
      ),
    });
    fc.assert(
      fc.property(body, (b) => {
        // `undefined` values are the same as a missing key for the server and the client.
        const clean = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
        expectParity(clean);
      }),
      { numRuns: 1500 },
    );
  }, 30_000);
});
